from .common import NamedRef, PeakResult, RevisionRef, SampleOut, Schema, Trend, Verdict

__all__ = [
    "Comparison",
    "ComparisonEntry",
    "ComparisonResult",
    "Matrix",
    "MatrixCell",
    "MatrixRow",
]


class ComparisonResult(PeakResult):
    delta_vs_baseline_mm: float | None
    trend: Trend | None
    samples: list[SampleOut]


class ComparisonEntry(Schema):
    revision_id: int
    revision_label: str
    sort_key: int
    result: ComparisonResult | None


class Comparison(Schema):
    project: NamedRef
    component: NamedRef
    baseline_revision_label: str | None
    grid_mismatch: bool
    grid_note: str | None
    revisions: list[ComparisonEntry]


class MatrixCell(Schema):
    revision_id: int
    result_id: int
    peak_magnitude_mm: float
    verdict: Verdict
    trend: Trend | None


class MatrixRow(Schema):
    id: int
    name: str
    cells: list[MatrixCell | None]


class Matrix(Schema):
    project: NamedRef
    revisions: list[RevisionRef]
    components: list[MatrixRow]
