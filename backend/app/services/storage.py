"""
Storage abstraction so the rest of the app doesn't care whether datasets
live on local disk (dev, no Azure resources needed yet) or in Azure Blob
Storage (production). Selected via STORAGE_BACKEND env var.
"""
from __future__ import annotations

import json
from abc import ABC, abstractmethod
from functools import lru_cache
from pathlib import Path

from app.config import get_settings


class DatasetStorage(ABC):
    """Key-value-ish blob storage keyed by a relative path, e.g. 'datasets/<id>/data.csv'."""

    @abstractmethod
    def save_bytes(self, path: str, data: bytes) -> None: ...

    @abstractmethod
    def load_bytes(self, path: str) -> bytes: ...

    @abstractmethod
    def exists(self, path: str) -> bool: ...

    def save_json(self, path: str, obj: dict) -> None:
        self.save_bytes(path, json.dumps(obj, indent=2).encode("utf-8"))

    def load_json(self, path: str) -> dict:
        return json.loads(self.load_bytes(path).decode("utf-8"))


class LocalDatasetStorage(DatasetStorage):
    """Filesystem-backed storage for local development, no Azure account required."""

    def __init__(self, root_dir: str):
        self.root = Path(root_dir)
        self.root.mkdir(parents=True, exist_ok=True)

    def _resolve(self, path: str) -> Path:
        full = (self.root / path).resolve()
        if self.root.resolve() not in full.parents and full != self.root.resolve():
            raise ValueError(f"Path escapes storage root: {path}")
        return full

    def save_bytes(self, path: str, data: bytes) -> None:
        full = self._resolve(path)
        full.parent.mkdir(parents=True, exist_ok=True)
        full.write_bytes(data)

    def load_bytes(self, path: str) -> bytes:
        full = self._resolve(path)
        if not full.exists():
            raise FileNotFoundError(path)
        return full.read_bytes()

    def exists(self, path: str) -> bool:
        return self._resolve(path).exists()


class AzureBlobDatasetStorage(DatasetStorage):
    """Azure Blob Storage-backed storage for production."""

    def __init__(self, connection_string: str | None, account_url: str | None, container: str):
        from azure.storage.blob import BlobServiceClient

        if connection_string:
            self._client = BlobServiceClient.from_connection_string(connection_string)
        elif account_url:
            from azure.identity import DefaultAzureCredential

            self._client = BlobServiceClient(account_url=account_url, credential=DefaultAzureCredential())
        else:
            raise ValueError(
                "Azure storage backend requires AZURE_STORAGE_CONNECTION_STRING or AZURE_STORAGE_ACCOUNT_URL"
            )

        self._container_name = container
        container_client = self._client.get_container_client(container)
        if not container_client.exists():
            container_client.create_container()
        self._container = container_client

    def save_bytes(self, path: str, data: bytes) -> None:
        self._container.upload_blob(name=path, data=data, overwrite=True)

    def load_bytes(self, path: str) -> bytes:
        try:
            return self._container.download_blob(path).readall()
        except Exception as exc:  # azure.core.exceptions.ResourceNotFoundError
            raise FileNotFoundError(path) from exc

    def exists(self, path: str) -> bool:
        return self._container.get_blob_client(path).exists()


@lru_cache
def get_storage() -> DatasetStorage:
    settings = get_settings()
    if settings.storage_backend == "azure":
        return AzureBlobDatasetStorage(
            connection_string=settings.azure_storage_connection_string,
            account_url=settings.azure_storage_account_url,
            container=settings.azure_blob_container,
        )
    return LocalDatasetStorage(settings.local_storage_dir)
