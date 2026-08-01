"""
Plain-English training summary via Gemini — the only place an LLM is used in
this app, and only for narration. Predictions never touch an LLM.

Uses the raw REST API via urllib instead of the google-genai SDK: it's one
POST call, and after Phase 2's dependency saga we're not adding an SDK for
that when the standard library already does the job.
"""
from __future__ import annotations

import json
import urllib.error
import urllib.request
from functools import lru_cache

from app.config import get_settings
from app.services import training_service

GEMINI_URL_TEMPLATE = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


class LLMError(Exception):
    """User-facing summary-generation error (maps to HTTP 503/502)."""


def _call_gemini(prompt: str) -> str:
    settings = get_settings()
    if not settings.gemini_api_key:
        raise LLMError(
            "Gemini API key is not configured. Set GEMINI_API_KEY in backend/.env "
            "(free key: https://aistudio.google.com/apikey)."
        )

    url = f"{GEMINI_URL_TEMPLATE.format(model=settings.gemini_model)}?key={settings.gemini_api_key}"
    payload = json.dumps(
        {
            "contents": [{"parts": [{"text": prompt}]}],
            # Generous headroom: newer "thinking" Gemini models spend a chunk of
            # maxOutputTokens on internal reasoning before the visible answer —
            # too low a budget here silently truncates the actual summary.
            "generationConfig": {"temperature": 0.4, "maxOutputTokens": 2048},
        }
    ).encode("utf-8")
    request = urllib.request.Request(
        url, data=payload, headers={"Content-Type": "application/json"}, method="POST"
    )

    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            data = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise LLMError(f"Gemini API error ({exc.code}): {body}") from exc
    except urllib.error.URLError as exc:
        raise LLMError(f"Could not reach Gemini API: {exc.reason}") from exc

    try:
        return data["candidates"][0]["content"]["parts"][0]["text"].strip()
    except (KeyError, IndexError) as exc:
        raise LLMError(f"Unexpected Gemini API response shape: {data}") from exc


def _build_prompt(status_info: dict, leaderboard: dict, explanation: dict) -> str:
    top_models = [m for m in leaderboard["models"][:5] if m["primary_metric_value"] is not None]
    model_lines = "\n".join(
        f"- {m['algorithm']}: {leaderboard['primary_metric']} = {m['primary_metric_value']:.4f}"
        for m in top_models
    )
    top_features = explanation.get("importances", [])[:5]
    feature_lines = "\n".join(f"- {f['feature']} ({f['importance'] * 100:.0f}%)" for f in top_features)

    return (
        "You are explaining the result of an automated machine learning run to a "
        "non-technical user.\n"
        f"Task: {status_info['task_type']}. Target column: '{status_info['target_column']}'. "
        f"Primary metric: {leaderboard['primary_metric']}.\n\n"
        f"Top models tried, best first:\n{model_lines}\n\n"
        f"Most influential input columns:\n{feature_lines}\n\n"
        "Write a short (3-5 sentence) plain-English summary of what happened and which "
        "inputs mattered most for the prediction. No jargon, no bullet points, no markdown "
        "formatting — just plain prose a beginner would understand."
    )


@lru_cache(maxsize=20)
def get_summary(job_id: str) -> dict:
    status_info = training_service.get_job_status(job_id)
    if status_info["status"] != "completed":
        return {"job_id": job_id, "status": status_info["status"], "summary": None}

    leaderboard = training_service.get_leaderboard(job_id)
    explanation = training_service.get_explanation(job_id)
    prompt = _build_prompt(status_info, leaderboard, explanation)
    summary = _call_gemini(prompt)

    return {"job_id": job_id, "status": "completed", "summary": summary}
