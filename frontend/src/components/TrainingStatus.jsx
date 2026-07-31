import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, ExternalLink, Loader2, RotateCcw, XCircle } from "lucide-react";
import { getJobStatus, getLeaderboard } from "../api/training";
import { getErrorMessage } from "../api/client";

const POLL_INTERVAL_MS = 5000;

const STATUS_COPY = {
  running: { label: "Training in progress", icon: Loader2, spin: true, tone: "text-ember-400" },
  completed: { label: "Training complete", icon: CheckCircle2, spin: false, tone: "text-ok-500" },
  failed: { label: "Training failed", icon: XCircle, spin: false, tone: "text-crit-500" },
  unknown: { label: "Unknown status", icon: AlertCircle, spin: false, tone: "text-forge-400" },
};

function formatMetric(value) {
  if (value === null || value === undefined) return "—";
  return Number(value).toFixed(4);
}

export default function TrainingStatus({ initialJob, onRestart }) {
  const [status, setStatus] = useState(null);
  const [leaderboard, setLeaderboard] = useState(null);
  const [error, setError] = useState(null);
  const pollRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const result = await getJobStatus(initialJob.job_id);
        if (cancelled) return;
        setStatus(result);

        if (result.status === "completed") {
          clearInterval(pollRef.current);
          try {
            const lb = await getLeaderboard(initialJob.job_id);
            if (!cancelled) setLeaderboard(lb);
          } catch (err) {
            if (!cancelled) setError(getErrorMessage(err, "Could not load the leaderboard."));
          }
        } else if (result.status === "failed") {
          clearInterval(pollRef.current);
        }
      } catch (err) {
        if (!cancelled) {
          setError(getErrorMessage(err, "Could not fetch job status."));
          clearInterval(pollRef.current);
        }
      }
    };

    poll();
    pollRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(pollRef.current);
    };
  }, [initialJob.job_id]);

  const statusCopy = STATUS_COPY[status?.status] || STATUS_COPY.unknown;
  const StatusIcon = statusCopy.icon;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-1 text-xl font-semibold text-forge-50 sm:text-2xl">Training</h2>
        <p className="text-sm text-forge-400">
          Job <span className="font-mono text-forge-300">{initialJob.job_id}</span> · Target:{" "}
          <span className="text-forge-200">{initialJob.target_column}</span> · Task:{" "}
          <span className="capitalize text-forge-200">{initialJob.task_type}</span> · Metric:{" "}
          <span className="text-forge-200">{initialJob.primary_metric}</span>
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-forge-800 bg-forge-900 p-4">
        <div className="flex items-center gap-3">
          <StatusIcon size={20} className={`${statusCopy.tone} ${statusCopy.spin ? "animate-spin" : ""}`} />
          <div>
            <p className="text-sm font-semibold text-forge-100">{statusCopy.label}</p>
            {status && (
              <p className="text-xs text-forge-400">
                {status.trial_count} trial{status.trial_count === 1 ? "" : "s"} so far · capped at 15 minutes
              </p>
            )}
          </div>
        </div>
        {initialJob.studio_url && (
          <a
            href={initialJob.studio_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-forge-700 px-3 py-1.5 text-xs font-medium text-forge-300 transition hover:border-ember-500/50 hover:text-ember-400"
          >
            View in Azure ML Studio <ExternalLink size={12} />
          </a>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-crit-500/30 bg-crit-500/10 p-3 text-sm text-crit-500">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {status?.status === "failed" && (
        <div className="rounded-xl border border-crit-500/30 bg-crit-500/5 p-4 text-sm text-crit-400">
          The job failed. Check the Azure ML Studio link above for the full error log.
        </div>
      )}

      {status?.trials?.length > 0 && status.status !== "completed" && (
        <div className="overflow-x-auto rounded-xl border border-forge-800">
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead>
              <tr className="border-b border-forge-800 bg-forge-900 text-xs uppercase tracking-wide text-forge-500">
                <th className="px-4 py-2.5 font-medium">Trial</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {status.trials.map((t) => (
                <tr key={t.run_id} className="border-b border-forge-800/60 last:border-0">
                  <td className="px-4 py-2 font-mono text-xs text-forge-300">{t.display_name || t.run_id}</td>
                  <td className="px-4 py-2 capitalize text-forge-400">{t.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {leaderboard && (
        <div>
          <h3 className="mb-3 text-lg font-semibold text-forge-50">Leaderboard</h3>
          <div className="overflow-x-auto rounded-xl border border-forge-800">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead>
                <tr className="border-b border-forge-800 bg-forge-900 text-xs uppercase tracking-wide text-forge-500">
                  <th className="px-4 py-2.5 font-medium">Algorithm</th>
                  <th className="px-4 py-2.5 font-medium">{leaderboard.primary_metric}</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.models.map((m) => (
                  <tr
                    key={m.run_id}
                    className={`border-b border-forge-800/60 last:border-0 ${m.is_best ? "bg-ember-500/5" : ""}`}
                  >
                    <td className="px-4 py-2.5 font-medium text-forge-100">
                      {m.algorithm}
                      {m.is_best && (
                        <span className="ml-2 rounded-full bg-ember-500/15 px-2 py-0.5 text-[10px] font-semibold text-ember-400">
                          BEST
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-forge-300">{formatMetric(m.primary_metric_value)}</td>
                    <td className="px-4 py-2.5 text-forge-400">{m.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-forge-500">
            Plain-English summary, what-if predictions, and explainability are coming in Phase 3.
          </p>
        </div>
      )}

      <div className="pt-2">
        <button
          type="button"
          onClick={onRestart}
          className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-forge-400 transition hover:text-forge-100"
        >
          <RotateCcw size={16} /> Start over with a new dataset
        </button>
      </div>
    </div>
  );
}
