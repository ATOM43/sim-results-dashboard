from dataclasses import dataclass

from .common import NamedRef

__all__ = ["DemandDetail", "DemandHistoryEntry"]


@dataclass(frozen=True)
class DemandHistoryEntry:
    revision_id: int
    revision_label: str
    result_id: int | None
    peak_magnitude_mm: float | None
    verdict: str | None


@dataclass(frozen=True)
class DemandDetail:
    id: int
    description: str
    status: str
    component: NamedRef
    project: NamedRef
    origin_type: str
    origin_revision_label: str | None
    origin_metric: str | None
    origin_value_mm: float | None
    origin_frequency_hz: float | None
    origin_limit_mm: float | None
    origin_assess_max_hz: float | None
    history: list[DemandHistoryEntry]
    latest_result: DemandHistoryEntry | None
    latest_passes_but_open: bool
