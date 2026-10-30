import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { HermesSocket } from "@/lib/hermes/HermesSocket";
import { deltaIdentity, reduceLiveEvent, reduceRequests } from "@/lib/hermes/liveEvents";
import { mapMessages, mapSession } from "@/lib/hermes/liveMap";

const Ctx = createContext(null);
const ROOT = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/$/, "");
const BASE = `${ROOT}/api/hermes`;

function socketUrl() {
  const url = new URL(`${ROOT}/api/hermes/ws`, window.location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

export async function api(path, init = {}) {
  const response = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(body.detail || `Request failed (${response.status})`), { status: response.status });
  }
  return body;
}

function snapshotItems(result) {
  const items = Array.isArray(result.messages) ? mapMessages(result.messages) : [];
  const inflight = result.inflight;
  if (inflight?.user) items.push({ id: "live-inflight-user", kind: "user", text: inflight.user });
  if (inflight?.assistant || inflight?.streaming) {
    items.push({
      id: "live-inflight-agent",
      kind: "agent",
      text: inflight.assistant || "",
      streaming: !!inflight.streaming,
    });
  }
  return items;
}

export function LiveProvider({ children }) {
  const [conn, setConn] = useState(null);
  const [overview, setOverview] = useState(null);
  const [mode, setModeState] = useState("demo");
  const [sessions, setSessions] = useState({ list: [], loading: false, error: null });
  const [active, setActive] = useState(null);
  const [requests, setRequests] = useState([]);
  const [liveStatus, setLiveStatus] = useState("offline");

  const socketRef = useRef(null);
  const readyRef = useRef(false);
  const activeRef = useRef(null);
  const selectionRef = useRef(0);
  const seenDeltasRef = useRef(new Set());
  const replayEpochRef = useRef(null);
  const frameHandlerRef = useRef(null);
  const attachRef = useRef(null);

  const commitActive = useCallback((next) => {
    activeRef.current = next;
    setActive(next);
  }, []);

  const patchActive = useCallback((id, patch) => {
    setActive((previous) => {
      if (!previous || previous.id !== id) return previous;
      const next = { ...previous, ...patch };
      activeRef.current = next;
      return next;
    });
  }, []);

  const signedOut = useCallback((message) => {
    selectionRef.current += 1;
    setModeState("demo");
    setOverview(null);
    commitActive(null);
    setRequests([]);
    localStorage.setItem("aura-mode", "demo");
    setConn((current) => (current ? { ...current, signed_in: false, user: null } : current));
    if (message) toast.error(message);
  }, [commitActive]);

  const guard = useCallback(async (fn) => {
    try { return await fn(); } catch (error) {
      if (error.status === 401) signedOut(error.message);
      throw error;
    }
  }, [signedOut]);

  const refresh = useCallback(async () => {
    const connection = await api("/connection").catch((error) => ({ configured: false, error: error.message }));
    setConn(connection);
    if (connection.signed_in) setOverview(await guard(() => api("/overview")).catch(() => null));
    return connection;
  }, [guard]);

  const loadSessions = useCallback(async () => {
    setSessions((current) => ({ ...current, loading: true, error: null }));
    try {
      const data = await guard(() => api("/sessions?limit=100"));
      setSessions({ list: data.sessions.map(mapSession), loading: false, error: null });
    } catch (error) {
      setSessions({ list: [], loading: false, error: error.message });
    }
  }, [guard]);

  const search = useCallback((query) => guard(() => api(`/sessions/search?q=${encodeURIComponent(query)}`)).then((data) =>
    data.results.map((result) => mapSession({
      id: result.session_id,
      title: result.title,
      preview: result.snippet,
      last_active: result.last_active || result.session_started,
    }))), [guard]);

  const ingestOpenRequests = useCallback((entries = []) => {
    entries.forEach((entry) => {
      setRequests((previous) => reduceRequests(previous, {
        jsonrpc: "2.0",
        id: entry.id,
        method: entry.method,
        params: entry.params || {},
      }, activeRef.current));
    });
  }, []);

  const attachSession = useCallback(async ({ replay = false } = {}) => {
    const current = activeRef.current;
    const socket = socketRef.current;
    if (!current || !socket || !readyRef.current || document.hidden) return;
    const selection = selectionRef.current;
    const selectedId = current.id;
    try {
      if (replay && current.runtimeId && current.lastSeq && replayEpochRef.current) {
        const replayResult = await socket.call("session.events.since", {
          session_id: current.runtimeId,
          last_seen: current.lastSeq,
          replay_epoch: replayEpochRef.current,
          ...(current.profile ? { profile: current.profile } : {}),
        });
        if (selection !== selectionRef.current) return;
        if (!replayResult.truncated && replayResult.epoch === replayEpochRef.current) {
          (replayResult.events || []).forEach((params) => frameHandlerRef.current?.({
            jsonrpc: "2.0", method: "event", params,
          }));
          patchActive(selectedId, { lastSeq: replayResult.latest_seq || current.lastSeq, error: null });
          ingestOpenRequests(replayResult.open_requests || []);
          return;
        }
        // A replay gap is never treated as a complete transcript: fetch a fresh snapshot.
      }

      const result = await socket.call("session.resume", {
        session_id: current.id,
        inline_images: false,
        ...(current.profile ? { profile: current.profile } : {}),
      });
      if (selection !== selectionRef.current) return;
      seenDeltasRef.current.clear();
      const latest = activeRef.current || current;
      commitActive({
        ...latest,
        id: result.stored_session_id || latest.id,
        runtimeId: result.session_id,
        title: result.info?.title || latest.title,
        profile: result.info?.profile_name || latest.profile,
        info: result.info || latest.info,
        items: Array.isArray(result.messages) ? snapshotItems(result) : latest.items,
        busy: !!result.inflight?.streaming || !!result.info?.running,
        loading: false,
        error: null,
        lastSeq: 0,
      });
      ingestOpenRequests(result.open_requests || []);
    } catch (error) {
      if (selection === selectionRef.current) patchActive(selectedId, { error: error.message, busy: false });
    }
  }, [commitActive, ingestOpenRequests, patchActive]);
  attachRef.current = attachSession;

  const handleFrame = useCallback((frame) => {
    if (!frame || document.hidden) return;
    if (frame.method === "event" && frame.params?.type === "gateway.ready") {
      readyRef.current = true;
      replayEpochRef.current = frame.params.payload?.replay_epoch || null;
      setLiveStatus("live");
      attachRef.current?.({ replay: true });
      return;
    }
    if (frame.method === "event" && frame.params?.type === "sessions.changed") {
      loadSessions();
    }
    const identity = deltaIdentity(frame);
    if (identity) {
      if (seenDeltasRef.current.has(identity)) return;
      seenDeltasRef.current.add(identity);
      if (seenDeltasRef.current.size > 2000) {
        seenDeltasRef.current = new Set([...seenDeltasRef.current].slice(-1000));
      }
    }
    setRequests((previous) => reduceRequests(previous, frame, activeRef.current));
    setActive((previous) => {
      const next = reduceLiveEvent(previous, frame);
      activeRef.current = next;
      return next;
    });
  }, [loadSessions]);
  frameHandlerRef.current = handleFrame;

  const openSession = useCallback(async (session) => {
    const selection = ++selectionRef.current;
    seenDeltasRef.current.clear();
    setRequests([]);
    commitActive({
      id: session.id,
      title: session.title,
      profile: session.profile || null,
      runtimeId: null,
      info: null,
      items: [],
      loading: true,
      error: null,
      busy: false,
      lastSeq: 0,
    });
    try {
      const data = await guard(() => api(`/sessions/${encodeURIComponent(session.id)}/messages`));
      if (selection !== selectionRef.current) return;
      const current = activeRef.current;
      commitActive({ ...current, items: mapMessages(data.messages), loading: false, error: null });
      await attachRef.current?.();
    } catch (error) {
      if (selection === selectionRef.current) patchActive(session.id, { loading: false, error: error.message });
    }
  }, [commitActive, guard, patchActive]);

  const createSession = useCallback(async (profile) => {
    const socket = socketRef.current;
    if (!socket || !readyRef.current) throw new Error("Open Hermes Desk in a visible tab to start a live chat.");
    const result = await socket.call("session.create", {
      source: "hermes-desk",
      close_on_disconnect: false,
      ...(profile ? { profile } : {}),
    });
    const selection = ++selectionRef.current;
    seenDeltasRef.current.clear();
    setRequests([]);
    const next = {
      id: result.stored_session_id,
      runtimeId: result.session_id,
      title: result.info?.title || "New Hermes chat",
      profile: result.info?.profile_name || profile || null,
      info: result.info || null,
      items: snapshotItems(result),
      loading: false,
      error: null,
      busy: false,
      lastSeq: 0,
      selection,
    };
    commitActive(next);
    loadSessions();
    return next;
  }, [commitActive, loadSessions]);

  const send = useCallback(async (text) => {
    const body = text.trim();
    if (!body) return;
    let current = activeRef.current;
    if (!current) current = await createSession();
    if (!current?.runtimeId) throw new Error("Hermes is still attaching this chat. Try again in a moment.");
    const storedId = current.info?.stored_session_id;
    if (storedId && storedId !== current.id) throw new Error("This chat changed on Hermes. Reopen it before sending.");
    const optimistic = {
      ...current,
      items: [...current.items, { id: `live-user-${Date.now()}`, kind: "user", text: body }],
      busy: true,
      error: null,
    };
    commitActive(optimistic);
    try {
      await socketRef.current.call("prompt.submit", {
        session_id: current.runtimeId,
        text: body,
        ...(current.profile ? { profile: current.profile } : {}),
      });
    } catch (error) {
      patchActive(current.id, { busy: false, error: error.message });
      throw error;
    }
  }, [commitActive, createSession, patchActive]);

  const stop = useCallback(async () => {
    const current = activeRef.current;
    if (!current?.runtimeId || !socketRef.current) return;
    await socketRef.current.call("session.interrupt", {
      session_id: current.runtimeId,
      ...(current.profile ? { profile: current.profile } : {}),
    });
  }, []);

  const respondToRequest = useCallback(async (request, answer) => {
    const socket = socketRef.current;
    if (!socket || !readyRef.current) throw new Error("Reconnect to Hermes before answering this request.");
    if (request.canonical) {
      await socket.call("approval.respond", {
        session_id: request.sessionId,
        request_id: request.requestId,
        choice: answer.choice,
        ...(answer.all ? { all: true } : {}),
        ...(activeRef.current?.profile ? { profile: activeRef.current.profile } : {}),
      });
    } else {
      const result = request.method === "approval" ? { choice: answer.choice } : answer;
      await socket.respond(request.rpcId, result);
    }
    setRequests((previous) => previous.filter((item) => item.id !== request.id));
  }, []);

  const login = useCallback(async (body) => {
    await api("/login", { method: "POST", body: JSON.stringify(body) });
    await refresh();
    setModeState("live");
    localStorage.setItem("aura-mode", "live");
  }, [refresh]);

  const logout = useCallback(async () => {
    socketRef.current?.close();
    await api("/logout", { method: "POST" }).catch(() => null);
    signedOut();
    await refresh();
  }, [refresh, signedOut]);

  const setMode = useCallback((nextMode) => {
    selectionRef.current += 1;
    setModeState(nextMode);
    commitActive(null);
    setRequests([]);
    localStorage.setItem("aura-mode", nextMode);
  }, [commitActive]);

  const clearActive = useCallback(() => {
    selectionRef.current += 1;
    commitActive(null);
    setRequests([]);
  }, [commitActive]);

  useEffect(() => {
    refresh().then((connection) => {
      if (connection.signed_in && localStorage.getItem("aura-mode") === "live") setModeState("live");
    });
  }, [refresh]);
  useEffect(() => { if (mode === "live") loadSessions(); }, [mode, loadSessions]);

  const liveEnabled = mode === "live" && !!conn?.signed_in;
  useEffect(() => {
    if (!liveEnabled) {
      socketRef.current?.close();
      socketRef.current = null;
      readyRef.current = false;
      setLiveStatus("offline");
      return undefined;
    }
    let disposed = false;
    let retry = null;

    const closeSocket = () => {
      if (retry) clearTimeout(retry);
      retry = null;
      readyRef.current = false;
      const socket = socketRef.current;
      socketRef.current = null;
      socket?.close();
    };

    const connect = () => {
      if (disposed || document.hidden || socketRef.current) return;
      setLiveStatus("connecting");
      const socket = new HermesSocket(socketUrl(), {
        onFrame: (frame) => frameHandlerRef.current?.(frame),
        onClose: () => {
          if (socketRef.current !== socket || disposed) return;
          socketRef.current = null;
          readyRef.current = false;
          setLiveStatus(document.hidden ? "paused" : "reconnecting");
          if (!document.hidden) retry = setTimeout(connect, 1500);
        },
        onError: () => {
          if (!document.hidden) setLiveStatus("reconnecting");
        },
      });
      socketRef.current = socket;
      socket.connect();
    };

    const visibility = () => {
      if (document.hidden) {
        closeSocket();
        setLiveStatus("paused");
      } else connect();
    };
    document.addEventListener("visibilitychange", visibility);
    connect();
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", visibility);
      closeSocket();
    };
  }, [liveEnabled]);

  const rpc = useCallback((method, params = {}) => {
    if (!socketRef.current || !readyRef.current || document.hidden) {
      return Promise.reject(new Error("Open Hermes Desk in a visible tab to use this live capability."));
    }
    return socketRef.current.call(method, params);
  }, []);

  const value = useMemo(() => ({
    conn,
    overview,
    mode,
    sessions,
    active,
    requests,
    liveStatus,
    refresh,
    login,
    logout,
    search,
    openSession,
    createSession,
    loadSessions,
    send,
    stop,
    respondToRequest,
    rpc,
    setMode,
    clearActive,
  }), [
    conn, overview, mode, sessions, active, requests, liveStatus, refresh, login, logout,
    search, openSession, createSession, loadSessions, send, stop, respondToRequest, rpc, setMode, clearActive,
  ]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useLive = () => useContext(Ctx);
