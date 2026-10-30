"""Complete stand-in Hermes dashboard for local testing (REST + WebSocket gateway).

Mimics the surfaces Hermes Desk's BFF and ws bridge use: session auth with rotating
cookies, sessions/messages, profiles, cron (briefing), skills, models, MCP, config,
trusted ws-tickets, and a JSON-RPC /api/ws that streams turns, tool activity, server→client
approval requests, and hosted group rooms.

Run directly (uvicorn). FAKE_INSECURE_COOKIES=1 drops the Secure flag for plain-HTTP
integration suites; browsers on http://127.0.0.1 still work either way.
"""
import asyncio
import json
import os
import secrets
import time
import uuid

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse

app = FastAPI()
USERNAME = "sam"
PASSWORD = "correct-horse"
TOKEN = "fake-session-token-123"
_NICK = ("Sam", "sam")  # display_name, provider handle


def _cred_ok(username: str, password: str) -> bool:
    # "sam" plus throwaway "sam-<suffix>" logins so test runs never share a rate-limit bucket.
    return (username == USERNAME or username.startswith("sam-")) and password == PASSWORD


valid_at: dict[str, float] = {}
TICKETS: set[str] = set()
NOW = time.time()
REPLAY_EPOCH = "epoch-fake-1"
SECURE_COOKIES = os.environ.get("FAKE_INSECURE_COOKIES", "") != "1"

