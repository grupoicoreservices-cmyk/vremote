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
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function Users() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: "", name: "", password: "", role: "operator" });

  const load = useCallback(async () => {
    const { data } = await api.get("/users");
    setItems(data);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await api.post("/users", form);
      toast.success("Operador criado");
      setOpen(false);
      setForm({ email: "", name: "", password: "", role: "operator" });
      load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e?.response?.data?.detail));
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/users/${id}`);
      toast.success("Usuário removido");
      load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e?.response?.data?.detail));
    }
  };

  return (
    <>
      <Topbar
        title="Usuários"
        subtitle="// operadores & administradores"
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-green-500 hover:bg-green-400 text-black rounded-sm" data-testid="add-user-btn">
                <Plus className="w-4 h-4 mr-1" /> Novo
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-neutral-950 border-neutral-800 rounded-sm">
              <DialogHeader>
                <DialogTitle>Novo operador</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2">
                  <Label className="label-eyebrow">Nome</Label>
                  <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="bg-neutral-900 border-neutral-800" data-testid="user-name-input" />
                </div>
                <div className="space-y-2">
                  <Label className="label-eyebrow">E-mail</Label>
                  <Input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="bg-neutral-900 border-neutral-800 font-mono" data-testid="user-email-input" />
                </div>
                <div className="space-y-2">
                  <Label className="label-eyebrow">Senha</Label>
                  <Input required type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="bg-neutral-900 border-neutral-800 font-mono" data-testid="user-password-input" />
                </div>
                <div className="space-y-2">
                  <Label className="label-eyebrow">Papel</Label>
                  <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                    <SelectTrigger className="bg-neutral-900 border-neutral-800" data-testid="user-role-select"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-neutral-950 border-neutral-800">
                      <SelectItem value="operator">Operador</SelectItem>
                      <SelectItem value="admin">Administrador</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <DialogFooter>
                  <Button type="submit" className="bg-green-500 hover:bg-green-400 text-black rounded-sm" data-testid="user-create-submit">Criar</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="p-6" data-testid="users-page">
        <div className="border border-neutral-800 bg-neutral-900 rounded-sm">
          <Table>
            <TableHeader>
              <TableRow className="border-neutral-800 hover:bg-transparent">
                <TableHead className="label-eyebrow">Nome</TableHead>
                <TableHead className="label-eyebrow">E-mail</TableHead>
                <TableHead className="label-eyebrow">Papel</TableHead>
                <TableHead className="label-eyebrow">Criado</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((u) => (
                <TableRow key={u.id} className="border-neutral-800 hover:bg-neutral-800/50">
                  <TableCell className="text-sm">{u.name}</TableCell>
                  <TableCell className="font-mono text-xs">{u.email}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`rounded-sm font-mono text-[10px] uppercase ${u.role === "admin" ? "border-green-500/40 text-green-500" : "border-neutral-700 text-neutral-400"}`}>
                      {u.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-[11px] text-neutral-500">{new Date(u.created_at).toLocaleString("pt-BR")}</TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => handleDelete(u.id)} className="h-8 w-8 text-amber-500 hover:bg-amber-500/10" data-testid={`delete-user-${u.id}`}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </>
  );
}
