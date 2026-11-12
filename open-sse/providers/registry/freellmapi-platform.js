import { FREE_LLM_API_CATALOG as STATIC_CATALOG } from "./freellmapi-catalog.js";

function readRuntime() {
  const g = globalThis.__nineRouterFreeLlmApi || globalThis.__multirouterFreeLlmApi || null;
  if (g && typeof g === "object") return g;
  return null;
}

export const FREE_LLM_API_PLATFORM_NAMES = {
  agnes: "Agnes AI",
  aihorde: "AI Horde",
  aion: "Aion Labs",
  bazaarlink: "BazaarLink",
  cloudflare: "Cloudflare Workers AI",
  cohere: "Cohere",
  google: "Google AI Studio",
  groq: "Groq",
  kilo: "Kilo Gateway",
  llm7: "LLM7",
  mistral: "Mistral",
  modelscope: "ModelScope",
  nara: "NaraRouter",
  nvidia: "NVIDIA NIM",
  openrouter: "OpenRouter",
  ovh: "OVH AI Endpoints",
  pinecone: "Pinecone",
  radeon: "AMD Radeon Cloud",
  requesty: "Requesty",
  routeway: "Routeway",
  sealion: "SEA-LION",
  unorouter: "UnoRouter",
  xkiro: "xKiro",
  zhipu: "Zhipu AI",
  electronhub: "ElectronHub",
  router9: "Router9",
  septor: "Septor Labs",
  clod: "CLōD",
  speechify: "Speechify",
  blaze: "BlazeAPI",
  airforce: "Api.Airforce",
  dreamprompting: "DreamPrompting",
  waterfall: "Logfare/Waterfall",
  logfare: "Logfare",
  aclide: "ACLIDE",
  moondream: "Moondream",
  speka: "Speka",
  llmtr: "LLMTR",
  gizmo: "Gizmo",
  blockrun: "BlockRun",
  typhoon: "Typhoon",
  tavily: "Tavily",
  exa: "Exa",
  firecrawl: "Firecrawl",
  linkup: "Linkup",
};

// Platforms known to be keyless/anonymous in freellmapi upstream catalog semantics
const KEYLESS_PLATFORMS = new Set(["aihorde", "kilo", "ovh"]);

// Platforms that may require compound/special credentials (metadata hint)
const COMPOUND_AUTH_HINT = {
  cloudflare: "Biasanya butuh format account_id:token (selaras freellmapi).",
};

const PLATFORM_ICONS = {
  agnes: { icon: "auto_awesome", color: "#8B5CF6" },
  aihorde: { icon: "groups", color: "#10B981" },
  aion: { icon: "hub", color: "#6366F1" },
  bazaarlink: { icon: "storefront", color: "#F59E0B" },
  cloudflare: { icon: "cloud", color: "#F38020" },
  cohere: { icon: "bubble_chart", color: "#39594D" },
  google: { icon: "travel_explore", color: "#4285F4" },
  groq: { icon: "bolt", color: "#F55036" },
  kilo: { icon: "token", color: "#14B8A6" },
  llm7: { icon: "filter_7", color: "#3B82F6" },
  mistral: { icon: "air", color: "#FF7000" },
  modelscope: { icon: "model_training", color: "#624AFF" },
  nara: { icon: "router", color: "#0EA5E9" },
  nvidia: { icon: "memory", color: "#76B900" },
  openrouter: { icon: "alt_route", color: "#6366F1" },
  ovh: { icon: "dns", color: "#123F6D" },
  pinecone: { icon: "park", color: "#00A67E" },
  radeon: { icon: "developer_board", color: "#ED1C24" },
  requesty: { icon: "send", color: "#EC4899" },
  routeway: { icon: "fork_right", color: "#22C55E" },
  sealion: { icon: "sailing", color: "#0EA5E9" },
  unorouter: { icon: "device_hub", color: "#A855F7" },
  xkiro: { icon: "flash_on", color: "#F97316" },
  zhipu: { icon: "psychology", color: "#2563EB" },
  electronhub: { icon: "hub", color: "#06B6D4" },
  router9: { icon: "lan", color: "#8B5CF6" },
  septor: { icon: "shield", color: "#64748B" },
  clod: { icon: "cloud_queue", color: "#60A5FA" },
  speechify: { icon: "record_voice_over", color: "#2563EB" },
  blaze: { icon: "local_fire_department", color: "#EF4444" },
  airforce: { icon: "flight", color: "#38BDF8" },
  dreamprompting: { icon: "palette", color: "#D946EF" },
  waterfall: { icon: "water", color: "#06B6D4" },
  logfare: { icon: "insights", color: "#22C55E" },
  aclide: { icon: "terminal", color: "#14B8A6" },
  moondream: { icon: "nightlight", color: "#6366F1" },
  speka: { icon: "campaign", color: "#F59E0B" },
  llmtr: { icon: "translate", color: "#3B82F6" },
  gizmo: { icon: "precision_manufacturing", color: "#84CC16" },
  blockrun: { icon: "view_module", color: "#F97316" },
  typhoon: { icon: "cyclone", color: "#0EA5E9" },
  tavily: { icon: "travel_explore", color: "#0F766E" },
  exa: { icon: "search", color: "#1D4ED8" },
  firecrawl: { icon: "local_fire_department", color: "#FF5A1F" },
  linkup: { icon: "link", color: "#2563EB" },
};

