import { RefreshCw } from "lucide-react";
import { useLive } from "@/state/live";
import { LoginForm } from "./LoginForm";

const Card = ({ title, children, testId }) => (
  <div data-testid={testId} className="glass-row rounded-2xl p-4">
    <p className="mb-1 font-semibold text-slate-900">{title}</p>
    {children}
  </div>
);

const Row = ({ label, value, testId }) => (
  <div className="flex justify-between gap-3 py-1 text-[12.5px]">
    <span className="text-slate-500">{label}</span>
    <span data-testid={testId} className="text-right font-medium text-slate-800">{value ?? "Not reported"}</span>
  </div>
);

const Overview = () => {
  const { overview: o, mode, setMode, logout } = useLive();
  if (!o) return <Card title="Signed in" testId="connection-overview">Loading details from your server…</Card>;
  return (
    <Card title={`Signed in as ${o.user?.display_name || o.user?.email || o.user?.user_id}`} testId="connection-overview">
      <Row label="Hermes version" value={o.version} testId="overview-version" />
      <Row label="Release date" value={o.release_date} testId="overview-release-date" />
      <Row label="Current profile" value={o.current_profile} testId="overview-current-profile" />
      <Row label="Default profile" value={o.active_profile} testId="overview-active-profile" />
      <Row label="Profiles on server" value={o.profiles?.length ? o.profiles.join(", ") : null} testId="overview-profiles" />
      <Row label="Gateway" value={o.gateway_state || (o.gateway_running ? "running" : "stopped")} testId="overview-gateway" />
      <p className="mt-1 text-[11px] text-slate-500">All values are read from your server right now, not assumed.</p>
      <div className="mt-3 flex justify-between">
        <button data-testid="mode-toggle-button" onClick={() => setMode(mode === "live" ? "demo" : "live")} className="focus-ring rounded-full bg-blue-600 px-4 py-2 text-[12px] font-medium text-white hover:bg-blue-700">
          {mode === "live" ? "Switch to Demo" : "Show my Hermes data"}
        </button>
        <button data-testid="hermes-logout-button" onClick={logout} className="focus-ring glass-chip rounded-full px-4 py-2 text-[12px] text-slate-700 hover:bg-white/90">Sign out</button>
      </div>
    </Card>
  );
};

const Live = () => {
  const { conn, refresh } = useLive();
  if (!conn) return <Card title="Live Hermes connection" testId="connection-live-status">Checking…</Card>;
  if (!conn.configured) return <Card title="Live Hermes connection" testId="connection-live-status"><p className="text-slate-600">The Hermes address isn't set up yet.</p></Card>;
  if (!conn.reachable) {
    return (
      <Card title="Can't reach your Hermes" testId="connection-live-status">
        <p className="text-slate-600">The server didn't answer {conn.error ? `(${conn.error})` : ""}. Check it's running and the address is right.</p>
        <button data-testid="connection-retry-button" onClick={refresh} className="mt-2 flex items-center gap-1.5 text-[12px] font-medium text-blue-700"><RefreshCw size={12} /> Try again</button>
      </Card>
    );
  }
  if (conn.signed_in) return <Overview />;
  return (
    <Card title="Sign in to your Hermes" testId="connection-live-status">
      <p className="mb-3 text-[12px] text-slate-600">Reachable · version {conn.version || "not reported"} · {conn.auth_required ? "login required" : "token-protected (no login gate)"}</p>
      <LoginForm conn={conn} />
    </Card>
  );
};

export const ConnectionPanel = () => {
  const { mode, liveStatus } = useLive();
  return (
    <div data-testid="connection-panel" className="space-y-4 overflow-y-auto text-[13px] text-slate-700">
      <Card title={`Mode: ${mode === "live" ? "Live" : "Demo"}`} testId="connection-mode">
        <p className="text-slate-600">{mode === "live" ? `Messages and approvals go directly to your Hermes. Live status: ${liveStatus}.` : "Chats, tasks and drafts are sample data. Nothing is sent anywhere."}</p>
        {mode === "live" && <p className="mt-2 text-[11px] text-slate-500">The socket closes in a hidden tab and reconnects only when you return.</p>}
      </Card>
      <Live />
      <p className="text-[11px] text-slate-500">Connection approach follows the Hermes dashboard's own API and auth (MIT, © Nous Research), commit ef35e8b.</p>
    </div>
  );
};
