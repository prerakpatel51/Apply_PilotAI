"""Standalone compile job.

Runs as a one-shot ECS task. Inputs via env:
  GENERATED_ID   - DB row id to update
  LATEX_KEY      - S3/storage key for .tex source
  PDF_KEY        - S3/storage key to upload .pdf to

Process:
  1. Download .tex from storage.
  2. Run pdflatex in temp dir (no shell escape).
  3. Upload .pdf back to storage.
  4. Update GeneratedResume.compile_status / compile_log / pdf_path.
  5. Exit 0 on success, non-zero on failure.

Locally:
  python -m app.compile_task   (with env vars set)
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.db import GeneratedResume
from app.services import storage


MAX_LOG_BYTES = 8000


def _trim_log(log: str) -> str:
    return log[-MAX_LOG_BYTES:]


def run(generated_id: int, latex_key: str, pdf_key: str) -> int:
    with SessionLocal() as db:
        generated = db.scalar(select(GeneratedResume).where(GeneratedResume.id == generated_id))
        if generated is None:
            print(f"compile_task: GeneratedResume {generated_id} not found", file=sys.stderr)
            return 2

        if shutil.which("pdflatex") is None:
            generated.compile_status = "missing_pdflatex"
            generated.compile_log = "pdflatex is not installed in the compile worker image."
            db.commit()
            return 3

        if not storage.exists(latex_key):
            generated.compile_status = "failed"
            generated.compile_log = f"Source LaTeX key not found: {latex_key}"
            db.commit()
            return 4

        tex_bytes = storage.get_bytes(latex_key)
        with tempfile.TemporaryDirectory(prefix="texc-") as tmp:
            tmp_dir = Path(tmp)
            tex_name = Path(latex_key).name
            local_tex = tmp_dir / tex_name
            local_tex.write_bytes(tex_bytes)
            try:
                result = subprocess.run(
                    ["pdflatex", "-interaction=nonstopmode", "-halt-on-error", "-no-shell-escape", tex_name],
                    cwd=tmp_dir,
                    text=True,
                    capture_output=True,
                    timeout=60,
                    check=False,
                )
            except subprocess.TimeoutExpired as exc:
                generated.compile_status = "failed"
                generated.compile_log = f"pdflatex timed out: {exc}"
                db.commit()
                return 5

            raw_log = ((result.stdout or "") + "\n" + (result.stderr or "")).strip()
            generated.compile_log = _trim_log(raw_log)

            local_pdf = local_tex.with_suffix(".pdf")
            if result.returncode == 0 and local_pdf.exists():
                storage.put_bytes(pdf_key, local_pdf.read_bytes(), content_type="application/pdf")
                generated.compile_status = "compiled"
                generated.pdf_path = pdf_key
                db.commit()
                return 0

            generated.compile_status = "failed"
            db.commit()
            return 1


def main() -> int:
    try:
        gen_id = int(os.environ["GENERATED_ID"])
        latex_key = os.environ["LATEX_KEY"]
        pdf_key = os.environ["PDF_KEY"]
    except (KeyError, ValueError) as exc:
        print(f"compile_task: missing env var {exc}", file=sys.stderr)
        return 64
    return run(gen_id, latex_key, pdf_key)


if __name__ == "__main__":
    sys.exit(main())
