"""
Per-IP rate limiting for abuse-prone endpoints (dataset upload, training job
submission) — the app is public and anonymous, so this is the only real
defense against someone spamming uploads or burning through Azure ML spend.

In-memory sliding window, consistent with the rest of the app's "no
database" design. Trade-off: resets whenever the Container App scales to
zero. Acceptable for a demo-scale portfolio project (see PRD §7.5); revisit
with a shared store (e.g. Redis) if this ever needs to hold under real
adversarial load.
"""
from __future__ import annotations

import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

from app.config import get_settings


class RateLimiter:
    def __init__(self, max_requests: int, window_seconds: int = 3600):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._hits: dict[str, deque] = defaultdict(deque)

    def check(self, key: str) -> None:
        now = time.time()
        hits = self._hits[key]
        while hits and now - hits[0] > self.window_seconds:
            hits.popleft()
        if len(hits) >= self.max_requests:
            raise HTTPException(
                status_code=429,
                detail=f"Rate limit exceeded: max {self.max_requests} requests per hour from this IP. Try again later.",
            )
        hits.append(now)


def _client_ip(request: Request) -> str:
    # Azure Container Apps terminates TLS at a reverse proxy; the real client
    # IP shows up in X-Forwarded-For, not request.client.
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


_upload_limiter: RateLimiter | None = None
_training_limiter: RateLimiter | None = None


def enforce_upload_rate_limit(request: Request) -> None:
    global _upload_limiter
    if _upload_limiter is None:
        _upload_limiter = RateLimiter(get_settings().rate_limit_uploads_per_hour)
    _upload_limiter.check(_client_ip(request))


def enforce_training_rate_limit(request: Request) -> None:
    global _training_limiter
    if _training_limiter is None:
        _training_limiter = RateLimiter(get_settings().rate_limit_training_jobs_per_hour)
    _training_limiter.check(_client_ip(request))