function textIcon(name) {
  return String(name || "FL")
    .replace(/[^A-Za-z0-9]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 3)
    .toUpperCase() || "FL";
}

function mediaBase(baseUrl, path) {
  return `${String(baseUrl || "http://localhost:3001").replace(/\/+$/, "")}${path}`;
}

function resolveBaseUrl() {
  try {
    const rt = readRuntime();
    if (rt?.baseUrl) return String(rt.baseUrl).replace(/\/+$/, "");
  } catch {}
  return "http://localhost:3001";
}

function resolveCatalog() {
  try {
    const rt = readRuntime();
    if (rt?.catalog && typeof rt.catalog === "object") return rt.catalog;
  } catch {}
  return STATIC_CATALOG;
}

export function makeFreeLlmApiEntry(platformId) {
  const baseUrl = resolveBaseUrl();
  const catalog = resolveCatalog();
  const catalogModels = catalog[platformId] || [];
  // `decision` and `webSearch` are available through the same OpenAI-compatible
  // router contract, but multirouter has no dedicated adapter. Expose them as chat
  // models rather than advertising an unusable media route.
  const models = catalogModels.map((model) => {
    if (model.kind === "systemone" || model.kind === "webSearch") {
      const { kind: _kind, ...rest } = model;
      return rest;
    }
    return model;
  });
  const kindSet = new Set(models.map((model) => model.kind || "llm"));
  const serviceKinds = [];
  for (const kind of ["llm", "embedding", "stt", "tts", "image", "video"]) {
    if (kindSet.has(kind)) serviceKinds.push(kind);
  }

  const isKeyless = KEYLESS_PLATFORMS.has(platformId);
  const platformName = FREE_LLM_API_PLATFORM_NAMES[platformId] || platformId;
  const authHint = COMPOUND_AUTH_HINT[platformId];
  const iconMeta = PLATFORM_ICONS[platformId] || { icon: "api", color: "#2563EB" };

  const entry = {
    id: `freellmapi-${platformId}`,
    category: "freeTier",
    hasFree: true,
    authType: isKeyless ? "none" : "apikey",
    authModes: isKeyless ? ["none", "apikey"] : ["apikey"],
    noAuth: isKeyless,
    priority: 65,
    alias: `freellmapi-${platformId}`,
    display: {
      name: `${platformName} (FreeLLMAPI)`,
      icon: iconMeta.icon || "api",
      color: iconMeta.color || "#2563EB",
      textIcon: textIcon(platformName),
      website: "https://freellmapi.co/models",
      notice: {
        text: isKeyless
          ? `Provider ${platformName} dari katalog FreeLLMAPI (keyless bila didukung). Terdaftar native di multirouter; gunakan instance FreeLLMAPI (${baseUrl}) sebagai gateway jika diperlukan.`
          : `Provider ${platformName} dari katalog FreeLLMAPI, terdaftar native di multirouter (metode/auth mengikuti upstream).${authHint ? " " + authHint : ""} Gateway opsional: ${baseUrl}.`,
        apiKeyUrl: "https://freellmapi.co/keys",
      },
    },
    transport: {
      baseUrl: mediaBase(baseUrl, "/v1/chat/completions"),
      thinkingFormat: "openai",
    },
    models,
    serviceKinds,
    modelsFetcher: {
      url: mediaBase(baseUrl, "/v1/models"),
      type: "openai",
    },
    passthroughModels: true,
  };

  if (kindSet.has("tts")) entry.ttsConfig = { baseUrl: mediaBase(baseUrl, "/v1/audio/speech"), authType: "apikey", authHeader: "bearer", format: "openai" };
  if (kindSet.has("stt")) entry.sttConfig = { baseUrl: mediaBase(baseUrl, "/v1/audio/transcriptions"), authType: "apikey", authHeader: "bearer", format: "openai" };
  if (kindSet.has("embedding")) entry.embeddingConfig = { baseUrl: mediaBase(baseUrl, "/v1/embeddings"), authType: "apikey", authHeader: "bearer" };
  if (kindSet.has("image")) entry.imageConfig = { baseUrl: mediaBase(baseUrl, "/v1/images/generations") };
  if (kindSet.has("video")) entry.videoConfig = { baseUrl: mediaBase(baseUrl, "/v1/videos") };
  return entry;
}

export function makeAllFreeLlmApiEntries() {
  const catalog = resolveCatalog();
  return Object.keys(catalog).map((platformId) => makeFreeLlmApiEntry(platformId));
}

