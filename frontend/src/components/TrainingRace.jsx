function formatMetric(value) {
  if (value === null || value === undefined) return null;
  return Number(value).toFixed(4);
}

export default function TrainingRace({ leaderboard, primaryMetric }) {
  const models = leaderboard?.models ?? [];
  if (models.length === 0) {
    return <p className="text-sm text-forge-500">Warming up — trials will appear here as they start.</p>;
  }

  const withMetric = models.filter((m) => m.primary_metric_value !== null && m.primary_metric_value !== undefined);
  const rankOf = new Map(withMetric.map((m, idx) => [m.run_id, idx]));
  const n = withMetric.length;

  return (
    <div className="space-y-2.5">
      <p className="text-xs uppercase tracking-wide text-forge-500">{primaryMetric}</p>
      {models.map((m) => {
        const rank = rankOf.get(m.run_id);
        const hasMetric = rank !== undefined;
        const pct = hasMetric ? 100 - (rank / Math.max(n, 1)) * 65 : null;
        const isRunning = m.status?.toUpperCase?.() === "RUNNING";

        return (
          <div key={m.run_id} className="flex items-center gap-3">
            <span className="w-28 shrink-0 truncate text-xs text-forge-300 sm:w-40" title={m.algorithm}>
              {m.algorithm}
            </span>
            <div className="relative h-6 flex-1 overflow-hidden rounded-md bg-forge-800">
              {hasMetric ? (
                <div
                  className={`h-full rounded-md bg-gradient-to-r from-ember-600 to-ember-400 transition-all duration-700 ease-out ${
                    m.is_best ? "shadow-[0_0_12px_rgba(249,115,22,0.5)]" : ""
                  }`}
                  style={{ width: `${pct}%` }}
                />
              ) : (
                <div className={`absolute inset-0 bg-forge-700/50 ${isRunning ? "animate-pulse" : ""}`} style={{ width: "30%" }} />
              )}
            </div>
            <span className="w-16 shrink-0 text-right font-mono text-xs text-forge-400">
              {formatMetric(m.primary_metric_value) ?? (isRunning ? "…" : m.status?.toLowerCase())}
            </span>
          </div>
        );
      })}
    </div>
  );
}
