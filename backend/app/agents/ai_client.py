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
_RECOMMENDATION_MAX_TOKENS = 420
_THREAT_SUMMARY_MAX_TOKENS = 320

# The conversational agent builder writes a full system prompt plus an
# explanation, so it needs more room and a longer budget than per-finding
# analysis. The model (e.g. claude-opus-4-8 via the proxy) can also be slower.
_DRAFT_MAX_TOKENS = 1500
_DRAFT_TIMEOUT_SECONDS = 45


def generate_agent_analysis(
    finding: Any,
    base_recommendation: Any,
    agents: list | None = None,
    context: dict | None = None,
) -> dict | None:
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
        prompt = build_prompt(finding, base_recommendation, agents, context)
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


def generate_recommendation_text(finding: Any, base_payload: dict) -> dict | None:
    """Rewrite recommendation action/rationale with an LLM, or ``None``.

    The deterministic builder still owns risk, savings, carbon, confidence and
    execution safety. AI only replaces the human-readable prose so the
    recommendation is no longer canned per issue type. Never raises.
    """
    raw = _chat_completion(
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a cloud governance remediation advisor for a "
                    "construction-tech company. Write specific, practical "
                    "recommendation prose for human reviewers. Do not invent "
                    "numbers, do not alter risk or savings, and never tell "
                    "anyone to auto-execute a change. Respond with one JSON "
                    "object only."
                ),
            },
            {"role": "user", "content": build_recommendation_text_prompt(finding, base_payload)},
        ],
        max_tokens=_RECOMMENDATION_MAX_TOKENS,
    )
    if raw is None:
        return None
    return parse_recommendation_text(raw)


def build_recommendation_text_prompt(finding: Any, base_payload: dict) -> str:
    data = {
        "finding": {
            "finding_id": getattr(finding, "finding_id", ""),
            "resource_id": getattr(finding, "resource_id", ""),
            "resource_name": getattr(finding, "resource_name", None),
            "resource_type": getattr(finding, "resource_type", ""),
            "owner_team": getattr(finding, "owner_team", None),
            "issue_type": getattr(finding, "issue_type", "unknown"),
            "category": getattr(finding, "category", "unknown"),
            "severity": getattr(finding, "severity", "unknown"),
            "evidence": getattr(finding, "evidence", {}) or {},
            "required_reviewers": getattr(finding, "required_reviewers", []) or [],
        },
        "deterministic_fallback": {
            "recommended_action": base_payload.get("recommended_action", ""),
            "rationale": base_payload.get("rationale", ""),
            "risk_level": base_payload.get("risk_level", ""),
            "estimated_monthly_savings": base_payload.get("estimated_monthly_savings", 0),
            "estimated_carbon_reduction_kg": base_payload.get("estimated_carbon_reduction_kg", 0),
        },
    }
    return (
        "Rewrite the deterministic fallback recommendation for this exact finding.\n"
        "Use the evidence and resource context to make the text specific, but preserve "
        "the same remediation intent. Return ONLY JSON with exactly these keys: "
        'recommended_action, rationale.\n'
        "Keep recommended_action to one sentence. Keep rationale to one or two "
        "sentences. Mention approvals/reviewers when relevant. Do not invent dollar "
        "amounts, carbon figures, owners, compliance obligations, or incident facts.\n\n"
        f"{json.dumps(data, default=str)}"
    )


def parse_recommendation_text(raw: str) -> dict | None:
    try:
        envelope = json.loads(raw)
    except (TypeError, ValueError):
        return None
    content = _extract_content(envelope)
    if not content:
        return None
    parsed = _loads_json_object(content)
    if not isinstance(parsed, dict):
        return None
    action = _clean_model_text(parsed.get("recommended_action"), max_chars=500)
    rationale = _clean_model_text(parsed.get("rationale"), max_chars=900)
    if not action or not rationale:
        return None
    return {
        "recommended_action": action,
        "rationale": rationale,
    }


