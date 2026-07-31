"""
Column-type inference and target-column / task-type suggestion.

This is a heuristic, not a guarantee — the frontend always lets the user
override the suggested target column and task type before training.
"""
from __future__ import annotations

import re
from typing import Optional

import pandas as pd

BOOLEAN_TOKENS = {"true", "false", "yes", "no", "y", "n", "0", "1"}
TARGET_NAME_HINTS = (
    "target",
    "label",
    "class",
    "outcome",
    "result",
    "survived",
    "price",
    "value",
    "sales",
    "revenue",
    "demand",
    "amount",
    "score",
    "churn",
    "default",
)
ID_NAME_HINTS = ("id", "index", "unnamed", "uuid", "guid")


def _looks_like_identifier(name: str, series: pd.Series, row_count: int) -> bool:
    lowered = name.strip().lower().replace("_", "").replace(" ", "")
    if any(lowered == hint or lowered.endswith(hint) for hint in ID_NAME_HINTS):
        return True
    if row_count == 0:
        return False
    unique_ratio = series.nunique(dropna=True) / row_count
    return unique_ratio > 0.98 and row_count > 20


def _try_parse_datetime(series: pd.Series) -> Optional[pd.Series]:
    if pd.api.types.is_numeric_dtype(series):
        return None
    non_null = series.dropna()
    if non_null.empty:
        return None
    parsed = pd.to_datetime(non_null, errors="coerce", format="mixed")
    success_rate = parsed.notna().mean()
    if success_rate >= 0.9:
        return parsed
    return None


def _column_stats(name: str, series: pd.Series, row_count: int) -> dict:
    missing_count = int(series.isna().sum())
    missing_pct = round((missing_count / row_count) * 100, 2) if row_count else 0.0
    non_null = series.dropna()
    unique_count = int(non_null.nunique())

    inferred_type = "text"
    numeric_series = None

    parsed_dt = _try_parse_datetime(series)
    if parsed_dt is not None:
        inferred_type = "datetime"
    elif _looks_like_identifier(name, series, row_count):
        inferred_type = "identifier"
    else:
        if pd.api.types.is_bool_dtype(series):
            inferred_type = "boolean"
        elif pd.api.types.is_numeric_dtype(series):
            numeric_series = non_null
            distinct_vals = set(non_null.unique().tolist())
            if distinct_vals.issubset({0, 1}):
                inferred_type = "boolean"
            else:
                inferred_type = "numeric"
        else:
            str_vals = non_null.astype(str).str.strip().str.lower()
            if not str_vals.empty and set(str_vals.unique()).issubset(BOOLEAN_TOKENS):
                inferred_type = "boolean"
            else:
                coerced = pd.to_numeric(non_null, errors="coerce")
                numeric_success = coerced.notna().mean() if len(non_null) else 0
                if numeric_success >= 0.95:
                    inferred_type = "numeric"
                    numeric_series = coerced.dropna()
                else:
                    unique_ratio = unique_count / len(non_null) if len(non_null) else 0
                    inferred_type = "categorical" if unique_ratio <= 0.5 or unique_count <= 50 else "text"

    stats = {
        "name": name,
        "inferred_type": inferred_type,
        "pandas_dtype": str(series.dtype),
        "missing_count": missing_count,
        "missing_pct": missing_pct,
        "unique_count": unique_count,
        "sample_values": [str(v) for v in non_null.unique()[:5].tolist()],
    }

    if numeric_series is not None and not numeric_series.empty:
        stats.update(
            {
                "min": float(numeric_series.min()),
                "max": float(numeric_series.max()),
                "mean": round(float(numeric_series.mean()), 4),
                "std": round(float(numeric_series.std()) if len(numeric_series) > 1 else 0.0, 4),
            }
        )

    return stats


def detect_schema(df: pd.DataFrame) -> list[dict]:
    row_count = len(df)
    return [_column_stats(col, df[col], row_count) for col in df.columns]


def _target_score(col: dict) -> float:
    if col["inferred_type"] in ("identifier", "datetime"):
        return -1.0

    score = 0.0
    if col["inferred_type"] == "boolean":
        score += 5.0
    elif col["inferred_type"] == "categorical" and 2 <= col["unique_count"] <= 20:
        score += 4.0
    elif col["inferred_type"] == "numeric":
        score += 3.0
    elif col["inferred_type"] == "categorical":
        score += 1.0
    else:  # free text
        score += 0.2

    name_lower = re.sub(r"[^a-z]", "", col["name"].lower())
    if any(hint in name_lower for hint in TARGET_NAME_HINTS):
        score += 3.0

    return score


def suggest_target_and_task(columns: list[dict]) -> dict:
    """Returns {target_column, task_type, time_column} best guesses."""
    datetime_cols = [c for c in columns if c["inferred_type"] == "datetime"]
    time_column = datetime_cols[0]["name"] if datetime_cols else None

    candidates = [c for c in columns if c["inferred_type"] not in ("identifier", "datetime")]
    if not candidates:
        # fall back to the last column, whatever it is
        target_column = columns[-1]["name"] if columns else None
        return {"target_column": target_column, "task_type": "classification", "time_column": time_column}

    # small positional bonus for later columns (common convention: target near the end)
    n = len(candidates)
    scored = [
        (_target_score(c) + (idx / n) * 0.5, c)
        for idx, c in enumerate(candidates)
    ]
    scored.sort(key=lambda pair: pair[0], reverse=True)
    best_col = scored[0][1]

    if time_column and best_col["inferred_type"] == "numeric":
        task_type = "forecasting"
    elif best_col["inferred_type"] in ("boolean", "categorical"):
        task_type = "classification"
    else:
        task_type = "regression"

    return {
        "target_column": best_col["name"],
        "task_type": task_type,
        "time_column": time_column if task_type == "forecasting" else None,
    }
