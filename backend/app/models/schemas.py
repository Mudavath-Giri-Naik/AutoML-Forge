"""Pydantic request/response models for the datasets API."""
from typing import Literal, Optional

from pydantic import BaseModel


class ValidateDatasetRequest(BaseModel):
    target_column: Optional[str] = None
    task_type: Optional[Literal["classification", "regression", "forecasting"]] = None
