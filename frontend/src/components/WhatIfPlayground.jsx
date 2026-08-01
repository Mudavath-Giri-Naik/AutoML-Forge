import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { AlertCircle, Loader2, Sparkles } from "lucide-react";
import { predict } from "../api/training";
import { getErrorMessage } from "../api/client";

function defaultValue(column) {
  if (column.inferred_type === "numeric") return column.mean ?? 0;
  return column.sample_values?.[0] ?? "";
}

function buildDefaults(columns) {
  const values = {};
  for (const c of columns) values[c.name] = defaultValue(c);
  return values;
}

function FeatureControl({ column, value, onChange }) {
  if (column.inferred_type === "numeric") {
    const min = column.min ?? 0;
    const max = column.max ?? Math.max(min + 1, (column.mean ?? 1) * 2);
    const step = (max - min) / 100 || 1;
    return (
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-xs font-medium text-forge-300">{column.name}</label>
          <span className="font-mono text-xs text-ember-400">{Number(value).toFixed(2)}</span>
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full accent-ember-500"
        />
        <div className="mt-0.5 flex justify-between text-[10px] text-forge-600">
          <span>{Number(min).toFixed(1)}</span>
          <span>{Number(max).toFixed(1)}</span>
        </div>
      </div>
    );
  }

  const options = Array.from(new Set(column.sample_values || []));
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-forge-300">{column.name}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-forge-700 bg-forge-850 px-2.5 py-2 text-sm text-forge-100 outline-none focus:border-ember-500"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function WhatIfPlayground({ job, metadata }) {
  const featureColumns = metadata.columns.filter(
    (c) => c.name !== job.target_column && c.name !== job.time_column
  );
  const controllable = featureColumns.filter((c) =>
    ["numeric", "categorical", "boolean"].includes(c.inferred_type)
  );
  const hidden = featureColumns.filter((c) => !controllable.includes(c));

  const [values, setValues] = useState(() => buildDefaults(featureColumns));
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const debounceRef = useRef(null);

  const runPrediction = async (featureValues) => {
    setLoading(true);
    setError(null);
    try {
      const result = await predict(job.job_id, featureValues);
      setPrediction(result);
    } catch (err) {
      setError(getErrorMessage(err, "Prediction failed."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runPrediction(values);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateValue = (name, value) => {
    const next = { ...values, [name]: value };
    setValues(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runPrediction(next), 300);
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_260px]">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {controllable.map((col) => (
          <FeatureControl key={col.name} column={col} value={values[col.name]} onChange={(v) => updateValue(col.name, v)} />
        ))}
      </div>

      <motion.div
        layout
        className="flex flex-col items-center justify-center rounded-xl border border-forge-800 bg-forge-900 p-5 text-center"
      >
        <motion.span
          animate={loading ? { rotate: [0, 8, -8, 0] } : { rotate: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-ember-500/10 text-ember-400 ring-1 ring-inset ring-ember-500/20"
        >
          <Sparkles size={18} />
        </motion.span>
        <p className="mb-1 text-xs uppercase tracking-wide text-forge-500">Predicted {job.target_column}</p>
        {loading ? (
          <Loader2 size={20} className="animate-spin text-forge-400" />
        ) : error ? (
          <div className="flex items-center gap-1.5 text-xs text-crit-500">
            <AlertCircle size={14} /> {error}
          </div>
        ) : (
          <motion.p
            key={String(prediction?.prediction)}
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.25 }}
            className="text-2xl font-bold text-forge-50"
          >
            {String(prediction?.prediction)}
          </motion.p>
        )}
        {prediction?.probabilities && (
          <div className="mt-3 w-full space-y-1.5 border-t border-forge-800 pt-3 text-left">
            {Object.entries(prediction.probabilities).map(([cls, p]) => (
              <div key={cls} className="text-xs">
                <div className="mb-0.5 flex items-center justify-between">
                  <span className="text-forge-400">{cls}</span>
                  <span className="font-mono text-forge-200">{(p * 100).toFixed(1)}%</span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-forge-800">
                  <motion.div
                    className="h-full rounded-full bg-ember-500/70"
                    animate={{ width: `${p * 100}%` }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {hidden.length > 0 && (
        <p className="text-xs text-forge-600 lg:col-span-2">
          {hidden.length} identifier/free-text column{hidden.length === 1 ? "" : "s"} ({hidden.map((c) => c.name).join(", ")}) are held at a fixed sample value — not meaningful to adjust here.
        </p>
      )}
    </div>
  );
}
