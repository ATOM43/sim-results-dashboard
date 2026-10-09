from fastapi.testclient import TestClient


def get(client: TestClient, path: str):
    response = client.get(path)
    assert response.status_code == 200, response.text
    return response.json()


def component_id(client: TestClient, name: str) -> int:
    project_id = get(client, "/api/projects")[0]["id"]
    components = get(client, f"/api/projects/{project_id}/components")
    return next(c["id"] for c in components if c["name"] == name)


def comparison(client: TestClient, name: str, query: str = ""):
    return get(client, f"/api/components/{component_id(client, name)}/comparison{query}")
