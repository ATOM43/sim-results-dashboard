from .common import Schema, Verdict

__all__ = ["ComponentSummary", "LatestResult", "ProjectSummary", "RevisionSummary"]


class ProjectSummary(Schema):
    id: int
    name: str
    component_count: int
    revision_count: int


class LatestResult(Schema):
    result_id: int
    revision_label: str
    peak_magnitude_mm: float
    peak_frequency_hz: float
    verdict: Verdict


class ComponentSummary(Schema):
    id: int
    name: str
    latest: LatestResult | None


class RevisionSummary(Schema):
    id: int
    label: str
    sort_key: int
    result_count: int
    pass_count: int
    fail_count: int
