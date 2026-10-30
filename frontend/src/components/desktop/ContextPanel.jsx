import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, FileText, FolderOpen, Hash, ListChecks, Mail, Github, Plug, Settings2, ShieldQuestion, SlidersHorizontal, Sunrise, X } from "lucide-react";
import { useWorkspace } from "@/state/workspace";
import { FILES } from "@/lib/demo/sampleData";
import { ModeBadge } from "./StatusPill";
import { DraftPanel } from "./panels/DraftPanel";
import { ApprovalPanel } from "./panels/ApprovalPanel";
import { ActivityPanel, FilePanel, FilesPanel, IntegrationsPanel } from "./panels/MiscPanels";
import { ConnectionPanel } from "./panels/ConnectionPanel";
import { LiveRequestPanel } from "./panels/LiveRequestPanel";
import { BriefingPanel } from "./panels/BriefingPanel";
import { BotPanel } from "./panels/BotPanel";
import { SettingsPanel } from "./panels/SettingsPanel";

const CHANNEL_ICON = { slack: Hash, email: Mail, github: Github };

function meta(panel, state) {
  switch (panel.type) {
    case "draft": { const d = state.drafts[panel.id]; return { title: d?.title, Icon: CHANNEL_ICON[d?.channel] || Mail, body: <DraftPanel id={panel.id} /> }; }
    case "approval": return { title: "Approval needed", Icon: ShieldQuestion, body: <ApprovalPanel id={panel.id} /> };
    case "live-request": return { title: "Hermes needs your input", Icon: ShieldQuestion, body: <LiveRequestPanel id={panel.id} /> };
    case "briefing": return { title: "Morning briefing", Icon: Sunrise, body: <BriefingPanel /> };
    case "bots": return { title: "Bot Mode", Icon: Bot, body: <BotPanel /> };
    case "settings": return { title: "Hermes Settings", Icon: SlidersHorizontal, body: <SettingsPanel /> };
    case "file": return { title: FILES[panel.id].name, Icon: FileText, body: <FilePanel id={panel.id} /> };
    case "files": return { title: "Files", Icon: FolderOpen, body: <FilesPanel /> };
    case "activity": return { title: "Activity", Icon: ListChecks, body: <ActivityPanel /> };
    case "integrations": return { title: "Connected services", Icon: Plug, body: <IntegrationsPanel /> };
    default: return { title: "Connection & settings", Icon: Settings2, body: <ConnectionPanel /> };
  }
}

export const ContextPanel = () => {
  const { state, dispatch } = useWorkspace();
  const panel = state.panel;
  const m = panel && meta(panel, state);
  useEffect(() => {
    if (!panel) return undefined;
    const onKey = (e) => { if (e.key === "Escape") dispatch({ type: "PANEL", panel: null }); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panel, dispatch]);
  return (
    <AnimatePresence>
      {panel && (
        <motion.aside
          key="context-panel"
          data-testid="context-panel"
          initial={{ opacity: 0, x: 24, width: 0 }}
          animate={{ opacity: 1, x: 0, width: 420 }}
          exit={{ opacity: 0, x: 24, width: 0 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          className="context-panel glass-panel flex shrink-0 flex-col overflow-hidden rounded-[28px]"
        >
          <div className="context-inner flex w-[420px] flex-1 flex-col overflow-hidden px-5 pt-5 pb-5">
            <header className="mb-4 flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/85 text-blue-700 shadow-sm"><m.Icon size={16} /></span>
              <h2 data-testid="context-panel-title" className="min-w-0 flex-1 truncate font-heading text-[17px] font-medium text-slate-900">{m.title}</h2>
              <button data-testid="context-panel-close" aria-label="Close panel" onClick={() => dispatch({ type: "PANEL", panel: null })} className="focus-ring flex h-11 w-11 items-center justify-center rounded-full bg-white/70 text-slate-600 hover:bg-white">
                <X size={15} />
              </button>
            </header>
            <div className="mb-4"><ModeBadge testId="context-panel-demo-badge" compact /></div>
            <div key={`${panel.type}-${panel.id}`} className="flex min-h-0 flex-1 flex-col">{m.body}</div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
};
