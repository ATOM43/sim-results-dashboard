from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.services.ingestion import sync_folder

from .helpers import comparison, component_id, get


def test_component_revisions_with_delta_and_margin(loaded: TestClient):
    entries = get(loaded, f"/api/components/{component_id(loaded, 'Bracket')}/revisions")

    assert [e["revision_label"] for e in entries] == ["rev1", "rev2", "rev3"]
    results = [e["result"] for e in entries]
    assert [r["peak_magnitude_mm"] for r in results] == pytest.approx([19.9, 22.0, 13.8])
    assert [r["delta_vs_previous_mm"] for r in results] == [None, 2.1, -8.2]
    assert [r["margin_mm"] for r in results] == [-4.9, -7.0, 1.2]
    assert [r["verdict"] for r in results] == ["FAIL", "FAIL", "PASS"]
    assert {r["source_status"] for r in results} == {"imported"}
    assert all(isinstance(r["warnings"], list) for r in results)


def test_revision_without_a_result_is_listed_as_null(
    client: TestClient, session: Session, inputs: Path
):
    (inputs / "rev2/Housing.csv").unlink()
    sync_folder(session, inputs)

    entries = get(client, f"/api/components/{component_id(client, 'Housing')}/revisions")

    assert [e["revision_label"] for e in entries] == ["rev1", "rev2", "rev3"]
    rev1, rev2, rev3 = (e["result"] for e in entries)
    assert rev2 is None
    assert rev3["delta_vs_previous_mm"] == round(
        rev3["peak_magnitude_mm"] - rev1["peak_magnitude_mm"], 6
    )


def test_comparison_deltas_trends_and_verdicts(loaded: TestClient):
    body = comparison(loaded, "Bracket", "?revisions=rev1,rev2,rev3&baseline=rev1")

    assert body["component"]["name"] == "Bracket"
    assert body["project"]["name"] == "Demo Product"
    assert body["baseline_revision_label"] == "rev1"
    assert [e["revision_label"] for e in body["revisions"]] == ["rev1", "rev2", "rev3"]
    results = [e["result"] for e in body["revisions"]]
    assert [r["delta_vs_previous_mm"] for r in results] == [None, 2.1, -8.2]
    assert [r["delta_vs_baseline_mm"] for r in results] == [None, 2.1, -6.1]
    assert [r["trend"] for r in results] == [None, "degraded", "improved"]
    assert [r["verdict"] for r in results] == ["FAIL", "FAIL", "PASS"]
    assert [r["margin_mm"] for r in results] == [-4.9, -7.0, 1.2]
    frequencies = [s["frequency_hz"] for s in results[0]["samples"]]
    assert len(frequencies) == 15
    assert frequencies == sorted(frequencies)
    assert [s["assessed"] for s in results[0]["samples"]] == [f <= 50.0 for f in frequencies]


def test_comparison_lens_degrades_in_rev3(loaded: TestClient):
    rev3 = comparison(loaded, "Lens", "?revisions=rev1,rev2,rev3")["revisions"][2]["result"]

    assert rev3["delta_vs_previous_mm"] == pytest.approx(1.4)
    assert rev3["trend"] == "degraded"


def test_comparison_against_another_baseline(loaded: TestClient):
    body = comparison(loaded, "Bracket", "?revisions=rev1,rev2,rev3&baseline=rev2")

    assert body["baseline_revision_label"] == "rev2"
    rev1, rev2, rev3 = (e["result"] for e in body["revisions"])
    assert rev2["delta_vs_baseline_mm"] is None
    assert rev1["delta_vs_baseline_mm"] == pytest.approx(
        rev1["peak_magnitude_mm"] - rev2["peak_magnitude_mm"]
    )
    assert rev3["delta_vs_baseline_mm"] == pytest.approx(-8.2)


def test_comparison_flags_a_grid_mismatch_without_resampling(loaded: TestClient):
    mixed = comparison(loaded, "Bracket", "?revisions=rev1,rev2,rev3")
    same = comparison(loaded, "Bracket", "?revisions=rev2,rev3")

    assert mixed["grid_mismatch"] is True
    assert mixed["grid_note"] == (
        "frequency grids differ in the assessed range: rev1 has 37.6 Hz, lacks 37.8 Hz"
    )
    assert (same["grid_mismatch"], same["grid_note"]) == (False, None)
    frequencies = [{s["frequency_hz"] for s in e["result"]["samples"]} for e in mixed["revisions"]]
    assert 37.6 in frequencies[0] and 37.6 not in frequencies[1]


def test_comparison_revision_without_a_result(client: TestClient, session: Session, inputs: Path):
    (inputs / "rev2/Housing.csv").unlink()
    sync_folder(session, inputs)

    body = comparison(client, "Housing", "?revisions=rev1,rev2,rev3")

    assert [e["revision_label"] for e in body["revisions"]] == ["rev1", "rev2", "rev3"]
    rev1, rev2, rev3 = (e["result"] for e in body["revisions"])
    assert rev2 is None
    assert rev3["delta_vs_previous_mm"] == pytest.approx(
        rev3["peak_magnitude_mm"] - rev1["peak_magnitude_mm"]
    )
    assert rev3["trend"] == "improved"
    # Omitting `revisions` selects only the revisions that have a result.
    assert [e["revision_label"] for e in comparison(client, "Housing")["revisions"]] == [
        "rev1",
        "rev3",
    ]


def test_comparison_defaults_to_all_revisions_with_a_result(loaded: TestClient):
    body = comparison(loaded, "Bracket")

    assert [e["revision_label"] for e in body["revisions"]] == ["rev1", "rev2", "rev3"]
    assert body["baseline_revision_label"] == "rev1"
    assert all(e["result"] is not None for e in body["revisions"])


@pytest.mark.parametrize("query", ["?revisions=rev1,rev9", "?baseline=rev9"])
def test_comparison_unknown_revision_label_returns_400(loaded: TestClient, query: str):
    bracket = component_id(loaded, "Bracket")

    response = loaded.get(f"/api/components/{bracket}/comparison{query}")

    assert response.status_code == 400
    assert response.json() == {"detail": f"revision rev9 not found for component {bracket}"}


@pytest.mark.parametrize(
    ("path", "detail"),
    [
        ("/api/components/999/revisions", "component 999 not found"),
        ("/api/components/999/comparison", "component 999 not found"),
    ],
)
def test_unknown_id_returns_404(loaded: TestClient, path: str, detail: str):
    response = loaded.get(path)

    assert response.status_code == 404
    assert response.json() == {"detail": detail}
