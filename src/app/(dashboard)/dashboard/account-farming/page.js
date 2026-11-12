"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, CardSkeleton, Input, PageShell } from "@/shared/components";
import { cn } from "@/shared/utils/cn";

function formatTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

const EXAMPLE_IMPORT = `[
  {"provider":"openrouter","apiKey":"sk-or-...","name":"or-1"},
  {"provider":"groq","apiKey":"gsk_...","name":"groq-1"}
]`;

export default function AccountFarmingPage() {
  const [loading, setLoading] = useState(true);
  const [connections, setConnections] = useState([]);
  const [worker, setWorker] = useState(null);
  const [importText, setImportText] = useState("");
  const [importMode, setImportMode] = useState("skip");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState(null);

  const load = useCallback(async () => {
    try {
      const [accRes, workerRes] = await Promise.all([
        fetch("/api/farming/accounts"),
        fetch("/api/farming/worker"),
      ]);
      const acc = await accRes.json();
      const w = await workerRes.json();
      setConnections(acc.connections || []);
      setWorker(w);
    } catch (e) {
      setMessage({ type: "error", text: e.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  const stats = useMemo(() => {
    const s = { total: connections.length, active: 0, error: 0, unknown: 0, disabled: 0 };
    for (const c of connections) {
      const st = c.testStatus || "unknown";
      if (st === "active") s.active++;
      else if (st === "error" || st === "expired" || st === "cooldown") s.error++;
      else if (st === "disabled") s.disabled++;
      else s.unknown++;
    }
    return s;
  }, [connections]);

  async function runAction(action, body = {}) {
    setBusy(action);
    setMessage(null);
    try {
      let res;
      if (action === "import") {
        let parsed;
        try { parsed = JSON.parse(importText); } catch { throw new Error("Import harus JSON valid (array objek koneksi)"); }
        res = await fetch("/api/farming/accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ connections: parsed, mode: importMode }) });
      } else if (action === "rotate") {
        res = await fetch("/api/farming/rotate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      } else {
        res = await fetch("/api/farming/worker", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...body }) });
      }
      const data = await res.json();
      if (!res.ok || data.ok === false) throw new Error(data.error || "Gagal");
      setMessage({ type: "success", text: action === "import" ? `Import: +${data.imported||0}, update ${data.updated||0}, skip ${data.skipped||0}, gagal ${data.failed||0}` : "Berhasil" });
      if (action === "import") setImportText("");
      await load();
    } catch (e) {
      setMessage({ type: "error", text: e.message });
    } finally {
      setBusy("");
    }
  }

  if (loading) {
    return <PageShell title="Account Farming" description="Bulk import, rotate, and auto-validate existing provider credentials."><CardSkeleton className="h-64" /></PageShell>;
  }

  return (
    <PageShell
      title="Account Farming"
      description="Kelola, impor massal, rotasi, dan validasi otomatis kredensial provider yang sudah dimiliki (tanpa auto-register/bypass). Integrasi katalog freellmapi (hybrid)."
      actions={
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => runAction("sync-catalog")} disabled={!!busy}>Sync Catalog</Button>
          <Button size="sm" variant="outline" onClick={() => runAction("run")} disabled={!!busy}>Run Check</Button>
          <Button size="sm" onClick={() => runAction("start", { loopMinutes: 5 })} disabled={!!busy}>Start Loop (5m)</Button>
          <Button size="sm" variant="ghost" onClick={() => runAction("stop")} disabled={!!busy}>Stop</Button>
        </div>
      }
    >
      {message && (
        <div className={cn("mb-4 rounded-md px-3 py-2 text-sm", message.type === "error" ? "bg-red-500/10 text-red-500" : "bg-green-500/10 text-green-600")}>{message.text}</div>
      )}

      <div className="grid gap-4 md:grid-cols-4 mb-4">
        <Card className="p-4"><div className="text-xs text-text-muted">Total Connections</div><div className="text-2xl font-semibold">{stats.total}</div></Card>
        <Card className="p-4"><div className="text-xs text-text-muted">Active</div><div className="text-2xl font-semibold text-green-500">{stats.active}</div></Card>
        <Card className="p-4"><div className="text-xs text-text-muted">Error/Cooldown</div><div className="text-2xl font-semibold text-red-500">{stats.error}</div></Card>
        <Card className="p-4"><div className="text-xs text-text-muted">Unknown/Skipped</div><div className="text-2xl font-semibold">{stats.unknown + stats.disabled}</div></Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium">Bulk Import Kredensial (yang sudah dimiliki)</h3>
            <Badge variant="outline">mode: {importMode}</Badge>
          </div>
          <p className="text-xs text-text-muted mb-2">Format: JSON array objek. Field umum: <code>provider</code>, <code>apiKey</code> atau <code>accessToken</code>/<code>refreshToken</code>, opsional <code>name</code>, <code>email</code>, <code>priority</code>. Dedup otomatis.</p>
          <div className="flex gap-2 mb-2 flex-wrap">
            {["skip","update","create"].map(m => (
              <Button key={m} size="sm" variant={importMode===m?"default":"outline"} onClick={() => setImportMode(m)}>{m}</Button>
            ))}
            <Button size="sm" variant="ghost" onClick={() => setImportText(EXAMPLE_IMPORT)}>Contoh</Button>
          </div>
          <textarea className="w-full h-48 rounded-md border border-border bg-surface p-2 text-xs font-mono" value={importText} onChange={e=>setImportText(e.target.value)} placeholder={EXAMPLE_IMPORT} />
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={() => runAction("import")} disabled={!!busy || !importText.trim()}>{busy==="import"?"Importing...":"Import"}</Button>
            <Button size="sm" variant="outline" onClick={() => runAction("rotate", { strategy: "round-robin" })} disabled={!!busy}>Rotate (RR)</Button>
            <Button size="sm" variant="outline" onClick={() => runAction("rotate", { strategy: "disable-failed" })} disabled={!!busy}>Disable Failed</Button>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium">Worker & Status</h3>
            <Badge variant={worker?.status === "running" ? "default" : "outline"}>{worker?.status || "idle"}</Badge>
          </div>
          <div className="text-xs text-text-muted space-y-1 mb-3">
            <div>Last run: {formatTime(worker?.lastRunAt)}</div>
            <div>Loop: {worker?.loopMinutes ? `setiap ${worker.loopMinutes}m` : "manual"}</div>
            <div>Last result: <code className="text-[11px]">{worker?.lastResult ? JSON.stringify(worker.lastResult) : "—"}</code></div>
          </div>
          <div className="text-xs font-medium mb-1">Logs</div>
          <div className="h-48 overflow-auto rounded border border-border bg-surface p-2 font-mono text-[11px] space-y-1">
            {(worker?.logs || []).length === 0 && <div className="text-text-muted">Belum ada log.</div>}
            {(worker?.logs || []).map((l, i) => (
              <div key={i} className={cn(l.type==="error"?"text-red-500":l.type==="warn"?"text-yellow-500":"text-text-muted")}>[{formatTime(l.ts)}] {l.msg}</div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="p-4 mt-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-medium">Connections ({connections.length})</h3>
          <Button size="sm" variant="ghost" onClick={load}>Refresh</Button>
        </div>
        <div className="overflow-auto max-h-80">
          <table className="w-full text-xs">
            <thead className="text-text-muted"><tr className="text-left"><th className="py-1 pr-2">Provider</th><th className="py-1 pr-2">Name/Email</th><th className="py-1 pr-2">Auth</th><th className="py-1 pr-2">Status</th><th className="py-1 pr-2">Priority</th><th className="py-1 pr-2">Last Tested</th></tr></thead>
            <tbody>
              {connections.slice(0, 200).map((c) => (
                <tr key={c.id} className="border-t border-border/50">
                  <td className="py-1 pr-2 font-medium">{c.provider}</td>
                  <td className="py-1 pr-2 truncate max-w-[180px]" title={c.name||c.email}>{c.name || c.email || "—"}</td>
                  <td className="py-1 pr-2">{c.authType}</td>
                  <td className="py-1 pr-2"><Badge variant={c.testStatus==="active"?"default":"outline"}>{c.testStatus || "unknown"}</Badge></td>
                  <td className="py-1 pr-2">{c.globalPriority ?? c.priority ?? "—"}</td>
                  <td className="py-1 pr-2 text-text-muted">{formatTime(c.lastTested)}</td>
                </tr>
              ))}
              {connections.length === 0 && <tr><td colSpan={6} className="py-4 text-center text-text-muted">Belum ada koneksi.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </PageShell>
  );
}
