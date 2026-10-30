"""Backend-for-frontend for a Hermes dashboard: Hermes stays the auth authority; the browser only
gets an opaque app cookie. Upstream session material is Fernet-encrypted in MongoDB."""
import asyncio
import json
import os
import secrets
import time
from datetime import datetime, timedelta, timezone
from hashlib import sha256
from http.cookies import SimpleCookie
from typing import Any, Literal, Optional

import httpx
from cryptography.fernet import Fernet
from fastapi import APIRouter, HTTPException, Path, Query, Request, Response
from pydantic import BaseModel, Field, SecretStr

COOKIE = "aura_session"
SESSION_DAYS = 7
TIMEOUT = httpx.Timeout(10.0, connect=6.0)
# Never set in production: opt-in plain-HTTP deployments/self-hosted LAN setups skip the
# Secure attribute on the app cookie (browsers require HTTPS for Secure anyway).
COOKIE_SECURE = os.environ.get("AURA_INSECURE_COOKIES", "") != "1"
router = APIRouter(prefix="/api/hermes")
_fernet = Fernet(os.environ["AURA_UPSTREAM_KEY"].encode())
_pepper = os.environ["AURA_SESSION_PEPPER"]
_hits: dict[str, list[float]] = {}
_locks: dict[str, asyncio.Lock] = {}
db = None


def init(database):
    global db
    db = database


async def ensure_indexes():
    await db.hermes_app_sessions.create_index("expires_at", expireAfterSeconds=0)


def hermes_url() -> Optional[str]:
    url = (os.environ.get("HERMES_DASHBOARD_URL") or "").strip().rstrip("/")
    return url or None


def _require_url() -> str:
    url = hermes_url()
    if not url:
        raise HTTPException(503, "Hermes address isn't set up yet.")
    return url


def _digest(raw: str) -> str:
    return sha256(f"{_pepper}:{raw}".encode()).hexdigest()


def _client_ip(request: Request) -> str:
    # Right-most entry is the one appended by our own ingress; earlier entries are client-controlled.
    hops = [h.strip() for h in request.headers.get("x-forwarded-for", "").split(",") if h.strip()]
    return hops[-1] if hops else (request.client.host if request.client else "unknown")


def _rate_ok(ip: str, limit: int = 5, window: float = 60.0) -> bool:
    now = time.monotonic()
    recent = [t for t in _hits.get(ip, []) if now - t < window]
    allowed = len(recent) < limit
    if allowed:
        recent.append(now)
    _hits[ip] = recent
    return allowed


def _merge_set_cookies(resp: httpx.Response, jar: dict) -> dict:
    out = dict(jar)
    for line in resp.headers.get_list("set-cookie"):
        parsed = SimpleCookie()
        try:
            parsed.load(line)
        except Exception:
            continue
        for name, morsel in parsed.items():
            if "hermes_" not in name:
                continue
            if morsel.value == "" or morsel["max-age"] == "0":
                out.pop(name, None)
            else:
                out[name] = morsel.value
    return out


def _upstream_headers(auth: dict) -> dict:
    if auth.get("bearer"):
        return {"Authorization": f"Bearer {auth['bearer']}", "X-Hermes-Session-Token": auth["bearer"]}
    jar = auth.get("cookies") or {}
    return {"Cookie": "; ".join(f"{k}={v}" for k, v in jar.items())} if jar else {}


def _encrypt(auth: dict) -> str:
    return _fernet.encrypt(json.dumps(auth).encode()).decode()


def _decrypt(blob: str) -> dict:
    return json.loads(_fernet.decrypt(blob.encode()).decode())


async def _load_session(request: Request):
    raw = request.cookies.get(COOKIE)
    if not raw:
        raise HTTPException(401, "Sign in to Hermes first.")
    doc = await db.hermes_app_sessions.find_one({"_id": _digest(raw)})
    if not doc:
        raise HTTPException(401, "Sign in to Hermes first.")
    if doc["expires_at"].replace(tzinfo=timezone.utc) <= datetime.now(timezone.utc):
        raise HTTPException(401, "Your Hermes sign-in has expired.")
    return doc["_id"], _decrypt(doc["auth"]), doc


def _is_session_expired(resp: httpx.Response) -> bool:
    return resp.status_code == 401


