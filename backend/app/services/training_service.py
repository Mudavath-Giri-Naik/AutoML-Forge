"""
AutoML job submission, status polling, leaderboard, and model serving.

Deliberately keeps no database: everything the app needs to know about a job
(dataset, task type, target column, primary metric) is stashed as Azure ML
job tags at submission time and read back via the job_id, per the "no
database" design in the PRD (state lives entirely in Azure ML).
"""
from __future__ import annotations

import json
import tempfile
import time
from functools import lru_cache
from pathlib import Path
from typing import Optional

import numpy as np

from app.config import get_settings
from app.services import dataset_service
from app.services.aml_client import get_ml_client, get_mlflow_tracking_uri

DEFAULT_PRIMARY_METRIC = {
    "classification": "accuracy",
    "regression": "normalized_root_mean_squared_error",
    "forecasting": "normalized_root_mean_squared_error",
}

VALID_PRIMARY_METRICS = {
    "classification": {
        "accuracy",
        "AUC_weighted",
        "average_precision_score_weighted",
        "norm_macro_recall",
        "precision_score_weighted",
    },
    "regression": {
        "spearman_correlation",
        "normalized_root_mean_squared_error",
        "r2_score",
        "normalized_mean_absolute_error",
    },
    "forecasting": {
        "normalized_root_mean_squared_error",
        "r2_score",
        "normalized_mean_absolute_error",
    },
}

# metrics where a lower value is better; anything else is treated as higher-is-better
LOWER_IS_BETTER_METRICS = {
    "normalized_root_mean_squared_error",
    "normalized_mean_absolute_error",
    "mean_absolute_percentage_error",
    "root_mean_squared_log_error",
    "log_loss",
}

TAG_PREFIX = "automl_forge_"
MODEL_CACHE_DIR = Path(tempfile.gettempdir()) / "automl_forge_model_cache"


class TrainingError(Exception):
    """User-facing training/prediction error (maps to HTTP 400/404)."""


def _json_safe_float(value):
    """NaN/Infinity are valid Python floats but not valid JSON — regression runs can
    genuinely log these (e.g. a degenerate trial's r2_score), which would otherwise
    crash the response serializer. Map them to None."""
    if isinstance(value, float) and (value != value or value in (float("inf"), float("-inf"))):
        return None
    return value


def _normalize_status(raw_status: Optional[str]) -> str:
    if not raw_status:
        return "unknown"
    s = raw_status.lower()
    if s == "completed":
        return "completed"
    if s in ("failed", "canceled", "cancelled"):
        return "failed"
    return "running"  # notstarted / queued / preparing / starting / running / finalizing


def _write_mltable(csv_bytes: bytes, folder: Path) -> None:
    """Writes a minimal MLTable manifest by hand (no `mltable` package dependency —
    it pulls in azureml-dataprep-native, which has no wheel for very new Python
    versions). This YAML is the same asset format the Azure CLI examples use."""
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "data.csv").write_bytes(csv_bytes)
    (folder / "MLTable").write_text(
        "$schema: https://azuremlschemas.azureedge.net/latest/MLTable.schema.json\n"
        "type: mltable\n"
        "paths:\n"
        "  - file: ./data.csv\n"
        "transformations:\n"
        "  - read_delimited:\n"
        "      delimiter: ','\n"
        "      encoding: 'utf8'\n",
        encoding="utf-8",
    )


