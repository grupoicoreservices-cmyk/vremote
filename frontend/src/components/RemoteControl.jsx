import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Send, MousePointerClick, Keyboard, Power } from "lucide-react";
import { toast } from "sonner";

const REFRESH_MS = 1500;

// fallback mock for devices without an agent screenshot
const SCREEN_MOCK = "https://static.prod-images.emergentagent.com/jobs/539a4407-7ab7-4ef7-aae7-fc6df8facf83/images/c17222935a415163ef8706df95796192d9cd0349e0697954644b12d5afb97e31.png";

export default function RemoteControl({ device, session, onEnd }) {
  const [screenshot, setScreenshot] = useState(null);
  const [keyInput, setKeyInput] = useState("");
  const imgRef = useRef(null);

  const canControl = !!screenshot?.can_control;
  const hasAgent = !!screenshot?.image_base64;

  // Poll screenshot
  useEffect(() => {
    let mounted = true;
    const fetchShot = async () => {
      try {
        const { data } = await api.get(`/devices/${device.id}/screenshot`);
        if (mounted) setScreenshot(data);
      } catch (_) {}
    };
    fetchShot();
    const id = setInterval(fetchShot, REFRESH_MS);
    return () => { mounted = false; clearInterval(id); };
  }, [device.id]);

  const sendCmd = async (payload) => {
    try {
      await api.post(`/sessions/${session.id}/command`, payload);
    } catch (e) {
      toast.error("Falha ao enviar comando");
    }
  };

  const getRelCoords = (e) => {
    const img = imgRef.current;
    if (!img) return { x: 0, y: 0 };
    const rect = img.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
  };

  const onClick = (e) => {
    if (!canControl) return;
    const { x, y } = getRelCoords(e);
    sendCmd({ action: "mouse_click", x, y, button: "left" });
  };

  const onDoubleClick = (e) => {
    if (!canControl) return;
    const { x, y } = getRelCoords(e);
    sendCmd({ action: "mouse_dblclick", x, y, button: "left" });
  };

  const onContextMenu = (e) => {
    e.preventDefault();
    if (!canControl) return;
    const { x, y } = getRelCoords(e);
    sendCmd({ action: "mouse_click", x, y, button: "right" });
  };

  const onWheel = (e) => {
    if (!canControl) return;
    e.preventDefault();
    sendCmd({ action: "scroll", amount: e.deltaY > 0 ? -3 : 3 });
  };

  const sendText = () => {
    if (!canControl || !keyInput) return;
    sendCmd({ action: "key_type", text: keyInput });
    setKeyInput("");
  };

  const sendKey = (key) => {
    if (!canControl) return;
    sendCmd({ action: "key_press", keys: [key] });
  };

  const sendHotkey = (...keys) => {
    if (!canControl) return;
    sendCmd({ action: "hotkey", keys });
  };

  const imgSrc = hasAgent
    ? `data:image/jpeg;base64,${screenshot.image_base64}`
    : SCREEN_MOCK;

  return (
    <div className="space-y-3" data-testid="remote-control">
      {/* Status bar */}
      <div className="flex items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-3">
          {hasAgent ? (
            <Badge variant="outline" className="rounded-sm border-green-500/40 text-green-500 text-[10px]">
              <span className="pulse-dot bg-green-500 text-green-500 !w-1.5 !h-1.5 mr-1.5" /> AO VIVO · agente
            </Badge>
          ) : (
            <Badge variant="outline" className="rounded-sm border-amber-500/40 text-amber-500 text-[10px]">
              DEMO · sem agente conectado
            </Badge>
          )}
          {canControl ? (
            <Badge variant="outline" className="rounded-sm border-cyan-500/40 text-cyan-400 text-[10px]">
              <MousePointerClick className="w-3 h-3 mr-1" /> Controle habilitado
            </Badge>
          ) : hasAgent ? (
            <Badge variant="outline" className="rounded-sm border-neutral-700 text-neutral-400 text-[10px]">
              view-only (instale pyautogui)
            </Badge>
          ) : null}
          {screenshot?.screen_width && (
            <span className="text-neutral-500">
              {screenshot.screen_width}×{screenshot.screen_height}
            </span>
          )}
        </div>
        {screenshot?.captured_at && (
          <span className="text-neutral-500">{new Date(screenshot.captured_at).toLocaleTimeString("pt-BR")}</span>
        )}
      </div>

      {/* Screen */}
      <div
        className={`relative border border-neutral-800 rounded-sm overflow-hidden bg-black ${canControl ? "cursor-crosshair" : "cursor-default"}`}
        onWheel={onWheel}
      >
        <img
          ref={imgRef}
          src={imgSrc}
          alt="remote screen"
          draggable={false}
          onClick={onClick}
          onDoubleClick={onDoubleClick}
          onContextMenu={onContextMenu}
          className="w-full h-auto select-none"
          data-testid={hasAgent ? "live-screenshot-real" : "live-screenshot-mock"}
        />
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-3">
        {/* Text input */}
        <div className="flex gap-2">
          <Input
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendText()}
            disabled={!canControl}
            placeholder={canControl ? "Digite e pressione Enter ou clique Enviar…" : "Sem controle disponível"}
            className="bg-neutral-900 border-neutral-800 font-mono"
            data-testid="remote-key-input"
          />
          <Button
            type="button"
            onClick={sendText}
            disabled={!canControl}
            className="bg-green-500 hover:bg-green-400 text-black rounded-sm"
            data-testid="remote-send-text-btn"
          >
            <Send className="w-4 h-4 mr-1" /> Enviar
          </Button>
        </div>

        {/* Special keys */}
        <div className="flex flex-wrap gap-1.5">
          {["enter", "tab", "esc", "backspace", "delete", "win"].map((k) => (
            <Button
              key={k}
              type="button"
              size="sm"
              variant="ghost"
              disabled={!canControl}
              onClick={() => sendKey(k)}
              className="h-8 text-xs font-mono border border-neutral-800 hover:bg-neutral-800 rounded-sm uppercase"
              data-testid={`remote-key-${k}`}
            >
              {k}
            </Button>
          ))}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={!canControl}
            onClick={() => sendHotkey("ctrl", "alt", "del")}
            className="h-8 text-xs font-mono border border-amber-500/30 text-amber-500 hover:bg-amber-500/10 rounded-sm uppercase"
            data-testid="remote-key-cad"
          >
            <Keyboard className="w-3 h-3 mr-1" /> CTRL+ALT+DEL
          </Button>
        </div>
      </div>

      <div className="flex justify-end pt-2 border-t border-neutral-800">
        <Button
          variant="outline"
          className="border-amber-500/40 text-amber-500 hover:bg-amber-500/10 rounded-sm"
          onClick={onEnd}
          data-testid="session-end-btn"
        >
          <Power className="w-4 h-4 mr-2" /> Encerrar sessão
        </Button>
      </div>
    </div>
  );
}
