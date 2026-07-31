const SEVERITY_STYLES = {
  critical: "bg-crit-500/10 text-crit-500 ring-1 ring-inset ring-crit-500/30",
  warning: "bg-warn-500/10 text-warn-500 ring-1 ring-inset ring-warn-500/30",
  info: "bg-forge-400/10 text-forge-300 ring-1 ring-inset ring-forge-400/20",
  healthy: "bg-ok-500/10 text-ok-500 ring-1 ring-inset ring-ok-500/30",
  warnings: "bg-warn-500/10 text-warn-500 ring-1 ring-inset ring-warn-500/30",
};

export function SeverityBadge({ severity, children }) {
  const style = SEVERITY_STYLES[severity] || SEVERITY_STYLES.info;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${style}`}>
      {children}
    </span>
  );
}

const TYPE_STYLES = {
  numeric: "bg-blue-500/10 text-blue-400 ring-blue-500/30",
  categorical: "bg-purple-500/10 text-purple-400 ring-purple-500/30",
  boolean: "bg-teal-500/10 text-teal-400 ring-teal-500/30",
  datetime: "bg-amber-500/10 text-amber-400 ring-amber-500/30",
  identifier: "bg-forge-500/10 text-forge-400 ring-forge-500/30",
  text: "bg-pink-500/10 text-pink-400 ring-pink-500/30",
};

export function TypeBadge({ type }) {
  const style = TYPE_STYLES[type] || TYPE_STYLES.text;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${style}`}>
      {type}
    </span>
  );
}
