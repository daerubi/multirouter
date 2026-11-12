function readRuntime() {
  const g = globalThis.__multirouterFreeLlmApi || globalThis.__nineRouterFreeLlmApi || null;
  return (g && typeof g === "object") ? g : null;
}
function base() {
  const rt = readRuntime();
  return String(rt?.baseUrl || "http://localhost:3001").replace(/\/+$/, "");
}
function u(path) { return `${base()}${path}`; }

export default {
  id: "freellmapi",
  priority: 15,
  hasFree: true,
  alias: "freellmapi",
  display: {
    name: "FreeLLMAPI (Unified)",
    icon: "hub",
    color: "#2563EB",
    textIcon: "FL",
    website: "https://freellmapi.co",
    notice: {
      text: "Gateway FreeLLMAPI terintegrasi di multirouter (semua provider/katalog freellmapi). Set base URL & sync katalog; jika instance lokal/remote tidak aktif, model tetap terdaftar dari katalog snapshot.",
      apiKeyUrl: "https://freellmapi.co/keys",
    },
  },
  category: "freeTier",
  authType: "apikey",
  authModes: ["apikey", "none"],
  noAuth: false,
  transport: {
    baseUrl: u("/v1/chat/completions"),
    thinkingFormat: "openai",
  },
  models: [
    { id: "auto", name: "Auto (Router Selected)" },
    { id: "auto:smart", name: "Auto Smart" },
    { id: "auto:fast", name: "Auto Fast" },
    { id: "auto:balanced", name: "Auto Balanced" },
    { id: "auto:reliable", name: "Auto Reliable" },
    { id: "auto:cheap", name: "Auto Cheap" },
    { id: "fusion", name: "Fusion (Multi-model Synthesis)" },
  ],
  serviceKinds: ["llm", "embedding", "image", "tts", "stt", "video"],
  ttsConfig: { baseUrl: u("/v1/audio/speech"), authType: "apikey", authHeader: "bearer", format: "openai", defaultModel: "auto" },
  sttConfig: { baseUrl: u("/v1/audio/transcriptions"), authType: "apikey", authHeader: "bearer", format: "openai", defaultModel: "auto" },
  embeddingConfig: { baseUrl: u("/v1/embeddings"), authType: "apikey", authHeader: "bearer", defaultModel: "auto" },
  imageConfig: { baseUrl: u("/v1/images/generations") },
  videoConfig: { baseUrl: u("/v1/videos") },
  modelsFetcher: { url: u("/v1/models"), type: "openai" },
  passthroughModels: true,
};
