"""evaluate(case) -> every result the workbook shows, in one JSON-ready dictionary."""
from __future__ import annotations

from . import core, montecarlo
from .constants import ALT_IDS, ENGINE_VERSION, MODEL_VERSION
from .model import get_alt, is_number, normalise
from .monitoring import monitoring


def evaluate_alt(case, alt, ev_idx, checks, mc_state):
    ben = core.benefits(case, alt)
    cst = core.costs(case, alt, ben["total"])
    rsk = core.risk(case, alt, ev_idx)
    fin = core.financial(case, alt, ben, cst, rsk)
    scn = core.scenarios(case, alt, ben, cst, rsk)
    rng = core.plausible_ranges(alt, cst)
    base, fixed = core.base_params(case, alt, ben, cst, rsk)
    drv = core.driver_block(alt, base, fixed, ev_idx, compat=bool(case["settings"]["workbook_compatibility"]))
    be = core.breakeven_feasibility(fin["summary"], ben, cst, rng)
    rec = core.recommendation(case, alt, ben, cst, rsk, fin["summary"], scn, be, drv, checks, mc_state)
    return {"id": alt["id"], "name": alt["name"], "type": alt["type"], "active": alt["active"],
            "benefits": ben, "costs": cst, "risk": rsk, "financial": fin, "scenarios": scn,
            "plausible": rng, "breakeven": be, "drivers": drv, "recommendation": rec,
            "_base": base, "_fixed": fixed}


def sensitivity(case, per_alt, ev_idx):
    panel = case["sensitivity"]
    aid = panel.get("alternative") if panel.get("alternative") in ALT_IDS else ALT_IDS[0]
    r = per_alt[aid]
    alt = get_alt(case, aid)
    base, fixed = r["_base"], r["_fixed"]
    s = r["financial"]["summary"]
    grid = core.sensitivity_grid(case, alt, base, fixed, ev_idx, s["ranpv"])
    test = core.panel_test(case, base, fixed, panel)
    base_pt = core.shadow_eval(base, fixed)
    shadow = []
    for label, model_v, shadow_v in (("PV of benefits", s["pvb"], base_pt["pvb"]), ("PV of costs", s["pvc"], base_pt["pvc"]),
                                      ("NPV", s["npv"], base_pt["npv"]), ("Risk-adjusted NPV", s["ranpv"], base_pt["ranpv"])):
        diff = shadow_v - model_v
        shadow.append({"check": label, "model": model_v, "shadow": shadow_v, "difference": diff,
                       "result": "PASS" if abs(diff) <= 0.0001 else "FAIL"})
    base_rows = [{"variable_id": k, "value": v} for k, v in base.items()]
    return {"alternative": aid, "base_parameters": base_rows, "panel": test, **grid,
            "breakeven": {"be_fraud": s["be_fraud"], "be_imp": s["be_imp"], "be_life": s["be_life"],
                          "plausible": r["plausible"], **r["breakeven"]},
            "shadow_check": shadow}


def comparison(case, per_alt, mc_state):
    a = case["comparison"].get("a") if case["comparison"].get("a") in ALT_IDS else "RES-MOD"
    b = case["comparison"].get("b") if case["comparison"].get("b") in ALT_IDS else "RES-ADV"
    sa, sb = per_alt[a]["financial"]["summary"], per_alt[b]["financial"]["summary"]
    dpvb, dpvc = sb["pvb"] - sa["pvb"], sb["pvc"] - sa["pvc"]
    icbr = None if dpvc == 0 else dpvb / dpvc
    reading = ("Not meaningful" if icbr is None else
               "The additional spend pays for itself on unadjusted terms" if icbr > 1 else
               "The additional spend does not pay for itself on unadjusted terms")
    mc = (case.get("mc_result") or {})
    table = []
    for aid in ALT_IDS:
        r = per_alt[aid]
        s = r["financial"]["summary"]
        mc_here = mc_state["status"] == "Current" and mc_state.get("alternative") == aid
        mc_text = mc_state["text"] if mc_state.get("alternative") == aid else "Not run for this alternative"
        top = [d["variable"] for d in r["drivers"]["top3"]]
        table.append({
            "id": aid, "name": r["name"], "active": r["active"], "initial_cost": r["costs"]["initial"],
            "recurring_cost": r["costs"]["recurring"], "benefit_total": r["benefits"]["total"],
            "pvb": s["pvb"], "pvc": s["pvc"], "npv": s["npv"], "cbr": s["cbr"], "wrs": r["risk"]["wrs"],
            "ri": r["risk"]["ri"], "raf": r["risk"]["raf"], "ranpv": s["ranpv"], "racbr": s["racbr"],
            "payback": s["payback"], "critical": r["risk"]["critical"], "be_fraud": s["be_fraud"],
            "be_imp": s["be_imp"], "be_life": s["be_life"],
            "scn_down": r["scenarios"]["results"]["Downside"]["ranpv"],
            "scn_base": r["scenarios"]["results"]["Base"]["ranpv"],
            "scn_up": r["scenarios"]["results"]["Upside"]["ranpv"],
            "evidence_concerns": r["drivers"]["concerns"], "drivers": top,
            "mc_status": mc_text,
            "mc_median": mc["summary"]["Risk-adjusted NPV"]["median"] if mc_here else None,
            "mc_p5": mc["summary"]["Risk-adjusted NPV"]["p5"] if mc_here else None,
            "mc_p_ranpv": mc["probabilities"]["ranpv_pos"] if mc_here else None,
            "mc_p_racbr": mc["probabilities"]["racbr_gt1"] if mc_here else None,
            "recommendation": r["recommendation"]["label"],
        })
    return {"a": a, "b": b, "table": table,
            "incremental": {"d_pvb": dpvb, "d_pvc": dpvc, "icbr": icbr, "d_npv": sb["npv"] - sa["npv"],
                            "d_ranpv": sb["ranpv"] - sa["ranpv"], "reading": reading}}


