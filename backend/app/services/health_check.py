"""Pre-training data health check: surfaces problems before an AutoML job is submitted."""
from __future__ import annotations

from typing import Optional

import pandas as pd

Severity = str  # "info" | "warning" | "critical"

_SEVERITY_RANK = {"info": 0, "warning": 1, "critical": 2}


def _check(check_id: str, severity: Severity, title: str, message: str, details: Optional[list] = None) -> dict:
    return {
        "id": check_id,
        "severity": severity,
        "title": title,
        "message": message,
        "details": details or [],
    }


def run_health_check(df: pd.DataFrame, target_column: Optional[str], task_type: Optional[str]) -> dict:
    row_count = len(df)
    checks: list[dict] = []

    # --- dataset size ---
    if row_count == 0:
        checks.append(_check("empty_dataset", "critical", "Empty dataset", "The dataset has no rows."))
    elif row_count < 30:
        checks.append(
            _check(
                "too_few_rows",
                "critical",
                "Very few rows",
                f"Only {row_count} rows found. AutoML needs a reasonable amount of data to train and "
                "validate models reliably (aim for 50+).",
            )
        )

    # --- missing values ---
    missing_details = []
    for col in df.columns:
        missing = int(df[col].isna().sum())
        if missing == 0:
            continue
        pct = round((missing / row_count) * 100, 2) if row_count else 0.0
        missing_details.append({"column": col, "missing_count": missing, "missing_pct": pct})
    if missing_details:
        worst_pct = max(d["missing_pct"] for d in missing_details)
        severity = "critical" if worst_pct > 50 else "warning" if worst_pct > 5 else "info"
        checks.append(
            _check(
                "missing_values",
                severity,
                "Missing values",
                f"{len(missing_details)} column(s) have missing values.",
                sorted(missing_details, key=lambda d: -d["missing_pct"]),
            )
        )

    # --- target column missing values ---
    if target_column and target_column in df.columns:
        target_missing = int(df[target_column].isna().sum())
        if target_missing > 0:
            checks.append(
                _check(
                    "target_missing_values",
                    "critical",
                    "Target column has missing values",
                    f"'{target_column}' is missing {target_missing} value(s) "
                    f"({round(target_missing / row_count * 100, 2)}% of rows). Those rows can't be used for training.",
                )
            )

    # --- duplicate rows ---
    duplicate_count = int(df.duplicated().sum())
    if duplicate_count > 0:
        pct = round((duplicate_count / row_count) * 100, 2) if row_count else 0.0
        checks.append(
            _check(
                "duplicate_rows",
                "warning" if pct > 1 else "info",
                "Duplicate rows",
                f"{duplicate_count} duplicate row(s) found ({pct}% of the dataset).",
            )
        )

    # --- constant columns (zero predictive value) ---
    constant_cols = [col for col in df.columns if df[col].nunique(dropna=True) <= 1]
    if constant_cols:
        checks.append(
            _check(
                "constant_columns",
                "info",
                "Constant columns",
                f"{len(constant_cols)} column(s) have only one distinct value and carry no signal.",
                constant_cols,
            )
        )

    # --- type mismatches: numeric-looking text columns with some unparsable values ---
    mismatch_details = []
    for col in df.columns:
        series = df[col]
        if pd.api.types.is_numeric_dtype(series):
            continue
        non_null = series.dropna()
        if non_null.empty:
            continue
        coerced = pd.to_numeric(non_null, errors="coerce")
        success_rate = coerced.notna().mean()
        if 0.5 <= success_rate < 1.0:
            bad_count = int(coerced.isna().sum())
            mismatch_details.append({"column": col, "unparsable_count": bad_count, "numeric_success_rate": round(success_rate, 3)})
    if mismatch_details:
        checks.append(
            _check(
                "type_mismatches",
                "warning",
                "Inconsistent value types",
                f"{len(mismatch_details)} column(s) look mostly numeric but contain some non-numeric values.",
                mismatch_details,
            )
        )

    # --- class imbalance (classification only) ---
    if task_type == "classification" and target_column and target_column in df.columns:
        counts = df[target_column].dropna().value_counts()
        if len(counts) >= 2:
            majority = int(counts.iloc[0])
            minority = int(counts.iloc[-1])
            ratio = round(minority / majority, 3) if majority else 0
            distribution = [{"class": str(k), "count": int(v)} for k, v in counts.items()]
            if ratio < 0.1:
                severity = "critical"
            elif ratio < 0.34:
                severity = "warning"
            else:
                severity = "info"
            checks.append(
                _check(
                    "class_imbalance",
                    severity,
                    "Class balance",
                    f"Smallest class is {ratio * 100:.1f}% the size of the largest class.",
                    distribution,
                )
            )
        elif len(counts) == 1:
            checks.append(
                _check(
                    "single_class",
                    "critical",
                    "Only one class present",
                    f"'{target_column}' has a single distinct value — there's nothing to learn to distinguish.",
                )
            )

    # --- high-cardinality identifier-like columns ---
    id_like = [col for col in df.columns if col != target_column and df[col].nunique(dropna=True) / max(row_count, 1) > 0.98 and row_count > 20]
    if id_like:
        checks.append(
            _check(
                "identifier_columns",
                "info",
                "Likely identifier columns",
                f"{len(id_like)} column(s) look like unique IDs and probably shouldn't be used as features.",
                id_like,
            )
        )

    overall_status = "healthy"
    if checks:
        worst = max(_SEVERITY_RANK[c["severity"]] for c in checks)
        overall_status = {0: "healthy", 1: "warnings", 2: "critical"}[worst]

    return {
        "overall_status": overall_status,
        "row_count": row_count,
        "column_count": len(df.columns),
        "checks": checks,
    }
