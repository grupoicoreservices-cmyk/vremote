from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import uuid
import random
import logging
import bcrypt
import jwt as pyjwt
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Literal

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, Query
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr

# ---------- Configuration ----------
JWT_ALGORITHM = "HS256"
ACCESS_TTL_MIN = 60 * 12  # 12h
REFRESH_TTL_DAYS = 7
LOCKOUT_AFTER = 5
LOCKOUT_MIN = 15

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="RustAdmin API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("rustadmin")

# ---------- Helpers ----------
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def hash_pw(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()


def verify_pw(p: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(p.encode(), h.encode())
    except Exception:
        return False


def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TTL_MIN),
        "type": "access",
    }
    return pyjwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=REFRESH_TTL_DAYS),
        "type": "refresh",
    }
    return pyjwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def set_auth_cookies(resp: Response, access: str, refresh: str):
    resp.set_cookie("access_token", access, httponly=True, secure=True, samesite="none", max_age=ACCESS_TTL_MIN * 60, path="/")
    resp.set_cookie("refresh_token", refresh, httponly=True, secure=True, samesite="none", max_age=REFRESH_TTL_DAYS * 86400, path="/")


def clear_auth_cookies(resp: Response):
    resp.delete_cookie("access_token", path="/")
    resp.delete_cookie("refresh_token", path="/")


def user_public(u: dict) -> dict:
    return {
        "id": u["id"],
        "email": u["email"],
        "name": u.get("name", ""),
        "role": u.get("role", "operator"),
        "created_at": u.get("created_at"),
    }


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Não autenticado")
    try:
        payload = pyjwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Tipo de token inválido")
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="Usuário não encontrado")
        return user
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expirado")
    except pyjwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido")


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Acesso restrito a administradores")
    return user


async def log_event(actor: str, action: str, target: str = "", meta: dict = None):
    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "timestamp": now_iso(),
        "actor": actor,
        "action": action,
        "target": target,
        "meta": meta or {},
    })


# ---------- Pydantic Models ----------
class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: Literal["admin", "operator"] = "operator"


class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[Literal["admin", "operator"]] = None
    password: Optional[str] = None


class DeviceIn(BaseModel):
    name: str
    os: Literal["windows", "linux", "macos", "android", "ios"] = "windows"
    tags: List[str] = []
    ip: Optional[str] = None
    notes: Optional[str] = ""


class DeviceUpdate(BaseModel):
    name: Optional[str] = None
    tags: Optional[List[str]] = None
    notes: Optional[str] = None
    status: Optional[Literal["online", "offline", "idle"]] = None


class SessionIn(BaseModel):
    device_id: str
    note: Optional[str] = ""


class AddressBookIn(BaseModel):
    label: str
    device_id: str
    group: str = "Geral"


class AccessTokenIn(BaseModel):
    label: str
    expires_in_days: int = 30


class ServerConfigIn(BaseModel):
    relay_server: str
    rendezvous_server: str
    api_url: str
    key: str
    allow_registration: bool = True


# ---------- Auth Endpoints ----------
@api.post("/auth/login")
async def login(body: LoginIn, request: Request, response: Response):
    email = body.email.lower()
    ip = request.client.host if request.client else "unknown"
    identifier = f"{ip}:{email}"

    # check lockout
    lock = await db.login_attempts.find_one({"identifier": identifier})
    if lock and lock.get("count", 0) >= LOCKOUT_AFTER:
        locked_at = lock.get("locked_at")
        if locked_at:
            locked_dt = datetime.fromisoformat(locked_at)
            if datetime.now(timezone.utc) - locked_dt < timedelta(minutes=LOCKOUT_MIN):
                raise HTTPException(status_code=429, detail=f"Muitas tentativas. Tente novamente em {LOCKOUT_MIN} minutos.")
            else:
                await db.login_attempts.delete_one({"identifier": identifier})

    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user or not verify_pw(body.password, user["password_hash"]):
        await db.login_attempts.update_one(
            {"identifier": identifier},
            {"$inc": {"count": 1}, "$set": {"locked_at": now_iso()}},
            upsert=True,
        )
        raise HTTPException(status_code=401, detail="Credenciais inválidas")

    await db.login_attempts.delete_one({"identifier": identifier})
    access = create_access_token(user["id"], user["email"], user.get("role", "operator"))
    refresh = create_refresh_token(user["id"])
    set_auth_cookies(response, access, refresh)
    await log_event(user["email"], "login", target=ip)
    return {"user": user_public(user), "access_token": access}


