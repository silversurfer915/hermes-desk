import { useState } from "react";
import { useWorkspace } from "@/state/workspace";
import { SERVICE_META } from "@/lib/ui";
import { Avatar } from "./Orb";

const TABS = ["high", "medium", "low"];

const DraftState = ({ draft, baseId }) => {
  if (!draft || draft.status === "draft") return null;
  const map = { sending: "text-blue-600", sent: "text-emerald-600", failed: "text-red-600" };
  const label = { sending: "Sending…", sent: "Sent (demo)", failed: "Failed" };
  return <span data-testid={`draft-inline-status-${baseId}`} className={`text-[11px] font-medium ${map[draft.status]}`}>{label[draft.status]}</span>;
};

const Row = ({ row }) => {
  const { state, dispatch } = useWorkspace();
  const activeDraft = state.panel?.type === "draft" ? state.panel.id : null;
  return (
    <div data-testid={`attention-row-${row.id}`} className={`glass-row flex items-center gap-3.5 rounded-[20px] px-4 py-3 transition-shadow ${row.actions.some((a) => a.draftId === activeDraft) ? "ring-2 ring-blue-500/40" : ""}`}>
      <Avatar initials={row.person.initials} color={row.person.color} size={38} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-[13px] font-semibold text-slate-900">{row.person.name}</p>
          <span className="text-[11px] text-slate-500">{row.person.role} · {SERVICE_META[row.source].label}</span>
        </div>
        <p className="mt-0.5 text-[12.5px] leading-snug text-slate-600">{row.summary}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {row.actions.map((a) => (
          <span key={a.draftId} className="flex items-center gap-2">
            <DraftState draft={state.drafts[a.draftId]} baseId={a.baseId} />
            <button
              data-testid={`attention-action-${a.baseId}`}
              onClick={() => dispatch({ type: "PANEL", panel: { type: "draft", id: a.draftId } })}
              className={`focus-ring rounded-full px-3.5 py-1.5 text-[12px] font-medium transition-[background-color,transform] duration-150 hover:-translate-y-px ${a.primary ? "bg-blue-600 text-white shadow-[0_4px_14px_rgba(37,99,235,0.35)] hover:bg-blue-700" : "glass-chip text-slate-700 hover:bg-white/90"}`}
            >
              {a.label}
            </button>
          </span>
        ))}
      </div>
    </div>
  );
};

export const AttentionSummary = ({ item }) => {
  const [tab, setTab] = useState("high");
  const rows = item.rows.filter((r) => r.priority === tab);
  return (
    <div data-testid="attention-summary" className="space-y-3">
      <div role="tablist" className="flex gap-2">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} data-testid={`priority-tab-${t}`} onClick={() => setTab(t)}
            className={`focus-ring rounded-full px-4 py-1.5 text-[12px] font-medium capitalize transition-colors duration-150 ${tab === t ? "bg-white text-slate-900 shadow-sm" : "glass-chip text-slate-600 hover:bg-white/80"}`}>
            {t} <span className="ml-1 text-slate-400">{item.rows.filter((r) => r.priority === t).length}</span>
          </button>
        ))}
      </div>
      <div className="space-y-2.5">{rows.map((r) => <Row key={r.id} row={r} />)}</div>
    </div>
  );
};
