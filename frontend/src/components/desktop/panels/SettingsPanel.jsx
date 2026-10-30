import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { api } from "@/state/live";

const SECTIONS = [
  ["skills", "Skills"], ["memory", "Memory"], ["models", "Models"],
  ["subagents", "Subagents"], ["tools", "Tools"], ["mcp", "MCP"],
  ["terminal", "Terminal"], ["context", "Context"], ["schedules", "Schedules"],
];

// Review #9: cache the last-good payload per tab and render instantly while it refreshes.
const SECTION_CACHE = new Map();

const modelChoices = (options) => (options?.providers || []).flatMap((provider) =>
  (provider.models || []).map((entry) => {
    const model = typeof entry === "string" ? entry : entry.id || entry.name || entry.model;
    const slug = provider.slug || provider.id || provider.name || provider.provider;
    return model ? { provider: slug, model, label: `${model} · ${provider.name || slug}` } : null;
  }).filter(Boolean));

function Skills({ data, reload }) {
  const [error, setError] = useState(null);
  const toggle = async (skill) => {
    try {
      await api("/settings/skills/toggle", { method: "PUT", body: JSON.stringify({ name: skill.name, enabled: !skill.enabled }) });
      await reload();
    } catch (err) { setError(err.message); }
  };
  return <div className="space-y-2">{(data.skills || []).map((skill) => (
    <div key={skill.name} className="glass-row rounded-2xl p-3">
      <div className="flex items-start gap-3"><div className="min-w-0 flex-1"><p className="text-[13px] font-medium text-slate-900">{skill.name}</p><p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{skill.description || `${skill.provenance || "Hermes"} skill`}</p></div>
        <button onClick={() => toggle(skill)} className={`focus-ring min-h-11 rounded-xl px-3 text-[12px] font-medium ${skill.enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{skill.enabled ? "Enabled" : "Disabled"}</button></div>
    </div>
  ))}{!data.skills?.length && <p className="text-sm text-slate-500">Hermes reported no skills.</p>}{error && <p className="text-[12px] text-red-700">{error}</p>}</div>;
}

function Models({ data, reload }) {
  const choices = useMemo(() => modelChoices(data.options), [data.options]);
  const current = data.info?.model || "";
  const [selected, setSelected] = useState("");
  const [message, setMessage] = useState(null);
  useEffect(() => {
    const match = choices.find((choice) => choice.model === current);
    setSelected(match ? `${match.provider}::${match.model}` : "");
  }, [current, choices]);
  const save = async (confirm = false) => {
    const choice = choices.find((item) => `${item.provider}::${item.model}` === selected);
    if (!choice) return;
    setMessage(null);
    try {
      const result = await api("/settings/models/set", { method: "POST", body: JSON.stringify({ ...choice, scope: "main", confirm_expensive_model: confirm }) });
      if (result.confirm_required) {
        if (window.confirm(result.confirm_message || "Use this potentially expensive model?")) return save(true);
        return;
      }
      setMessage("Saved on Hermes. New chats will use this model.");
      await reload();
    } catch (error) { setMessage(error.message); }
  };
  return <div className="space-y-4">
    <div className="glass-row rounded-2xl p-4"><p className="text-[11px] uppercase tracking-[0.1em] text-slate-500">Current main model</p><p className="mt-1 font-heading text-lg text-slate-900">{current || "Not configured"}</p><p className="text-[12px] text-slate-500">{data.info?.provider || "No provider reported"} · context {data.info?.effective_context_length || "unknown"}</p></div>
    <label className="block text-[12px] font-medium text-slate-700">Model for new chats
      <select value={selected} onChange={(event) => setSelected(event.target.value)} className="glass-inset focus-ring mt-1 min-h-11 w-full rounded-xl px-3 font-normal">
        <option value="">Choose a Hermes model…</option>{choices.map((choice) => <option key={`${choice.provider}::${choice.model}`} value={`${choice.provider}::${choice.model}`}>{choice.label}</option>)}
      </select>
    </label>
    <button disabled={!selected} onClick={() => save()} className="focus-ring min-h-11 rounded-xl bg-blue-600 px-4 text-[13px] font-medium text-white disabled:opacity-40">Save model on Hermes</button>
    {message && <p className="text-[12px] text-slate-600">{message}</p>}
    {data.auxiliary?.tasks?.length > 0 && <div><p className="mb-2 text-[12px] font-medium">Auxiliary assignments</p>{data.auxiliary.tasks.map((task) => <div key={task.task} className="flex justify-between border-b border-white/50 py-2 text-[12px]"><span className="text-slate-500">{task.label || task.task}</span><span>{task.model || task.effective?.model || "Inherit main"}</span></div>)}</div>}
  </div>;
}

function Mcp({ data, reload }) {
  const [results, setResults] = useState({});
  const action = async (server, kind) => {
    const name = server.name;
    setResults((current) => ({ ...current, [name]: "Working…" }));
    try {
      if (kind === "test") {
        const result = await api(`/settings/mcp/${encodeURIComponent(name)}/test`, { method: "POST" });
        setResults((current) => ({ ...current, [name]: result.ok ? `Connected · ${result.tools?.length || 0} tools` : result.error }));
      } else {
        await api(`/settings/mcp/${encodeURIComponent(name)}/enabled`, { method: "PUT", body: JSON.stringify({ name, enabled: !server.enabled }) });
        await reload();
      }
    } catch (error) { setResults((current) => ({ ...current, [name]: error.message })); }
  };
  return <div className="space-y-2">{(data.servers || []).map((server) => <div key={server.name} className="glass-row rounded-2xl p-3">
    <p className="text-[13px] font-medium">{server.name}</p><p className="text-[11px] text-slate-500">{server.transport || server.url || server.command || "MCP server"}</p>
    <div className="mt-2 flex gap-2"><button onClick={() => action(server, "toggle")} className="focus-ring glass-chip min-h-11 rounded-xl px-3 text-[12px]">{server.enabled === false ? "Enable" : "Disable"}</button><button onClick={() => action(server, "test")} className="focus-ring glass-chip min-h-11 rounded-xl px-3 text-[12px]">Test connection</button></div>
    {results[server.name] && <p className="mt-2 text-[11px] text-slate-600">{results[server.name]}</p>}
  </div>)}{!data.servers?.length && <p className="text-sm text-slate-500">No MCP servers configured on Hermes.</p>}</div>;
}

function Schedules({ data, reload }) {
  const [error, setError] = useState(null);
  const action = async (job, name) => {
    try {
      await api(`/settings/schedules/${encodeURIComponent(job.id || job.job_id)}/action`, { method: "POST", body: JSON.stringify({ action: name, profile: job.profile }) });
      await reload();
    } catch (err) { setError(err.message); }
  };
  return <div className="space-y-2">{(data.jobs || []).map((job) => {
    const paused = job.enabled === false || job.state === "paused";
    return <div key={`${job.profile || "default"}:${job.id || job.job_id}`} className="glass-row rounded-2xl p-3">
      <p className="text-[13px] font-medium">{job.name || job.title}</p><p className="mt-0.5 text-[11px] text-slate-500">{typeof job.schedule === "string" ? job.schedule : job.cron || "Hermes schedule"} · {job.profile || "default"}</p>
      <div className="mt-2 flex gap-2"><button onClick={() => action(job, paused ? "resume" : "pause")} className="focus-ring glass-chip min-h-11 rounded-xl px-3 text-[12px]">{paused ? "Resume" : "Pause"}</button><button onClick={() => action(job, "trigger")} className="focus-ring glass-chip min-h-11 rounded-xl px-3 text-[12px]">Run now</button></div>
    </div>;
  })}{!data.jobs?.length && <p className="text-sm text-slate-500">No routines scheduled on Hermes.</p>}{error && <p className="text-[12px] text-red-700">{error}</p>}</div>;
}

function ConfigSection({ section, data }) {
  const entries = Object.entries(data.config || {});
  return <div className="space-y-3">
    {section === "context" && data.model && <div className="glass-row rounded-2xl p-4"><p className="text-[12px] font-medium">Effective context</p><p className="mt-1 text-[12px] text-slate-600">{data.model.effective_context_length || "Unknown"} tokens · {data.model.model || "No model"}</p></div>}
    {entries.map(([key, value]) => <div key={key} className="glass-row rounded-2xl p-4"><p className="mb-2 text-[12px] font-semibold text-slate-900">{key.replaceAll("_", " ")}</p><pre className="scroll-soft max-h-96 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-slate-600">{JSON.stringify(value, null, 2)}</pre></div>)}
    {!entries.length && <p className="glass-row rounded-2xl p-4 text-[13px] leading-relaxed text-slate-600">Hermes did not report a dedicated {section} block. No defaults have been invented by Hermes Desk.</p>}
    <p className="text-[11px] leading-relaxed text-slate-500">Secret-shaped values are redacted by the backend. Changes remain in Hermes’s own secure configuration surfaces.</p>
  </div>;
}

export const SettingsPanel = () => {
  const [section, setSection] = useState("skills");
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const load = useCallback(async () => {
    const cached = SECTION_CACHE.get(section);
    if (cached) setState({ loading: false, data: cached, error: null });
    else setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const data = await api(`/settings/${section}`);
      SECTION_CACHE.set(section, data);
      setState({ loading: false, data, error: null });
    } catch (error) {
      setState({ loading: false, data: cached || null, error: error.message });
    }
  }, [section]);
  useEffect(() => { load(); }, [load]);
  return (
    <div data-testid="settings-panel" className="flex min-h-0 flex-1 flex-col">
      <div data-testid="settings-tabs" className="tab-strip -mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 pb-2">
        {SECTIONS.map(([id, label]) => <button key={id} data-testid={`settings-tab-${id}`} onClick={() => setSection(id)} className={`focus-ring min-h-11 shrink-0 rounded-xl px-2.5 text-[12px] font-medium ${section === id ? "bg-blue-600 text-white" : "glass-chip text-slate-600"}`}>{label}</button>)}
      </div>
      <div className="scroll-soft min-h-0 flex-1 overflow-y-auto pr-1">
        {state.loading && <p className="py-8 text-center text-sm text-slate-500">Reading {section} from Hermes…</p>}
        {state.error && <div className="py-6 text-center text-sm text-red-700">{state.error}<button onClick={load} className="mx-auto mt-3 flex min-h-11 items-center gap-2 text-blue-700"><RefreshCw size={14} /> Try again</button></div>}
        {!state.loading && !state.error && state.data && <>
          {section === "skills" && <Skills data={state.data} reload={load} />}
          {section === "models" && <Models data={state.data} reload={load} />}
          {section === "mcp" && <Mcp data={state.data} reload={load} />}
          {section === "schedules" && <Schedules data={state.data} reload={load} />}
          {!['skills', 'models', 'mcp', 'schedules'].includes(section) && <ConfigSection section={section} data={state.data} />}
        </>}
      </div>
    </div>
  );
};
