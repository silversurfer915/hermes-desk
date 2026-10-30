import { useCallback, useEffect, useState } from "react";
import { Play, RefreshCw } from "lucide-react";
import { api } from "@/state/live";

const time = (value) => value ? new Date(value * 1000).toLocaleString() : "Not run yet";

function BlueprintForm({ blueprints, onCreated }) {
  const [selected, setSelected] = useState(blueprints[0]?.key || "");
  const [values, setValues] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const blueprint = blueprints.find((item) => item.key === selected) || blueprints[0];
  useEffect(() => {
    const next = {};
    (blueprint?.fields || []).forEach((field) => {
      if (field.default !== undefined) next[field.name] = field.default;
    });
    setValues(next);
  }, [blueprint]);
  if (!blueprint) return null;

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/briefing/setup", {
        method: "POST",
        body: JSON.stringify({ blueprint: blueprint.key, values }),
      });
      await onCreated();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      {blueprints.length > 1 && (
        <label className="block text-[12px] font-medium">Briefing recipe
          <select value={selected} onChange={(event) => setSelected(event.target.value)} className="glass-inset mt-1 min-h-11 w-full rounded-xl px-3">
            {blueprints.map((item) => <option key={item.key} value={item.key}>{item.name || item.title || item.key}</option>)}
          </select>
        </label>
      )}
      {(blueprint.fields || []).map((field) => (
        <label key={field.name} className="block text-[12px] font-medium text-slate-700">
          {field.label || field.name}{field.required ? " *" : ""}
          {field.options ? (
            <select required={field.required} value={values[field.name] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))} className="glass-inset focus-ring mt-1 min-h-11 w-full rounded-xl px-3 font-normal">
              <option value="">Choose…</option>
              {field.options.map((option) => {
                const value = typeof option === "string" ? option : option.value || option.id;
                return <option key={value} value={value}>{typeof option === "string" ? option : option.label || value}</option>;
              })}
            </select>
          ) : field.type === "textarea" || field.type === "text_area" ? (
            <textarea required={field.required} rows={3} placeholder={field.placeholder || ""} value={values[field.name] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))} className="glass-inset focus-ring mt-1 w-full rounded-xl p-3 font-normal outline-none" />
          ) : (
            <input required={field.required} type={field.type === "number" ? "number" : "text"} placeholder={field.placeholder || ""} value={values[field.name] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))} className="glass-inset focus-ring mt-1 min-h-11 w-full rounded-xl px-3 font-normal outline-none" />
          )}
          {field.description && <span className="mt-1 block text-[11px] font-normal text-slate-500">{field.description}</span>}
        </label>
      ))}
      <button disabled={busy} className="focus-ring min-h-11 w-full rounded-xl bg-blue-600 px-4 text-[13px] font-medium text-white disabled:opacity-50">
        {busy ? "Creating in Hermes…" : "Create morning briefing"}
      </button>
      {error && <p role="alert" className="text-[12px] text-red-700">{error}</p>}
    </form>
  );
}

export const BriefingPanel = () => {
  const [state, setState] = useState({ loading: true, data: null, blueprints: [], error: null });
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const data = await api("/briefing");
      const blueprints = data.job ? [] : (await api("/briefing/blueprints")).blueprints;
      setState({ loading: false, data, blueprints, error: null });
    } catch (error) { setState({ loading: false, data: null, blueprints: [], error: error.message }); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const trigger = async () => {
    const job = state.data?.job;
    if (!job) return;
    setBusy(true);
    try {
      await api("/briefing/trigger", {
        method: "POST",
        body: JSON.stringify({ job_id: job.id || job.job_id, profile: job.profile }),
      });
      await load();
    } catch (error) { setState((current) => ({ ...current, error: error.message })); } finally { setBusy(false); }
  };

  if (state.loading) return <p className="py-8 text-center text-sm text-slate-500">Looking for your Hermes briefing…</p>;
  if (state.error && !state.data) return <div className="py-6 text-center text-sm text-red-700">{state.error}<button onClick={load} className="mt-3 flex min-h-11 items-center gap-2 text-blue-700"><RefreshCw size={14} /> Try again</button></div>;
  const { job, run, content, content_kind: contentKind } = state.data || {};
  return (
    <div data-testid="briefing-panel" className="scroll-soft flex-1 space-y-4 overflow-y-auto">
      <p className="text-[12px] leading-relaxed text-slate-500">Written and delivered by Hermes. Hermes Desk only displays the result.</p>
      {job ? (
        <>
          <div className="glass-row rounded-2xl p-4">
            <p className="font-heading text-lg font-medium text-slate-900">{job.name || job.title || "Morning briefing"}</p>
            <p className="mt-1 text-[12px] text-slate-500">{job.schedule || job.cron || "Schedule reported by Hermes"} · {job.deliver || "local"}</p>
            <p className="mt-2 text-[12px] text-slate-600">Latest run: {time(run?.started_at || job.last_run_at)}</p>
            <button data-testid="briefing-run-button" disabled={busy} onClick={trigger} className="focus-ring mt-3 flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 text-[13px] font-medium text-white disabled:opacity-50"><Play size={14} /> {busy ? "Asking Hermes…" : "Run with Hermes now"}</button>
          </div>
          {content ? (
            <article className="glass-row rounded-2xl p-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">{contentKind === "preview" ? "Latest Hermes run preview" : "Latest Hermes briefing"}</p>
              <div className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-slate-800">{content}</div>
            </article>
          ) : <p className="py-5 text-center text-sm text-slate-500">Hermes hasn’t produced a briefing yet.</p>}
        </>
      ) : (
        <div className="glass-row rounded-2xl p-4">
          <p className="mb-3 font-medium text-slate-900">Set up your morning briefing</p>
          {state.blueprints.length ? <BlueprintForm blueprints={state.blueprints} onCreated={load} /> : <p className="text-[13px] leading-relaxed text-slate-600">No briefing blueprint is exposed by this Hermes version. Ask Hermes to create a morning briefing routine; it will appear here automatically.</p>}
        </div>
      )}
      {state.error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-[12px] text-red-700">{state.error}</p>}
    </div>
  );
};