@api.post("/auth/logout")
async def logout(response: Response, user: dict = Depends(get_current_user)):
    clear_auth_cookies(response)
    await log_event(user["email"], "logout")
    return {"ok": True}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user_public(user)


@api.post("/auth/refresh")
async def refresh_token(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="Refresh token ausente")
    try:
        payload = pyjwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Tipo inválido")
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="Usuário não existe")
        access = create_access_token(user["id"], user["email"], user.get("role", "operator"))
        response.set_cookie("access_token", access, httponly=True, secure=True, samesite="none", max_age=ACCESS_TTL_MIN * 60, path="/")
        return {"ok": True}
    except pyjwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Refresh inválido")


# ---------- Dashboard ----------
@api.get("/dashboard/stats")
async def dashboard_stats(user: dict = Depends(get_current_user)):
    total_devices = await db.devices.count_documents({})
    online = await db.devices.count_documents({"status": "online"})
    active_sessions = await db.sessions.count_documents({"status": "active"})
    total_sessions = await db.sessions.count_documents({})
    total_users = await db.users.count_documents({})
    recent_sessions = await db.sessions.find({}, {"_id": 0}).sort("started_at", -1).to_list(8)
    recent_logs = await db.audit_logs.find({}, {"_id": 0}).sort("timestamp", -1).to_list(8)

    # bandwidth mock - small time-series
    now = datetime.now(timezone.utc)
    series = []
    for i in range(12):
        t = now - timedelta(minutes=(11 - i) * 5)
        series.append({
            "t": t.strftime("%H:%M"),
            "in": random.randint(40, 220),
            "out": random.randint(20, 180),
        })

    return {
        "total_devices": total_devices,
        "online_devices": online,
        "offline_devices": total_devices - online,
        "active_sessions": active_sessions,
        "total_sessions": total_sessions,
        "total_users": total_users,
        "bandwidth_mbps_in": sum(s["in"] for s in series[-3:]) // 3,
        "bandwidth_mbps_out": sum(s["out"] for s in series[-3:]) // 3,
        "bandwidth_series": series,
        "recent_sessions": recent_sessions,
        "recent_logs": recent_logs,
    }


# ---------- Devices ----------
def gen_rustdesk_id() -> str:
    return f"{random.randint(100000000, 999999999)}"


@api.get("/devices")
async def list_devices(
    user: dict = Depends(get_current_user),
    search: Optional[str] = None,
    status: Optional[str] = None,
):
    q = {}
    if status and status != "all":
        q["status"] = status
    if search:
        q["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"rust_id": {"$regex": search}},
            {"ip": {"$regex": search}},
        ]
    items = await db.devices.find(q, {"_id": 0, "agent_secret": 0, "last_screenshot": 0}).sort("last_seen", -1).to_list(500)
    return items


@api.post("/devices")
async def create_device(body: DeviceIn, user: dict = Depends(get_current_user)):
    doc = {
        "id": str(uuid.uuid4()),
        "rust_id": gen_rustdesk_id(),
        "name": body.name,
        "os": body.os,
        "tags": body.tags,
        "ip": body.ip or f"192.168.{random.randint(0,255)}.{random.randint(2,254)}",
        "notes": body.notes or "",
        "status": "offline",
        "version": "1.2.6",
        "created_at": now_iso(),
        "last_seen": now_iso(),
        "registered_by": user["email"],
    }
    await db.devices.insert_one(doc)
    await log_event(user["email"], "device.create", target=doc["rust_id"])
    doc.pop("_id", None)
    return doc


