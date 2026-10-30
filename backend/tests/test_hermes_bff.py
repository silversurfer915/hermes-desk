# Hermes BFF (/api/hermes/*) tests against the stand-in fake Hermes on 127.0.0.1:9119
import os
import time
import uuid

import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
H = f"{BASE_URL}/api/hermes"
USER, PW, TOKEN = "sam", "correct-horse", "fake-session-token-123"


def _mongo():
    env = {}
    for line in open("/app/backend/.env"):
        if "=" in line:
            k, v = line.strip().split("=", 1)
            env[k] = v.strip('"')
    return MongoClient(env["MONGO_URL"])[env["DB_NAME"]]


def _ip():
    # unique spoofed IP per login to stay under the 5/min limiter (also proves XFF is trusted)
    return f"10.{uuid.uuid4().int % 250}.{uuid.uuid4().int % 250}.{uuid.uuid4().int % 250}"


def _login(body, ip=None):
    s = requests.Session()
    r = s.post(f"{H}/login", json=body, headers={"X-Forwarded-For": ip or _ip()})
    return s, r


@pytest.fixture
def pw_session():
    s, r = _login({"method": "password", "provider": "basic", "username": USER, "password": PW})
    assert r.status_code == 200, r.text
    yield s, r
    s.post(f"{H}/logout")


# Connection (public)
def test_connection_public():
    r = requests.get(f"{H}/connection")
    assert r.status_code == 200
    d = r.json()
    assert d["configured"] is True and d["reachable"] is True
    assert d["version"] == "0.0.0-fake"
    assert d["auth_required"] is True
    assert d["token_login"] is True
    assert d["signed_in"] is False
    assert d["providers"][0]["name"] == "basic"


# Unauthed reads
@pytest.mark.parametrize("path", ["/overview", "/sessions", "/sessions/search?q=deploy", "/sessions/20260601_a1/messages"])
def test_unauthed_401(path):
    r = requests.get(f"{H}{path}")
    assert r.status_code == 401
    assert "detail" in r.json()


def test_wrong_password_generic_401():
    _, r = _login({"method": "password", "provider": "basic", "username": USER, "password": "nope"})
    assert r.status_code == 401
    assert r.json()["detail"] == "Hermes didn't accept those sign-in details."


def test_wrong_username_same_message():
    _, r = _login({"method": "password", "provider": "basic", "username": "ghost", "password": "x"})
    assert r.status_code == 401
    assert r.json()["detail"] == "Hermes didn't accept those sign-in details."


def test_bad_token_401():
    _, r = _login({"method": "token", "token": "wrong-token"})
    assert r.status_code == 401


def test_missing_fields_400():
    _, r = _login({"method": "password", "provider": "basic", "username": USER})
    assert r.status_code == 400


# Password login: cookie flags + nothing upstream leaks
def test_password_login_cookie_and_no_leak(pw_session):
    s, r = pw_session
    d = r.json()
    assert d["ok"] is True and d["user"]["display_name"] == "Sam"
    assert "hermes" not in r.text.lower().replace("hermes didn", "")  # no hermes cookie names/tokens in body
    sc = r.headers.get("set-cookie", "")
    assert sc.startswith("aura_session=")
    low = sc.lower()
    # backend sets SameSite=Lax (verified on :8001); the preview ingress rewrites it to SameSite=None; Partitioned
    assert "httponly" in low and "secure" in low and "path=/api" in low and "samesite=" in low
    assert "hermes_session" not in sc
    assert [k for k in s.cookies.keys() if k != "__cf_bm"] == ["aura_session"]
    c = requests.get(f"{H}/connection", cookies={"aura_session": s.cookies["aura_session"]}).json()
    assert c["signed_in"] is True and c["user"]["user_id"] == "u1"


# Cookie rotation persisted across >5s grace
def test_cookie_rotation_persisted(pw_session):
    s, _ = pw_session
    r = s.get(f"{H}/overview")
    assert r.status_code == 200
    o = r.json()
    assert o["version"] == "0.0.0-fake" and o["current_profile"] == "default" and o["profiles"] == ["default", "work"]
    time.sleep(6.5)
    r = s.get(f"{H}/sessions")
    assert r.status_code == 200, r.text
    ids = [x["id"] for x in r.json()["sessions"]]
    assert ids == ["20260601_a1", "20260531_b2", "20260520_c3"]
    time.sleep(6.5)
    r = s.get(f"{H}/sessions/search", params={"q": "deploy"})
    assert r.status_code == 200, r.text
    assert [x["session_id"] for x in r.json()["results"]] == ["20260531_b2"]
    time.sleep(6.5)
    r = s.get(f"{H}/sessions/20260601_a1/messages")
    assert r.status_code == 200, r.text
    m = r.json()["messages"]
    assert m[1]["tool_calls"][0]["function"]["name"] == "read_file"
    assert len(m) == 4


def test_messages_unknown_404(pw_session):
    s, _ = pw_session
    r = s.get(f"{H}/sessions/does_not_exist/messages")
    assert r.status_code == 404


# Mongo stores encrypted auth only
def test_mongo_encrypted():
    s, r = _login({"method": "token", "token": TOKEN})
    assert r.status_code == 200
    raw = s.cookies["aura_session"]
    db = _mongo()
    docs = list(db.hermes_app_sessions.find({}))
    assert docs
    for d in docs:
        blob = str(d)
        assert TOKEN not in blob and "hermes_session" not in blob and raw not in blob
        assert d["auth"].startswith("gAAAA")
    s.post(f"{H}/logout")


def test_token_login_reads():
    s, r = _login({"method": "token", "token": TOKEN})
    assert r.status_code == 200
    assert s.get(f"{H}/overview").json()["version"] == "0.0.0-fake"
    assert len(s.get(f"{H}/sessions").json()["sessions"]) == 3
    s.post(f"{H}/logout")


# Logout invalidates
def test_logout_invalidates():
    s, r = _login({"method": "password", "provider": "basic", "username": USER, "password": PW})
    assert r.status_code == 200
    raw = s.cookies["aura_session"]
    assert s.post(f"{H}/logout").json()["ok"] is True
    r = requests.get(f"{H}/overview", cookies={"aura_session": raw})
    assert r.status_code == 401


# Rate limit: 6th attempt within a minute from same IP -> 429
def test_rate_limit_429():
    ip = _ip()
    codes = [_login({"method": "password", "provider": "basic", "username": USER, "password": "bad"}, ip)[1].status_code for _ in range(6)]
    assert codes[:5] == [401] * 5
    assert codes[5] == 429
