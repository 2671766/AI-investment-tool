"""The HTTP API, end to end."""
import sys
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.main import app                                   # noqa: E402
from aidsm.xlsx_io import TEMPLATE                          # noqa: E402

client = TestClient(app)


def test_health_and_config():
    assert client.get("/api/health").json()["status"] == "ok"
    cfg = client.get("/api/config").json()
    assert cfg["alt_ids"][0] == "RES-MOD" and len(cfg["risk"]) == 7


def test_default_case_evaluates_to_research_result():
    case = client.get("/api/case/default").json()
    body = client.post("/api/evaluate", json=case).json()
    alt = body["results"]["alternatives"]["RES-MOD"]
    assert abs(alt["financial"]["summary"]["npv"] - 10.083771600300523) < 1e-9
    assert alt["recommendation"]["level"] == 3


def test_import_export_roundtrip():
    r = client.post("/api/import/xlsx", files={"file": ("m.xlsx", TEMPLATE.read_bytes())})
    assert r.status_code == 200
    case = r.json()
    x = client.post("/api/export/xlsx", json=case)
    assert x.status_code == 200 and x.content[:2] == b"PK"


def test_bad_upload_is_rejected():
    r = client.post("/api/import/xlsx", files={"file": ("x.xlsx", b"not a workbook")})
    assert r.status_code == 400


def test_montecarlo_endpoint():
    case = client.get("/api/case/default").json()
    for row in case["monte_carlo"]["inputs"]["RES-MOD"]:
        if row["variable"] in ("BEN-FRAUD-RED", "CST-INIT-TOTAL"):
            row["enabled"] = "Yes"
    r = client.post("/api/montecarlo", json={"case": case, "alternative": "RES-MOD", "iterations": 1000})
    assert r.status_code == 200, r.text
    assert len(r.json()["histogram"]) == 20
    bad = client.post("/api/montecarlo", json={"case": case, "alternative": "CUS-01"})
    assert bad.status_code == 400
