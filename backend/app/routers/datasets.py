"""Dataset upload, demo listing, and pre-training validation endpoints.

Route handlers below are plain `def`, not `async def` (except upload, which needs
`await file.read()`) — everything they call is synchronous, blocking I/O (pandas,
local disk / Azure Blob, and for training.py's sibling router, the Azure ML SDK).
Under `async def` that blocking work runs directly on the single event loop and
freezes every other in-flight request; FastAPI dispatches plain `def` handlers to
a worker thread instead, which is what actually needs to happen here."""
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool

from app.models.schemas import ValidateDatasetRequest
from app.services import dataset_service
from app.services.health_check import run_health_check
from app.services.rate_limiter import enforce_upload_rate_limit

router = APIRouter(prefix="/api/datasets", tags=["datasets"])


@router.post("/upload", dependencies=[Depends(enforce_upload_rate_limit)])
async def upload_dataset(file: UploadFile = File(...)):
    raw_bytes = await file.read()
    try:
        metadata = await run_in_threadpool(dataset_service.upload_dataset, raw_bytes, file.filename or "upload.csv")
    except dataset_service.DatasetError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return metadata


@router.get("/demo")
def list_demo_datasets():
    return dataset_service.list_demo_datasets()


@router.get("/{dataset_id}")
def get_dataset(dataset_id: str):
    try:
        return dataset_service.get_dataset_metadata(dataset_id)
    except dataset_service.DatasetError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/{dataset_id}/validate")
def validate_dataset(dataset_id: str, body: ValidateDatasetRequest = ValidateDatasetRequest()):
    try:
        metadata = dataset_service.get_dataset_metadata(dataset_id)
        df = dataset_service.get_dataset_dataframe(dataset_id)
    except dataset_service.DatasetError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    target_column = body.target_column or metadata["suggested_target_column"]
    task_type = body.task_type or metadata["suggested_task_type"]

    if target_column and target_column not in df.columns:
        raise HTTPException(status_code=400, detail=f"Column '{target_column}' does not exist in this dataset.")

    report = run_health_check(df, target_column, task_type)
    report["target_column"] = target_column
    report["task_type"] = task_type
    return report
