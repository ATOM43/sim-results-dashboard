from pathlib import Path

import pytest

from app.services.assessment import AssessmentError, assess
from app.services.parsing import parse_csv

INPUTS = Path(__file__).resolve().parents[3] / "Inputs"


def test_peak_exactly_at_limit_passes():
    assert assess([(10.0, 15.0), (20.0, 3.0)]).verdict == "PASS"


def test_peak_just_above_limit_fails():
    assert assess([(10.0, 15.01), (20.0, 3.0)]).verdict == "FAIL"


def test_sample_at_exactly_50_hz_is_assessed():
    result = assess([(10.0, 1.0), (50.0, 16.0)])

    assert result.verdict == "FAIL"
    assert result.peak_frequency_hz == 50.0


def test_peak_above_50_hz_only_counts_as_overall_peak():
    result = assess([(10.0, 5.0), (60.0, 99.0)])

    assert result.verdict == "PASS"
    assert (result.peak_frequency_hz, result.peak_magnitude_mm) == (10.0, 5.0)
    assert (result.overall_peak_frequency_hz, result.overall_peak_magnitude_mm) == (60.0, 99.0)


def test_input_order_does_not_matter():
    ordered = [(5.0, 2.0), (30.0, 12.0), (40.0, 12.0), (60.0, 20.0), (70.0, 20.0)]

    assert assess(ordered[::-1]) == assess(ordered)
    assert assess([ordered[i] for i in (2, 4, 0, 3, 1)]) == assess(ordered)


def test_equal_peaks_report_the_lower_frequency():
    result = assess([(40.0, 12.0), (30.0, 12.0), (70.0, 20.0), (60.0, 20.0)])

    assert result.peak_frequency_hz == 30.0
    assert result.overall_peak_frequency_hz == 60.0


def test_empty_input_raises():
    with pytest.raises(AssessmentError):
        assess([])


def test_all_samples_above_50_hz_raises():
    with pytest.raises(AssessmentError):
        assess([(50.1, 1.0), (60.0, 2.0)])


@pytest.mark.parametrize("sample", [(float("nan"), 1.0), (10.0, float("inf"))])
def test_non_finite_sample_raises(sample: tuple[float, float]):
    with pytest.raises(AssessmentError, match="NaN or infinite"):
        assess([(5.0, 1.0), sample])


def test_margin_sign_follows_verdict():
    assert assess([(10.0, 16.5)]).margin_mm == pytest.approx(-1.5)
    assert assess([(10.0, 13.0)]).margin_mm == pytest.approx(2.0)


@pytest.mark.parametrize(
    ("file", "peak_mm", "peak_hz", "verdict"),
    [
        ("rev1/Bracket.csv", 19.9, 37.6, "FAIL"),
        ("rev2/Bracket.csv", 22.0, 37.8, "FAIL"),
        ("rev3/Bracket.csv", 13.8, 37.8, "PASS"),
        ("rev1/Housing.csv", 16.7, 37.6, "FAIL"),
        ("rev2/Housing.csv", 14.9, 37.8, "PASS"),
        ("rev3/Housing.csv", 14.2, 37.8, "PASS"),
        ("rev1/Lens.csv", 18.0, 37.8, "FAIL"),
        ("rev2/Lens.csv", 16.1, 37.8, "FAIL"),
        ("rev3/Lens.csv", 17.5, 37.8, "FAIL"),
    ],
)
def test_supplied_csvs(file: str, peak_mm: float, peak_hz: float, verdict: str):
    result = assess(parse_csv((INPUTS / file).read_bytes(), file).samples)

    assert result.peak_magnitude_mm == pytest.approx(peak_mm)
    assert result.peak_frequency_hz == pytest.approx(peak_hz)
    assert result.verdict == verdict
    assert result.sample_count == 15
    assert result.min_frequency_hz == pytest.approx(5.0)
    assert result.max_frequency_hz == pytest.approx(200.0)
