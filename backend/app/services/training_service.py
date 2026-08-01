"""
AutoML job submission, status polling, leaderboard, and model serving.

Deliberately keeps no database: everything the app needs to know about a job
(dataset, task type, target column, primary metric) is stashed as Azure ML
job tags at submission time and read back via the job_id, per the "no
database" design in the PRD (state lives entirely in Azure ML).
"""
from __future__ import annotations

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
    import mlflow

    status_info = get_job_status(job_id)
    status = status_info["status"]
    primary_metric = status_info["primary_metric"]

    if status != "completed":
        return {"job_id": job_id, "status": status, "primary_metric": primary_metric, "best_run_id": None, "models": []}

    mlflow.set_tracking_uri(get_mlflow_tracking_uri())

    try:
        parent_run = mlflow.get_run(job_id)
    except Exception as exc:
        raise TrainingError(f"Could not read training results for job '{job_id}': {exc}") from exc

    best_run_id = parent_run.data.tags.get("automl_best_child_run_id")

    # AutoML logs each trial's algorithm on the *parent* run as a single
    # semicolon-delimited tag ("run_algorithm_000": "LightGBM;XGBoost;...")
    # indexed by trial number — not as a tag on the child run itself.
    algorithm_by_index = {}
    raw_algorithms = parent_run.data.tags.get("run_algorithm_000")
    if raw_algorithms:
        algorithm_by_index = dict(enumerate(raw_algorithms.split(";")))

    # Right after a job flips to "completed", the run-history backend can
    # briefly lag behind for search queries even though get_run already
    # sees the parent — retry a few times before giving up.
    child_runs = []
    for attempt in range(4):
        child_runs = mlflow.search_runs(
            experiment_ids=[parent_run.info.experiment_id],
            filter_string=f"tags.mlflow.parentRunId='{job_id}'",
            output_format="list",
        )
        if child_runs:
            break
        if attempt < 3:
            time.sleep(2)

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
                "primary_metric_value": metric_value,
                "metrics": run.data.metrics,
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
    best_run_id = leaderboard["best_run_id"]
    if not best_run_id:
        raise TrainingError(f"No completed best model is available yet for job '{job_id}'.")

    mlflow.set_tracking_uri(get_mlflow_tracking_uri())
    run = mlflow.get_run(best_run_id)
    repo = AzureMLflowArtifactRepository(run.info.artifact_uri)
    onnx_artifact_path = _find_onnx_model_path(repo)

    local_dir = MODEL_CACHE_DIR / job_id
    local_dir.mkdir(parents=True, exist_ok=True)
    model_path = repo.download_artifacts(onnx_artifact_path, dst_path=str(local_dir))
    return onnxruntime.InferenceSession(model_path)


def predict(job_id: str, features: dict) -> dict:
    if not features:
        raise TrainingError("No feature values were provided.")

    session = _load_model(job_id)

    input_feed = {}
    for input_meta in session.get_inputs():
        if input_meta.name not in features:
            raise TrainingError(f"Missing required feature '{input_meta.name}'.")
        dtype = _ONNX_TO_NUMPY_DTYPE.get(input_meta.type, np.float32)
        # AutoML's exported graph takes one named tensor per raw feature column,
        # shaped [batch, 1] or [batch] depending on the run — match whichever the
        # graph actually declares instead of assuming one.
        rank = len(input_meta.shape) if input_meta.shape else 1
        value = [[features[input_meta.name]]] if rank == 2 else [features[input_meta.name]]
        input_feed[input_meta.name] = np.array(value, dtype=dtype)

    try:
        outputs = session.run(None, input_feed)
    except Exception as exc:
        raise TrainingError(f"Prediction failed: {exc}") from exc

    output_names = [o.name for o in session.get_outputs()]
    label = outputs[0]
    value = label[0] if hasattr(label, "__getitem__") else label
    if hasattr(value, "item"):
        value = value.item()

    result = {"job_id": job_id, "prediction": value}

    if len(outputs) > 1 and "probabilit" in output_names[1].lower():
        probabilities = outputs[1][0] if hasattr(outputs[1], "__getitem__") else outputs[1]
        if isinstance(probabilities, dict):
            result["probabilities"] = {str(k): float(v) for k, v in probabilities.items()}

    return result
