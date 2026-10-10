from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import Demand
from app.services.demands import seed_demands
from app.services.ingestion import ingest_file, sync_folder

from .helpers import component_id, get

HEADER = "Frequency [Hz],Magnitude [mm]\n"
ORIGIN_FIELDS = (
    "origin_type",
    "origin_revision_label",
    "origin_metric",
    "origin_value_mm",
    "origin_frequency_hz",
    "origin_limit_mm",
    "origin_assess_max_hz",
)


def result_id(client: TestClient, component: str, label: str) -> int:
    entries = get(client, f"/api/components/{component_id(client, component)}/revisions")
    return next(e["result"]["result_id"] for e in entries if e["revision_label"] == label)


def raise_demand(client: TestClient, component: str, label: str = "rev1") -> dict:
    response = client.post(
        "/api/demands",
        json={"origin_result_id": result_id(client, component, label), "description": "fix it"},
    )
    assert response.status_code == 201, response.text
    return response.json()


def history(demand: dict) -> list[tuple]:
    return [(e["revision_label"], e["peak_magnitude_mm"], e["verdict"]) for e in demand["history"]]


def test_create_from_fail_result_freezes_the_finding(loaded: TestClient):
    demand = raise_demand(loaded, "Bracket")

    assert (demand["status"], demand["description"]) == ("Open", "fix it")
    assert demand["component"]["name"] == "Bracket"
    assert demand["project"]["name"] == "Demo Product"
    assert [demand[f] for f in ORIGIN_FIELDS] == [
        "finding",
        "rev1",
        "peak_magnitude",
        pytest.approx(19.9),
        pytest.approx(37.6),
        pytest.approx(15.0),
        pytest.approx(50.0),
    ]
    assert get(loaded, f"/api/demands/{demand['id']}") == demand


def test_create_from_pass_result_is_rejected(loaded: TestClient, session: Session):
    response = loaded.post(
        "/api/demands",
        json={"origin_result_id": result_id(loaded, "Housing", "rev2"), "description": "x"},
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "cannot raise a demand from a passing result"}
    assert session.scalar(select(func.count()).select_from(Demand)) == 0


def test_create_manual(loaded: TestClient):
    lens = component_id(loaded, "Lens")

    response = loaded.post(
        "/api/demands",
        json={"origin_type": "manual", "component_id": lens, "description": "check the mount"},
    )

    assert response.status_code == 201, response.text
    demand = response.json()
    assert demand["component"] == {"id": lens, "name": "Lens"}
    assert [demand[f] for f in ORIGIN_FIELDS] == ["manual", None, None, None, None, None, None]
    # No origin revision: history starts at the earliest revision.
    assert [e["revision_label"] for e in demand["history"]] == ["rev1", "rev2", "rev3"]


@pytest.mark.parametrize(
    ("body", "status", "detail"),
    [
        ({"origin_result_id": 999, "description": "x"}, 404, "result 999 not found"),
        (
            {"origin_type": "manual", "component_id": 999, "description": "x"},
            404,
            "component 999 not found",
        ),
        (
            {"description": "x"},
            400,
            "supply either origin_result_id, or origin_type 'manual' with component_id",
        ),
        (
            {"origin_type": "manual", "description": "x"},
            400,
            "supply either origin_result_id, or origin_type 'manual' with component_id",
        ),
    ],
)
def test_create_rejects_bad_bodies(loaded: TestClient, body: dict, status: int, detail: str):
    response = loaded.post("/api/demands", json=body)

    assert response.status_code == status
    assert response.json() == {"detail": detail}


@pytest.mark.parametrize(
    ("body", "field"),
    [
        ({"origin_result_id": 1, "description": " "}, "description"),
        ({"origin_result_id": 1, "description": ""}, "description"),
        ({"origin_result_id": 1}, "description"),
        ({"origin_type": "bogus", "origin_result_id": 1, "description": "x"}, "origin_type"),
    ],
)
def test_create_rejects_malformed_fields(
    loaded: TestClient, session: Session, body: dict, field: str
):
    response = loaded.post("/api/demands", json=body)

    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", field]
    assert session.scalar(select(func.count()).select_from(Demand)) == 0


def test_description_is_trimmed(loaded: TestClient):
    body = {"origin_result_id": result_id(loaded, "Lens", "rev1"), "description": "  fix it \n"}
    demand = loaded.post("/api/demands", json=body).json()
    assert demand["description"] == "fix it"

    patched = loaded.patch(f"/api/demands/{demand['id']}", json={"description": " new  "})
    assert patched.json()["description"] == "new"


