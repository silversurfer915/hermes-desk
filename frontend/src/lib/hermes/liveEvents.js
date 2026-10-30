// Pure Hermes JSON-RPC event mapping for the existing desktop stream items.
const MAX_OUTPUT = 2000;
const turnKey = (payload) => payload.turn_id || payload.turnId || "current";
const segmentKey = (payload) => payload.segment ?? 0;
const itemId = (payload) => `live-${turnKey(payload)}-${segmentKey(payload)}`;
const clipped = (value) => {
  const text = typeof value === "string" ? value : value == null ? "" : JSON.stringify(value, null, 2);
  return text.length > MAX_OUTPUT ? `${text.slice(0, MAX_OUTPUT)}\n…` : text;
};

export function eventSessionId(frame) {
  const params = frame?.params || {};
  return params.session_id || params.payload?.session_id || null;
}

export function eventTargetsActive(frame, active) {
  if (!active) return false;
  const sessionId = eventSessionId(frame);
  return !sessionId || sessionId === active.runtimeId || sessionId === active.id;
}

export function deltaIdentity(frame) {
  const params = frame?.params || {};
  const payload = params.payload || {};
  if (params.type !== "message.delta" || typeof payload.text !== "string") return null;
  return [
    eventSessionId(frame) || "session",
    turnKey(payload),
    segmentKey(payload),
    payload.offset ?? "none",
    payload.text,
  ].join(":");
}

function updateItem(items, id, update, fallback) {
  const index = items.findIndex((item) => item.id === id);
  if (index < 0) return fallback ? [...items, fallback] : items;
  const next = [...items];
  next[index] = { ...next[index], ...update };
  return next;
}

export function reduceLiveEvent(active, frame) {
  if (!active || frame?.method !== "event" || !eventTargetsActive(frame, active)) return active;
  const params = frame.params || {};
  const type = params.type;
  const payload = params.payload || {};
  let next = active;
  if (typeof params.seq === "number" && params.seq > (active.lastSeq || 0)) {
    next = { ...next, lastSeq: params.seq };
  }

  if (type === "message.start") {
    const id = itemId(payload);
    return {
      ...next,
      busy: true,
      items: updateItem(next.items, id, { streaming: true }, {
        id,
        kind: "agent",
        text: typeof payload.text === "string" ? payload.text : "",
        streaming: true,
      }),
    };
  }

  if (type === "message.delta" && typeof payload.text === "string") {
    const id = itemId(payload);
    const current = next.items.find((item) => item.id === id);
    return {
      ...next,
      busy: true,
      items: updateItem(next.items, id, {
        text: `${current?.text || ""}${payload.text}`,
        streaming: true,
      }, { id, kind: "agent", text: payload.text, streaming: true }),
    };
  }

  if (type === "message.interim" && typeof payload.text === "string") {
    const id = itemId(payload);
    return {
      ...next,
      busy: true,
      items: updateItem(next.items, id, { text: payload.text, streaming: true }, {
        id,
        kind: "agent",
        text: payload.text,
        streaming: true,
      }),
    };
  }

  if (type === "message.complete" || type === "turn.complete") {
    const id = itemId(payload);
    const hasText = typeof payload.text === "string";
    return {
      ...next,
      busy: false,
      error: payload.status === "error" ? payload.error || "Hermes stopped this turn with an error." : next.error,
      items: next.items.map((item) => {
        if (item.id !== id && type === "message.complete") return item;
        if (item.kind !== "agent" || !item.streaming) return item;
        return {
          ...item,
          ...(item.id === id && hasText ? { text: payload.text } : {}),
          streaming: false,
        };
      }),
    };
  }

  if (type === "tool.start") {
    const callId = payload.tool_call_id || payload.call_id || payload.id || `${Date.now()}`;
    const id = `live-tool-${callId}`;
    const tool = payload.name || payload.tool_name || payload.tool || "tool";
    const label = payload.label || payload.preview || tool;
    return {
      ...next,
      busy: true,
      items: updateItem(next.items, id, { status: "running" }, {
        id,
        kind: "task",
        tool,
        label,
        status: "running",
        detail: "Hermes is running this tool.",
      }),
    };
  }

  if (type === "tool.complete") {
    const callId = payload.tool_call_id || payload.call_id || payload.id;
    const id = `live-tool-${callId}`;
    const failed = payload.status === "error" || payload.ok === false || !!payload.error;
    const output = clipped(payload.output ?? payload.result ?? payload.error);
    return {
      ...next,
      items: updateItem(next.items, id, {
        status: failed ? "failed" : "completed",
        detail: failed ? payload.error || "Hermes reported a tool error." : "Result recorded by Hermes.",
        ...(output ? { output } : {}),
      }),
    };
  }

  if (type === "session.info") {
    const info = payload.info || payload;
    return {
      ...next,
      info: { ...next.info, ...info },
      profile: info.profile_name || next.profile,
      busy: typeof info.running === "boolean" ? info.running : next.busy,
    };
  }

  return next;
}

const choicesFor = (params) => {
  if (Array.isArray(params.choices) && params.choices.length) return params.choices;
  return ["once", "session", "always", "deny"];
};

export function requestFromFrame(frame, active) {
  if (!frame || typeof frame !== "object") return null;
  if (frame.method === "event") {
    const params = frame.params || {};
    if (params.type !== "approval.request") return null;
    const payload = params.payload || {};
    const requestId = payload.request_id || params.request_id;
    if (!requestId) return null;
    return {
      id: `canonical:${requestId}`,
      requestId,
      method: "approval.respond",
      canonical: true,
      sessionId: params.session_id || payload.session_id || active?.runtimeId,
      params: payload,
      choices: choicesFor(payload),
    };
  }
  if (!frame.id || !frame.method || frame.method === "event") return null;
  const params = frame.params || {};
  return {
    id: String(frame.id),
    rpcId: frame.id,
    requestId: params.request_id || null,
    method: frame.method,
    canonical: false,
    sessionId: params.session_id || active?.runtimeId,
    params,
    choices: frame.method === "approval" ? choicesFor(params) : undefined,
  };
}

export function reduceRequests(requests, frame, active) {
  const params = frame?.params || {};
  const payload = params.payload || {};
  if (frame?.method === "request.cancel" || (frame?.method === "event" && params.type === "request.cancel")) {
    const id = payload.request_id || payload.id || params.request_id || params.id;
    return requests.filter((request) => request.id !== String(id) && request.requestId !== id && request.rpcId !== id);
  }
  if (frame?.method === "event" && params.type === "approval.settled") {
    const id = payload.request_id || params.request_id;
    return requests.filter((request) => request.requestId !== id && request.id !== `canonical:${id}`);
  }
  const request = requestFromFrame(frame, active);
  if (!request) return requests;
  return [...requests.filter((item) => item.id !== request.id), request];
}
