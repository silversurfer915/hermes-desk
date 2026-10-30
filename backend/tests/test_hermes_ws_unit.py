"""Self-contained bridge tests; no MongoDB, credentials, or public Hermes server required."""

import json
import os
import queue
import threading

from cryptography.fernet import Fernet

# Import-time test-only placeholders; these are not application credentials or a .env file.
os.environ.setdefault("AURA_UPSTREAM_KEY", Fernet.generate_key().decode())
os.environ.setdefault("AURA_SESSION_PEPPER", "unit-test-only")

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from websockets.exceptions import ConnectionClosedOK
from websockets.sync.server import serve

import hermes_ws


@pytest.mark.parametrize(
    "method",
    [
        "session.create",
        "session.resume",
        "session.activate",
        "session.events.since",
        "prompt.submit",
        "session.interrupt",
        "approval.respond",
        "client.capabilities",
        "ping",
    ],
)
def test_allowed_rpc_methods(method):
    assert hermes_ws._client_frame_ok(
        {"jsonrpc": "2.0", "id": "1", "method": method, "params": {}}
    )


@pytest.mark.parametrize(
    "frame",
    [
        None,
        [],
        {"jsonrpc": "1.0", "id": "1", "method": "session.resume"},
        {"jsonrpc": "2.0", "id": True, "method": "session.resume"},
        {"jsonrpc": "2.0", "id": "1", "method": "shell.exec", "params": {}},
        {"jsonrpc": "2.0", "id": "1", "method": "session.resume", "params": []},
        {"jsonrpc": "2.0", "id": "1", "result": {"choice": "once"}, "error": "bad"},
    ],
)
def test_malformed_or_unsafe_frames_are_rejected(frame):
    assert not hermes_ws._client_frame_ok(frame)


def test_server_request_answers_are_allowed():
    assert hermes_ws._client_frame_ok(
        {"jsonrpc": "2.0", "id": "approval-1", "result": {"choice": "always"}}
    )


class FakeUpstream:
    def __init__(self):
        self.received = queue.Queue()

    def handler(self, connection):
        connection.send(
            json.dumps(
                {
                    "jsonrpc": "2.0",
                    "method": "event",
                    "params": {
                        "type": "gateway.ready",
                        "payload": {"heartbeat": 30, "replay_epoch": "test-epoch"},
                    },
                }
            )
        )
        while True:
            try:
                frame = json.loads(connection.recv())
            except ConnectionClosedOK:
                return
            self.received.put(frame)
            if frame.get("method") == "client.capabilities":
                connection.send(json.dumps({"jsonrpc": "2.0", "id": frame["id"], "result": {}}))
                connection.send(
                    json.dumps(
                        {
                            "jsonrpc": "2.0",
                            "id": "approval-1",
                            "method": "approval",
                            "params": {
                                "description": "Run a test command",
                                "choices": ["once", "session", "always", "deny"],
                            },
                        }
                    )
                )
            elif frame.get("method") == "session.resume":
                connection.send(
                    json.dumps(
                        {
                            "jsonrpc": "2.0",
                            "id": frame["id"],
                            "result": {
                                "session_id": "runtime-1",
                                "stored_session_id": "stored-1",
                                "messages": [],
                                "info": {"profile_name": "default"},
                            },
                        }
                    )
                )
                connection.send(
                    json.dumps(
                        {
                            "jsonrpc": "2.0",
                            "method": "event",
                            "params": {
                                "type": "message.delta",
                                "session_id": "runtime-1",
                                "seq": 7,
                                "payload": {"turn_id": "turn-1", "text": "Live from Hermes"},
                            },
                        }
                    )
                )


def test_bridge_negotiates_and_relays_stream_and_approval(monkeypatch):
    upstream = FakeUpstream()
    server = serve(upstream.handler, "127.0.0.1", 0)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    port = server.socket.getsockname()[1]

    async def fake_session(_ws):
        return {"_id": "opaque-session"}

    async def fake_url(_doc, _base):
        return f"ws://127.0.0.1:{port}/api/ws?ticket=single-use"

    monkeypatch.setattr(hermes_ws, "_session_from_ws", fake_session)
    monkeypatch.setattr(hermes_ws, "_upstream_ws_url", fake_url)
    monkeypatch.setattr(hermes_ws.bff, "hermes_url", lambda: "http://upstream.test")
    app = FastAPI()
    app.include_router(hermes_ws.router)

    try:
        with TestClient(app) as client:
            with client.websocket_connect("/api/hermes/ws") as socket:
                assert socket.receive_json()["params"]["type"] == "gateway.ready"
                socket.send_json(
                    {
                        "jsonrpc": "2.0",
                        "id": "resume-1",
                        "method": "session.resume",
                        "params": {"session_id": "stored-1", "profile": "default"},
                    }
                )
                frames = [socket.receive_json() for _ in range(4)]
                approval = next(frame for frame in frames if frame.get("method") == "approval")
                assert approval["params"]["choices"] == ["once", "session", "always", "deny"]
                delta = next(
                    frame for frame in frames if frame.get("params", {}).get("type") == "message.delta"
                )
                assert delta["params"]["payload"]["text"] == "Live from Hermes"

                socket.send_json(
                    {
                        "jsonrpc": "2.0",
                        "id": "approval-1",
                        "result": {"choice": "always"},
                    }
                )
                socket.send_json(
                    {
                        "jsonrpc": "2.0",
                        "id": "unsafe-1",
                        "method": "shell.exec",
                        "params": {"command": "not-forwarded"},
                    }
                )
                assert socket.receive_json()["error"]["code"] == -32601

        methods = []
        answers = []
        while not upstream.received.empty():
            frame = upstream.received.get_nowait()
            if "method" in frame:
                methods.append(frame["method"])
            elif frame.get("id") == "approval-1":
                answers.append(frame)
        assert "client.capabilities" in methods
        assert "session.resume" in methods
        assert "shell.exec" not in methods
        assert answers[0]["result"] == {"choice": "always"}
    finally:
        server.shutdown()
        thread.join(timeout=3)
