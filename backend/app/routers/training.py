"""AutoML job submission, status/leaderboard, prediction, and results endpoints.

Every handler below is plain `def`, not `async def` — everything they call (Azure
ML SDK, mlflow, onnxruntime) is synchronous, blocking I/O. FastAPI dispatches
plain `def` handlers to a worker thread instead of running them on the event
loop, so a slow call here (e.g. explainability downloading + scoring a model)
doesn't freeze every other concurrent request on the server."""
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import PlainTextResponse

from app.models.schemas import PredictionRequest, SubmitTrainingJobRequest
from app.services import dataset_service, llm_service, training_service
from app.services.aml_client import AzureMLNotConfigured
from app.services.rate_limiter import enforce_training_rate_limit

router = APIRouter(prefix="/api", tags=["training"])


def _run(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except AzureMLNotConfigured as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except dataset_service.DatasetError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except training_service.TrainingError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except llm_service.LLMError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/training/jobs", dependencies=[Depends(enforce_training_rate_limit)])
def submit_training_job(body: SubmitTrainingJobRequest):
    return _run(
        training_service.submit_training_job,
        dataset_id=body.dataset_id,
        task_type=body.task_type,
        target_column=body.target_column,
        time_column=body.time_column,
        forecast_horizon=body.forecast_horizon,
        primary_metric=body.primary_metric,
    )


@router.get("/training/jobs")
def list_jobs(limit: int = 12):
    return _run(training_service.list_recent_jobs, limit)


@router.get("/training/jobs/{job_id}/status")
def get_job_status(job_id: str):
    return _run(training_service.get_job_status, job_id)


@router.get("/training/jobs/{job_id}/leaderboard")
def get_leaderboard(job_id: str):
    return _run(training_service.get_leaderboard, job_id)


@router.get("/training/jobs/{job_id}/summary")
def get_summary(job_id: str):
    return _run(llm_service.get_summary, job_id)


@router.get("/training/jobs/{job_id}/explain")
def get_explanation(job_id: str):
    return _run(training_service.get_explanation, job_id)


@router.post("/predict/{job_id}")
def predict(job_id: str, body: PredictionRequest):
    return _run(training_service.predict, job_id, body.features)


@router.get("/predict/{job_id}/curl")
def get_curl_snippet(job_id: str, request: Request):
    snippet = _run(training_service.get_curl_snippet, job_id, str(request.base_url))
    return PlainTextResponse(snippet)


@router.get("/predict/{job_id}/code")
def get_export_code(job_id: str):
    code = _run(training_service.get_export_code, job_id)
    return PlainTextResponse(code)
