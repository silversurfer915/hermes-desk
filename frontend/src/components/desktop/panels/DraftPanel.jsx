import { useState } from "react";
import { ChevronLeft, ChevronRight, Paperclip, RotateCcw, Send, Sparkles, X, Check, Loader2 } from "lucide-react";
import { useDraft } from "./useDraft";
import { Composer } from "../Composer";

const SendButton = ({ d, onSend, disabled }) => {
  const label = { draft: "Send", sending: "Sending", sent: "Sent", failed: "Retry send" }[d.status];
  const Icon = { draft: Send, sending: Loader2, sent: Check, failed: RotateCcw }[d.status];
  const tone = d.status === "sent" ? "bg-emerald-600" : d.status === "failed" ? "bg-red-600 hover:bg-red-700" : d.status === "sending" ? "bg-blue-400" : "bg-blue-600 hover:bg-blue-700";
  return (
    <button data-testid="draft-send-button" data-state={d.status} onClick={onSend} disabled={disabled || d.status === "sending" || d.status === "sent"}
      className={`focus-ring flex items-center gap-2 rounded-full px-5 py-2 text-[13px] font-medium text-white shadow-[0_6px_18px_rgba(37,99,235,0.3)] transition-[background-color,transform] duration-200 hover:scale-[1.02] disabled:cursor-default disabled:hover:scale-100 ${tone} ${disabled ? "opacity-50" : ""}`}>
      {label} <Icon size={14} className={d.status === "sending" ? "animate-spin" : ""} />
    </button>
  );
};

const Recipients = ({ d, set, locked }) => {
  const [v, setV] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-white/60 px-4 py-3">
      <span className="text-[12px] text-slate-500">To</span>
      {d.recipients.map((r) => (
        <span key={r} data-testid="draft-recipient-chip" className="flex items-center gap-1 rounded-full bg-white/85 px-2.5 py-1 text-[12px] font-medium text-slate-800 shadow-sm">
          {r}{!locked && <button data-testid={`draft-recipient-remove-${r}`} aria-label={`Remove ${r}`} onClick={() => set(d.recipients.filter((x) => x !== r))}><X size={12} /></button>}
        </span>
      ))}
      {!locked && (
        <input data-testid="draft-recipient-input" value={v} onChange={(e) => setV(e.target.value)} placeholder={d.recipients.length ? "" : "Add recipient"}
          onKeyDown={(e) => { if (e.key === "Enter" && v.trim()) { set([...d.recipients, v.trim()]); setV(""); } }}
          className="min-w-[80px] flex-1 bg-transparent text-[12px] text-slate-800 placeholder:text-slate-500 focus:outline-none" />
      )}
    </div>
  );
};

const Versions = ({ d, pick, locked }) => d.versions.length > 1 && (
  <div data-testid="draft-version-switcher" className="flex items-center gap-1 text-[11px] text-slate-500">
    <button disabled={locked || d.version === 1} onClick={() => pick(d.version - 1)} aria-label="Previous version" data-testid="draft-version-prev" className="disabled:opacity-30"><ChevronLeft size={14} /></button>
    Version {d.version} of {d.versions.length}
    <button disabled={locked || d.version === d.versions.length} onClick={() => pick(d.version + 1)} aria-label="Next version" data-testid="draft-version-next" className="disabled:opacity-30"><ChevronRight size={14} /></button>
  </div>
);

const Notice = ({ d }) => {
  if (d.status === "failed") return <p data-testid="draft-error" role="alert" className="rounded-xl bg-red-50/90 px-3 py-2 text-[12px] text-red-700">{d.error} Edit or retry when ready.</p>;
  if (d.status === "sent") return <p data-testid="draft-sent-notice" className="rounded-xl bg-emerald-50/90 px-3 py-2 text-[12px] text-emerald-800">Marked as sent in Demo mode — version {d.approvedVersion} to {d.recipients.join(", ")}. Nothing actually left this app.</p>;
  if (d.status === "sending") return <p data-testid="draft-sending-notice" className="text-[12px] text-blue-700">Waiting for confirmation… editing is locked for version {d.approvedVersion}.</p>;
  if (d.invalidated) return <p data-testid="draft-invalidated-notice" className="text-[12px] text-amber-700">You edited the draft, so the earlier send approval no longer applies.</p>;
  return <p className="text-[12px] text-slate-500">Pressing Send approves exactly this version and these recipients.</p>;
};

export const DraftPanel = ({ id }) => {
  const x = useDraft(id);
  const { d, locked } = x;
  if (!d) return null;
  return (
    <div data-testid="draft-panel" className="flex flex-1 flex-col gap-4 overflow-hidden">
      <div className="glass-inset overflow-hidden rounded-[22px]">
        <Recipients d={d} set={x.setRecipients} locked={locked} />
        <textarea data-testid="draft-body-input" value={d.body} onChange={(e) => x.edit(e.target.value)} readOnly={locked} rows={7} aria-label="Draft message"
          className={`w-full resize-none bg-transparent px-4 py-3 text-[13.5px] leading-relaxed text-slate-900 focus:outline-none ${d.rewriting ? "animate-pulse" : ""}`} />
        <div className="flex items-center justify-between px-4 pb-3">
          <button data-testid="draft-attach-button" onClick={x.toggleAttach} disabled={locked} className="focus-ring glass-chip flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] text-slate-700 hover:bg-white/90 disabled:opacity-50">
            <Paperclip size={12} /> {d.attachments.length ? d.attachments[0] : "Attach"}
          </button>
          <Versions d={d} pick={x.pickVersion} locked={locked} />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <button data-testid="draft-rewrite-button" onClick={() => x.rewrite()} disabled={locked || d.rewriting} className="focus-ring glass-chip flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] text-slate-700 hover:bg-white/90 disabled:opacity-50">
          <Sparkles size={14} /> {d.rewriting ? "Rewriting…" : "Rewrite"}
        </button>
        <SendButton d={d} onSend={x.send} disabled={!d.recipients.length || !d.body.trim()} />
      </div>
      <Notice d={d} />
      <div className="mt-auto">
        <Composer testId="followup-composer" compact placeholder="Follow up — e.g. make it shorter" onSend={(t) => x.rewrite(t)} busy={locked || d.rewriting} />
        {d.lastInstruction && <p data-testid="draft-last-instruction" className="mt-1.5 text-[11px] text-slate-500">Last request: “{d.lastInstruction}” · demo rewrites are sample variations</p>}
      </div>
    </div>
  );
};
