"""Orchestrates dataset upload, demo-dataset seeding, and lookups on top of DatasetStorage."""
from __future__ import annotations

import io
import uuid
from datetime import datetime, timezone

import pandas as pd

from app.config import get_settings
from app.services import schema_detection
from app.services.demo_registry import DEMO_DATASETS, DEMO_DATASETS_BY_ID
from app.services.storage import DatasetStorage, get_storage


class DatasetError(Exception):
    """User-facing dataset validation error (maps to HTTP 400)."""


def _data_path(dataset_id: str) -> str:
    return f"datasets/{dataset_id}/data.csv"


def _metadata_path(dataset_id: str) -> str:
    return f"datasets/{dataset_id}/metadata.json"


def _parse_csv(raw_bytes: bytes, filename: str) -> pd.DataFrame:
    if not raw_bytes:
        raise DatasetError("The uploaded file is empty.")
    if not filename.lower().endswith(".csv"):
        raise DatasetError("Only .csv files are supported.")
    try:
        df = pd.read_csv(io.BytesIO(raw_bytes))
    except Exception as exc:
        raise DatasetError(f"Could not parse file as CSV: {exc}") from exc
    if df.empty or df.shape[1] == 0:
        raise DatasetError("The CSV file has no rows or columns.")
    return df


def _build_metadata(dataset_id: str, filename: str, df: pd.DataFrame, is_demo: bool, demo_key: str | None) -> dict:
    columns = schema_detection.detect_schema(df)
    suggestion = schema_detection.suggest_target_and_task(columns)

    # demo datasets ship with a known-good target/time column instead of relying purely on heuristics
    if is_demo and demo_key:
        demo = DEMO_DATASETS_BY_ID[demo_key]
        suggestion["target_column"] = demo["default_target_column"]
        suggestion["task_type"] = demo["task_type"]
        suggestion["time_column"] = demo["default_time_column"]

    return {
        "dataset_id": dataset_id,
        "filename": filename,
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
        "row_count": int(len(df)),
        "column_count": int(df.shape[1]),
        "size_bytes": int(df.memory_usage(deep=True).sum()),
        "columns": columns,
        "suggested_target_column": suggestion["target_column"],
        "suggested_task_type": suggestion["task_type"],
        "suggested_time_column": suggestion["time_column"],
        "is_demo": is_demo,
        "demo_key": demo_key,
    }


def upload_dataset(raw_bytes: bytes, filename: str) -> dict:
    settings = get_settings()
    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    if len(raw_bytes) > max_bytes:
        raise DatasetError(f"File exceeds the {settings.max_upload_size_mb} MB upload limit.")

    df = _parse_csv(raw_bytes, filename)

    dataset_id = str(uuid.uuid4())
    storage = get_storage()
    storage.save_bytes(_data_path(dataset_id), raw_bytes)

    metadata = _build_metadata(dataset_id, filename, df, is_demo=False, demo_key=None)
    storage.save_json(_metadata_path(dataset_id), metadata)
    return metadata


def get_dataset_metadata(dataset_id: str) -> dict:
    storage = get_storage()
    try:
        return storage.load_json(_metadata_path(dataset_id))
    except FileNotFoundError:
        raise DatasetError(f"Dataset '{dataset_id}' was not found.") from None


def get_dataset_dataframe(dataset_id: str) -> pd.DataFrame:
    storage = get_storage()
    try:
        raw = storage.load_bytes(_data_path(dataset_id))
    except FileNotFoundError:
        raise DatasetError(f"Dataset '{dataset_id}' was not found.") from None
    return pd.read_csv(io.BytesIO(raw))


def get_dataset_raw_bytes(dataset_id: str) -> bytes:
    storage = get_storage()
    try:
        return storage.load_bytes(_data_path(dataset_id))
    except FileNotFoundError:
        raise DatasetError(f"Dataset '{dataset_id}' was not found.") from None


def list_demo_datasets() -> list[dict]:
    return [
        {
            "dataset_id": d["dataset_id"],
            "name": d["name"],
            "description": d["description"],
            "task_type": d["task_type"],
            "source": d["source"],
        }
        for d in DEMO_DATASETS
    ]


def ensure_demo_datasets_seeded(storage: DatasetStorage | None = None) -> None:
    """Idempotently writes the 3 demo datasets into storage on startup if not already present."""
    storage = storage or get_storage()
    for demo in DEMO_DATASETS:
        dataset_id = demo["dataset_id"]
        if storage.exists(_metadata_path(dataset_id)):
            continue

        source_file = demo["source_file"]
        if not source_file.exists():
            raise RuntimeError(
                f"Demo dataset source file missing: {source_file}. "
                "Run backend/scripts/fetch_demo_datasets.py first."
            )

        raw_bytes = source_file.read_bytes()
        df = _parse_csv(raw_bytes, source_file.name)
        storage.save_bytes(_data_path(dataset_id), raw_bytes)
        metadata = _build_metadata(dataset_id, source_file.name, df, is_demo=True, demo_key=dataset_id)
        storage.save_json(_metadata_path(dataset_id), metadata)