def verification(case, per_alt, sens, checks):
    """A compact version of 17_Verification: internal consistency checks the web engine can run itself."""
    out = []
    for aid in ALT_IDS:
        r = per_alt[aid]
        s = r["financial"]["summary"]
        base = r["scenarios"]["results"]["Base"]
        pt = core.shadow_eval(r["_base"], r["_fixed"])
        out.append({"alternative": aid, "check": "Sensitivity base point reproduces the financial model",
                    "result": "PASS" if abs(pt["ranpv"] - s["ranpv"]) <= 1e-4 and abs(pt["pvb"] - s["pvb"]) <= 1e-4 else "FAIL"})
        ann = r["financial"]["annualised"]
        out.append({"alternative": aid, "check": "PV of benefits equals the sum of the yearly PV row",
                    "result": "PASS" if abs(sum(r["financial"]["years"]["pv_benefit"]) - s["pvb"]) <= 1e-9 else "FAIL"})
        out.append({"alternative": aid, "check": "RA-NPV = PVB x RAF - PVC",
                    "result": "PASS" if abs(s["pvb"] * r["risk"]["raf"] - s["pvc"] - s["ranpv"]) <= 1e-9 else "FAIL"})
        driver_based = all(get_alt(case, aid)["benefits"][k] == core.DP for k in ("fraud_method", "case_method", "fp_method"))
        if driver_based and r["costs"]["residual"] == 0:
            out.append({"alternative": aid, "check": "Base scenario reproduces the model RA-NPV (driver-based, no residual)",
                        "result": "PASS" if abs(base["ranpv"] - s["ranpv"]) <= 1e-6 else "FAIL"})
        out.append({"alternative": aid, "check": "Annualised total cost = implementation / period + recurring",
                    "result": "PASS" if ann["cost"] == ann["implementation"] + ann["recurring"] else "FAIL"})
    for row in sens["shadow_check"]:
        out.append({"alternative": sens["alternative"], "check": "Shadow engine - " + row["check"], "result": row["result"]})
    return out


def research_reproduction(per_alt):
    """The research benchmark figures the workbook must reproduce (Research Chapter 4)."""
    exp = [("RES-MOD", "Annualised CBR", per_alt["RES-MOD"]["financial"]["annualised"]["cbr"], 1.2344262295081967),
           ("RES-MOD", "Annualised risk-adjusted CBR", per_alt["RES-MOD"]["financial"]["annualised"]["racbr"], 0.9850721311475409),
           ("RES-ADV", "Annualised CBR", per_alt["RES-ADV"]["financial"]["annualised"]["cbr"], 1.0978260869565217),
           ("RES-ADV", "Annualised risk-adjusted CBR", per_alt["RES-ADV"]["financial"]["annualised"]["racbr"], 0.7948260869565217),
           ("RES-MOD", "Lifecycle NPV (3 years, 10%)", per_alt["RES-MOD"]["financial"]["summary"]["npv"], 10.083771600300523),
           ("RES-ADV", "Lifecycle NPV (3 years, 10%)", per_alt["RES-ADV"]["financial"]["summary"]["npv"], -3.739669421487605)]
    return [{"alternative": a, "metric": m, "value": v, "research": e,
             "result": ("PASS" if (is_number(v) and abs(v - e) <= 1e-6) else "DIFFERENT - inputs changed from the research case")}
            for a, m, v, e in exp]


def evaluate(case_in):
    case = normalise(case_in)
    ev_idx = core.evidence_index(case)
    checks = core.case_checks(case)
    mc_state = montecarlo.status(case)
    per_alt = {a["id"]: evaluate_alt(case, a, ev_idx, checks, mc_state) for a in case["alternatives"]}
    sens = sensitivity(case, per_alt, ev_idx)
    comp = comparison(case, per_alt, mc_state)
    mon = monitoring(case, per_alt, checks)
    ver = verification(case, per_alt, sens, checks)
    alts = {}
    for aid, r in per_alt.items():
        alts[aid] = {k: v for k, v in r.items() if not k.startswith("_")}
        alts[aid]["base_parameters"] = r["_base"]
    dash_id = case["dashboard"].get("alternative") if case["dashboard"].get("alternative") in ALT_IDS else "RES-MOD"
    return {
        "model_version": MODEL_VERSION, "engine_version": ENGINE_VERSION,
        "checks": checks, "alternatives": alts, "sensitivity": sens, "comparison": comp,
        "monitoring": mon, "monte_carlo": {"state": mc_state, "inputs": {aid: montecarlo.input_table(case, aid) for aid in ALT_IDS}},
        "verification": ver, "research_reproduction": research_reproduction(per_alt),
        "dashboard": {"alternative": dash_id},
        "home": {
            "status": checks["home_status"],
            "summary": [{"id": aid, "name": per_alt[aid]["name"], "active": per_alt[aid]["active"],
                         "npv": per_alt[aid]["financial"]["summary"]["npv"],
                         "ranpv": per_alt[aid]["financial"]["summary"]["ranpv"],
                         "level": per_alt[aid]["recommendation"]["level"],
                         "label": per_alt[aid]["recommendation"]["label"]} for aid in ALT_IDS],
        },
    }
