import { motion } from "framer-motion";
import { Orb } from "./Orb";
import { TaskRow } from "./TaskRow";

const renderText = (text) =>
  text.split(/(`[^`]+`)/).map((p, i) => (p.startsWith("`") ? <code key={i} className="rounded bg-slate-900/5 px-1 font-mono text-[12px]">{p.slice(1, -1)}</code> : p));

const Body = ({ item }) => {
  switch (item.kind) {
    case "user":
      return (
        <div className="flex justify-end">
          <p data-testid={`message-user-${item.id}`} className="max-w-[70%] rounded-[20px] rounded-br-md bg-blue-600 px-4 py-2.5 text-[14px] leading-relaxed text-white shadow-[0_6px_20px_rgba(37,99,235,0.25)]">{item.text}</p>
        </div>
      );
    case "agent":
      return (
        <div className="flex gap-3">
          <Orb size={26} spin={item.streaming} />
          <p data-testid={`message-agent-${item.id}`} className="max-w-[78%] pt-0.5 text-[14px] leading-relaxed text-slate-800">
            {renderText(item.text)}{item.streaming && <span className="caret" />}
          </p>
        </div>
      );
    case "task": return <div className="pl-9"><TaskRow task={item} /></div>;
    default: return null;
  }
};

export const StreamItem = ({ item }) => (
  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: "easeOut" }}>
    <Body item={item} />
  </motion.div>
);
