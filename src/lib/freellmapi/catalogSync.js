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
  try {
    globalThis.__nineRouterFreeLlmApi = {
      baseUrl: runtimeState.baseUrl,
      catalog: runtimeState.catalog,
      lastSyncedAt: runtimeState.lastSyncedAt,
      source: runtimeState.source,
    };
  } catch {}
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

export async function syncFreeLlmApiCatalog(options = {}) {
  const baseUrl = normalizeBaseUrl(options.baseUrl || runtimeState.baseUrl);
  runtimeState.baseUrl = baseUrl;
  const url = `${baseUrl}/v1/models`;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(options.timeoutMs || 10000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();
    const catalog = toCatalogFromModels(payload);
    // Merge: keep known static platforms not present in live response, overlay live ones
    runtimeState.catalog = { ...STATIC_CATALOG, ...catalog };
    runtimeState.lastSyncedAt = new Date().toISOString();
    runtimeState.lastError = null;
    runtimeState.source = "live";
    publishRuntime();
    return { ok: true, state: getFreeLlmApiSyncState() };
  } catch (error) {
    runtimeState.lastError = error?.message || String(error);
    // keep existing/static catalog on failure
    if (!runtimeState.catalog) runtimeState.catalog = STATIC_CATALOG;
    publishRuntime();
    return { ok: false, error: runtimeState.lastError, state: getFreeLlmApiSyncState() };
  }
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