SESSIONS = [
    {"id": "20260601_a1", "title": "Draft Q3 roadmap", "preview": "Can you draft the Q3 roadmap", "started_at": NOW - 3600, "last_active": NOW - 1800, "is_active": False, "message_count": 4, "source": "cli", "model": "hermes-4o"},
    {"id": "20260531_b2", "title": None, "preview": "Check the staging deploy logs", "started_at": NOW - 90000, "last_active": NOW - 88000, "is_active": False, "message_count": 3, "source": "telegram", "model": "hermes-4o"},
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
JOBS = [
    {"id": "job-brief-1", "name": "Morning briefing", "schedule": "0 7 * * *", "cron": "0 7 * * *", "profile": "default", "enabled": True, "state": "ok", "deliver": "local", "last_run_at": NOW - 3600},
    {"id": "job-mail-1", "name": "New-mail alert", "schedule": "*/15 * * * *", "cron": "*/15 * * * *", "profile": "default", "enabled": True, "state": "ok"},
]
SKILLS = [
    {"name": "staging-deploy", "description": "Deploy and verify the staging stack.", "enabled": True, "provenance": "user"},
    {"name": "trip-planner", "description": "Plan travel budgets.", "enabled": False, "provenance": "hermes"},
]
MCP = [
    {"name": "filesystem", "transport": "stdio", "command": "npx filesystem-mcp", "enabled": True},
    {"name": "browser", "transport": "http", "url": "http://127.0.0.1:9222", "enabled": False},
]
ROOMS: dict[str, dict] = {
    "room-launch-1": {
        "room_id": "room-launch-1", "name": "Launch war-room",
        "members": [{"member_id": "m1", "profile": "default", "handle": "sam"}, {"member_id": "m2", "profile": "work", "handle": "work-bot"}],
        "authority_gateway_id": "gw-fake", "authority_epoch": 1, "revision": 4,
        "created_at": NOW - 7200, "updated_at": NOW - 600, "latest_seq": 2,
    },
}
ROOM_EVENTS: dict[str, list] = {
    "room-launch-1": [
        {"room_id": "room-launch-1", "seq": 1, "event_id": "ev-1", "kind": "message", "actor": {"kind": "user", "id": "sam"}, "payload": {"text": "Deploy window is 21:00 UTC."}, "created_at": NOW - 3600},
        {"room_id": "room-launch-1", "seq": 2, "event_id": "ev-2", "kind": "message", "actor": {"kind": "bot", "id": "work-bot"}, "payload": {"text": "Acknowledged; I will watch the dashboards."}, "created_at": NOW - 600},
    ],
}

LIVE_INFO = {"session_key": None, "model": "hermes-4o", "provider": "fake", "profile_name": "default", "running": False, "cwd": "~", "verbose": False}


def _issue(resp, at=None):
    at = at or secrets.token_hex(8)
    valid_at[at] = time.time() + 3600
    resp.set_cookie("__Host-hermes_session_at", at, httponly=True, secure=SECURE_COOKIES, path="/")
    resp.set_cookie("__Host-hermes_session_rt", "rt-" + at, httponly=True, secure=SECURE_COOKIES, path="/")
    return at


def _authed(request: Request):
    auth = request.headers.get("authorization", "")
    if auth == f"Bearer {TOKEN}":
        return "token"
    at = request.cookies.get("__Host-hermes_session_at")
    if at and valid_at.get(at, 0) > time.time():
        return at
    return None


def _guard(request, payload, status_code=200):
    who = _authed(request)
    if not who:
        return JSONResponse({"error": "session_expired", "login_url": "/login"}, status_code=401)
    resp = JSONResponse(payload, status_code=status_code)
    if who != "token":
        valid_at[who] = min(valid_at[who], time.time() + 5)
        _issue(resp)
    return resp


@app.get("/api/status")
async def status():
    return {"version": "0.0.0-fake", "release_date": "2026-05-30", "auth_required": True,
            "auth_providers": ["basic", "session-token"], "profiles": [{"name": "default"}, {"name": "work"}],
            "gateway_running": True, "gateway_state": "running", "gateway_platforms": {"telegram": "ok"},
            "active_sessions": 1}


@app.get("/api/auth/providers")
async def providers():
    return {"providers": [{"name": "basic", "display_name": "Username & password", "supports_password": True}]}


@app.post("/auth/password-login")
async def password_login(request: Request):
    body = await request.json()
    if body.get("provider") != "basic":
        return JSONResponse({"detail": "Unknown provider"}, status_code=404)
    if not _cred_ok(str(body.get("username")), str(body.get("password"))):
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


@app.post("/api/auth/ws-ticket")
async def ws_ticket(request: Request):
    if not _authed(request):
        return JSONResponse({"detail": "session_expired"}, status_code=401)
    ticket = secrets.token_urlsafe(24)
    TICKETS.add(ticket)
    return {"ticket": ticket}


@app.get("/api/profiles")
async def profiles(request: Request):
    return _guard(request, {"profiles": [
        {"name": "default", "display_name": "Default", "description": "Main everyday agent", "is_default": True},
        {"name": "work", "display_name": "Work", "description": "Work calendars and budgets"},
    ]})


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


@app.get("/api/cron/jobs")
async def cron_jobs(request: Request):
    return _guard(request, {"jobs": JOBS})


@app.get("/api/cron/jobs/{job_id}/runs")
async def cron_runs(job_id: str, request: Request):
    if job_id != "job-brief-1":
        return _guard(request, {"runs": []})
    return _guard(request, {"runs": [{"id": "run-1", "session_id": "20260520_c3", "source": "session", "started_at": NOW - 3600}]})


@app.post("/api/cron/jobs/{job_id}/{action}")
async def cron_action(job_id: str, action: str, request: Request):
    assert action in ("trigger", "pause", "resume")
    return _guard(request, {"ok": True, "job_id": job_id, "action": action})


@app.get("/api/cron/delivery-targets")
async def delivery_targets(request: Request):
    return _guard(request, {"delivery_targets": [{"key": "local", "label": "Desktop notification"}]})


@app.get("/api/cron/blueprints")
async def blueprints(request: Request):
    return _guard(request, {"blueprints": [
        {"key": "morning-brief", "name": "Morning briefing", "fields": [
            {"name": "city", "label": "City", "type": "text", "required": True, "default": "Lisbon"},
            {"name": "focus", "label": "Focus areas", "type": "textarea"},
        ]},
    ]})


@app.post("/api/cron/blueprints/instantiate")
async def blueprint_instantiate(request: Request):
    return _guard(request, {"ok": True, "job": {"id": "job-brief-2", "name": "Morning briefing"}})


@app.get("/api/skills")
async def skills(request: Request):
    return _guard(request, {"skills": SKILLS})


@app.put("/api/skills/toggle")
async def skills_toggle(request: Request):
    body = await request.json()
    for skill in SKILLS:
        if skill["name"] == body.get("name"):
            skill["enabled"] = bool(body.get("enabled"))
            return _guard(request, {"ok": True})
    return JSONResponse({"detail": "Unknown skill"}, status_code=404)


@app.get("/api/model/info")
async def model_info(request: Request):
    return _guard(request, {"model": "hermes-4o", "provider": "fake", "effective_context_length": "200k"})


@app.get("/api/model/options")
async def model_options(request: Request):
    return _guard(request, {"providers": [
        {"slug": "fake", "name": "Fake", "models": ["hermes-4o", "hermes-4-flash"]},
        {"slug": "go", "name": "Go", "models": ["expensive-model"]},
    ]})


@app.get("/api/model/auxiliary")
async def model_auxiliary(request: Request):
    return _guard(request, {"tasks": [{"task": "profile_describer", "label": "Profile describer", "model": "hermes-4-flash"}]})


@app.post("/api/model/set")
async def model_set(request: Request):
    body = await request.json()
    if str(body.get("model")) == "expensive-model" and not body.get("confirm_expensive_model"):
        return _guard(request, {"ok": True, "confirm_required": True, "confirm_message": "This model is pricey. Continue?"})
    return _guard(request, {"ok": True})


@app.get("/api/mcp/servers")
async def mcp_servers(request: Request):
    return _guard(request, {"servers": MCP})


@app.post("/api/mcp/servers/{name}/test")
async def mcp_test(name: str, request: Request):
    return _guard(request, {"ok": True, "tools": [{"name": "read_file"}, {"name": "write_file"}]})


@app.put("/api/mcp/servers/{name}/enabled")
async def mcp_enabled(name: str, request: Request):
    body = await request.json()
    for server in MCP:
        if server["name"] == name:
            server["enabled"] = bool(body.get("enabled"))
            return _guard(request, {"ok": True})
    return JSONResponse({"detail": "Unknown server"}, status_code=404)


@app.get("/api/config")
async def config(request: Request):
    return _guard(request, {
        "memory": {"provider": "filesystem", "curator": {"enabled": True}},
        "tools": {"approval": {"escalation": "ask"}, "scan_token": "sk-very-secret"},
        "terminal": {"backend": "local", "cwd": "~", "shell": "/bin/zsh"},
        "subagents": {"max_subagents": 3, "delegation": {"timeout": 300}},
        "context": {"context_length": "200k", "compression": {"threshold": 0.75}},
    })


# ── gateway WebSocket (JSON-RPC 2.0, mirrors the contract shapes) ─────────────────────────────

class Gateway:
    def __init__(self, ws: WebSocket):
        self.ws = ws
        self.seq = 0
        self.sessions: dict[str, dict] = {}  # runtime -> {"stored", "messages", "task"}
        self.pending: dict[str, asyncio.Future] = {}  # frame id -> result
        self.pending_requests: dict[str, asyncio.Future] = {}  # request_id -> result
        self.srq = 0
        self.heartbeat_task = None

    async def send(self, frame: dict):
        await self.ws.send_text(json.dumps(frame))

    def next_seq(self) -> int:
        self.seq += 1
        return self.seq

    async def event(self, type_: str, session_id: str = "", payload: dict | None = None):
        params = {"type": type_, "session_id": session_id, "seq": self.next_seq()}
        if payload is not None:
            params["payload"] = payload
        await self.send({"jsonrpc": "2.0", "method": "event", "params": params})

    async def reply(self, frame_id, result=None, error=None):
        body = {"jsonrpc": "2.0", "id": frame_id}
        if error is not None:
            body["error"] = error
        else:
            body["result"] = result if result is not None else {}
        await self.send(body)

    async def server_request(self, method: str, params: dict, timeout: float = 60.0):
        self.srq += 1
        request_id = params.get("request_id") or f"srq-{self.srq}"
        frame_id = f"{request_id}-{uuid.uuid4().hex[:6]}"
        params = dict(params, request_id=request_id)
        future = asyncio.get_running_loop().create_future()
        self.pending[frame_id] = future
        self.pending_requests[request_id] = future
        await self.send({"jsonrpc": "2.0", "id": frame_id, "method": method, "params": params})
        try:
            return await asyncio.wait_for(future, timeout)
        finally:
            self.pending.pop(frame_id, None)
            self.pending_requests.pop(request_id, None)

    def snapshot(self, runtime: str, info=None) -> dict:
        session = self.sessions[runtime]
        messages = [dict(m) for m in session["messages"]]
        return {
            "session_id": runtime,
            "stored_session_id": session["stored"],
            "message_count": len(messages),
            "messages": messages,
            "info": dict(info or dict(LIVE_INFO, running=session["running"])),
            "running": session["running"],
            "status": "working" if session["running"] else "idle",
            "inflight": None,
            "open_requests": [],
        }


async def run_turn(gw: Gateway, runtime: str, text: str):
    """A scripted turn: status, streamed reply, tool call with approval, interim, final."""
    session = gw.sessions[runtime]
    session["running"] = True
    session["messages"].append({"role": "user", "content": text, "timestamp": time.time()})
    try:
        await gw.event("sessions.changed", "", {})
        await asyncio.sleep(0.25)
        await gw.event("status.update", runtime, {"kind": "status", "text": "Working on it…"})
        await gw.event("message.start", runtime, {})
        for chunk in ("Here's what I found on ", "your question: the staging stack is "):
            await asyncio.sleep(0.15)
            await gw.event("message.delta", runtime, {"text": chunk})
        await asyncio.sleep(0.2)
        await gw.event("tool.start", runtime, {"tool_id": "t1", "name": "terminal", "preview": "kubectl logs deploy/web", "args_text": "kubectl logs deploy/web"})

        answer = await gw.server_request("approval", {
            "gateway_session_id": runtime,
            "session_id": runtime,
            "command": "kubectl logs deploy/web --since=1h",
            "description": "Read the staging deploy logs over SSH.",
            "tool_name": "terminal",
            "choices": ["once", "session", "always", "deny"],
        })
        if (answer or {}).get("choice") == "deny":
            await gw.event("tool.complete", runtime, {"tool_id": "t1", "name": "terminal", "status": "error", "error": "Approval denied."})
            for chunk in ("I skipped the log read because you denied it. ", "Anything else?"):
                await asyncio.sleep(0.1)
                await gw.event("message.delta", runtime, {"text": chunk})
            await gw.event("message.complete", runtime, {
                "text": f"Skipped reading the staging logs after your denial. (echo: {text})",
                "status": "complete",
                "usage": {"input_tokens": 91, "output_tokens": 33},
            })
            await gw.event("sessions.changed", "", {})
            return

        await asyncio.sleep(0.35)
        await gw.event("tool.complete", runtime, {
            "tool_id": "t1", "name": "terminal", "duration_s": 0.7,
            "result": "web-ft4-7f Ready. 4d 2h uptime; 1 warning (slow query); 0 restarts.",
            "summary": "1 warning, 0 restarts",
        })
        await gw.event("message.interim", runtime, {"text": "Checked the staging logs.", "already_streamed": False})
        await asyncio.sleep(0.25)
        await gw.event("message.start", runtime, {})
        for chunk in ("From the staging logs: ", "one slow query warning, no restarts this week. "):
            await asyncio.sleep(0.12)
            await gw.event("message.delta", runtime, {"text": chunk})
        final = f"Summary of the staging deploy: 1 slow query warning, 0 restarts. (echo: {text})"
        await gw.event("message.complete", runtime, {
            "text": final, "status": "complete",
            "usage": {"input_tokens": 120, "output_tokens": 80},
        })
        session["messages"].append({"role": "assistant", "content": final, "timestamp": time.time()})
        await gw.event("sessions.changed", "", {})
    finally:
        session["running"] = False
        await gw.event("session.info", runtime, {"profile_name": "default", "running": False, "model": "hermes-4o"})


async def gateway_logic(ws: WebSocket):
    gw = Gateway(ws)
    ticket = ws.query_params.get("ticket") or ""
    token = ws.query_params.get("token") or ""
    if not ((ticket and ticket in TICKETS) or (token == TOKEN)):
        await ws.close(code=4401)
        return
    TICKETS.discard(ticket)
    await ws.accept()
    await gw.event("gateway.ready", "", {"skin": {"name": "default", "colors": {}, "branding": {}}, "change_events": True, "replay_epoch": REPLAY_EPOCH, "heartbeat": True, "session_authority": True})
    counter = {"n": 0}

    async def heartbeat():
        while True:
            await asyncio.sleep(10)
            await gw.send({"jsonrpc": "2.0", "id": f"hb-{gw.next_seq()}", "method": "ping", "params": {}})

    gw.heartbeat_task = asyncio.create_task(heartbeat())
    try:
        while True:
            raw = await ws.receive_text()
            try:
                frame = json.loads(raw)
            except ValueError:
                continue
            method = frame.get("method")
            frame_id = frame.get("id")
            params = frame.get("params") or {}

            # Answers to our server→client requests.
            if frame_id is not None and not method and frame_id in gw.pending:
                future = gw.pending.pop(frame_id)
                if not future.done():
                    if "error" in frame:
                        future.set_result({"choice": "deny", "error": frame["error"]})
                    else:
                        future.set_result(frame.get("result") or {})
                continue

            if method == "approval.respond":
                session = gw.sessions.get(params.get("session_id") or "")
                asyncio.create_task(_settle_approval(gw, params))
                await gw.reply(frame_id, {"ok": True})
            elif method == "client.capabilities":
                await gw.reply(frame_id, {"server_requests": True, "ok": True})
            elif method in ("ping", "gateway.ping"):
                await gw.reply(frame_id, {"ok": True, "pong": time.time()})
            elif method == "session.create":
                counter["n"] += 1
                runtime = f"run-fake-{counter['n']}-{uuid.uuid4().hex[:6]}"
                gw.sessions[runtime] = {"stored": f"20260602_s{counter['n']}", "messages": [], "running": False, "task": None}
                result = gw.snapshot(runtime)
                await gw.reply(frame_id, result)
            elif method == "session.resume":
                stored = params.get("session_id") or ""
                runtime = next((k for k, v in gw.sessions.items() if v["stored"] == stored), None)
                if runtime is None and stored in MESSAGES:
                    counter["n"] += 1
                    runtime = f"run-fake-{counter['n']}-{uuid.uuid4().hex[:6]}"
                    gw.sessions[runtime] = {"stored": stored, "messages": list(MESSAGES[stored]), "running": False, "task": None}
                if runtime is None:
                    await gw.reply(frame_id, None, {"code": 4040, "message": f"Session '{stored}' not found."})
                    continue
                await gw.reply(frame_id, gw.snapshot(runtime))
            elif method == "session.events.since":
                await gw.reply(frame_id, {"truncated": False, "epoch": REPLAY_EPOCH, "latest_seq": gw.seq, "events": [], "open_requests": []})
            elif method == "prompt.submit":
                runtime = params.get("session_id") or ""
                session = gw.sessions.get(runtime)
                if session is None:
                    await gw.reply(frame_id, None, {"code": 4040, "message": "Session not attached."})
                    continue
                session["task"] = asyncio.create_task(run_turn(gw, runtime, str(params.get("text") or "")))
                await gw.reply(frame_id, {"status": "streaming", "user_row_id": counter["n"] * 10 + 7})
            elif method == "session.interrupt":
                runtime = params.get("session_id") or ""
                session = gw.sessions.get(runtime)
                task = session and session.get("task")
                if task:
                    task.cancel()
                    session["task"] = None
                # The canceled turn can't answer its open request anymore: withdraw it like the
                # real server does, so the client card clears instead of hanging.
                open_ids = list(gw.pending_requests.keys())
                if open_ids:
                    for request_id in open_ids:
                        f = gw.pending_requests.pop(request_id, None)
                        if f and not f.done():
                            f.set_result({"choice": "deny", "cancelled": True})
                    await gw.event("request.cancel", runtime, {"request_ids": open_ids})
                await gw.reply(frame_id, {"ok": True})
                await gw.event("message.complete", runtime, {"text": "Turn interrupted.", "status": "interrupted"})
            elif method == "groups.capabilities":
                await gw.reply(frame_id, {"driver": "hosted", "methods": ["groups.capabilities", "groups.list", "groups.create", "groups.state", "groups.log", "groups.send"], "seatable_profiles": ["default", "work"]})
            elif method == "groups.list":
                await gw.reply(frame_id, {"rooms": [dict(ROOMS[r]) for r in ROOMS]})
            elif method == "groups.create":
                room_id = params.get("room_id") or f"room-{uuid.uuid4().hex[:8]}"
                ROOMS[room_id] = {
                    "room_id": room_id, "name": params.get("name") or "Hermes group",
                    "members": params.get("members") or [], "authority_gateway_id": "gw-fake",
                    "authority_epoch": 1, "revision": 1, "created_at": time.time(), "updated_at": time.time(), "latest_seq": 0,
                }
                ROOM_EVENTS[room_id] = []
                await gw.reply(frame_id, dict(ROOMS[room_id]))
            elif method in ("groups.log", "groups.state"):
                room_id = params.get("room_id") or ""
                room = dict(ROOMS.get(room_id, {}))
                entries = list(ROOM_EVENTS.get(room_id, []))
                await gw.reply(frame_id, {"room": room, "entries": entries} if method == "groups.log" else {"room": room, "members_activity": []})
            elif method == "groups.send":
                room_id = params.get("room_id") or ""
                if room_id not in ROOMS:
                    await gw.reply(frame_id, None, {"code": 4040, "message": f"Room '{room_id}' not found."})
                    continue
                text = str((params.get("payload") or {}).get("text") or "")
                next_seq = ROOMS[room_id].get("latest_seq", 0) + 1
                ROOMS[room_id]["latest_seq"] = next_seq
                ROOM_EVENTS.setdefault(room_id, []).append({
                    "room_id": room_id, "seq": next_seq,
                    "event_id": params.get("event_id") or f"ev-{uuid.uuid4().hex[:6]}", "kind": "message",
                    "actor": {"kind": "user", "id": "sam"}, "payload": {"text": text}, "created_at": time.time(),
                })
                await gw.reply(frame_id, {"ok": True})
            else:
                await gw.reply(frame_id, None, {"code": -32601, "message": f"Method not implemented by fake: {method}"})
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        gw.heartbeat_task.cancel()


async def _settle_approval(gw: Gateway, params: dict):
    """Resolve the pending server request whose request_id matches ``approval.respond``."""
    request_id = params.get("request_id")
    future = gw.pending_requests.pop(request_id or "", None)
    if future is None:
        # No id given: the fake only allows one open request at a time.
        future = next((f for f in gw.pending_requests.values() if not f.done()), None)
        if future is not None:
            for key, f in list(gw.pending_requests.items()):
                if f is future:
                    gw.pending_requests.pop(key, None)
                    break
    if future and not future.done():
        future.set_result({"choice": params.get("choice", "deny")})
    try:
        await gw.event("approval.settled", "", {"request_id": request_id})
    except Exception:
        pass


@app.websocket("/api/ws")
async def ws_endpoint(ws: WebSocket):
    await gateway_logic(ws)


if __name__ == "__main__":
    import sys

    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=int(sys.argv[1]) if len(sys.argv) > 1 else 8011, log_level="warning")
