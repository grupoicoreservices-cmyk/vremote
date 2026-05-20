#!/usr/bin/env python3
"""
V-remote Client (GUI)
======================
Aplicação desktop estilo RustDesk: o usuário abre, vê o ID dele e o
suporte usa esse ID para conectar.

Mostra:
  - Big "Seu ID: 123 456 789" com botão Copiar
  - Status online/offline, servidor, último heartbeat
  - Toggle "Permitir conexões remotas"
  - Log das últimas atividades
  - Configurações (trocar servidor/token, resetar)

Funciona em Windows, macOS e Linux. Tkinter é stdlib.

Requisitos:
    pip install requests
    # opcional:
    pip install mss pillow pyautogui

Uso:
    python vremote_client.py [--server URL]
"""

import argparse
import base64
import io
import json
import os
import platform
import socket
import sys
import threading
import time
import tkinter as tk
from pathlib import Path
from tkinter import font as tkfont
from tkinter import messagebox, ttk

import requests

# ---- Optional capabilities --------------------------------------------------
try:
    import mss  # type: ignore
    from PIL import Image  # type: ignore
    HAS_SCREENSHOT = True
except ImportError:
    HAS_SCREENSHOT = False

try:
    import pyautogui  # type: ignore
    pyautogui.FAILSAFE = False
    HAS_CONTROL = True
except Exception:
    HAS_CONTROL = False

CONFIG_FILE = Path.home() / ".vremote_agent.json"

# ---- Theme ------------------------------------------------------------------
BG = "#0a0a0a"
SURFACE = "#171717"
BORDER = "#262626"
GREEN = "#22c55e"
AMBER = "#f59e0b"
RED = "#ef4444"
TEXT = "#fafafa"
MUTED = "#a3a3a3"

# ---- API helpers ------------------------------------------------------------
def detect_os() -> str:
    s = platform.system().lower()
    if s.startswith("win"):
        return "windows"
    if s.startswith("darwin"):
        return "macos"
    return "linux"


def local_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def screen_size():
    if HAS_CONTROL:
        try:
            return pyautogui.size()
        except Exception:
            pass
    if HAS_SCREENSHOT:
        try:
            with mss.mss() as sct:
                m = sct.monitors[1]
                return (m["width"], m["height"])
        except Exception:
            pass
    return (1920, 1080)


def format_id(rid: str) -> str:
    s = "".join(c for c in str(rid) if c.isdigit())
    return " ".join([s[i:i+3] for i in range(0, len(s), 3)])


