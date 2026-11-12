import { FREE_LLM_API_CATALOG as STATIC_CATALOG } from "./freellmapi-catalog.js";

function readRuntime() {
  const g = globalThis.__nineRouterFreeLlmApi || null;
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
  waterfall: "Waterfall",
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

  const entry = {
    id: `freellmapi-${platformId}`,
    category: "freeTier",
    hasFree: true,
    authType: "apikey",
    authModes: ["apikey"],
    noAuth: false,
    priority: 65,
    alias: `freellmapi-${platformId}`,
    display: {
      name: `${FREE_LLM_API_PLATFORM_NAMES[platformId] || platformId} (FreeLLMAPI)`,
      icon: "api",
      color: "#2563EB",
      textIcon: textIcon(FREE_LLM_API_PLATFORM_NAMES[platformId] || platformId),
      website: "https://freellmapi.co/models",
      notice: {
        text: "Free tier routed through your FreeLLMAPI instance. Use the unified API key from the FreeLLMAPI Keys page.",
        apiKeyUrl: mediaBase(baseUrl, "/keys"),
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

