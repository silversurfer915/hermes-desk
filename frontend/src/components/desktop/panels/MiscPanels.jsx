import { Download, FileText } from "lucide-react";
import { useWorkspace } from "@/state/workspace";
import { FILES, INTEGRATIONS } from "@/lib/demo/sampleData";
import { SERVICE_META } from "@/lib/ui";
import { StatusPill } from "../StatusPill";

export const FilePanel = ({ id }) => {
  const f = FILES[id];
  return (
    <div data-testid="file-preview-panel" className="flex flex-1 flex-col gap-3">
      <p className="font-mono text-[11.5px] text-slate-500">{f.path} · sample file</p>
      <iframe data-testid="file-preview-frame" title={f.name} src={f.url} className="w-full flex-1 rounded-2xl border border-white/70 bg-white" />
      <a data-testid="file-download-link" href={f.url} download={f.name} className="focus-ring glass-chip flex w-fit items-center gap-1.5 rounded-full px-4 py-2 text-[13px] text-slate-700 hover:bg-white/90"><Download size={14} /> Download</a>
    </div>
  );
};

export const FilesPanel = () => {
  const { dispatch } = useWorkspace();
  return (
    <ul data-testid="files-panel" className="space-y-2">
      {Object.values(FILES).map((f) => (
        <li key={f.id}>
          <button data-testid={`files-item-${f.id}`} onClick={() => dispatch({ type: "PANEL", panel: { type: "file", id: f.id } })} className="focus-ring glass-row flex w-full items-center gap-3 rounded-2xl p-3 text-left hover:bg-white/80">
            <FileText size={16} className="text-red-600" />
            <span className="flex-1 text-[13px] font-medium text-slate-800">{f.name}</span>
            <span className="text-[11px] text-slate-500">{f.size}</span>
          </button>
        </li>
      ))}
    </ul>
  );
};

export const ActivityPanel = () => {
  const { state, dispatch } = useWorkspace();
  const tasks = state.sessions.flatMap((s) => s.items.filter((i) => i.kind === "task").map((t) => ({ ...t, sid: s.id, sessionTitle: s.title })));
  return (
    <ul data-testid="activity-panel" className="space-y-2 overflow-y-auto">
      {tasks.map((t) => (
        <li key={`${t.sid}-${t.id}`}>
          <button data-testid={`activity-item-${t.id}`} onClick={() => dispatch({ type: "SELECT", id: t.sid })} className="focus-ring glass-row w-full rounded-2xl px-3 py-2.5 text-left hover:bg-white/80">
            <span className="flex items-center justify-between gap-2"><span className="truncate text-[13px] font-medium text-slate-800">{t.label}</span><StatusPill status={t.status} /></span>
            <span className="text-[11px] text-slate-500">{t.sessionTitle}</span>
          </button>
        </li>
      ))}
    </ul>
  );
};

export const IntegrationsPanel = () => (
  <div data-testid="integrations-panel" className="space-y-2">
    {INTEGRATIONS.map((i) => (
      <div key={i.id} data-testid={`integration-item-${i.id}`} className="glass-row flex items-center gap-3 rounded-2xl p-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl text-[11px] font-bold text-white" style={{ background: SERVICE_META[i.id].color }}>{i.name[0]}</span>
        <span className="flex-1"><span className="block text-[13px] font-medium text-slate-800">{i.name}</span><span className="block text-[11px] text-slate-500">{i.detail}</span></span>
        <span className={`text-[11px] font-medium ${i.status === "connected" ? "text-emerald-700" : "text-slate-500"}`}>{i.status === "connected" ? "Connected (sample)" : "Not set up"}</span>
      </div>
    ))}
    <p className="pt-2 text-[11px] text-slate-500">Sample list. When connected, this comes from the platforms your Hermes gateway reports.</p>
  </div>
);
