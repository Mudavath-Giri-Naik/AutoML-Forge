"""Pydantic request/response models for the datasets and training APIs."""
from typing import Literal, Optional

from pydantic import BaseModel


class ValidateDatasetRequest(BaseModel):
    target_column: Optional[str] = None
    task_type: Optional[Literal["classification", "regression", "forecasting"]] = None


class SubmitTrainingJobRequest(BaseModel):
    dataset_id: str
    task_type: Literal["classification", "regression", "forecasting"]
    target_column: str
    time_column: Optional[str] = None
    forecast_horizon: Optional[int] = None
    primary_metric: Optional[str] = None


class PredictionRequest(BaseModel):
    features: dict
