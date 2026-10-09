import math
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Literal

from app.config import ASSESS_MAX_HZ, LIMIT_MM

Sample = tuple[float, float]  # (frequency_hz, magnitude_mm)


class AssessmentError(ValueError):
    """The samples cannot be assessed against the review rule."""


@dataclass(frozen=True)
class Assessment:
    """Fields map 1:1 to the `results` columns."""

    sample_count: int
    min_frequency_hz: float
    max_frequency_hz: float
    peak_magnitude_mm: float
    peak_frequency_hz: float
    overall_peak_magnitude_mm: float
    overall_peak_frequency_hz: float
    limit_mm: float
    assess_max_hz: float
    verdict: Literal["PASS", "FAIL"]

    @property
    def margin_mm(self) -> float:
        """Negative means over the limit."""
        return self.limit_mm - self.peak_magnitude_mm


def _peak(samples: Sequence[Sample]) -> Sample:
    # Ties go to the lowest frequency so the result does not depend on input order.
    return max(samples, key=lambda s: (s[1], -s[0]))


def assess(
    samples: Sequence[Sample],
    limit_mm: float = LIMIT_MM,
    assess_max_hz: float = ASSESS_MAX_HZ,
) -> Assessment:
    """PASS when the peak at or below `assess_max_hz` is within `limit_mm`."""
    if not samples:
        raise AssessmentError("No samples to assess.")
    if not all(math.isfinite(f) and math.isfinite(m) for f, m in samples):
        raise AssessmentError("Samples contain NaN or infinite values.")
    assessed = [s for s in samples if s[0] <= assess_max_hz]
    if not assessed:
        raise AssessmentError(f"No sample at or below {assess_max_hz} Hz; cannot assess.")

    peak_frequency_hz, peak_magnitude_mm = _peak(assessed)
    overall_peak_frequency_hz, overall_peak_magnitude_mm = _peak(samples)
    frequencies = [s[0] for s in samples]
    return Assessment(
        sample_count=len(samples),
        min_frequency_hz=min(frequencies),
        max_frequency_hz=max(frequencies),
        peak_magnitude_mm=peak_magnitude_mm,
        peak_frequency_hz=peak_frequency_hz,
        overall_peak_magnitude_mm=overall_peak_magnitude_mm,
        overall_peak_frequency_hz=overall_peak_frequency_hz,
        limit_mm=limit_mm,
        assess_max_hz=assess_max_hz,
        verdict="PASS" if peak_magnitude_mm <= limit_mm else "FAIL",
    )
