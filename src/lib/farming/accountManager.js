import crypto from "crypto";
import {
  getProviderConnections,
  createProviderConnection,
  updateProviderConnection,
  deleteProviderConnection,
} from "@/lib/db/index.js";

function fingerprint(value) {
  if (!value) return "";
  return crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 16);
}

function normalizeCredential(input) {
  if (!input || typeof input !== "object") return null;
  const provider = String(input.provider || input.platform || "").trim();
  if (!provider) return null;
  const authType = String(input.authType || (input.apiKey ? "apikey" : input.accessToken ? "oauth" : "apikey")).trim();
  const apiKey = input.apiKey || input.key || input.token || "";
  const accessToken = input.accessToken || input.access_token || "";
  const refreshToken = input.refreshToken || input.refresh_token || "";
  const name = input.name || input.label || input.email || "";
  const email = input.email || "";
  const id = input.id || input.connectionId;
  const isActive = input.isActive !== false;
  const priority = Number.isFinite(Number(input.priority)) ? Number(input.priority) : undefined;
  const expiresAt = input.expiresAt || input.expires_at;
  const scope = input.scope;
  const projectId = input.projectId || input.project_id;
  const data = (input.data && typeof input.data === "object") ? { ...input.data } : {};
  // carry through any extra fields
  for (const [k, v] of Object.entries(input)) {
    if (["provider","platform","authType","apiKey","key","token","accessToken","access_token","refreshToken","refresh_token","name","label","email","id","connectionId","isActive","priority","expiresAt","expires_at","scope","projectId","project_id","data"].includes(k)) continue;
    if (data[k] === undefined) data[k] = v;
  }
  return { provider, authType, apiKey, accessToken, refreshToken, name, email, isActive, priority, expiresAt, scope, projectId, id, data };
}

function credentialKey(conn) {
  const provider = conn.provider || "";
  const secret = conn.apiKey || conn.accessToken || conn.refreshToken || conn.data?.apiKey || conn.data?.accessToken || conn.email || conn.name || "";
  return `${provider}::${fingerprint(secret)}`;
}

function extractSecret(conn) {
  return conn?.apiKey || conn?.accessToken || conn?.refreshToken || conn?.data?.apiKey || conn?.data?.accessToken || "";
}

export async function listManagedConnections(filter = {}) {
  const all = await getProviderConnections();
  let items = Array.isArray(all) ? all : [];
  if (filter.provider) items = items.filter((c) => c.provider === filter.provider);
  if (filter.activeOnly) items = items.filter((c) => c.isActive !== false);
  return items;
}

export async function bulkImportConnections(payload = {}) {
  const inputs = Array.isArray(payload) ? payload : Array.isArray(payload.connections) ? payload.connections : Array.isArray(payload.items) ? payload.items : [];
  const mode = payload.mode || "skip"; // skip | update | create
  const existing = await getProviderConnections();
  const existingMap = new Map();
  for (const c of existing || []) existingMap.set(credentialKey(c), c);

  const result = { imported: 0, updated: 0, skipped: 0, failed: 0, errors: [], ids: [] };
  for (const raw of inputs) {
    try {
      const norm = normalizeCredential(raw);
      if (!norm) { result.failed++; result.errors.push({ item: raw, error: "missing provider" }); continue; }
      const key = credentialKey(norm);
      const found = existingMap.get(key);
      if (found) {
        if (mode === "update") {
          const patch = {};
          if (norm.name) patch.name = norm.name;
          if (norm.email) patch.email = norm.email;
          if (norm.priority != null) patch.globalPriority = norm.priority;
          if (norm.apiKey) patch.apiKey = norm.apiKey;
          if (norm.accessToken) patch.accessToken = norm.accessToken;
          if (norm.refreshToken) patch.refreshToken = norm.refreshToken;
          if (norm.expiresAt) patch.expiresAt = norm.expiresAt;
          if (norm.isActive !== undefined) patch.testStatus = norm.isActive ? (found.testStatus || "active") : "disabled";
          await updateProviderConnection(found.id, patch);
          result.updated++; result.ids.push(found.id);
        } else if (mode === "create") {
          const created = await createProviderConnection(buildCreatePayload(norm));
          existingMap.set(key, created);
          result.imported++; result.ids.push(created?.id);
        } else {
          result.skipped++;
        }
        continue;
      }
      const created = await createProviderConnection(buildCreatePayload(norm));
      if (created) existingMap.set(key, created);
      result.imported++; result.ids.push(created?.id);
    } catch (error) {
      result.failed++;
      result.errors.push({ error: error?.message || String(error) });
    }
  }
  return result;
}

