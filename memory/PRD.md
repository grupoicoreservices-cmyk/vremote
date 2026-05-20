# PRD — RustAdmin (Painel de Acesso Remoto estilo RustDesk)

## Problem Statement (original, PT-BR)
> "eu gostira de criar um sistema de acesso remoto baseado nesse dwservice.net" — refinado posteriormente para um **sistema baseado no RustDesk com painel de gerenciamento**.

## User Personas
- **Administrador de TI / NOC**: gerencia frota de dispositivos, operadores, tokens e configura o servidor.
- **Operador de Suporte**: conecta a dispositivos online, abre sessões e consulta histórico/address book.

## Architecture
- **Backend**: FastAPI + Motor (async MongoDB), JWT em cookies httpOnly + bcrypt, brute-force lockout (5 tentativas / 15 min), CORS configurado por `FRONTEND_URL`.
- **Frontend**: React 19 + react-router-dom 7, axios `withCredentials`, shadcn/ui, Recharts, sonner, tema dark "Control Room" (IBM Plex Sans/Mono, terminal green + signal amber).
- **DB Collections**: `users`, `devices`, `sessions`, `audit_logs`, `access_tokens`, `address_book`, `server_config`, `login_attempts`.

## Core Requirements (static)
1. Login JWT (admin seed idempotente, brute-force protection).
2. Dashboard com KPIs em tempo real e séries de banda.
3. Gerenciamento de Dispositivos com ID estilo RustDesk (9 dígitos) e status pulsante.
4. Sessões ao vivo + histórico com encerramento manual.
5. Address Book agrupado.
6. Audit Logs estilo terminal com filtro por categoria.
7. Tokens de acesso (admin) com revogação.
8. Configuração de servidor (relay/rendezvous/key).
9. RBAC: admin vs operator (rotas /users e /access-tokens só admin).

## What's been implemented (2026-02-20)
- Backend completo (15/15 testes pytest ✅): auth (login/logout/me/refresh), dashboard, devices CRUD + heartbeat + filtros, sessions (start/end + guarda offline), users CRUD (admin), audit-logs com filtro por prefixo, access-tokens (admin), address-book por owner, server-config (default auto-criado).
- Seed automático: 1 admin + 10 dispositivos demo + 7 sessões + 10 audit logs.
- Frontend completo: Login (hero com imagem do data center), Dashboard (KPIs + line chart Recharts + listas), Devices (tabela, busca, filtro, modal Connect com screenshot mock), Sessions (tabs ao vivo/histórico), Address Book (bento por grupo), Audit Logs (terminal-style), Users, Access Tokens (reveal único + revogação), Settings.
- ObjectId nunca escapa em respostas JSON (bugs descobertos e corrigidos no iteration_1 do testing agent).
- Todos os elementos interativos possuem `data-testid`.

## Mocked / Out of scope (MVP)
- **MOCKED**: Streaming de tela ao vivo (mostra imagem estática num Dialog ao "Conectar").
- **MOCKED**: Série temporal de banda no Dashboard (gerada aleatoriamente no backend).
- **Não implementado**: agente nativo (Rust/C++) que rodaria nos dispositivos reais — necessário para um RustDesk real.

## Prioritized Backlog
- **P0**: já implementado.
- **P1**:
  - Endpoint WebSocket para heartbeat real de agentes + status em tempo real no painel.
  - Cliente agente em Python/Go (proof-of-concept) que registra usando token, envia heartbeat e screenshot estático.
  - Edição inline de dispositivos (atualmente PATCH backend existe; UI tem apenas heartbeat/delete).
  - Edição de usuários (PATCH /api/users/{id} já existe; UI tem só create/delete).
- **P2**:
  - WebRTC para preview real de tela (host → painel) entre browsers.
  - Filtros avançados de audit-logs (range de datas com `Calendar` shadcn).
  - Multi-tenant / Workspaces.
  - 2FA TOTP no login.
  - Notificações sonoras + toast para novos eventos.
  - Internacionalização (i18n) PT-BR / EN.

## Next Tasks
1. Validar visualmente com o usuário e coletar feedback de UI.
2. Iniciar P1.1 (WebSocket de heartbeat) e P1.2 (POC de agente Python).
