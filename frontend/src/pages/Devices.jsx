import { useEffect, useState, useCallback } from "react";
import Topbar from "@/components/Topbar";
import { api, formatApiErrorDetail } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, MoreHorizontal, MonitorSmartphone, Server, Smartphone, Apple, Plug, Search } from "lucide-react";
import { toast } from "sonner";
import RemoteControl from "@/components/RemoteControl";

const SCREEN_MOCK = "https://static.prod-images.emergentagent.com/jobs/539a4407-7ab7-4ef7-aae7-fc6df8facf83/images/c17222935a415163ef8706df95796192d9cd0349e0697954644b12d5afb97e31.png";

const OS_ICON = {
  windows: MonitorSmartphone,
  linux: Server,
  macos: Apple,
  android: Smartphone,
  ios: Smartphone,
};

function StatusPill({ status }) {
  const map = {
    online: { color: "text-green-500", bg: "bg-green-500", label: "Online" },
    offline: { color: "text-neutral-500", bg: "bg-neutral-600", label: "Offline" },
    idle: { color: "text-amber-500", bg: "bg-amber-500", label: "Ocioso" },
  };
  const s = map[status] || map.offline;
  return (
    <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase">
      <span className={`pulse-dot ${s.bg} ${s.color}`} />
      <span className={s.color}>{s.label}</span>
    </span>
  );
}

