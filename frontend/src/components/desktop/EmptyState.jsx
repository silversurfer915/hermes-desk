import { motion } from "framer-motion";
import { Code2, FileText, Hash, Inbox } from "lucide-react";
import { SUGGESTIONS, DEMO_USER } from "@/lib/demo/sampleData";
import { greeting } from "@/lib/ui";
import { Orb } from "./Orb";

const ICONS = { inbox: Inbox, slack: Hash, file: FileText, code: Code2 };

export const EmptyState = ({ onPick }) => (
  <div data-testid="empty-state" className="flex flex-1 flex-col items-center justify-center px-10 text-center">
    <motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.6, ease: "easeOut" }}>
      <Orb size={76} />
    </motion.div>
    <motion.h1 initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1, duration: 0.5 }} className="mt-6 font-heading text-3xl font-medium tracking-tight text-slate-900 lg:text-4xl" data-testid="empty-state-greeting">
      {greeting()}, {DEMO_USER.name}
    </motion.h1>
    <motion.p initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.18, duration: 0.5 }} className="mt-1 font-heading text-lg text-slate-500">
      What should we get done?
    </motion.p>
    <div className="mt-8 flex max-w-xl flex-wrap justify-center gap-2.5">
      {SUGGESTIONS.map((s, i) => {
        const Icon = ICONS[s.icon];
        return (
          <motion.button
            key={s.id}
            data-testid={`suggestion-chip-${s.id}`}
            onClick={() => onPick(s.label)}
            initial={{ y: 8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.25 + i * 0.06 }}
            className="focus-ring glass-chip flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-medium text-slate-700 transition-[background-color,transform] duration-200 hover:-translate-y-0.5 hover:bg-white/90"
          >
            <Icon size={14} className="text-blue-600" /> {s.label}
          </motion.button>
        );
      })}
    </div>
  </div>
);
