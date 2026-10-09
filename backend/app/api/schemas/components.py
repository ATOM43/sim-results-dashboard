from .common import PeakResult, Schema

__all__ = ["ComponentRevision", "RevisionResult"]


class RevisionResult(PeakResult):
    source_status: str
    warnings: list[str]


class ComponentRevision(Schema):
    revision_id: int
    revision_label: str
    sort_key: int
    result: RevisionResult | None
