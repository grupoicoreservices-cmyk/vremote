import { useEffect, useState, useCallback } from "react";
import Topbar from "@/components/Topbar";
import { api } from "@/lib/api";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

function formatDuration(sec) {
  if (!sec) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

export default function Sessions() {
  const [items, setItems] = useState([]);

  const load = useCallback(async () => {
    const { data } = await api.get("/sessions");
    setItems(data);
  }, []);

  useEffect(() => { load(); }, [load]);

  const active = items.filter((s) => s.status === "active");
  const history = items.filter((s) => s.status !== "active");

  const endSession = async (id) => {
    await api.post(`/sessions/${id}/end`);
    toast.success("Sessão encerrada");
    load();
  };

  return (
    <>
      <Topbar title="Sessões" subtitle="// conexões remotas" />
      <div className="p-6" data-testid="sessions-page">
        <Tabs defaultValue="active">
          <TabsList className="bg-neutral-900 border border-neutral-800 rounded-sm">
            <TabsTrigger value="active" data-testid="tab-active">Ao Vivo ({active.length})</TabsTrigger>
            <TabsTrigger value="history" data-testid="tab-history">Histórico ({history.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="mt-4">
            <SessionTable rows={active} onEnd={endSession} live />
          </TabsContent>
          <TabsContent value="history" className="mt-4">
            <SessionTable rows={history} />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}

function SessionTable({ rows, onEnd, live = false }) {
  return (
    <div className="border border-neutral-800 bg-neutral-900 rounded-sm">
      <Table>
        <TableHeader>
          <TableRow className="border-neutral-800 hover:bg-transparent">
            <TableHead className="label-eyebrow">Status</TableHead>
            <TableHead className="label-eyebrow">ID Dispositivo</TableHead>
            <TableHead className="label-eyebrow">Nome</TableHead>
            <TableHead className="label-eyebrow">Operador</TableHead>
            <TableHead className="label-eyebrow">Iniciada</TableHead>
            <TableHead className="label-eyebrow">Duração</TableHead>
            {live && <TableHead></TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((s) => (
            <TableRow key={s.id} className="border-neutral-800 hover:bg-neutral-800/50">
              <TableCell>
                <Badge
                  variant="outline"
                  className={`rounded-sm font-mono text-[10px] uppercase ${
                    s.status === "active"
                      ? "border-green-500/40 text-green-500"
                      : "border-neutral-700 text-neutral-400"
                  }`}
                >
                  {s.status === "active" ? "AO VIVO" : "Encerrada"}
                </Badge>
              </TableCell>
              <TableCell className="font-mono text-green-500">{s.device_rust_id}</TableCell>
              <TableCell>{s.device_name}</TableCell>
              <TableCell className="text-sm text-neutral-300">{s.operator_email}</TableCell>
              <TableCell className="font-mono text-[11px] text-neutral-500">
                {new Date(s.started_at).toLocaleString("pt-BR")}
              </TableCell>
              <TableCell className="font-mono text-xs">{formatDuration(s.duration_sec)}</TableCell>
              {live && (
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    onClick={() => onEnd(s.id)}
                    className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/30 rounded-sm h-8"
                    data-testid={`end-session-btn-${s.id}`}
                  >
                    Encerrar
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={live ? 7 : 6} className="text-center text-neutral-500 font-mono text-xs py-10">
                — sem sessões —
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
