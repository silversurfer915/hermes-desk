import { Bot, FolderOpen, Inbox, ListChecks, Plug, Settings2, SlidersHorizontal, SquarePen, Sunrise } from "lucide-react";
import { useWorkspace } from "@/state/workspace";
import { useLive } from "@/state/live";
import { DEMO_USER } from "@/lib/demo/sampleData";
import { Avatar, Orb } from "./Orb";

const RailButton = ({ icon: Icon, label, onClick, active, badge, testId, disabled }) => (
  <button
    data-testid={testId}
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    title={disabled ? `${label} (finish or stop the current turn first)` : label}
    className={`focus-ring relative flex h-11 w-11 items-center justify-center rounded-2xl text-slate-600 transition-[background-color,color,transform] duration-200 hover:-translate-y-0.5 hover:bg-white/80 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 ${active ? "bg-white/90 text-blue-700 shadow-sm" : ""}`}
  >
    <Icon size={18} strokeWidth={1.8} />
    {badge ? (
      <span data-testid={`${testId}-badge`} className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-semibold text-white">
        {badge}
      </span>
    ) : null}
  </button>
);

export const IconRail = () => {
  const { state, dispatch, send } = useWorkspace();
  const live = useLive();
  const isLive = live.mode === "live";
  const open = (type) => dispatch({ type: "PANEL", panel: state.panel?.type === type ? null : { type } });
  const newChat = () => (isLive ? live.clearActive() : dispatch({ type: "NEW_CHAT" }));
  return (
    <nav data-testid="icon-rail" className="icon-rail flex w-16 shrink-0 flex-col items-center justify-between py-5">
      <div className="icon-rail-actions flex flex-col items-center gap-3">
        <div className="icon-rail-brand mb-2"><Orb size={30} /></div>
        <RailButton testId="rail-new-chat" icon={SquarePen} label={isLive ? "Back to chat list" : "New chat"} disabled={state.busy} onClick={newChat} />
        <RailButton testId="rail-attention" icon={Inbox} label={isLive ? "Attention summary (Demo only)" : "What needs my attention"} badge={isLive ? null : 2} disabled={state.busy || isLive} onClick={() => { dispatch({ type: "NEW_CHAT" }); send("What needs my attention?", { newChat: true }); }} />
        <RailButton testId="rail-activity" icon={ListChecks} label="Activity" active={state.panel?.type === "activity"} onClick={() => open("activity")} />
        <RailButton testId="rail-files" icon={FolderOpen} label="Files" active={state.panel?.type === "files"} onClick={() => open("files")} />
        <RailButton testId="rail-integrations" icon={Plug} label="Connected services" active={state.panel?.type === "integrations"} onClick={() => open("integrations")} />
        <RailButton testId="rail-briefing" icon={Sunrise} label="Morning briefing" active={state.panel?.type === "briefing"} disabled={!isLive} onClick={() => open("briefing")} />
        <RailButton testId="rail-bots" icon={Bot} label="Bot Mode" active={state.panel?.type === "bots"} disabled={!isLive} onClick={() => open("bots")} />
        <RailButton testId="rail-settings" icon={SlidersHorizontal} label="Advanced settings" active={state.panel?.type === "settings"} disabled={!isLive} onClick={() => open("settings")} />
        <RailButton testId="rail-connection" icon={Settings2} label="Connection & settings" active={state.panel?.type === "connection"} onClick={() => open("connection")} />
      </div>
      <Avatar testId="rail-profile-avatar" initials={DEMO_USER.initials} color="#334155" size={34} />
    </nav>
  );
};