@api.patch("/devices/{device_id}")
async def update_device(device_id: str, body: DeviceUpdate, user: dict = Depends(get_current_user)):
    updates = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    if not updates:
        raise HTTPException(status_code=400, detail="Nada para atualizar")
    res = await db.devices.update_one({"id": device_id}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Dispositivo não encontrado")
    item = await db.devices.find_one({"id": device_id}, {"_id": 0})
    await log_event(user["email"], "device.update", target=item["rust_id"], meta=updates)
    return item


@api.delete("/devices/{device_id}")
async def delete_device(device_id: str, user: dict = Depends(get_current_user)):
    item = await db.devices.find_one({"id": device_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Não encontrado")
    await db.devices.delete_one({"id": device_id})
    await log_event(user["email"], "device.delete", target=item["rust_id"])
    return {"ok": True}


@api.post("/devices/{device_id}/heartbeat")
async def device_heartbeat(device_id: str, user: dict = Depends(get_current_user)):
    await db.devices.update_one({"id": device_id}, {"$set": {"status": "online", "last_seen": now_iso()}})
    return {"ok": True}


# ---------- Sessions ----------
@api.get("/sessions")
async def list_sessions(
    user: dict = Depends(get_current_user),
    status: Optional[str] = None,
):
    q = {}
    if status and status != "all":
        q["status"] = status
    items = await db.sessions.find(q, {"_id": 0}).sort("started_at", -1).to_list(500)
    return items


@api.post("/sessions")
async def create_session(body: SessionIn, user: dict = Depends(get_current_user)):
    device = await db.devices.find_one({"id": body.device_id}, {"_id": 0})
    if not device:
        raise HTTPException(status_code=404, detail="Dispositivo não encontrado")
    if device.get("status") != "online":
        raise HTTPException(status_code=400, detail="Dispositivo offline. Não é possível iniciar sessão.")
    doc = {
        "id": str(uuid.uuid4()),
        "device_id": device["id"],
        "device_rust_id": device["rust_id"],
        "device_name": device["name"],
        "operator_email": user["email"],
        "started_at": now_iso(),
        "ended_at": None,
        "duration_sec": 0,
        "status": "active",
        "note": body.note or "",
        "client_ip": device.get("ip"),
    }
    await db.sessions.insert_one(doc)
    await log_event(user["email"], "session.start", target=device["rust_id"])
    doc.pop("_id", None)
    return doc


@api.post("/sessions/{session_id}/end")
async def end_session(session_id: str, user: dict = Depends(get_current_user)):
    sess = await db.sessions.find_one({"id": session_id}, {"_id": 0})
    if not sess:
        raise HTTPException(status_code=404, detail="Sessão não encontrada")
    started = datetime.fromisoformat(sess["started_at"])
    duration = int((datetime.now(timezone.utc) - started).total_seconds())
    await db.sessions.update_one(
        {"id": session_id},
        {"$set": {"status": "ended", "ended_at": now_iso(), "duration_sec": duration}},
    )
    await log_event(user["email"], "session.end", target=sess["device_rust_id"], meta={"duration_sec": duration})
    return {"ok": True}


# ---------- Users ----------
@api.get("/users")
async def list_users(user: dict = Depends(require_admin)):
    items = await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(500)
    return items


@api.post("/users")
async def create_user(body: UserCreate, user: dict = Depends(require_admin)):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="E-mail já cadastrado")
    doc = {
        "id": str(uuid.uuid4()),
        "email": email,
        "name": body.name,
        "role": body.role,
        "password_hash": hash_pw(body.password),
        "created_at": now_iso(),
    }
    await db.users.insert_one(doc)
    await log_event(user["email"], "user.create", target=email)
    return user_public(doc)


@api.patch("/users/{user_id}")
async def update_user(user_id: str, body: UserUpdate, user: dict = Depends(require_admin)):
    target = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    updates = {}
    if body.name is not None:
        updates["name"] = body.name
    if body.role is not None:
        updates["role"] = body.role
    if body.password:
        updates["password_hash"] = hash_pw(body.password)
    if not updates:
        raise HTTPException(status_code=400, detail="Nada para atualizar")
    await db.users.update_one({"id": user_id}, {"$set": updates})
    await log_event(user["email"], "user.update", target=target["email"])
    item = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    return item


@api.delete("/users/{user_id}")
async def delete_user(user_id: str, user: dict = Depends(require_admin)):
    target = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Não encontrado")
    if target["email"] == user["email"]:
        raise HTTPException(status_code=400, detail="Você não pode excluir a si mesmo")
    await db.users.delete_one({"id": user_id})
    await log_event(user["email"], "user.delete", target=target["email"])
    return {"ok": True}


# ---------- Audit Logs ----------
@api.get("/audit-logs")
async def list_logs(
    user: dict = Depends(get_current_user),
    limit: int = Query(100, ge=1, le=500),
    action: Optional[str] = None,
):
    q = {}
    if action and action != "all":
        q["action"] = {"$regex": f"^{action}"}
    items = await db.audit_logs.find(q, {"_id": 0}).sort("timestamp", -1).to_list(limit)
    return items


# ---------- Access Tokens ----------
@api.get("/access-tokens")
async def list_tokens(user: dict = Depends(require_admin)):
    items = await db.access_tokens.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return items


@api.post("/access-tokens")
async def create_token(body: AccessTokenIn, user: dict = Depends(require_admin)):
    token_value = f"rdpro_{uuid.uuid4().hex}{uuid.uuid4().hex[:8]}"
    doc = {
        "id": str(uuid.uuid4()),
        "label": body.label,
        "token": token_value,
        "created_at": now_iso(),
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=body.expires_in_days)).isoformat(),
        "created_by": user["email"],
        "revoked": False,
    }
    await db.access_tokens.insert_one(doc)
    await log_event(user["email"], "token.create", target=body.label)
    doc.pop("_id", None)
    return doc