def submit_training_job(
    dataset_id: str,
    task_type: str,
    target_column: str,
    time_column: Optional[str] = None,
    forecast_horizon: Optional[int] = None,
    primary_metric: Optional[str] = None,
) -> dict:
    from azure.ai.ml import Input, automl
    from azure.ai.ml.automl import ForecastingSettings
    from azure.ai.ml.constants import AssetTypes
    from azure.ai.ml.entities import ResourceConfiguration

    if task_type not in DEFAULT_PRIMARY_METRIC:
        raise TrainingError(f"Unsupported task type '{task_type}'.")

    metadata = dataset_service.get_dataset_metadata(dataset_id)
    column_names = {c["name"] for c in metadata["columns"]}
    if target_column not in column_names:
        raise TrainingError(f"Column '{target_column}' does not exist in this dataset.")

    if task_type == "forecasting":
        if not time_column or time_column not in column_names:
            raise TrainingError("Forecasting jobs require a valid time_column present in the dataset.")
        if not forecast_horizon or forecast_horizon < 1:
            raise TrainingError("Forecasting jobs require a positive forecast_horizon.")

    primary_metric = primary_metric or DEFAULT_PRIMARY_METRIC[task_type]
    if primary_metric not in VALID_PRIMARY_METRICS[task_type]:
        raise TrainingError(
            f"'{primary_metric}' is not a valid primary metric for {task_type}. "
            f"Choose one of: {', '.join(sorted(VALID_PRIMARY_METRICS[task_type]))}"
        )

    settings = get_settings()
    ml_client = get_ml_client()
    raw_bytes = dataset_service.get_dataset_raw_bytes(dataset_id)

    tags = {
        f"{TAG_PREFIX}dataset_id": dataset_id,
        f"{TAG_PREFIX}task_type": task_type,
        f"{TAG_PREFIX}target_column": target_column,
        f"{TAG_PREFIX}time_column": time_column or "",
        f"{TAG_PREFIX}primary_metric": primary_metric,
    }

    with tempfile.TemporaryDirectory(prefix="automl-forge-") as tmp:
        mltable_folder = Path(tmp) / "mltable"
        _write_mltable(raw_bytes, mltable_folder)
        training_data = Input(type=AssetTypes.MLTABLE, path=str(mltable_folder))

        common_kwargs = dict(
            training_data=training_data,
            target_column_name=target_column,
            primary_metric=primary_metric,
            enable_model_explainability=True,
            tags=tags,
        )

        if task_type == "classification":
            job = automl.classification(**common_kwargs)
        elif task_type == "regression":
            job = automl.regression(**common_kwargs)
        else:
            job = automl.forecasting(
                **common_kwargs,
                forecasting_settings=ForecastingSettings(
                    time_column_name=time_column,
                    forecast_horizon=forecast_horizon,
                ),
            )

        job.experiment_name = "automl-forge"
        job.display_name = f"{task_type}-{dataset_id[:8]}"
        # Score with onnxruntime instead of unpickling AutoML's native model: the
        # pickle requires azureml's internal training-runtime classes, which pull in
        # a huge, fragile, Python-<3.12-only legacy dependency chain (~30 packages,
        # including a native onnx/protobuf DLL conflict we hit and worked around).
        # ONNX keeps the serving side to just `onnxruntime`.
        job.set_training(enable_onnx_compatible_models=True)
        job.set_limits(
            timeout_minutes=settings.training_job_timeout_minutes,
            trial_timeout_minutes=settings.training_trial_timeout_minutes,
            max_trials=settings.training_max_trials,
            enable_early_termination=True,
        )
        # omitting `compute` + setting `resources` is what makes this run on
        # serverless compute instead of a pre-provisioned cluster
        job.resources = ResourceConfiguration(
            instance_type=settings.training_serverless_instance_type,
            instance_count=1,
        )

        try:
            returned_job = ml_client.jobs.create_or_update(job)
        except Exception as exc:
            raise TrainingError(f"Failed to submit training job: {exc}") from exc

    studio_url = None
    if returned_job.services and "Studio" in returned_job.services:
        studio_url = returned_job.services["Studio"].endpoint

    return {
        "job_id": returned_job.name,
        "dataset_id": dataset_id,
        "task_type": task_type,
        "target_column": target_column,
        "time_column": time_column,
        "forecast_horizon": forecast_horizon,
        "primary_metric": primary_metric,
        "status": _normalize_status(returned_job.status),
        "studio_url": studio_url,
    }


