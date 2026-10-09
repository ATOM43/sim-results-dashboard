import pytest
from fastapi.testclient import TestClient

from .helpers import component_id, get


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


@pytest.mark.parametrize(
    ("path", "detail"),
    [
        ("/api/results/999", "result 999 not found"),
    ],
)
def test_unknown_id_returns_404(loaded: TestClient, path: str, detail: str):
    response = loaded.get(path)

    assert response.status_code == 404
    assert response.json() == {"detail": detail}
