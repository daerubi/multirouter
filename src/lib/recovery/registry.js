import { getProviderConnectionById, updateProviderConnection } from "@/lib/db/index.js";

// Pluggable recovery/check-in/quota-recovery actions (mode 3b).
// Only provider-offered, user-authorized actions. No auto-registration/CAPTCHA bypass.

const actions = new Map();

function register(provider, handler) {
  actions.set(provider, handler);
}

function getHandler(provider) {
  return actions.get(provider) || actions.get("*") || null;
}

// ZCode bonus/claim recovery (preview/execute) - aligned with existing provider flow
register("zcode", {
  async preview({ connection }) {
    try {
      const { getZCodeClaimablePlans } = await import("@/lib/services/zcodeClaimService.js");
      const token = connection?.apiKey || connection?.accessToken;
      return await getZCodeClaimablePlans(token, connection?.providerSpecificData?.deviceId || null);
    } catch (e) {
      return { ok: false, error: e.message, plans: [] };
    }
  },
  async execute({ connection, payload }) {
    try {
      const { claimZCodePlan } = await import("@/lib/services/zcodeClaimService.js");
      const token = connection?.apiKey || connection?.accessToken;
      const planId = payload?.planId;
      const deviceId = connection?.providerSpecificData?.deviceId || null;
      const captchaParam = payload?.captchaParam || ""; // user-supplied if provider requires; no bypass
      if (!planId) return { ok: false, error: "planId required" };
      const res = await claimZCodePlan(token, planId, deviceId, captchaParam);
      if (res?.ok) {
        await updateProviderConnection(connection.id, { lastTested: new Date().toISOString(), lastError: null, testStatus: "active" });
      }
      return res;
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },
});

// APINex daily check-in style recovery (aligned with freellmapi semantics):
// This is a guided/manual recovery marker - user must complete provider's official check-in if required.
// We record/clear cooldown state accordingly; no automated bypass.
register("apinex", {
  async preview({ connection }) {
    const rl = connection?.rateLimitedUntil;
    const needs = rl && new Date(rl).getTime() > Date.now();
    return {
      ok: true,
      provider: "apinex",
      type: "checkin-recovery",
      needsRecovery: !!needs || connection?.lastError?.toLowerCase?.().includes("check-in"),
      message: "APINex daily check-in (jika disyaratkan provider) harus dilakukan lewat kanal resmi provider/freellmapi. Aksi ini mencatat pemulihan dan menghapus cooldown lokal setelah konfirmasi manual.",
      rateLimitedUntil: rl || null,
    };
  },
  async execute({ connection, payload }) {
    const confirm = payload?.confirmManualCheckin === true;
    if (!confirm) {
      return { ok: false, error: "Konfirmasi diperlukan: set confirmManualCheckin=true setelah check-in resmi selesai (tanpa bypass)." };
    }
    await updateProviderConnection(connection.id, {
      rateLimitedUntil: null,
      lastError: null,
      testStatus: "active",
      lastTested: new Date().toISOString(),
    });
    return { ok: true, provider: "apinex", action: "checkin-recovery-marked", note: "Cooldown lokal dihapus berdasarkan konfirmasi manual." };
  },
});

// Generic/manual recovery for other providers
register("*", {
  async preview({ connection, provider }) {
    return {
      ok: true,
      provider: provider || connection?.provider,
      type: "manual-recovery",
      supported: false,
      message: "Tidak ada aksi recovery otomatis khusus. Gunakan tindakan resmi provider (login/check-in/top-up) lalu jalankan validasi ulang; atau clear cooldown manual.",
      state: {
        testStatus: connection?.testStatus,
        lastError: connection?.lastError,
        rateLimitedUntil: connection?.rateLimitedUntil,
      },
    };
  },
  async execute({ connection, payload }) {
    if (payload?.clearCooldown) {
      await updateProviderConnection(connection.id, { rateLimitedUntil: null, lastError: null, testStatus: "active", lastTested: new Date().toISOString() });
      return { ok: true, action: "cooldown-cleared" };
    }
    return { ok: false, error: "Aksi tidak didukung untuk provider ini. Sediakan clearCooldown=true setelah pemulihan resmi manual." };
  },
});

export async function previewRecovery(provider, connectionId) {
  const connection = connectionId ? await getProviderConnectionById(connectionId) : null;
  if (connectionId && !connection) return { ok: false, error: "connection not found" };
  const handler = getHandler(provider || connection?.provider);
  if (!handler?.preview) return { ok: false, error: "no recovery handler" };
  return handler.preview({ provider: provider || connection?.provider, connection });
}

export async function executeRecovery(provider, connectionId, payload = {}) {
  const connection = connectionId ? await getProviderConnectionById(connectionId) : null;
  if (connectionId && !connection) return { ok: false, error: "connection not found" };
  const handler = getHandler(provider || connection?.provider);
  if (!handler?.execute) return { ok: false, error: "no recovery handler" };
  return handler.execute({ provider: provider || connection?.provider, connection, payload });
}

export function listRecoveryProviders() {
  return [...actions.keys()];
}
