"""Central app configuration, populated from environment variables (.env in dev)."""
from functools import lru_cache
from typing import Literal, Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # --- Storage backend ---
    # "local": stores under LOCAL_STORAGE_DIR on disk (used for local dev / no Azure resources yet)
    # "azure": stores in Azure Blob Storage (used in production)
    storage_backend: Literal["local", "azure"] = "local"
    local_storage_dir: str = "./storage_data"

    azure_storage_connection_string: Optional[str] = None
    azure_storage_account_url: Optional[str] = None  # used with DefaultAzureCredential instead of a connection string
    azure_blob_container: str = "datasets"

    # --- Upload guardrails ---
    max_upload_size_mb: int = 10

    # --- Azure ML workspace (required for /api/training and /api/predict) ---
    azure_ml_subscription_id: Optional[str] = None
    azure_ml_resource_group: Optional[str] = None
    azure_ml_workspace_name: Optional[str] = None

    # --- AutoML job limits (cost/time guardrails) ---
    training_job_timeout_minutes: int = 15
    training_trial_timeout_minutes: int = 5
    training_max_trials: int = 20
    training_serverless_instance_type: str = "Standard_DS3_v2"

    # --- Plain-English summary (required for /api/training/jobs/{id}/summary) ---
    gemini_api_key: Optional[str] = None
    gemini_model: str = "gemini-2.5-flash"

    # --- CORS ---
    cors_origins: str = "http://localhost:5173"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
