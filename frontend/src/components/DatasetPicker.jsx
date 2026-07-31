import { useCallback, useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";
import { AlertCircle, LineChart, Target, TrendingUp, UploadCloud } from "lucide-react";
import { getDataset, listDemoDatasets, uploadDataset } from "../api/datasets";
import { getErrorMessage } from "../api/client";

const TASK_ICONS = {
  classification: Target,
  regression: TrendingUp,
  forecasting: LineChart,
};

const MAX_UPLOAD_MB = 10;

export default function DatasetPicker({ onReady }) {
  const [demoDatasets, setDemoDatasets] = useState([]);
  const [demoLoading, setDemoLoading] = useState(true);
  const [demoError, setDemoError] = useState(null);
  const [selectingId, setSelectingId] = useState(null);

  const [uploadError, setUploadError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    listDemoDatasets()
      .then(setDemoDatasets)
      .catch((err) => setDemoError(getErrorMessage(err, "Could not load demo datasets.")))
      .finally(() => setDemoLoading(false));
  }, []);

  const handleDemoSelect = async (datasetId) => {
    setSelectingId(datasetId);
    setUploadError(null);
    try {
      const metadata = await getDataset(datasetId);
      onReady(metadata);
    } catch (err) {
      setUploadError(getErrorMessage(err, "Could not load that dataset."));
    } finally {
      setSelectingId(null);
    }
  };

  const onDrop = useCallback(async (accepted, rejected) => {
    setUploadError(null);
    if (rejected?.length) {
      setUploadError(rejected[0].errors?.[0]?.message || "File was rejected.");
      return;
    }
    const file = accepted[0];
    if (!file) return;
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      setUploadError(`File exceeds the ${MAX_UPLOAD_MB} MB upload limit.`);
      return;
    }
    setUploading(true);
    setProgress(0);
    try {
      const metadata = await uploadDataset(file, setProgress);
      onReady(metadata);
    } catch (err) {
      setUploadError(getErrorMessage(err, "Upload failed."));
    } finally {
      setUploading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "text/csv": [".csv"] },
    maxFiles: 1,
    disabled: uploading,
  });

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-1 text-xl font-semibold text-forge-50 sm:text-2xl">Pick a dataset</h2>
        <p className="mb-5 text-sm text-forge-400">
          Try one of the preloaded datasets below, or upload your own CSV (max {MAX_UPLOAD_MB} MB).
        </p>

        {demoLoading && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-36 animate-pulse rounded-xl border border-forge-800 bg-forge-900" />
            ))}
          </div>
        )}

        {demoError && (
          <div className="flex items-center gap-2 rounded-lg border border-crit-500/30 bg-crit-500/10 p-3 text-sm text-crit-500">
            <AlertCircle size={16} /> {demoError}
          </div>
        )}

        {!demoLoading && !demoError && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {demoDatasets.map((d) => {
              const Icon = TASK_ICONS[d.task_type] || Target;
              const busy = selectingId === d.dataset_id;
              return (
                <button
                  key={d.dataset_id}
                  type="button"
                  onClick={() => handleDemoSelect(d.dataset_id)}
                  disabled={selectingId !== null}
                  className="group flex flex-col items-start rounded-xl border border-forge-800 bg-forge-900 p-4 text-left transition hover:border-ember-500/50 hover:bg-forge-850 disabled:cursor-wait disabled:opacity-60"
                >
                  <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-ember-500/10 text-ember-400 ring-1 ring-inset ring-ember-500/20">
                    <Icon size={18} />
                  </span>
                  <span className="mb-1 text-sm font-semibold text-forge-50">{d.name}</span>
                  <span className="mb-3 text-xs capitalize text-forge-400">{d.task_type}</span>
                  <span className="text-xs leading-relaxed text-forge-400">{d.description}</span>
                  <span className="mt-3 text-[11px] text-forge-500">{busy ? "Loading…" : d.source}</span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center gap-3">
          <div className="h-px flex-1 bg-forge-800" />
          <span className="text-xs font-medium uppercase tracking-wider text-forge-500">or upload your own</span>
          <div className="h-px flex-1 bg-forge-800" />
        </div>

        <div
          {...getRootProps()}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition sm:p-10 ${
            isDragActive
              ? "border-ember-500 bg-ember-500/5"
              : "border-forge-700 bg-forge-900/50 hover:border-forge-600 hover:bg-forge-900"
          } ${uploading ? "pointer-events-none opacity-70" : ""}`}
        >
          <input {...getInputProps()} />
          <UploadCloud size={28} className="mb-3 text-forge-400" />
          {uploading ? (
            <div className="w-full max-w-xs">
              <p className="mb-2 text-sm text-forge-300">Uploading… {progress}%</p>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-forge-800">
                <div
                  className="h-full rounded-full bg-ember-500 transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm font-medium text-forge-100">
                {isDragActive ? "Drop the CSV here" : "Drag & drop a CSV, or click to browse"}
              </p>
              <p className="mt-1 text-xs text-forge-500">.csv only, up to {MAX_UPLOAD_MB} MB</p>
            </>
          )}
        </div>

        {uploadError && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-crit-500/30 bg-crit-500/10 p-3 text-sm text-crit-500">
            <AlertCircle size={16} /> {uploadError}
          </div>
        )}
      </section>
    </div>
  );
}
