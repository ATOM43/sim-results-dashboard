"""Pure comparison maths: no session, no HTTP."""

from collections import Counter
from collections.abc import Mapping, Sequence
from collections.abc import Set as AbstractSet
from typing import Literal

Trend = Literal["improved", "degraded", "unchanged"]


def previous_present[T](values: Sequence[T | None]) -> list[T | None]:
    """For each position, the closest earlier value that is not None."""
    previous: list[T | None] = []
    last: T | None = None
    for value in values:
        previous.append(last)
        if value is not None:
            last = value
    return previous


def delta(peak_mm: float, reference_mm: float | None) -> float | None:
    return None if reference_mm is None else round(peak_mm - reference_mm, 6)


def trend(delta_mm: float | None) -> Trend | None:
    """A lower peak is an improvement."""
    if delta_mm is None:
        return None
    return "improved" if delta_mm < 0 else "degraded" if delta_mm > 0 else "unchanged"


def grid_differences(grids: Sequence[AbstractSet[float]]) -> list[str | None]:
    """Per grid: None when it matches the others, else how it differs from the most-used grid.

    The difference is "" when there is no single most-used grid to name it against.
    """
    counts = Counter(frozenset(grid) for grid in grids)
    if len(counts) <= 1:
        return [None] * len(grids)
    top = max(counts.values())
    common = [grid for grid, count in counts.items() if count == top]
    if len(common) > 1:
        return [""] * len(grids)
    reference = common[0]
    return [
        None
        if grid == reference
        else ", ".join(
            f"{verb} {', '.join(f'{frequency:g} Hz' for frequency in sorted(points))}"
            for verb, points in (("has", grid - reference), ("lacks", reference - grid))
            if points
        )
        for grid in grids
    ]


def grid_note(grids: Mapping[str, AbstractSet[float]]) -> str | None:
    """None when the labelled grids are identical, else a sentence naming what differs."""
    differences = dict(zip(grids, grid_differences(list(grids.values())), strict=True))
    named = [f"{label} {text}" for label, text in differences.items() if text]
    if named:
        return f"frequency grids differ in the assessed range: {'; '.join(named)}"
    if any(text is not None for text in differences.values()):
        return "frequency grids differ in the assessed range"
    return None
