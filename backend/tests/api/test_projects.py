from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.services.ingestion import sync_folder

from .helpers import get


def test_projects(loaded: TestClient):
    projects = get(loaded, "/api/projects")

    assert len(projects) == 1
    assert projects[0]["name"] == "Demo Product"
    assert (projects[0]["component_count"], projects[0]["revision_count"]) == (3, 3)


def test_components_carry_their_latest_result(loaded: TestClient):
    project_id = get(loaded, "/api/projects")[0]["id"]

    components = get(loaded, f"/api/projects/{project_id}/components")

    assert [
        (c["name"], c["latest"]["revision_label"], c["latest"]["peak_magnitude_mm"])
        for c in components
    ] == [
        ("Bracket", "rev3", pytest.approx(13.8)),
        ("Housing", "rev3", pytest.approx(14.2)),
        ("Lens", "rev3", pytest.approx(17.5)),
    ]
    assert [c["latest"]["verdict"] for c in components] == ["PASS", "PASS", "FAIL"]
    assert set(components[0]["latest"]) == {
        "result_id",
        "revision_label",
        "peak_magnitude_mm",
        "peak_frequency_hz",
        "verdict",
    }


def test_project_revisions(loaded: TestClient):
    project_id = get(loaded, "/api/projects")[0]["id"]

    revisions = get(loaded, f"/api/projects/{project_id}/revisions")

    assert [(r["label"], r["sort_key"]) for r in revisions] == [
        ("rev1", 1),
        ("rev2", 2),
        ("rev3", 3),
    ]
    assert (revisions[0]["result_count"], revisions[0]["pass_count"]) == (3, 0)
    assert revisions[0]["fail_count"] == 3
    assert all(r["pass_count"] + r["fail_count"] == r["result_count"] == 3 for r in revisions)


def test_matrix(loaded: TestClient):
    project_id = get(loaded, "/api/projects")[0]["id"]

    matrix = get(loaded, f"/api/projects/{project_id}/matrix")

    assert matrix["project"] == {"id": project_id, "name": "Demo Product"}
    assert [(r["label"], r["sort_key"]) for r in matrix["revisions"]] == [
        ("rev1", 1),
        ("rev2", 2),
        ("rev3", 3),
    ]
    assert [c["name"] for c in matrix["components"]] == ["Bracket", "Housing", "Lens"]
    revision_ids = [r["id"] for r in matrix["revisions"]]
    for component in matrix["components"]:
        assert [cell["revision_id"] for cell in component["cells"]] == revision_ids
    bracket, housing, lens = matrix["components"]
    assert [cell["verdict"] for cell in housing["cells"]] == ["FAIL", "PASS", "PASS"]
    assert [cell["peak_magnitude_mm"] for cell in bracket["cells"]] == pytest.approx(
        [19.9, 22.0, 13.8]
    )
    assert [cell["trend"] for cell in bracket["cells"]] == [None, "degraded", "improved"]
    assert lens["cells"][2]["trend"] == "degraded"


def test_matrix_cell_is_null_without_a_result(client: TestClient, session: Session, inputs: Path):
    (inputs / "rev2/Housing.csv").unlink()
    sync_folder(session, inputs)
    project_id = get(client, "/api/projects")[0]["id"]

    housing = get(client, f"/api/projects/{project_id}/matrix")["components"][1]

    assert housing["name"] == "Housing"
    assert housing["cells"][1] is None
    assert housing["cells"][2]["trend"] == "improved"  # against rev1, the closest with a result


@pytest.mark.parametrize(
    ("path", "detail"),
    [
        ("/api/projects/999/components", "project 999 not found"),
        ("/api/projects/999/revisions", "project 999 not found"),
        ("/api/projects/999/matrix", "project 999 not found"),
    ],
)
def test_unknown_id_returns_404(loaded: TestClient, path: str, detail: str):
    response = loaded.get(path)

    assert response.status_code == 404
    assert response.json() == {"detail": detail}
