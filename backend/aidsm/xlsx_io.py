"""Read a case out of a v1.5 workbook, and write a case back into the workbook template.

Import reads only the user-input cells. A cell that still holds the workbook's default formula
(for example a scenario value of =05_Benefits!D9*0.8) is imported as None, which the web app
treats as "use the default", exactly as the workbook does.

Export writes the inputs into a copy of the frozen v1.5 workbook and flags it for a full
recalculation when Excel opens it, so every formula on every sheet recomputes from the web
app's inputs. Excel stays the verified reference model.
"""
from __future__ import annotations

import datetime as dt
import io
from pathlib import Path

from openpyxl import load_workbook

from .constants import ALT_IDS, MAX_YEARS, MC_VARIABLES, MON_BENEFIT_CATS, MON_COST_CATS, MON_KPIS
from .model import SCENARIO_KEYS, normalise

TEMPLATE = Path(__file__).parent / "data" / "template.xlsx"
COLS = ["D", "E", "F", "G", "H"]                       # one column per alternative
YEAR_COLS = [chr(ord("D") + i) for i in range(MAX_YEARS)]          # D..R = Years 1..15
MON_YEAR_COLS = [chr(ord("D") + i) for i in range(MAX_YEARS + 1)]  # D..S = Years 0..15

CASE_CELLS = {"case_id": "D6", "case_name": "D7", "assessment_date": "D8", "bank_context": "D9",
              "prepared_by": "D10", "status": "D11", "notes": "D12"}
FIN_CELLS = {"horizon": "D16", "rate": "D17", "ann_years": "D20"}
BASELINE_CELLS = {"fraud_exposure": "D6", "case_cost": "D7", "fp_cost": "D8", "alerts": "D12", "cases": "D13",
                  "fp_rate": "D14", "analyst_hours": "D15", "analyst_cost": "D16", "resolution_time": "D17",
                  "loss_per_case": "D18"}
ALT_CELLS = {"name": "B", "active": "D", "description": "E", "adoption_depth": "F", "workflow_areas": "G",
             "human_oversight": "H", "start_year": "I", "notes": "J"}
BEN_ROWS = {"fraud_method": 7, "fraud_red": 9, "fraud_direct": 10, "case_method": 14, "case_red": 16,
            "work_red": 18, "case_direct": 20, "fp_method": 24, "fp_red": 26, "fp_event_cost": 29,
            "fp_direct": 30, "other_desc": 34, "other_direct": 35, "other_dup": 36,
            "kpi_resolution": 40, "kpi_prioritisation": 41, "kpi_efficiency": 42}
INIT_ROWS = {"implement": 7, "integrate": 8, "train": 9, "data": 10, "governance": 11, "other": 12}
REC_ROWS = {"vendor": 16, "data": 17, "train": 18, "maintenance": 19, "monitoring": 20, "governance": 21, "other": 22}
SCN_FIRST_ROW = {k: 6 + 3 * i for i, k in enumerate(SCENARIO_KEYS)}   # Downside, Base, Upside
PLAUS_ROWS = {"fraud_lo": 30, "fraud_hi": 31, "cost_lo": 32, "cost_hi": 33, "life_lo": 34, "life_hi": 35, "life_basis": 36}
EV_FIELDS = ["variable_id", "alternative_id", "variable_name", "value", "unit", "source_type", "source", "owner",
             "date", "confidence", "rationale", "notes"]
EV_FIRST, EV_LAST = 5, 53
MON_BEN_ROWS = {"approved": 16, "realised": 34, "forecast": 52}
MON_CST_ROWS = {"approved": 24, "realised": 42, "forecast": 60}


def _clean(v):
    if isinstance(v, dt.datetime):
        return v.date().isoformat()
    if isinstance(v, dt.date):
        return v.isoformat()
    if isinstance(v, str):
        return v
    return v


def _val(ws, addr):
    """The cell's input value, or None when it is blank or holds a formula (= workbook default)."""
    v = ws[addr].value
    if isinstance(v, str) and v.startswith("="):
        return None
    return _clean(v)


