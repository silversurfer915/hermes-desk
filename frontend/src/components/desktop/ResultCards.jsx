import { ExternalLink, FileText, FileDiff, Hash } from "lucide-react";
import { useWorkspace } from "@/state/workspace";
import { FILES } from "@/lib/demo/sampleData";
import { DiffView } from "./DiffView";

export const FileCard = ({ item }) => {
  const { dispatch } = useWorkspace();
  const f = FILES[item.fileId];
  return (
    <button data-testid={`file-card-${item.id}`} onClick={() => dispatch({ type: "PANEL", panel: { type: "file", id: f.id } })}
      className="focus-ring glass-row group flex w-full max-w-md items-center gap-3.5 rounded-2xl p-3 text-left transition-transform duration-200 hover:-translate-y-0.5">
      <span className="flex h-14 w-11 shrink-0 items-center justify-center rounded-lg bg-gradient-to-b from-red-50 to-white text-red-600 shadow-sm ring-1 ring-red-100"><FileText size={20} /></span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-slate-900">{f.name}</span>
        <span className="block text-[11px] text-slate-500">PDF · {f.size} · sample file</span>
      </span>
      <span className="flex items-center gap-1 text-[12px] font-medium text-blue-700 opacity-80 group-hover:opacity-100">Preview <ExternalLink size={12} /></span>
    </button>
  );
};

export const CodeCard = ({ item }) => (
  <div data-testid={`code-card-${item.id}`} className="glass-row overflow-hidden rounded-2xl">
    <div className="flex items-center gap-2 border-b border-white/60 px-4 py-2.5 text-[12px] font-medium text-slate-700">
      <FileDiff size={14} className="text-blue-600" /> {item.title} <span className="ml-auto text-slate-400">diff</span>
    </div>
    <DiffView diff={item.diff} />
  </div>
);

export const IntegrationCard = ({ item }) => (
  <div data-testid={`integration-card-${item.id}`} className="glass-row max-w-xl rounded-2xl p-4">
    <p className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-slate-900"><Hash size={14} className="text-[#4A154B]" /> {item.summary.title} <span className="ml-auto text-[11px] font-medium text-amber-700">sample data</span></p>
    <ul className="space-y-2">
      {item.summary.channels.map((c) => (
        <li key={c.name} data-testid={`integration-channel-${c.name.slice(1)}`} className="flex gap-3 rounded-xl bg-white/60 px-3 py-2 text-[12.5px]">
          <span className="w-20 shrink-0 font-medium text-slate-800">{c.name}</span>
          <span className="flex-1 text-slate-600">{c.highlight}</span>
          <span className="shrink-0 text-slate-400">{c.count} msgs</span>
        </li>
      ))}
    </ul>
  </div>
);
