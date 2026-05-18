"""Pluggable storage backend.

Local mode writes to settings.storage_dir.
S3 mode writes to s3://settings.s3_bucket/<prefix>/<key>.

Public API uses string keys (forward-slash relative paths). Callers must
NOT assume on-disk paths exist in S3 mode. Use materialize() to fetch a
file to a local temp path for tools (e.g., pdflatex) that need real files,
then upload via put_bytes() with the resulting bytes.
"""
from __future__ import annotations

from pathlib import Path
import os
import shutil
import tempfile
from contextlib import contextmanager
from typing import Iterator

from app.core.config import get_settings


def _join_key(key: str) -> str:
    prefix = (get_settings().s3_prefix or "").strip("/")
    norm = key.replace("\\", "/").lstrip("/")
    return f"{prefix}/{norm}" if prefix else norm


def _s3_client():
    import boto3
    settings = get_settings()
    return boto3.client("s3", region_name=settings.s3_region)


def _backend() -> str:
    return get_settings().storage_backend


def _local_path(key: str) -> Path:
    base = Path(get_settings().storage_dir)
    return base / key.replace("\\", "/")


def put_bytes(key: str, data: bytes, content_type: str | None = None) -> None:
    if _backend() == "s3":
        kwargs = {"Bucket": get_settings().s3_bucket, "Key": _join_key(key), "Body": data}
        if content_type:
            kwargs["ContentType"] = content_type
        _s3_client().put_object(**kwargs)
        return
    path = _local_path(key)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


def put_text(key: str, text: str, content_type: str = "text/plain") -> None:
    put_bytes(key, text.encode("utf-8"), content_type)


def get_bytes(key: str) -> bytes:
    if _backend() == "s3":
        obj = _s3_client().get_object(Bucket=get_settings().s3_bucket, Key=_join_key(key))
        return obj["Body"].read()
    return _local_path(key).read_bytes()


def get_text(key: str) -> str:
    return get_bytes(key).decode("utf-8")


def exists(key: str) -> bool:
    if _backend() == "s3":
        try:
            _s3_client().head_object(Bucket=get_settings().s3_bucket, Key=_join_key(key))
            return True
        except Exception:
            return False
    return _local_path(key).exists()


def delete(key: str) -> None:
    if _backend() == "s3":
        try:
            _s3_client().delete_object(Bucket=get_settings().s3_bucket, Key=_join_key(key))
        except Exception:
            pass
        return
    path = _local_path(key)
    try:
        if path.exists():
            path.unlink()
    except OSError:
        pass


def size_bytes(key: str) -> int:
    if _backend() == "s3":
        try:
            obj = _s3_client().head_object(Bucket=get_settings().s3_bucket, Key=_join_key(key))
            return int(obj.get("ContentLength", 0))
        except Exception:
            return 0
    p = _local_path(key)
    return p.stat().st_size if p.exists() else 0


@contextmanager
def materialize(key: str) -> Iterator[Path]:
    """Yield a local Path containing the object's bytes.

    For local backend, returns the actual on-disk path.
    For S3, downloads to a temp dir which is cleaned up on exit.
    """
    if _backend() != "s3":
        yield _local_path(key)
        return
    tmp = Path(tempfile.mkdtemp(prefix="storage-"))
    try:
        target = tmp / Path(key).name
        target.write_bytes(get_bytes(key))
        yield target
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


@contextmanager
def workspace(keys_in: list[str]) -> Iterator[Path]:
    """Yield a temp dir with the given keys materialized as files.

    Returns a directory path; each input key is downloaded to dir/<basename>.
    Files in the directory after the block are NOT auto-uploaded — caller
    must upload via put_bytes(). The dir is cleaned up on exit.
    """
    tmp = Path(tempfile.mkdtemp(prefix="storage-ws-"))
    try:
        for key in keys_in:
            data = get_bytes(key)
            (tmp / Path(key).name).write_bytes(data)
        yield tmp
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def presigned_url(key: str, expires: int = 300) -> str | None:
    if _backend() != "s3":
        return None
    return _s3_client().generate_presigned_url(
        "get_object",
        Params={"Bucket": get_settings().s3_bucket, "Key": _join_key(key)},
        ExpiresIn=expires,
    )
