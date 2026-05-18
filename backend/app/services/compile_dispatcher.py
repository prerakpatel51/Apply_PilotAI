"""Dispatch compile jobs to an ephemeral ECS Fargate task.

Local dev (COMPILE_DISPATCH=local): run inline via subprocess.
Prod (COMPILE_DISPATCH=ecs): call ecs.run_task on the compile task def.

Required env in prod:
  ECS_CLUSTER
  ECS_COMPILE_TASK_DEF        e.g. apply-pilot-compile:7  (or family name)
  ECS_COMPILE_SUBNETS         comma-separated subnet ids
  ECS_COMPILE_SECURITY_GROUPS comma-separated SG ids
  ECS_COMPILE_ASSIGN_PUBLIC_IP  "ENABLED" or "DISABLED"   default ENABLED
  ECS_COMPILE_CONTAINER_NAME  default "compile"
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path


def dispatch_compile(generated_id: int, latex_key: str, pdf_key: str) -> dict:
    """Returns a dict with status info. Does not block on completion in ecs mode."""
    mode = (os.getenv("COMPILE_DISPATCH") or "local").lower()
    if mode == "ecs":
        return _run_ecs(generated_id, latex_key, pdf_key)
    return _run_local(generated_id, latex_key, pdf_key)


def _run_local(generated_id: int, latex_key: str, pdf_key: str) -> dict:
    env = os.environ.copy()
    env.update({
        "GENERATED_ID": str(generated_id),
        "LATEX_KEY": latex_key,
        "PDF_KEY": pdf_key,
    })
    python = sys.executable or shutil.which("python") or "python3"
    proc = subprocess.run(
        [python, "-m", "app.compile_task"],
        env=env,
        cwd=str(Path(__file__).resolve().parents[2]),
        text=True,
        capture_output=True,
        timeout=120,
        check=False,
    )
    return {
        "mode": "local",
        "returncode": proc.returncode,
        "stdout": (proc.stdout or "")[-2000:],
        "stderr": (proc.stderr or "")[-2000:],
    }


def _run_ecs(generated_id: int, latex_key: str, pdf_key: str) -> dict:
    import boto3
    cluster = os.environ["ECS_CLUSTER"]
    task_def = os.environ["ECS_COMPILE_TASK_DEF"]
    subnets = [s.strip() for s in os.environ["ECS_COMPILE_SUBNETS"].split(",") if s.strip()]
    sgs = [s.strip() for s in os.environ["ECS_COMPILE_SECURITY_GROUPS"].split(",") if s.strip()]
    assign_ip = os.getenv("ECS_COMPILE_ASSIGN_PUBLIC_IP", "ENABLED").upper()
    container = os.getenv("ECS_COMPILE_CONTAINER_NAME", "compile")

    client = boto3.client("ecs", region_name=os.getenv("AWS_REGION") or os.getenv("S3_REGION"))
    resp = client.run_task(
        cluster=cluster,
        launchType="FARGATE",
        taskDefinition=task_def,
        count=1,
        networkConfiguration={
            "awsvpcConfiguration": {
                "subnets": subnets,
                "securityGroups": sgs,
                "assignPublicIp": assign_ip,
            }
        },
        overrides={
            "containerOverrides": [
                {
                    "name": container,
                    "environment": [
                        {"name": "GENERATED_ID", "value": str(generated_id)},
                        {"name": "LATEX_KEY", "value": latex_key},
                        {"name": "PDF_KEY", "value": pdf_key},
                    ],
                }
            ]
        },
    )
    failures = resp.get("failures") or []
    tasks = resp.get("tasks") or []
    return {
        "mode": "ecs",
        "task_arn": (tasks[0].get("taskArn") if tasks else None),
        "failures": failures,
    }
