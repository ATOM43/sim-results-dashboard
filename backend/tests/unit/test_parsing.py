from pathlib import Path

import pytest

from app.services.assessment import assess
from app.services.parsing import CsvValidationError, parse_csv

INPUTS = Path(__file__).resolve().parents[3] / "Inputs"
HEADER = b"Frequency [Hz],Magnitude [mm]\n"
NAME = "rev2/Lens.csv"


def errors_of(content: bytes) -> list[str]:
    with pytest.raises(CsvValidationError) as excinfo:
        parse_csv(content, NAME)
    assert str(excinfo.value) == "\n".join(excinfo.value.errors)
    return excinfo.value.errors


def test_valid_minimal_file():
    parsed = parse_csv(HEADER + b"5.0,2.1\n50.0,3.0\n200.0,0.5\n", NAME)

    assert parsed.samples == ((5.0, 2.1), (50.0, 3.0), (200.0, 0.5))
    assert parsed.warnings == ()


def test_bom_and_crlf_are_accepted():
    content = b"\xef\xbb\xbfFrequency [Hz],Magnitude [mm]\r\n5.0,2.1\r\n200.0,0.5\r\n"

    assert parse_csv(content, NAME).samples == ((5.0, 2.1), (200.0, 0.5))


def test_whitespace_and_blank_lines_are_tolerated():
    content = b" Frequency [Hz] , Magnitude [mm] \n\n 5.0 , 2.1 \n   \n200.0,0.5\n\n\n"

    assert parse_csv(content, NAME).samples == ((5.0, 2.1), (200.0, 0.5))


@pytest.mark.parametrize("content", [b"", b"\n\n"])
def test_empty_file(content: bytes):
    assert errors_of(content) == ["rev2/Lens.csv: file is empty"]


def test_header_only():
    assert errors_of(HEADER) == ["rev2/Lens.csv: no data rows"]


@pytest.mark.parametrize(
    "header", [b"frequency [hz],magnitude [mm]\n", b"Magnitude [mm],Frequency [Hz]\n", b"5.0,2.1\n"]
)
def test_wrong_header(header: bytes):
    (error,) = errors_of(header + b"5.0,2.1\n200.0,0.5\n")

    assert error.startswith("rev2/Lens.csv line 1: header must be exactly")


@pytest.mark.parametrize(("row", "found"), [(b"50.0\n", 1), (b"50.0,1.0,9\n", 3)])
def test_wrong_column_count(row: bytes, found: int):
    assert errors_of(HEADER + b"5.0,2.1\n" + row + b"200.0,0.5\n") == [
        f"rev2/Lens.csv line 3: expected 2 columns, found {found}"
    ]


def test_non_numeric_value():
    assert errors_of(HEADER + b"5.0,2.1\n50.0,abc\n200.0,0.5\n") == [
        "rev2/Lens.csv line 3: magnitude 'abc' is not a number"
    ]


@pytest.mark.parametrize(
    ("row", "reason"),
    [
        (b"50.0,nan\n", "magnitude 'nan' is not finite"),
        (b"inf,1.0\n", "frequency 'inf' is not finite"),
        (b"50.0,-inf\n", "magnitude '-inf' is not finite"),
        (b"50.0,\n", "magnitude is empty"),
        (b",1.0\n", "frequency is empty"),
    ],
)
def test_non_finite_or_empty_value(row: bytes, reason: str):
    assert errors_of(HEADER + b"5.0,2.1\n" + row) == [f"rev2/Lens.csv line 3: {reason}"]


@pytest.mark.parametrize(
    ("row", "reason"),
    [
        (b"-5.0,2.1\n", "frequency '-5.0' is negative"),
        (b"5.0,-2.1\n", "magnitude '-2.1' is negative"),
    ],
)
def test_negative_value(row: bytes, reason: str):
    assert errors_of(HEADER + row + b"200.0,0.5\n") == [f"rev2/Lens.csv line 2: {reason}"]


def test_duplicate_frequency():
    assert errors_of(HEADER + b"5.0,2.1\n5.0,2.2\n200.0,0.5\n") == [
        "rev2/Lens.csv line 3: duplicate frequency 5 Hz (already on line 2)"
    ]


def test_out_of_order_frequency():
    assert errors_of(HEADER + b"5.0,2.1\n50.0,3.0\n40.0,2.2\n200.0,0.5\n") == [
        "rev2/Lens.csv line 4: frequency 40 Hz is out of order (not above 50 Hz on line 3)"
    ]


def test_data_ending_before_cutoff():
    assert errors_of(HEADER + b"5.0,2.1\n40.0,3.0\n") == [
        "rev2/Lens.csv line 3: data ends at 40 Hz, before the 50 Hz cutoff; cannot be assessed"
    ]


def test_no_sample_at_or_below_cutoff():
    assert errors_of(HEADER + b"60.0,2.1\n200.0,0.5\n") == [
        "rev2/Lens.csv: no sample at or below 50 Hz; cannot be assessed"
    ]


def test_data_ending_at_150_hz_warns():
    parsed = parse_csv(HEADER + b"5.0,2.1\n150.0,0.5\n", NAME)

    assert parsed.samples == ((5.0, 2.1), (150.0, 0.5))
    assert parsed.warnings == ("data ends at 150 Hz; full sweep expected to 200 Hz",)


def test_all_bad_rows_are_reported():
    assert errors_of(HEADER + b"5.0,abc\nxyz,-1\n50.0\n200.0,0.5\n") == [
        "rev2/Lens.csv line 2: magnitude 'abc' is not a number",
        "rev2/Lens.csv line 3: frequency 'xyz' is not a number",
        "rev2/Lens.csv line 3: magnitude '-1' is negative",
        "rev2/Lens.csv line 4: expected 2 columns, found 1",
    ]


def test_errors_are_capped():
    errors = errors_of(HEADER + b"x,1\n" * 25)

    assert len(errors) == 21
    assert errors[-1] == "… and 5 more"


def test_malformed_csv_is_reported_with_its_line():
    # A cell beyond the csv module's field size limit makes the reader itself give up.
    (error,) = errors_of(HEADER + b"5.0,2.1\n50.0," + b"1" * 200_000 + b"\n")

    assert error.startswith("rev2/Lens.csv line 3: field larger than field limit")


def test_invalid_utf8():
    assert errors_of(HEADER + b"5.0,\xff\xfe\n") == ["rev2/Lens.csv: not valid UTF-8 text"]


def test_supplied_csvs_parse_cleanly():
    paths = sorted(INPUTS.glob("rev*/*.csv"))

    assert len(paths) == 9
    for path in paths:
        parsed = parse_csv(path.read_bytes(), f"{path.parent.name}/{path.name}")
        assert len(parsed.samples) == 15
        assert parsed.warnings == ()


def test_parser_output_feeds_assessment():
    parsed = parse_csv((INPUTS / "rev1/Bracket.csv").read_bytes(), "rev1/Bracket.csv")
    result = assess(parsed.samples)

    assert result.peak_magnitude_mm == pytest.approx(19.9)
    assert result.peak_frequency_hz == pytest.approx(37.6)
    assert result.verdict == "FAIL"
