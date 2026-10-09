from .common import NamedRef, ResultSource, RevisionRef, SampleOut, Schema, Verdict

__all__ = ["ResultDetail"]


class ResultDetail(Schema):
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
    verdict: Verdict
    margin_mm: float
    samples: list[SampleOut]
    source: ResultSource
