import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Send, MousePointerClick, Keyboard, Power, Zap, Circle, StopCircle } from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const FALLBACK_REFRESH_MS = 1500;

// fallback mock for devices without an agent screenshot
const SCREEN_MOCK = "https://static.prod-images.emergentagent.com/jobs/539a4407-7ab7-4ef7-aae7-fc6df8facf83/images/c17222935a415163ef8706df95796192d9cd0349e0697954644b12d5afb97e31.png";

function pickMime() {
  const candidates = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  for (const m of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) return m;
  }
  return null;
}

function formatMs(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export default function RemoteControl({ device, session, onEnd }) {
  const [screenshot, setScreenshot] = useState(null);
  const [keyInput, setKeyInput] = useState("");
  const [wsConnected, setWsConnected] = useState(false);
  const [fps, setFps] = useState(0);
  const [recording, setRecording] = useState(false);
  const [recordedMs, setRecordedMs] = useState(0);
  const imgRef = useRef(null);
  const wsRef = useRef(null);
  const frameCountRef = useRef(0);
  const fpsTimerRef = useRef(null);
  const canvasRef = useRef(null);
  const offscreenImgRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const recordStartRef = useRef(0);
  const recordTimerRef = useRef(null);

  const canControl = wsConnected || !!screenshot?.can_control;
  const hasAgent = !!screenshot?.image_base64;

  // WebSocket live stream
  useEffect(() => {
    const wsUrl = BACKEND_URL.replace(/^http/, "ws") + `/api/sessions/${session.id}/ws`;
    let ws;
    let pollId = null;
    let closed = false;

    const startFallbackPolling = () => {
      const fetchShot = async () => {
        try {
          const { data } = await api.get(`/devices/${device.id}/screenshot`);
          setScreenshot(data);
        } catch (_) {}
      };
      fetchShot();
      pollId = setInterval(fetchShot, FALLBACK_REFRESH_MS);
    };

    try {
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        // FPS counter
        fpsTimerRef.current = setInterval(() => {
          setFps(frameCountRef.current);
          frameCountRef.current = 0;
        }, 1000);
      };

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.type === "frame") {
            frameCountRef.current += 1;
            setScreenshot({
              image_base64: msg.image_base64,
              screen_width: msg.screen_width,
              screen_height: msg.screen_height,
              can_control: true,
              captured_at: new Date().toISOString(),
            });
            // Always draw to canvas so recording can capture
            drawFrameToCanvas(msg.image_base64);
          }
        } catch (_) {}
      };

      ws.onerror = () => {
        if (!closed) {
          setWsConnected(false);
          startFallbackPolling();
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        if (!closed && !pollId) startFallbackPolling();
      };
    } catch (_) {
      startFallbackPolling();
    }

    return () => {
      closed = true;
      if (fpsTimerRef.current) clearInterval(fpsTimerRef.current);
      if (pollId) clearInterval(pollId);
      try { ws && ws.close(); } catch (_) {}
      wsRef.current = null;
    };
  }, [device.id, session.id]);

  const sendCmd = (payload) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: "cmd", action: payload.action, params: payload }));
        return;
      } catch (_) {}
    }
    // fallback to HTTP
    api.post(`/sessions/${session.id}/command`, payload).catch(() => {
      toast.error("Falha ao enviar comando");
    });
  };

  // ---- Local Recording (MediaRecorder + canvas) -------------------------
  const drawFrameToCanvas = (b64) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!offscreenImgRef.current) offscreenImgRef.current = new Image();
    const img = offscreenImgRef.current;
    img.onload = () => {
      if (canvas.width !== img.naturalWidth || canvas.height !== img.naturalHeight) {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
      }
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
    };
    img.src = `data:image/jpeg;base64,${b64}`;
  };

  const startRecording = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!screenshot?.image_base64) {
      toast.error("Aguarde o primeiro frame chegar.");
      return;
    }
    // ensure canvas has dimensions (first frame already drew)
    if (!canvas.width) {
      canvas.width = screenshot.screen_width || 1280;
      canvas.height = screenshot.screen_height || 720;
    }
    const mime = pickMime();
    if (!mime) {
      toast.error("Navegador não suporta gravação (MediaRecorder/WebM).");
      return;
    }
    try {
      const stream = canvas.captureStream(15);
      const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 1_500_000 });
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        a.href = url;
        a.download = `vremote_${device.name.replace(/[^a-z0-9-_]/gi, "_")}_${stamp}.webm`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
        const sizeMB = (blob.size / (1024 * 1024)).toFixed(1);
        toast.success(`Gravação salva no Downloads (${sizeMB} MB)`);
        setRecording(false);
        setRecordedMs(0);
        if (recordTimerRef.current) {
          clearInterval(recordTimerRef.current);
          recordTimerRef.current = null;
        }
      };
      rec.start(1000);
      recorderRef.current = rec;
      recordStartRef.current = Date.now();
      setRecording(true);
      setRecordedMs(0);
      recordTimerRef.current = setInterval(
        () => setRecordedMs(Date.now() - recordStartRef.current),
        500,
      );
      toast.success("Gravando sessão localmente…");
    } catch (e) {
      toast.error("Falha ao iniciar gravação: " + e.message);
    }
  };

  const stopRecording = () => {
    const rec = recorderRef.current;
    if (rec && rec.state === "recording") {
      rec.stop();
    }
  };

  // Stop recording on unmount (saves the file)
  useEffect(() => {
    return () => {
      const rec = recorderRef.current;
      if (rec && rec.state === "recording") {
        try { rec.stop(); } catch (_) {}
      }
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    };
  }, []);

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
    <div className="flex flex-col h-full gap-3" data-testid="remote-control">
      {/* Status bar */}
      <div className="flex items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-3">
          {wsConnected ? (
            <Badge variant="outline" className="rounded-sm border-green-500/40 text-green-500 text-[10px]">
              <Zap className="w-3 h-3 mr-1" /> LIVE · {fps} FPS
            </Badge>
          ) : hasAgent ? (
            <Badge variant="outline" className="rounded-sm border-amber-500/40 text-amber-500 text-[10px]">
              <span className="pulse-dot bg-amber-500 text-amber-500 !w-1.5 !h-1.5 mr-1.5" /> HTTP fallback (lento)
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
          {recording && (
            <Badge variant="outline" className="rounded-sm border-red-500/60 text-red-500 text-[10px] animate-pulse">
              <Circle className="w-2.5 h-2.5 mr-1 fill-red-500" /> REC {formatMs(recordedMs)}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!recording ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={startRecording}
              disabled={!hasAgent}
              className="h-7 text-xs text-neutral-300 hover:text-red-500 border border-neutral-800 rounded-sm"
              data-testid="start-record-btn"
            >
              <Circle className="w-3 h-3 mr-1.5" /> Gravar
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              onClick={stopRecording}
              className="h-7 text-xs text-red-500 hover:bg-red-500/10 border border-red-500/40 rounded-sm"
              data-testid="stop-record-btn"
            >
              <StopCircle className="w-3 h-3 mr-1.5" /> Parar & Salvar
            </Button>
          )}
          {screenshot?.captured_at && (
            <span className="text-neutral-500 font-mono">{new Date(screenshot.captured_at).toLocaleTimeString("pt-BR")}</span>
          )}
        </div>
      </div>

      {/* Screen */}
      <div
        className="relative border border-neutral-800 rounded-sm overflow-hidden bg-black cursor-default flex-1 min-h-0 flex items-center justify-center"
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
          className="max-w-full max-h-full w-auto h-auto object-contain select-none"
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

      {/* Hidden canvas used by MediaRecorder for local recording */}
      <canvas ref={canvasRef} style={{ display: "none" }} />
    </div>
  );
}
