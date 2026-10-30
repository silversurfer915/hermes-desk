import { ShieldAlert, ShieldCheck } from "lucide-react";
import { useWorkspace } from "@/state/workspace";

const RISK = {
  low: { label: "Low risk", cls: "bg-emerald-50 text-emerald-700", Icon: ShieldCheck },
  medium: { label: "Changes your files", cls: "bg-amber-50 text-amber-800", Icon: ShieldAlert },
  high: { label: "High risk", cls: "bg-red-50 text-red-700", Icon: ShieldAlert },
};

const Field = ({ label, children, testId }) => (
  <div data-testid={testId}>
    <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">{label}</p>
    <div className="text-[13px] text-slate-800">{children}</div>
  </div>
);

const Outcome = ({ ap }) => {
  const map = {
    approved: ["bg-emerald-50/90 text-emerald-800", `Approved version ${ap.approvedVersion}. Hermes continues with exactly this content.`],
    rejected: ["bg-slate-100/90 text-slate-700", "Rejected. Nothing was changed."],
    cancelled: ["bg-slate-100/90 text-slate-700", "The turn was stopped, so this request expired without running."],
  };
  const [cls, text] = map[ap.status];
  return <p data-testid="approval-outcome" className={`rounded-xl px-3 py-2 text-[12px] ${cls}`}>{text}</p>;
};

export const ApprovalPanel = ({ id }) => {
  const { state, dispatch, decide } = useWorkspace();
  const ap = state.approvals[id];
  if (!ap) return null;
  const pending = ap.status === "pending";
  const risk = RISK[ap.risk];
  const edit = (content) => dispatch({ type: "APPROVAL", id, patch: { content, edited: true, version: ap.edited ? ap.version : ap.version + 1 } });
  return (
    <div data-testid="approval-panel" className="flex flex-1 flex-col gap-4 overflow-y-auto">
      <span data-testid="approval-risk" className={`flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${risk.cls}`}><risk.Icon size={12} /> {risk.label}</span>
      <Field label="Action" testId="approval-tool"><span className="font-mono text-[12px]">{ap.tool}</span> — {ap.title}</Field>
      <Field label="Target" testId="approval-target"><span className="font-mono text-[12px]">{ap.target}</span></Field>
      <Field label="What happens" testId="approval-consequences">{ap.consequences}</Field>
      <Field label={`Content · version ${ap.version}${ap.edited ? " (edited by you)" : ""}`}>
        <textarea data-testid="approval-content-input" value={ap.content} readOnly={!pending} onChange={(e) => edit(e.target.value)} rows={ap.mono ? 12 : 6} aria-label="Proposed content"
          className={`glass-inset w-full resize-none rounded-2xl p-3 text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${ap.mono ? "font-mono text-[11.5px] leading-relaxed" : "text-[13px]"}`} />
      </Field>
      {pending ? (
        <>
          <p className="text-[12px] text-slate-500">Approving applies to version {ap.version} exactly as shown. Nothing runs until you decide.</p>
          <div className="flex justify-end gap-2">
            <button data-testid="action-reject-button" onClick={() => decide(id, "rejected")} className="focus-ring glass-chip rounded-full px-4 py-2 text-[13px] font-medium text-slate-700 hover:bg-white/90">Reject</button>
            <button data-testid="action-approve-button" onClick={() => decide(id, "approved", { content: ap.content, version: ap.version })} className="focus-ring rounded-full bg-blue-600 px-5 py-2 text-[13px] font-medium text-white shadow-[0_6px_18px_rgba(37,99,235,0.3)] hover:bg-blue-700">Approve version {ap.version}</button>
          </div>
        </>
      ) : <Outcome ap={ap} />}
    </div>
  );
};
