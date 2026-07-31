import { useState } from "react";
import { AlertCircle } from "lucide-react";
import StepIndicator from "../components/StepIndicator";
import DatasetPicker from "../components/DatasetPicker";
import SchemaReview from "../components/SchemaReview";
import HealthCheckReport from "../components/HealthCheckReport";
import { validateDataset } from "../api/datasets";
import { getErrorMessage } from "../api/client";

export default function UploadFlowPage() {
  const [step, setStep] = useState(1);
  const [metadata, setMetadata] = useState(null);
  const [report, setReport] = useState(null);
  const [validating, setValidating] = useState(false);
  const [validateError, setValidateError] = useState(null);

  const handleDatasetReady = (meta) => {
    setMetadata(meta);
    setStep(2);
  };

  const handleSchemaConfirm = async ({ targetColumn, taskType }) => {
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

  const restart = () => {
    setStep(1);
    setMetadata(null);
    setReport(null);
    setValidateError(null);
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
          onBack={() => setStep(2)}
          onContinue={() => {
            /* Phase 2 will wire this up to AutoML job submission */
          }}
        />
      )}
    </div>
  );
}
