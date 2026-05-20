import { useEffect, useState } from "react";
import Topbar from "@/components/Topbar";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Activity,
  MonitorSmartphone,
  Users,
  Gauge,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

function Kpi({ label, value, icon: Icon, accent = "green", suffix = "" }) {
  const colors = {
    green: "text-green-500 border-green-500/30",
    amber: "text-amber-500 border-amber-500/30",
    cyan: "text-cyan-400 border-cyan-500/30",
    neutral: "text-neutral-300 border-neutral-700",
  };
  return (
    <Card className="bg-neutral-900 border-neutral-800 rounded-sm p-5 relative overflow-hidden">
      <div className="flex items-start justify-between">
        <div>
          <div className="label-eyebrow">{label}</div>
          <div className="mt-3 text-3xl font-mono tracking-tight">
            {value}
            {suffix && <span className="text-base text-neutral-500 ml-1">{suffix}</span>}
          </div>
        </div>
        <div className={`w-9 h-9 border ${colors[accent]} flex items-center justify-center`}>
          <Icon className={`w-4 h-4 ${colors[accent].split(" ")[0]}`} />
        </div>
      </div>
    </Card>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.get("/dashboard/stats").then((r) => setStats(r.data));
  }, []);

  if (!stats) {
    return (
      <>
        <Topbar title="Dashboard" subtitle="// painel-de-controle" />
        <div className="p-8 text-neutral-500 font-mono text-xs animate-pulse">carregando métricas…</div>
      </>
    );
  }

  return (
    <>
      <Topbar title="Dashboard" subtitle="// visão geral do servidor" />
      <div className="p-6 space-y-6" data-testid="dashboard-page">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Kpi label="Dispositivos Online" value={stats.online_devices} icon={MonitorSmartphone} accent="green" />
          <Kpi label="Sessões Ativas" value={stats.active_sessions} icon={Activity} accent="amber" />
          <Kpi label="Total Conexões" value={stats.total_sessions} icon={Gauge} accent="cyan" />
          <Kpi label="Operadores" value={stats.total_users} icon={Users} accent="neutral" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2 bg-neutral-900 border-neutral-800 rounded-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="label-eyebrow">Tráfego do Relay</div>
                <h3 className="text-lg mt-1">Banda em tempo real</h3>
              </div>
              <div className="flex gap-4 text-xs font-mono">
                <span className="flex items-center gap-1.5 text-green-500">
                  <ArrowDownRight className="w-3 h-3" /> IN {stats.bandwidth_mbps_in} Mbps
                </span>
                <span className="flex items-center gap-1.5 text-amber-500">
                  <ArrowUpRight className="w-3 h-3" /> OUT {stats.bandwidth_mbps_out} Mbps
                </span>
              </div>
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats.bandwidth_series}>
                  <XAxis dataKey="t" tick={{ fontSize: 10, fill: "#737373", fontFamily: "IBM Plex Mono" }} axisLine={{ stroke: "#262626" }} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#737373", fontFamily: "IBM Plex Mono" }} axisLine={{ stroke: "#262626" }} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: "#0a0a0a", border: "1px solid #262626", borderRadius: 0, fontFamily: "IBM Plex Mono", fontSize: 11 }}
                    labelStyle={{ color: "#a3a3a3" }}
                  />
                  <Line type="monotone" dataKey="in" stroke="#22c55e" strokeWidth={1.5} dot={false} />
                  <Line type="monotone" dataKey="out" stroke="#f59e0b" strokeWidth={1.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="bg-neutral-900 border-neutral-800 rounded-sm p-5">
            <div className="label-eyebrow mb-3">Status da Frota</div>
            <div className="space-y-3">
              <Row label="Total de dispositivos" value={stats.total_devices} />
              <Row label="Online" value={stats.online_devices} dot="green" />
              <Row label="Offline" value={stats.offline_devices} dot="amber" />
              <Row label="Sessões históricas" value={stats.total_sessions} />
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="bg-neutral-900 border-neutral-800 rounded-sm">
            <div className="px-5 py-4 border-b border-neutral-800 flex items-center justify-between">
              <div>
                <div className="label-eyebrow">Sessões Recentes</div>
                <h3 className="text-lg mt-0.5">Últimas conexões</h3>
              </div>
            </div>
            <div className="divide-y divide-neutral-800">
              {stats.recent_sessions.map((s) => (
                <div key={s.id} className="px-5 py-3 flex items-center justify-between hover:bg-neutral-800/50">
                  <div className="min-w-0">
                    <div className="text-sm">{s.device_name}</div>
                    <div className="text-[11px] font-mono text-neutral-500">{s.device_rust_id} · {s.operator_email}</div>
                  </div>
                  <Badge
                    variant="outline"
                    className={`font-mono uppercase text-[10px] rounded-sm ${s.status === "active" ? "border-green-500/40 text-green-500" : "border-neutral-700 text-neutral-400"}`}
                  >
                    {s.status === "active" ? "AO VIVO" : "Encerrada"}
                  </Badge>
                </div>
              ))}
              {stats.recent_sessions.length === 0 && (
                <div className="px-5 py-6 text-xs text-neutral-500 font-mono">— sem sessões —</div>
              )}
            </div>
          </Card>

          <Card className="bg-neutral-900 border-neutral-800 rounded-sm">
            <div className="px-5 py-4 border-b border-neutral-800">
              <div className="label-eyebrow">Audit Log</div>
              <h3 className="text-lg mt-0.5">Eventos recentes</h3>
            </div>
            <div className="px-5 py-3 font-mono text-[11px] leading-relaxed space-y-1.5">
              {stats.recent_logs.map((l) => (
                <div key={l.id} className="flex items-start gap-3">
                  <span className="text-neutral-600 shrink-0">{new Date(l.timestamp).toLocaleTimeString("pt-BR")}</span>
                  <span className="text-amber-500 shrink-0 w-24 truncate">{l.action}</span>
                  <span className="text-neutral-400 truncate">{l.target}</span>
                  <span className="text-neutral-600 ml-auto truncate">{l.actor}</span>
                </div>
              ))}
              {stats.recent_logs.length === 0 && <div className="text-neutral-500">— sem eventos —</div>}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

function Row({ label, value, dot }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-neutral-400 flex items-center gap-2">
        {dot && <span className={`pulse-dot ${dot === "green" ? "bg-green-500 text-green-500" : "bg-amber-500 text-amber-500"}`} />}
        {label}
      </span>
      <span className="font-mono">{value}</span>
    </div>
  );
}
