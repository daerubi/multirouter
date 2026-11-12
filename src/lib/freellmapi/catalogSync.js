import { FREE_LLM_API_CATALOG as STATIC_CATALOG } from "../../../open-sse/providers/registry/freellmapi-catalog.js";

const DEFAULT_BASE_URL = "http://localhost:3001";

let runtimeState = {
  baseUrl: DEFAULT_BASE_URL,
  catalog: STATIC_CATALOG,
  platforms: null,
  lastSyncedAt: null,
  lastError: null,
  source: "static",
};

function publishRuntime() {
  const state = {
    baseUrl: runtimeState.baseUrl,
    catalog: runtimeState.catalog,
    lastSyncedAt: runtimeState.lastSyncedAt,
    source: runtimeState.source,
  };
  try { globalThis.__nineRouterFreeLlmApi = state; } catch {}
  try { globalThis.__multirouterFreeLlmApi = state; } catch {}
}

function normalizeBaseUrl(url) {
  const raw = String(url || DEFAULT_BASE_URL).trim();
  if (!raw) return DEFAULT_BASE_URL;
  return raw.replace(/\/+$/, "");
}

function inferKind(id) {
  const lower = String(id || "").toLowerCase();
  if (/(^|[/:_-])(tts|text-to-speech)([/:_-]|$)/.test(lower)) return "tts";
  if (/(^|[/:_-])(stt|whisper|transcri|asr)([/:_-]|$)/.test(lower)) return "stt";
  if (/(^|[/:_-])(embed|embedding)([/:_-]|$)/.test(lower)) return "embedding";
  if (/(^|[/:_-])(image|img|flux|dall|stable-diffusion|sdxl)([/:_-]|$)/.test(lower)) return "image";
  if (/(^|[/:_-])(video|sora|veo|runway)([/:_-]|$)/.test(lower)) return "video";
  return "llm";
}

function toCatalogFromModels(modelsPayload) {
  const data = Array.isArray(modelsPayload?.data) ? modelsPayload.data : Array.isArray(modelsPayload) ? modelsPayload : [];
  const catalog = {};
  for (const item of data) {
    const id = typeof item === "string" ? item : item?.id;
    if (!id || typeof id !== "string") continue;
    // freellmapi may return ids as "platform/model" or plain; group by prefix when possible
    let platform = "unified";
    let modelId = id;
    const idx = id.indexOf("/");
    if (idx > 0) {
      platform = id.slice(0, idx);
      modelId = id.slice(idx + 1) || id;
    }
    if (!catalog[platform]) catalog[platform] = [];
    const name = (typeof item === "object" && item?.name) || modelId;
    const kind = (typeof item === "object" && item?.kind) || inferKind(modelId);
    if (!catalog[platform].some((m) => m.id === modelId)) {
      catalog[platform].push({ id: modelId, name, kind });
    }
  }
  return catalog;
}

export function getFreeLlmApiBaseUrl() {
  return runtimeState.baseUrl || DEFAULT_BASE_URL;
}

export function setFreeLlmApiBaseUrl(url) {
  runtimeState.baseUrl = normalizeBaseUrl(url);
  publishRuntime();
  return runtimeState.baseUrl;
}

export function getFreeLlmApiCatalog() {
  return runtimeState.catalog || STATIC_CATALOG;
}

export function getFreeLlmApiSyncState() {
  return {
    baseUrl: getFreeLlmApiBaseUrl(),
    lastSyncedAt: runtimeState.lastSyncedAt,
    lastError: runtimeState.lastError,
    source: runtimeState.source,
    platformCount: Object.keys(getFreeLlmApiCatalog() || {}).length,
  };
}

function mergeCatalog(base, overlay) {
  const out = { ...(base || {}) };
  for (const [k, v] of Object.entries(overlay || {})) {
    if (!Array.isArray(v)) continue;
    out[k] = v;
  }
  return out;
}

function catalogFromLatestPayload(payload) {
  // Support freellmapi public/latest formats: {catalog:{platform:[models]}}, {platforms:{...}}, or direct map
  if (!payload || typeof payload !== "object") return null;
  const c = payload.catalog || payload.platforms || payload.modelsByPlatform || payload;
  if (!c || typeof c !== "object" || Array.isArray(c)) return null;
  // if looks like OpenAI models list, use toCatalogFromModels
  if (Array.isArray(payload.data)) return toCatalogFromModels(payload);
  const out = {};
  for (const [platform, models] of Object.entries(c)) {
    if (!Array.isArray(models)) continue;
    out[platform] = models.map((m) => {
      if (typeof m === "string") return { id: m, name: m, kind: inferKind(m) };
      const id = m.id || m.model || m.name;
      if (!id) return null;
      return { id, name: m.name || id, kind: m.kind || m.modality || inferKind(id) };
    }).filter(Boolean);
  }
  return Object.keys(out).length ? out : null;
}

export async function syncFreeLlmApiCatalog(options = {}) {
  const baseUrl = normalizeBaseUrl(options.baseUrl || runtimeState.baseUrl);
  runtimeState.baseUrl = baseUrl;

  const attempts = [
    { type: "models", url: `${baseUrl}/v1/models` },
    { type: "public", url: "https://api.freellmapi.co/v1/latest" },
  ];

  let lastErr = null;
  for (const attempt of attempts) {
    try {
      const res = await fetch(attempt.url, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(options.timeoutMs || 10000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = await res.json();
      const catalog = attempt.type === "models"
        ? toCatalogFromModels(payload)
        : (catalogFromLatestPayload(payload) || toCatalogFromModels(payload));
      if (!catalog || Object.keys(catalog).length === 0) throw new Error("empty catalog");
      runtimeState.catalog = mergeCatalog(STATIC_CATALOG, catalog);
      runtimeState.lastSyncedAt = new Date().toISOString();
      runtimeState.lastError = null;
      runtimeState.source = attempt.type === "models" ? "live" : "public";
      publishRuntime();
      return { ok: true, state: getFreeLlmApiSyncState(), sourceUrl: attempt.url };
    } catch (error) {
      lastErr = error;
    }
  }

  // Fallback: keep bundled static catalog so providers/models remain available
  runtimeState.lastError = lastErr?.message || String(lastErr || "sync failed");
  if (!runtimeState.catalog || Object.keys(runtimeState.catalog).length === 0) {
    runtimeState.catalog = STATIC_CATALOG;
  }
  runtimeState.source = runtimeState.source === "live" || runtimeState.source === "public" ? runtimeState.source : "static";
  publishRuntime();
  return {
    ok: true,
    warning: runtimeState.lastError,
    state: getFreeLlmApiSyncState(),
    message: "Menggunakan katalog statis (upstream tidak dapat dijangkau/format berbeda). Provider & model tetap terdaftar.",
  };
}

// initialize global state
publishRuntime();

// Initialize from settings if available (best-effort, lazy)
export async function initFreeLlmApiFromSettings() {
  try {
    const mod = await import("../db/repos/settingsRepo.js");
    if (mod?.getSettings) {
      const settings = await mod.getSettings();
      if (settings?.freellmapiBaseUrl) setFreeLlmApiBaseUrl(settings.freellmapiBaseUrl);
    }
  } catch {
    // ignore in environments without DB/settings
  }
  return runtimeState.baseUrl;
}