async def _hermes_get(request: Request, path: str, params: Optional[dict] = None):
    """Authenticated read against Hermes; persists rotated cookies; ends the app session on 401."""
    raw = request.cookies.get(COOKIE)
    lock = _locks.setdefault(_digest(raw), asyncio.Lock()) if raw else asyncio.Lock()
    async with lock:  # one upstream call per app session at a time, so a rotated token is never replayed
        return await _hermes_get_locked(request, path, params)


async def _hermes_get_locked(request: Request, path: str, params: Optional[dict]):
    sid_hash, auth, _ = await _load_session(request)
    url = _require_url()
    async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=False) as c:
        try:
            r = await c.get(f"{url}{path}", params=params, headers=_upstream_headers(auth))
        except httpx.HTTPError:
            raise HTTPException(502, "Can't reach your Hermes server.")
    if "cookies" in auth:
        rotated = _merge_set_cookies(r, auth["cookies"])
        if rotated != auth["cookies"]:
            await db.hermes_app_sessions.update_one({"_id": sid_hash}, {"$set": {"auth": _encrypt({"cookies": rotated})}})
    if _is_session_expired(r) or r.status_code in (302, 303, 307):
        await db.hermes_app_sessions.delete_one({"_id": sid_hash})
        raise HTTPException(401, "Hermes ended this sign-in. Please sign in again.")
    if r.status_code == 404:
        raise HTTPException(404, "Not found on your Hermes server.")
    if r.status_code >= 400:
        raise HTTPException(502, f"Hermes returned an error ({r.status_code}).")
    return r.json()


async def _hermes_write(request: Request, path: str, *, method: str = "POST",
                        body: Optional[dict] = None, params: Optional[dict] = None):
    """Authenticated write for an explicit route, with the same cookie-rotation lock as reads."""
    raw = request.cookies.get(COOKIE)
    lock = _locks.setdefault(_digest(raw), asyncio.Lock()) if raw else asyncio.Lock()
    async with lock:
        sid_hash, auth, _ = await _load_session(request)
        url = _require_url()
        async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=False) as client:
            try:
                response = await client.request(
                    method, f"{url}{path}", json=body, params=params,
                    headers=_upstream_headers(auth),
                )
            except httpx.HTTPError:
                raise HTTPException(502, "Can't reach your Hermes server.")
        if "cookies" in auth:
            rotated = _merge_set_cookies(response, auth["cookies"])
            if rotated != auth["cookies"]:
                await db.hermes_app_sessions.update_one(
                    {"_id": sid_hash}, {"$set": {"auth": _encrypt({"cookies": rotated})}}
                )
        if _is_session_expired(response) or response.status_code in (302, 303, 307):
            await db.hermes_app_sessions.delete_one({"_id": sid_hash})
            raise HTTPException(401, "Hermes ended this sign-in. Please sign in again.")
        if response.status_code == 404:
            raise HTTPException(404, "This capability isn't exposed by your Hermes server.")
        if response.status_code >= 400:
            detail = response.json().get("detail") if "json" in response.headers.get("content-type", "") else None
            raise HTTPException(502, detail or f"Hermes returned an error ({response.status_code}).")
        if not response.content:
            return {"ok": True}
        return response.json()


async def _public_get(c: httpx.AsyncClient, url: str, path: str):
    try:
        r = await c.get(f"{url}{path}")
        return r.status_code, (r.json() if "json" in r.headers.get("content-type", "") else None)
    except httpx.HTTPError:
        return None, None


@router.get("/connection")
async def connection(request: Request):
    url = hermes_url()
    out = {"configured": bool(url), "reachable": False, "signed_in": False}
    if not url:
        return out
    async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=False) as c:
        code, status = await _public_get(c, url, "/api/status")
        if code != 200 or not isinstance(status, dict):
            out["error"] = "unreachable" if code is None else f"status_{code}"
            return out
        pcode, providers = await _public_get(c, url, "/api/auth/providers")
    names = status.get("auth_providers") or []
    out.update({
        "reachable": True,
        "version": status.get("version"),
        "release_date": status.get("release_date"),
        "auth_required": bool(status.get("auth_required")),
        "providers": (providers or {}).get("providers", []) if pcode == 200 else [],
        "token_login": (not status.get("auth_required")) or "session-token" in names,
    })
    raw = request.cookies.get(COOKIE)
    if raw:
        doc = await db.hermes_app_sessions.find_one({"_id": _digest(raw)}, {"user": 1})
        if doc:
            out.update({"signed_in": True, "user": doc.get("user")})
    return out


