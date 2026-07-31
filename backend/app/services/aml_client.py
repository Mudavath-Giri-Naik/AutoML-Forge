"""Azure ML workspace connection, shared across the training and prediction services."""
from functools import lru_cache

from app.config import get_settings


class AzureMLNotConfigured(Exception):
    """Raised when AZURE_ML_* settings are missing (maps to HTTP 503)."""


@lru_cache
def get_ml_client():
    from azure.ai.ml import MLClient
    from azure.identity import DefaultAzureCredential

    settings = get_settings()
    if not (
        settings.azure_ml_subscription_id
        and settings.azure_ml_resource_group
        and settings.azure_ml_workspace_name
    ):
        raise AzureMLNotConfigured(
            "Azure ML workspace is not configured. Set AZURE_ML_SUBSCRIPTION_ID, "
            "AZURE_ML_RESOURCE_GROUP, and AZURE_ML_WORKSPACE_NAME in backend/.env "
            "(see AZURE_SETUP.md)."
        )

    return MLClient(
        credential=DefaultAzureCredential(),
        subscription_id=settings.azure_ml_subscription_id,
        resource_group_name=settings.azure_ml_resource_group,
        workspace_name=settings.azure_ml_workspace_name,
    )


@lru_cache
def get_mlflow_tracking_uri() -> str:
    ml_client = get_ml_client()
    workspace = ml_client.workspaces.get(ml_client.workspace_name)
    return workspace.mlflow_tracking_uri
