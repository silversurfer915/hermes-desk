# Hermes Desk - Project Handoff

Hermes Desk is a personal web app: a calm, frosted-glass desktop UI for the owner's self-hosted
Hermes agent server. The app talks to Hermes only through its FastAPI backend (BFF). Upstream
credentials and session tokens never reach the browser, the frontend, storage, or logs.

Owner-confirmed scope rules (keep all of them):
- Hermes writes the morning briefing; the app relays and displays it. The app generates no briefing content.
- Every Hermes approval, clarify, and credential request is surfaced in-app and answerable there.
- The live connection is active only while the tab is visible. No background polling.
- The main page stays plain-language. Advanced controls live in Settings.
- Bot Mode (profiles-as-bots, group rooms, routines) only uses capabilities the server advertises.
- No secrets in code, docs, or chat. Config names only in `.env.example` files, with placeholders.

## Current state (2026-10-30)

### Hosting
- Public app: https://hermesdesk.sanctrastudy.live (Cloudflare tunnel to a local Docker container).
- Container image is built from the repo `Dockerfile` (`docker build -f Dockerfile .` in this directory).
- Runtime: one app container on the host loopback, plus a MongoDB container on a private Docker network.
  Runtime secrets live in an env file outside the repo (`.env.example` lists the names).
- Upstream: `HERMES_DASHBOARD_URL` points at the owner's Hermes server (v0.22.2 at the time of checking).

### Works and was checked
- Backend unit suites: `tests/test_hermes_ws_unit.py` and `tests/test_hermes_advanced_unit.py`, 24 passed
  in a fresh venv (`pytest-asyncio` added to `requirements.txt`).
- Frontend: `npm ci --legacy-peer-deps` from the regenerated lockfile (official npm registry) and
  `craco build` both succeed. The app renders in the demo shell (checked at 1440x900 in Chromium).
- The app's read-only sign-in flow against the live Hermes server works end to end through the BFF:
  connection status, sign-in, overview, bots (profiles, active profile, cron job list), sessions list,
  and sign-out. No chats, sends, schedule actions, or settings were changed.
- REST paths the BFF calls exist in the installed Hermes source (`hermes_cli/web_routers/*`), and the
  write-request bodies match the server models.
- WebSocket bridge (`backend/hermes_ws.py`): methods checked against the installed Hermes contract
  (`apps/shared/src/gateway-contract.openrpc.json` and `tui_gateway/contracts/*`). The handshake uses
  `?ticket=` from `/api/auth/ws-ticket` or `?token=`, matching the server's `_ws_auth_reason`.
- Group rooms (`BotPanel.jsx`): the Send form appears only when `groups.capabilities` lists
  `groups.send` in `methods`. Otherwise an explicit "not supported by this server version" note shows.
  Request bodies were validated against the server's own pydantic models and validators (local source).

### Not verified (do not treat as working)
- The live WebSocket path has not been exercised end to end from the browser. No live sends, approvals,
  or room messages were tried, on purpose.
- Group room creation and sending have not been run against the live server. Validation is against the
  server source only, and send is gated behind the server's advertised capability.
- Morning briefing and Bot Mode screens have not been rendered with live data.
- The public app has only been checked in demo mode.
- `frontend/public/` has no favicon, so the browser's `/favicon.ico` request returns 404.

### Integration suites (run against an isolated stand-in, never the live server)
Run with `backend/tests/fake_hermes.py` on a local port and the backend pointed at it. Result: 14 pass,
7 fail. All seven failures are test-harness assumptions, not confirmed app bugs:
- Session cookies are `Secure`, so `requests` drops them over plain HTTP. Tests that rely on the session
  jar (`test_cookie_rotation_persisted`, `test_messages_unknown_404`, `test_logout_invalidates`,
  `test_token_login_reads`) need explicit `cookies=` arguments.
- `test_mongo_encrypted` reads `/app/backend/.env`, a path from the old platform layout. It should read
  environment variables instead.
- Rate limits are in-memory and shared per username (`user:sam`, 10/min) and per IP (5/min). Earlier tests
  in the same run exhaust them, so `test_rate_limit_429` and `test_parallel_calls_then_after_grace` get 429.
  Restart the backend between suites, or give each test its own username.

### Known caveats
- `ping` vs `gateway.ping`: the bridge now uses the catalog method `ping`. In the installed build,
  `gateway.ping` has a reader-thread fast path in `tui_gateway/ws.py`, and plain `ping` goes through the
  dispatcher queue. If heartbeats stall during long turns, switch the bridge back to `gateway.ping`, which
  the official desktop client also sends.
- `ModelBody` sends `confirm_expensive_model` to `/api/model/set`. The server ignores unknown fields, so
  that confirmation is not enforced server-side. Verify before relying on it.
- `CORS_ORIGINS` must be an exact origin list, never `*`, because the app uses credentialed cookies.

## Blocked by server capability
- Group-room send: depends on the Hermes server advertising `groups.send` in `groups.capabilities`.
  The bridge and UI handle both cases. The installed source does register it, but the live server's
  advertised capabilities have not been confirmed.

## Source layout
- `backend/server.py`: FastAPI app, `/api` routes, serves `frontend/build` when it exists.
- `backend/hermes_bff.py`: the Hermes REST BFF under `/api/hermes/*`. Sign-in, encrypted session storage,
  rate limits, and proxied reads/writes.
- `backend/hermes_ws.py`: WebSocket JSON-RPC bridge `/api/hermes/ws`, with a method allowlist and a
  single-use ticket per connection.
- `backend/tests/`: unit suites (pass) and integration suites (see above).
- `frontend/src/state/live.js` and `frontend/src/lib/hermes/*`: live data layer and socket client.
- `frontend/src/components/desktop/*`: the three-zone UI (icon rail, conversation, context panels).
- `design_guidelines.json`: generated summary of the design direction. The owner's reference video is the
  primary source. Where the two disagree, follow the video.

## Next steps
1. Fix the integration-suite harness issues listed above, then re-run all suites.
2. Confirm the live `groups.capabilities` response with a read-only WebSocket call (no sends).
3. Render the live-mode panels (Bot Mode, Briefing, Settings) with mocked upstream data.
4. Add a favicon, and reconcile the layout against the reference video.
