import json
from typing import Any


def _snippet(text: str, limit: int = 400) -> str:
    s = (text or "").strip().replace("\n", " ")
    return s if len(s) <= limit else s[:limit] + "…"


def extract_json_object(text: str) -> dict[str, Any]:
    cleaned = (text or "").strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.startswith("json"):
            cleaned = cleaned[4:].strip()
    try:
        value = json.loads(cleaned)
        if isinstance(value, dict):
            return value
    except json.JSONDecodeError:
        pass

    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError(
            f"The model response did not contain a JSON object. Response head: {_snippet(text)}"
        )

    try:
        value = json.loads(cleaned[start : end + 1])
    except json.JSONDecodeError as exc:
        raise ValueError(
            f"The model response had unparseable JSON ({exc.msg}). Response head: {_snippet(text)}"
        ) from exc
    if not isinstance(value, dict):
        raise ValueError(
            f"The model response JSON must be an object. Response head: {_snippet(text)}"
        )
    return value


def try_extract_json_object(text: str) -> dict[str, Any] | None:
    try:
        return extract_json_object(text)
    except ValueError:
        return None


def dumps_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def loads_json(value: str, fallback: Any) -> Any:
    try:
        return json.loads(value)
    except (TypeError, json.JSONDecodeError):
        return fallback
