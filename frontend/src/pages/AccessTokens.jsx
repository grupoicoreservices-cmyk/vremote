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
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Copy, Ban } from "lucide-react";
import { toast } from "sonner";

export default function AccessTokens() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ label: "", expires_in_days: 30 });
  const [revealed, setRevealed] = useState(null);

  const load = useCallback(async () => {
    const { data } = await api.get("/access-tokens");
    setItems(data);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.post("/access-tokens", { ...form, expires_in_days: Number(form.expires_in_days) });
      toast.success("Token gerado");
      setRevealed(data.token);
      setOpen(false);
      setForm({ label: "", expires_in_days: 30 });
      load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e?.response?.data?.detail));
    }
  };

  const handleRevoke = async (id) => {
    await api.delete(`/access-tokens/${id}`);
    toast.success("Token revogado");
    load();
  };

  const copy = (v) => {
    navigator.clipboard.writeText(v);
    toast.success("Copiado");
  };

  return (
    <>
      <Topbar
        title="Tokens de Acesso"
        subtitle="// registro de agentes"
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-green-500 hover:bg-green-400 text-black rounded-sm" data-testid="new-token-btn">
                <Plus className="w-4 h-4 mr-1" /> Gerar token
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-neutral-950 border-neutral-800 rounded-sm">
              <DialogHeader><DialogTitle>Novo token</DialogTitle></DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2">
                  <Label className="label-eyebrow">Rótulo</Label>
                  <Input required value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="agent-prod-fleet" className="bg-neutral-900 border-neutral-800 font-mono" data-testid="token-label-input" />
                </div>
                <div className="space-y-2">
                  <Label className="label-eyebrow">Validade (dias)</Label>
                  <Input type="number" min="1" value={form.expires_in_days} onChange={(e) => setForm({ ...form, expires_in_days: e.target.value })} className="bg-neutral-900 border-neutral-800 font-mono w-32" data-testid="token-expiry-input" />
                </div>
                <DialogFooter>
                  <Button type="submit" className="bg-green-500 hover:bg-green-400 text-black rounded-sm" data-testid="token-submit">Gerar</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="p-6 space-y-4" data-testid="tokens-page">
        {revealed && (
          <div className="border border-green-500/40 bg-green-500/5 p-4 rounded-sm">
            <div className="label-eyebrow text-green-500 mb-2">// copie agora — não será mostrado novamente</div>
            <div className="flex items-center gap-2">
              <code className="font-mono text-sm break-all text-green-400">{revealed}</code>
              <Button size="icon" variant="ghost" onClick={() => copy(revealed)} className="h-8 w-8 shrink-0">
                <Copy className="w-4 h-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setRevealed(null)} className="ml-auto text-neutral-500">Ocultar</Button>
            </div>
          </div>
        )}

        <div className="border border-neutral-800 bg-neutral-900 rounded-sm">
          <Table>
            <TableHeader>
              <TableRow className="border-neutral-800 hover:bg-transparent">
                <TableHead className="label-eyebrow">Rótulo</TableHead>
                <TableHead className="label-eyebrow">Token</TableHead>
                <TableHead className="label-eyebrow">Criado</TableHead>
                <TableHead className="label-eyebrow">Expira</TableHead>
                <TableHead className="label-eyebrow">Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((t) => (
                <TableRow key={t.id} className="border-neutral-800 hover:bg-neutral-800/50">
                  <TableCell>{t.label}</TableCell>
                  <TableCell className="font-mono text-xs text-neutral-400">
                    {t.token.slice(0, 14)}…{t.token.slice(-6)}
                  </TableCell>
                  <TableCell className="font-mono text-[11px] text-neutral-500">{new Date(t.created_at).toLocaleString("pt-BR")}</TableCell>
                  <TableCell className="font-mono text-[11px] text-neutral-500">{new Date(t.expires_at).toLocaleDateString("pt-BR")}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`rounded-sm font-mono text-[10px] uppercase ${t.revoked ? "border-amber-500/40 text-amber-500" : "border-green-500/40 text-green-500"}`}>
                      {t.revoked ? "Revogado" : "Ativo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {!t.revoked && (
                      <Button size="icon" variant="ghost" onClick={() => handleRevoke(t.id)} className="h-8 w-8 text-amber-500 hover:bg-amber-500/10" data-testid={`revoke-${t.id}`}>
                        <Ban className="w-4 h-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {items.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-neutral-500 font-mono text-xs py-10">— sem tokens —</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </>
  );
}
