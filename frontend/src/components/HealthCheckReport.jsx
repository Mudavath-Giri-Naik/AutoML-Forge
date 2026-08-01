import { useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, ArrowLeft, CheckCircle2, Flame, Info, Loader2, XCircle } from "lucide-react";
import { SeverityBadge } from "./Badge";

const staggerParent = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] } },
};

const OVERALL_COPY = {
  healthy: { label: "Looks healthy", icon: CheckCircle2 },
  warnings: { label: "Usable, with warnings", icon: AlertTriangle },
  critical: { label: "Needs attention", icon: XCircle },
};

const SEVERITY_ICON = { critical: XCircle, warning: AlertTriangle, info: Info };

const PRIMARY_METRIC_OPTIONS = {
  classification: [
    { value: "accuracy", label: "Accuracy" },
    { value: "AUC_weighted", label: "AUC (weighted)" },
    { value: "average_precision_score_weighted", label: "Average precision (weighted)" },
    { value: "norm_macro_recall", label: "Normalized macro recall" },
    { value: "precision_score_weighted", label: "Precision (weighted)" },
  ],
  regression: [
    { value: "normalized_root_mean_squared_error", label: "Normalized RMSE" },
    { value: "r2_score", label: "R² score" },
    { value: "normalized_mean_absolute_error", label: "Normalized MAE" },
    { value: "spearman_correlation", label: "Spearman correlation" },
  ],
  forecasting: [
    { value: "normalized_root_mean_squared_error", label: "Normalized RMSE" },
    { value: "r2_score", label: "R² score" },
    { value: "normalized_mean_absolute_error", label: "Normalized MAE" },
  ],
};

const DEFAULT_PRIMARY_METRIC = {
  classification: "accuracy",
  regression: "normalized_root_mean_squared_error",
  forecasting: "normalized_root_mean_squared_error",
};

