import { createContext, useCallback, useContext, useMemo, useReducer, useRef } from "react";
import { HISTORY } from "@/lib/demo/sampleData";
import { pickScenario } from "@/lib/demo/scenarios";

const Ctx = createContext(null);
let seq = 0;
const uid = (p) => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`;
const LIVE = ["queued", "running", "waiting_for_approval"];

const initial = { sessions: HISTORY, activeId: null, panel: null, drafts: {}, approvals: {}, busy: false };

const mapSession = (s, sid, fn) => ({ ...s, sessions: s.sessions.map((x) => (x.id === sid ? fn(x) : x)) });

function reducer(s, a) {
  switch (a.type) {
    case "NEW_CHAT": return { ...s, activeId: null, panel: null };
    case "SELECT": return { ...s, activeId: a.id, panel: null };
    case "START": return { ...s, activeId: a.session.id, sessions: [a.session, ...s.sessions] };
    case "ADD": return mapSession(s, a.sid, (x) => ({ ...x, items: [...x.items, a.item], updatedAt: new Date().toISOString() }));
    case "PATCH": return mapSession(s, a.sid, (x) => ({ ...x, items: x.items.map((i) => (i.id === a.id ? { ...i, ...a.patch } : i)) }));
    case "INTERRUPT": return mapSession(s, a.sid, (x) => ({ ...x, items: x.items.map((i) => (LIVE.includes(i.status) ? { ...i, status: "interrupted", detail: "Stopped by you" } : i.streaming ? { ...i, streaming: false } : i)) }));
    case "PANEL": return { ...s, panel: a.panel };
    case "DRAFT": return { ...s, drafts: { ...s.drafts, [a.id]: { ...s.drafts[a.id], ...a.patch } } };
    case "APPROVAL": return { ...s, approvals: { ...s.approvals, [a.id]: { ...s.approvals[a.id], ...a.patch } } };
    case "BUSY": return { ...s, busy: a.busy, busySid: a.busy ? a.sid : null };
    default: return s;
  }
}

class Cancelled extends Error {}

export function WorkspaceProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initial);
  const run = useRef(null);
  const resolvers = useRef({});

  const makeCtx = useCallback((sid, token) => {
    const sleep = (ms) => new Promise((res, rej) => setTimeout(() => (token.cancelled ? rej(new Cancelled()) : res()), ms));
    const add = (item) => { const id = item.id || uid("i"); dispatch({ type: "ADD", sid, item: { ...item, id } }); return id; };
    const patch = (id, p) => dispatch({ type: "PATCH", sid, id, patch: p });
    return {
      sid,
      add,
      addDraft: (d) => dispatch({ type: "DRAFT", id: d.id, patch: { ...d } }),
      async say(text) {
        const id = add({ kind: "agent", text: "", streaming: true });
        const words = text.split(" ");
        for (let i = 0; i < words.length; i += 3) { await sleep(45); patch(id, { text: words.slice(0, i + 3).join(" ") }); }
        patch(id, { streaming: false });
      },
      async task(tool, label, detail, opt = {}) {
        const id = add({ kind: "task", tool, label, status: "queued", startedAt: Date.now() });
        await sleep(350); patch(id, { status: "running" });
        await sleep(1100);
        patch(id, { status: opt.fail ? "failed" : "completed", detail, output: opt.output, endedAt: Date.now() });
      },
      async approvalTask(tool, label, spec) {
        const approvalId = uid("ap");
        dispatch({ type: "APPROVAL", id: approvalId, patch: { id: approvalId, tool, sid, ...spec, version: 1, edited: false, status: "pending" } });
        const id = add({ kind: "task", tool, label, status: "waiting_for_approval", approvalId, startedAt: Date.now() });
        dispatch({ type: "PANEL", panel: { type: "approval", id: approvalId } });
        const { decision, content, version } = await new Promise((res) => { resolvers.current[approvalId] = res; });
        if (decision === "cancelled" || token.cancelled) throw new Cancelled();
        if (decision === "rejected") { patch(id, { status: "failed", detail: "Rejected by you — nothing changed" }); return null; }
        patch(id, { status: "running" }); await sleep(900);
        patch(id, { status: "completed", detail: `Approved by you (version ${version})`, endedAt: Date.now() });
        return content;
      },
    };
  }, []);

  const send = useCallback(async (text, opts = {}) => {
    if (run.current) return;
    const token = { cancelled: false };
    let sid = opts.newChat ? null : state.activeId;
    if (!sid) {
      sid = uid("s");
      dispatch({ type: "START", session: { id: sid, title: text.slice(0, 48), updatedAt: new Date().toISOString(), items: [] } });
    }
    run.current = { token, sid };
    dispatch({ type: "BUSY", busy: true, sid });
    dispatch({ type: "ADD", sid, item: { id: uid("u"), kind: "user", text } });
    try { await pickScenario(text)(makeCtx(sid, token)); } catch (e) { if (!(e instanceof Cancelled)) throw e; }
    run.current = null;
    dispatch({ type: "BUSY", busy: false });
  }, [state.activeId, makeCtx]);

  const stop = useCallback(() => {
    if (!run.current) return;
    run.current.token.cancelled = true;
    dispatch({ type: "INTERRUPT", sid: run.current.sid });
    Object.entries(resolvers.current).forEach(([id, res]) => { dispatch({ type: "APPROVAL", id, patch: { status: "cancelled" } }); res({ decision: "cancelled" }); });
    resolvers.current = {};
  }, []);

  const decide = useCallback((id, decision, snapshot = {}) => {
    const res = resolvers.current[id];
    if (!res) return;
    delete resolvers.current[id];
    dispatch({ type: "APPROVAL", id, patch: { status: decision, decidedAt: Date.now(), approvedVersion: decision === "approved" ? snapshot.version : null } });
    res({ decision, ...snapshot });
  }, []);

  const value = useMemo(() => ({ state, dispatch, send, stop, decide }), [state, send, stop, decide]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useWorkspace = () => useContext(Ctx);
