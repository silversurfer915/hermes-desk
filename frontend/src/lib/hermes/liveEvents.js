// Pure Hermes JSON-RPC event mapping for the existing desktop stream items.
const MAX_OUTPUT = 2000;
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

// One stable identity per replayable frame: Hermes numbers every event with a per-session
// monotonic ``seq`` (the replay ring keys on it), so seq alone removes duplicates from
// reconnect replays and delta re-delivery. Fallback for seq-less frames (old servers).
export function frameIdentity(frame) {
  const params = frame?.params || {};
  if (typeof params.seq === "number") return `${eventSessionId(frame) || "session"}:${params.seq}`;
  const payload = params.payload || {};
  if (params.type !== "message.delta" || typeof payload.text !== "string") return null;
  return [
    eventSessionId(frame) || "session",
    payload.turn_id || payload.turnId || "current",
    payload.segment ?? 0,
    payload.offset ?? "none",
    payload.text,
  ].join(":");
}

export function deltaIdentity(frame) {
  return frameIdentity(frame);
}

const lastStreamingIndex = (items) => {
  for (let index = items.length - 1; index >= 0; index--) {
    if (items[index].kind === "agent" && items[index].streaming) return index;
  }
  return -1;
};
const sealStreaming = (items) => items.map((item) => (item.kind === "agent" && item.streaming ? { ...item, streaming: false } : item));
const withItem = (items, index, update) => {
  const next = [...items];
  next[index] = { ...next[index], ...update };
  return next;
};
const pushAfter = (items, index, item) => {
  const next = [...items];
  next.splice(index + 1, 0, item);
  return next;
};

export function reduceLiveEvent(active, frame) {
  if (!active || frame?.method !== "event" || !eventTargetsActive(frame, active)) return active;
  const params = frame.params || {};
  const type = params.type;
  const payload = params.payload || {};
  let next = active;
  if (typeof params.seq === "number" && params.seq > (active.lastSeq || 0)) {
    next = { ...next, lastSeq: params.seq };
  }

  // A turn is at most one streaming reply surface; each Hermes segment (start / interim /
  // delta stream) is sealed before the next one opens so earlier text is never overwritten.
  const streamingIndex = () => lastStreamingIndex(next.items);

  if (type === "message.start" || type === "message.interim") {
    if (type === "message.interim" && payload.already_streamed) return { ...next, busy: true };
    const sealIndex = streamingIndex();
    let items = next.items;
    if (sealIndex >= 0) items = withItem(items, sealIndex, { streaming: false });
    const id = `live-item-${params.seq ?? `${Date.now()}`}`;
    const item = {
      id,
      kind: "agent",
      text: typeof payload.text === "string" ? payload.text : "",
      streaming: type === "message.start",
    };
    items = sealIndex >= 0 ? pushAfter(items, sealIndex, item) : [...items, item];
    return { ...next, error: null, busy: true, items };
  }

  if (type === "message.delta" && typeof payload.text === "string") {
    const index = streamingIndex();
    const items = index >= 0
      ? withItem(next.items, index, { text: `${next.items[index].text || ""}${payload.text}` })
      : [...next.items, { id: `live-item-${params.seq ?? `${Date.now()}`}`, kind: "agent", text: payload.text, streaming: true }];
    return { ...next, error: null, busy: true, items };
  }

  if (type === "message.complete" || type === "turn.complete") {
    const index = streamingIndex();
    const hasText = typeof payload.text === "string" && payload.text.length > 0;
    if (type === "turn.complete" && index < 0 && !hasText) {
      return { ...next, busy: false, items: sealStreaming(next.items) };
    }
    const fallbackItem = hasText
      ? [{ id: `live-item-${params.seq ?? `${Date.now()}`}`, kind: "agent", text: payload.text, streaming: false }]
      : [];
    const target = index >= 0 ? [index] : null;
    const items = target
      ? withItem(next.items, target[0], {
          ...(hasText ? { text: payload.text } : {}),
          streaming: false,
        })
      : next.items.filter((item) => !(item.kind === "agent" && item.streaming)).concat(fallbackItem);
    const failed = payload.status === "error";
    return {
      ...next,
      busy: false,
      error: failed
        ? payload.error || payload.failure_reason || "Hermes stopped this turn with an error."
        : next.error,
      items,
    };
  }

  if (type === "tool.start") {
    const callId = payload.tool_id || payload.tool_call_id || payload.call_id || payload.id || `${Date.now()}`;
    const id = `live-tool-${callId}`;
    const tool = payload.name || payload.tool_name || payload.tool || "tool";
    const label = payload.label || payload.preview || tool;
    return {
      ...next,
      busy: true,
      items: next.items.some((item) => item.id === id)
        ? withItem(next.items, next.items.findIndex((item) => item.id === id), { status: "running" })
        : [...next.items, {
            id, kind: "task", tool, label, status: "running",
            detail: "Hermes is running this tool.",
          }],
    };
  }

  if (type === "tool.complete") {
    const callId = payload.tool_id || payload.tool_call_id || payload.call_id || payload.id;
    const id = `live-tool-${callId ?? ""}`;
    const index = next.items.findIndex((item) => item.id === id);
    const failed = payload.status === "error" || payload.ok === false || !!payload.error;
    const output = clipped(payload.result ?? payload.output ?? payload.summary ?? payload.error);
    const patch = {
      status: failed ? "failed" : "completed",
      detail: failed ? payload.error || "Hermes reported a tool error." : "Result recorded by Hermes.",
      ...(output ? { output } : {}),
    };
    if (index >= 0) return { ...next, items: withItem(next.items, index, patch) };
    return { ...next, items: [...next.items, { id, kind: "task", tool: payload.name || "tool", label: payload.name || "tool", ...patch }] };
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
    sessionId: params.session_id || params.gateway_session_id || active?.runtimeId,
    params,
    choices: (frame.method === "approval" || frame.method === "approval.respond") ? choicesFor(params) : undefined,
  };
}

export function reduceRequests(requests, frame, active) {
  const params = frame?.params || {};
  const payload = params.payload || {};
  if (frame?.method === "request.cancel" || (frame?.method === "event" && params.type === "approval.cancelled")) {
    const id = payload.request_id || payload.id || params.request_id || params.id;
    return requests.filter((request) => request.id !== String(id) && request.requestId !== id && request.rpcId !== id);
  }
  if (Array.isArray(payload.request_ids)) {
    return requests.filter((request) => !payload.request_ids.some((dropped) => dropped && (String(dropped) === request.id || dropped === request.requestId)));
  }
  if (frame?.method === "event" && params.type === "approval.settled") {
    const id = payload.request_id || params.request_id;
    return requests.filter((request) => request.requestId !== id && request.id !== `canonical:${id}`);
  }
  const request = requestFromFrame(frame, active);
  if (!request) return requests;
  return [...requests.filter((item) => item.id !== request.id), request];
}
