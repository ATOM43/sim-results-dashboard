import pytest

from app.services.comparison import delta, grid_differences, grid_note, previous_present, trend


def test_previous_present_skips_gaps():
    assert previous_present([1.0, None, 3.0, 4.0]) == [None, 1.0, 1.0, 3.0]
    assert previous_present([None, 2.0]) == [None, None]
    assert previous_present([]) == []


def test_delta_is_rounded_and_none_without_a_reference():
    assert delta(22.0, 19.9) == 2.1
    assert delta(13.8, 22.0) == -8.2
    assert delta(13.8, None) is None


@pytest.mark.parametrize(
    ("delta_mm", "expected"),
    [(None, None), (-8.2, "improved"), (2.1, "degraded"), (0.0, "unchanged")],
)
def test_trend(delta_mm: float | None, expected: str | None):
    assert trend(delta_mm) == expected


def test_grid_differences_name_the_points_against_the_most_used_grid():
    assert grid_differences([{1.0, 2.0}, {1.0, 3.0}, {1.0, 3.0}]) == [
        "has 2 Hz, lacks 3 Hz",
        None,
        None,
    ]
    assert grid_differences([{1.0}, {1.0}]) == [None, None]
    assert grid_differences([{1.0}]) == [None]
    assert grid_differences([]) == []


def test_grid_differences_without_a_majority_flag_every_grid():
    assert grid_differences([{1.0}, {2.0}]) == ["", ""]


def test_grid_note():
    assert grid_note({"rev2": {1.0}, "rev3": {1.0}}) is None
    assert grid_note({}) is None
    assert grid_note({"rev1": {1.0}, "rev2": {2.0}}) == (
        "frequency grids differ in the assessed range"
    )
    assert grid_note({"rev1": {1.0, 2.0}, "rev2": {1.0, 3.0}, "rev3": {1.0, 3.0}}) == (
        "frequency grids differ in the assessed range: rev1 has 2 Hz, lacks 3 Hz"
    )
