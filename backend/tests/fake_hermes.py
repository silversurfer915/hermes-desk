"""Stand-in Hermes dashboard for local testing only (mimics gated-mode auth + read endpoints)."""
import secrets
import time

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

app = FastAPI()
TOKEN = "fake-session-token-123"
USER = ("sam", "correct-horse")
valid_at: dict[str, float] = {}  # access token -> expiry (grace for rotated ones)
NOW = time.time()

SESSIONS = [
    {"id": "20260601_a1", "title": "Draft Q3 roadmap", "preview": "Can you draft the Q3 roadmap", "started_at": NOW - 3600, "last_active": NOW - 1800, "is_active": False, "message_count": 4, "source": "cli", "model": "hermes-4"},
    {"id": "20260531_b2", "title": None, "preview": "Check the staging deploy logs", "started_at": NOW - 90000, "last_active": NOW - 88000, "is_active": False, "message_count": 3, "source": "telegram", "model": "hermes-4"},
    {"id": "20260520_c3", "title": "Trip budget", "preview": "Plan a budget", "started_at": NOW - 900000, "last_active": NOW - 899000, "is_active": False, "message_count": 2, "source": "cli", "model": "hermes-4"},
]
MESSAGES = {
    "20260601_a1": [
        {"role": "user", "content": "Can you draft the Q3 roadmap from the planning doc?", "timestamp": NOW - 3600},
        {"role": "assistant", "content": None, "tool_calls": [{"id": "call_1", "function": {"name": "read_file", "arguments": "{\"path\": \"~/docs/planning.md\"}"}}], "timestamp": NOW - 3590},
        {"role": "tool", "tool_call_id": "call_1", "tool_name": "read_file", "content": "# Planning\n- Checkout v2\n- Onboarding", "timestamp": NOW - 3589},
        {"role": "assistant", "content": "Here's a Q3 roadmap: 1) Checkout v2 in July, 2) Onboarding refresh in August.", "timestamp": NOW - 3580},
    ],
    "20260531_b2": [
        {"role": "user", "content": "Check the staging deploy logs", "timestamp": NOW - 90000},
        {"role": "assistant", "content": None, "tool_calls": [{"id": "call_9", "function": {"name": "terminal", "arguments": "{\"command\": \"kubectl logs deploy/web\"}"}}], "timestamp": NOW - 89990},
        {"role": "assistant", "content": "I started reading the logs but the turn was interrupted.", "timestamp": NOW - 89980},
    ],
    "20260520_c3": [
        {"role": "user", "content": "Plan a budget for the Lisbon trip", "timestamp": NOW - 900000},
        {"role": "assistant", "content": "Roughly 1,400 EUR for 5 days including flights.", "timestamp": NOW - 899000},
    ],
}


def _issue(resp, at=None):
    at = at or secrets.token_hex(8)
    valid_at[at] = time.time() + 3600
    resp.set_cookie("__Host-hermes_session_at", at, httponly=True, secure=True, path="/")
    resp.set_cookie("__Host-hermes_session_rt", "rt-" + at, httponly=True, secure=True, path="/")
    return at


def _authed(request: Request):
    auth = request.headers.get("authorization", "")
    if auth == f"Bearer {TOKEN}":
        return "token"
    at = request.cookies.get("__Host-hermes_session_at")
    if at and valid_at.get(at, 0) > time.time():
        return at
    return None


def _guard(request: Request, payload):
    who = _authed(request)
    if not who:
        return JSONResponse({"error": "session_expired", "login_url": "/login"}, status_code=401)
    resp = JSONResponse(payload)
    if who != "token":
        valid_at[who] = min(valid_at[who], time.time() + 5)  # rotate: old token gets a 5s grace
        _issue(resp)
    return resp


@app.get("/api/status")
async def status():
    return {"version": "0.0.0-fake", "release_date": "2026-05-30", "auth_required": True,
            "auth_providers": ["basic", "session-token"], "profiles": [{"name": "default"}, {"name": "work"}],
            "gateway_running": True, "gateway_state": "running", "active_sessions": 1}


@app.get("/api/auth/providers")
async def providers():
    return {"providers": [{"name": "basic", "display_name": "Username & password", "supports_password": True}]}


@app.post("/auth/password-login")
async def password_login(request: Request):
    body = await request.json()
    if body.get("provider") != "basic":
        return JSONResponse({"detail": "Unknown provider"}, status_code=404)
    if (body.get("username"), body.get("password")) != USER:
        return JSONResponse({"detail": "Invalid credentials"}, status_code=401)
    resp = JSONResponse({"ok": True, "next": "/"})
    _issue(resp)
    return resp


@app.post("/auth/logout")
async def logout(request: Request):
    valid_at.pop(request.cookies.get("__Host-hermes_session_at", ""), None)
    resp = JSONResponse({"ok": True})
    resp.delete_cookie("__Host-hermes_session_at")
    return resp


@app.get("/api/auth/me")
async def me(request: Request):
    return _guard(request, {"user_id": "u1", "email": "sam@example.test", "display_name": "Sam", "org_id": "", "provider": "basic", "expires_at": 0})


@app.get("/api/profiles/active")
async def active(request: Request):
    return _guard(request, {"active": "default", "current": "default"})


@app.get("/api/sessions")
async def sessions(request: Request):
    return _guard(request, {"sessions": SESSIONS, "total": len(SESSIONS), "limit": 50, "offset": 0})


@app.get("/api/sessions/search")
async def search(request: Request, q: str = ""):
    hits = [{"session_id": s["id"], "title": s["title"], "snippet": s["preview"], "last_active": s["last_active"], "session_started": s["started_at"]}
            for s in SESSIONS if q.lower() in (s["preview"] + str(s["title"])).lower()]
    return _guard(request, {"results": hits})


@app.get("/api/sessions/{sid}/messages")
async def messages(sid: str, request: Request):
    if sid not in MESSAGES:
        return JSONResponse({"detail": "Session not found"}, status_code=404)
    return _guard(request, {"session_id": sid, "messages": MESSAGES[sid]})
