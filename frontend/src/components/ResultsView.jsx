import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AlertCircle, Loader2, MessageSquare, Sliders } from "lucide-react";
import { getDataset } from "../api/datasets";
import { getCurlSnippet, getExplanation, getExportCode, getSummary } from "../api/training";
import { getErrorMessage } from "../api/client";
import RankedBarChart from "./RankedBarChart";
import WhatIfPlayground from "./WhatIfPlayground";
import CodeSnippet from "./CodeSnippet";

const sectionVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } },
};

function Section({ title, icon: Icon, children }) {
  return (
    <motion.section variants={sectionVariants}>
      <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold text-forge-50">
        {Icon && <Icon size={18} className="text-ember-400" />} {title}
      </h3>
      {children}
    </motion.section>
  );
}

export default function ResultsView({ job, leaderboard }) {
  const [metadata, setMetadata] = useState(null);
  const [metadataError, setMetadataError] = useState(null);

  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState(null);

  const [explanation, setExplanation] = useState(null);
  const [explanationLoading, setExplanationLoading] = useState(true);
  const [explanationError, setExplanationError] = useState(null);

  const [curlSnippet, setCurlSnippet] = useState("");
  const [exportCode, setExportCode] = useState("");

  useEffect(() => {
    getDataset(job.dataset_id)
      .then(setMetadata)
      .catch((err) => setMetadataError(getErrorMessage(err, "Could not load dataset schema.")));

    getSummary(job.job_id)
      .then((r) => setSummary(r.summary))
      .catch((err) => setSummaryError(getErrorMessage(err, "Could not generate the summary.")))
      .finally(() => setSummaryLoading(false));

    getExplanation(job.job_id)
      .then(setExplanation)
      .catch((err) => setExplanationError(getErrorMessage(err, "Could not compute feature importance.")))
      .finally(() => setExplanationLoading(false));

    getCurlSnippet(job.job_id).then(setCurlSnippet).catch(() => {});
    getExportCode(job.job_id).then(setExportCode).catch(() => {});
  }, [job.job_id, job.dataset_id]);

  const rankedModels = leaderboard.models
    .filter((m) => m.primary_metric_value !== null && m.primary_metric_value !== undefined)
    .slice(0, 8);
  // AutoML often tries the same algorithm with different hyperparameters more than
  // once — recharts' category axis needs unique labels, so disambiguate repeats.
  const nameCounts = {};
  const chartData = rankedModels.map((m) => {
    nameCounts[m.algorithm] = (nameCounts[m.algorithm] || 0) + 1;
    const count = nameCounts[m.algorithm];
    const name = count > 1 ? `${m.algorithm} (${count})` : m.algorithm;
    return { name, value: m.primary_metric_value, isBest: m.is_best };
  });
  const bestAlgorithm = chartData.find((m) => m.isBest)?.name;

  const importanceData = (explanation?.importances || []).map((i) => ({ name: i.feature, value: i.importance }));

  return (
    <motion.div
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.12 } } }}
      initial="hidden"
      animate="show"
      className="space-y-10"
    >
      <Section title="Plain-English summary" icon={MessageSquare}>
        {summaryLoading ? (
          <p className="flex items-center gap-2 text-sm text-forge-400">
            <Loader2 size={14} className="animate-spin" /> Asking Gemini to explain the results…
          </p>
        ) : summaryError ? (
          <div className="flex items-start gap-2 rounded-lg border border-forge-800 bg-forge-900 p-3 text-sm text-forge-400">
            <AlertCircle size={15} className="mt-0.5 shrink-0 text-forge-500" /> {summaryError}
          </div>
        ) : (
          <p className="rounded-xl border border-forge-800 bg-forge-900 p-4 text-sm leading-relaxed text-forge-200">
            {summary}
          </p>
        )}
      </Section>

      <Section title="Model comparison">
        {chartData.length > 0 ? (
          <RankedBarChart
            data={chartData}
            highlightKey={bestAlgorithm}
            valueFormatter={(v) => Number(v).toFixed(4)}
          />
        ) : (
          <p className="text-sm text-forge-500">No comparable models.</p>
        )}
      </Section>

      <Section title="What drove these predictions">
        {explanationLoading ? (
          <p className="flex items-center gap-2 text-sm text-forge-400">
            <Loader2 size={14} className="animate-spin" /> Computing feature importance…
          </p>
        ) : explanationError ? (
          <p className="text-sm text-forge-500">{explanationError}</p>
        ) : importanceData.length > 0 ? (
          <>
            <RankedBarChart data={importanceData} valueFormatter={(v) => `${(v * 100).toFixed(1)}%`} />
            <p className="mt-2 text-xs text-forge-600">
              Permutation importance: each feature is shuffled and we measure how much predictions change —
              a higher share means that input mattered more.
            </p>
          </>
        ) : (
          <p className="text-sm text-forge-500">No importance data available.</p>
        )}
      </Section>

      <Section title="Try it — what-if playground" icon={Sliders}>
        {metadataError ? (
          <p className="text-sm text-crit-500">{metadataError}</p>
        ) : metadata ? (
          <WhatIfPlayground job={job} metadata={metadata} />
        ) : (
          <p className="flex items-center gap-2 text-sm text-forge-400">
            <Loader2 size={14} className="animate-spin" /> Loading dataset schema…
          </p>
        )}
      </Section>

      <Section title="Use it from your own code">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-forge-500">Copy-paste API call</p>
            <CodeSnippet code={curlSnippet || "Loading…"} language="bash" />
          </div>
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-forge-500">Export as Python</p>
            <CodeSnippet code={exportCode || "Loading…"} language="python" />
          </div>
        </div>
      </Section>
    </motion.div>
  );
}