def test_a_component_may_have_several_demands(loaded: TestClient):
    first, second = raise_demand(loaded, "Lens"), raise_demand(loaded, "Lens")

    assert first["id"] != second["id"]
    # Newest first.
    assert [d["id"] for d in get(loaded, "/api/demands")] == [second["id"], first["id"]]


def test_history_runs_from_the_origin_revision_forward(loaded: TestClient):
    demand = raise_demand(loaded, "Bracket")

    assert history(demand) == [
        ("rev1", pytest.approx(19.9), "FAIL"),
        ("rev2", pytest.approx(22.0), "FAIL"),
        ("rev3", pytest.approx(13.8), "PASS"),
    ]
    assert demand["latest_result"] == demand["history"][-1]
    assert demand["latest_result"]["result_id"] == result_id(loaded, "Bracket", "rev3")


def test_new_revision_joins_history_without_a_new_demand(
    loaded: TestClient, session: Session, inputs: Path
):
    demand = raise_demand(loaded, "Lens")
    assert demand["latest_passes_but_open"] is False

    (inputs / "rev4").mkdir()
    (inputs / "rev4/Lens.csv").write_text(HEADER + "5.0,1.0\n37.8,12.5\n60,1.0\n")
    sync_folder(session, inputs)

    reread = get(loaded, f"/api/demands/{demand['id']}")
    assert [d["id"] for d in get(loaded, "/api/demands")] == [demand["id"]]
    assert history(reread)[:3] == history(demand)
    assert history(reread)[3] == ("rev4", pytest.approx(12.5), "PASS")
    assert reread["latest_result"]["revision_label"] == "rev4"
    # The passing rev4 result flags the demand but never resolves it.
    assert (reread["status"], reread["latest_passes_but_open"]) == ("Open", True)

    # Bracket has no rev4 file: its history gets an empty rev4 entry and latest stays rev3.
    bracket = raise_demand(loaded, "Bracket")
    assert history(bracket)[-1] == ("rev4", None, None)
    assert bracket["history"][-1]["result_id"] is None
    assert bracket["latest_result"]["revision_label"] == "rev3"


def test_passing_latest_result_leaves_status_unchanged(loaded: TestClient):
    demand = raise_demand(loaded, "Bracket")  # rev3 passes

    assert demand["latest_result"]["verdict"] == "PASS"
    assert (demand["status"], demand["latest_passes_but_open"]) == ("Open", True)

    patch = loaded.patch(f"/api/demands/{demand['id']}", json={"status": "In Progress"})
    assert (patch.json()["status"], patch.json()["latest_passes_but_open"]) == ("In Progress", True)

    patch = loaded.patch(f"/api/demands/{demand['id']}", json={"status": "Resolved"})
    assert (patch.json()["status"], patch.json()["latest_passes_but_open"]) == ("Resolved", False)


def test_patch_description_and_status_round_trip(loaded: TestClient):
    demand = raise_demand(loaded, "Lens")
    path = f"/api/demands/{demand['id']}"

    response = loaded.patch(path, json={"description": "stiffen the rib", "status": "In Progress"})

    assert response.status_code == 200, response.text
    expected = {**demand, "description": "stiffen the rib", "status": "In Progress"}
    assert response.json() == expected
    assert get(loaded, path) == expected

    # A partial body leaves the other field alone.
    assert loaded.patch(path, json={"status": "Open"}).json() == {**expected, "status": "Open"}


@pytest.mark.parametrize(
    ("body", "detail"),
    [
        (
            {"origin_value_mm": 1.0},
            "cannot change origin_value_mm: only description and status are editable",
        ),
        (
            {"status": "Resolved", "origin_revision_label": "rev2"},
            "cannot change origin_revision_label: only description and status are editable",
        ),
        (
            {"component_id": 2},
            "cannot change component_id: only description and status are editable",
        ),
    ],
)
def test_patch_rejects_read_only_fields_and_bad_values(loaded: TestClient, body: dict, detail: str):
    demand = raise_demand(loaded, "Bracket")

    response = loaded.patch(f"/api/demands/{demand['id']}", json=body)

    assert response.status_code == 400
    assert response.json() == {"detail": detail}
    assert get(loaded, f"/api/demands/{demand['id']}") == demand


@pytest.mark.parametrize(
    ("body", "field"),
    [
        ({"status": "Done"}, "status"),
        ({"description": ""}, "description"),
        ({"description": " "}, "description"),
    ],
)
def test_patch_rejects_malformed_fields(loaded: TestClient, body: dict, field: str):
    demand = raise_demand(loaded, "Bracket")

    response = loaded.patch(f"/api/demands/{demand['id']}", json=body)

    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", field]
    assert get(loaded, f"/api/demands/{demand['id']}") == demand


