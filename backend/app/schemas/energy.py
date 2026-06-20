from datetime import datetime

from pydantic import BaseModel, Field


class EnergyHistoryPoint(BaseModel):
    label: str
    value_kg: float
    timestamp: datetime | None = None


class EnergySummary(BaseModel):
    current_footprint_kg: float = 0
    projected_footprint_kg: float = 0
    estimated_reduction_kg: float = 0
    by_operation: dict[str, float] = Field(default_factory=dict)
    history: list[EnergyHistoryPoint] = Field(default_factory=list)
