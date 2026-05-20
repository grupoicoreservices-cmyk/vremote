import { useEffect, useState } from "react";
import Topbar from "@/components/Topbar";
import { api, formatApiErrorDetail } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/context/AuthContext";
import { Save } from "lucide-react";
import { toast } from "sonner";

export default function Settings() {
  const { user } = useAuth();
  const [cfg, setCfg] = useState(null);

  useEffect(() => {
    api.get("/server-config").then((r) => setCfg(r.data));
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.patch("/server-config", {
        relay_server: cfg.relay_server,
        rendezvous_server: cfg.rendezvous_server,
        api_url: cfg.api_url,
        key: cfg.key,
        allow_registration: cfg.allow_registration,
      });
      setCfg(data);
      toast.success("Configurações salvas");
    } catch (e) {
      toast.error(formatApiErrorDetail(e?.response?.data?.detail));
    }
  };

  if (!cfg) return null;
  const readOnly = user?.role !== "admin";

  return (
    <>
      <Topbar title="Configurações" subtitle="// servidor & relay" />
      <div className="p-6" data-testid="settings-page">
        <Card className="bg-neutral-900 border-neutral-800 rounded-sm max-w-3xl">
          <div className="px-6 py-5 border-b border-neutral-800">
            <div className="label-eyebrow">Servidor</div>
            <h3 className="text-lg mt-1">Endpoints do RustAdmin</h3>
            <p className="text-xs text-neutral-500 mt-1">Configure os endereços de relay/rendezvous que os agentes utilizam.</p>
          </div>
          <form onSubmit={handleSave} className="p-6 space-y-5">
            <Field label="Relay Server" value={cfg.relay_server} onChange={(v) => setCfg({ ...cfg, relay_server: v })} testid="cfg-relay" readOnly={readOnly} />
            <Field label="Rendezvous Server" value={cfg.rendezvous_server} onChange={(v) => setCfg({ ...cfg, rendezvous_server: v })} testid="cfg-rendezvous" readOnly={readOnly} />
            <Field label="API URL" value={cfg.api_url} onChange={(v) => setCfg({ ...cfg, api_url: v })} testid="cfg-api-url" readOnly={readOnly} />
            <Field label="Chave do Servidor" value={cfg.key} onChange={(v) => setCfg({ ...cfg, key: v })} testid="cfg-key" mono readOnly={readOnly} />
            <div className="flex items-center justify-between border border-neutral-800 px-4 py-3">
              <div>
                <Label className="label-eyebrow">Permitir registro de novos agentes</Label>
                <p className="text-xs text-neutral-500 mt-1">Quando desativado, somente agentes com token podem registrar-se.</p>
              </div>
              <Switch checked={cfg.allow_registration} onCheckedChange={(v) => setCfg({ ...cfg, allow_registration: v })} disabled={readOnly} data-testid="cfg-allow-registration" />
            </div>
            {!readOnly && (
              <div className="pt-2">
                <Button type="submit" className="bg-green-500 hover:bg-green-400 text-black rounded-sm" data-testid="save-config-btn">
                  <Save className="w-4 h-4 mr-2" /> Salvar
                </Button>
              </div>
            )}
            {readOnly && (
              <p className="text-xs text-amber-500 font-mono">// somente admins podem editar</p>
            )}
          </form>
        </Card>
      </div>
    </>
  );
}

function Field({ label, value, onChange, testid, mono, readOnly }) {
  return (
    <div className="space-y-2">
      <Label className="label-eyebrow">{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        className={`bg-neutral-950 border-neutral-800 ${mono ? "font-mono" : ""}`}
        data-testid={testid}
      />
    </div>
  );
}
