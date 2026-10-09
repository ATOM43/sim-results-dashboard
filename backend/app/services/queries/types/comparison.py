from dataclasses import dataclass

from .common import NamedRef, PeakResult, RevisionRef, SamplePoint

__all__ = [
    "Comparison",
    "ComparisonEntry",
    "ComparisonResult",
    "Matrix",
    "MatrixCell",
    "MatrixRow",
]


@dataclass(frozen=True)
class ComparisonResult(PeakResult):
    delta_vs_baseline_mm: float | None
    trend: str | None
    samples: list[SamplePoint]


@dataclass(frozen=True)
class ComparisonEntry:
    revision_id: int
    revision_label: str
    sort_key: int
    result: ComparisonResult | None


@dataclass(frozen=True)
class Comparison:
    project: NamedRef
    component: NamedRef
    baseline_revision_label: str | None
    grid_mismatch: bool
    grid_note: str | None
    revisions: list[ComparisonEntry]


@dataclass(frozen=True)
class MatrixCell:
    revision_id: int
    result_id: int
    peak_magnitude_mm: float
    verdict: str
    trend: str | None


@dataclass(frozen=True)
class MatrixRow:
    id: int
    name: str
    cells: list[MatrixCell | None]


@dataclass(frozen=True)
class Matrix:
    project: NamedRef
    revisions: list[RevisionRef]
    components: list[MatrixRow]