class LoginBody(BaseModel):
    method: Literal["password", "token"]
    provider: Optional[str] = Field(default=None, max_length=128)
    username: Optional[str] = Field(default=None, max_length=256)
    password: Optional[SecretStr] = None
    token: Optional[SecretStr] = None


async def _verify_me(c: httpx.AsyncClient, url: str, auth: dict) -> Optional[dict]:
    r = await c.get(f"{url}/api/auth/me", headers=_upstream_headers(auth))
    if r.status_code != 200:
        return None
    me = r.json()
    if "cookies" in auth:
        auth["cookies"] = _merge_set_cookies(r, auth["cookies"])
    return {k: me.get(k) for k in ("user_id", "email", "display_name", "provider")}


@router.post("/login")
async def login(body: LoginBody, request: Request, response: Response):
    if not _rate_ok(_client_ip(request)) or not _rate_ok(f"user:{(body.username or '').lower()}", limit=10):
        raise HTTPException(429, "Too many sign-in attempts. Wait a minute and try again.")
    url = _require_url()
    async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=False) as c:
        try:
            if body.method == "password":
                if not (body.provider and body.username and body.password):
                    raise HTTPException(400, "Enter your Hermes username and password.")
                r = await c.post(f"{url}/auth/password-login", json={
                    "provider": body.provider, "username": body.username,
                    "password": body.password.get_secret_value()})
                if r.status_code in (401, 404):
                    raise HTTPException(401, "Hermes didn't accept those sign-in details.")
                if r.status_code == 429:
                    raise HTTPException(429, "Hermes is rate-limiting sign-ins. Try again shortly.")
                if r.status_code >= 400:
                    raise HTTPException(502, f"Hermes sign-in failed ({r.status_code}).")
                auth = {"cookies": _merge_set_cookies(r, {})}
                if not auth["cookies"]:
                    raise HTTPException(502, "Hermes didn't return a session.")
            else:
                if not body.token:
                    raise HTTPException(400, "Enter your Hermes session token.")
                auth = {"bearer": body.token.get_secret_value().strip()}
            user = await _verify_me(c, url, auth)
        except httpx.HTTPError:
            raise HTTPException(502, "Can't reach your Hermes server.")
    if not user:
        raise HTTPException(401, "Hermes didn't accept those sign-in details.")
    raw = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    await db.hermes_app_sessions.insert_one({
        "_id": _digest(raw), "auth": _encrypt(auth), "method": body.method, "user": user,
        "created_at": now, "expires_at": now + timedelta(days=SESSION_DAYS)})
    response.set_cookie(COOKIE, raw, max_age=SESSION_DAYS * 86400, path="/api",
                        secure=COOKIE_SECURE, httponly=True, samesite="lax")
    return {"ok": True, "user": user}


@router.post("/logout")
async def logout(request: Request, response: Response):
    raw = request.cookies.get(COOKIE)
    url = hermes_url()
    if raw:
        doc = await db.hermes_app_sessions.find_one({"_id": _digest(raw)})
        if doc:
            auth = _decrypt(doc["auth"])
            if url and "cookies" in auth:
                try:
                    async with httpx.AsyncClient(timeout=TIMEOUT) as c:
                        await c.post(f"{url}/auth/logout", headers=_upstream_headers(auth))
                except httpx.HTTPError:
                    pass
            await db.hermes_app_sessions.delete_one({"_id": doc["_id"]})
    response.delete_cookie(COOKIE, path="/api", secure=COOKIE_SECURE, httponly=True, samesite="lax")
    return {"ok": True}