def build_prompt(finding, base_recommendation, agents, context: dict | None = None) -> str:
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
    context_block = ""
    if context:
        try:
            context_text = json.dumps(context, default=str)
        except (TypeError, ValueError):
            context_text = str(context)
        context_block = (
            "\nAdditional scan context is provided for evidence only. "
            "It includes the triggering source row, related cloud events, and the full scanned_asset_data table:\n"
            f"{context_text}\n"
        )

    return (
        "A deterministic rule engine detected a cloud governance issue.\n"
        f"issue_type: {issue_type}\nseverity: {severity}\n"
        f"evidence: {evidence_text}\n"
        f"deterministic_recommended_action: {recommended_action}\n\n"
        f"{context_block}"
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


def generate_threat_summary(
    finding: Any,
    recommendation: Any,
    event: Any,
    criticality_score: int,
    criticality_factors: dict,
) -> str | None:
    """Return an LLM-written threat summary, or ``None`` for fallback."""
    raw = _chat_completion(
        messages=[
            {
                "role": "system",
                "content": (
                    "You write concise threat report summaries for cloud "
                    "governance reviewers at a construction-tech company. "
                    "Summarize only the provided facts, include the criticality "
                    "score, and do not invent evidence or tell anyone to "
                    "auto-execute a change. Plain text only."
                ),
            },
            {
                "role": "user",
                "content": build_threat_summary_prompt(
                    finding,
                    recommendation,
                    event,
                    criticality_score,
                    criticality_factors,
                ),
            },
        ],
        max_tokens=_THREAT_SUMMARY_MAX_TOKENS,
    )
    if raw is None:
        return None
    summary = _clean_model_text(parse_summary(raw), max_chars=1200)
    return summary or None


def build_threat_summary_prompt(
    finding: Any,
    recommendation: Any,
    event: Any,
    criticality_score: int,
    criticality_factors: dict,
) -> str:
    event_payload = _model_payload(event)
    recommendation_payload = _model_payload(recommendation)
    data = {
        "finding": {
            "finding_id": getattr(finding, "finding_id", ""),
            "resource_id": getattr(finding, "resource_id", ""),
            "resource_name": getattr(finding, "resource_name", None),
            "resource_type": getattr(finding, "resource_type", ""),
            "owner_team": getattr(finding, "owner_team", None),
            "issue_type": getattr(finding, "issue_type", "unknown"),
            "category": getattr(finding, "category", "unknown"),
            "severity": getattr(finding, "severity", "unknown"),
            "status": getattr(finding, "status", "unknown"),
            "evidence": getattr(finding, "evidence", {}) or {},
        },
        "event": event_payload,
        "recommendation": recommendation_payload,
        "criticality_score": criticality_score,
        "criticality_factors": criticality_factors,
    }
    return (
        "Write one short threat report summary paragraph, 2-4 sentences. "
        "Explain what was detected, why it matters, what drives the criticality "
        "score, and the headline remediation. Use plain English for a human "
        "approver. Do not output JSON.\n\n"
        f"{json.dumps(data, default=str)}"
    )


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


def _chat_completion(
    messages: list[dict],
    max_tokens: int,
    temperature: float = 0.4,
    timeout: int = _TIMEOUT_SECONDS,
) -> str | None:
    settings = get_settings()
    if not settings.ai_enabled:
        return None
    try:
        base_url = settings.ai_provider_base_url
        if not base_url.endswith("/"):
            base_url += "/"
        url = base_url + _COMPLETIONS_PATH
        body = json.dumps(
            {
                "model": settings.ai_model,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens,
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
        with urllib.request.urlopen(request, timeout=timeout) as response:
            if response.status != 200:
                return None
            return response.read().decode("utf-8")
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError, ValueError):
        return None
    except Exception:  # noqa: BLE001 - defensive: AI is purely additive
        return None


def _model_payload(value: Any) -> Any:
    if value is None:
        return None
    model_dump = getattr(value, "model_dump", None)
    if callable(model_dump):
        return model_dump(mode="json")
    return value


def _clean_model_text(value: Any, max_chars: int) -> str:
    if value is None:
        return ""
    text = " ".join(str(value).split())
    if len(text) <= max_chars:
        return text
    return text[:max_chars].rstrip()


# ---------------------------------------------------------------------------
# Conversational agent builder: describe an agent in natural language and get a
# professional, SafeCloud-native system prompt back. Like the rest of this
# module it NEVER raises — on any failure it returns ``None`` so the route can
# degrade gracefully.
# ---------------------------------------------------------------------------

_BUILDER_SYSTEM_PROMPT = (
    "You are an expert prompt engineer embedded in SafeCloud, a cloud-governance "
    "dashboard for a construction-tech company. You help a human author the SYSTEM "
    "PROMPT for a new analysis agent by chatting with them, like an assistant that "
    "creates sub-agents.\n\n"
    "HOW THESE AGENTS RUN (the prompt you write MUST fit this): each agent is given "
    "ONE governance finding (issue_type, severity, evidence) plus a deterministic "
    "recommended action, and must return ONE or TWO short, plain-English, "
    "construction-aware sentences of analysis. The deterministic rule engine supplies "
    "every dollar and carbon figure, so agents must NEVER invent numbers and must NEVER "
    "tell anyone to auto-execute a change. Gold-standard existing prompts:\n"
    '- "You are a cloud security analyst for a construction-tech company. Explain the '
    'exposure and data-protection risk of this finding in one or two plain sentences. '
    'Reference the evidence; never invent numbers."\n'
    '- "You are a cloud cost analyst. Explain the wasted monthly spend and the saving '
    'opportunity in one or two sentences. Do not invent figures; reference the provided '
    'estimate only."\n\n'
    "YOUR JOB: from the user's natural-language description, write a polished, "
    "role-specific system prompt in exactly that style — a clear persona, what to "
    "explain for each finding, the one-to-two-sentence limit, and the 'reference the "
    "evidence / never invent numbers / never auto-execute' guardrails. Also propose a "
    "short, human-friendly agent name (2-4 words, e.g. 'Idle Compute Optimizer'). "
    "Explain your choices conversationally and warmly. Only if the request is too vague "
    "to act on, ask ONE clarifying question instead of guessing wildly.\n\n"
    "OUTPUT FORMAT: ALWAYS respond with a SINGLE JSON object and nothing else:\n"
    '{"reply": "<your conversational explanation or clarifying question>", '
    '"name": "<suggested agent name, or empty string>", '
    '"system_prompt": "<the system prompt you wrote, or empty string>"}\n'
    "Leave name and system_prompt as empty strings ONLY when you are purely asking a "
    "clarifying question and have not drafted anything yet."
)


def generate_subagent_draft(
    messages: list,
    current_name: str | None = None,
    current_system_prompt: str | None = None,
) -> dict | None:
    """Return ``{"reply", "name", "system_prompt"}`` or ``None`` on any failure.

    ``messages`` is the running chat history (objects or dicts with ``role`` and
    ``content``). The current draft, if any, is passed back as context so the
    model refines it in place rather than starting over. Never raises.
    """
    settings = get_settings()
    if not settings.ai_enabled:
        return None

    try:
        base_url = settings.ai_provider_base_url
        if not base_url.endswith("/"):
            base_url += "/"
        url = base_url + _COMPLETIONS_PATH

        chat: list[dict] = [{"role": "system", "content": _BUILDER_SYSTEM_PROMPT}]
        draft = (current_system_prompt or "").strip()
        if draft:
            chat.append(
                {
                    "role": "system",
                    "content": (
                        "The draft the user is currently looking at:\n"
                        f"name: {(current_name or '').strip()}\n"
                        f"system_prompt: {draft}\n"
                        "Refine THIS draft based on the conversation rather than "
                        "starting from scratch, unless the user asks for something new."
                    ),
                }
            )

        had_user_turn = False
        for turn in messages or []:
            role = _turn_field(turn, "role")
            content = _turn_field(turn, "content")
            if role in ("user", "assistant") and content:
                chat.append({"role": role, "content": str(content)})
                if role == "user":
                    had_user_turn = True
        if not had_user_turn:
            return None

        body = json.dumps(
            {
                "model": settings.ai_model,
                "messages": chat,
                "temperature": 0.5,
                "max_tokens": _DRAFT_MAX_TOKENS,
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

        with urllib.request.urlopen(request, timeout=_DRAFT_TIMEOUT_SECONDS) as response:
            if response.status != 200:
                return None
            raw = response.read().decode("utf-8")
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError, ValueError):
        return None
    except Exception:  # noqa: BLE001 - defensive: AI is purely additive
        return None

    return parse_draft(raw)


def _turn_field(turn, field: str):
    if isinstance(turn, dict):
        return turn.get(field)
    return getattr(turn, field, None)


def parse_draft(raw: str) -> dict | None:
    """Extract the builder's JSON object, tolerating prose/fences. None on failure."""
    try:
        envelope = json.loads(raw)
    except (TypeError, ValueError):
        return None
    content = _extract_content(envelope)
    if not content:
        return None
    parsed = _loads_json_object(content)
    if not isinstance(parsed, dict):
        return None
    reply = str(parsed.get("reply", "") or "").strip()
    name = str(parsed.get("name", "") or "").strip()
    system_prompt = str(parsed.get("system_prompt", "") or "").strip()
    if not (reply or name or system_prompt):
        return None
    return {"reply": reply, "name": name, "system_prompt": system_prompt}
