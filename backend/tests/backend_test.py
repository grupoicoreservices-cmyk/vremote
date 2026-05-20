"""End-to-end backend tests for RustAdmin API.

Covers: auth, dashboard, devices CRUD/heartbeat/search/filter, sessions, users (admin-only),
audit logs filtering, access tokens, address book, server config, and ObjectId leakage.
"""
import os
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://remote-access-hub-18.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admin@rustadmin.io"
ADMIN_PASSWORD = "Admin@2026"


# ---------- Fixtures ----------
@pytest.fixture(scope="session")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
               timeout=20)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "access_token" in data and "user" in data
    # set Authorization fallback (some intermediaries strip cookies)
    s.headers.update({"Authorization": f"Bearer {data['access_token']}"})
    return s


@pytest.fixture(scope="session")
def admin_token(admin_session):
    return admin_session.headers["Authorization"].split(" ", 1)[1]


# ---------- Auth ----------
class TestAuth:
    def test_login_success_sets_cookies(self):
        s = requests.Session()
        r = s.post(f"{BASE_URL}/api/auth/login",
                   json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
        assert r.status_code == 200
        body = r.json()
        assert body["user"]["email"] == ADMIN_EMAIL
        assert body["user"]["role"] == "admin"
        assert isinstance(body["access_token"], str) and len(body["access_token"]) > 20
        # cookies set
        set_cookie = r.headers.get("set-cookie", "")
        assert "access_token=" in set_cookie
        assert "HttpOnly" in set_cookie
        assert "SameSite=none" in set_cookie.lower() or "samesite=none" in set_cookie.lower()

    def test_login_invalid_credentials(self):
        # use random IP via email variation to avoid lockout interference
        unique = f"nouser_{uuid.uuid4().hex[:6]}@x.io"
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": unique, "password": "wrong"}, timeout=20)
        assert r.status_code == 401
        assert "detail" in r.json()

    def test_me_with_token(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/auth/me", timeout=20)
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN_EMAIL

    def test_me_without_token(self):
        r = requests.get(f"{BASE_URL}/api/auth/me", timeout=20)
        assert r.status_code == 401

    def test_logout(self):
        s = requests.Session()
        r = s.post(f"{BASE_URL}/api/auth/login",
                   json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
        token = r.json()["access_token"]
        s.headers.update({"Authorization": f"Bearer {token}"})
        r = s.post(f"{BASE_URL}/api/auth/logout", timeout=20)
        assert r.status_code == 200
        assert r.json().get("ok") is True


# ---------- Dashboard ----------
class TestDashboard:
    def test_dashboard_stats(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/dashboard/stats", timeout=20)
        assert r.status_code == 200
        d = r.json()
        for k in ["total_devices", "online_devices", "active_sessions", "bandwidth_series", "recent_sessions"]:
            assert k in d
        assert d["total_devices"] >= 10
        assert isinstance(d["bandwidth_series"], list) and len(d["bandwidth_series"]) == 12
        assert all("_id" not in s for s in d["recent_sessions"])


# ---------- Devices ----------
class TestDevices:
    def test_list_seeded(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/devices", timeout=20)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list) and len(items) >= 10
        first = items[0]
        assert len(first["rust_id"]) == 9 and first["rust_id"].isdigit()
        assert "_id" not in first

    def test_create_update_delete_flow(self, admin_session):
        name = f"TEST_DEV_{uuid.uuid4().hex[:6]}"
        r = admin_session.post(f"{BASE_URL}/api/devices",
                               json={"name": name, "os": "linux", "tags": ["TEST"]}, timeout=20)
        assert r.status_code == 200
        dev = r.json()
        assert dev["name"] == name and dev["os"] == "linux"
        assert len(dev["rust_id"]) == 9
        did = dev["id"]

        # update
        r = admin_session.patch(f"{BASE_URL}/api/devices/{did}",
                                json={"name": name + "_upd", "tags": ["x"]}, timeout=20)
        assert r.status_code == 200
        assert r.json()["name"] == name + "_upd"

        # heartbeat -> online
        r = admin_session.post(f"{BASE_URL}/api/devices/{did}/heartbeat", timeout=20)
        assert r.status_code == 200

        items = admin_session.get(f"{BASE_URL}/api/devices?search={name}", timeout=20).json()
        assert any(i["id"] == did and i["status"] == "online" for i in items)

        # status filter
        only_online = admin_session.get(f"{BASE_URL}/api/devices?status=online", timeout=20).json()
        assert all(i["status"] == "online" for i in only_online)

        # delete
        r = admin_session.delete(f"{BASE_URL}/api/devices/{did}", timeout=20)
        assert r.status_code == 200
        items = admin_session.get(f"{BASE_URL}/api/devices?search={name}", timeout=20).json()
        assert not any(i["id"] == did for i in items)


# ---------- Sessions ----------
class TestSessions:
    def test_session_lifecycle(self, admin_session):
        # create online device
        name = f"TEST_SESS_{uuid.uuid4().hex[:6]}"
        dev = admin_session.post(f"{BASE_URL}/api/devices", json={"name": name, "os": "windows"}).json()
        admin_session.post(f"{BASE_URL}/api/devices/{dev['id']}/heartbeat")
        # start
        r = admin_session.post(f"{BASE_URL}/api/sessions", json={"device_id": dev["id"], "note": "t"}, timeout=20)
        assert r.status_code == 200, r.text
        sess = r.json()
        assert sess["status"] == "active" and sess["device_id"] == dev["id"]
        # list
        r = admin_session.get(f"{BASE_URL}/api/sessions", timeout=20)
        assert r.status_code == 200 and any(s["id"] == sess["id"] for s in r.json())
        # end
        r = admin_session.post(f"{BASE_URL}/api/sessions/{sess['id']}/end", timeout=20)
        assert r.status_code == 200
        # cleanup
        admin_session.delete(f"{BASE_URL}/api/devices/{dev['id']}")

    def test_session_requires_online_device(self, admin_session):
        # create offline device (no heartbeat)
        name = f"TEST_OFF_{uuid.uuid4().hex[:6]}"
        dev = admin_session.post(f"{BASE_URL}/api/devices", json={"name": name, "os": "linux"}).json()
        r = admin_session.post(f"{BASE_URL}/api/sessions", json={"device_id": dev["id"]}, timeout=20)
        assert r.status_code == 400
        admin_session.delete(f"{BASE_URL}/api/devices/{dev['id']}")


# ---------- Users ----------
class TestUsers:
    def test_admin_user_crud_and_rbac(self, admin_session):
        email = f"test_op_{uuid.uuid4().hex[:6]}@x.io"
        r = admin_session.post(f"{BASE_URL}/api/users",
                               json={"email": email, "password": "Pass@2026", "name": "Op", "role": "operator"},
                               timeout=20)
        assert r.status_code == 200, r.text
        u = r.json()
        assert u["email"] == email and u["role"] == "operator"
        uid = u["id"]

        # list
        users = admin_session.get(f"{BASE_URL}/api/users", timeout=20).json()
        assert any(x["id"] == uid for x in users)
        assert all("password_hash" not in x for x in users)

        # operator login & RBAC: operator cannot list users
        op = requests.Session()
        lr = op.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": "Pass@2026"}, timeout=20)
        assert lr.status_code == 200
        op.headers.update({"Authorization": f"Bearer {lr.json()['access_token']}"})
        rbac = op.get(f"{BASE_URL}/api/users", timeout=20)
        assert rbac.status_code == 403

        # patch
        r = admin_session.patch(f"{BASE_URL}/api/users/{uid}", json={"name": "Updated"}, timeout=20)
        assert r.status_code == 200 and r.json()["name"] == "Updated"

        # delete
        r = admin_session.delete(f"{BASE_URL}/api/users/{uid}", timeout=20)
        assert r.status_code == 200


# ---------- Audit Logs ----------
class TestAuditLogs:
    def test_list_and_filter(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/audit-logs?limit=50", timeout=20)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list) and len(items) > 0
        assert all("_id" not in x for x in items)
        # filter by prefix "session" should match "session.start"/"session.end" only
        r = admin_session.get(f"{BASE_URL}/api/audit-logs?action=session", timeout=20)
        assert r.status_code == 200
        assert all(x["action"].startswith("session") for x in r.json())


# ---------- Access Tokens ----------
class TestAccessTokens:
    def test_create_list_revoke(self, admin_session):
        r = admin_session.post(f"{BASE_URL}/api/access-tokens",
                               json={"label": "TEST_tk", "expires_in_days": 7}, timeout=20)
        assert r.status_code == 200
        tk = r.json()
        assert tk["token"].startswith("rdpro_")
        tid = tk["id"]
        items = admin_session.get(f"{BASE_URL}/api/access-tokens", timeout=20).json()
        assert any(i["id"] == tid for i in items)
        r = admin_session.delete(f"{BASE_URL}/api/access-tokens/{tid}", timeout=20)
        assert r.status_code == 200
        items = admin_session.get(f"{BASE_URL}/api/access-tokens", timeout=20).json()
        assert any(i["id"] == tid and i["revoked"] is True for i in items)


# ---------- Address Book ----------
class TestAddressBook:
    def test_crud(self, admin_session):
        devs = admin_session.get(f"{BASE_URL}/api/devices", timeout=20).json()
        did = devs[0]["id"]
        r = admin_session.post(f"{BASE_URL}/api/address-book",
                               json={"label": "TEST_ab", "device_id": did, "group": "G"}, timeout=20)
        assert r.status_code == 200
        entry = r.json()
        assert entry["device_id"] == did
        assert "_id" not in entry
        entries = admin_session.get(f"{BASE_URL}/api/address-book", timeout=20).json()
        assert any(e["id"] == entry["id"] for e in entries)
        r = admin_session.delete(f"{BASE_URL}/api/address-book/{entry['id']}", timeout=20)
        assert r.status_code == 200


# ---------- Server Config ----------
class TestServerConfig:
    def test_get_and_patch(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/server-config", timeout=20)
        assert r.status_code == 200
        cfg = r.json()
        for k in ["relay_server", "rendezvous_server", "api_url", "key"]:
            assert k in cfg
        assert "_id" not in cfg
        r = admin_session.patch(f"{BASE_URL}/api/server-config", json={
            "relay_server": cfg["relay_server"],
            "rendezvous_server": cfg["rendezvous_server"],
            "api_url": cfg["api_url"],
            "key": cfg["key"],
            "allow_registration": True,
        }, timeout=20)
        assert r.status_code == 200



# ---------- Agent endpoints (Iteration 2) ----------
# Tiny base64-encoded 1x1 PNG
TINY_PNG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII="
)


class TestAgentEndpoints:
    @pytest.fixture(scope="class")
    def access_token_value(self, admin_session):
        r = admin_session.post(
            f"{BASE_URL}/api/access-tokens",
            json={"label": "TEST_agent_tk", "expires_in_days": 7},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        tk = r.json()
        return tk

    def test_register_invalid_token(self):
        r = requests.post(
            f"{BASE_URL}/api/agent/register",
            json={"token": "rdpro_invalid_xxx", "hostname": "TEST_bad", "os": "windows"},
            timeout=20,
        )
        assert r.status_code == 401

    def test_register_revoked_token(self, admin_session):
        # create, then revoke, then try
        r = admin_session.post(
            f"{BASE_URL}/api/access-tokens",
            json={"label": "TEST_revoked_tk", "expires_in_days": 7},
            timeout=20,
        )
        tk = r.json()
        admin_session.delete(f"{BASE_URL}/api/access-tokens/{tk['id']}", timeout=20)
        r = requests.post(
            f"{BASE_URL}/api/agent/register",
            json={"token": tk["token"], "hostname": "TEST_revoked", "os": "linux"},
            timeout=20,
        )
        assert r.status_code == 401

    def test_register_success_and_full_flow(self, admin_session, access_token_value):
        token_str = access_token_value["token"]
        # register
        r = requests.post(
            f"{BASE_URL}/api/agent/register",
            json={"token": token_str, "hostname": "TEST_AGT_host", "os": "windows", "ip": "1.2.3.4"},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        reg = r.json()
        for k in ["device_id", "rust_id", "agent_secret", "name"]:
            assert k in reg
        assert len(reg["rust_id"]) == 9 and reg["rust_id"].isdigit()
        assert reg["name"] == "TEST_AGT_host"
        assert len(reg["agent_secret"]) >= 32

        device_id = reg["device_id"]
        agent_secret = reg["agent_secret"]

        # Heartbeat - wrong secret
        r = requests.post(
            f"{BASE_URL}/api/agent/heartbeat",
            json={"device_id": device_id, "agent_secret": "WRONG"},
            timeout=20,
        )
        assert r.status_code == 401

        # Heartbeat - correct
        r = requests.post(
            f"{BASE_URL}/api/agent/heartbeat",
            json={"device_id": device_id, "agent_secret": agent_secret},
            timeout=20,
        )
        assert r.status_code == 200
        assert r.json().get("ok") is True

        # Screenshot - too large (>4MB) -> 413
        big = "a" * 4_000_001
        r = requests.post(
            f"{BASE_URL}/api/agent/screenshot",
            json={"device_id": device_id, "agent_secret": agent_secret, "image_base64": big},
            timeout=30,
        )
        assert r.status_code == 413

        # Screenshot - valid small
        r = requests.post(
            f"{BASE_URL}/api/agent/screenshot",
            json={"device_id": device_id, "agent_secret": agent_secret, "image_base64": TINY_PNG_B64},
            timeout=20,
        )
        assert r.status_code == 200

        # GET /api/devices/{id}/screenshot (authed) should return the b64
        r = admin_session.get(f"{BASE_URL}/api/devices/{device_id}/screenshot", timeout=20)
        assert r.status_code == 200
        body = r.json()
        assert body["image_base64"] == TINY_PNG_B64
        assert body["captured_at"] is not None

        # /api/devices list excludes agent_secret and last_screenshot
        items = admin_session.get(f"{BASE_URL}/api/devices?search=TEST_AGT_host", timeout=20).json()
        match = [i for i in items if i["id"] == device_id]
        assert match, "registered device should appear in list"
        assert "agent_secret" not in match[0]
        assert "last_screenshot" not in match[0]
        # tags include 'Agente' marker
        assert "Agente" in match[0].get("tags", [])

        # cleanup
        admin_session.delete(f"{BASE_URL}/api/devices/{device_id}", timeout=20)

    def test_agent_script_download(self):
        r = requests.get(f"{BASE_URL}/api/agent/script", timeout=20)
        assert r.status_code == 200
        ctype = r.headers.get("content-type", "")
        assert "python" in ctype.lower(), f"unexpected content-type: {ctype}"
        # First line must be shebang
        first_line = r.text.splitlines()[0] if r.text else ""
        assert first_line.startswith("#!/usr/bin/env python3"), f"got: {first_line!r}"