@router.get("/overview")
async def overview(request: Request):
    status = await _hermes_get(request, "/api/status")
    try:
        active = await _hermes_get(request, "/api/profiles/active")
    except HTTPException as e:
        if e.status_code == 401:
            raise
        active = {}
    _, _, doc = await _load_session(request)
    return {
        "user": doc.get("user"),
        "version": status.get("version"),
        "release_date": status.get("release_date"),
        "current_profile": active.get("current"),
        "active_profile": active.get("active"),
        "profiles": [p.get("name") if isinstance(p, dict) else p for p in (status.get("profiles") or [])],
        "gateway_running": status.get("gateway_running"),
        "gateway_platforms": status.get("gateway_platforms") or {},
        "gateway_state": status.get("gateway_state"),
        "active_sessions": status.get("active_sessions"),
    }


def _with_profile(params: dict, profile: str | None) -> dict:
    return {**params, "profile": profile} if profile else params


@router.get("/sessions")
async def sessions(request: Request, limit: int = Query(50, ge=1, le=100), offset: int = Query(0, ge=0),
                   profile: str | None = Query(None, max_length=64)):
    data = await _hermes_get(request, "/api/sessions", _with_profile({"limit": limit, "offset": offset, "order": "recent"}, profile))
    keep = ("id", "title", "preview", "started_at", "last_active", "is_active", "message_count", "source", "model")
    return {"sessions": [{k: s.get(k) for k in keep} for s in data.get("sessions", [])], "total": data.get("total", 0)}


@router.get("/sessions/search")
async def search(request: Request, q: str = Query(..., min_length=1, max_length=200),
                 profile: str | None = Query(None, max_length=64)):
    data = await _hermes_get(request, "/api/sessions/search", _with_profile({"q": q, "limit": 30}, profile))
    keep = ("session_id", "title", "snippet", "last_active", "session_started")
    return {"results": [{k: r.get(k) for k in keep} for r in data.get("results", [])]}


@router.get("/sessions/{session_id}/messages")
async def messages(request: Request, session_id: str = Path(max_length=200),
                   profile: str | None = Query(None, max_length=64)):
    from urllib.parse import quote
    data = await _hermes_get(request, f"/api/sessions/{quote(session_id, safe='')}/messages",
                             _with_profile({"order": "latest", "inline_images": "false"}, profile))
    return {"session_id": data.get("session_id"), "messages": data.get("messages", [])}


# Explicit advanced-surface routes. These are deliberately not an open upstream proxy.
def _items(data, *keys: str) -> list:
    """Accept both list responses and the keyed envelopes used by Hermes releases."""
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for key in keys:
            if isinstance(data.get(key), list):
                return data[key]
    return []


def _redacted(value, key: str = ""):
    if any(word in key.lower() for word in ("token", "secret", "password", "api_key", "credential")):
        return "[stored securely on Hermes]" if value else value
    if isinstance(value, dict):
        return {k: _redacted(v, k) for k, v in value.items()}
    if isinstance(value, list):
        return [_redacted(item) for item in value]
    return value


_CONFIG_SECTIONS = {
    "memory": ("memory", "memories"),
    "subagents": ("subagents", "delegation", "max_subagents"),
    "tools": ("tools", "toolsets", "approval", "approvals"),
    "terminal": ("terminal", "terminal_backend", "workdir", "cwd"),
    "context": ("context", "context_files", "context_length", "compression"),
}


async def _hermes_get_many(request: Request, calls: list[tuple[str, Optional[dict]]]):
    """Read several paths under one session load / cookie-rotation pass (review #9: tab latency)."""
    raw = request.cookies.get(COOKIE)
    lock = _locks.setdefault(_digest(raw), asyncio.Lock()) if raw else asyncio.Lock()
    async with lock:
        sid_hash, auth, _ = await _load_session(request)
        url = _require_url()
        async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=False) as c:
            try:
                responses = await asyncio.gather(
                    *(c.get(f"{url}{path}", params=params, headers=_upstream_headers(auth))
                      for path, params in calls)
                )
            except httpx.HTTPError:
                raise HTTPException(502, "Can't reach your Hermes server.")
        if "cookies" in auth:
            rotated = auth["cookies"]
            for r in responses:
                rotated = _merge_set_cookies(r, rotated)
            if rotated != auth["cookies"]:
                await db.hermes_app_sessions.update_one(
                    {"_id": sid_hash}, {"$set": {"auth": _encrypt({"cookies": rotated})}}
                )
        for r in responses:
            if _is_session_expired(r) or r.status_code in (302, 303, 307):
                await db.hermes_app_sessions.delete_one({"_id": sid_hash})
                raise HTTPException(401, "Hermes ended this sign-in. Please sign in again.")
            if r.status_code == 404:
                raise HTTPException(404, "Not found on your Hermes server.")
            if r.status_code >= 400:
                raise HTTPException(502, f"Hermes returned an error ({r.status_code}).")
        return [r.json() for r in responses]


