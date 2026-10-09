from fastapi.testclient import TestClient

from .helpers import get


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


def test_openapi_lists_the_endpoints_with_typed_responses(client: TestClient):
    paths = get(client, "/openapi.json")["paths"]

    for path in (
        "/api/projects",
        "/api/projects/{project_id}/components",
        "/api/projects/{project_id}/revisions",
        "/api/components/{component_id}/revisions",
        "/api/components/{component_id}/comparison",
        "/api/projects/{project_id}/matrix",
        "/api/results/{result_id}",
        "/api/import/status",
    ):
        schema = paths[path]["get"]["responses"]["200"]["content"]["application/json"]["schema"]
        assert "$ref" in schema or "$ref" in schema["items"], path
