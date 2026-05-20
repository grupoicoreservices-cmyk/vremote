import { useEffect, useState, useCallback } from "react";
import Topbar from "@/components/Topbar";
import { api } from "@/lib/api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";

const ACTION_COLORS = {
  login: "text-green-500",
  logout: "text-neutral-400",
  "session.start": "text-green-500",
  "session.end": "text-amber-500",
  "device.create": "text-cyan-400",
  "device.update": "text-cyan-400",
  "device.delete": "text-red-400",
  "user.create": "text-cyan-400",
  "user.delete": "text-red-400",
  "token.create": "text-green-500",
  "token.revoke": "text-amber-500",
};

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [filter, setFilter] = useState("all");

  const load = useCallback(async () => {
    const { data } = await api.get("/audit-logs", { params: { action: filter, limit: 200 } });
    setLogs(data);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <Topbar title="Audit Logs" subtitle="// rastreio de eventos" />
      <div className="p-6 space-y-4" data-testid="audit-page">
        <div className="flex items-center gap-3">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="bg-neutral-900 border-neutral-800 w-56" data-testid="audit-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-neutral-950 border-neutral-800">
              <SelectItem value="all">Todas ações</SelectItem>
              <SelectItem value="login">Login</SelectItem>
              <SelectItem value="session">Sessões</SelectItem>
              <SelectItem value="device">Dispositivos</SelectItem>
              <SelectItem value="user">Usuários</SelectItem>
              <SelectItem value="token">Tokens</SelectItem>
            </SelectContent>
          </Select>
          <span className="ml-auto label-eyebrow">{logs.length} eventos</span>
        </div>

        <Card className="bg-neutral-900 border-neutral-800 rounded-sm">
          <div className="px-5 py-3 border-b border-neutral-800 flex items-center justify-between">
            <div className="label-eyebrow text-green-500">$ tail -f /var/log/rustadmin/audit.log</div>
          </div>
          <div className="px-5 py-4 font-mono text-[12px] leading-relaxed space-y-1">
            {logs.map((l) => (
              <div key={l.id} className="grid grid-cols-[140px_1fr_2fr_1fr] gap-3 items-start hover:bg-neutral-800/40 px-2 py-1 -mx-2">
                <span className="text-neutral-600">{new Date(l.timestamp).toLocaleString("pt-BR")}</span>
                <span className={ACTION_COLORS[l.action] || "text-neutral-300"}>{l.action}</span>
                <span className="text-neutral-300 truncate">target: {l.target || "—"}</span>
                <span className="text-neutral-500 text-right truncate">{l.actor}</span>
              </div>
            ))}
            {logs.length === 0 && <div className="text-neutral-500">— sem eventos —</div>}
          </div>
        </Card>
      </div>
    </>
  );
}