@api.delete("/access-tokens/{token_id}")
async def revoke_token(token_id: str, user: dict = Depends(require_admin)):
    item = await db.access_tokens.find_one({"id": token_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Não encontrado")
    await db.access_tokens.update_one({"id": token_id}, {"$set": {"revoked": True}})
    await log_event(user["email"], "token.revoke", target=item["label"])
    return {"ok": True}


# ---------- Address Book ----------
@api.get("/address-book")
async def list_address(user: dict = Depends(get_current_user)):
    items = await db.address_book.find({"owner": user["email"]}, {"_id": 0}).to_list(500)
    return items


@api.post("/address-book")
async def add_address(body: AddressBookIn, user: dict = Depends(get_current_user)):
    device = await db.devices.find_one({"id": body.device_id}, {"_id": 0})
    if not device:
        raise HTTPException(status_code=404, detail="Dispositivo não encontrado")
    doc = {
        "id": str(uuid.uuid4()),
        "owner": user["email"],
        "label": body.label,
        "device_id": device["id"],
        "rust_id": device["rust_id"],
        "device_name": device["name"],
        "device_os": device["os"],
        "group": body.group,
        "created_at": now_iso(),
    }
    await db.address_book.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.delete("/address-book/{entry_id}")
async def del_address(entry_id: str, user: dict = Depends(get_current_user)):
    await db.address_book.delete_one({"id": entry_id, "owner": user["email"]})
    return {"ok": True}


# ---------- Server Config ----------
@api.get("/server-config")
async def get_config(user: dict = Depends(get_current_user)):
    cfg = await db.server_config.find_one({"id": "default"}, {"_id": 0})
    if not cfg:
        cfg = {
            "id": "default",
            "relay_server": "relay.rustadmin.io:21117",
            "rendezvous_server": "rs.rustadmin.io:21116",
            "api_url": "https://api.rustadmin.io",
            "key": "AUTO-GENERATED-KEY-PLACEHOLDER",
            "allow_registration": True,
            "updated_at": now_iso(),
        }
        await db.server_config.insert_one(cfg)
        cfg.pop("_id", None)
    return cfg


@api.patch("/server-config")
async def update_config(body: ServerConfigIn, user: dict = Depends(require_admin)):
    updates = body.model_dump()
    updates["updated_at"] = now_iso()
    await db.server_config.update_one({"id": "default"}, {"$set": updates}, upsert=True)
    cfg = await db.server_config.find_one({"id": "default"}, {"_id": 0})
    await log_event(user["email"], "server-config.update")
    return cfg


# ---------- Agent (unauthenticated bootstrap, then signed by agent_secret) ----------
class AgentRegisterIn(BaseModel):
    token: str
    hostname: str
    os: Literal["windows", "linux", "macos", "android", "ios"] = "windows"
    ip: Optional[str] = None
    version: Optional[str] = "agent-py-1.0"
    screen_width: Optional[int] = None
    screen_height: Optional[int] = None
    can_control: Optional[bool] = False


class AgentAuthBase(BaseModel):
    device_id: str
    agent_secret: str


class AgentHeartbeatIn(AgentAuthBase):
    screen_width: Optional[int] = None
    screen_height: Optional[int] = None
    can_control: Optional[bool] = None


class AgentScreenshotIn(AgentAuthBase):
    image_base64: str
    screen_width: Optional[int] = None
    screen_height: Optional[int] = None


class CommandIn(BaseModel):
    action: Literal[
        "mouse_move", "mouse_click", "mouse_dblclick", "mouse_down", "mouse_up",
        "scroll", "key_type", "key_press", "hotkey",
    ]
    x: Optional[float] = None  # 0..1 relative
    y: Optional[float] = None
    button: Optional[str] = "left"
    text: Optional[str] = None
    keys: Optional[List[str]] = None
    amount: Optional[int] = None


class CommandAckIn(AgentAuthBase):
    cmd_id: str
    ok: bool = True
    error: Optional[str] = None


async def _auth_agent(device_id: str, agent_secret: str) -> dict:
    device = await db.devices.find_one({"id": device_id}, {"_id": 0})
    if not device or device.get("agent_secret") != agent_secret:
        raise HTTPException(status_code=401, detail="Agente não autorizado")
    return device


@api.post("/agent/register")
async def agent_register(body: AgentRegisterIn):
    tok = await db.access_tokens.find_one({"token": body.token, "revoked": False}, {"_id": 0})
    if not tok:
        raise HTTPException(status_code=401, detail="Token inválido ou revogado")
    if tok.get("expires_at"):
        try:
            if datetime.fromisoformat(tok["expires_at"]) < datetime.now(timezone.utc):
                raise HTTPException(status_code=401, detail="Token expirado")
        except ValueError:
            pass

    agent_secret = uuid.uuid4().hex + uuid.uuid4().hex
    doc = {
        "id": str(uuid.uuid4()),
        "rust_id": gen_rustdesk_id(),
        "name": body.hostname[:64],
        "os": body.os,
        "tags": ["Agente"],
        "ip": body.ip or "0.0.0.0",
        "notes": "Registrado via agent.py",
        "status": "online",
        "version": body.version or "agent-py-1.0",
        "created_at": now_iso(),
        "last_seen": now_iso(),
        "registered_by": f"agent:{tok['label']}",
        "agent_secret": agent_secret,
        "last_screenshot": None,
        "last_screenshot_at": None,
        "screen_width": body.screen_width,
        "screen_height": body.screen_height,
        "can_control": bool(body.can_control),
    }
    await db.devices.insert_one(doc)
    await log_event(f"agent:{tok['label']}", "agent.register", target=doc["rust_id"])
    return {
        "device_id": doc["id"],
        "rust_id": doc["rust_id"],
        "agent_secret": agent_secret,
        "name": doc["name"],
    }


@api.post("/agent/heartbeat")
async def agent_heartbeat(body: AgentHeartbeatIn):
    await _auth_agent(body.device_id, body.agent_secret)
    updates = {"status": "online", "last_seen": now_iso()}
    if body.screen_width:
        updates["screen_width"] = body.screen_width
    if body.screen_height:
        updates["screen_height"] = body.screen_height
    if body.can_control is not None:
        updates["can_control"] = bool(body.can_control)
    await db.devices.update_one({"id": body.device_id}, {"$set": updates})
    return {"ok": True, "server_time": now_iso()}


@api.post("/agent/screenshot")
async def agent_screenshot(body: AgentScreenshotIn):
    await _auth_agent(body.device_id, body.agent_secret)
    if len(body.image_base64) > 4_000_000:
        raise HTTPException(status_code=413, detail="Imagem muito grande")
    updates = {
        "last_screenshot": body.image_base64,
        "last_screenshot_at": now_iso(),
        "status": "online",
        "last_seen": now_iso(),
    }
    if body.screen_width:
        updates["screen_width"] = body.screen_width
    if body.screen_height:
        updates["screen_height"] = body.screen_height
    await db.devices.update_one({"id": body.device_id}, {"$set": updates})
    return {"ok": True}


@api.get("/devices/{device_id}/screenshot")
async def device_screenshot(device_id: str, user: dict = Depends(get_current_user)):
    d = await db.devices.find_one(
        {"id": device_id},
        {"_id": 0, "last_screenshot": 1, "last_screenshot_at": 1, "screen_width": 1, "screen_height": 1, "can_control": 1},
    )
    if not d:
        raise HTTPException(status_code=404, detail="Não encontrado")
    return {
        "image_base64": d.get("last_screenshot"),
        "captured_at": d.get("last_screenshot_at"),
        "screen_width": d.get("screen_width"),
        "screen_height": d.get("screen_height"),
        "can_control": d.get("can_control", False),
    }


# ---------- Remote Control Commands ----------
@api.post("/sessions/{session_id}/command")
async def queue_command(session_id: str, body: CommandIn, user: dict = Depends(get_current_user)):
    sess = await db.sessions.find_one({"id": session_id}, {"_id": 0})
    if not sess:
        raise HTTPException(status_code=404, detail="Sessão não encontrada")
    if sess["status"] != "active":
        raise HTTPException(status_code=400, detail="Sessão não está ativa")
    cmd = {
        "id": str(uuid.uuid4()),
        "device_id": sess["device_id"],
        "session_id": session_id,
        "action": body.action,
        "params": body.model_dump(exclude_none=True, exclude={"action"}),
        "status": "pending",
        "created_at": now_iso(),
        "by": user["email"],
    }
    await db.agent_commands.insert_one(cmd)
    cmd.pop("_id", None)
    return cmd


@api.post("/agent/commands/poll")
async def agent_poll_commands(body: AgentAuthBase):
    await _auth_agent(body.device_id, body.agent_secret)
    cmds = await db.agent_commands.find(
        {"device_id": body.device_id, "status": "pending"}, {"_id": 0}
    ).sort("created_at", 1).limit(50).to_list(50)
    if cmds:
        ids = [c["id"] for c in cmds]
        await db.agent_commands.update_many(
            {"id": {"$in": ids}}, {"$set": {"status": "delivered", "delivered_at": now_iso()}}
        )
    return {"commands": cmds}


@api.post("/agent/commands/ack")
async def agent_ack_command(body: CommandAckIn):
    await _auth_agent(body.device_id, body.agent_secret)
    await db.agent_commands.update_one(
        {"id": body.cmd_id},
        {"$set": {
            "status": "done" if body.ok else "failed",
            "error": body.error,
            "completed_at": now_iso(),
        }},
    )
    return {"ok": True}


@api.get("/agent/script", response_class=None)
async def agent_script_download():
    """Serve the latest agent.py for one-line download by users."""
    from fastapi.responses import FileResponse
    path = ROOT_DIR.parent / "agent" / "rustadmin_agent.py"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Script não encontrado")
    return FileResponse(str(path), media_type="text/x-python", filename="rustadmin_agent.py")


@api.get("/agent/installer/windows", response_class=None)
async def agent_installer_windows():
    """Serve the PowerShell installer for Windows."""
    from fastapi.responses import FileResponse
    path = ROOT_DIR.parent / "agent" / "install_windows.ps1"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Instalador não encontrado")
    return FileResponse(str(path), media_type="text/plain", filename="install_windows.ps1")


@api.get("/agent/client", response_class=None)
async def agent_client_download():
    """Serve the GUI client script (Tkinter)."""
    from fastapi.responses import FileResponse
    path = ROOT_DIR.parent / "agent" / "rustadmin_client.py"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    return FileResponse(str(path), media_type="text/x-python", filename="rustadmin_client.py")


@api.get("/agent/installer/windows-gui", response_class=None)
async def agent_installer_windows_gui():
    """Serve the PowerShell installer for the GUI client."""
    from fastapi.responses import FileResponse
    path = ROOT_DIR.parent / "agent" / "install_windows_gui.ps1"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Instalador GUI não encontrado")
    return FileResponse(str(path), media_type="text/plain", filename="install_windows_gui.ps1")


# ---------- Startup: Seed ----------
async def seed_admin():
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@rustadmin.io").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "Admin@2026")
    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": admin_email,
            "name": "Administrador",
            "role": "admin",
            "password_hash": hash_pw(admin_password),
            "created_at": now_iso(),
        })
        log.info(f"Admin seeded: {admin_email}")
    else:
        # ensure password matches current env (idempotent)
        if not verify_pw(admin_password, existing["password_hash"]):
            await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_pw(admin_password)}})