def list_recent_jobs(limit: int = 12) -> list[dict]:
    """Past jobs submitted through this app, newest first. Reads straight off the
    Azure ML workspace (no database) — only jobs carrying our own tags are included,
    which naturally excludes AutoML's per-trial child runs and anything submitted
    outside this app."""
    import itertools

    ml_client = get_ml_client()
    try:
        # jobs.list() has no server-side "only ours" filter, so pull the workspace's
        # recent jobs and rely on the automl_forge_* tags (below) to pick out only
        # jobs this app submitted — everything else (child trial runs, anything
        # submitted outside the app) gets skipped.
        jobs_iter = ml_client.jobs.list()
    except Exception as exc:
        raise TrainingError(f"Could not list past training jobs: {exc}") from exc

    jobs = []
    for job in itertools.islice(jobs_iter, 100):
        tags = job.tags or {}
        task_type = tags.get(f"{TAG_PREFIX}task_type")
        if not task_type:
            continue  # not one of ours (e.g. a child trial run)

        created_at = None
        try:
            created_at = job.creation_context.created_at.isoformat()
        except Exception:
            pass

        jobs.append(
            {
                "job_id": job.name,
                "display_name": job.display_name,
                "status": _normalize_status(job.status),
                "task_type": task_type,
                "target_column": tags.get(f"{TAG_PREFIX}target_column"),
                "primary_metric": tags.get(f"{TAG_PREFIX}primary_metric"),
                "dataset_id": tags.get(f"{TAG_PREFIX}dataset_id") or None,
                "created_at": created_at,
            }
        )

    jobs.sort(key=lambda j: j["created_at"] or "", reverse=True)
    jobs = jobs[:limit]

    for j in jobs:
        j["dataset_name"] = None
        if j["dataset_id"]:
            try:
                j["dataset_name"] = dataset_service.get_dataset_metadata(j["dataset_id"]).get("filename")
            except Exception:
                pass  # dataset may have been purged from storage; job info is still shown

    return jobs


def get_job_status(job_id: str) -> dict:
    ml_client = get_ml_client()
    try:
        job = ml_client.jobs.get(job_id)
    except Exception as exc:
        raise TrainingError(f"Training job '{job_id}' was not found.") from exc

    trials = []
    try:
        for child in ml_client.jobs.list(parent_job_name=job_id):
            trials.append(
                {
                    "run_id": child.name,
                    "display_name": child.display_name,
                    "status": _normalize_status(child.status),
                }
            )
    except Exception:
        pass  # child-run listing is best-effort; don't fail the whole status call over it

    tags = job.tags or {}
    return {
        "job_id": job.name,
        "status": _normalize_status(job.status),
        "raw_status": job.status,
        "dataset_id": tags.get(f"{TAG_PREFIX}dataset_id"),
        "task_type": tags.get(f"{TAG_PREFIX}task_type"),
        "target_column": tags.get(f"{TAG_PREFIX}target_column"),
        "time_column": tags.get(f"{TAG_PREFIX}time_column") or None,
        "primary_metric": tags.get(f"{TAG_PREFIX}primary_metric"),
        "trial_count": len(trials),
        "trials": trials,
    }


