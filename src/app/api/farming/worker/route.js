import { NextResponse } from "next/server";
import { getProviderConnections, updateProviderConnection } from "@/lib/db/index.js";
import { rotateConnections } from "@/lib/farming/accountManager.js";
import { syncFreeLlmApiCatalog, getFreeLlmApiSyncState } from "@/lib/freellmapi/catalogSync.js";
import { recheckProviderModels } from "@/lib/models/modelRechecker.js";
import { generateAutoCombos } from "@/lib/combos/autoCombo.js";

export const dynamic = "force-dynamic";

const g = globalThis.__nineRouterAccountFarming = globalThis.__nineRouterAccountFarming || {
  status: "idle", // idle | running | stopping
  lastRunAt: null,
  lastResult: null,
  logs: [],
  timer: null,
  loopMinutes: 0,
};

function log(msg, type = "info") {
  const entry = { ts: new Date().toISOString(), msg, type };
  g.logs.unshift(entry);
  if (g.logs.length > 200) g.logs.length = 200;
}

async function probeConnection(conn) {
  // Token-frugal probe: prefer metadata/models endpoints; fallback minimal chat not implemented here to avoid token spend.
  const provider = conn.provider || "";
  const key = conn.apiKey || conn.accessToken;
  if (!key) return { ok: false, status: "error", error: "missing credential" };

  // freellmapi-backed providers: validate via upstream /v1/models (no token consumption)
  if (provider.startsWith("freellmapi")) {
    try {
      const state = getFreeLlmApiSyncState();
      const base = state.baseUrl || "http://localhost:3001";
      const res = await fetch(`${base}/v1/models`, {
        headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      });
      if (res.status === 401 || res.status === 403) return { ok: false, status: "error", error: `auth ${res.status}` };
      if (!res.ok) return { ok: false, status: "error", error: `http ${res.status}` };
      return { ok: true, status: "active" };
    } catch (e) {
      return { ok: false, status: "error", error: e.message };
    }
  }

  // Generic safe probes by provider (no completion tokens)
  const probes = {
    openrouter: "https://openrouter.ai/api/v1/models",
    groq: "https://api.groq.com/openai/v1/models",
    mistral: "https://api.mistral.ai/v1/models",
    together: "https://api.together.xyz/v1/models",
    nvidia: "https://integrate.api.nvidia.com/v1/models",
    google: "https://generativelanguage.googleapis.com/v1beta/models",
  };
  const url = probes[provider];
  if (url) {
    try {
      const headers = { Accept: "application/json" };
      if (provider === "google") headers["x-goog-api-key"] = key;
      else headers["Authorization"] = `Bearer ${key}`;
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
      if (res.status === 401 || res.status === 403) return { ok: false, status: "error", error: `auth ${res.status}` };
      if (res.status === 429) return { ok: false, status: "cooldown", error: "rate limited", rateLimitedUntil: new Date(Date.now() + 60000).toISOString() };
      if (!res.ok) return { ok: false, status: "error", error: `http ${res.status}` };
      return { ok: true, status: "active" };
    } catch (e) {
      return { ok: false, status: "error", error: e.message };
    }
  }

  // Unknown provider: don't spend tokens; keep as-is but mark checked
  return { ok: null, status: conn.testStatus || "unknown", note: "no token-frugal probe; skipped" };
}