def _num(ws, addr):
    v = _val(ws, addr)
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) else (None if v in (None, "") else v)


def _text(ws, addr):
    v = _val(ws, addr)
    return "" if v is None else str(v)


def import_workbook(data: bytes) -> dict:
    wb = load_workbook(io.BytesIO(data), data_only=False)
    need = ["01_Case_Setup", "03_Baseline", "04_AI_Alternatives", "05_Benefits", "06_Costs", "07_Risk"]
    missing = [s for s in need if s not in wb.sheetnames]
    if missing:
        raise ValueError("This does not look like the v1.5 decision-support workbook (missing sheets: %s)"
                         % ", ".join(missing))
    cs, bl, al, be, co, rk = (wb[s] for s in need)
    case = {"meta": {k: _text(cs, a) for k, a in CASE_CELLS.items()},
            "finance": {k: _num(cs, a) for k, a in FIN_CELLS.items()},
            "baseline": {k: _num(bl, a) for k, a in BASELINE_CELLS.items()}}
    if "18_Technical_Config" in wb.sheetnames:
        cfg = wb["18_Technical_Config"]
        bw = [_num(cfg, "D%d" % r) for r in range(12, 19)]
        blam = _num(cfg, "D30")
    else:
        bw, blam = None, None
    case["risk_config"] = {"case_weights": [_num(rk, "C%d" % r) for r in range(6, 13)],
                           "case_lambda": _num(rk, "C27"), "case_lambda_rationale": _text(rk, "C29")}
    if bw and all(isinstance(x, (int, float)) for x in bw):
        case["risk_config"]["benchmark_weights"] = bw
    if isinstance(blam, (int, float)):
        case["risk_config"]["benchmark_lambda"] = blam

    alts = []
    for i, aid in enumerate(ALT_IDS):
        col, row = COLS[i], 5 + i
        a = {"id": aid}
        for k, c in ALT_CELLS.items():
            a[k] = _val(al, "%s%d" % (c, row))
        a["active"] = str(a["active"] or "").strip() == "Yes"
        for k in ("name", "description", "adoption_depth", "workflow_areas", "human_oversight", "notes"):
            a[k] = "" if a[k] is None else str(a[k])
        b = {}
        for k, r in BEN_ROWS.items():
            b[k] = _text(be, "%s%d" % (col, r)) if k.endswith("method") or k in ("other_desc", "other_dup") else _num(be, "%s%d" % (col, r))
        b["other_dup"] = b["other_dup"] or "No"
        for k in ("fraud_method", "case_method", "fp_method"):
            b[k] = b[k] or "Driver-based %"
        a["benefits"] = b
        a["ramp"] = [_num(be, "%s%d" % (c, 58 + i)) for c in YEAR_COLS]
        a["costs"] = {"initial": {k: _num(co, "%s%d" % (col, r)) for k, r in INIT_ROWS.items()},
                      "recurring": {k: _num(co, "%s%d" % (col, r)) for k, r in REC_ROWS.items()},
                      "year_specific": [_num(co, "%s%d" % (c, 33 + i)) or 0.0 for c in YEAR_COLS],
                      "residual": _num(co, "%s42" % col) or 0.0, "residual_basis": _text(co, "%s43" % col)}
        a["risk"] = {"scores": [_num(rk, "%s%d" % (col, r)) for r in range(6, 13)],
                     "critical": [_text(rk, "%s%d" % (col, r)) or "Not assessed" for r in range(32, 39)],
                     "rationale": [_text(rk, "%s%d" % (col, r)) for r in range(44, 51)],
                     "confidence": _text(rk, "%s51" % col),
                     "mitigation": [_text(rk, "%s%d" % (col, r)) for r in range(84, 91)],
                     "review_date": [_text(rk, "%s%d" % (col, r)) for r in range(94, 101)]}
        if "10_Scenarios" in wb.sheetnames:
            sc = wb["10_Scenarios"]
            a["scenarios"] = {k: {s: _num(sc, "%s%d" % (col, r0 + j)) for j, s in enumerate(("Downside", "Base", "Upside"))}
                              for k, r0 in SCN_FIRST_ROW.items()}
            a["plausible"] = {k: (_text(sc, "%s%d" % (col, r)) if k == "life_basis" else _num(sc, "%s%d" % (col, r)))
                              for k, r in PLAUS_ROWS.items()}
        if "14_Recommendation" in wb.sheetnames:
            a["pilot_measurable"] = _text(wb["14_Recommendation"], "%s40" % col) or "Yes"
        alts.append(a)
    case["alternatives"] = alts

    if "02_Evidence_Register" in wb.sheetnames:
        ev = wb["02_Evidence_Register"]
        rows = []
        for r in range(EV_FIRST, EV_LAST + 1):
            rec = {f: _val(ev, "%s%d" % (chr(ord("A") + j), r)) for j, f in enumerate(EV_FIELDS)}
            if rec["variable_id"] in (None, ""):
                continue
            for f in EV_FIELDS:
                if f != "value" and rec[f] is not None:
                    rec[f] = str(rec[f])
            rows.append(rec)
        case["evidence"] = rows

    if "09_Sensitivity" in wb.sheetnames:
        se = wb["09_Sensitivity"]
        case["sensitivity"] = {"alternative": _text(se, "C5"), "variable": _text(se, "G5"), "mode": _text(se, "G6"),
                               "lower": _num(se, "K5"), "upper": _num(se, "K6"), "metric": _text(se, "O5")}
    if "13_Comparison" in wb.sheetnames:
        cp = wb["13_Comparison"]
        case["comparison"] = {"a": _text(cp, "C38"), "b": _text(cp, "C39")}
    if "15_Dashboard" in wb.sheetnames:
        case["dashboard"] = {"alternative": _text(wb["15_Dashboard"], "B4")}

    if "11_MC_Setup" in wb.sheetnames:
        ms = wb["11_MC_Setup"]
        mc = {"alternative": _text(ms, "C5"), "iterations": _num(ms, "C6"), "seed": _num(ms, "C7"), "inputs": {}}
        for i, aid in enumerate(ALT_IDS):
            rows = []
            for k, (var, _, _) in enumerate(MC_VARIABLES):
                r = 14 + i * 10 + k
                rows.append({"variable": _text(ms, "C%d" % r) or var, "enabled": _text(ms, "F%d" % r) or "No",
                             "distribution": _text(ms, "G%d" % r) or "Triangular",
                             "min": _num(ms, "H%d" % r), "mode": _num(ms, "I%d" % r),
                             "max": _num(ms, "J%d" % r), "sd": _num(ms, "K%d" % r)})
            mc["inputs"][aid] = rows
        case["monte_carlo"] = mc

    if "16_Monitoring" in wb.sheetnames:
        mo = wb["16_Monitoring"]
        mon = {"alternative": _text(mo, "C5"), "approval_date": _text(mo, "C7"), "review_year": _num(mo, "C8"),
               "approved_rate": _num(mo, "C9"), "approved_horizon": _num(mo, "C10"), "approved_level": _num(mo, "C11")}
        for kind, base_row in MON_BEN_ROWS.items():
            mon["%s_benefits" % kind] = {k: [_num(mo, "%s%d" % (c, base_row + j)) for c in MON_YEAR_COLS]
                                         for j, (k, _, _) in enumerate(MON_BENEFIT_CATS)}
        for kind, base_row in MON_CST_ROWS.items():
            mon["%s_costs" % kind] = {k: [_num(mo, "%s%d" % (c, base_row + j)) for c in MON_YEAR_COLS]
                                      for j, (k, _, _) in enumerate(MON_COST_CATS)}
        for kind in ("approved", "realised"):
            for key in ("%s_benefits" % kind, "%s_costs" % kind):
                mon[key] = {k: [0.0 if x is None else x for x in v] for k, v in mon[key].items()}
        mon["kpis"] = {name: [_num(mo, "%s%d" % (c, 70 + j)) for c in MON_YEAR_COLS] for j, name in enumerate(MON_KPIS)}
        mon["current_scores"] = [_num(mo, "D%d" % r) for r in range(78, 85)]
        mon["current_critical"] = [_text(mo, "E%d" % r) or "No critical issue" for r in range(78, 85)]
        mon["risk_notes"] = [_text(mo, "F%d" % r) for r in range(78, 85)]
        mon["scenario_factors"] = {s: [_num(mo, "B%d" % r), _num(mo, "C%d" % r)]
                                   for s, r in (("Downside", 121), ("Base", 122), ("Upside", 123))}
        mon["plausible_multiple"] = _num(mo, "C127")
        mon["multiple_basis"] = _text(mo, "C128")
        mon["evidence_status"] = [_text(mo, "D%d" % r) or "Unchanged since approval" for r in range(137, 140)]
        mon["evidence_notes"] = [_text(mo, "F%d" % r) for r in range(137, 140)]
        mon["pilot_measurable"] = _text(mo, "C142") or "Yes"
        mon["variance_threshold"] = _num(mo, "C153")
        log = []
        for r in range(165, 172):
            row = [_val(mo, "%s%d" % (c, r)) for c in "ABCDEFG"]
            if any(x not in (None, "") for x in row):
                log.append(dict(zip(["date", "reviewer", "review_year", "ranpv", "status", "recommendation", "action"], row)))
        mon["log"] = log
        case["monitoring"] = {k: v for k, v in mon.items() if v is not None}
    wb.close()
    out = normalise(_drop_none_defaults(case))
    mc_res = _import_mc_result(data, out)
    if mc_res:
        out["mc_result"] = mc_res
    return out


