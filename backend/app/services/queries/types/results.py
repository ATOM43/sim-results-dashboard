from dataclasses import dataclass

from .common import ResultSource

__all__ = ["NamedRef", "ResultDetail", "RevisionRef", "SamplePoint"]


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
class ResultDetail:
    id: int
    project: NamedRef
    component: NamedRef
    revision: RevisionRef
    sample_count: int
    min_frequency_hz: float
    max_frequency_hz: float
    peak_magnitude_mm: float
    peak_frequency_hz: float
    overall_peak_magnitude_mm: float
    overall_peak_frequency_hz: float
    limit_mm: float
    assess_max_hz: float
    verdict: str
    margin_mm: float
    samples: list[SamplePoint]
    source: ResultSource
