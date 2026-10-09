from dataclasses import dataclass

from .common import NamedRef, ResultSource, RevisionRef, SamplePoint

__all__ = ["ResultDetail"]


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
