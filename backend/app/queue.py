"""Arq-backed Redis job queue.

Used by the FastAPI app to enqueue work and by the admin endpoints to inspect
queue depth. The worker process is defined in app.worker.
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any

from arq import create_pool
from arq.connections import ArqRedis, RedisSettings

from app.core.config import get_settings
from app.core.security import encrypt_text


def _redis_settings() -> RedisSettings:
    return RedisSettings.from_dsn(get_settings().redis_url)


_pool: ArqRedis | None = None


async def get_pool() -> ArqRedis:
    global _pool
    if _pool is None:
        _pool = await create_pool(_redis_settings())
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.aclose()
        _pool = None


@asynccontextmanager
async def pool_lifespan() -> Any:
    pool = await get_pool()
    try:
        yield pool
    finally:
        await close_pool()


async def enqueue_search_run(run_id: int, api_key: str) -> str | None:
    """Enqueue a new pipeline job. We deliberately do NOT pin a deterministic
    `_job_id` here — duplicate-suppression is already enforced at the DB layer
    (one in-flight SearchRun per user). Using a stable job id would cause arq to
    treat stale results as fresh and skip the actual work on DB resets."""
    pool = await get_pool()
    job = await pool.enqueue_job("run_search_pipeline", run_id, encrypt_text(api_key))
    return job.job_id if job else None
