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

# Hard cap so a misbehaving model can't run up cost or latency. The response
# now also carries a tailored action + rationale + numbered remediation steps,
# so the cap is a little higher than the analysis-only original.
_MAX_TOKENS = 900
_TIMEOUT_SECONDS = 8

# Agent keys that are meaningful per issue type. The model is asked to fill
# only the relevant subset; we additionally clamp its output to these keys.
_RELEVANT_AGENTS: dict[str, list[str]] = {
    "public_bucket": ["security", "workflow", "audit"],
    "idle_vm": ["cost", "energy", "workflow"],
    "unused_storage": ["cost", "energy", "audit"],
    "unencrypted_database": ["security", "workflow", "audit"],
}
_ALL_AGENTS = ["security", "cost", "energy", "workflow", "audit"]
# Extra free-form key allowed inside ``agent_outputs``: concrete numbered
# remediation steps (rendered last in the modal). Not an "agent" — it's the
# concluding "how to fix it" block.
_REMEDIATION_KEY = "remediation"
_AGENT_OUTPUT_KEYS = _ALL_AGENTS + [_REMEDIATION_KEY]


def generate_agent_analysis(finding: Any, base_recommendation: Any) -> dict | None:
    """Return the AI-enriched recommendation parts, or ``None`` on any failure.

    The returned dict may contain:

    * ``recommended_action`` (str) — a specific, finding-tailored fix derived
      from the evidence (safety-first / reversible-first).
    * ``rationale`` (str) — a short why, referencing the evidence.
    * ``agent_outputs`` (dict) — per-agent analysis text (clamped to the known
      agent keys) PLUS a ``remediation`` key with concrete numbered steps.

    AI rewrites only the recommendation *text* and the fix narrative. The
    deterministic numbers (savings/carbon/risk/severity/required reviewers/
    confidence) come from the rules and are never touched here. The fix is a
    recommendation that still requires human approval and is never auto-
    executed. Never raises.
    """
    settings = get_settings()
    if not settings.ai_enabled:
        return None

    try:
        base_url = settings.ai_provider_base_url
        if not base_url.endswith("/"):
            base_url += "/"
        url = base_url + _COMPLETIONS_PATH

        prompt = _build_prompt(finding, base_recommendation)
        body = json.dumps(
            {
                "model": settings.ai_model,
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            "You are a cloud governance assistant for a "
                            "construction-tech company. You turn a detected "
                            "issue into a concrete, finding-specific FIX for "
                            "human reviewers: a tailored recommended action, a "
                            "short rationale, per-agent analysis, and numbered "
                            "remediation steps. The fix must be safe and "
                            "reversible (e.g. snapshot before stop, signed URL "
                            "instead of public access, encrypt in a maintenance "
                            "window). You NEVER invent or change cost, carbon, "
                            "severity, or approval numbers — those are fixed by "
                            "the rules; reference them, do not compute new ones. "
                            "Every fix REQUIRES human approval and is never "
                            "auto-executed. Never claim an action was already "
                            "performed. Respond with a single JSON object only."
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

    return _parse_response(raw, finding)


def _build_prompt(finding: Any, base_recommendation: Any) -> str:
    issue_type = getattr(finding, "issue_type", "unknown")
    severity = getattr(finding, "severity", "unknown")
    rule_id = getattr(finding, "rule_id", "unknown")
    evidence = getattr(finding, "evidence", {}) or {}
    recommended_action = getattr(base_recommendation, "recommended_action", "")

    agents = _RELEVANT_AGENTS.get(issue_type, _ALL_AGENTS)
    try:
        evidence_text = json.dumps(evidence, default=str)
    except (TypeError, ValueError):
        evidence_text = str(evidence)

    rationale = getattr(base_recommendation, "rationale", "")
    monthly_savings = getattr(base_recommendation, "estimated_monthly_savings", 0)
    carbon = getattr(base_recommendation, "estimated_carbon_reduction_kg", 0)
    required_reviewers = getattr(finding, "required_reviewers", []) or []

    return (
        "A deterministic rule engine detected a cloud governance issue and "
        "produced a baseline recommendation. Improve it into a concrete, "
        "finding-specific FIX.\n\n"
        f"issue_type: {issue_type}\n"
        f"severity: {severity}\n"
        f"rule_id: {rule_id}\n"
        f"evidence: {evidence_text}\n"
        f"required_reviewers: {list(required_reviewers)}\n"
        "FIXED numbers from the rules (DO NOT change or recompute — reference "
        "only):\n"
        f"  estimated_monthly_savings_usd: {monthly_savings}\n"
        f"  estimated_carbon_reduction_kg: {carbon}\n"
        f"baseline_recommended_action: {recommended_action}\n"
        f"baseline_rationale: {rationale}\n\n"
        "Return ONLY a single JSON object with these keys:\n"
        '  "recommended_action": one or two plain sentences — a specific, '
        "actionable, SAFE and REVERSIBLE fix derived from THIS finding's "
        "evidence (e.g. snapshot before stopping a VM, replace public access "
        "with a signed URL, schedule encryption in a maintenance window). It "
        "must require human approval and must never be auto-executed.\n"
        '  "rationale": one short sentence explaining why, referencing the '
        "evidence.\n"
        '  "agent_outputs": a JSON object whose keys are a subset of '
        f"{agents} (only the ones relevant to this issue), each value one or "
        "two plain-English sentences of construction-aware analysis from that "
        'perspective, PLUS a "remediation" key whose value is concrete, '
        "NUMBERED, console/CLI-level steps (safety-first, reversible-first, "
        "construction-aware) for how a human would carry out the fix after "
        "approval. Write the steps as a single string with newline-separated "
        '"1. ...\\n2. ..." lines.\n\n'
        "HARD RULES: Do NOT invent or change any dollar, carbon, severity, or "
        "approval-count numbers — they are fixed above; reference them, do not "
        "compute new ones. The fix MUST be safe/reversible and MUST require "
        "human approval. NEVER claim the action was already executed. No "
        "markdown formatting. Example shape: {\"recommended_action\": \"...\", "
        '"rationale": "...", "agent_outputs": {"security": "...", '
        '"remediation": "1. ...\\n2. ..."}}'
    )


def _coerce_text(value: Any) -> str:
    """Coerce an LLM value to a clean string (joins lists, strips whitespace)."""
    if isinstance(value, (list, tuple)):
        return " ".join(str(item).strip() for item in value if str(item).strip())
    return str(value).strip()


def _clean_agent_outputs(value: Any) -> dict[str, str]:
    """Clamp an ``agent_outputs`` mapping to known keys, coercing to strings.

    Known keys are the five agents plus the free-form ``remediation`` key
    (numbered steps). Everything else is dropped. Values are coerced to
    non-empty strings.
    """
    cleaned: dict[str, str] = {}
    if not isinstance(value, dict):
        return cleaned
    for key, raw_value in value.items():
        agent = str(key).strip().lower()
        if agent not in _AGENT_OUTPUT_KEYS:
            continue
        text = _coerce_text(raw_value)
        if text:
            cleaned[agent] = text
    return cleaned


def _parse_response(raw: str, finding: Any) -> dict | None:
    """Robustly extract the enriched recommendation parts from the response.

    Returns a dict that may contain ``recommended_action`` (str),
    ``rationale`` (str) and ``agent_outputs`` (dict clamped to the known agent
    keys + ``remediation``). Tolerates both the new envelope shape and the
    legacy flat per-agent shape. Returns ``None`` if nothing usable is found.
    """
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

    result: dict[str, Any] = {}

    action = _coerce_text(parsed.get("recommended_action", ""))
    if action:
        result["recommended_action"] = action

    rationale = _coerce_text(parsed.get("rationale", ""))
    if rationale:
        result["rationale"] = rationale

    if "agent_outputs" in parsed:
        # New envelope shape: {recommended_action, rationale, agent_outputs}.
        agent_outputs = _clean_agent_outputs(parsed.get("agent_outputs"))
    else:
        # Legacy / fallback shape: the object IS the per-agent map. Ignore the
        # action/rationale keys we may have already pulled out above.
        legacy = {
            k: v
            for k, v in parsed.items()
            if str(k).strip().lower() not in {"recommended_action", "rationale"}
        }
        agent_outputs = _clean_agent_outputs(legacy)

    if agent_outputs:
        result["agent_outputs"] = agent_outputs

    return result or None


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