# ---- Main App ---------------------------------------------------------------
class VRemoteClient:
    def __init__(self, server_default: str | None = None):
        self.cfg = self._load_config()
        self.server_default = server_default
        self.enabled = True
        self.activity = []
        self.last_command_at = 0.0
        self.threads_started = False

        self.root = tk.Tk()
        self.root.title("V-remote Client")
        self.root.configure(bg=BG)
        self.root.geometry("460x680")
        self.root.minsize(440, 600)
        try:
            # icon via emoji char fallback
            self.root.iconname("V-remote")
        except Exception:
            pass

        self.font_h1 = tkfont.Font(family="Segoe UI", size=18, weight="bold")
        self.font_h2 = tkfont.Font(family="Segoe UI", size=11)
        self.font_body = tkfont.Font(family="Segoe UI", size=10)
        self.font_id = tkfont.Font(family="Consolas", size=28, weight="bold")
        self.font_small = tkfont.Font(family="Consolas", size=9)
        self.font_label = tkfont.Font(family="Segoe UI", size=8, weight="bold")

        if self.cfg and self.cfg.get("device_id"):
            self._build_main()
            self._start_threads()
        else:
            self._build_setup()

    # ---- Config -------------------------------------------------------------
    def _load_config(self):
        if CONFIG_FILE.exists():
            try:
                return json.loads(CONFIG_FILE.read_text())
            except Exception:
                return None
        return None

    def _save_config(self):
        if self.cfg:
            CONFIG_FILE.write_text(json.dumps(self.cfg, indent=2))
            try:
                os.chmod(CONFIG_FILE, 0o600)
            except Exception:
                pass

    # ---- UI building --------------------------------------------------------
    def _clear_root(self):
        for w in self.root.winfo_children():
            w.destroy()

    def _build_setup(self):
        self._clear_root()
        frame = tk.Frame(self.root, bg=BG, padx=30, pady=30)
        frame.pack(fill="both", expand=True)

        tk.Label(frame, text="V-remote", fg=TEXT, bg=BG, font=self.font_h1).pack(anchor="w")
        tk.Label(frame, text="Configurar acesso ao painel", fg=MUTED, bg=BG, font=self.font_h2).pack(anchor="w", pady=(0, 24))

        tk.Label(frame, text="SERVIDOR (URL)", fg=MUTED, bg=BG, font=self.font_label).pack(anchor="w")
        self.server_entry = tk.Entry(frame, bg=SURFACE, fg=TEXT, insertbackground=TEXT,
                                     relief="flat", font=self.font_body, highlightthickness=1,
                                     highlightbackground=BORDER, highlightcolor=GREEN)
        self.server_entry.pack(fill="x", pady=(4, 16), ipady=8)
        if self.server_default:
            self.server_entry.insert(0, self.server_default)
        else:
            self.server_entry.insert(0, "https://")

        tk.Label(frame, text="TOKEN DE ACESSO", fg=MUTED, bg=BG, font=self.font_label).pack(anchor="w")
        self.token_entry = tk.Entry(frame, bg=SURFACE, fg=TEXT, insertbackground=TEXT,
                                    relief="flat", font=self.font_body, highlightthickness=1,
                                    highlightbackground=BORDER, highlightcolor=GREEN)
        self.token_entry.pack(fill="x", pady=(4, 8), ipady=8)
        self.token_entry.insert(0, "rdpro_")

        tk.Label(frame, text="Solicite o token ao administrador do painel.",
                 fg=MUTED, bg=BG, font=self.font_small).pack(anchor="w", pady=(0, 20))

        self.setup_status = tk.Label(frame, text="", fg=AMBER, bg=BG, font=self.font_small)
        self.setup_status.pack(anchor="w")

        btn = tk.Button(frame, text="CONECTAR AO PAINEL", bg=GREEN, fg="#000000",
                        activebackground="#16a34a", activeforeground="#000000",
                        relief="flat", font=("Segoe UI", 10, "bold"),
                        command=self._do_register, cursor="hand2", padx=16, pady=10)
        btn.pack(fill="x", pady=(12, 0))

        tk.Label(frame, text=f"v1.0  ·  {platform.system()}  ·  Tela {screen_size()[0]}x{screen_size()[1]}",
                 fg="#525252", bg=BG, font=self.font_small).pack(side="bottom", anchor="w", pady=(20, 0))

    def _do_register(self):
        server = self.server_entry.get().strip().rstrip("/")
        token = self.token_entry.get().strip()
        if not server.startswith("http") or not token.startswith("rdpro_"):
            self.setup_status.config(text="URL inválida ou token deve começar com 'rdpro_'.")
            return
        self.setup_status.config(text="Registrando…", fg=MUTED)
        self.root.update_idletasks()
        sw, sh = screen_size()
        try:
            r = requests.post(
                f"{server}/api/agent/register",
                json={
                    "token": token,
                    "hostname": socket.gethostname(),
                    "os": detect_os(),
                    "ip": local_ip(),
                    "version": "client-gui-1.0",
                    "screen_width": sw,
                    "screen_height": sh,
                    "can_control": HAS_CONTROL,
                },
                timeout=15,
            )
            if r.status_code != 200:
                self.setup_status.config(text=f"Falha: {r.status_code} {r.text}", fg=RED)
                return
            data = r.json()
            self.cfg = {
                "server": server,
                "device_id": data["device_id"],
                "rust_id": data["rust_id"],
                "agent_secret": data["agent_secret"],
                "name": data["name"],
            }
            self._save_config()
            self._build_main()
            self._start_threads()
        except Exception as e:
            self.setup_status.config(text=f"Erro de conexão: {e}", fg=RED)

    def _build_main(self):
        self._clear_root()
        cfg = self.cfg
        outer = tk.Frame(self.root, bg=BG, padx=24, pady=24)
        outer.pack(fill="both", expand=True)

        # Header
        head = tk.Frame(outer, bg=BG)
        head.pack(fill="x")
        tk.Label(head, text="V-remote", fg=TEXT, bg=BG, font=self.font_h1).pack(side="left")
        tk.Label(head, text=f"v1.0", fg=MUTED, bg=BG, font=self.font_small).pack(side="right")

        tk.Label(outer, text="Compartilhe seu ID com o suporte para conectar.",
                 fg=MUTED, bg=BG, font=self.font_h2).pack(anchor="w", pady=(0, 18))

        # ID card
        card = tk.Frame(outer, bg=SURFACE, highlightthickness=1,
                        highlightbackground=BORDER)
        card.pack(fill="x", pady=(0, 16))
        inner = tk.Frame(card, bg=SURFACE, padx=20, pady=18)
        inner.pack(fill="both", expand=True)
        tk.Label(inner, text="SEU ID", fg=MUTED, bg=SURFACE, font=self.font_label).pack(anchor="w")
        id_row = tk.Frame(inner, bg=SURFACE)
        id_row.pack(fill="x", pady=(6, 4))
        self.id_label = tk.Label(id_row, text=format_id(cfg["rust_id"]), fg=GREEN, bg=SURFACE, font=self.font_id)
        self.id_label.pack(side="left")
        copy_btn = tk.Button(id_row, text="COPIAR", bg=BG, fg=GREEN, relief="flat",
                             activebackground=BORDER, activeforeground=GREEN,
                             font=("Segoe UI", 8, "bold"), padx=12, pady=6, cursor="hand2",
                             command=self._copy_id, highlightthickness=1,
                             highlightbackground=GREEN)
        copy_btn.pack(side="right")
        tk.Label(inner, text=f"Nome: {cfg['name']}", fg=MUTED, bg=SURFACE, font=self.font_small).pack(anchor="w", pady=(8, 0))

        # Status row
        status_card = tk.Frame(outer, bg=SURFACE, highlightthickness=1, highlightbackground=BORDER)
        status_card.pack(fill="x", pady=(0, 12))
        sc = tk.Frame(status_card, bg=SURFACE, padx=16, pady=12)
        sc.pack(fill="x")
        self.status_dot = tk.Label(sc, text="●", fg=GREEN, bg=SURFACE, font=("Segoe UI", 12))
        self.status_dot.grid(row=0, column=0, sticky="w")
        self.status_text = tk.Label(sc, text="Online", fg=TEXT, bg=SURFACE, font=self.font_body)
        self.status_text.grid(row=0, column=1, sticky="w", padx=(6, 0))
        tk.Label(sc, text="SERVIDOR", fg=MUTED, bg=SURFACE, font=self.font_label).grid(row=1, column=0, columnspan=2, sticky="w", pady=(8, 0))
        tk.Label(sc, text=cfg["server"], fg=TEXT, bg=SURFACE, font=self.font_small, wraplength=380, justify="left").grid(row=2, column=0, columnspan=2, sticky="w")
        tk.Label(sc, text="ÚLTIMA ATIVIDADE", fg=MUTED, bg=SURFACE, font=self.font_label).grid(row=3, column=0, columnspan=2, sticky="w", pady=(8, 0))
        self.last_seen_label = tk.Label(sc, text="—", fg=TEXT, bg=SURFACE, font=self.font_small)
        self.last_seen_label.grid(row=4, column=0, columnspan=2, sticky="w")

        # Capabilities
        cap = tk.Frame(outer, bg=BG)
        cap.pack(fill="x", pady=(0, 14))
        self._cap_badge(cap, "CONTROLE", HAS_CONTROL)
        self._cap_badge(cap, "TELA", HAS_SCREENSHOT)

        # Toggle
        toggle_frame = tk.Frame(outer, bg=SURFACE, highlightthickness=1, highlightbackground=BORDER)
        toggle_frame.pack(fill="x", pady=(0, 14))
        tf = tk.Frame(toggle_frame, bg=SURFACE, padx=16, pady=12)
        tf.pack(fill="x")
        tk.Label(tf, text="Permitir conexões remotas", fg=TEXT, bg=SURFACE, font=self.font_body).pack(side="left")
        self.enabled_var = tk.BooleanVar(value=True)
        self.toggle_btn = tk.Button(tf, text="● ATIVO", bg=GREEN, fg="#000000", relief="flat",
                                    font=("Segoe UI", 8, "bold"), padx=10, pady=5, cursor="hand2",
                                    command=self._toggle_enabled)
        self.toggle_btn.pack(side="right")

        # Activity log
        tk.Label(outer, text="ATIVIDADE RECENTE", fg=MUTED, bg=BG, font=self.font_label).pack(anchor="w", pady=(4, 6))
        log_frame = tk.Frame(outer, bg=SURFACE, highlightthickness=1, highlightbackground=BORDER)
        log_frame.pack(fill="both", expand=True)
        self.log_text = tk.Text(log_frame, bg=SURFACE, fg=TEXT, font=self.font_small,
                                relief="flat", padx=12, pady=10, height=8, highlightthickness=0,
                                wrap="word", state="disabled", cursor="arrow")
        self.log_text.pack(fill="both", expand=True)

        # Footer buttons
        foot = tk.Frame(outer, bg=BG)
        foot.pack(fill="x", pady=(14, 0))
        tk.Button(foot, text="Resetar", bg=BG, fg=AMBER, relief="flat",
                  activebackground=BORDER, activeforeground=AMBER,
                  font=("Segoe UI", 9, "bold"), padx=12, pady=8, cursor="hand2",
                  command=self._reset, highlightthickness=1, highlightbackground=BORDER).pack(side="left")
        tk.Button(foot, text="Sair", bg=BG, fg=MUTED, relief="flat",
                  activebackground=BORDER, activeforeground=TEXT,
                  font=("Segoe UI", 9, "bold"), padx=12, pady=8, cursor="hand2",
                  command=self.root.destroy, highlightthickness=1, highlightbackground=BORDER).pack(side="right")

        self._log("Cliente iniciado.")

    def _cap_badge(self, parent, label, ok):
        color = GREEN if ok else "#525252"
        b = tk.Frame(parent, bg=BG)
        b.pack(side="left", padx=(0, 8))
        tk.Label(b, text=("● " + label + " OK" if ok else "○ " + label + " OFF"),
                 fg=color, bg=BG, font=("Consolas", 8, "bold")).pack()

    # ---- Actions ------------------------------------------------------------
    def _copy_id(self):
        self.root.clipboard_clear()
        self.root.clipboard_append(self.cfg["rust_id"])
        self._log(f"ID {self.cfg['rust_id']} copiado.")

    def _toggle_enabled(self):
        self.enabled = not self.enabled
        if self.enabled:
            self.toggle_btn.config(text="● ATIVO", bg=GREEN, fg="#000000")
            self._log("Conexões habilitadas.")
        else:
            self.toggle_btn.config(text="○ PAUSADO", bg=BG, fg=AMBER)
            self._log("Conexões pausadas. Heartbeats continuam para manter o status.")

    def _reset(self):
        if not messagebox.askyesno("Resetar", "Isto apaga a configuração local e exige novo token. Continuar?"):
            return
        try:
            if CONFIG_FILE.exists():
                CONFIG_FILE.unlink()
        except Exception:
            pass
        self.cfg = None
        self._build_setup()

    def _log(self, msg: str):
        t = time.strftime("%H:%M:%S")
        line = f"[{t}] {msg}\n"
        self.activity.append(line)
        if len(self.activity) > 200:
            self.activity = self.activity[-200:]
        try:
            self.log_text.config(state="normal")
            self.log_text.insert("end", line)
            self.log_text.see("end")
            self.log_text.config(state="disabled")
        except Exception:
            pass

    def _set_status(self, online: bool):
        if online:
            self.status_dot.config(fg=GREEN)
            self.status_text.config(text="Online")
        else:
            self.status_dot.config(fg=AMBER)
            self.status_text.config(text="Reconectando…")

    # ---- Background threads -------------------------------------------------
    def _start_threads(self):
        if self.threads_started:
            return
        self.threads_started = True
        threading.Thread(target=self._heartbeat_loop, daemon=True).start()
        threading.Thread(target=self._screenshot_loop, daemon=True).start()
        threading.Thread(target=self._command_loop, daemon=True).start()

    def _heartbeat_loop(self):
        while True:
            ok = False
            try:
                sw, sh = screen_size()
                r = requests.post(
                    f"{self.cfg['server']}/api/agent/heartbeat",
                    json={
                        "device_id": self.cfg["device_id"],
                        "agent_secret": self.cfg["agent_secret"],
                        "screen_width": sw,
                        "screen_height": sh,
                        "can_control": HAS_CONTROL and self.enabled,
                    },
                    timeout=10,
                )
                ok = r.status_code == 200
            except Exception:
                ok = False
            self.root.after(0, lambda: self._set_status(ok))
            self.root.after(0, lambda: self.last_seen_label.config(text=time.strftime("%H:%M:%S")))
            time.sleep(15)

    def _screenshot_loop(self):
        while True:
            if not self.enabled or not HAS_SCREENSHOT:
                time.sleep(10)
                continue
            active = (time.time() - self.last_command_at) < 20
            interval = 3 if active else 30
            try:
                with mss.mss() as sct:
                    mon = sct.monitors[1]
                    shot = sct.grab(mon)
                    img = Image.frombytes("RGB", shot.size, shot.bgra, "raw", "BGRX")
                    img.thumbnail((1280, 720))
                    buf = io.BytesIO()
                    img.save(buf, format="JPEG", quality=65)
                    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
                sw, sh = screen_size()
                requests.post(
                    f"{self.cfg['server']}/api/agent/screenshot",
                    json={
                        "device_id": self.cfg["device_id"],
                        "agent_secret": self.cfg["agent_secret"],
                        "image_base64": b64,
                        "screen_width": sw,
                        "screen_height": sh,
                    },
                    timeout=20,
                )
            except Exception:
                pass
            time.sleep(interval)

    def _command_loop(self):
        while True:
            if not self.enabled:
                time.sleep(2)
                continue
            try:
                r = requests.post(
                    f"{self.cfg['server']}/api/agent/commands/poll",
                    json={"device_id": self.cfg["device_id"], "agent_secret": self.cfg["agent_secret"]},
                    timeout=10,
                )
                cmds = r.json().get("commands", []) if r.status_code == 200 else []
                for c in cmds:
                    ok, err = self._execute_command(c)
                    self.last_command_at = time.time()
                    try:
                        requests.post(
                            f"{self.cfg['server']}/api/agent/commands/ack",
                            json={
                                "device_id": self.cfg["device_id"],
                                "agent_secret": self.cfg["agent_secret"],
                                "cmd_id": c["id"],
                                "ok": ok,
                                "error": err,
                            },
                            timeout=10,
                        )
                    except Exception:
                        pass
                    msg = f"Comando {c['action']} " + ("ok" if ok else f"falhou: {err}")
                    self.root.after(0, lambda m=msg: self._log(m))
            except Exception:
                pass
            time.sleep(0.8)

    def _execute_command(self, cmd):
        if not HAS_CONTROL:
            return False, "pyautogui não disponível"
        action = cmd["action"]
        p = cmd.get("params", {})
        sw, sh = screen_size()
        def xy():
            return int((p.get("x") or 0) * sw), int((p.get("y") or 0) * sh)
        try:
            if action == "mouse_move":
                pyautogui.moveTo(*xy(), duration=0)
            elif action == "mouse_click":
                pyautogui.click(*xy(), button=p.get("button", "left"))
            elif action == "mouse_dblclick":
                pyautogui.doubleClick(*xy(), button=p.get("button", "left"))
            elif action == "mouse_down":
                pyautogui.mouseDown(*xy(), button=p.get("button", "left"))
            elif action == "mouse_up":
                pyautogui.mouseUp(*xy(), button=p.get("button", "left"))
            elif action == "scroll":
                pyautogui.scroll(int(p.get("amount", 0)))
            elif action == "key_type":
                pyautogui.typewrite(p.get("text", ""), interval=0.01)
            elif action == "key_press":
                for k in (p.get("keys") or []):
                    pyautogui.press(k)
            elif action == "hotkey":
                keys = p.get("keys") or []
                if keys:
                    pyautogui.hotkey(*keys)
            else:
                return False, f"ação desconhecida: {action}"
            return True, None
        except Exception as e:
            return False, str(e)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--server", help="URL do painel (preenche no wizard)")
    args = parser.parse_args()
    app = VRemoteClient(server_default=args.server)
    app.root.mainloop()


if __name__ == "__main__":
    main()
