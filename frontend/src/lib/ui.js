export const SERVICE_META = {
  slack: { label: "Slack", color: "#4A154B" },
  email: { label: "Email", color: "#0F766E" },
  github: { label: "GitHub", color: "#111827" },
  telegram: { label: "Telegram", color: "#0284C7" },
};

export const STATUS_META = {
  queued: { label: "Queued", dot: "bg-amber-500", text: "text-amber-700", ring: "bg-amber-50/80" },
  running: { label: "Running", dot: "bg-blue-500", text: "text-blue-700", ring: "bg-blue-50/80" },
  waiting_for_approval: { label: "Waiting for approval", dot: "bg-violet-500", text: "text-violet-700", ring: "bg-violet-50/80" },
  completed: { label: "Completed", dot: "bg-emerald-500", text: "text-emerald-700", ring: "bg-emerald-50/80" },
  failed: { label: "Failed", dot: "bg-red-500", text: "text-red-700", ring: "bg-red-50/80" },
  interrupted: { label: "Interrupted", dot: "bg-slate-400", text: "text-slate-600", ring: "bg-slate-100/80" },
  unknown: { label: "No result recorded", dot: "bg-slate-300", text: "text-slate-600", ring: "bg-slate-100/80" },
};

export function groupByDate(sessions) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 86400000;
  const groups = { Today: [], Yesterday: [], "This Week": [], Earlier: [] };
  [...sessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).forEach((s) => {
    const t = new Date(s.updatedAt).getTime();
    const key = t >= start ? "Today" : t >= start - day ? "Yesterday" : t >= start - 6 * day ? "This Week" : "Earlier";
    groups[key].push(s);
  });
  return Object.entries(groups).filter(([, v]) => v.length);
}

export const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
};
