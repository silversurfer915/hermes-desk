import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { useLive } from "@/state/live";

const CHOICES = {
  once: { label: "Allow once", detail: "Only this action" },
  session: { label: "Allow for session", detail: "Until this chat closes" },
  always: { label: "Always allow", detail: "Save this approval" },
  deny: { label: "Deny", detail: "Do not run it" },
};

const Field = ({ label, children }) => (
  <div>
    <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">{label}</p>
    <div className="text-[13px] leading-relaxed text-slate-800">{children}</div>
  </div>
);

export const LiveRequestPanel = ({ id }) => {
  const { requests, respondToRequest } = useLive();
  const request = requests.find((item) => item.id === id) || requests[0];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [value, setValue] = useState("");
  const [answers, setAnswers] = useState({});
  useEffect(() => { setBusy(false); setError(null); setValue(""); setAnswers({}); }, [request?.id]);

  if (!request) return <p className="py-8 text-center text-sm text-slate-500">This request is no longer open.</p>;
  const params = request.params || {};
  const approval = request.method === "approval" || request.method === "approval.respond";
  const clarify = request.method === "clarify";
  const questions = Array.isArray(params.questions) ? params.questions : [];

  const respond = async (answer) => {
    setBusy(true);
    setError(null);
    try { await respondToRequest(request, answer); } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div data-testid="live-request-panel" className="scroll-soft flex flex-1 flex-col gap-4 overflow-y-auto">
      <span className="flex w-fit items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
        <ShieldAlert size={12} /> Hermes is waiting for you
      </span>
      <Field label="Request">
        <span className="font-mono text-[12px]">{params.tool_name || request.method}</span>
        {params.description && <p className="mt-1">{params.description}</p>}
      </Field>
      {params.command && <Field label="Command"><code className="glass-inset block whitespace-pre-wrap break-words rounded-xl p-3 font-mono text-[12px]">{params.command}</code></Field>}
      {params.prompt && <Field label="Hermes asks">{params.prompt}</Field>}

      {approval && (
        <div className="space-y-2" aria-label="Approval choices">
          {(request.choices || ["once", "session", "always", "deny"]).map((choice) => {
            const copy = CHOICES[choice] || { label: choice, detail: "Send this choice to Hermes" };
            return (
              <button
                key={choice}
                data-testid={`live-approval-${choice}`}
                disabled={busy}
                onClick={() => respond({ choice })}
                className={`focus-ring flex min-h-11 w-full items-center justify-between gap-3 rounded-2xl px-4 py-2.5 text-left transition-colors disabled:opacity-50 ${choice === "deny" ? "bg-red-50/80 text-red-800 hover:bg-red-100" : "glass-chip text-slate-800 hover:bg-white/90"}`}
              >
                <span className="text-[13px] font-medium">{copy.label}</span>
                <span className="text-right text-[11px] opacity-70">{copy.detail}</span>
              </button>
            );
          })}
        </div>
      )}

      {clarify && (
        <div className="space-y-3">
          {questions.map((question, index) => {
            const key = question.id || question.key || String(index);
            return (
              <label key={key} className="block text-[13px] font-medium text-slate-700">
                {question.question || question.prompt || question.label || `Question ${index + 1}`}
                <input
                  value={answers[key] || ""}
                  onChange={(event) => setAnswers((current) => ({ ...current, [key]: event.target.value }))}
                  className="glass-inset focus-ring mt-1.5 min-h-11 w-full rounded-xl px-3 py-2 font-normal outline-none"
                />
              </label>
            );
          })}
          <div className="flex gap-2">
            <button disabled={busy} onClick={() => respond({ answers: {}, outcome: "cancelled" })} className="focus-ring glass-chip min-h-11 flex-1 rounded-xl px-4 text-[13px] font-medium">Cancel</button>
            <button data-testid="live-clarify-submit" disabled={busy} onClick={() => respond({ answers, outcome: "answered" })} className="focus-ring min-h-11 flex-1 rounded-xl bg-blue-600 px-4 text-[13px] font-medium text-white">Answer Hermes</button>
          </div>
        </div>
      )}

      {!approval && !clarify && (
        <form onSubmit={(event) => { event.preventDefault(); respond({ value }); }} className="space-y-3">
          <label className="block text-[13px] font-medium text-slate-700">
            Secure response
            <input
              data-testid="live-request-value"
              type="password"
              autoComplete="off"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              className="glass-inset focus-ring mt-1.5 min-h-11 w-full rounded-xl px-3 py-2 font-normal outline-none"
            />
          </label>
          <p className="text-[11px] text-slate-500">Entered directly into this request and never stored by Hermes Desk.</p>
          <button disabled={busy || !value} className="focus-ring min-h-11 w-full rounded-xl bg-blue-600 px-4 text-[13px] font-medium text-white disabled:opacity-40">Send secure response</button>
        </form>
      )}
      {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</p>}
    </div>
  );
};
