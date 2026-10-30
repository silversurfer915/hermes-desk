import { deltaIdentity, eventTargetsActive, reduceLiveEvent, reduceRequests, requestFromFrame } from "./liveEvents";
import { mapMessages } from "./liveMap";

const active = {
  id: "stored-1",
  runtimeId: "runtime-1",
  items: [],
  lastSeq: 0,
  busy: false,
};

const event = (type, payload = {}, extra = {}) => ({
  jsonrpc: "2.0",
  method: "event",
  params: { type, session_id: "runtime-1", payload, ...extra },
});

test("message deltas append once and advance the replay watermark", () => {
  const frame = event("message.delta", { turn_id: "t1", text: "Hello", offset: 0 }, { seq: 9 });
  const next = reduceLiveEvent(active, frame);
  expect(next.items).toEqual([
    { id: "live-t1-0", kind: "agent", text: "Hello", streaming: true },
  ]);
  expect(next.lastSeq).toBe(9);
  expect(next.busy).toBe(true);
  expect(deltaIdentity(frame)).toBe(deltaIdentity(frame));
  expect(deltaIdentity(frame)).not.toBe(deltaIdentity(event("message.delta", { turn_id: "t1", text: "Hello", offset: 5 })));
});

test("interim snapshots replace rather than duplicate text and complete ends streaming", () => {
  let next = reduceLiveEvent(active, event("message.delta", { turn_id: "t1", text: "Hel" }));
  next = reduceLiveEvent(next, event("message.interim", { turn_id: "t1", text: "Hello" }));
  next = reduceLiveEvent(next, event("message.complete", { turn_id: "t1", text: "Hello!", status: "complete" }));
  expect(next.items[0].text).toBe("Hello!");
  expect(next.items[0].streaming).toBe(false);
  expect(next.busy).toBe(false);
});

test("events for another runtime session cannot mutate the selected transcript", () => {
  const frame = event("message.delta", { text: "wrong chat" });
  frame.params.session_id = "runtime-other";
  expect(eventTargetsActive(frame, active)).toBe(false);
  expect(reduceLiveEvent(active, frame)).toBe(active);
});

test("tool events reuse the existing task item shape", () => {
  let next = reduceLiveEvent(active, event("tool.start", {
    tool_call_id: "call-1", name: "terminal", preview: "terminal · ls",
  }));
  next = reduceLiveEvent(next, event("tool.complete", {
    tool_call_id: "call-1", output: "file.txt", status: "complete",
  }));
  expect(next.items[0]).toMatchObject({
    kind: "task", tool: "terminal", label: "terminal · ls", status: "completed", output: "file.txt",
  });
});

test("legacy approvals expose all choices and cancellation removes the request", () => {
  const frame = {
    jsonrpc: "2.0", id: "server-1", method: "approval",
    params: { description: "Run tests", request_id: "approval-1" },
  };
  const request = requestFromFrame(frame, active);
  expect(request.choices).toEqual(["once", "session", "always", "deny"]);
  const pending = reduceRequests([], frame, active);
  expect(pending).toHaveLength(1);
  const cancelled = reduceRequests(pending, event("request.cancel", { request_id: "approval-1" }), active);
  expect(cancelled).toEqual([]);
});

test("canonical approvals retain request and session identity", () => {
  const request = requestFromFrame(event("approval.request", {
    request_id: "a1", choices: ["once", "deny"], description: "Allow once?",
  }), active);
  expect(request).toMatchObject({
    id: "canonical:a1", requestId: "a1", canonical: true,
    method: "approval.respond", sessionId: "runtime-1", choices: ["once", "deny"],
  });
});

test("gateway transcript text and hidden rows map correctly", () => {
  expect(mapMessages([
    { role: "user", text: "Visible" },
    { role: "assistant", text: "Secret", display_kind: "hidden" },
    { role: "assistant", text: "Answer" },
  ])).toEqual([
    { id: "m0", kind: "user", text: "Visible" },
    { id: "m2", kind: "agent", text: "Answer" },
  ]);
});
