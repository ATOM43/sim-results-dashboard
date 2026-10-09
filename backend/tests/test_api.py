from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.db.base import get_session
from app.main import app
from app.services.ingestion import sync_folder


@pytest.fixture
def client(session: Session, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    """A client on the fresh, empty test database."""

    def override_session():
        with Session(session.get_bind()) as request_session:
            yield request_session

    monkeypatch.setitem(app.dependency_overrides, get_session, override_session)
    return TestClient(app)


@pytest.fixture
def loaded(client: TestClient, session: Session, inputs: Path) -> TestClient:
    """The client after the supplied data has been imported."""
    sync_folder(session, inputs)
    return client


def get(client: TestClient, path: str):
    response = client.get(path)
    assert response.status_code == 200, response.text
    return response.json()


def component_id(client: TestClient, name: str) -> int:
    project_id = get(client, "/api/projects")[0]["id"]
    components = get(client, f"/api/projects/{project_id}/components")
    return next(c["id"] for c in components if c["name"] == name)


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


def test_result_detail(loaded: TestClient):
    entries = get(loaded, f"/api/components/{component_id(loaded, 'Bracket')}/revisions")

    result = get(loaded, f"/api/results/{entries[0]['result']['result_id']}")

    assert result["project"]["name"] == "Demo Product"
    assert result["component"]["name"] == "Bracket"
    assert (result["revision"]["label"], result["revision"]["sort_key"]) == ("rev1", 1)
    frequencies = [s["frequency_hz"] for s in result["samples"]]
    assert len(frequencies) == result["sample_count"] == 15
    assert frequencies == sorted(frequencies)
    assert [s["assessed"] for s in result["samples"]] == [f <= 50.0 for f in frequencies]
    assert [s["assessed"] for s in result["samples"]].count(True) == 8
    assert (result["peak_magnitude_mm"], result["peak_frequency_hz"]) == pytest.approx((19.9, 37.6))
    assert (result["limit_mm"], result["assess_max_hz"]) == (15.0, 50.0)
    assert (result["verdict"], result["margin_mm"]) == ("FAIL", -4.9)
    assert result["source"]["source_key"] == "rev1/Bracket.csv"
    assert result["source"]["status"] == "imported"
    assert result["source"]["last_imported_at"]
    assert result["source"]["warnings"] == [
        "frequency grid differs from other revisions of Bracket: has 37.6 Hz, lacks 37.8 Hz"
    ]


def test_import_status(loaded: TestClient):
    status = get(loaded, "/api/import/status")

    assert status["counts"] == {"imported": 9, "failed": 0, "missing": 0}
    assert len(status["files"]) == 9
    assert [f["source_key"] for f in status["files"]] == sorted(
        f["source_key"] for f in status["files"]
    )
    assert status["last_imported_at"] == max(f["last_imported_at"] for f in status["files"])
    assert status["files"][0]["error_message"] is None


def test_empty_database_returns_empty_data(client: TestClient):
    assert get(client, "/api/projects") == []
    assert get(client, "/api/import/status") == {
        "last_imported_at": None,
        "counts": {"imported": 0, "failed": 0, "missing": 0},
        "files": [],
    }


@pytest.mark.parametrize(
    ("path", "detail"),
    [
        ("/api/projects/999/components", "project 999 not found"),
        ("/api/projects/999/revisions", "project 999 not found"),
        ("/api/components/999/revisions", "component 999 not found"),
        ("/api/results/999", "result 999 not found"),
    ],
)
def test_unknown_id_returns_404(loaded: TestClient, path: str, detail: str):
    response = loaded.get(path)

    assert response.status_code == 404
    assert response.json() == {"detail": detail}


def test_openapi_lists_the_endpoints_with_typed_responses(client: TestClient):
    paths = get(client, "/openapi.json")["paths"]

    for path in (
        "/api/projects",
        "/api/projects/{project_id}/components",
        "/api/projects/{project_id}/revisions",
        "/api/components/{component_id}/revisions",
        "/api/results/{result_id}",
        "/api/import/status",
    ):
        schema = paths[path]["get"]["responses"]["200"]["content"]["application/json"]["schema"]
        assert "$ref" in schema or "$ref" in schema["items"], path
