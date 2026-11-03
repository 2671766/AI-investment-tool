"""Monte Carlo parity with engine v2.2, staleness, and the import/export round trip."""
import copy
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from aidsm import montecarlo                                  # noqa: E402
from aidsm.compute import evaluate                            # noqa: E402
from aidsm.model import blank_case, normalise                 # noqa: E402
from aidsm.xlsx_io import TEMPLATE, export_workbook, import_workbook  # noqa: E402


def _mc_fixture():
    return json.loads((HERE / "fixtures_mc.json").read_text())


def test_monte_carlo_matches_engine_v22():
    fx = _mc_fixture()
    res = montecarlo.run(fx["case"])
    st = fx["stored"]
    for label, stats in st["summary"].items():
        for k, v in stats.items():
            assert round(res["summary"][label][k], 6) == v, (label, k)
    for k, v in st["probabilities"].items():
        assert res["probabilities"][k] == v
    assert [d["variable_id"] for d in res["drivers"]] == [d["variable_id"] for d in st["drivers"]]
    for a, b in zip(res["drivers"], st["drivers"]):
        assert round(a["rho"], 6) == b["rho"]
    assert [h["count"] for h in res["histogram"]] == [h["count"] for h in st["histogram"]]


def test_monte_carlo_staleness():
    case = normalise(_mc_fixture()["case"])
    assert montecarlo.status(case)["status"] == "Not Run"
    case["mc_result"] = montecarlo.run(case)
    assert montecarlo.status(case)["status"] == "Current"
    r = evaluate(case)["alternatives"]["RES-MOD"]["recommendation"]
    assert r["reason_codes"].endswith("MC_CURRENT")
    case["baseline"]["fraud_exposure"] = 301
    assert montecarlo.status(case)["status"] == "Out of Date"
    assert evaluate(case)["alternatives"]["RES-MOD"]["recommendation"]["reason_codes"].endswith("MC_NOT_RUN")


def test_monte_carlo_validation_messages():
    case = normalise(_mc_fixture()["case"])
    rows = case["monte_carlo"]["inputs"]["RES-MOD"]
    for r in rows:
        if r["variable"] == "CST-VENDOR":
            r["enabled"] = "Yes"
    try:
        montecarlo.run(case)
    except montecarlo.MCInputError as exc:
        assert "double count" in str(exc)
    else:
        raise AssertionError("expected a validation error")


def test_export_then_import_is_lossless():
    case = import_workbook(TEMPLATE.read_bytes())
    case["alternatives"][2]["active"] = True
    case["alternatives"][2]["benefits"]["fraud_red"] = 0.07
    case["alternatives"][2]["ramp"][0] = 0.5
    case["monitoring"]["review_year"] = 2
    back = import_workbook(export_workbook(case))
    assert json.dumps(back, sort_keys=True, default=str) == json.dumps(case, sort_keys=True, default=str)


def test_blank_case_evaluates():
    res = evaluate(blank_case())
    assert res["alternatives"]["RES-MOD"]["recommendation"]["level"] == 0


def test_research_reproduction_on_default_case():
    res = evaluate(import_workbook(TEMPLATE.read_bytes()))
    assert all(r["result"] == "PASS" for r in res["research_reproduction"])
    assert all(v["result"] == "PASS" for v in res["verification"])


def test_compatibility_mode_switch():
    fx = json.loads((HERE / "fixtures" / "methods.json").read_text())
    case = normalise(fx["case"])
    on = evaluate(case)["alternatives"]["CUS-01"]["drivers"]["rows"]
    work_on = next(r for r in on if r["variable_id"] == "BEN-WORK-RED")
    assert work_on["impact"] == 0
    case["settings"]["workbook_compatibility"] = False
    off = evaluate(case)["alternatives"]["CUS-01"]["drivers"]["rows"]
    work_off = next(r for r in off if r["variable_id"] == "BEN-WORK-RED")
    assert work_off["impact"] > 0


def _only(case, alt, **enable):
    """Switch on exactly the given variables ({variable_id: overrides}) for one alternative."""
    for r in case["monte_carlo"]["inputs"][alt]:
        r["enabled"] = "No"
        if r["variable"] in enable:
            r.update(enabled="Yes", **enable[r["variable"]])
    return case


def test_monte_carlo_ramp_multiplier_defaults_run():
    # The default maximum (base 1.0 x 1.2) used to fall outside the 0-1 domain, so every run failed.
    case = _only(normalise(_mc_fixture()["case"]), "RES-MOD", **{"BEN-RAMP-MULT": {}})
    row = next(r for r in montecarlo.input_table(case, "RES-MOD") if r["variable"] == "BEN-RAMP-MULT")
    assert (row["min"], row["mode"], row["max"]) == (0.8, 1.0, 1.0)
    assert montecarlo.run(case, iterations=500)["status"] == "Run complete"


def test_monte_carlo_truncated_normal_defaults():
    # A blank sd defaults to a sixth of the range, and a zero range no longer hangs the sampler.
    case = _only(normalise(_mc_fixture()["case"]), "RES-MOD",
                 **{"BEN-FRAUD-RED": {"distribution": "Truncated Normal"},
                    "CST-INIT-TOTAL": {"distribution": "Truncated Normal", "min": 5, "mode": 5, "max": 5}})
    res = montecarlo.run(case, iterations=500)
    assert res["status"] == "Run complete"
    row = next(r for r in res["inputs"] if r["variable"] == "BEN-FRAUD-RED")
    assert row["sd_default"] and abs(row["sd"] - (row["max"] - row["min"]) / 6) < 1e-12


def test_monte_carlo_negative_base_default_order():
    case = normalise(_mc_fixture()["case"])
    case["alternatives"][0]["benefits"]["fp_red"] = -0.1
    row = next(r for r in montecarlo.input_table(case, "RES-MOD") if r["variable"] == "BEN-FP-RED")
    assert row["min"] <= row["mode"] <= row["max"]
