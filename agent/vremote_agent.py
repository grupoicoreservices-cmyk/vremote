#!/usr/bin/env python3
"""
V-remote Agent (Python)
========================
Agente leve para registrar uma máquina no painel V-remote, enviar
heartbeats + screenshots e RECEBER comandos remotos (mouse/teclado)
via long-polling.

Requisitos:
    pip install requests
    # opcional (screenshots):
    pip install mss pillow
    # opcional (controle remoto):
    pip install pyautogui
    # Windows: rode "python -m pip install pywin32" se quiser instalar como serviço

Uso:
    python vremote_agent.py --server https://seu-painel.exemplo.com --token rdpro_xxx

A primeira execução cria ~/.vremote_agent.json com as credenciais
do device. Execuções seguintes só precisam do arquivo de config.
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
from pathlib import Path

import requests

# ---- Optional capabilities --------------------------------------------------
HAS_SCREENSHOT = False
HAS_CONTROL = False
try:
    import mss  # type: ignore
    from PIL import Image  # type: ignore
    HAS_SCREENSHOT = True
except ImportError:
    pass

try:
    import pyautogui  # type: ignore
    pyautogui.FAILSAFE = False
    HAS_CONTROL = True
except Exception:
    pass

CONFIG_FILE = Path.home() / ".vremote_agent.json"
HEARTBEAT_INTERVAL = 15
SCREENSHOT_INTERVAL = 3        # active streaming when control session is open
SCREENSHOT_IDLE_INTERVAL = 30  # when no commands recently
COMMAND_POLL_INTERVAL = 0.8

STREAMING_WINDOW_SEC = 20      # stay in "active stream" for N seconds after last command


# ---- Utility ----------------------------------------------------------------
def detect_os() -> str:
    s = platform.system().lower()
    if s.startswith("win"):
        return "windows"
    if s.startswith("darwin"):
        return "macos"
    if s.startswith("linux"):
        return "linux"
    return "linux"


def get_local_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def get_screen_size():
    if HAS_CONTROL:
        try:
            return pyautogui.size()
        except Exception:
            pass
    if HAS_SCREENSHOT:
        try:
            with mss.mss() as sct:
                mon = sct.monitors[1]
                return (mon["width"], mon["height"])
        except Exception:
            pass
    return (1920, 1080)


def load_config():
    if CONFIG_FILE.exists():
        try:
            return json.loads(CONFIG_FILE.read_text())
        except Exception:
            return None
    return None


def save_config(cfg: dict):
    CONFIG_FILE.write_text(json.dumps(cfg, indent=2))
    try:
        os.chmod(CONFIG_FILE, 0o600)
    except Exception:
        pass


# ---- API calls --------------------------------------------------------------
def register(server: str, token: str) -> dict:
    sw, sh = get_screen_size()
    payload = {
        "token": token,
        "hostname": socket.gethostname(),
        "os": detect_os(),
        "ip": get_local_ip(),
        "version": "agent-py-2.0",
        "screen_width": sw,
        "screen_height": sh,
        "can_control": HAS_CONTROL,
    }
    r = requests.post(f"{server}/api/agent/register", json=payload, timeout=15)
    if r.status_code != 200:
        raise SystemExit(f"[ERRO] Falha ao registrar: {r.status_code} {r.text}")
    data = r.json()
    cfg = {
        "server": server,
        "device_id": data["device_id"],
        "rust_id": data["rust_id"],
        "agent_secret": data["agent_secret"],
        "name": data["name"],
    }
    save_config(cfg)
    print(f"[OK] Registrado. RustDesk ID = {data['rust_id']}")
    print(f"[OK] Tela: {sw}x{sh} | Controle: {HAS_CONTROL} | Screenshot: {HAS_SCREENSHOT}")
    return cfg


def heartbeat(cfg: dict) -> bool:
    sw, sh = get_screen_size()
    try:
        r = requests.post(
            f"{cfg['server']}/api/agent/heartbeat",
            json={
                "device_id": cfg["device_id"],
                "agent_secret": cfg["agent_secret"],
                "screen_width": sw,
                "screen_height": sh,
                "can_control": HAS_CONTROL,
            },
            timeout=10,
        )
        return r.status_code == 200
    except Exception as e:
        print(f"[WARN] heartbeat falhou: {e}")
        return False


def capture_screenshot_b64():
    if not HAS_SCREENSHOT:
        return None
    try:
        with mss.mss() as sct:
            mon = sct.monitors[1]
            shot = sct.grab(mon)
            img = Image.frombytes("RGB", shot.size, shot.bgra, "raw", "BGRX")
            img.thumbnail((1280, 720))
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=65)
            return base64.b64encode(buf.getvalue()).decode("ascii")
    except Exception as e:
        print(f"[WARN] screenshot falhou: {e}")
        return None


def send_screenshot(cfg: dict, b64: str) -> bool:
    sw, sh = get_screen_size()
    try:
        r = requests.post(
            f"{cfg['server']}/api/agent/screenshot",
            json={
                "device_id": cfg["device_id"],
                "agent_secret": cfg["agent_secret"],
                "image_base64": b64,
                "screen_width": sw,
                "screen_height": sh,
            },
            timeout=20,
        )
        return r.status_code == 200
    except Exception as e:
        print(f"[WARN] envio de screenshot falhou: {e}")
        return False


def poll_commands(cfg: dict):
    try:
        r = requests.post(
            f"{cfg['server']}/api/agent/commands/poll",
            json={"device_id": cfg["device_id"], "agent_secret": cfg["agent_secret"]},
            timeout=10,
        )
        if r.status_code == 200:
            return r.json().get("commands", [])
    except Exception as e:
        print(f"[WARN] poll falhou: {e}")
    return []


def ack_command(cfg: dict, cmd_id: str, ok: bool = True, error: str = None):
    try:
        requests.post(
            f"{cfg['server']}/api/agent/commands/ack",
            json={
                "device_id": cfg["device_id"],
                "agent_secret": cfg["agent_secret"],
                "cmd_id": cmd_id,
                "ok": ok,
                "error": error,
            },
            timeout=10,
        )
    except Exception:
        pass


# ---- Command execution ------------------------------------------------------
def _to_screen(x_rel, y_rel):
    sw, sh = get_screen_size()
    return int((x_rel or 0) * sw), int((y_rel or 0) * sh)


def execute_command(cmd: dict) -> tuple[bool, str | None]:
    if not HAS_CONTROL:
        return False, "pyautogui não disponível"
    action = cmd["action"]
    p = cmd.get("params", {})
    try:
        if action == "mouse_move":
            x, y = _to_screen(p.get("x"), p.get("y"))
            pyautogui.moveTo(x, y, duration=0)
        elif action == "mouse_click":
            x, y = _to_screen(p.get("x"), p.get("y"))
            pyautogui.click(x, y, button=p.get("button", "left"))
        elif action == "mouse_dblclick":
            x, y = _to_screen(p.get("x"), p.get("y"))
            pyautogui.doubleClick(x, y, button=p.get("button", "left"))
        elif action == "mouse_down":
            x, y = _to_screen(p.get("x"), p.get("y"))
            pyautogui.mouseDown(x, y, button=p.get("button", "left"))
        elif action == "mouse_up":
            x, y = _to_screen(p.get("x"), p.get("y"))
            pyautogui.mouseUp(x, y, button=p.get("button", "left"))
        elif action == "scroll":
            pyautogui.scroll(int(p.get("amount", 0)))
        elif action == "key_type":
            pyautogui.typewrite(p.get("text", ""), interval=0.01)
        elif action == "key_press":
            keys = p.get("keys") or []
            for k in keys:
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


# ---- Threads ----------------------------------------------------------------
class State:
    last_command_at: float = 0


def heartbeat_thread(cfg, state):
    while True:
        if heartbeat(cfg):
            print(f"[HB ] {time.strftime('%H:%M:%S')} ok")
        time.sleep(HEARTBEAT_INTERVAL)


def screenshot_thread(cfg, state, enabled):
    while True:
        if not enabled:
            time.sleep(60)
            continue
        # active when commands received recently
        active = (time.time() - state.last_command_at) < STREAMING_WINDOW_SEC
        interval = SCREENSHOT_INTERVAL if active else SCREENSHOT_IDLE_INTERVAL
        b64 = capture_screenshot_b64()
        if b64:
            ok = send_screenshot(cfg, b64)
            if ok:
                tag = "STREAM" if active else "IDLE"
                print(f"[SS ] {time.strftime('%H:%M:%S')} {tag} {len(b64)//1024} KB")
        time.sleep(interval)


def command_thread(cfg, state):
    while True:
        cmds = poll_commands(cfg)
        for c in cmds:
            ok, err = execute_command(c)
            ack_command(cfg, c["id"], ok=ok, error=err)
            state.last_command_at = time.time()
            if not ok:
                print(f"[CMD] {c['action']} FAIL: {err}")
            else:
                print(f"[CMD] {c['action']} ok")
        time.sleep(COMMAND_POLL_INTERVAL)


# ---- Main -------------------------------------------------------------------
def parse_args():
    p = argparse.ArgumentParser(description="V-remote Agent")
    p.add_argument("--server", help="URL do painel, ex: https://painel.exemplo.com")
    p.add_argument("--token", help="Token de acesso (rdpro_...) gerado no painel")
    p.add_argument("--no-screenshot", action="store_true")
    p.add_argument("--no-control", action="store_true", help="Desabilita controle remoto (somente view)")
    p.add_argument("--reset", action="store_true")
    return p.parse_args()


def main():
    global HAS_CONTROL
    args = parse_args()
    if args.no_control:
        HAS_CONTROL = False
    if args.reset and CONFIG_FILE.exists():
        CONFIG_FILE.unlink()

    cfg = load_config()
    if not cfg:
        if not args.server or not args.token:
            print("[ERRO] Primeira execução precisa de --server e --token")
            sys.exit(1)
        cfg = register(args.server.rstrip("/"), args.token)
    else:
        if args.server:
            cfg["server"] = args.server.rstrip("/")
            save_config(cfg)
        print(f"[OK] Config carregada. Device: {cfg['name']} ({cfg['rust_id']})")
        print(f"[OK] Controle: {HAS_CONTROL} | Screenshot: {HAS_SCREENSHOT}")

    state = State()
    state.last_command_at = 0

    threads = [
        threading.Thread(target=heartbeat_thread, args=(cfg, state), daemon=True),
        threading.Thread(target=screenshot_thread, args=(cfg, state, not args.no_screenshot), daemon=True),
        threading.Thread(target=command_thread, args=(cfg, state), daemon=True),
    ]
    for t in threads:
        t.start()

    print(f"[INFO] Painel: {cfg['server']} — Ctrl+C para parar.")
    try:
        while True:
            time.sleep(60)
    except KeyboardInterrupt:
        print("\n[INFO] Encerrando agente.")


if __name__ == "__main__":
    main()
