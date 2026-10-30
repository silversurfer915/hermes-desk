import { useState } from "react";
import { ArrowUp, Paperclip, Square } from "lucide-react";

export const Composer = ({ onSend, onStop, busy, disabled = false, placeholder = "Ask anything", testId = "composer", compact = false }) => {
  const [text, setText] = useState("");
  const submit = () => {
    const v = text.trim();
    if (!v || busy) return;
    onSend(v);
    setText("");
  };
  return (
    <div data-testid={testId} className="glass-inset rounded-[22px] px-4 pt-3 pb-2.5 transition-shadow duration-200 focus-within:shadow-[0_0_0_3px_rgba(37,99,235,0.18)]">
      <textarea
        data-testid={`${testId}-input`}
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
        rows={compact ? 1 : 2}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full resize-none bg-transparent text-[14px] leading-relaxed text-slate-900 placeholder:text-slate-500 focus:outline-none"
      />
      <div className="mt-1 flex items-center justify-between">
        {compact ? <span /> : <button
          data-testid={`${testId}-attach-button`}
          disabled
          title="Attachments need a live Hermes connection"
          aria-label="Attach file (needs a live Hermes connection)"
          className="flex h-11 w-11 items-center justify-center rounded-full text-slate-400"
        >
          <Paperclip size={16} />
        </button>}
        {busy && onStop ? (
          <button data-testid={`${testId}-stop-button`} onClick={onStop} aria-label="Stop" className="focus-ring flex h-11 items-center gap-1.5 rounded-full bg-slate-900 px-4 text-xs font-medium text-white transition-transform duration-150 hover:scale-[1.03]">
            <Square size={11} fill="currentColor" /> Stop
          </button>
        ) : (
          <button data-testid={`${testId}-send-button`} onClick={submit} disabled={!text.trim() || busy} aria-label="Send" className="focus-ring flex h-11 w-11 items-center justify-center rounded-full bg-blue-600 text-white transition-[background-color,transform,opacity] duration-150 hover:scale-105 hover:bg-blue-700 disabled:opacity-40 disabled:hover:scale-100">
            <ArrowUp size={16} />
          </button>
        )}
      </div>
    </div>
  );
};
