from .common import Schema, Verdict

__all__ = ["ComponentRevision", "RevisionResult"]


class RevisionResult(Schema):
    result_id: int
    peak_magnitude_mm: float
    peak_frequency_hz: float
    verdict: Verdict
    margin_mm: float
    delta_vs_previous_mm: float | None
    source_status: str
    warnings: list[str]


class ComponentRevision(Schema):
    revision_id: int
    revision_label: str
    sort_key: int
    result: RevisionResult | None