@router.get("/settings/{section}")
async def settings_section(request: Request, section: Literal[
    "skills", "memory", "models", "subagents", "tools", "mcp", "terminal", "context", "schedules"
], profile: str | None = Query(None, max_length=64)):
    params = _with_profile({}, profile)
    if section == "skills":
        data = await _hermes_get(request, "/api/skills", params)
        return {"section": section, "skills": _items(data, "skills", "items")}
    if section == "models":
        (info, options, auxiliary) = await _hermes_get_many(
            request,
            [("/api/model/info", params), ("/api/model/options", params), ("/api/model/auxiliary", params)],
        )
        return {"section": section, "info": info, "options": options, "auxiliary": auxiliary}
    if section == "mcp":
        return await _hermes_get(request, "/api/mcp/servers", params)
    if section == "schedules":
        data = await _hermes_get(request, "/api/cron/jobs", {"profile": profile or "all"})
        targets = await _hermes_get(request, "/api/cron/delivery-targets", params)
        return {"section": section, "jobs": _items(data, "jobs", "items"), **targets}
    config = await _hermes_get(request, "/api/config", params)
    if section == "context":
        model = await _hermes_get(request, "/api/model/info", params)
    else:
        model = None
    keys = _CONFIG_SECTIONS[section]
    selected = {key: _redacted(config[key]) for key in keys if key in config}
    return {"section": section, "config": selected, "model": model}


