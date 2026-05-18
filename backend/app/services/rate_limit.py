"""Redis-backed counter-window rate limits.

Two layers:
- enforce_request_rate_limit: global per-user requests/minute, raises 429.
- enforce_search_rate_limit: per-user search runs/hour quota, raises 429.

Falls open if Redis is unreachable so a Redis outage doesn't take down the API.
"""
from __future__ import annotations

import time

from fastapi import HTTPException, status
from redis.asyncio import Redis

from app.core.config import get_settings


_client: Redis | None = None


def _redis() -> Redis | None:
    global _client
    if _client is None:
        try:
            _client = Redis.from_url(get_settings().redis_url, decode_responses=True)
        except Exception:
            _client = None
    return _client


async def _incr_window(key: str, window_seconds: int) -> int:
    client = _redis()
    if client is None:
        return 0
    try:
        pipe = client.pipeline()
        pipe.incr(key, 1)
        pipe.expire(key, window_seconds)
        count, _ = await pipe.execute()
        return int(count)
    except Exception:
        return 0


async def enforce_request_rate_limit(user_id: int) -> None:
    settings = get_settings()
    limit = settings.rate_limit_per_minute
    if limit <= 0:
        return
    window = 60
    bucket = int(time.time() // window)
    key = f"rl:req:{user_id}:{bucket}"
    count = await _incr_window(key, window + 5)
    if count and count > limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Rate limit: {limit} requests/minute exceeded. Try again shortly.",
        )


async def enforce_search_rate_limit(user_id: int, limit: int) -> None:
    if limit <= 0:
        return
    window = 60 * 60
    bucket = int(time.time() // window)
    key = f"rl:srun:{user_id}:{bucket}"
    count = await _incr_window(key, window + 30)
    if count and count > limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Search quota: {limit} runs/hour. Wait until the hour resets.",
        )
