import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { AlertCircle, CheckCircle2, ExternalLink, Loader2, RotateCcw, XCircle } from "lucide-react";
import { getJobStatus, getLeaderboard } from "../api/training";
import { getErrorMessage } from "../api/client";
import TrainingRace from "./TrainingRace";
import ResultsView from "./ResultsView";

const POLL_INTERVAL_MS = 5000;

const STATUS_COPY = {
  running: { label: "Training in progress", icon: Loader2, spin: true, tone: "text-ember-400" },
  completed: { label: "Training complete", icon: CheckCircle2, spin: false, tone: "text-ok-500" },
  failed: { label: "Training failed", icon: XCircle, spin: false, tone: "text-crit-500" },
  unknown: { label: "Unknown status", icon: AlertCircle, spin: false, tone: "text-forge-400" },
};

export default function TrainingStatus({ initialJob, onRestart }) {
  const [status, setStatus] = useState(null);
  const [leaderboard, setLeaderboard] = useState(null);
  const [error, setError] = useState(null);
  const pollRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const [statusResult, leaderboardResult] = await Promise.all([
          getJobStatus(initialJob.job_id),
          getLeaderboard(initialJob.job_id),
        ]);
        if (cancelled) return;
        setStatus(statusResult);
        setLeaderboard(leaderboardResult);

        if (statusResult.status === "completed" || statusResult.status === "failed") {
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
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <h2 className="mb-1 text-xl font-semibold text-forge-50 sm:text-2xl">Training</h2>
        <p className="text-sm text-forge-400">
          Job <span className="font-mono text-forge-300">{initialJob.job_id}</span> · Target:{" "}
          <span className="text-forge-200">{initialJob.target_column}</span> · Task:{" "}
          <span className="capitalize text-forge-200">{initialJob.task_type}</span> · Metric:{" "}
          <span className="text-forge-200">{initialJob.primary_metric}</span>
        </p>
      </motion.div>

      <motion.div
        layout
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05 }}
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-forge-800 bg-forge-900 p-4"
      >
        <div className="flex items-center gap-3">
          <span className="relative flex items-center justify-center">
            {statusCopy.spin && (
              <span className="absolute h-7 w-7 animate-ping rounded-full bg-ember-500/20" />
            )}
            <StatusIcon size={20} className={`relative ${statusCopy.tone} ${statusCopy.spin ? "animate-spin" : ""}`} />
          </span>
          <div>
            <motion.p
              key={statusCopy.label}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="text-sm font-semibold text-forge-100"
            >
              {statusCopy.label}
            </motion.p>
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
      </motion.div>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 rounded-lg border border-crit-500/30 bg-crit-500/10 p-3 text-sm text-crit-500"
        >
          <AlertCircle size={16} className="shrink-0" /> {error}
        </motion.div>
      )}

      {status?.status === "failed" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-crit-500/30 bg-crit-500/5 p-4 text-sm text-crit-400"
        >
          The job failed. Check the Azure ML Studio link above for the full error log.
        </motion.div>
      )}

      {status?.status === "running" && leaderboard && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-forge-800 bg-forge-900 p-4"
        >
          <h3 className="mb-3 text-sm font-semibold text-forge-100">Live race</h3>
          <TrainingRace leaderboard={leaderboard} primaryMetric={leaderboard.primary_metric} />
        </motion.div>
      )}

      {status?.status === "completed" && leaderboard && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <ResultsView job={initialJob} leaderboard={leaderboard} />
        </motion.div>
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
