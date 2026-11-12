import { getCombos, createCombo, updateCombo } from "@/lib/db/repos/combosRepo.js";
import { getProviderConnections } from "@/lib/db/repos/connectionsRepo.js";
import { getFreeLlmApiCatalog, getFreeLlmApiBaseUrl } from "@/lib/freellmapi/catalogSync.js";

function unique(arr) { return [...new Set((arr || []).filter(Boolean))]; }

function connectionIsHealthy(c) {
  if (!c) return false;
  if (c.isActive === false) return false;
  const st = c.testStatus || "unknown";
  if (st === "disabled" || st === "error" || st === "expired" || st === "banned") return false;
  if (c.rateLimitedUntil && new Date(c.rateLimitedUntil).getTime() > Date.now()) return false;
  return true;
}

function providerModelRef(provider, modelId) {
  const p = String(provider || "").trim();
  const m = String(modelId || "").trim();
  if (!p || !m) return null;
  if (m.includes("/")) return m; // already qualified
  return `${p}/${m}`;
}

export async function generateAutoCombos(options = {}) {
  const limitPerCombo = Math.max(1, Math.min(10, Number(options.limitPerCombo || 4)));
  const maxCombos = Math.max(1, Math.min(50, Number(options.maxCombos || 10)));
  const prefix = String(options.prefix || "auto");
  const onlyProviders = Array.isArray(options.providers) ? new Set(options.providers) : null;
  const kindFilter = options.kind || "llm";

  const [conns, existingCombos] = await Promise.all([getProviderConnections(), getCombos()]);
  const existingNames = new Set((existingCombos || []).map((c) => c.name));
  const healthy = (conns || []).filter(connectionIsHealthy).filter((c) => (onlyProviders ? onlyProviders.has(c.provider) : true));

  // group healthy providers
  const byProvider = new Map();
  for (const c of healthy) {
    if (!byProvider.has(c.provider)) byProvider.set(c.provider, []);
    byProvider.get(c.provider).push(c);
  }

  const catalog = getFreeLlmApiCatalog() || {};
  const candidates = [];

  for (const [provider, list] of byProvider.entries()) {
    // prefer freellmapi catalog models when provider is freellmapi-*
    let models = [];
    if (provider.startsWith("freellmapi-")) {
      const platform = provider.replace(/^freellmapi-/, "");
      const catModels = catalog[platform] || catalog[provider] || [];
      models = catModels.filter((m) => (m.kind || "llm") === kindFilter).map((m) => providerModelRef(provider, m.id));
    } else if (catalog[provider]) {
      models = (catalog[provider] || []).filter((m) => (m.kind || "llm") === kindFilter).map((m) => providerModelRef(provider, m.id));
    } else {
      // fallback: generic auto model ref if we know provider is healthy
      models = [providerModelRef(provider, "auto"), providerModelRef(provider, "default")].filter(Boolean);
    }
    for (const m of unique(models).slice(0, 20)) {
      candidates.push({ model: m, provider, score: (list[0]?.testStatus === "active" ? 2 : 1) });
    }
  }

  // dedupe by model string, prefer higher score
  const bestByModel = new Map();
  for (const c of candidates) {
    if (!bestByModel.has(c.model) || c.score > bestByModel.get(c.model).score) bestByModel.set(c.model, c);
  }
  const pool = [...bestByModel.values()].sort((a, b) => b.score - a.score || a.model.localeCompare(b.model)).map((x) => x.model);

  const created = [];
  const planned = [];
  for (let i = 0; i < maxCombos && pool.length >= 1; i++) {
    const slice = pool.splice(0, limitPerCombo);
    if (slice.length === 0) break;
    const name = `${prefix}-${kindFilter}-${i + 1}`;
    const item = { name, models: slice };
    planned.push(item);
    if (options.dryRun) continue;
    if (existingNames.has(name)) {
      // update existing auto combo
      const existing = (existingCombos || []).find((c) => c.name === name);
      if (existing && options.overwrite) {
        const updated = await updateCombo(existing.id, { models: slice });
        created.push({ ...item, id: existing?.id, action: "updated" });
      } else {
        created.push({ ...item, id: existing?.id, action: "skipped" });
      }
    } else {
      const combo = await createCombo({ name, models: slice, kind: kindFilter });
      created.push({ ...item, id: combo?.id, action: "created" });
      existingNames.add(name);
    }
  }

  return {
    ok: true,
    healthyProviders: byProvider.size,
    candidateModels: bestByModel.size,
    planned,
    results: created,
    baseUrl: getFreeLlmApiBaseUrl(),
  };
}

async function probeModelRef(modelRef) {
  // Token-frugal verification: for freellmapi refs, check catalog/model list reachability via /v1/models (no completion tokens)
  const base = getFreeLlmApiBaseUrl();
  if (String(modelRef).startsWith("freellmapi-")) {
    try {
      const res = await fetch(`${base}/v1/models`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
      if (!res.ok) return { ok: false, error: `http ${res.status}` };
      return { ok: true, note: "upstream models endpoint reachable" };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }
  // For other providers, rely on connection health (no token spend here)
  return { ok: null, note: "deferred to connection health (no token probe)" };
}

export async function verifyCombo(combo, options = {}) {
  const models = Array.isArray(combo?.models) ? combo.models : [];
  const checks = [];
  for (const m of models) {
    checks.push({ model: m, ...(await probeModelRef(m)) });
  }
  const ok = checks.every((c) => c.ok !== false);
  return { ok, checks, comboId: combo?.id, name: combo?.name };
}

export async function verifyAllCombos(options = {}) {
  const combos = await getCombos();
  const results = [];
  for (const c of combos || []) {
    if (options.namePrefix && !String(c.name || "").startsWith(options.namePrefix)) continue;
    results.push(await verifyCombo(c, options));
  }
  return { ok: results.every((r) => r.ok), count: results.length, results };
}