def test_reimporting_a_changed_file_keeps_the_frozen_origin(
    loaded: TestClient, session: Session, inputs: Path
):
    demand = raise_demand(loaded, "Bracket")

    (inputs / "rev1/Bracket.csv").write_text(HEADER + "5.0,1.0\n30.0,25.5\n60,1.0\n")
    assert sync_folder(session, inputs).updated == 1

    reread = get(loaded, f"/api/demands/{demand['id']}")
    assert {f: reread[f] for f in ORIGIN_FIELDS} == {f: demand[f] for f in ORIGIN_FIELDS}
    assert (reread["origin_value_mm"], reread["origin_frequency_hz"]) == pytest.approx((19.9, 37.6))
    # The live history does follow the re-import.
    assert history(reread)[0] == ("rev1", pytest.approx(25.5), "FAIL")


def test_filters(loaded: TestClient, session: Session):
    bracket = raise_demand(loaded, "Bracket")
    housing = raise_demand(loaded, "Housing")
    lens = raise_demand(loaded, "Lens")
    loaded.patch(f"/api/demands/{lens['id']}", json={"status": "Resolved"})
    outcome = ingest_file(
        session,
        project_name="Other Product",
        revision_label="rev1",
        revision_sort_key=1,
        component_name="Bracket",
        source_type="upload",
        source_key="other/rev1/Bracket.csv",
        original_filename="Bracket.csv",
        stored_path="other/rev1/Bracket.csv",
        content=(HEADER + "5.0,1.0\n30.0,20.0\n60,1.0\n").encode(),
    )
    assert outcome.outcome == "inserted", outcome.message
    other = get(loaded, "/api/projects")
    other_id = next(p["id"] for p in other if p["name"] == "Other Product")
    other_bracket = get(loaded, f"/api/projects/{other_id}/components")[0]
    entries = get(loaded, f"/api/components/{other_bracket['id']}/revisions")
    response = loaded.post(
        "/api/demands",
        json={"origin_result_id": entries[0]["result"]["result_id"], "description": "x"},
    )
    assert response.status_code == 201, response.text
    foreign = response.json()
    assert foreign["project"]["name"] == "Other Product"
    demo_id = bracket["project"]["id"]

    def ids(query: str) -> list[int]:
        return [d["id"] for d in get(loaded, f"/api/demands{query}")]

    assert ids("") == [foreign["id"], lens["id"], housing["id"], bracket["id"]]
    assert ids("?status=Open") == [foreign["id"], housing["id"], bracket["id"]]
    assert ids("?status=Resolved") == [lens["id"]]
    assert ids(f"?component_id={housing['component']['id']}") == [housing["id"]]
    assert ids(f"?project_id={demo_id}") == [lens["id"], housing["id"], bracket["id"]]
    assert ids(f"?project_id={other_id}") == [foreign["id"]]
    assert ids(f"?project_id={demo_id}&status=Open") == [housing["id"], bracket["id"]]
    assert ids(f"?status=Resolved&component_id={lens['component']['id']}&project_id={demo_id}") == [
        lens["id"]
    ]
    assert ids(f"?status=Resolved&component_id={housing['component']['id']}") == []
    assert ids(f"?project_id={other_id}&component_id={housing['component']['id']}") == []


def test_invalid_status_filter_is_rejected(loaded: TestClient):
    raise_demand(loaded, "Bracket")

    response = loaded.get("/api/demands?status=Bogus")

    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["query", "status"]
    assert len(get(loaded, "/api/demands?status=In%20Progress")) == 0


def test_seeded_demands_list(loaded: TestClient, session: Session):
    seed_demands(session)

    demands = get(loaded, "/api/demands")

    assert sorted((d["component"]["name"], d["origin_value_mm"]) for d in demands) == [
        ("Bracket", pytest.approx(19.9)),
        ("Housing", pytest.approx(16.7)),
        ("Lens", pytest.approx(18.0)),
    ]
    for demand in demands:
        assert demand["status"] == "Open"
        assert [e["revision_label"] for e in demand["history"]] == ["rev1", "rev2", "rev3"]
    flags = {d["component"]["name"]: d["latest_passes_but_open"] for d in demands}
    assert flags == {"Bracket": True, "Housing": True, "Lens": False}


def test_unknown_demand_returns_404(loaded: TestClient):
    get_response = loaded.get("/api/demands/999")
    patch_response = loaded.patch("/api/demands/999", json={"status": "Resolved"})

    for response in (get_response, patch_response):
        assert response.status_code == 404
        assert response.json() == {"detail": "demand 999 not found"}
