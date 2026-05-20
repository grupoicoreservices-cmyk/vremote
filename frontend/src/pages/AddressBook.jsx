import { useEffect, useState, useCallback } from "react";
import Topbar from "@/components/Topbar";
import { api, formatApiErrorDetail } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
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
import { Plus, BookUser, X } from "lucide-react";
import { toast } from "sonner";

export default function AddressBook() {
  const [items, setItems] = useState([]);
  const [devices, setDevices] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ label: "", device_id: "", group: "Favoritos" });

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([api.get("/address-book"), api.get("/devices")]);
    setItems(a.data);
    setDevices(b.data);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async (e) => {
    e.preventDefault();
    try {
      await api.post("/address-book", form);
      toast.success("Adicionado ao address book");
      setOpen(false);
      setForm({ label: "", device_id: "", group: "Favoritos" });
      load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e?.response?.data?.detail));
    }
  };

  const handleDel = async (id) => {
    await api.delete(`/address-book/${id}`);
    load();
  };

  // group entries
  const groups = items.reduce((acc, e) => {
    (acc[e.group] = acc[e.group] || []).push(e);
    return acc;
  }, {});

  return (
    <>
      <Topbar
        title="Address Book"
        subtitle="// contatos & dispositivos favoritos"
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-green-500 hover:bg-green-400 text-black rounded-sm" data-testid="add-entry-btn">
                <Plus className="w-4 h-4 mr-1" /> Adicionar
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-neutral-950 border-neutral-800 rounded-sm">
              <DialogHeader><DialogTitle>Nova entrada</DialogTitle></DialogHeader>
              <form onSubmit={handleAdd} className="space-y-4">
                <div className="space-y-2">
                  <Label className="label-eyebrow">Rótulo</Label>
                  <Input required value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} className="bg-neutral-900 border-neutral-800" data-testid="entry-label-input" />
                </div>
                <div className="space-y-2">
                  <Label className="label-eyebrow">Dispositivo</Label>
                  <Select value={form.device_id} onValueChange={(v) => setForm({ ...form, device_id: v })}>
                    <SelectTrigger className="bg-neutral-900 border-neutral-800" data-testid="entry-device-select">
                      <SelectValue placeholder="Selecione…" />
                    </SelectTrigger>
                    <SelectContent className="bg-neutral-950 border-neutral-800 max-h-80">
                      {devices.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          <span className="font-mono text-green-500 mr-2">{d.rust_id}</span> {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="label-eyebrow">Grupo</Label>
                  <Input value={form.group} onChange={(e) => setForm({ ...form, group: e.target.value })} className="bg-neutral-900 border-neutral-800" data-testid="entry-group-input" />
                </div>
                <DialogFooter>
                  <Button type="submit" className="bg-green-500 hover:bg-green-400 text-black rounded-sm" data-testid="entry-submit-btn">Adicionar</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="p-6 space-y-6" data-testid="address-book-page">
        {Object.keys(groups).length === 0 && (
          <div className="border border-dashed border-neutral-800 p-12 text-center">
            <BookUser className="w-8 h-8 text-neutral-700 mx-auto mb-3" />
            <p className="text-sm text-neutral-500">Address book vazio. Adicione seus dispositivos favoritos.</p>
          </div>
        )}
        {Object.entries(groups).map(([group, entries]) => (
          <div key={group}>
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-sm font-medium">{group}</h3>
              <span className="label-eyebrow">{entries.length}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {entries.map((e) => (
                <Card key={e.id} className="bg-neutral-900 border-neutral-800 rounded-sm p-4 hover:bg-neutral-800/40 transition-colors group relative">
                  <button onClick={() => handleDel(e.id)} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-amber-500" data-testid={`del-entry-${e.id}`}>
                    <X className="w-4 h-4" />
                  </button>
                  <div className="text-xs label-eyebrow mb-2">{e.device_os}</div>
                  <div className="text-base font-medium truncate">{e.label}</div>
                  <div className="text-xs text-neutral-500 truncate">{e.device_name}</div>
                  <div className="mt-3 font-mono text-green-500 text-sm tracking-wider">{e.rust_id}</div>
                  <Badge variant="outline" className="mt-2 rounded-sm border-neutral-700 text-neutral-400 text-[10px] font-mono">
                    {e.group}
                  </Badge>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
