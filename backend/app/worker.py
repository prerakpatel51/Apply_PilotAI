"""Arq worker entry point.

Run with:  arq app.worker.WorkerSettings
"""
from __future__ import annotations

import asyncio
from typing import Any

from arq.connections import RedisSettings

from app.core.config import get_settings
from app.core.security import decrypt_text
from app.db.init_db import init_db
from app.services.agents import run_job_search_pipeline


async def run_search_pipeline(ctx: dict[str, Any], run_id: int, encrypted_api_key: str) -> dict[str, Any]:
    """Run a single search pipeline. Blocking SQLAlchemy + LLM calls run in a thread
    so they do not stall the worker event loop."""
    await asyncio.to_thread(run_job_search_pipeline, run_id, decrypt_text(encrypted_api_key))
    return {"run_id": run_id, "ok": True}


async def startup(ctx: dict[str, Any]) -> None:
    # Ensure tables exist when the worker boots first.
    init_db()


async def shutdown(ctx: dict[str, Any]) -> None:
    pass


class WorkerSettings:
    functions = [run_search_pipeline]
    on_startup = startup
    on_shutdown = shutdown
    redis_settings = RedisSettings.from_dsn(get_settings().redis_url)
    max_jobs = 4
    job_timeout = 60 * 15  # 15 min per run
    keep_result = 60 * 60 * 24
    max_tries = 3
    queue_name = get_settings().queue_name
