import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Search, X } from "lucide-react";
import { useLive } from "@/state/live";
import { groupByDate } from "@/lib/ui";

function useLiveSearch(q, signedIn) {
  const live = useLive();
  const [res, setRes] = useState({ list: null, error: null });
  useEffect(() => {
    if (!signedIn || !q.trim()) { setRes({ list: null, error: null }); return undefined; }
    const t = setTimeout(() => live.search(q.trim()).then((list) => setRes({ list, error: null })).catch((e) => setRes({ list: [], error: e.message })), 300);
    return () => clearTimeout(t);
  }, [q, signedIn]); // eslint-disable-line react-hooks/exhaustive-deps
  return res;
}

const Status = ({ live, searchErr }) => {
  if (live.sessions.loading) return <p data-testid="history-loading" className="px-2 text-sm text-slate-500">Loading your Hermes chats…</p>;
  const err = searchErr || live.sessions.error;
  if (!err) return null;
  return (
    <div data-testid="history-error" className="px-2 text-sm text-red-700">
      {err}
      <button data-testid="history-retry-button" onClick={live.loadSessions} className="mt-1 flex items-center gap-1 text-[12px] font-medium text-blue-700"><RefreshCw size={12} /> Retry</button>
    </div>
  );
};

export const HistoryRail = ({ onNavigate }) => {
  const live = useLive();
  const signedIn = live.signedIn;
  const [q, setQ] = useState("");
  const liveSearch = useLiveSearch(q, signedIn);
  useEffect(() => setQ(""), [signedIn]);
  const source = liveSearch.list ?? live.sessions.list;
  const groups = useMemo(() => groupByDate(source), [source]);
  const pick = (s) => {
    live.openSession(s);
    onNavigate?.();
  };

  return (
    <aside data-testid="history-rail" className="history-rail flex w-[248px] shrink-0 flex-col border-l border-white/50 py-4 pr-3 pl-3">
      <label className="glass-inset mb-4 flex items-center gap-2 rounded-2xl px-3 py-2 text-sm text-slate-500">
        <Search size={15} />
        <input data-testid="history-search-input" value={q} onChange={(e) => setQ(e.target.value)} disabled={!signedIn} placeholder={signedIn ? "Search Hermes chats" : "Sign in to search"} className="w-full bg-transparent text-slate-800 placeholder:text-slate-500 focus:outline-none disabled:cursor-not-allowed" />
        {q && <button data-testid="history-search-clear" aria-label="Clear search" onClick={() => setQ("")}><X size={14} /></button>}
      </label>
      <div className="scroll-soft -mr-2 flex-1 space-y-5 overflow-y-auto pr-2">
        {!signedIn && <p data-testid="history-signed-out" className="px-2 text-sm text-slate-500">Sign in to Hermes to see your chats here.</p>}
        {signedIn && <Status live={live} searchErr={liveSearch.error} />}
        {signedIn && groups.length === 0 && !live.sessions.loading && (
          <p data-testid="history-empty" className="px-2 text-sm text-slate-500">{q ? `No chats match “${q}”.` : "No chats in this Hermes profile yet."}</p>
        )}
        {groups.map(([label, list]) => (
          <section key={label} data-testid={`history-group-${label.toLowerCase().replace(" ", "-")}`}>
            <h3 className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</h3>
            {list.map((s) => (
              <button key={s.id} data-testid={`history-item-${s.id}`} onClick={() => pick(s)} title={s.title}
                className={`focus-ring block min-h-11 w-full truncate rounded-xl px-2 py-1.5 text-left text-[13px] transition-colors duration-150 ${live.active?.id === s.id ? "bg-white/85 font-medium text-slate-900 shadow-sm" : "text-slate-700 hover:bg-white/60"}`}>
                {s.isActive && <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-blue-500 align-middle" aria-label="active" />}
                {s.title}
              </button>
            ))}
          </section>
        ))}
      </div>
    </aside>
  );
};
