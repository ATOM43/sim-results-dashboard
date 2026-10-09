from dataclasses import dataclass

__all__ = ["ComponentSummary", "LatestResult", "ProjectSummary", "RevisionSummary"]


@dataclass(frozen=True)
class ProjectSummary:
    id: int
    name: str
    component_count: int
    revision_count: int


@dataclass(frozen=True)
class LatestResult:
    result_id: int
    revision_label: str
    peak_magnitude_mm: float
    peak_frequency_hz: float
    verdict: str


@dataclass(frozen=True)
class ComponentSummary:
    id: int
    name: str
    latest: LatestResult | None


@dataclass(frozen=True)
class RevisionSummary:
    id: int
    label: str
    sort_key: int
    result_count: int
    pass_count: int
    fail_count: int
