import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AlertCircle, Activity, Radio, Sparkles, Zap } from "lucide-react";
import StepIndicator from "../components/StepIndicator";
import DatasetPicker from "../components/DatasetPicker";
import SchemaReview from "../components/SchemaReview";
import HealthCheckReport from "../components/HealthCheckReport";
import TrainingStatus from "../components/TrainingStatus";
import RecentRuns from "../components/RecentRuns";
import { validateDataset } from "../api/datasets";
import { getJobStatus, submitTrainingJob } from "../api/training";
import { getErrorMessage } from "../api/client";

const FEATURE_PILLS = [
  { icon: Zap, label: "Serverless Azure ML AutoML" },
  { icon: Radio, label: "Live training telemetry, every second" },
  { icon: Sparkles, label: "Explainable, not a black box" },
  { icon: Activity, label: "Instant prediction endpoint" },
];

export default function UploadFlowPage() {
  const [step, setStep] = useState(1);
  const [metadata, setMetadata] = useState(null);
  const [selection, setSelection] = useState(null);
  const [report, setReport] = useState(null);
  const [validating, setValidating] = useState(false);
  const [validateError, setValidateError] = useState(null);

  const [submittingJob, setSubmittingJob] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [job, setJob] = useState(null);

  // Anonymous + stateless app, so the job_id is the only handle a user has to
  // come back to a job later — support jumping straight to it via ?job=<id>,
  // and reuse the same path when a "previously trained model" card is clicked.
  const loadJob = (jobId) => {
    return getJobStatus(jobId).then((status) => {
      setJob({
        job_id: status.job_id,
        dataset_id: status.dataset_id,
        task_type: status.task_type,
        target_column: status.target_column,
        time_column: status.time_column,
        primary_metric: status.primary_metric,
        studio_url: null,
      });
      setStep(4);
      window.history.replaceState(null, "", `?job=${jobId}`);
    });
  };

  useEffect(() => {
    const jobId = new URLSearchParams(window.location.search).get("job");
    if (!jobId) return;
    loadJob(jobId).catch(() => {
      /* invalid/unknown job id in the URL — fall through to the normal flow */
    });
  }, []);

  const handleSelectPastRun = (jobId) => {
    loadJob(jobId).then(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  };

  const handleDatasetReady = (meta) => {
    setMetadata(meta);
    setStep(2);
  };

  const handleSchemaConfirm = async ({ targetColumn, taskType, timeColumn }) => {
    setSelection({ targetColumn, taskType, timeColumn });
    setValidating(true);
    setValidateError(null);
    try {
      const result = await validateDataset(metadata.dataset_id, { targetColumn, taskType });
      setReport(result);
      setStep(3);
    } catch (err) {
      setValidateError(getErrorMessage(err, "Could not run the health check."));
    } finally {
      setValidating(false);
    }
  };

  const handleStartTraining = async ({ primaryMetric, forecastHorizon }) => {
    setSubmittingJob(true);
    setSubmitError(null);
    try {
      const submitted = await submitTrainingJob({
        datasetId: metadata.dataset_id,
        taskType: selection.taskType,
        targetColumn: selection.targetColumn,
        timeColumn: selection.timeColumn,
        forecastHorizon: selection.taskType === "forecasting" ? forecastHorizon : null,
        primaryMetric,
      });
      setJob(submitted);
      setStep(4);
      window.history.replaceState(null, "", `?job=${submitted.job_id}`);
    } catch (err) {
      setSubmitError(getErrorMessage(err, "Could not submit the training job."));
    } finally {
      setSubmittingJob(false);
    }
  };

  const restart = () => {
    setStep(1);
    setMetadata(null);
    setSelection(null);
    setReport(null);
    setValidateError(null);
    setSubmitError(null);
    setJob(null);
    window.history.replaceState(null, "", window.location.pathname);
  };

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="mb-8 text-center sm:mb-12"
      >
        <span className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-forge-800 bg-forge-900/60 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-forge-400">
          <span className="h-1.5 w-1.5 rounded-full bg-ok-500" /> Live on Azure ML — not a demo
        </span>
        <h1 className="text-3xl font-bold tracking-tight text-forge-50 sm:text-4xl">
          Upload to live prediction, end to end.
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-forge-400 sm:text-base">
          No notebook, no manual tuning, no deployment step. Pick a dataset to get started.
        </p>

        <motion.div
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08, delayChildren: 0.2 } } }}
          initial="hidden"
          animate="show"
          className="mx-auto mt-6 flex max-w-2xl flex-wrap items-center justify-center gap-2"
        >
          {FEATURE_PILLS.map(({ icon: Icon, label }) => (
            <motion.span
              key={label}
              variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
              transition={{ duration: 0.3 }}
              className="inline-flex items-center gap-1.5 rounded-full border border-forge-800 bg-forge-900/60 px-3 py-1.5 text-xs text-forge-300"
            >
              <Icon size={12} className="text-ember-400" /> {label}
            </motion.span>
          ))}
        </motion.div>
      </motion.div>

      <StepIndicator current={step} />

      <div>
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        >
          {step === 1 && <DatasetPicker onReady={handleDatasetReady} />}

          {step === 2 && metadata && (
            <>
              <SchemaReview metadata={metadata} onConfirm={handleSchemaConfirm} onBack={restart} />
              {validating && (
                <p className="mt-4 text-center text-sm text-forge-400">Running health check…</p>
              )}
              {validateError && (
                <div className="mt-4 flex items-center gap-2 rounded-lg border border-crit-500/30 bg-crit-500/10 p-3 text-sm text-crit-500">
                  <AlertCircle size={16} /> {validateError}
                </div>
              )}
            </>
          )}

          {step === 3 && report && (
            <HealthCheckReport
              report={report}
              timeColumn={selection?.timeColumn}
              onBack={() => setStep(2)}
              onStartTraining={handleStartTraining}
              submitting={submittingJob}
              submitError={submitError}
            />
          )}

          {step === 4 && job && <TrainingStatus initialJob={job} onRestart={restart} />}
        </motion.div>
      </div>

      <RecentRuns onSelectJob={handleSelectPastRun} />
    </div>
  );
}
