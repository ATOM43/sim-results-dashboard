import json
from dataclasses import dataclass
from datetime import datetime

__all__ = [
    "NamedRef",
    "PeakResult",
    "ResultSource",
    "RevisionRef",
    "SamplePoint",
    "parse_warnings",
]


def parse_warnings(text: str | None) -> list[str]:
    """`source_files.warnings` stores JSON text."""
    return json.loads(text or "[]")


@dataclass(frozen=True)
class ResultSource:
    source_key: str
    status: str
    warnings: list[str]
    last_imported_at: datetime


@dataclass(frozen=True)
class NamedRef:
    id: int
    name: str


@dataclass(frozen=True)
class RevisionRef:
    id: int
    label: str
    sort_key: int


@dataclass(frozen=True)
class SamplePoint:
    frequency_hz: float
    magnitude_mm: float
    assessed: bool


@dataclass(frozen=True)
class PeakResult:
    """What every per-revision result shape shares."""

    result_id: int
    peak_magnitude_mm: float
    peak_frequency_hz: float
    verdict: str
    margin_mm: float
    delta_vs_previous_mm: float | None
