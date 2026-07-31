import { AlertTriangle, ArrowLeft, CheckCircle2, Info, XCircle } from "lucide-react";
import { SeverityBadge } from "./Badge";

const OVERALL_COPY = {
  healthy: { label: "Looks healthy", icon: CheckCircle2 },
  warnings: { label: "Usable, with warnings", icon: AlertTriangle },
  critical: { label: "Needs attention", icon: XCircle },
};

const SEVERITY_ICON = { critical: XCircle, warning: AlertTriangle, info: Info };

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

export default function HealthCheckReport({ report, onBack, onContinue }) {
  const overall = OVERALL_COPY[report.overall_status] || OVERALL_COPY.healthy;
  const OverallIcon = overall.icon;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-1 text-xl font-semibold text-forge-50 sm:text-2xl">Data health check</h2>
        <p className="text-sm text-forge-400">
          Target: <span className="text-forge-200">{report.target_column}</span> · Task:{" "}
          <span className="capitalize text-forge-200">{report.task_type}</span>
        </p>
      </div>

      <div
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
      </div>

      {report.checks.length === 0 ? (
        <p className="text-sm text-forge-400">No issues found — this dataset is ready to train on.</p>
      ) : (
        <div className="space-y-3">
          {report.checks.map((check) => {
            const Icon = SEVERITY_ICON[check.severity] || Info;
            return (
              <div key={check.id} className="rounded-xl border border-forge-800 bg-forge-900 p-4">
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
              </div>
            );
          })}
        </div>
      )}

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
          onClick={onContinue}
          className="inline-flex items-center gap-1.5 rounded-lg bg-forge-800 px-5 py-2.5 text-sm font-semibold text-forge-300 ring-1 ring-forge-700 transition hover:bg-forge-700"
        >
          Continue to training — coming in Phase 2
        </button>
      </div>
    </div>
  );
}
