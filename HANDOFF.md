# Hermes Desk - Project Handoff

## What this is
A personal-agent desktop web app ("Hermes Desk") that connects to the owner's self-hosted
Hermes instance and drives it through a frosted-glass desktop UI. Built on the Emergent
builder; the previous builder session ended (credits exhausted) mid-implementation. This
package is the extracted source (no secrets), plus design reference material and the state
of play below. Continue this project; do NOT rebuild from scratch.

## Source inventory
- backend/  FastAPI: server.py (app + status CRUD), hermes_bff.py (upstream BFF: auth against
  the Hermes dashboard, session token wrapped with Fernet + pepper), hermes_ws.py (UNFINISHED:
  WebSocket bridge for live chat streaming - was being written when the previous builder
  stopped), tests/ (pytest suite incl. fake_hermes.py mock upstream), requirements.txt,
  pytest.ini.
- frontend/ CRA + Tailwind + shadcn: desktop UI under src/components/desktop/ (IconRail,
  HistoryRail, ConversationPanel, Composer, ContextPanel, panels/{ApprovalPanel,
  ConnectionPanel, DraftPanel, LoginForm, MiscPanels, useDraft}), state/{workspace.js
  (mock state), live.js (LIVE data layer, partially wired)}, lib/, hooks/, configs.
  NOTE: src/components/ui/* (stock shadcn boilerplate) is NOT included - regenerate via
  components.json (`npx shadcn@latest init` / add) or copy from any shadcn scaffold.
  yarn.lock not included.
- design_guidelines.json  Builder-generated design notes derived from the owner's reference
  video. Treat as a starting point, not gospel: the frames are the primary direction.
- design-frames/  8 reference frames from the owner's design video - this is the look to match.

## Verified state (as of 2026-10-30)
- Automated tests exist but run against a stand-in mock upstream (backend/tests/fake_hermes.py),
  NOT the live server. Passing tests prove behavior against the mock only.
- A read-only sign-in against the live server (username+password login, then profile list /
  status views) was reported during the prior session, but was NOT independently re-verified.
  Treat all live-server integration as unproven until re-run.
- The desktop UI is complete against mock state (frontend/src/state/workspace.js).
STOPPED MID-WAY:
- backend/hermes_ws.py - live chat WebSocket bridge, file exists but incomplete.
- frontend/src/state/live.js - partially wired; real data not flowing end-to-end.
NOT STARTED:
- Live sending of messages, approval actions, morning briefing surface.
- Bot Mode: profiles-as-bots roster, group rooms, routines.

## Owner's answered scope choices (from the prior builder session)
1. Hermes WRITES the morning briefing (the app does not generate the content itself).
2. Hermes SENDS the briefing (the app relays/displays it).
3. ALL Hermes approval choices are surfaced in the app.
4. The connection is active ONLY while the user is watching the app (no background polling).

## Product + IA requirements (owner's complete feature set)
- Main page stays plain-language and calm; advanced controls live in Settings.
- Settings must carry the full advanced set: skills, memory, models, subagents, tools,
  MCP, terminal, context, and schedules sections.
- Bot Mode is a core goal: profiles-as-bots with a roster, group rooms, and routines.
- Live chat with the agent, approvals surfaced in-app, morning briefing display.
- Design: keep the existing desktop UI and follow the reference frames' direction
  (airy macOS-style frosted glass, 3-zone layout: left icon rail, center conversation,
  right context panel). design_guidelines.json is a useful generated summary of that
  direction - follow the frames where the two disagree, and fix visual defects rather
  than treating the generated file as binding. The "AuraOS" brand name in that file is
  builder-generated, not owner-confirmed.
- Server facts (from the live server during the prior session): Hermes server v0.22.2
  (release 2026.9.24) at https://hermes2.sanctrastudy.live, username+password login only
  (no token sign-in). The web dashboard exposes profile REST (/api/profiles CRUD + active
  switch); group-room orchestration is NOT confirmed web-exposed - verify before promising.

## Configuration + secrets policy
No credentials, tokens, cookies, or .env values are included in this package, by design.
Config NAMES are in backend/.env.example and frontend/.env.example with placeholders and
generation instructions (MONGO_URL, DB_NAME, HERMES_DASHBOARD_URL prefilled with the
non-secret URL, AURA_UPSTREAM_KEY, AURA_SESSION_PEPPER, REACT_APP_BACKEND_URL).
Real secret values are entered at runtime through secure fields only.
CORS_ORIGINS=* in the example is a development placeholder - restrict it before any
production exposure.
Keep non-secret config (HERMES_DASHBOARD_URL, username) persisted in the app's connection
settings so the owner is not asked to re-enter it.

## First tasks
1. Finish backend/hermes_ws.py and wire frontend/src/state/live.js fully (live read path
   end-to-end).
2. Live send path + approval actions (respecting the scope choices above).
3. Morning briefing surface (Hermes writes/sends; app displays).
4. Bot Mode groundwork (profiles roster UI; group rooms as the backend allows).
5. Build out the Settings sections listed above.