function CheckDetails({ details }) {
  if (!details || details.length === 0) return null;
  const isObjectList = typeof details[0] === "object";

  if (!isObjectList) {
    return (
      <div className="mt-2 flex flex-wrap gap-1.5">
        {details.map((d) => (
          <span key={d} className="rounded-md bg-forge-800 px-2 py-0.5 text-xs text-forge-300">
            {d}
          </span>
        ))}
      </div>
    );
  }

  const keys = Object.keys(details[0]);
  return (
    <div className="mt-2 overflow-x-auto rounded-lg border border-forge-800">
      <table className="w-full min-w-[320px] text-left text-xs">
        <thead>
          <tr className="border-b border-forge-800 text-forge-500">
            {keys.map((k) => (
              <th key={k} className="px-3 py-1.5 font-medium capitalize">
                {k.replace(/_/g, " ")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {details.slice(0, 8).map((row, i) => (
            <tr key={i} className="border-b border-forge-800/60 last:border-0">
              {keys.map((k) => (
                <td key={k} className="px-3 py-1.5 text-forge-300">
                  {String(row[k])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {details.length > 8 && (
        <p className="px-3 py-1.5 text-xs text-forge-500">+ {details.length - 8} more</p>
      )}
    </div>
  );
}

export default function HealthCheckReport({ report, timeColumn, onBack, onStartTraining, submitting, submitError }) {
  const overall = OVERALL_COPY[report.overall_status] || OVERALL_COPY.healthy;
  const OverallIcon = overall.icon;
  const taskType = report.task_type;

  const [primaryMetric, setPrimaryMetric] = useState(DEFAULT_PRIMARY_METRIC[taskType] || "accuracy");
  const [forecastHorizon, setForecastHorizon] = useState(12);

  const canStart = taskType !== "forecasting" || (Boolean(timeColumn) && forecastHorizon > 0);

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <h2 className="mb-1 text-xl font-semibold text-forge-50 sm:text-2xl">Data health check</h2>
        <p className="text-sm text-forge-400">
          Target: <span className="text-forge-200">{report.target_column}</span> · Task:{" "}
          <span className="capitalize text-forge-200">{report.task_type}</span>
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, delay: 0.05 }}
        className={`flex items-center gap-3 rounded-xl border p-4 ${
          report.overall_status === "critical"
            ? "border-crit-500/30 bg-crit-500/5"
            : report.overall_status === "warnings"
              ? "border-warn-500/30 bg-warn-500/5"
              : "border-ok-500/30 bg-ok-500/5"
        }`}
      >
        <OverallIcon
          size={22}
          className={
            report.overall_status === "critical"
              ? "text-crit-500"
              : report.overall_status === "warnings"
                ? "text-warn-500"
                : "text-ok-500"
          }
        />
        <div>
          <p className="text-sm font-semibold text-forge-100">{overall.label}</p>
          <p className="text-xs text-forge-400">
            {report.row_count.toLocaleString()} rows · {report.column_count} columns ·{" "}
            {report.checks.length} finding{report.checks.length === 1 ? "" : "s"}
          </p>
        </div>
      </motion.div>

      {report.checks.length === 0 ? (
        <p className="text-sm text-forge-400">No issues found — this dataset is ready to train on.</p>
      ) : (
        <motion.div variants={staggerParent} initial="hidden" animate="show" className="space-y-3">
          {report.checks.map((check) => {
            const Icon = SEVERITY_ICON[check.severity] || Info;
            return (
              <motion.div
                key={check.id}
                variants={fadeUp}
                className="rounded-xl border border-forge-800 bg-forge-900 p-4 transition-colors hover:border-forge-700"
              >
                <div className="flex items-start gap-3">
                  <Icon
                    size={18}
                    className={`mt-0.5 shrink-0 ${
                      check.severity === "critical"
                        ? "text-crit-500"
                        : check.severity === "warning"
                          ? "text-warn-500"
                          : "text-forge-400"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-forge-100">{check.title}</p>
                      <SeverityBadge severity={check.severity}>{check.severity}</SeverityBadge>
                    </div>
                    <p className="mt-0.5 text-sm text-forge-400">{check.message}</p>
                    <CheckDetails details={check.details} />
                  </div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.15 }}
        className="rounded-xl border border-forge-800 bg-forge-900 p-4"
      >
        <p className="mb-3 text-sm font-semibold text-forge-100">Training configuration</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-forge-500">
              Primary metric
            </label>
            <select
              value={primaryMetric}
              onChange={(e) => setPrimaryMetric(e.target.value)}
              className="w-full rounded-lg border border-forge-700 bg-forge-850 px-3 py-2 text-sm text-forge-100 outline-none focus:border-ember-500"
            >
              {(PRIMARY_METRIC_OPTIONS[taskType] || []).map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          {taskType === "forecasting" && (
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-forge-500">
                Forecast horizon (periods ahead)
              </label>
              <input
                type="number"
                min={1}
                value={forecastHorizon}
                onChange={(e) => setForecastHorizon(Number(e.target.value))}
                className="w-full rounded-lg border border-forge-700 bg-forge-850 px-3 py-2 text-sm text-forge-100 outline-none focus:border-ember-500"
              />
              {!timeColumn && (
                <p className="mt-1.5 text-xs text-crit-500">No time column was selected — go back and pick one.</p>
              )}
            </div>
          )}
        </div>
        <p className="mt-3 text-xs text-forge-500">
          AutoML will train and compare classical models on Azure ML serverless compute, capped at 15 minutes.
        </p>
      </motion.div>

      {submitError && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="flex items-center gap-2 rounded-lg border border-crit-500/30 bg-crit-500/10 p-3 text-sm text-crit-500"
        >
          <XCircle size={16} className="shrink-0" /> {submitError}
        </motion.div>
      )}

      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-forge-400 transition hover:text-forge-100 disabled:opacity-40"
        >
          <ArrowLeft size={16} /> Back
        </button>
        <motion.button
          whileHover={canStart && !submitting ? { scale: 1.03 } : {}}
          whileTap={canStart && !submitting ? { scale: 0.97 } : {}}
          type="button"
          onClick={() => onStartTraining({ primaryMetric, forecastHorizon })}
          disabled={!canStart || submitting}
          className="inline-flex items-center gap-1.5 rounded-lg bg-ember-500 px-5 py-2.5 text-sm font-semibold text-forge-950 shadow-lg shadow-ember-950/30 transition-colors hover:bg-ember-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Submitting job…
            </>
          ) : (
            <>
              <Flame size={16} /> Start training
            </>
          )}
        </motion.button>
      </div>
    </div>
  );
}
