// Maps Hermes session rows + stored transcripts (web/src/lib/api.ts SessionInfo / SessionMessage shapes) to UI items.
const MAX_OUTPUT = 2000;

export const mapSession = (s) => ({
  id: s.id,
  title: s.title || s.preview || s.id,
  updatedAt: new Date((s.last_active || s.started_at || 0) * 1000).toISOString(),
  isActive: !!s.is_active,
  source: s.source,
  items: [],
});

const summariseArgs = (raw) => {
  try {
    const args = JSON.parse(raw || "{}");
    const first = Object.values(args).find((v) => typeof v === "string");
    return first ? first.slice(0, 80) : "";
  } catch { return ""; }
};

const text = (c) => (typeof c === "string" ? c : Array.isArray(c) ? c.map((p) => p?.text || "").join("") : "");

export function mapMessages(messages = []) {
  const results = {};
  messages.forEach((m) => { if (m.role === "tool" && m.tool_call_id) results[m.tool_call_id] = text(m.content ?? m.text); });
  const items = [];
  messages.forEach((m, i) => {
    if (m.display_kind === "hidden") return;
    const body = text(m.content ?? m.text).trim();
    if (m.role === "user" && body) items.push({ id: `m${i}`, kind: "user", text: body });
    if (m.role === "assistant") {
      (m.tool_calls || []).forEach((tc, j) => {
        const out = results[tc.id];
        const name = tc.function?.name || "tool";
        const hint = summariseArgs(tc.function?.arguments);
        items.push({
          id: `m${i}-t${j}`, kind: "task", tool: name, label: hint ? `${name} · ${hint}` : name,
          status: out === undefined ? "unknown" : "completed",
          detail: out === undefined ? "Hermes stored no result for this call." : "Result recorded by Hermes.",
          output: out ? out.slice(0, MAX_OUTPUT) + (out.length > MAX_OUTPUT ? "\n…" : "") : undefined,
        });
      });
      if (body) items.push({ id: `m${i}`, kind: "agent", text: body });
    }
  });
  return items;
}