async def seed_demo_data():
    if await db.devices.count_documents({}) > 0:
        return
    os_list = ["windows", "linux", "macos", "windows", "android", "windows", "linux", "macos"]
    tags_pool = [["Produção"], ["Dev"], ["Cliente A"], ["Cliente B"], ["Servidor"], ["Notebook"], ["Suporte"]]
    names = [
        "WS-DEV-01", "SRV-PROD-DB", "MBP-DESIGNER", "WS-FINANCE-02",
        "SAMSUNG-A52", "WS-RH-03", "SRV-BACKUP", "MBP-CEO",
        "WS-SUPORTE-04", "SRV-VPN-EDGE",
    ]
    statuses = ["online", "online", "offline", "online", "idle", "offline", "online", "online", "offline", "online"]
    for i, name in enumerate(names):
        await db.devices.insert_one({
            "id": str(uuid.uuid4()),
            "rust_id": gen_rustdesk_id(),
            "name": name,
            "os": os_list[i % len(os_list)],
            "tags": random.choice(tags_pool),
            "ip": f"10.0.{random.randint(0,20)}.{random.randint(2,254)}",
            "notes": "",
            "status": statuses[i],
            "version": "1.2.6",
            "created_at": now_iso(),
            "last_seen": (datetime.now(timezone.utc) - timedelta(minutes=random.randint(0, 240))).isoformat(),
            "registered_by": "admin@rustadmin.io",
        })

    # demo sessions (1 active, 4 ended)
    devs = await db.devices.find({}, {"_id": 0}).to_list(20)
    if devs:
        active = devs[0]
        await db.sessions.insert_one({
            "id": str(uuid.uuid4()),
            "device_id": active["id"],
            "device_rust_id": active["rust_id"],
            "device_name": active["name"],
            "operator_email": "admin@rustadmin.io",
            "started_at": (datetime.now(timezone.utc) - timedelta(minutes=12)).isoformat(),
            "ended_at": None,
            "duration_sec": 720,
            "status": "active",
            "note": "Suporte em andamento",
            "client_ip": active.get("ip"),
        })
        for i in range(6):
            d = random.choice(devs)
            started = datetime.now(timezone.utc) - timedelta(hours=random.randint(1, 72))
            dur = random.randint(120, 3600)
            await db.sessions.insert_one({
                "id": str(uuid.uuid4()),
                "device_id": d["id"],
                "device_rust_id": d["rust_id"],
                "device_name": d["name"],
                "operator_email": "admin@rustadmin.io",
                "started_at": started.isoformat(),
                "ended_at": (started + timedelta(seconds=dur)).isoformat(),
                "duration_sec": dur,
                "status": "ended",
                "note": "",
                "client_ip": d.get("ip"),
            })

    # demo audit logs
    sample_actions = ["login", "session.start", "session.end", "device.create", "token.create"]
    for i in range(10):
        await db.audit_logs.insert_one({
            "id": str(uuid.uuid4()),
            "timestamp": (datetime.now(timezone.utc) - timedelta(hours=i)).isoformat(),
            "actor": "admin@rustadmin.io",
            "action": random.choice(sample_actions),
            "target": gen_rustdesk_id(),
            "meta": {},
        })


@app.on_event("startup")
async def on_startup():
    await db.users.create_index("email", unique=True)
    await db.devices.create_index("rust_id", unique=True)
    await db.sessions.create_index("started_at")
    await db.audit_logs.create_index("timestamp")
    await db.login_attempts.create_index("identifier")
    await db.agent_commands.create_index([("device_id", 1), ("status", 1), ("created_at", 1)])
    await seed_admin()
    await seed_demo_data()
    log.info("RustAdmin API ready")


@app.on_event("shutdown")
async def on_shutdown():
    client.close()


@api.get("/")
async def root():
    return {"service": "RustAdmin API", "ok": True}


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
