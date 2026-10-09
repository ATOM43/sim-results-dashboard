from dataclasses import dataclass

from .common import PeakResult

__all__ = ["RevisionEntry", "RevisionResult"]


@dataclass(frozen=True)
class RevisionResult(PeakResult):
    source_status: str
    warnings: list[str]


@dataclass(frozen=True)
class RevisionEntry:
    revision_id: int
    revision_label: str
    sort_key: int
    result: RevisionResult | None
