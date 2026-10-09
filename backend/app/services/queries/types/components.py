from dataclasses import dataclass

__all__ = ["RevisionEntry", "RevisionResult"]


@dataclass(frozen=True)
class RevisionResult:
    result_id: int
    peak_magnitude_mm: float
    peak_frequency_hz: float
    verdict: str
    margin_mm: float
    delta_vs_previous_mm: float | None
    source_status: str
    warnings: list[str]


@dataclass(frozen=True)
class RevisionEntry:
    revision_id: int
    revision_label: str
    sort_key: int
    result: RevisionResult | None
