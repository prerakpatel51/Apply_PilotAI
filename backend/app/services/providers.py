from dataclasses import dataclass
from typing import Any

from anthropic import Anthropic
from openai import OpenAI

from app.services.json_utils import extract_json_object


class ProviderError(RuntimeError):
    pass


@dataclass(frozen=True)
class LLMProviderConfig:
    provider: str
    api_key: str
    model: str
    base_url: str | None = None


TASK_MODEL_KEYS = (
    "resume_extraction",
    "resume_alignment",
    "keyword_generation",
    "job_search",
    "ranking",
)


class BaseLLMProvider:
    def __init__(self, config: LLMProviderConfig) -> None:
        self.config = config
        self.prompt_tokens = 0
        self.completion_tokens = 0
        self.total_tokens = 0

    def generate_json(self, system: str, prompt: str) -> dict[str, Any]:
        raise NotImplementedError

    def generate_text(self, system: str, prompt: str) -> str:
        raise NotImplementedError

    def web_search_json(self, system: str, prompt: str) -> dict[str, Any]:
        raise NotImplementedError

    def _add_usage(self, prompt_tokens: int = 0, completion_tokens: int = 0, total_tokens: int = 0) -> None:
        self.prompt_tokens += prompt_tokens
        self.completion_tokens += completion_tokens
        self.total_tokens += total_tokens or prompt_tokens + completion_tokens


class OpenAIProvider(BaseLLMProvider):
    def __init__(self, config: LLMProviderConfig) -> None:
        super().__init__(config)
        self.client = OpenAI(api_key=config.api_key, timeout=90.0)

    def generate_json(self, system: str, prompt: str) -> dict[str, Any]:
        response = self.client.responses.create(
            model=self.config.model,
            instructions=system,
            input=prompt,
        )
        self._add_usage(**_openai_usage(response))
        return extract_json_object(_openai_response_text(response))

    def generate_text(self, system: str, prompt: str) -> str:
        response = self.client.responses.create(
            model=self.config.model,
            instructions=system,
            input=prompt,
        )
        self._add_usage(**_openai_usage(response))
        return _openai_response_text(response).strip()

    def web_search_json(self, system: str, prompt: str) -> dict[str, Any]:
        response = self.client.responses.create(
            model=self.config.model,
            instructions=system,
            input=prompt,
            tools=[{"type": "web_search"}],
            tool_choice="required",
        )
        self._add_usage(**_openai_usage(response))
        return extract_json_object(_openai_response_text(response))


class AnthropicProvider(BaseLLMProvider):
    def __init__(self, config: LLMProviderConfig) -> None:
        super().__init__(config)
        self.client = Anthropic(api_key=config.api_key, timeout=90.0)

    def generate_json(self, system: str, prompt: str) -> dict[str, Any]:
        message = self.client.messages.create(
            model=self.config.model,
            max_tokens=4096,
            system=system,
            messages=[{"role": "user", "content": prompt}],
        )
        self._add_usage(**_anthropic_usage(message))
        return extract_json_object(_anthropic_message_text(message))

    def generate_text(self, system: str, prompt: str) -> str:
        message = self.client.messages.create(
            model=self.config.model,
            max_tokens=8192,
            system=system,
            messages=[{"role": "user", "content": prompt}],
        )
        self._add_usage(**_anthropic_usage(message))
        return _anthropic_message_text(message).strip()

    def web_search_json(self, system: str, prompt: str) -> dict[str, Any]:
        message = self.client.messages.create(
            model=self.config.model,
            max_tokens=8192,
            system=system,
            messages=[{"role": "user", "content": prompt}],
            tools=[{"type": "web_search_20250305", "name": "web_search", "max_uses": 8}],
        )
        self._add_usage(**_anthropic_usage(message))
        return extract_json_object(_anthropic_message_text(message))


def make_provider(config: LLMProviderConfig) -> BaseLLMProvider:
    if config.provider == "openai":
        return OpenAIProvider(config)
    if config.provider == "anthropic":
        return AnthropicProvider(config)
    raise ProviderError(
        f"Unsupported provider: {config.provider}. Supported providers are 'openai' and 'anthropic'."
    )


def _openai_response_text(response: Any) -> str:
    output_text = getattr(response, "output_text", None)
    if output_text:
        return str(output_text)

    pieces: list[str] = []
    for item in getattr(response, "output", []) or []:
        for content in getattr(item, "content", []) or []:
            text = getattr(content, "text", None)
            if text:
                pieces.append(str(text))
    if pieces:
        return "\n".join(pieces)
    raise ProviderError("OpenAI response did not include text output.")


def _anthropic_message_text(message: Any) -> str:
    pieces: list[str] = []
    for block in getattr(message, "content", []) or []:
        if getattr(block, "type", None) == "text":
            pieces.append(str(getattr(block, "text", "")))
        elif isinstance(block, dict) and block.get("type") == "text":
            pieces.append(str(block.get("text", "")))
    if pieces:
        return "\n".join(pieces)
    raise ProviderError("Anthropic response did not include text output.")


def _openai_usage(response: Any) -> dict[str, int]:
    usage = getattr(response, "usage", None)
    if usage is None:
        return {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
    prompt_tokens = int(getattr(usage, "input_tokens", 0) or getattr(usage, "prompt_tokens", 0) or 0)
    completion_tokens = int(getattr(usage, "output_tokens", 0) or getattr(usage, "completion_tokens", 0) or 0)
    total_tokens = int(getattr(usage, "total_tokens", 0) or prompt_tokens + completion_tokens)
    return {
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "total_tokens": total_tokens,
    }


def _anthropic_usage(message: Any) -> dict[str, int]:
    usage = getattr(message, "usage", None)
    if usage is None:
        return {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
    prompt_tokens = int(getattr(usage, "input_tokens", 0) or 0)
    completion_tokens = int(getattr(usage, "output_tokens", 0) or 0)
    total_tokens = prompt_tokens + completion_tokens
    return {
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "total_tokens": total_tokens,
    }
