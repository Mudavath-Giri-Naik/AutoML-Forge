import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Clock, History, Loader2, LineChart, Target, TrendingUp, XCircle } from "lucide-react";
import { listRecentJobs } from "../api/training";

const TASK_ICONS = {
  classification: Target,
  regression: TrendingUp,
  forecasting: LineChart,
};

const STATUS_STYLES = {
  completed: { label: "Completed", icon: CheckCircle2, className: "bg-ok-500/10 text-ok-500 ring-1 ring-inset ring-ok-500/30" },
  running: { label: "Running", icon: Loader2, className: "bg-ember-500/10 text-ember-400 ring-1 ring-inset ring-ember-500/30" },
  failed: { label: "Failed", icon: XCircle, className: "bg-crit-500/10 text-crit-500 ring-1 ring-inset ring-crit-500/30" },
  unknown: { label: "Unknown", icon: Clock, className: "bg-forge-500/10 text-forge-400 ring-1 ring-inset ring-forge-500/30" },
};

function timeAgo(iso) {
  if (!iso) return null;
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

const gridVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
};

export default function RecentRuns({ onSelectJob }) {
  const [runs, setRuns] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    listRecentJobs(12)
      .then(setRuns)
      .catch(() => setError("Could not load past training runs."));
  }, []);

  if (error) return null;

  return (
    <section className="mt-16 border-t border-forge-800/80 pt-10 sm:mt-24 sm:pt-12">
      <div className="mb-5 flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ember-500/10 text-ember-400 ring-1 ring-inset ring-ember-500/20">
          <History size={16} />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-forge-50 sm:text-xl">Previously trained models</h2>
          <p className="text-xs text-forge-500">
            Every run below already finished training on Azure ML — open one to see its full leaderboard,
            explainability, and live prediction endpoint. No retraining needed.
          </p>
        </div>
      </div>

      {runs === null && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-28 overflow-hidden rounded-xl border border-forge-800 bg-[linear-gradient(110deg,var(--color-forge-900)_8%,var(--color-forge-850)_18%,var(--color-forge-900)_33%)] bg-[length:200%_100%] animate-shimmer"
            />
          ))}
        </div>
      )}

      {runs !== null && runs.length === 0 && (
        <p className="rounded-xl border border-dashed border-forge-800 p-6 text-center text-sm text-forge-500">
          No trained models yet — train one above and it'll show up here, ready to test on new data anytime.
        </p>
      )}

      {runs !== null && runs.length > 0 && (
        <motion.div
          variants={gridVariants}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          {runs.map((run) => {
            const Icon = TASK_ICONS[run.task_type] || Target;
            const statusInfo = STATUS_STYLES[run.status] || STATUS_STYLES.unknown;
            const StatusIcon = statusInfo.icon;
            return (
              <motion.button
                key={run.job_id}
                variants={cardVariants}
                whileHover={{ y: -3 }}
                whileTap={{ scale: 0.98 }}
                type="button"
                onClick={() => onSelectJob(run.job_id)}
                className="group flex flex-col items-start rounded-xl border border-forge-800 bg-forge-900 p-4 text-left shadow-sm transition-colors hover:border-ember-500/50 hover:bg-forge-850 hover:shadow-lg hover:shadow-ember-950/20"
              >
                <div className="mb-3 flex w-full items-center justify-between">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-ember-500/10 text-ember-400 ring-1 ring-inset ring-ember-500/20 transition-transform duration-300 group-hover:scale-110">
                    <Icon size={18} />
                  </span>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${statusInfo.className}`}>
                    <StatusIcon size={11} className={run.status === "running" ? "animate-spin" : ""} />
                    {statusInfo.label}
                  </span>
                </div>
                <p className="mb-1 truncate text-sm font-semibold text-forge-50" title={run.dataset_name || run.job_id}>
                  {run.dataset_name || run.job_id}
                </p>
                <p className="mb-3 text-xs capitalize text-forge-400">
                  {run.task_type} · target <span className="text-forge-300">{run.target_column}</span>
                </p>
                <div className="mt-auto flex w-full items-center justify-between text-[11px] text-forge-500">
                  <span className="truncate font-mono">{run.job_id}</span>
                  {timeAgo(run.created_at) && <span className="shrink-0">{timeAgo(run.created_at)}</span>}
                </div>
              </motion.button>
            );
          })}
        </motion.div>
      )}
    </section>
  );
}
