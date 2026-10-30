import { STATUS_META } from "@/lib/ui";

export const StatusPill = ({ status, testId }) => {
  const m = STATUS_META[status];
  return (
    <span data-testid={testId} data-status={status} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${m.ring} ${m.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot} ${status === "running" ? "animate-pulse" : ""}`} />
      {m.label}
    </span>
  );
};
