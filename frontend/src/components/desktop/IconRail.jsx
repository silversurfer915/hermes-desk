import { Bot, Settings2, SlidersHorizontal, SquarePen, Sunrise } from "lucide-react";
import { useWorkspace } from "@/state/workspace";
import { useLive } from "@/state/live";
import { initialsOf } from "@/lib/ui";
import { Avatar, Orb } from "./Orb";

const RailButton = ({ icon: Icon, label, onClick, active, testId, disabled, disabledReason = "sign in to Hermes first" }) => (
  <button
    data-testid={testId}
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    title={disabled ? `${label} (${disabledReason})` : label}
    className={`focus-ring relative flex h-11 w-11 items-center justify-center rounded-2xl text-slate-600 transition-[background-color,color,transform] duration-200 hover:-translate-y-0.5 hover:bg-white/80 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 ${active ? "bg-white/90 text-blue-700 shadow-sm" : ""}`}
  >
    <Icon size={18} strokeWidth={1.8} />
  </button>
);

export const IconRail = () => {
  const { state, dispatch } = useWorkspace();
  const live = useLive();
  const open = (type) => dispatch({ type: "PANEL", panel: state.panel?.type === type ? null : { type } });
  const user = live.conn?.user;
  return (
    <nav data-testid="icon-rail" className="icon-rail flex w-16 shrink-0 flex-col items-center justify-between py-5">
      <div className="icon-rail-actions flex flex-col items-center gap-3">
        <div className="icon-rail-brand mb-2"><Orb size={30} /></div>
        <RailButton testId="rail-new-chat" icon={SquarePen} label="New chat" disabled={!live.signedIn} onClick={() => live.clearActive()} />
        <RailButton testId="rail-briefing" icon={Sunrise} label="Morning briefing" active={state.panel?.type === "briefing"} disabled={!live.signedIn} onClick={() => open("briefing")} />
        <RailButton testId="rail-bots" icon={Bot} label="Bot Mode" active={state.panel?.type === "bots"} disabled={!live.signedIn} onClick={() => open("bots")} />
        <RailButton testId="rail-settings" icon={SlidersHorizontal} label="Advanced settings" active={state.panel?.type === "settings"} disabled={!live.signedIn} onClick={() => open("settings")} />
        <RailButton testId="rail-connection" icon={Settings2} label="Connection & settings" active={state.panel?.type === "connection"} onClick={() => open("connection")} />
      </div>
      {user && <Avatar testId="rail-profile-avatar" initials={initialsOf(user.display_name || user.email || user.user_id)} color="#334155" size={34} />}
    </nav>
  );
};