async function runCycle(options = {}) {
  if (g.status === "running") return g.lastResult;
  g.status = "running";
  g.lastRunAt = new Date().toISOString();
  log("Account farming cycle started");
  const summary = { checked: 0, active: 0, failed: 0, skipped: 0, rotated: 0, synced: false, modelRecheck: null, combos: null };
  try {
    if (options.syncCatalog !== false) {
      const sync = await syncFreeLlmApiCatalog();
      summary.synced = !!sync.ok;
      log(sync.ok ? "freellmapi catalog synced" : `catalog sync warning: ${sync.error || sync.warning || "fallback"}`, sync.ok ? "info" : "warn");
    }
    const conns = await getProviderConnections();
    for (const conn of conns || []) {
      if (g.status === "stopping") break;
      if (conn.isActive === false || conn.testStatus === "disabled") continue;
      // only probe connections that look like they have credentials
      if (!(conn.apiKey || conn.accessToken)) { summary.skipped++; continue; }
      const res = await probeConnection(conn);
      summary.checked++;
      const patch = { lastTested: new Date().toISOString() };
      if (res.ok === true) {
        patch.testStatus = "active";
        patch.lastError = null;
        summary.active++;
      } else if (res.ok === false) {
        patch.testStatus = res.status || "error";
        patch.lastError = res.error || "probe failed";
        if (res.rateLimitedUntil) patch.rateLimitedUntil = res.rateLimitedUntil;
        summary.failed++;
      } else {
        summary.skipped++;
      }
      try { await updateProviderConnection(conn.id, patch); } catch {}
    }
    // Model-level recheck: auto-disable models definitively unusable (token-frugal limits)
    if (options.recheckModels) {
      try {
        const mr = await recheckProviderModels({
          maxModelsPerProvider: options.maxModelsPerProvider || 20,
          maxProviders: options.maxProviders || 30,
          dryRun: !!options.dryRunModels,
          autoEnable: !!options.autoEnableModels,
        });
        summary.modelRecheck = { checkedModels: mr.checkedModels, disabled: mr.disabled?.length || 0, enabled: mr.enabled?.length || 0 };
        log(`Model recheck: checked ${mr.checkedModels}, disabled groups ${mr.disabled?.length || 0}`);
      } catch (e) {
        summary.modelRecheck = { error: e.message };
        log(`Model recheck error: ${e.message}`, "warn");
      }
    }
    if (options.rotate !== false) {
      const rot = await rotateConnections({ strategy: options.rotateStrategy || "disable-failed" });
      summary.rotated = rot.rotated || 0;
    }
    // Optional: regenerate auto combos from healthy providers/models
    if (options.generateCombos) {
      try {
        const cg = await generateAutoCombos({ maxCombos: options.maxCombos || 5, limitPerCombo: options.limitPerCombo || 4, overwrite: !!options.overwriteCombos });
        summary.combos = { planned: cg.planned?.length || 0, results: cg.results?.length || 0 };
        log(`Auto combos generated: ${cg.results?.length || 0}`);
      } catch (e) {
        summary.combos = { error: e.message };
      }
    }
  } catch (e) {
    log(`Cycle error: ${e.message}`, "error");
    summary.error = e.message;
  } finally {
    g.lastResult = summary;
    g.status = "idle";
    log(`Cycle finished: ${JSON.stringify(summary)}`);
  }
  return summary;
}

function scheduleLoop(minutes) {
  if (g.timer) { clearInterval(g.timer); g.timer = null; }
  g.loopMinutes = minutes || 0;
  if (minutes > 0) {
    g.timer = setInterval(() => runCycle({ syncCatalog: true, rotate: true }), minutes * 60 * 1000);
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    status: g.status,
    lastRunAt: g.lastRunAt,
    lastResult: g.lastResult,
    loopMinutes: g.loopMinutes,
    logs: g.logs.slice(0, 50),
  });
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const action = body.action || "run";
    if (action === "start") {
      scheduleLoop(Number(body.loopMinutes || 5));
      runCycle({ syncCatalog: true, rotate: true });
      return NextResponse.json({ ok: true, status: "started", loopMinutes: g.loopMinutes });
    }
    if (action === "stop") {
      if (g.status === "running") g.status = "stopping";
      scheduleLoop(0);
      return NextResponse.json({ ok: true, status: "stopped" });
    }
    if (action === "run") {
      const result = await runCycle(body);
      return NextResponse.json({ ok: true, result });
    }
    if (action === "recheck-models") {
      const result = await recheckProviderModels(body || {});
      return NextResponse.json({ ok: true, result });
    }
    if (action === "sync-catalog") {
      const result = await syncFreeLlmApiCatalog(body);
      return NextResponse.json(result);
    }
    return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
