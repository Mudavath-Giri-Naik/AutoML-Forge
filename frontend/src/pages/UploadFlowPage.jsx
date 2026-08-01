import { useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";
import StepIndicator from "../components/StepIndicator";
import DatasetPicker from "../components/DatasetPicker";
import SchemaReview from "../components/SchemaReview";
import HealthCheckReport from "../components/HealthCheckReport";
import TrainingStatus from "../components/TrainingStatus";
import { validateDataset } from "../api/datasets";
import { getJobStatus, submitTrainingJob } from "../api/training";
import { getErrorMessage } from "../api/client";

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
  // come back to a job later — support jumping straight to it via ?job=<id>.
  useEffect(() => {
    const jobId = new URLSearchParams(window.location.search).get("job");
    if (!jobId) return;
    getJobStatus(jobId)
      .then((status) => {
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
      })
      .catch(() => {
        /* invalid/unknown job id in the URL — fall through to the normal flow */
      });
  }, []);

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
      <div className="mb-8 text-center sm:mb-12">
        <h1 className="text-3xl font-bold tracking-tight text-forge-50 sm:text-4xl">
          Upload to live prediction, end to end.
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-forge-400 sm:text-base">
          No notebook, no manual tuning, no deployment step. Pick a dataset to get started.
        </p>
      </div>

      <StepIndicator current={step} />

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
    </div>
  );
}
