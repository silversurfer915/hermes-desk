"""Narrow live bridge: browser <-> FastAPI <-> Hermes ``/api/ws`` (JSON-RPC 2.0).

Upstream credentials never reach the browser. Only the explicit chat/replay methods below
are forwarded; responses to Hermes server requests (approvals, clarify, credentials) are
also relayed so every request remains actionable in the app.
"""

import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone
from urllib.parse import quote, urlparse

import httpx
import websockets
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

import hermes_bff as bff

router = APIRouter(prefix="/api/hermes")
log = logging.getLogger(__name__)

ALLOWED_METHODS = {
    "client.capabilities",
    "ping",
    "session.create",
    "session.resume",
    "session.activate",
    "session.events.since",
    "prompt.submit",
    "session.interrupt",
    "approval.respond",
    "groups.capabilities",
    "groups.list",
    "groups.state",
    "groups.log",
    "groups.create",
    "groups.send",
}
HEARTBEAT_INTERVAL = 15.0
MAX_FRAME = 256 * 1024
MAX_UPSTREAM_FRAME = 8 * 1024 * 1024


async def _session_from_ws(ws: WebSocket):
    raw = ws.cookies.get(bff.COOKIE)
    if not raw:
        return None
    doc = await bff.db.hermes_app_sessions.find_one({"_id": bff._digest(raw)})
    if not doc or doc["expires_at"].replace(tzinfo=timezone.utc) <= datetime.now(timezone.utc):
        return None
    return doc


async def _upstream_ws_url(doc: dict, base: str) -> str | None:
    """Mint a single-use Hermes WS ticket, or use the already encrypted bearer token."""
    auth = bff._decrypt(doc["auth"])
    ws_base = base.replace("https://", "wss://", 1).replace("http://", "ws://", 1)
    if auth.get("bearer"):
        return f"{ws_base}/api/ws?token={quote(auth['bearer'], safe='')}"
    lock = bff._locks.setdefault(doc["_id"], asyncio.Lock())
    async with lock:
        async with httpx.AsyncClient(timeout=bff.TIMEOUT) as client:
            response = await client.post(
                f"{base}/api/auth/ws-ticket", headers=bff._upstream_headers(auth)
            )
        rotated = bff._merge_set_cookies(response, auth["cookies"])
        if rotated != auth["cookies"]:
            await bff.db.hermes_app_sessions.update_one(
                {"_id": doc["_id"]},
                {"$set": {"auth": bff._encrypt({"cookies": rotated})}},
            )
    if response.status_code != 200:
        return None
    return f"{ws_base}/api/ws?ticket={quote(response.json()['ticket'], safe='')}"


def _valid_id(value) -> bool:
    return isinstance(value, (str, int)) and not isinstance(value, bool)


def _client_frame_ok(frame) -> bool:
    if not isinstance(frame, dict) or frame.get("jsonrpc") != "2.0":
        return False
    if "method" in frame:
        return (
            isinstance(frame.get("method"), str)
            and frame["method"] in ALLOWED_METHODS
            and _valid_id(frame.get("id"))
            and isinstance(frame.get("params", {}), dict)
        )
    # Answers to server -> client requests (approval, clarify, sudo/secret, ...).
    return (
        _valid_id(frame.get("id"))
        and ("result" in frame or "error" in frame)
        and ("error" not in frame or isinstance(frame["error"], dict))
    )


async def _rpc(up, method: str, params: dict | None = None) -> None:
    await up.send(
        json.dumps(
            {
                "jsonrpc": "2.0",
                "id": f"hermes-desk-{uuid.uuid4().hex}",
                "method": method,
                "params": params or {},
            }
        )
    )


async def _heartbeat(up, interval: float) -> None:
    while True:
        await asyncio.sleep(interval)
        await _rpc(up, "ping")


async def _pump_client(ws: WebSocket, up) -> None:
    while True:
        text = await ws.receive_text()
        if len(text.encode("utf-8")) > MAX_FRAME:
            continue
        try:
            frame = json.loads(text)
        except (ValueError, TypeError):
            continue
        if _client_frame_ok(frame):
            await up.send(json.dumps(frame, separators=(",", ":")))
        elif isinstance(frame, dict) and _valid_id(frame.get("id")) and "method" in frame:
            await ws.send_text(
                json.dumps(
                    {
                        "jsonrpc": "2.0",
                        "id": frame["id"],
                        "error": {"code": -32601, "message": "Method not allowed by Hermes Desk"},
                    }
                )
            )


async def _pump_upstream(ws: WebSocket, up) -> None:
    heartbeat_task = None
    try:
        async for message in up:
            text = message if isinstance(message, str) else message.decode("utf-8", "replace")
            try:
                frame = json.loads(text)
            except ValueError:
                frame = None
            if isinstance(frame, dict) and frame.get("method") == "event":
                params = frame.get("params") or {}
                if params.get("type") == "gateway.ready":
                    # Hermes only sends approval/clarify/credential requests after this
                    # negotiation. The response is upstream-internal and need not reach the UI.
                    await _rpc(up, "client.capabilities", {"server_requests": True})
                    interval = (params.get("payload") or {}).get("heartbeat")
                    if isinstance(interval, bool):
                        interval = HEARTBEAT_INTERVAL if interval else None
                    if isinstance(interval, (int, float)) and interval > 0 and heartbeat_task is None:
                        heartbeat_task = asyncio.create_task(_heartbeat(up, max(5.0, float(interval))))
                    await ws.send_text(text)
                    continue
            if isinstance(frame, dict) and frame.get("method") == "ping" and _valid_id(frame.get("id")):
                # Upstream transport keepalive: the bridge answers it and keeps the browser
                # wire clean of non-user questions (the UI only renders real requests).
                await up.send(json.dumps({"jsonrpc": "2.0", "id": frame["id"], "result": {"ok": True}}))
                continue
    finally:
        if heartbeat_task:
            heartbeat_task.cancel()
            await asyncio.gather(heartbeat_task, return_exceptions=True)


@router.websocket("/ws")
async def chat_ws(ws: WebSocket):
    base = bff.hermes_url()
    doc = await _session_from_ws(ws) if base else None
    if not doc:
        await ws.close(code=4401)
        return
    await ws.accept()
    try:
        url = await _upstream_ws_url(doc, base)
    except (httpx.HTTPError, KeyError, ValueError, TypeError):
        url = None
    if not url:
        await ws.send_text(
            json.dumps(
                {
                    "jsonrpc": "2.0",
                    "method": "event",
                    "params": {
                        "type": "bridge.error",
                        "payload": {"message": "Hermes refused a live connection. Sign in again."},
                    },
                }
            )
        )
        await ws.close(code=4401)
        return

    parsed = urlparse(base)
    origin = f"{parsed.scheme}://{parsed.netloc}"
    try:
        async with websockets.connect(
            url,
            origin=origin,
            max_size=MAX_UPSTREAM_FRAME,
            open_timeout=10,
            ping_interval=None,
        ) as up:
            tasks = {
                asyncio.create_task(_pump_client(ws, up)),
                asyncio.create_task(_pump_upstream(ws, up)),
            }
            try:
                await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
            finally:
                for task in tasks:
                    task.cancel()
                await asyncio.gather(*tasks, return_exceptions=True)
    except (OSError, websockets.exceptions.WebSocketException, WebSocketDisconnect) as exc:
        log.info("Hermes WS bridge closed: %s", type(exc).__name__)
    try:
        await ws.close()
    except (RuntimeError, WebSocketDisconnect):
        pass
