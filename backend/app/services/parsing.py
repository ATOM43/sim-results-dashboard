import csv
import io
import math
from dataclasses import dataclass

from app.config import ASSESS_MAX_HZ

HEADER = ["Frequency [Hz]", "Magnitude [mm]"]
EXPECTED_MAX_HZ = 200.0
MAX_REPORTED_ERRORS = 20


class CsvValidationError(ValueError):
    """The CSV cannot be imported. `errors` holds one message per problem."""

    def __init__(self, errors: list[str]) -> None:
        super().__init__("\n".join(errors))
        self.errors = errors


@dataclass(frozen=True)
class ParsedCsv:
    samples: tuple[tuple[float, float], ...]  # (frequency_hz, magnitude_mm), in file order
    warnings: tuple[str, ...]


def _parse_value(label: str, cell: str) -> float:
    text = cell.strip()
    if not text:
        raise ValueError(f"{label} is empty")
    try:
        value = float(text)
    except ValueError:
        raise ValueError(f"{label} {text!r} is not a number") from None
    if not math.isfinite(value):
        raise ValueError(f"{label} {text!r} is not finite")
    if value < 0:
        raise ValueError(f"{label} {text!r} is negative")
    return value


def parse_csv(content: bytes, source_name: str) -> ParsedCsv:
    """Parse and validate one result CSV. `source_name` is only used in messages."""
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise CsvValidationError([f"{source_name}: not valid UTF-8 text"]) from None

    reader = csv.reader(io.StringIO(text, newline=""))
    errors: list[str] = []
    samples: list[tuple[float, float]] = []
    header_seen = False
    previous_line = 0
    try:
        for row in reader:
            if not any(cell.strip() for cell in row) and len(row) < 2:
                continue  # fully blank line
            where = f"{source_name} line {reader.line_num}"
            if not header_seen:
                if [cell.strip() for cell in row] != HEADER:
                    # Without the expected header the rows cannot be trusted; stop here.
                    raise CsvValidationError(
                        [f"{where}: header must be exactly '{','.join(HEADER)}'"]
                    )
                header_seen = True
                continue
            if len(row) != 2:
                errors.append(f"{where}: expected 2 columns, found {len(row)}")
                continue
            values: list[float] = []
            for label, cell in zip(("frequency", "magnitude"), row, strict=True):
                try:
                    values.append(_parse_value(label, cell))
                except ValueError as exc:
                    errors.append(f"{where}: {exc}")
            if len(values) != 2:
                continue
            frequency = values[0]
            if samples and frequency <= samples[-1][0]:
                reason = (
                    f"duplicate frequency {frequency:g} Hz (already on line {previous_line})"
                    if frequency == samples[-1][0]
                    else f"frequency {frequency:g} Hz is out of order "
                    f"(not above {samples[-1][0]:g} Hz on line {previous_line})"
                )
                errors.append(f"{where}: {reason}")
                continue
            samples.append((frequency, values[1]))
            previous_line = reader.line_num
    except csv.Error as exc:
        errors.append(f"{source_name} line {reader.line_num}: {exc}")

    if not header_seen and not errors:
        errors.append(f"{source_name}: file is empty")
    elif not samples and not errors:
        errors.append(f"{source_name}: no data rows")
    elif not errors:
        # Frequencies are strictly increasing, so first and last are min and max.
        if samples[0][0] > ASSESS_MAX_HZ:
            errors.append(
                f"{source_name}: no sample at or below {ASSESS_MAX_HZ:g} Hz; cannot be assessed"
            )
        elif samples[-1][0] < ASSESS_MAX_HZ:
            errors.append(
                f"{source_name}: data ends at {samples[-1][0]:g} Hz, "
                f"before {ASSESS_MAX_HZ:g} Hz; cannot be assessed"
            )
    if errors:
        extra = len(errors) - MAX_REPORTED_ERRORS
        if extra > 0:
            errors = [*errors[:MAX_REPORTED_ERRORS], f"… and {extra} more"]
        raise CsvValidationError(errors)

    warnings: list[str] = []
    if samples[-1][0] < EXPECTED_MAX_HZ:
        warnings.append(
            f"data ends at {samples[-1][0]:g} Hz; full sweep expected to {EXPECTED_MAX_HZ:g} Hz"
        )
    return ParsedCsv(samples=tuple(samples), warnings=tuple(warnings))