function buildCreatePayload(norm) {
  const payload = {
    provider: norm.provider,
    authType: norm.authType || "apikey",
    name: norm.name || norm.email || `${norm.provider}-account`,
    email: norm.email || "",
    isActive: norm.isActive !== false,
    priority: norm.priority,
    testStatus: "unknown",
    ...norm.data,
  };
  if (norm.apiKey) payload.apiKey = norm.apiKey;
  if (norm.accessToken) payload.accessToken = norm.accessToken;
  if (norm.refreshToken) payload.refreshToken = norm.refreshToken;
  if (norm.expiresAt) payload.expiresAt = norm.expiresAt;
  if (norm.scope) payload.scope = norm.scope;
  if (norm.projectId) payload.projectId = norm.projectId;
  return payload;
}

export async function rotateConnections(options = {}) {
  const provider = options.provider;
  const strategy = options.strategy || "round-robin"; // round-robin | by-priority | disable-failed
  const all = await getProviderConnections();
  let items = (all || []).filter((c) => (provider ? c.provider === provider : true));
  if (items.length === 0) return { rotated: 0 };

  if (strategy === "disable-failed") {
    let changed = 0;
    for (const c of items) {
      if (c.testStatus === "error" || c.testStatus === "expired" || c.testStatus === "cooldown") {
        await updateProviderConnection(c.id, { testStatus: "disabled" });
        changed++;
      }
    }
    return { rotated: changed, strategy };
  }

  // sort by current priority then rotate
  items.sort((a, b) => (a.globalPriority ?? 9999) - (b.globalPriority ?? 9999) || String(a.id).localeCompare(String(b.id)));
  if (strategy === "round-robin" && items.length > 1) {
    const first = items.shift();
    items.push(first);
  }
  let changed = 0;
  for (let i = 0; i < items.length; i++) {
    const desired = i + 1;
    if ((items[i].globalPriority ?? null) !== desired) {
      await updateProviderConnection(items[i].id, { globalPriority: desired });
      changed++;
    }
  }
  return { rotated: changed, total: items.length, strategy };
}

export async function exportConnections(filter = {}) {
  const items = await listManagedConnections(filter);
  // redact by default? user asked for import/export of existing credentials - include but mark
  return items.map((c) => ({
    id: c.id,
    provider: c.provider,
    authType: c.authType,
    name: c.name,
    email: c.email,
    isActive: c.isActive !== false && c.testStatus !== "disabled",
    priority: c.globalPriority,
    testStatus: c.testStatus,
    lastTested: c.lastTested,
    lastError: c.lastError,
    rateLimitedUntil: c.rateLimitedUntil,
    hasApiKey: !!extractSecret(c),
    // include secrets for export (owner-managed)
    apiKey: c.apiKey,
    accessToken: c.accessToken,
    refreshToken: c.refreshToken,
    expiresAt: c.expiresAt,
  }));
}

export async function bulkDeleteConnections(filter = {}) {
  const items = await listManagedConnections(filter);
  let deleted = 0;
  for (const c of items) {
    if (filter.status && c.testStatus !== filter.status) continue;
    await deleteProviderConnection(c.id);
    deleted++;
  }
  return { deleted };
}
