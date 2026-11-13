import { getProviderConnections } from "@/lib/db/repos/connectionsRepo.js";
import { disableModels, enableModels, getDisabledByProvider } from "@/lib/db/repos/disabledModelsRepo.js";
import { getProviderModels, PROVIDER_ID_TO_ALIAS } from "open-sse/config/providerModels.js";
import { getFreeLlmApiCatalog, getFreeLlmApiBaseUrl } from "@/lib/freellmapi/catalogSync.js";
import { UPDATER_CONFIG } from "@/shared/constants/config.js";
import { pingModelByKind } from "@/app/api/models/test/ping.js";

function uniq(arr) { return [...new Set((arr || []).filter(Boolean))]; }

function connectionUsable(c) {
  if (!c) return false;
  if (c.isActive === false) return false;
  const st = c.testStatus || "unknown";
  if (["disabled", "error", "expired", "banned"].includes(st)) return false;
  if (c.rateLimitedUntil && new Date(c.rateLimitedUntil).getTime() > Date.now()) return false;
  return true;
}

function resolveAlias(providerId) {
  return PROVIDER_ID_TO_ALIAS[providerId] || providerId;
}

function modelsForProvider(providerId) {
  const alias = resolveAlias(providerId);
  let models = [];
  try { models = getProviderModels(alias) || []; } catch { models = []; }
  // Supplement freellmapi providers from catalog
  if ((!models || models.length === 0) && String(providerId).startsWith("freellmapi-")) {
    const platform = providerId.replace(/^freellmapi-/, "");
    const cat = getFreeLlmApiCatalog() || {};
    const catModels = cat[platform] || cat[providerId] || [];
    models = catModels.map((m) => ({ id: m.id, name: m.name || m.id, kind: m.kind || "llm" }));
  } else if ((!models || models.length === 0)) {
    const cat = getFreeLlmApiCatalog() || {};
    const catModels = cat[providerId] || [];
    if (catModels.length) models = catModels.map((m) => ({ id: m.id, name: m.name || m.id, kind: m.kind || "llm" }));
  }
  // normalize
  return (models || []).map((m) => (typeof m === "string" ? { id: m, name: m, kind: "llm" } : { id: m.id || m.name, name: m.name || m.id, kind: m.kind || m.type || "llm" })).filter((m) => m.id);
}

function isDefinitiveUnusable(result) {
  if (!result) return false;
  if (result.ok) return false;
  const msg = String(result.error || "").toLowerCase();
  const status = Number(result.status || 0);
  // definitive: model not found/unsupported/not available; not transient rate limits/timeouts/auth flaps
  if (status === 404) return true;
  if (status === 400 && /(model|not found|unknown|unsupported|does not exist|invalid model|no such model|not available)/.test(msg)) return true;
  if (/(model.*not found|unknown model|unsupported model|model does not exist|no such model|not available for this|is not supported|invalid model)/.test(msg)) return true;
  return false;
}

export async function recheckProviderModels(options = {}) {
  const providerFilter = options.provider ? String(options.provider) : null;
  const maxModelsPerProvider = Math.max(1, Math.min(200, Number(options.maxModelsPerProvider || 30)));
  const maxProviders = Math.max(1, Math.min(200, Number(options.maxProviders || 50)));
  const dryRun = options.dryRun === true;
  const autoEnable = options.autoEnable === true; // off by default to be conservative
  const baseUrl = `http://127.0.0.1:${process.env.PORT || UPDATER_CONFIG.appPort}`;

  const connections = await getProviderConnections();
  const usable = (connections || []).filter(connectionUsable);
  const providerIds = uniq(usable.map((c) => c.provider)).filter((p) => (providerFilter ? p === providerFilter : true)).slice(0, maxProviders);

  const report = { checkedProviders: 0, checkedModels: 0, disabled: [], enabled: [], skipped: [], errors: [] };

  for (const providerId of providerIds) {
    const alias = resolveAlias(providerId);
    const allModels = modelsForProvider(providerId);
    if (allModels.length === 0) { report.skipped.push({ provider: providerId, alias, reason: "no models" }); continue; }
    report.checkedProviders++;

    const disabledNow = new Set(await getDisabledByProvider(alias));
    const toTest = allModels.slice(0, maxModelsPerProvider);
    const newlyDisabled = [];
    const newlyEnabled = [];

    for (const m of toTest) {
      try {
        // If already disabled and we don't auto-enable, skip ping to save tokens
        if (disabledNow.has(m.id) && !autoEnable) { continue; }
        const result = await pingModelByKind(`${alias}/${m.id}`, m.kind || "llm", baseUrl);
        report.checkedModels++;
        if (isDefinitiveUnusable(result)) {
          if (!disabledNow.has(m.id)) {
            newlyDisabled.push(m.id);
            disabledNow.add(m.id);
          }
        } else if (result?.ok === true && autoEnable && disabledNow.has(m.id)) {
          newlyEnabled.push(m.id);
          disabledNow.delete(m.id);
        }
      } catch (e) {
        report.errors.push({ provider: providerId, model: m.id, error: e?.message || String(e) });
      }
    }

    if (!dryRun) {
      if (newlyDisabled.length) await disableModels(alias, newlyDisabled);
      if (newlyEnabled.length) await enableModels(alias, newlyEnabled);
    }

    if (newlyDisabled.length) report.disabled.push({ provider: providerId, alias, ids: newlyDisabled });
    if (newlyEnabled.length) report.enabled.push({ provider: providerId, alias, ids: newlyEnabled });
  }

  report.freellmapiBaseUrl = getFreeLlmApiBaseUrl?.() || null;
  report.dryRun = dryRun;
  return report;
}