def get_leaderboard(job_id: str) -> dict:
    """Ranked model list. Works during training too (partial results, no best-model
    flag yet) so the frontend can poll this for a live 'race view', not just after
    the job completes."""
    import mlflow

    status_info = get_job_status(job_id)
    status = status_info["status"]
    primary_metric = status_info["primary_metric"]

    mlflow.set_tracking_uri(get_mlflow_tracking_uri())

    try:
        parent_run = mlflow.get_run(job_id)
    except Exception:
        # job submitted but the mlflow run hasn't been created yet
        return {"job_id": job_id, "status": status, "primary_metric": primary_metric, "best_run_id": None, "models": []}

    best_run_id = parent_run.data.tags.get("automl_best_child_run_id")

    # AutoML logs each trial's algorithm on the *parent* run as a single
    # semicolon-delimited tag ("run_algorithm_000": "LightGBM;XGBoost;...")
    # indexed by trial number — not as a tag on the child run itself.
    algorithm_by_index = {}
    raw_algorithms = parent_run.data.tags.get("run_algorithm_000")
    if raw_algorithms:
        algorithm_by_index = dict(enumerate(raw_algorithms.split(";")))

    child_runs = mlflow.search_runs(
        experiment_ids=[parent_run.info.experiment_id],
        filter_string=f"tags.mlflow.parentRunId='{job_id}'",
        output_format="list",
    )

    # Right after a job flips to "completed", the run-history backend can briefly
    # lag behind for search queries even though get_run already sees the parent.
    # Only worth retrying once actually completed — while still running, an
    # empty/partial list is genuinely correct, not a lag artifact.
    if not child_runs and status == "completed":
        for _ in range(3):
            time.sleep(2)
            child_runs = mlflow.search_runs(
                experiment_ids=[parent_run.info.experiment_id],
                filter_string=f"tags.mlflow.parentRunId='{job_id}'",
                output_format="list",
            )
            if child_runs:
                break

    models = []
    for run in child_runs:
        suffix = run.info.run_id.rsplit("_", 1)[-1]
        trial_index = int(suffix) if suffix.isdigit() else None
        algorithm = (
            algorithm_by_index.get(trial_index)
            or run.data.tags.get("mlflow.runName")
            or run.info.run_id
        )
        metric_value = run.data.metrics.get(primary_metric) if primary_metric else None
        models.append(
            {
                "run_id": run.info.run_id,
                "algorithm": algorithm,
                "status": run.info.status,
                "is_best": run.info.run_id == best_run_id,
                "primary_metric_value": _json_safe_float(metric_value),
                "metrics": {k: _json_safe_float(v) for k, v in run.data.metrics.items()},
            }
        )

    lower_is_better = primary_metric in LOWER_IS_BETTER_METRICS
    with_metric = [m for m in models if m["primary_metric_value"] is not None]
    without_metric = [m for m in models if m["primary_metric_value"] is None]
    with_metric.sort(key=lambda m: m["primary_metric_value"], reverse=not lower_is_better)

    return {
        "job_id": job_id,
        "status": status,
        "primary_metric": primary_metric,
        "best_run_id": best_run_id,
        "models": with_metric + without_metric,
    }


def _find_onnx_model_path(repo) -> str:
    """Locates the exported model.onnx file in a run's artifacts.

    AutoML runs log it under outputs/model.onnx, but we search rather than hardcode
    that path so this keeps working if a future run layout differs.
    """
    root = repo.list_artifacts("")
    outputs_dir = next((a for a in root if a.is_dir and a.path.rstrip("/").endswith("outputs")), None)
    search_scopes = [repo.list_artifacts(outputs_dir.path) if outputs_dir else [], root]
    for scope in search_scopes:
        onnx_file = next((a for a in scope if not a.is_dir and a.path.endswith(".onnx")), None)
        if onnx_file:
            return onnx_file.path
    raise TrainingError(
        "No ONNX model artifact found for this run. The job may have been submitted before "
        "ONNX export was enabled, or the winning algorithm doesn't support ONNX conversion."
    )


# Maps onnxruntime's tensor element types to numpy dtypes for building input feeds.
_ONNX_TO_NUMPY_DTYPE = {
    "tensor(float)": np.float32,
    "tensor(double)": np.float64,
    "tensor(int64)": np.int64,
    "tensor(int32)": np.int32,
    "tensor(string)": np.str_,
    "tensor(bool)": np.bool_,
}


