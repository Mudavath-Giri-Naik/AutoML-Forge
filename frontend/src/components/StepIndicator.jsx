import { motion } from "framer-motion";
import { Check } from "lucide-react";

const STEPS = ["Dataset", "Schema", "Health check", "Training"];

export default function StepIndicator({ current }) {
  return (
    <ol className="mb-8 flex items-center gap-2 sm:mb-10 sm:gap-3">
      {STEPS.map((label, idx) => {
        const stepNum = idx + 1;
        const state = stepNum < current ? "done" : stepNum === current ? "active" : "upcoming";
        return (
          <li key={label} className="flex flex-1 items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-2">
              <motion.span
                animate={state === "active" ? { scale: [1, 1.12, 1] } : { scale: 1 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold sm:h-8 sm:w-8 ${
                  state === "active"
                    ? "bg-ember-500 text-forge-950 shadow-[0_0_0_4px_rgba(249,115,22,0.15)]"
                    : state === "done"
                      ? "bg-ember-500/20 text-ember-400 ring-1 ring-ember-500/40"
                      : "bg-forge-800 text-forge-500 ring-1 ring-forge-700"
                }`}
              >
                {state === "done" ? (
                  <Check size={14} strokeWidth={3} />
                ) : (
                  <span>{stepNum}</span>
                )}
              </motion.span>
              <span
                className={`hidden text-sm font-medium transition-colors duration-300 sm:inline ${
                  state === "upcoming" ? "text-forge-500" : "text-forge-100"
                }`}
              >
                {label}
              </span>
            </div>
            {stepNum !== STEPS.length && (
              <div className="relative h-px flex-1 overflow-hidden bg-forge-800">
                <motion.div
                  className="absolute inset-y-0 left-0 bg-ember-500/50"
                  initial={false}
                  animate={{ width: state === "done" ? "100%" : "0%" }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                />
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
