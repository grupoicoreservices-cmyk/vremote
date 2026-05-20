import { useEffect, useState } from "react";
import Topbar from "@/components/Topbar";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, Download, Terminal, MonitorSmartphone, Server } from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export default function Agent() {
  const [tokens, setTokens] = useState([]);
  const [selectedToken, setSelectedToken] = useState("");

  useEffect(() => {
    api.get("/access-tokens").then((r) => {
      const active = r.data.filter((t) => !t.revoked);
      setTokens(active);
      if (active.length && !selectedToken) setSelectedToken(active[0].token);
    }).catch(() => {});
    // eslint-disable-next-line
  }, []);

  const downloadUrl = `${BACKEND_URL}/api/agent/script`;
  const runCmd = selectedToken
    ? `python rustadmin_agent.py --server ${BACKEND_URL} --token ${selectedToken}`
    : `python rustadmin_agent.py --server ${BACKEND_URL} --token <SEU_TOKEN>`;

  const copy = (v) => {
    navigator.clipboard.writeText(v);
    toast.success("Copiado");
  };

  const winCmd = `# 1) Baixe o script
Invoke-WebRequest -Uri "${downloadUrl}" -OutFile "rustadmin_agent.py"

# 2) Instale dependências
pip install requests mss pillow

# 3) Execute (substitua o token)
${runCmd}`;

  const linuxCmd = `# 1) Baixe o script
curl -O ${downloadUrl}

# 2) Instale dependências
pip3 install requests mss pillow

# 3) Execute
${runCmd}`;

  return (
    <>
      <Topbar title="Agente" subtitle="// instalar em dispositivos remotos" />
      <div className="p-6 space-y-6 max-w-5xl" data-testid="agent-page">
        <Card className="bg-neutral-900 border-neutral-800 rounded-sm p-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 border border-green-500/40 bg-green-500/10 flex items-center justify-center shrink-0">
              <MonitorSmartphone className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <h2 className="text-xl font-medium">Como instalar o RustAdmin Agent</h2>
              <p className="text-sm text-neutral-400 mt-1">
                O agente é um script Python leve que registra a máquina no painel,
                envia <span className="font-mono">heartbeats</span> a cada 15s e (opcional) screenshots a cada 30s.
                Compatível com Windows, macOS e Linux.
              </p>
            </div>
          </div>
        </Card>

        {/* Token selector */}
        <Card className="bg-neutral-900 border-neutral-800 rounded-sm p-6">
          <div className="label-eyebrow mb-2">Passo 1 · Token de acesso</div>
          <p className="text-sm text-neutral-400 mb-3">
            {tokens.length === 0 ? (
              <>Você ainda não tem tokens ativos.{" "}
                <a href="/access-tokens" className="text-green-500 underline">Gere um token</a> antes de continuar.
              </>
            ) : (
              <>Selecione qual token de acesso o agente vai usar para se auto-registrar:</>
            )}
          </p>
          {tokens.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {tokens.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedToken(t.token)}
                  data-testid={`token-pick-${t.id}`}
                  className={`px-3 py-2 border text-xs font-mono rounded-sm transition-colors ${
                    selectedToken === t.token
                      ? "border-green-500 bg-green-500/10 text-green-500"
                      : "border-neutral-800 hover:bg-neutral-800/50 text-neutral-300"
                  }`}
                >
                  {t.label} · {t.token.slice(0, 10)}…
                </button>
              ))}
            </div>
          )}
        </Card>

        {/* Download */}
        <Card className="bg-neutral-900 border-neutral-800 rounded-sm p-6">
          <div className="label-eyebrow mb-3">Passo 2 · Baixar o script</div>
          <div className="flex items-center gap-3 flex-wrap">
            <Button
              asChild
              className="bg-green-500 hover:bg-green-400 text-black rounded-sm"
              data-testid="download-agent-btn"
            >
              <a href={downloadUrl} download>
                <Download className="w-4 h-4 mr-2" /> rustadmin_agent.py
              </a>
            </Button>
            <code className="text-xs font-mono text-neutral-400 bg-neutral-950 border border-neutral-800 px-3 py-2 rounded-sm">
              {downloadUrl}
            </code>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => copy(downloadUrl)}
              className="h-9 w-9"
              data-testid="copy-download-url-btn"
            >
              <Copy className="w-4 h-4" />
            </Button>
          </div>
          <p className="text-xs text-neutral-500 mt-3 font-mono">
            Requisitos: Python 3.10+ · pacotes <span className="text-green-500">requests mss pillow</span>
          </p>
        </Card>

        {/* OS specific */}
        <Card className="bg-neutral-900 border-neutral-800 rounded-sm">
          <div className="px-6 py-4 border-b border-neutral-800 flex items-center gap-3">
            <Terminal className="w-4 h-4 text-green-500" />
            <div className="label-eyebrow">Passo 3 · Executar</div>
            <Badge variant="outline" className="ml-auto rounded-sm border-neutral-700 text-neutral-400 text-[10px] font-mono">
              copie & cole
            </Badge>
          </div>

          <div className="p-6 space-y-6">
            <CmdBlock title="Windows (PowerShell)" cmd={winCmd} onCopy={() => copy(winCmd)} testid="cmd-windows" />
            <CmdBlock title="Linux / macOS" cmd={linuxCmd} onCopy={() => copy(linuxCmd)} testid="cmd-linux" />
          </div>
        </Card>

        {/* What happens */}
        <Card className="bg-neutral-900 border-neutral-800 rounded-sm p-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 border border-amber-500/40 bg-amber-500/10 flex items-center justify-center shrink-0">
              <Server className="w-5 h-5 text-amber-500" />
            </div>
            <div className="text-sm text-neutral-300 space-y-2 leading-relaxed">
              <p><strong className="text-neutral-50">O que acontece quando você executa:</strong></p>
              <ol className="list-decimal list-inside space-y-1 text-neutral-400">
                <li>O agente envia <span className="font-mono text-green-500">POST /api/agent/register</span> com o token.</li>
                <li>O painel devolve um <span className="font-mono">device_id</span> + <span className="font-mono">agent_secret</span> e salva em <span className="font-mono">~/.rustadmin_agent.json</span>.</li>
                <li>A máquina aparece em <a href="/devices" className="text-green-500 underline">Dispositivos</a> com status <span className="text-green-500 font-mono">online</span>.</li>
                <li>A cada 30s, o agente envia uma screenshot. Clique em <strong>Conectar</strong> no dispositivo para ver em tempo quase real.</li>
                <li>Pressione <span className="font-mono">Ctrl+C</span> para parar. O status muda para <span className="text-neutral-400 font-mono">offline</span> em ~1 min.</li>
              </ol>
              <p className="text-xs text-amber-500 font-mono pt-2">
                ⚠ As screenshots ficam armazenadas no servidor. Use apenas em máquinas que você tem autorização para acessar.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}

function CmdBlock({ title, cmd, onCopy, testid }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium text-neutral-200">{title}</div>
        <Button size="sm" variant="ghost" onClick={onCopy} className="h-7 text-xs text-neutral-400 hover:text-green-500" data-testid={testid}>
          <Copy className="w-3 h-3 mr-1" /> Copiar
        </Button>
      </div>
      <pre className="bg-neutral-950 border border-neutral-800 rounded-sm p-4 text-[12px] font-mono leading-relaxed text-neutral-300 overflow-x-auto whitespace-pre-wrap">
        {cmd}
      </pre>
    </div>
  );
}
