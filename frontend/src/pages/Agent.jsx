import { useEffect, useState } from "react";
import Topbar from "@/components/Topbar";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Copy, Download, Terminal, MonitorSmartphone, Server, AppWindow } from "lucide-react";
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
  const installerUrl = `${BACKEND_URL}/api/agent/installer/windows`;
  const clientUrl = `${BACKEND_URL}/api/agent/client`;
  const guiInstallerUrl = `${BACKEND_URL}/api/agent/installer/windows-gui`;
  const runCmd = selectedToken
    ? `python vremote_agent.py --server ${BACKEND_URL} --token ${selectedToken}`
    : `python vremote_agent.py --server ${BACKEND_URL} --token <SEU_TOKEN>`;

  const copy = (v) => {
    navigator.clipboard.writeText(v);
    toast.success("Copiado");
  };

  // One-line installer (admin PowerShell):
  const oneLineToken = selectedToken || "<SEU_TOKEN>";
  const winInstallerCmd = `Set-ExecutionPolicy -Scope Process Bypass -Force
iwr -useb "${installerUrl}" -OutFile "$env:TEMP\\install_vremote.ps1"
& "$env:TEMP\\install_vremote.ps1" -Server "${BACKEND_URL}" -Token "${oneLineToken}"`;
  const winGuiInstallerCmd = `Set-ExecutionPolicy -Scope Process Bypass -Force
iwr -useb "${guiInstallerUrl}" -OutFile "$env:TEMP\\install_vremote_gui.ps1"
& "$env:TEMP\\install_vremote_gui.ps1" -Server "${BACKEND_URL}"`;
  const exeGuiCmd = `pip install pyinstaller
pyinstaller --onefile --noconsole --name VRemoteClient vremote_client.py
# Resultado: dist\\VRemoteClient.exe (sem console, com janela GUI)
# Distribua este .exe único — não precisa instalar Python no PC do usuário final.`;

  const winCmd = `# 1) Baixe o script
Invoke-WebRequest -Uri "${downloadUrl}" -OutFile "vremote_agent.py"

# 2) Instale dependências (controle remoto requer pyautogui, streaming requer websocket-client)
pip install requests mss pillow pyautogui websocket-client

# 3) Execute (substitua o token)
${runCmd}`;

  const linuxCmd = `# 1) Baixe o script
curl -O ${downloadUrl}

# 2) Instale dependências
pip3 install requests mss pillow pyautogui websocket-client

# 3) Execute
${runCmd}`;

  const exeCmd = `pip install pyinstaller
pyinstaller --onefile --noconsole --name vremote-agent vremote_agent.py
# Resultado em: dist\\vremote-agent.exe
# Você pode então distribuir o .exe único e rodar:
.\\dist\\vremote-agent.exe --server ${BACKEND_URL} --token ${oneLineToken}`;

  return (
    <>
      <Topbar title="Agente" subtitle="// instalar em dispositivos remotos" />
      <div className="p-6 space-y-6 max-w-5xl" data-testid="agent-page">
        <Tabs defaultValue="client">
          <TabsList className="bg-neutral-900 border border-neutral-800 rounded-sm">
            <TabsTrigger value="client" data-testid="tab-client">
              <AppWindow className="w-3.5 h-3.5 mr-2" /> Cliente com Interface (recomendado)
            </TabsTrigger>
            <TabsTrigger value="headless" data-testid="tab-headless">
              <Terminal className="w-3.5 h-3.5 mr-2" /> Agente Headless (servidores)
            </TabsTrigger>
          </TabsList>

          {/* =============== TAB 1: GUI CLIENT =============== */}
          <TabsContent value="client" className="mt-4 space-y-6">
            <Card className="bg-neutral-900 border-neutral-800 rounded-sm p-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 border border-green-500/40 bg-green-500/10 flex items-center justify-center shrink-0">
                  <AppWindow className="w-5 h-5 text-green-500" />
                </div>
                <div>
                  <h2 className="text-xl font-medium">Cliente Windows com Interface</h2>
                  <p className="text-sm text-neutral-400 mt-1">
                    Aplicação desktop estilo <strong>RustDesk</strong>: o usuário final abre, vê o
                    <span className="text-green-500"> ID de 9 dígitos</span> e compartilha com o suporte.
                    Cola o token <strong>uma única vez</strong> no wizard inicial.
                  </p>
                </div>
              </div>
            </Card>

            {/* Step 1 - one-line installer */}
            <Card className="bg-neutral-900 border-neutral-800 rounded-sm p-6">
              <div className="label-eyebrow mb-2">Passo 1 · Instalação automática (PowerShell)</div>
              <p className="text-sm text-neutral-400 mb-3">
                Abra o <strong>PowerShell como Administrador</strong> no computador do usuário e cole:
              </p>
              <div className="flex items-center justify-between mb-2">
                <Badge variant="outline" className="rounded-sm border-green-500/40 text-green-500 text-[10px] font-mono">
                  RECOMENDADO
                </Badge>
                <Button size="sm" variant="ghost" onClick={() => copy(winGuiInstallerCmd)} className="h-7 text-xs text-neutral-400 hover:text-green-500" data-testid="cmd-win-gui-installer">
                  <Copy className="w-3 h-3 mr-1" /> Copiar
                </Button>
              </div>
              <pre className="bg-neutral-950 border border-neutral-800 rounded-sm p-4 text-[12px] font-mono leading-relaxed text-green-400 overflow-x-auto whitespace-pre-wrap">
                {winGuiInstallerCmd}
              </pre>
              <p className="text-xs text-neutral-500 mt-3">
                Cria atalho <span className="font-mono text-neutral-300">"V-remote Client"</span> na Área de Trabalho + Menu Iniciar.
                Na primeira execução, o usuário cola o token e clica em <span className="text-green-500">Conectar ao painel</span> — o ID aparece imediatamente.
              </p>
            </Card>

            {/* Step 2 - the user flow */}
            <Card className="bg-neutral-900 border-neutral-800 rounded-sm p-6">
              <div className="label-eyebrow mb-2">Passo 2 · O que o usuário vê</div>
              <ol className="text-sm text-neutral-300 space-y-2 list-decimal list-inside mt-2">
                <li>Janela escura com <strong>"Seu ID: 621 507 365"</strong> em destaque + botão <strong>Copiar</strong>.</li>
                <li>Status <span className="text-green-500">● Online</span>, servidor, último heartbeat.</li>
                <li>Switch <strong>"Permitir conexões remotas"</strong> que o usuário pode pausar quando quiser.</li>
                <li>Log de atividade recente (todo comando recebido aparece aqui — transparência).</li>
              </ol>
            </Card>

            {/* Step 3 - download + exe build */}
            <Card className="bg-neutral-900 border-neutral-800 rounded-sm p-6">
              <div className="label-eyebrow mb-3">Passo 3 · Distribuir como .exe único (sem Python)</div>
              <p className="text-sm text-neutral-400 mb-3">
                Numa máquina Windows com Python, rode estes comandos para gerar
                <span className="font-mono text-neutral-300"> V-remoteClient.exe</span> standalone.
                Depois é só compartilhar o .exe — usuário final não precisa instalar Python.
              </p>
              <div className="flex items-center gap-3 flex-wrap mb-3">
                <Button asChild className="bg-green-500 hover:bg-green-400 text-black rounded-sm" data-testid="download-client-btn">
                  <a href={clientUrl} download>
                    <Download className="w-4 h-4 mr-2" /> vremote_client.py
                  </a>
                </Button>
                <code className="text-xs font-mono text-neutral-400 bg-neutral-950 border border-neutral-800 px-3 py-2 rounded-sm">
                  {clientUrl}
                </code>
              </div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-neutral-50">Comandos PyInstaller (Windows)</span>
                <Button size="sm" variant="ghost" onClick={() => copy(exeGuiCmd)} className="h-7 text-xs text-neutral-400 hover:text-green-500" data-testid="cmd-exe-gui">
                  <Copy className="w-3 h-3 mr-1" /> Copiar
                </Button>
              </div>
              <pre className="bg-neutral-950 border border-neutral-800 rounded-sm p-4 text-[12px] font-mono leading-relaxed text-neutral-300 overflow-x-auto whitespace-pre-wrap">
                {exeGuiCmd}
              </pre>
              <p className="text-xs text-amber-500 font-mono mt-3">
                ⚠ O .exe não é assinado — Windows SmartScreen pode pedir confirmação. Para uso em produção,
                assine com um certificado de code-signing.
              </p>
            </Card>
          </TabsContent>

          {/* =============== TAB 2: HEADLESS AGENT =============== */}
          <TabsContent value="headless" className="mt-4 space-y-6">
            <Card className="bg-neutral-900 border-neutral-800 rounded-sm p-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 border border-amber-500/40 bg-amber-500/10 flex items-center justify-center shrink-0">
                  <Terminal className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <h2 className="text-xl font-medium">Agente headless (sem interface)</h2>
                  <p className="text-sm text-neutral-400 mt-1">
                    Roda como serviço/scheduled-task — ideal para <strong>servidores</strong> sem
                    usuário logado. Instalação 1-click via PowerShell registra Scheduled Task.
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
                <Download className="w-4 h-4 mr-2" /> vremote_agent.py
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
            {/* Windows one-line installer (recommended) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium text-neutral-50 flex items-center gap-2">
                  Windows · instalação automática
                  <Badge variant="outline" className="rounded-sm border-green-500/40 text-green-500 text-[10px] font-mono">RECOMENDADO</Badge>
                </div>
                <Button size="sm" variant="ghost" onClick={() => copy(winInstallerCmd)} className="h-7 text-xs text-neutral-400 hover:text-green-500" data-testid="cmd-win-installer">
                  <Copy className="w-3 h-3 mr-1" /> Copiar
                </Button>
              </div>
              <p className="text-xs text-neutral-500 mb-2">
                Abra o <strong>PowerShell como Administrador</strong> e cole. O script baixa o agente, instala as dependências e registra uma <strong>Tarefa Agendada</strong> que inicia o agente automaticamente no logon (igual ao RustDesk).
              </p>
              <pre className="bg-neutral-950 border border-neutral-800 rounded-sm p-4 text-[12px] font-mono leading-relaxed text-green-400 overflow-x-auto whitespace-pre-wrap">
                {winInstallerCmd}
              </pre>
            </div>

            <CmdBlock title="Windows · manual (sem instalador)" cmd={winCmd} onCopy={() => copy(winCmd)} testid="cmd-windows" />
            <CmdBlock title="Linux / macOS" cmd={linuxCmd} onCopy={() => copy(linuxCmd)} testid="cmd-linux" />

            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium text-neutral-50">Gerar executável único (.exe)</div>
                <Button size="sm" variant="ghost" onClick={() => copy(exeCmd)} className="h-7 text-xs text-neutral-400 hover:text-green-500" data-testid="cmd-exe">
                  <Copy className="w-3 h-3 mr-1" /> Copiar
                </Button>
              </div>
              <p className="text-xs text-neutral-500 mb-2">
                Rode estes comandos numa máquina Windows com Python instalado. Gera <span className="font-mono text-neutral-300">vremote-agent.exe</span> standalone (sem console, sem dependências externas) que você pode distribuir.
              </p>
              <pre className="bg-neutral-950 border border-neutral-800 rounded-sm p-4 text-[12px] font-mono leading-relaxed text-neutral-300 overflow-x-auto whitespace-pre-wrap">
                {exeCmd}
              </pre>
            </div>
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
                <li>O painel devolve um <span className="font-mono">device_id</span> + <span className="font-mono">agent_secret</span> e salva em <span className="font-mono">~/.vremote_agent.json</span>.</li>
                <li>A máquina aparece em <a href="/devices" className="text-green-500 underline">Dispositivos</a> com status <span className="text-green-500 font-mono">online</span>.</li>
                <li>Clique em <strong>Conectar</strong>. O agente começa a enviar screenshots a cada 3s e recebe comandos (mouse/teclado) que o painel envia.</li>
                <li>Click esquerdo, click direito, duplo clique, scroll, digitar texto, <span className="font-mono">Ctrl+Alt+Del</span>, <span className="font-mono">Win</span>, <span className="font-mono">Esc</span> — tudo funciona se o agente tiver <span className="font-mono text-green-500">pyautogui</span> instalado.</li>
                <li>Sem <span className="font-mono">pyautogui</span> o modo cai para <strong>view-only</strong>.</li>
              </ol>
              <p className="text-xs text-amber-500 font-mono pt-2">
                ⚠ As screenshots e comandos passam pelo servidor. Use apenas em máquinas que você tem autorização para acessar e controlar.
              </p>
            </div>
          </div>
        </Card>
          </TabsContent>
        </Tabs>
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
