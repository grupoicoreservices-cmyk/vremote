import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api, formatApiErrorDetail } from "@/lib/api";
import RemoteControl from "@/components/RemoteControl";
import { Button } from "@/components/ui/button";
import { Terminal, X, Maximize2, Minimize2 } from "lucide-react";
import { toast } from "sonner";

export default function RemoteSession() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    api.get(`/sessions/${sessionId}`)
      .then((r) => setData(r.data))
      .catch((e) => setError(formatApiErrorDetail(e?.response?.data?.detail) || "Sessão não encontrada"));
  }, [sessionId]);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const toggleFs = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (_) {}
  };

  const endSession = async () => {
    try {
      await api.post(`/sessions/${sessionId}/end`);
    } catch (_) {}
    toast.success("Sessão encerrada");
    // Try closing the tab (works only if opened via window.open)
    setTimeout(() => {
      window.close();
      // Fallback if can't close
      navigate("/devices");
    }, 300);
  };

  if (error) {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-300 flex flex-col items-center justify-center p-8 gap-4">
        <Terminal className="w-10 h-10 text-amber-500" />
        <div className="text-lg">Não foi possível abrir a sessão</div>
        <div className="text-sm font-mono text-neutral-500">{error}</div>
        <Button onClick={() => navigate("/devices")} className="bg-green-500 hover:bg-green-400 text-black rounded-sm">
          Voltar para Dispositivos
        </Button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-500 flex items-center justify-center font-mono text-xs">
        carregando sessão…
      </div>
    );
  }

  const { session, device } = data;

  return (
    <div className="h-screen bg-neutral-950 text-neutral-100 flex flex-col overflow-hidden" data-testid="remote-session-page">
      {/* Top bar */}
      <header className="h-12 border-b border-neutral-900 bg-neutral-950 px-4 flex items-center gap-4 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-green-500/10 border border-green-500/40 flex items-center justify-center">
            <Terminal className="w-3.5 h-3.5 text-green-500" />
          </div>
          <span className="text-sm font-medium">V-remote</span>
        </div>
        <div className="h-6 w-px bg-neutral-800" />
        <div className="flex items-center gap-3 min-w-0">
          <span className="pulse-dot bg-green-500 text-green-500" />
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">{device.name}</div>
            <div className="text-[10px] font-mono text-neutral-500 truncate">
              {device.rust_id} · {device.ip} · {device.os}
            </div>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleFs}
            className="h-8 text-xs text-neutral-300 hover:text-green-500 hover:bg-neutral-900"
            data-testid="toggle-fullscreen-btn"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5 mr-1.5" /> : <Maximize2 className="w-3.5 h-3.5 mr-1.5" />}
            {isFullscreen ? "Sair tela cheia" : "Tela cheia"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={endSession}
            className="h-8 text-xs border border-amber-500/30 text-amber-500 hover:bg-amber-500/10 rounded-sm"
            data-testid="end-and-close-btn"
          >
            <X className="w-3.5 h-3.5 mr-1.5" /> Encerrar & Fechar
          </Button>
        </div>
      </header>

      {/* Remote view */}
      <main className="flex-1 min-h-0 p-3 flex flex-col">
        <RemoteControl device={device} session={session} onEnd={endSession} />
      </main>
    </div>
  );
}
