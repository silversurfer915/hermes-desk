import "@/App.css";
import { useState } from "react";
import { MessageSquareText, X } from "lucide-react";
import { WorkspaceProvider } from "@/state/workspace";
import { LiveProvider } from "@/state/live";
import { Toaster } from "@/components/ui/sonner";
import { Backdrop } from "@/components/desktop/Backdrop";
import { IconRail } from "@/components/desktop/IconRail";
import { HistoryRail } from "@/components/desktop/HistoryRail";
import { ConversationPanel } from "@/components/desktop/ConversationPanel";
import { ContextPanel } from "@/components/desktop/ContextPanel";

function App() {
  const [historyOpen, setHistoryOpen] = useState(false);
  return (
    <LiveProvider>
      <WorkspaceProvider>
        <Backdrop />
        <div data-testid="desktop-shell" className="desktop-shell flex h-[100dvh] w-full gap-3 p-4 font-sans text-slate-900 antialiased">
          <button
            data-testid="mobile-history-toggle"
            aria-label={historyOpen ? "Close chat history" : "Open chat history"}
            aria-expanded={historyOpen}
            onClick={() => setHistoryOpen((open) => !open)}
            className="mobile-history-toggle focus-ring glass-panel"
          >
            {historyOpen ? <X size={18} /> : <MessageSquareText size={18} />}
          </button>
          {historyOpen && <button aria-label="Close chat history" onClick={() => setHistoryOpen(false)} className="mobile-history-scrim" />}
          <div className={`navigation-shell glass-panel flex shrink-0 overflow-hidden rounded-[28px] ${historyOpen ? "history-open" : ""}`}>
            <IconRail />
            <HistoryRail onNavigate={() => setHistoryOpen(false)} />
          </div>
          <ConversationPanel />
          <ContextPanel />
        </div>
        <Toaster position="top-center" />
      </WorkspaceProvider>
    </LiveProvider>
  );
}

export default App;
