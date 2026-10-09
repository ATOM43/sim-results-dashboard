from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

__all__ = [
    "NamedRef",
    "PeakResult",
    "ResultSource",
    "RevisionRef",
    "SampleOut",
    "Schema",
    "Trend",
    "Verdict",
]

Verdict = Literal["PASS", "FAIL"]
Trend = Literal["improved", "degraded", "unchanged"]


class Schema(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class SampleOut(Schema):
    frequency_hz: float
    magnitude_mm: float
    assessed: bool


class ResultSource(Schema):
    source_key: str
    status: str
    warnings: list[str]
    last_imported_at: datetime


class NamedRef(Schema):
    id: int
    name: str


class RevisionRef(Schema):
    id: int
    label: str
    sort_key: int


class PeakResult(Schema):
    """What every per-revision result shape shares."""

    result_id: int
    peak_magnitude_mm: float
    peak_frequency_hz: float
    verdict: Verdict
    margin_mm: float
    delta_vs_previous_mm: float | None
