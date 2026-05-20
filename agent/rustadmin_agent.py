#!/usr/bin/env python3
"""
RustAdmin Agent (Python)
-----------------------
Agente leve para registrar uma máquina no painel RustAdmin, enviar heartbeats
e (opcional) screenshots periódicos.

Requisitos:
    pip install requests
    # opcional (para screenshots):
    pip install mss pillow

Uso:
    python rustadmin_agent.py --server https://seu-painel.exemplo.com --token rdpro_xxx

A primeira execução cria um arquivo .rustadmin_agent.json com as credenciais do
device. Execuções seguintes apenas enviam heartbeats.
"""

import argparse
import base64
import io
import json
import os
import platform
import socket
import sys
import time
from pathlib import Path

import requests

CONFIG_FILE = Path.home() / ".rustadmin_agent.json"
HEARTBEAT_INTERVAL = 15  # segundos
SCREENSHOT_INTERVAL = 30  # segundos


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


def load_config() -> dict | None:
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


def register(server: str, token: str) -> dict:
    payload = {
        "token": token,
        "hostname": socket.gethostname(),
        "os": detect_os(),
        "ip": get_local_ip(),
        "version": "agent-py-1.0",
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
    return cfg


def heartbeat(cfg: dict) -> bool:
    try:
        r = requests.post(
            f"{cfg['server']}/api/agent/heartbeat",
            json={"device_id": cfg["device_id"], "agent_secret": cfg["agent_secret"]},
            timeout=10,
        )
        return r.status_code == 200
    except Exception as e:
        print(f"[WARN] heartbeat falhou: {e}")
        return False


def capture_screenshot_b64() -> str | None:
    try:
        import mss
        from PIL import Image
    except ImportError:
        return None
    try:
        with mss.mss() as sct:
            mon = sct.monitors[1]  # primary monitor
            shot = sct.grab(mon)
            img = Image.frombytes("RGB", shot.size, shot.bgra, "raw", "BGRX")
            # downscale to keep payload small
            img.thumbnail((1280, 720))
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=70)
            return base64.b64encode(buf.getvalue()).decode("ascii")
    except Exception as e:
        print(f"[WARN] screenshot falhou: {e}")
        return None


def send_screenshot(cfg: dict, b64: str) -> bool:
    try:
        r = requests.post(
            f"{cfg['server']}/api/agent/screenshot",
            json={
                "device_id": cfg["device_id"],
                "agent_secret": cfg["agent_secret"],
                "image_base64": b64,
            },
            timeout=20,
        )
        return r.status_code == 200
    except Exception as e:
        print(f"[WARN] envio de screenshot falhou: {e}")
        return False


def parse_args():
    p = argparse.ArgumentParser(description="RustAdmin Agent")
    p.add_argument("--server", required=False, help="URL do painel, ex: https://meu-painel.exemplo.com")
    p.add_argument("--token", required=False, help="Token de acesso (rdpro_...) gerado no painel")
    p.add_argument("--no-screenshot", action="store_true", help="Desabilita envio de screenshots")
    p.add_argument("--reset", action="store_true", help="Apaga config e re-registra")
    return p.parse_args()


def main():
    args = parse_args()
    if args.reset and CONFIG_FILE.exists():
        CONFIG_FILE.unlink()

    cfg = load_config()
    if not cfg:
        if not args.server or not args.token:
            print("[ERRO] Primeira execução precisa de --server e --token")
            sys.exit(1)
        server = args.server.rstrip("/")
        cfg = register(server, args.token)
    else:
        if args.server:
            cfg["server"] = args.server.rstrip("/")
            save_config(cfg)
        print(f"[OK] Carregada config existente. Device: {cfg['name']} ({cfg['rust_id']})")

    print(f"[INFO] Painel: {cfg['server']}")
    print(f"[INFO] Heartbeat a cada {HEARTBEAT_INTERVAL}s. Pressione Ctrl+C para parar.")

    last_screenshot = 0
    while True:
        ok = heartbeat(cfg)
        if ok:
            print(f"[HB] {time.strftime('%H:%M:%S')} OK")
        else:
            print(f"[HB] {time.strftime('%H:%M:%S')} FALHOU")

        if not args.no_screenshot and time.time() - last_screenshot >= SCREENSHOT_INTERVAL:
            b64 = capture_screenshot_b64()
            if b64 is None:
                # only print once
                if last_screenshot == 0:
                    print("[INFO] mss/Pillow não instalados. Pulando screenshots. pip install mss pillow")
                last_screenshot = time.time()  # mark to avoid retrying immediately
            else:
                if send_screenshot(cfg, b64):
                    print(f"[SS] screenshot enviado ({len(b64)//1024} KB)")
                last_screenshot = time.time()

        time.sleep(HEARTBEAT_INTERVAL)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n[INFO] Encerrando agente.")
