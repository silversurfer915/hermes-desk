import { useEffect, useState } from "react";
import { CalendarDays, ChevronRight, FileDiff, FilePlus2, FileText, Github, Globe, Hash, Mail, Terminal } from "lucide-react";
import { useWorkspace } from "@/state/workspace";
import { StatusPill } from "./StatusPill";

const TOOL_ICONS = { slack: Hash, email: Mail, github: Github, web_search: Globe, write_file: FilePlus2, read_file: FileText, patch: FileDiff, terminal: Terminal, calendar: CalendarDays };

const duration = (t) => (t.startedAt && t.endedAt ? `${((t.endedAt - t.startedAt) / 1000).toFixed(1)}s` : null);

export const TaskRow = ({ task }) => {
  const { dispatch } = useWorkspace();
  const [open, setOpen] = useState(task.status === "failed");
  useEffect(() => { if (task.status === "failed") setOpen(true); }, [task.status]);
  const Icon = TOOL_ICONS[task.tool] || Terminal;
  const waiting = task.status === "waiting_for_approval";
  return (
    <div data-testid={`task-row-${task.id}`} className="glass-row rounded-2xl">
      <div className="flex items-center gap-3 px-3.5 py-2.5">
        <button data-testid={`task-row-toggle-${task.id}`} onClick={() => setOpen(!open)} aria-expanded={open} className="focus-ring flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left">
          <ChevronRight size={14} className={`shrink-0 text-slate-400 transition-transform duration-200 ${open ? "rotate-90" : ""}`} />
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/80 text-slate-600"><Icon size={14} /></span>
          <span className="truncate text-[13px] font-medium text-slate-800">{task.label}</span>
          <span className="shrink-0 font-mono text-[11px] text-slate-400">{task.tool}</span>
        </button>
        {waiting && (
          <button data-testid={`task-review-button-${task.id}`} onClick={() => dispatch({ type: "PANEL", panel: { type: "approval", id: task.approvalId } })} className="focus-ring rounded-full bg-violet-600 px-3 py-1 text-[12px] font-medium text-white transition-colors hover:bg-violet-700">
            Review
          </button>
        )}
        <StatusPill status={task.status} testId={`task-status-${task.id}`} />
      </div>
      {open && (
        <div data-testid={`task-detail-${task.id}`} className="border-t border-white/60 px-4 py-3 text-[12px] text-slate-600">
          <p>{task.detail || (waiting ? "Paused until you approve or reject." : "No result reported yet.")}{duration(task) && <span className="ml-2 text-slate-400">· {duration(task)}</span>}</p>
          {task.output && <pre className={`mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-900/90 p-3 font-mono text-[11px] leading-relaxed ${task.status === "failed" ? "text-red-200" : "text-slate-200"}`}>{task.output}</pre>}
        </div>
      )}
    </div>
  );
};