def _import_mc_result(data, case):
    """Carry a stored 12_MC_Results run into the web app, keeping its currency status."""
    from .montecarlo import state_hash
    wb = load_workbook(io.BytesIO(data), data_only=True)
    if "12_MC_Results" not in wb.sheetnames:
        return None
    mr = wb["12_MC_Results"]
    raw, check = mr["C5"].value, str(mr["C15"].value or "")
    alt = mr["C8"].value
    wb_ok = isinstance(raw, str) and raw not in ("Not Run", "") and alt in ALT_IDS
    if not wb_ok:
        if raw == "Error":
            return {"status": "Error", "message": str(mr["C12"].value or "")}
        return None
    labels = ["NPV", "Risk-adjusted NPV", "Lifecycle CBR", "Risk-adjusted CBR"]
    keys = ["mean", "median", "std", "p5", "p25", "p75", "p95"]
    summary = {lab: {k: mr["%s%d" % (c, 19 + i)].value for k, c in zip(keys, "BCDEFGH")} for i, lab in enumerate(labels)}
    probs = {k: mr["B%d" % (26 + i)].value for i, k in enumerate(["npv_pos", "ranpv_pos", "cbr_gt1", "racbr_gt1"])}
    names = {v: n for v, n, _ in MC_VARIABLES}
    drivers = []
    for r in range(33, 41):
        vid = mr["A%d" % r].value
        if vid:
            drivers.append({"rank": mr["E%d" % r].value, "variable_id": vid, "variable": names.get(vid, vid),
                            "rho": mr["C%d" % r].value, "abs_rho": mr["D%d" % r].value})
    hist = [{"lo": mr["A%d" % r].value, "hi": mr["B%d" % r].value, "count": mr["C%d" % r].value}
            for r in range(44, 64) if mr["C%d" % r].value is not None]
    current = check == "Current"
    wb.close()
    return {"status": "Run complete", "alternative": alt, "iterations": mr["C10"].value, "seed": mr["C11"].value,
            "input_hash": state_hash(case, alt) if current else "imported-out-of-date",
            "engine": "imported from workbook (%s)" % (mr["C13"].value or "monte_carlo_engine.py"),
            "timestamp": mr["C6"].value, "summary": summary, "probabilities": probs, "drivers": drivers,
            "histogram": hist, "cdf": [], "imported": True}


