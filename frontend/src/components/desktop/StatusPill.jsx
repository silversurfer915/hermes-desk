import { STATUS_META } from "@/lib/ui";
import { useLive } from "@/state/live";

export const StatusPill = ({ status, testId }) => {
  const m = STATUS_META[status];
  return (
    <span data-testid={testId} data-status={status} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${m.ring} ${m.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot} ${status === "running" ? "animate-pulse" : ""}`} />
      {m.label}
    </span>
  );
};

export const DemoBadge = ({ testId = "demo-status-badge", compact = false }) => (
  <span data-testid={testId} className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/70 bg-amber-50/90 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
    {compact ? "Demo · nothing is sent" : "Demo — sample data, nothing is sent"}
  </span>
);

export const ModeBadge = ({ testId, compact }) => {
  const { mode } = useLive();
  if (mode !== "live") return <DemoBadge testId={testId} compact={compact} />;
  return (
    <span data-testid={testId ? `${testId}-live` : "live-status-badge"} className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/70 bg-emerald-50/90 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Live · read-only
    </span>
  );
};
