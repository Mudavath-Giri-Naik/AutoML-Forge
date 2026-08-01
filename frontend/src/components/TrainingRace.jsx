import { motion } from "framer-motion";

function formatMetric(value) {
  if (value === null || value === undefined) return null;
  return Number(value).toFixed(4);
}

export default function TrainingRace({ leaderboard, primaryMetric }) {
  const models = leaderboard?.models ?? [];
  if (models.length === 0) {
    return (
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="text-sm text-forge-500"
      >
        Warming up — trials will appear here as they start.
      </motion.p>
    );
  }

  const withMetric = models.filter((m) => m.primary_metric_value !== null && m.primary_metric_value !== undefined);
  const rankOf = new Map(withMetric.map((m, idx) => [m.run_id, idx]));
  const n = withMetric.length;

  return (
    <div className="space-y-2.5">
      <p className="text-xs uppercase tracking-wide text-forge-500">{primaryMetric}</p>
      <>
        {models.map((m) => {
          const rank = rankOf.get(m.run_id);
          const hasMetric = rank !== undefined;
          const pct = hasMetric ? 100 - (rank / Math.max(n, 1)) * 65 : null;
          const isRunning = m.status?.toUpperCase?.() === "RUNNING";

          return (
            <motion.div
              key={m.run_id}
              layout
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="flex items-center gap-3"
            >
              <span className="w-28 shrink-0 truncate text-xs text-forge-300 sm:w-40" title={m.algorithm}>
                {m.algorithm}
              </span>
              <div className="relative h-6 flex-1 overflow-hidden rounded-md bg-forge-800">
                {hasMetric ? (
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.7, ease: "easeOut" }}
                    className={`h-full rounded-md bg-gradient-to-r from-ember-600 to-ember-400 ${
                      m.is_best ? "shadow-[0_0_12px_rgba(249,115,22,0.5)]" : ""
                    }`}
                  />
                ) : (
                  <div
                    className={`absolute inset-0 rounded-md bg-[linear-gradient(110deg,var(--color-forge-700)_8%,var(--color-forge-600)_18%,var(--color-forge-700)_33%)] bg-[length:200%_100%] ${
                      isRunning ? "animate-shimmer" : ""
                    }`}
                    style={{ width: "30%", opacity: 0.6 }}
                  />
                )}
              </div>
              <span className="w-16 shrink-0 text-right font-mono text-xs text-forge-400">
                {formatMetric(m.primary_metric_value) ?? (isRunning ? "…" : m.status?.toLowerCase())}
              </span>
            </motion.div>
          );
        })}
      </>
    </div>
  );
}
