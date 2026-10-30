const lineClass = (l) =>
  l.startsWith("+++") || l.startsWith("---") ? "text-slate-500"
    : l.startsWith("@@") ? "bg-blue-50/70 text-blue-700"
    : l.startsWith("+") ? "bg-emerald-50/80 text-emerald-800"
    : l.startsWith("-") ? "bg-red-50/80 text-red-800"
    : "text-slate-700";

export const DiffView = ({ diff, testId = "diff-view" }) => (
  <pre data-testid={testId} className="overflow-x-auto bg-white/70 py-2 font-mono text-[11.5px] leading-[1.7]">
    {diff.split("\n").map((l, i) => (
      <div key={i} className={`flex px-4 ${lineClass(l)}`}>
        <span className="mr-4 w-6 shrink-0 select-none text-right text-slate-300">{i + 1}</span>
        <span className="whitespace-pre">{l || " "}</span>
      </div>
    ))}
  </pre>
);
