import { useEffect, useRef } from "react";
import { PlugZap } from "lucide-react";
import { useWorkspace } from "@/state/workspace";
import { useLive } from "@/state/live";
import { Composer } from "./Composer";
import { EmptyState } from "./EmptyState";
import { StreamItem } from "./StreamItem";
import { ModeBadge } from "./StatusPill";
import { Orb } from "./Orb";

const Header = ({ title }) => {
  const { dispatch } = useWorkspace();
  const { conn } = useLive();
  const who = conn?.signed_in ? `Hermes · ${conn.user?.display_name || conn.user?.email || "signed in"}` : "Hermes not connected";
  return (
    <header className="flex items-center gap-3 px-7 pt-5 pb-3">
      <h2 data-testid="conversation-title" className="min-w-0 flex-1 truncate font-heading text-lg font-medium text-slate-900">{title}</h2>
      <ModeBadge testId="demo-status-badge" />
      <button data-testid="connection-status-chip" onClick={() => dispatch({ type: "PANEL", panel: { type: "connection" } })}
        className="focus-ring glass-chip flex min-h-11 items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium text-slate-600 hover:bg-white/90">
        <PlugZap size={12} className={conn?.signed_in ? "text-emerald-600" : ""} /> {who}
      </button>
    </header>
  );
};

const Stream = ({ items, testId = "conversation-stream", children }) => {
  const scroller = useRef(null);
  const last = items[items.length - 1];
  useEffect(() => {
    const el = scroller.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 240) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [items.length, last?.text, last?.status]);
  return (
    <div ref={scroller} data-testid={testId} className="scroll-soft flex-1 space-y-4 overflow-y-auto px-7 py-4">
      {children}
      {items.map((i) => <StreamItem key={i.id} item={i} />)}
    </div>
  );
};

const Note = ({ children, testId, tone = "text-slate-500" }) => <p data-testid={testId} className={`py-10 text-center text-sm ${tone}`}>{children}</p>;

const LiveEmpty = () => (
  <div data-testid="live-empty-state" className="flex flex-1 flex-col items-center justify-center px-8 text-center">
    <Orb size={76} />
    <h1 className="mt-6 font-heading text-3xl font-medium tracking-tight text-slate-900">Your Hermes, live</h1>
    <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-500">Pick a chat from your history, or write below to start a new one.</p>
  </div>
);

const LiveBody = ({ active }) => {
  if (!active) return <LiveEmpty />;
  return (
    <Stream items={active.items} testId="live-conversation-stream">
      {active.loading && <Note testId="live-loading">Loading transcript from Hermes…</Note>}
      {active.error && <Note testId="live-error" tone="text-red-700">{active.error}</Note>}
      {!active.loading && !active.error && !active.items.length && <Note testId="live-no-messages">This chat has no readable messages.</Note>}
    </Stream>
  );
};

export const ConversationPanel = () => {
  const { state, dispatch, send, stop } = useWorkspace();
  const live = useLive();
  const isLive = live.mode === "live";
  const session = state.sessions.find((s) => s.id === state.activeId);
  const title = isLive ? live.active?.title || "Your Hermes chats" : session ? session.title : "New chat";
  const otherRunning = state.busy && state.busySid !== state.activeId;
  const latestRequestId = live.requests[live.requests.length - 1]?.id;
  useEffect(() => {
    if (isLive && latestRequestId) dispatch({ type: "PANEL", panel: { type: "live-request", id: latestRequestId } });
  }, [isLive, latestRequestId, dispatch]);
  const sendLive = (text) => live.send(text).catch(() => null);
  const stopLive = () => live.stop().catch(() => null);

  return (
    <main data-testid="conversation-panel" className="conversation-panel glass-panel flex min-w-0 flex-1 flex-col overflow-hidden rounded-[28px]">
      <Header title={title} />
      {isLive ? <LiveBody active={live.active} /> : session ? <Stream items={session.items} /> : <EmptyState onPick={(t) => send(t)} />}
      <div className="px-6 pb-5 pt-2">
        {isLive ? (
          <Composer
            testId="composer"
            busy={!!live.active?.busy}
            disabled={live.liveStatus !== "live"}
            placeholder={live.liveStatus === "live" ? "Message Hermes" : "Waiting for the live Hermes connection…"}
            onSend={sendLive}
            onStop={live.active?.runtimeId ? stopLive : null}
          />
        ) : (
          <Composer onSend={send} onStop={state.busySid === state.activeId ? stop : null} busy={state.busy} placeholder={otherRunning ? "Another chat is still running…" : "Ask anything"} />
        )}
        <p className="mt-2 text-center text-[11px] text-slate-500">
          {isLive ? "Live messages go to your Hermes. The connection pauses when this tab is hidden." : "Demo mode plays sample scenarios. Nothing reaches Hermes or any connected service."}
        </p>
      </div>
    </main>
  );
};