export default function Devices() {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [openCreate, setOpenCreate] = useState(false);
  const [openConnect, setOpenConnect] = useState(null);
  const [form, setForm] = useState({ name: "", os: "windows", tags: "", notes: "" });

  const load = useCallback(async () => {
    const { data } = await api.get("/devices", { params: { search: search || undefined, status: statusFilter } });
    setItems(data);
  }, [search, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await api.post("/devices", {
        name: form.name,
        os: form.os,
        tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
        notes: form.notes,
      });
      toast.success("Dispositivo registrado");
      setOpenCreate(false);
      setForm({ name: "", os: "windows", tags: "", notes: "" });
      load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e?.response?.data?.detail));
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/devices/${id}`);
      toast.success("Dispositivo removido");
      load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e?.response?.data?.detail));
    }
  };

  const handleConnect = async (device) => {
    try {
      const { data } = await api.post("/sessions", { device_id: device.id, note: "Conexão iniciada via painel" });
      toast.success(`Sessão #${data.id.slice(0,6)} iniciada`);
      setOpenConnect({ device, session: data });
    } catch (e) {
      toast.error(formatApiErrorDetail(e?.response?.data?.detail));
    }
  };

  return (
    <>
      <Topbar
        title="Dispositivos"
        subtitle="// frota gerenciada"
        actions={
          <Dialog open={openCreate} onOpenChange={setOpenCreate}>
            <DialogTrigger asChild>
              <Button className="bg-green-500 hover:bg-green-400 text-black rounded-sm" data-testid="add-device-btn">
                <Plus className="w-4 h-4 mr-1" /> Novo
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-neutral-950 border-neutral-800 rounded-sm">
              <DialogHeader>
                <DialogTitle>Registrar dispositivo</DialogTitle>
                <DialogDescription className="text-neutral-500">
                  Gera um RustDesk ID de 9 dígitos para registro do agente.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4" data-testid="device-create-form">
                <div className="space-y-2">
                  <Label className="label-eyebrow">Nome</Label>
                  <Input
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="WS-DEV-01"
                    className="bg-neutral-900 border-neutral-800 font-mono"
                    data-testid="device-name-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="label-eyebrow">Sistema</Label>
                  <Select value={form.os} onValueChange={(v) => setForm({ ...form, os: v })}>
                    <SelectTrigger className="bg-neutral-900 border-neutral-800" data-testid="device-os-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-neutral-950 border-neutral-800">
                      <SelectItem value="windows">Windows</SelectItem>
                      <SelectItem value="linux">Linux</SelectItem>
                      <SelectItem value="macos">macOS</SelectItem>
                      <SelectItem value="android">Android</SelectItem>
                      <SelectItem value="ios">iOS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="label-eyebrow">Tags (separadas por vírgula)</Label>
                  <Input
                    value={form.tags}
                    onChange={(e) => setForm({ ...form, tags: e.target.value })}
                    placeholder="Produção, Cliente A"
                    className="bg-neutral-900 border-neutral-800 font-mono"
                    data-testid="device-tags-input"
                  />
                </div>
                <DialogFooter>
                  <Button type="submit" className="bg-green-500 hover:bg-green-400 text-black rounded-sm" data-testid="device-create-submit">
                    Registrar
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="p-6 space-y-4" data-testid="devices-page">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ID, nome ou IP…"
              className="pl-9 bg-neutral-900 border-neutral-800 font-mono w-72"
              data-testid="device-search-input"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="bg-neutral-900 border-neutral-800 w-40" data-testid="device-status-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-neutral-950 border-neutral-800">
              <SelectItem value="all">Todos status</SelectItem>
              <SelectItem value="online">Online</SelectItem>
              <SelectItem value="offline">Offline</SelectItem>
              <SelectItem value="idle">Ocioso</SelectItem>
            </SelectContent>
          </Select>
          <span className="ml-auto label-eyebrow">{items.length} dispositivos</span>
        </div>

        <div className="border border-neutral-800 bg-neutral-900 rounded-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-neutral-800 hover:bg-transparent">
                <TableHead className="label-eyebrow">Status</TableHead>
                <TableHead className="label-eyebrow">ID</TableHead>
                <TableHead className="label-eyebrow">Nome</TableHead>
                <TableHead className="label-eyebrow">OS</TableHead>
                <TableHead className="label-eyebrow">IP</TableHead>
                <TableHead className="label-eyebrow">Tags</TableHead>
                <TableHead className="label-eyebrow">Visto em</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((d) => {
                const Icon = OS_ICON[d.os] || MonitorSmartphone;
                return (
                  <TableRow key={d.id} className="border-neutral-800 hover:bg-neutral-800/50" data-testid={`device-row-${d.rust_id}`}>
                    <TableCell><StatusPill status={d.status} /></TableCell>
                    <TableCell className="font-mono text-green-500">{d.rust_id}</TableCell>
                    <TableCell className="text-sm">{d.name}</TableCell>
                    <TableCell><span className="inline-flex items-center gap-1.5 text-xs"><Icon className="w-3.5 h-3.5 text-neutral-400" /> {d.os}</span></TableCell>
                    <TableCell className="font-mono text-xs text-neutral-400">{d.ip}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(d.tags || []).map((t) => (
                          <Badge key={t} variant="outline" className="rounded-sm border-neutral-700 text-neutral-300 text-[10px] font-mono">{t}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-[11px] text-neutral-500">
                      {new Date(d.last_seen).toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleConnect(d)}
                          disabled={d.status !== "online"}
                          className="bg-green-500/10 hover:bg-green-500/20 text-green-500 border border-green-500/30 rounded-sm h-8"
                          data-testid={`device-connect-btn-${d.rust_id}`}
                        >
                          <Plug className="w-3.5 h-3.5 mr-1" /> Conectar
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-8 w-8" data-testid={`device-menu-${d.rust_id}`}>
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent className="bg-neutral-950 border-neutral-800 rounded-sm">
                            <DropdownMenuItem onClick={() => api.post(`/devices/${d.id}/heartbeat`).then(load)}>
                              Forçar heartbeat
                            </DropdownMenuItem>
                            <DropdownMenuSeparator className="bg-neutral-800" />
                            <DropdownMenuItem onClick={() => handleDelete(d.id)} className="text-amber-500">
                              Remover
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {items.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-neutral-500 font-mono text-xs py-12">— sem dispositivos —</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={!!openConnect} onOpenChange={(o) => !o && setOpenConnect(null)}>
        <DialogContent className="bg-neutral-950 border-neutral-800 rounded-sm max-w-5xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <span className="pulse-dot bg-green-500 text-green-500" />
              Sessão · {openConnect?.device.name}
            </DialogTitle>
            <DialogDescription className="text-neutral-500 font-mono text-xs">
              {openConnect?.device.rust_id} · {openConnect?.device.ip} · operador: {openConnect?.session.operator_email}
            </DialogDescription>
          </DialogHeader>
          {openConnect && (
            <RemoteControl
              device={openConnect.device}
              session={openConnect.session}
              onEnd={async () => {
                await api.post(`/sessions/${openConnect.session.id}/end`);
                toast.success("Sessão encerrada");
                setOpenConnect(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
