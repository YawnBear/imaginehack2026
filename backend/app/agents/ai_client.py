"""Dependency-free LLM client for the hybrid AI layer.

The deterministic rule engine remains the source of truth. This module only
rewrites the per-agent *analysis text* by calling an external LLM (GrafiLab,
OpenAI-compatible). It uses the stdlib (``urllib.request``) only — no new pip
dependencies — and is engineered to NEVER raise to the caller: on any failure
(missing/placeholder key, timeout, non-200, unparseable body) it returns
``None`` so governance falls back to the deterministic template text.

GrafiLab request shape
----------------------
No authoritative GrafiLab API docs were reachable at build time, so this
implements the OpenAI-compatible Chat Completions contract:

    POST {base}chat/completions
    Authorization: Bearer <key>
    body: {"model": <ai_model>, "messages": [...], "temperature": ...,
           "max_tokens": <cap>}
    parse: choices[0].message.content

The base URL, path and model are configurable via env (``AI_PROVIDER_BASE_URL``,
``AI_MODEL``) so they can be corrected at deploy time without code changes.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any

from app.core.config import get_settings

# Path appended to the configured base URL. Kept here (not a setting) because
# the base URL already includes the ``/api/`` segment; this is the standard
# OpenAI-compatible suffix.
_COMPLETIONS_PATH = "chat/completions"

# Hard cap so a misbehaving model can't run up cost or latency.
_MAX_TOKENS = 600
_TIMEOUT_SECONDS = 8
_SUMMARY_MAX_TOKENS = 320


def generate_agent_analysis(finding: Any, base_recommendation: Any, agents: list | None = None) -> dict | None:
    """Return a dict of per-agent analysis text, or ``None`` on any failure.

    AI rewrites only the analysis *text*. The deterministic numbers
    (savings/carbon/risk/required reviewers) come from the rules and are never
    touched here. Never raises.
    """
    settings = get_settings()
    if not settings.ai_enabled:
        return None

    try:
        base_url = settings.ai_provider_base_url
        if not base_url.endswith("/"):
            base_url += "/"
        url = base_url + _COMPLETIONS_PATH

        agents = agents or []
        if not agents:
            return None
        prompt = build_prompt(finding, base_recommendation, agents)
        body = json.dumps(
            {
                "model": settings.ai_model,
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            "You are a cloud governance assistant for a "
                            "construction-tech company. You write short, "
                            "practical, construction-aware analysis for human "
                            "reviewers. You never invent numbers and you never "
                            "tell anyone to auto-execute changes. Respond with "
                            "a single JSON object only."
                        ),
                    },
                    {"role": "user", "content": prompt},
                ],
                "temperature": 0.4,
                "max_tokens": _MAX_TOKENS,
            }
        ).encode("utf-8")

        request = urllib.request.Request(
            url,
            data=body,
            method="POST",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {settings.ai_provider_api_key}",
            },
        )

        with urllib.request.urlopen(request, timeout=_TIMEOUT_SECONDS) as response:
            if response.status != 200:
                return None
            raw = response.read().decode("utf-8")
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError, ValueError):
        # Never log the key or raw secrets. Swallow and fall back.
        return None
    except Exception:  # noqa: BLE001 - defensive: AI is purely additive
        return None

    allowed = {getattr(a, "output_key", "") for a in agents}
    return parse_response(raw, allowed)


def build_prompt(finding, base_recommendation, agents) -> str:
    issue_type = getattr(finding, "issue_type", "unknown")
    severity = getattr(finding, "severity", "unknown")
    evidence = getattr(finding, "evidence", {}) or {}
    recommended_action = getattr(base_recommendation, "recommended_action", "")
    try:
        evidence_text = json.dumps(evidence, default=str)
    except (TypeError, ValueError):
        evidence_text = str(evidence)

    blocks, keys = [], []
    for agent in agents:
        key = getattr(agent, "output_key", "")
        keys.append(key)
        blocks.append(f'- "{key}": {getattr(agent, "system_prompt", "")}')
    instructions = "\n".join(blocks)

    return (
        "A deterministic rule engine detected a cloud governance issue.\n"
        f"issue_type: {issue_type}\nseverity: {severity}\n"
        f"evidence: {evidence_text}\n"
        f"deterministic_recommended_action: {recommended_action}\n\n"
        "Produce a JSON object. For each agent key below, write one or two plain-English "
        "sentences following that agent's instruction:\n"
        f"{instructions}\n\n"
        f"Return ONLY a JSON object whose keys are exactly: {keys}. "
        "Do NOT invent dollar amounts or carbon figures (those are provided separately). "
        'Example: {"security": "..."}'
    )


def parse_response(raw: str, allowed_keys: set) -> dict | None:
    """Robustly extract the per-agent dict, clamped to allowed_keys."""
    try:
        envelope = json.loads(raw)
    except (TypeError, ValueError):
        return None
    content = _extract_content(envelope)
    if not content:
        return None
    parsed = _loads_json_object(content)
    if not isinstance(parsed, dict) or not parsed:
        return None
    cleaned: dict[str, str] = {}
    for key, value in parsed.items():
        agent_key = str(key).strip()
        if agent_key not in allowed_keys:
            continue
        if isinstance(value, (list, tuple)):
            text = " ".join(str(item).strip() for item in value if str(item).strip())
        else:
            text = str(value).strip()
        if text:
            cleaned[agent_key] = text
    return cleaned or None


def _extract_content(envelope: Any) -> str | None:
    if not isinstance(envelope, dict):
        return None
    choices = envelope.get("choices")
    if not isinstance(choices, list) or not choices:
        return None
    first = choices[0]
    if not isinstance(first, dict):
        return None
    message = first.get("message")
    if isinstance(message, dict):
        content = message.get("content")
        if isinstance(content, str):
            return content
    # Some OpenAI-compatible servers put text on the choice directly.
    text = first.get("text")
    if isinstance(text, str):
        return text
    return None


def _loads_json_object(content: str) -> Any:
    """Parse a JSON object out of model content, tolerating prose/fences."""
    text = content.strip()
    # Strip ```json ... ``` style fences if present.
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
        text = text.strip()
    try:
        return json.loads(text)
    except (TypeError, ValueError):
        pass
    # Last resort: grab the outermost {...} span.
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(text[start : end + 1])
        except (TypeError, ValueError):
            return None
    return None


def generate_workflow_summary(finding: Any, agent_outputs: dict) -> str | None:
    """Merge per-agent analyses into ONE cohesive paragraph. None on any failure. Never raises."""
    settings = get_settings()
    if not settings.ai_enabled:
        return None
    outputs = {k: str(v).strip() for k, v in (agent_outputs or {}).items() if str(v).strip()}
    if not outputs:
        return None
    try:
        base_url = settings.ai_provider_base_url
        if not base_url.endswith("/"):
            base_url += "/"
        url = base_url + _COMPLETIONS_PATH
        body = json.dumps(
            {
                "model": settings.ai_model,
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            "You are a cloud governance assistant for a construction-tech company. "
                            "You merge several specialist analyses of ONE finding into a single short "
                            "paragraph for a human reviewer. Synthesize, do not just list. Reference "
                            "only what the analyses say. Never invent dollar or carbon numbers, and "
                            "never tell anyone to auto-execute a change. Respond with plain text only."
                        ),
                    },
                    {"role": "user", "content": build_summary_prompt(finding, outputs)},
                ],
                "temperature": 0.4,
                "max_tokens": _SUMMARY_MAX_TOKENS,
            }
        ).encode("utf-8")
        request = urllib.request.Request(
            url,
            data=body,
            method="POST",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {settings.ai_provider_api_key}",
            },
        )
        with urllib.request.urlopen(request, timeout=_TIMEOUT_SECONDS) as response:
            if response.status != 200:
                return None
            raw = response.read().decode("utf-8")
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError, ValueError):
        return None
    except Exception:  # noqa: BLE001 - defensive: AI is purely additive
        return None
    return parse_summary(raw)


def build_summary_prompt(finding, outputs: dict) -> str:
    issue_type = getattr(finding, "issue_type", "unknown")
    severity = getattr(finding, "severity", "unknown")
    blocks = "\n".join(f"- {key}: {text}" for key, text in outputs.items())
    return (
        "A deterministic rule engine detected a cloud governance issue.\n"
        f"issue_type: {issue_type}\nseverity: {severity}\n\n"
        "These specialist agents each analyzed it:\n"
        f"{blocks}\n\n"
        "Write ONE short paragraph (2-4 sentences) that synthesizes ALL of the above for a human "
        "reviewer: what they agree on, the main risk, and the headline recommendation. Plain text only."
    )


def parse_summary(raw: str) -> str | None:
    try:
        envelope = json.loads(raw)
    except (TypeError, ValueError):
        return None
    content = _extract_content(envelope)
    if not content:
        return None
    text = content.strip()
    if text.startswith("```"):
        text = text.strip("`").strip()
    return text or None
