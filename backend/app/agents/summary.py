"""Deterministic fallback for the merged workflow summary (no LLM)."""

_ORDER = ["security", "cost", "energy", "workflow", "audit"]


def stitch_summary(agent_outputs: dict) -> str:
    """Join per-agent blurbs into one block. Empty inputs -> ""."""
    outputs = {k: str(v).strip() for k, v in (agent_outputs or {}).items() if str(v).strip()}
    if not outputs:
        return ""
    known = [k for k in _ORDER if k in outputs]
    extra = [k for k in outputs if k not in _ORDER]
    keys = known + extra
    parts = [f"{k.capitalize()}: {outputs[k]}" for k in keys]
    n = len(keys)
    lead = f"{n} agent{'s' if n != 1 else ''} reviewed this finding. "
    return lead + " ".join(parts)
