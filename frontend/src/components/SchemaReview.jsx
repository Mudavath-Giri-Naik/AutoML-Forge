import { useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { TypeBadge } from "./Badge";

const TASK_TYPES = [
  { value: "classification", label: "Classification" },
  { value: "regression", label: "Regression" },
  { value: "forecasting", label: "Forecasting" },
];

export default function SchemaReview({ metadata, onConfirm, onBack }) {
  const [targetColumn, setTargetColumn] = useState(metadata.suggested_target_column || "");
  const [taskType, setTaskType] = useState(metadata.suggested_task_type || "classification");
  const [timeColumn, setTimeColumn] = useState(metadata.suggested_time_column || "");

  const columns = metadata.columns || [];
  const datetimeColumns = columns.filter((c) => c.inferred_type === "datetime");

  const handleContinue = () => {
    onConfirm({
      targetColumn,
      taskType,
      timeColumn: taskType === "forecasting" ? timeColumn || null : null,
    });
  };

  const canContinue = Boolean(targetColumn) && (taskType !== "forecasting" || Boolean(timeColumn));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-1 text-xl font-semibold text-forge-50 sm:text-2xl">Review the schema</h2>
        <p className="text-sm text-forge-400">
          {metadata.filename} — {metadata.row_count.toLocaleString()} rows × {metadata.column_count} columns.
          Confirm the target column and task type, or override our suggestion.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-forge-800 bg-forge-900 p-4">
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-forge-500">
            Target column
          </label>
          <select
            value={targetColumn}
            onChange={(e) => setTargetColumn(e.target.value)}
            className="w-full rounded-lg border border-forge-700 bg-forge-850 px-3 py-2 text-sm text-forge-100 outline-none focus:border-ember-500"
          >
            {columns.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-xl border border-forge-800 bg-forge-900 p-4">
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-forge-500">
            Task type
          </label>
          <select
            value={taskType}
            onChange={(e) => setTaskType(e.target.value)}
            className="w-full rounded-lg border border-forge-700 bg-forge-850 px-3 py-2 text-sm text-forge-100 outline-none focus:border-ember-500"
          >
            {TASK_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-xl border border-forge-800 bg-forge-900 p-4">
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-forge-500">
            Time column {taskType !== "forecasting" && <span className="normal-case text-forge-600">(forecasting only)</span>}
          </label>
          <select
            value={timeColumn}
            onChange={(e) => setTimeColumn(e.target.value)}
            disabled={taskType !== "forecasting"}
            className="w-full rounded-lg border border-forge-700 bg-forge-850 px-3 py-2 text-sm text-forge-100 outline-none focus:border-ember-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <option value="">Select…</option>
            {datetimeColumns.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
          {taskType === "forecasting" && datetimeColumns.length === 0 && (
            <p className="mt-1.5 text-xs text-crit-500">No datetime column was detected in this dataset.</p>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-forge-800">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-forge-800 bg-forge-900 text-xs uppercase tracking-wide text-forge-500">
              <th className="px-4 py-3 font-medium">Column</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Missing</th>
              <th className="px-4 py-3 font-medium">Unique</th>
              <th className="px-4 py-3 font-medium">Sample values</th>
            </tr>
          </thead>
          <tbody>
            {columns.map((c) => (
              <tr
                key={c.name}
                className={`border-b border-forge-800/60 last:border-0 ${
                  c.name === targetColumn ? "bg-ember-500/5" : ""
                }`}
              >
                <td className="px-4 py-2.5 font-medium text-forge-100">
                  {c.name}
                  {c.name === targetColumn && (
                    <span className="ml-2 rounded-full bg-ember-500/15 px-2 py-0.5 text-[10px] font-semibold text-ember-400">
                      TARGET
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <TypeBadge type={c.inferred_type} />
                </td>
                <td className="px-4 py-2.5 text-forge-400">{c.missing_pct}%</td>
                <td className="px-4 py-2.5 text-forge-400">{c.unique_count}</td>
                <td className="max-w-[240px] truncate px-4 py-2.5 text-forge-500">
                  {c.sample_values?.join(", ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-forge-400 transition hover:text-forge-100"
        >
          <ArrowLeft size={16} /> Back
        </button>
        <button
          type="button"
          onClick={handleContinue}
          disabled={!canContinue}
          className="inline-flex items-center gap-1.5 rounded-lg bg-ember-500 px-5 py-2.5 text-sm font-semibold text-forge-950 transition hover:bg-ember-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Run health check <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}
