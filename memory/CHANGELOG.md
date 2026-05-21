# V-remote Changelog

## 2026-02-20 — MVP + Rebrand V-remote
- Backend FastAPI/MongoDB + JWT, brute-force, RBAC.
- Frontend React/Tailwind/Shadcn com Dashboard, Devices, Sessions, Address Book, Audit Logs, Users, Tokens, Settings.
- 15/15 testes pytest verdes.

## 2026-02-21 — Agentes Python + WebSocket real-time
- Agente headless `vremote_agent.py` (Windows service).
- Agente GUI Tkinter `vremote_client.py` (estilo RustDesk).
- WebSocket `/api/agent/ws/{device_id}` para streaming ~7-8 FPS.
- WebSocket `/api/sessions/{session_id}/ws` para frontend.
- Scripts PowerShell de instalação no Windows.

## 2026-02-22 — Sessão fullscreen + gravação local
- `RemoteSession.jsx` em nova aba (modo fullscreen).
- Cursor normal restaurado (sem custom dot).
- Frames com `object-contain` para auto-frame sem distorção.
- Gravação local da sessão via `<canvas>` + `MediaRecorder` → `.webm`.

## 2026-02-23 — Deploy Ubuntu + opção dados zero
- Script `scripts/install-ubuntu.sh` para Ubuntu 24.04 (MongoDB 8 + Nginx + Certbot apt).
- Variável `SEED_DEMO_DATA` para subir vazio.
- Removida dependência inexistente `emergentintegrations`.

## 2026-02-24 — Diagnóstico do cliente Windows
- `vremote_client.py`: callback `on_error` agora mostra a causa real do erro WS (DNS, SSL, 404, conexão recusada) em vez de só "None".
- Log de URL WS na primeira tentativa para o usuário conferir.
- Heartbeat agora loga mudanças de estado (OK / falhou + razão) na atividade.
- Novo botão **"Trocar servidor"** permite re-registrar em outra URL/token sem precisar resetar manualmente o arquivo de config.
- `_reset` agora pede para fechar e reabrir (evita estado inconsistente).