@lru_cache(maxsize=3)
def _load_model(job_id: str):
    # Scoring with onnxruntime instead of unpickling AutoML's native sklearn model —
    # see the comment on set_training(enable_onnx_compatible_models=True) in
    # submit_training_job for why: the pickle path needs Azure's internal training
    # runtime, which is a huge, fragile, Python-<3.12-only dependency chain.
    import mlflow
    import onnxruntime

    from azureml.mlflow._store.artifact.artifact_repo import AzureMLflowArtifactRepository

    leaderboard = get_leaderboard(job_id)
    candidates = [m for m in leaderboard["models"] if m["primary_metric_value"] is not None]
    if not candidates:
        raise TrainingError(f"No completed models are available yet for job '{job_id}'.")

    mlflow.set_tracking_uri(get_mlflow_tracking_uri())

    # Ensemble models (often the best-scoring ones) don't always get an ONNX
    # export from AutoML — fall back through the ranked list to the best model
    # that actually has one, rather than hard-failing on the literal top score.
    last_error = None
    for candidate in candidates:
        try:
            run = mlflow.get_run(candidate["run_id"])
            repo = AzureMLflowArtifactRepository(run.info.artifact_uri)
            onnx_artifact_path = _find_onnx_model_path(repo)
        except TrainingError as exc:
            last_error = exc
            continue

        local_dir = MODEL_CACHE_DIR / job_id
        local_dir.mkdir(parents=True, exist_ok=True)
        model_path = repo.download_artifacts(onnx_artifact_path, dst_path=str(local_dir))
        session = onnxruntime.InferenceSession(model_path)
        return session, candidate["run_id"], candidate["algorithm"]

    raise TrainingError(
        f"None of the top-ranked models for job '{job_id}' have an ONNX export available. {last_error}"
    )


def _build_input_feed(session, rows: list[dict]) -> dict:
    """Builds an onnxruntime input feed for N rows at once (batched — one
    session.run() call regardless of how many rows), keyed by each graph
    input's own name. AutoML's exported graph takes one named tensor per raw
    feature column, shaped [batch, 1] or [batch] depending on the run."""
    feed = {}
    for input_meta in session.get_inputs():
        if any(input_meta.name not in row for row in rows):
            raise TrainingError(f"Missing required feature '{input_meta.name}'.")
        dtype = _ONNX_TO_NUMPY_DTYPE.get(input_meta.type, np.float32)
        rank = len(input_meta.shape) if input_meta.shape else 1
        column = [row[input_meta.name] for row in rows]
        value = [[v] for v in column] if rank == 2 else column
        feed[input_meta.name] = np.array(value, dtype=dtype)
    return feed


def predict(job_id: str, features: dict) -> dict:
    if not features:
        raise TrainingError("No feature values were provided.")

    session, model_run_id, model_algorithm = _load_model(job_id)

    try:
        input_feed = _build_input_feed(session, [features])
        outputs = session.run(None, input_feed)
    except TrainingError:
        raise
    except Exception as exc:
        raise TrainingError(f"Prediction failed: {exc}") from exc

    output_names = [o.name for o in session.get_outputs()]
    label = outputs[0]
    value = label[0] if hasattr(label, "__getitem__") else label
    if hasattr(value, "item"):
        value = value.item()

    result = {"job_id": job_id, "prediction": value, "model_run_id": model_run_id, "model_algorithm": model_algorithm}

    if len(outputs) > 1 and "probabilit" in output_names[1].lower():
        probabilities = outputs[1][0] if hasattr(outputs[1], "__getitem__") else outputs[1]
        if isinstance(probabilities, dict):
            result["probabilities"] = {str(k): float(v) for k, v in probabilities.items()}

    return result