class ToggleBody(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    enabled: bool
    profile: Optional[str] = Field(default=None, max_length=64)


@router.put("/settings/skills/toggle")
async def settings_skill_toggle(body: ToggleBody, request: Request):
    return await _hermes_write(
        request, "/api/skills/toggle", method="PUT", body=body.dict(exclude_none=True)
    )


class ModelBody(BaseModel):
    provider: str = Field(default="", max_length=128)
    model: str = Field(min_length=1, max_length=256)
    scope: Literal["main", "auxiliary"] = "main"
    task: Optional[str] = Field(default=None, max_length=128)
    profile: Optional[str] = Field(default=None, max_length=64)
    confirm_expensive_model: bool = False


@router.post("/settings/models/set")
async def settings_model_set(body: ModelBody, request: Request):
    # API keys and arbitrary base URLs intentionally cannot be supplied through this route.
    return await _hermes_write(request, "/api/model/set", body=body.dict(exclude_none=True))


@router.post("/settings/mcp/{name}/test")
async def settings_mcp_test(request: Request, name: str = Path(max_length=200),
                            profile: str | None = Query(None, max_length=64)):
    from urllib.parse import quote
    return await _hermes_write(
        request, f"/api/mcp/servers/{quote(name, safe='')}/test", params=_with_profile({}, profile)
    )


@router.put("/settings/mcp/{name}/enabled")
async def settings_mcp_enabled(body: ToggleBody, request: Request, name: str = Path(max_length=200)):
    from urllib.parse import quote
    if body.name != name:
        raise HTTPException(400, "MCP server name mismatch.")
    return await _hermes_write(
        request, f"/api/mcp/servers/{quote(name, safe='')}/enabled", method="PUT",
        body={"enabled": body.enabled, **({"profile": body.profile} if body.profile else {})},
    )


class ScheduleAction(BaseModel):
    action: Literal["pause", "resume", "trigger"]
    profile: Optional[str] = Field(default=None, max_length=64)


@router.post("/settings/schedules/{job_id}/action")
async def settings_schedule_action(body: ScheduleAction, request: Request,
                                   job_id: str = Path(max_length=200)):
    from urllib.parse import quote
    return await _hermes_write(
        request, f"/api/cron/jobs/{quote(job_id, safe='')}/{body.action}",
        params=_with_profile({}, body.profile),
    )


def _message_text(message: dict) -> str:
    content = message.get("text") if message.get("text") is not None else message.get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(part.get("text", "") for part in content if isinstance(part, dict))
    return ""


@router.get("/briefing")
async def briefing(request: Request, profile: str | None = Query(None, max_length=64)):
    data = await _hermes_get(request, "/api/cron/jobs", {"profile": profile or "all"})
    jobs = _items(data, "jobs", "items")
    candidates = [job for job in jobs if "brief" in str(job.get("name") or job.get("title") or "").lower()]
    if not candidates:
        return {"job": None, "run": None, "content": None}
    job = candidates[0]
    from urllib.parse import quote
    job_id = str(job.get("id") or job.get("job_id"))
    owner = job.get("profile") or profile
    run_data = await _hermes_get(
        request, f"/api/cron/jobs/{quote(job_id, safe='')}/runs",
        _with_profile({"limit": 1}, owner),
    )
    runs = _items(run_data, "runs", "items")
    run = runs[0] if runs else None
    content = None
    content_kind = None
    if run:
        if run.get("source") == "cron_output":
            content = run.get("preview")
            content_kind = "preview"
        else:
            try:
                run_session_id = run.get("session_id") or run.get("id")
                if not run_session_id:
                    raise KeyError("session_id")
                messages_data = await _hermes_get(
                    request, f"/api/sessions/{quote(str(run_session_id), safe='')}/messages",
                    _with_profile({"order": "latest", "inline_images": "false"}, owner),
                )
                assistant = [m for m in messages_data.get("messages", []) if m.get("role") == "assistant"]
                content = _message_text(assistant[-1]) if assistant else None
                content_kind = "message"
            except HTTPException as error:
                if error.status_code == 401:
                    raise
                content = run.get("preview")
                content_kind = "preview"
            except KeyError:
                content = run.get("preview")
                content_kind = "preview"
    return {"job": job, "run": run, "content": content, "content_kind": content_kind}


@router.get("/briefing/blueprints")
async def briefing_blueprints(request: Request, profile: str | None = Query(None, max_length=64)):
    data = await _hermes_get(request, "/api/cron/blueprints", _with_profile({}, profile))
    blueprints = [item for item in _items(data, "blueprints", "items")
                  if "brief" in str(item.get("key") or item.get("name") or item.get("title") or "").lower()]
    return {"blueprints": blueprints}


class BriefingSetup(BaseModel):
    blueprint: str = Field(min_length=1, max_length=200)
    values: dict[str, Any]
    profile: Optional[str] = Field(default=None, max_length=64)


@router.post("/briefing/setup")
async def briefing_setup(body: BriefingSetup, request: Request):
    # Hermes fills its own blueprint and owns the prompt, research, authoring, and delivery.
    return await _hermes_write(
        request, "/api/cron/blueprints/instantiate",
        body={"blueprint": body.blueprint, "values": body.values},
        params=_with_profile({}, body.profile or "default"),
    )


class BriefingTrigger(BaseModel):
    job_id: str = Field(min_length=1, max_length=200)
    profile: Optional[str] = Field(default=None, max_length=64)


@router.post("/briefing/trigger")
async def briefing_trigger(body: BriefingTrigger, request: Request):
    from urllib.parse import quote
    return await _hermes_write(
        request, f"/api/cron/jobs/{quote(body.job_id, safe='')}/trigger",
        params=_with_profile({}, body.profile),
    )


@router.get("/bots")
async def bots(request: Request):
    profiles_data = await _hermes_get(request, "/api/profiles")
    active = await _hermes_get(request, "/api/profiles/active")
    routine_data = await _hermes_get(request, "/api/cron/jobs", {"profile": "all"})
    raw = profiles_data.get("profiles", profiles_data) if isinstance(profiles_data, dict) else profiles_data
    keep = ("name", "display_name", "description", "icon", "color", "is_default", "created_at")
    profiles = [{k: p.get(k) for k in keep if k in p} if isinstance(p, dict) else {"name": p}
                for p in (raw or [])]
    return {"profiles": profiles, "active": active, "routines": _items(routine_data, "jobs", "items"),
            "group_rooms": {"supported": None, "reason": "Check groups.capabilities over the live socket."}}
