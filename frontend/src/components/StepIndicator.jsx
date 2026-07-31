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
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition sm:h-8 sm:w-8 ${
                  state === "active"
                    ? "bg-ember-500 text-forge-950"
                    : state === "done"
                      ? "bg-ember-500/20 text-ember-400 ring-1 ring-ember-500/40"
                      : "bg-forge-800 text-forge-500 ring-1 ring-forge-700"
                }`}
              >
                {state === "done" ? <Check size={14} strokeWidth={3} /> : stepNum}
              </span>
              <span
                className={`hidden text-sm font-medium sm:inline ${
                  state === "upcoming" ? "text-forge-500" : "text-forge-100"
                }`}
              >
                {label}
              </span>
            </div>
            {stepNum !== STEPS.length && (
              <div className={`h-px flex-1 ${state === "done" ? "bg-ember-500/40" : "bg-forge-800"}`} />
            )}
          </li>
        );
      })}
    </ol>
  );
}