@lru_cache(maxsize=10)
def get_explanation(job_id: str, sample_size: int = 60) -> dict:
    """Feature importance via permutation: shuffle one feature at a time across a
    data sample and measure how much predictions move. Deliberately not Azure's own
    explainability artifacts (azureml-interpret) or the `shap` package — both are
    heavier dependencies than just reusing the onnxruntime session we already load
    for predictions, and permutation importance is a well-established, model-agnostic
    technique that needs nothing beyond numpy + pandas."""
    status_info = get_job_status(job_id)
    if status_info["status"] != "completed":
        return {"job_id": job_id, "status": status_info["status"], "importances": []}

    session, _, _ = _load_model(job_id)
    input_names = [inp.name for inp in session.get_inputs()]

    df = dataset_service.get_dataset_dataframe(status_info["dataset_id"])
    missing = [c for c in input_names if c not in df.columns]
    if missing:
        raise TrainingError(f"Dataset is missing columns the model expects: {', '.join(missing)}")

    sample = df[input_names].dropna()
    if sample.empty:
        return {"job_id": job_id, "status": "completed", "importances": []}
    sample = sample.sample(n=min(sample_size, len(sample)), random_state=42).reset_index(drop=True)

    def run_all(frame) -> np.ndarray:
        # Batched (one session.run() for all rows) is the fast path and works for
        # almost every AutoML ONNX export. A handful of exports declare a *fixed*
        # (non-dynamic) batch size of 1 on one particular input — often a raw
        # identifier-like column that ended up as a model feature — which rejects
        # a real batch outright. Fall back to one call per row in that case; it's
        # slower but works regardless of which input the model got picky about.
        rows = frame.to_dict("records")
        try:
            feed = _build_input_feed(session, rows)
            return np.asarray(session.run(None, feed)[0])
        except Exception:
            return np.asarray([session.run(None, _build_input_feed(session, [row]))[0][0] for row in rows])

    baseline = run_all(sample)
    task_type = status_info["task_type"]
    rng = np.random.default_rng(42)

    importances = []
    for col in input_names:
        permuted = sample.copy()
        permuted[col] = rng.permutation(permuted[col].to_numpy())
        permuted_preds = run_all(permuted)

        if task_type == "classification":
            impact = float(np.mean(baseline != permuted_preds))
        else:
            impact = float(np.mean(np.abs(baseline.astype(float) - permuted_preds.astype(float))))
        importances.append({"feature": col, "impact": impact})

    total = sum(i["impact"] for i in importances) or 1.0
    for i in importances:
        i["importance"] = i["impact"] / total
    importances.sort(key=lambda i: i["importance"], reverse=True)

    return {"job_id": job_id, "status": "completed", "sample_size": len(sample), "importances": importances}


def get_curl_snippet(job_id: str, api_base_url: str) -> str:
    status_info = get_job_status(job_id)
    metadata = dataset_service.get_dataset_metadata(status_info["dataset_id"])
    excluded = {status_info["target_column"], status_info["time_column"]}

    sample_features = {}
    for col in metadata["columns"]:
        if col["name"] in excluded:
            continue
        if col["inferred_type"] == "numeric":
            sample_features[col["name"]] = col.get("mean", 0)
        else:
            sample_features[col["name"]] = col["sample_values"][0] if col["sample_values"] else ""

    body = json.dumps({"features": sample_features}, indent=2)
    return (
        f"curl -X POST {api_base_url.rstrip('/')}/api/predict/{job_id} \\\n"
        f'  -H "Content-Type: application/json" \\\n'
        f"  -d '{body}'"
    )


def get_export_code(job_id: str) -> str:
    status_info = get_job_status(job_id)
    leaderboard = get_leaderboard(job_id)
    best = next((m for m in leaderboard["models"] if m["is_best"]), None)
    algorithm = best["algorithm"] if best else "AutoML"

    metadata = dataset_service.get_dataset_metadata(status_info["dataset_id"])
    excluded = {status_info["target_column"], status_info["time_column"]}
    feature_lines = "\n".join(
        f'    "{col["name"]}": ...,  # {col["inferred_type"]}'
        for col in metadata["columns"]
        if col["name"] not in excluded
    )

    return f'''"""
Standalone scoring script for AutoML Forge job '{job_id}'.
Winning algorithm: {algorithm}

Download model.onnx first, from the winning run's "outputs" folder in
Azure ML Studio (Jobs > this run > the best child run > Outputs + logs).

Then:
  pip install onnxruntime numpy
  python score.py
"""
import numpy as np
import onnxruntime as ort

session = ort.InferenceSession("model.onnx")

features = {{
{feature_lines}
}}

feed = {{}}
for inp in session.get_inputs():
    value = features[inp.name]
    rank = len(inp.shape) if inp.shape else 1
    feed[inp.name] = np.array([[value]] if rank == 2 else [value])

outputs = session.run(None, feed)
print("Prediction:", outputs[0][0])
'''