def _drop_none_defaults(case):
    """Fields the workbook leaves to formulas arrive as None; drop the few that must not override defaults."""
    for k in ("horizon", "rate", "ann_years"):
        if case["finance"].get(k) is None:
            case["finance"].pop(k, None)
    mc = case.get("monte_carlo", {})
    for k in ("iterations", "seed"):
        if mc.get(k) is None:
            mc.pop(k, None)
    return case


# ----------------------------------------------------------------------------------- export
def _put(ws, addr, value, keep_formula_if_none=True):
    if value is None and keep_formula_if_none and isinstance(ws[addr].value, str) and str(ws[addr].value).startswith("="):
        return
    ws[addr].value = value


def export_workbook(case_in: dict, template: Path | None = None) -> bytes:
    case = normalise(case_in)
    wb = load_workbook(template or TEMPLATE)
    template_formulas = {(ws.title, c.coordinate): c.value for ws in wb for row in ws.iter_rows() for c in row
                         if c.data_type == "f"}
    cs, bl, al, be, co, rk = (wb[s] for s in ("01_Case_Setup", "03_Baseline", "04_AI_Alternatives",
                                              "05_Benefits", "06_Costs", "07_Risk"))
    for k, a in CASE_CELLS.items():
        cs[a].value = case["meta"].get(k) or None
    for k, a in FIN_CELLS.items():
        cs[a].value = case["finance"].get(k)
    for k, a in BASELINE_CELLS.items():
        bl[a].value = case["baseline"].get(k)
    rc = case["risk_config"]
    for j, r in enumerate(range(6, 13)):
        rk["C%d" % r].value = rc["case_weights"][j]
    rk["C27"].value = rc["case_lambda"]
    rk["C29"].value = rc["case_lambda_rationale"] or None
    for i, a in enumerate(case["alternatives"]):
        col, row = COLS[i], 5 + i
        for k, c in ALT_CELLS.items():
            v = a.get(k)
            if k == "active":
                v = "Yes" if a["active"] else "No"
            al["%s%d" % (c, row)].value = None if v == "" else v
        b = a["benefits"]
        for k, r in BEN_ROWS.items():
            v = b.get(k)
            be["%s%d" % (col, r)].value = None if v == "" else v
        for c, v in zip(YEAR_COLS, a["ramp"]):
            be["%s%d" % (c, 58 + i)].value = v
        cst = a["costs"]
        for k, r in INIT_ROWS.items():
            co["%s%d" % (col, r)].value = cst["initial"].get(k)
        for k, r in REC_ROWS.items():
            co["%s%d" % (col, r)].value = cst["recurring"].get(k)
        for c, v in zip(YEAR_COLS, cst["year_specific"]):
            co["%s%d" % (c, 33 + i)].value = v
        co["%s42" % col].value = cst["residual"]
        co["%s43" % col].value = cst["residual_basis"] or None
        rs = a["risk"]
        for j, r in enumerate(range(6, 13)):
            rk["%s%d" % (col, r)].value = rs["scores"][j]
            rk["%s%d" % (col, 32 + j)].value = rs["critical"][j]
            rk["%s%d" % (col, 44 + j)].value = rs["rationale"][j] or None
            rk["%s%d" % (col, 84 + j)].value = rs["mitigation"][j] or None
            rk["%s%d" % (col, 94 + j)].value = rs["review_date"][j] or None
        rk["%s51" % col].value = rs["confidence"] or None
        sc = wb["10_Scenarios"]
        for k, r0 in SCN_FIRST_ROW.items():
            for j, s in enumerate(("Downside", "Base", "Upside")):
                _put(sc, "%s%d" % (col, r0 + j), a["scenarios"][k][s])
        for k, r in PLAUS_ROWS.items():
            v = a["plausible"].get(k)
            _put(sc, "%s%d" % (col, r), None if v == "" else v)
        wb["14_Recommendation"]["%s40" % col].value = a.get("pilot_measurable", "Yes")

    ev = wb["02_Evidence_Register"]
    for r in range(EV_FIRST, EV_LAST + 1):
        for j in range(len(EV_FIELDS)):
            ev["%s%d" % (chr(ord("A") + j), r)].value = None
    for n, rec in enumerate(case["evidence"][: EV_LAST - EV_FIRST + 1]):
        for j, f in enumerate(EV_FIELDS):
            v = rec.get(f)
            ev["%s%d" % (chr(ord("A") + j), EV_FIRST + n)].value = None if v == "" else v

    se = wb["09_Sensitivity"]
    s = case["sensitivity"]
    se["C5"].value, se["G5"].value, se["G6"].value = s["alternative"], s["variable"], s["mode"]
    se["K5"].value, se["K6"].value, se["O5"].value = s["lower"], s["upper"], s["metric"]
    wb["13_Comparison"]["C38"].value = case["comparison"]["a"]
    wb["13_Comparison"]["C39"].value = case["comparison"]["b"]
    wb["15_Dashboard"]["B4"].value = case["dashboard"]["alternative"]

    ms = wb["11_MC_Setup"]
    mc = case["monte_carlo"]
    ms["C5"].value, ms["C6"].value, ms["C7"].value = mc["alternative"], mc["iterations"], mc["seed"]
    for i, aid in enumerate(ALT_IDS):
        for k, rowd in enumerate(mc["inputs"][aid]):
            r = 14 + i * 10 + k
            ms["F%d" % r].value = rowd["enabled"]
            ms["G%d" % r].value = rowd["distribution"]
            for c, key in (("H", "min"), ("I", "mode"), ("J", "max")):
                _put(ms, "%s%d" % (c, r), rowd.get(key))
            ms["K%d" % r].value = rowd.get("sd")

    mo = wb["16_Monitoring"]
    m = case["monitoring"]
    for addr, key in (("C5", "alternative"), ("C7", "approval_date"), ("C8", "review_year"), ("C9", "approved_rate"),
                      ("C10", "approved_horizon"), ("C11", "approved_level")):
        mo[addr].value = m[key] if m[key] != "" else None
    for kind, base_row in MON_BEN_ROWS.items():
        for j, (k, _, _) in enumerate(MON_BENEFIT_CATS):
            for c, v in zip(MON_YEAR_COLS, m["%s_benefits" % kind][k]):
                _put(mo, "%s%d" % (c, base_row + j), v)
    for kind, base_row in MON_CST_ROWS.items():
        for j, (k, _, _) in enumerate(MON_COST_CATS):
            for c, v in zip(MON_YEAR_COLS, m["%s_costs" % kind][k]):
                _put(mo, "%s%d" % (c, base_row + j), v)
    for j, name in enumerate(MON_KPIS):
        for c, v in zip(MON_YEAR_COLS, m["kpis"].get(name, [])):
            mo["%s%d" % (c, 70 + j)].value = v
    for j, r in enumerate(range(78, 85)):
        _put(mo, "D%d" % r, m["current_scores"][j])
        mo["E%d" % r].value = m["current_critical"][j]
        mo["F%d" % r].value = m["risk_notes"][j] or None
    for s_name, r in (("Downside", 121), ("Base", 122), ("Upside", 123)):
        mo["B%d" % r].value, mo["C%d" % r].value = m["scenario_factors"][s_name]
    mo["C127"].value, mo["C128"].value = m["plausible_multiple"], m["multiple_basis"] or None
    for j, r in enumerate(range(137, 140)):
        mo["D%d" % r].value = m["evidence_status"][j]
        mo["F%d" % r].value = m["evidence_notes"][j] or None
    mo["C142"].value, mo["C153"].value = m["pilot_measurable"], m["variance_threshold"]
    for n, entry in enumerate(m["log"][:7]):
        for c, key in zip("ABCDEFG", ["date", "reviewer", "review_year", "ranpv", "status", "recommendation", "action"]):
            mo["%s%d" % (c, 165 + n)].value = entry.get(key)

    # Monte Carlo results are not written: Excel's 12_MC_Results keeps its own run state, and the
    # Python engine (monte_carlo_engine.py) remains the way to populate it from the workbook.
    # Case text starting with "=" must stay text: only the template's own formulas are formulas.
    for ws in wb:
        for row in ws.iter_rows():
            for c in row:
                if c.data_type == "f" and template_formulas.get((ws.title, c.coordinate)) != c.value:
                    c.data_type = "s"
    wb.calculation.fullCalcOnLoad = True
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
