"""16_Monitoring and the monitoring-reassessment column (I) of 14_Recommendation."""
from __future__ import annotations

from .constants import ALT_IDS, BENCHMARK_IDS, LEVEL_LABELS, MAX_YEARS, MON_BENEFIT_CATS, MON_COST_CATS, NO_RECORD, RISK_IDS
from .core import CRIT, level_from
from .model import get_alt, is_number, num

YEARS = range(MAX_YEARS + 1)


def _series(values):
    vals = list(values or [])
    return [num(vals[t]) if t < len(vals) else 0.0 for t in YEARS]


def forecast_series(approved, given, m):
    """Rows 52-65: blank cells default to 0 for years up to m and to the approved value after."""
    given = list(given or [])
    out = []
    for t in YEARS:
        g = given[t] if t < len(given) else None
        if is_number(g):
            out.append(float(g))
        elif t == 0:
            out.append(0.0)
        else:
            out.append(0.0 if t <= m else approved[t])
    return out


def monitoring(case, per_alt, checks):
    mon = case["monitoring"]
    aid = mon["alternative"] if mon["alternative"] in ALT_IDS else ALT_IDS[0]
    alt = get_alt(case, aid)
    r = per_alt[aid]
    m, rate, n = int(num(mon["review_year"])), num(mon["approved_rate"]), int(num(mon["approved_horizon"]))
    df = [(1 + rate) ** -t for t in YEARS]

    app_b = {k: _series(mon["approved_benefits"].get(k)) for k, _, _ in MON_BENEFIT_CATS}
    app_c = {k: _series(mon["approved_costs"].get(k)) for k, _, _ in MON_COST_CATS}
    real_b = {k: _series(mon["realised_benefits"].get(k)) for k, _, _ in MON_BENEFIT_CATS}
    real_c = {k: _series(mon["realised_costs"].get(k)) for k, _, _ in MON_COST_CATS}
    fc_b = {k: forecast_series(app_b[k], mon["forecast_benefits"].get(k), m) for k, _, _ in MON_BENEFIT_CATS}
    fc_c = {k: forecast_series(app_c[k], mon["forecast_costs"].get(k), m) for k, _, _ in MON_COST_CATS}

    def tot(d):
        return [sum(d[k][t] for k in d) for t in YEARS]
    AB, AC, RB, RC, FB, FC = tot(app_b), tot(app_c), tot(real_b), tot(real_c), tot(fc_b), tot(fc_c)

    # Updated risk assessment (rows 78-88)
    approved_scores = alt["risk"]["scores"]
    cur_scores = [c if is_number(c) else a for c, a in zip(mon["current_scores"], approved_scores)]
    w = r["risk"]["weights"]
    wrs = sum(wi * num(s) for wi, s in zip(w, cur_scores))
    raf_now = 1 - r["risk"]["lambda"] * (wrs / 5)
    crit_now = sum(1 for s in mon["current_critical"] if s == CRIT)
    all_scored = sum(1 for s in cur_scores if is_number(s)) == 7

    # Rolling lifetime appraisal (rows 91-104)
    yrs = [t for t in range(1, MAX_YEARS + 1)]
    v = {}
    v["approved_pvb"] = sum(AB[t] * df[t] for t in yrs if t <= n)
    v["approved_pvc"] = AC[0] + sum(AC[t] * df[t] for t in yrs if t <= n)
    v["approved_npv"] = v["approved_pvb"] - v["approved_pvc"]
    v["approved_ranpv"] = v["approved_pvb"] * r["risk"]["raf"] - v["approved_pvc"]
    v["realised_pvb"] = sum(RB[t] * df[t] for t in yrs if t <= m and t <= n)
    v["forecast_pvb"] = sum(FB[t] * df[t] for t in yrs if t > m and t <= n)
    v["realised_pvc"] = RC[0] + sum(RC[t] * df[t] for t in yrs if t <= m and t <= n)
    v["forecast_pvc"] = sum(FC[t] * df[t] for t in yrs if t > m and t <= n)
    v["current_pvb"] = v["realised_pvb"] + v["forecast_pvb"]
    v["current_pvc"] = v["realised_pvc"] + v["forecast_pvc"]
    v["current_npv"] = v["current_pvb"] - v["current_pvc"]
    v["current_cbr"] = None if v["current_pvc"] == 0 else v["current_pvb"] / v["current_pvc"]
    v["current_ranpv"] = v["realised_pvb"] + v["forecast_pvb"] * raf_now - v["current_pvc"]
    v["current_racbr"] = (None if v["current_pvc"] == 0
                          else (v["realised_pvb"] + v["forecast_pvb"] * raf_now) / v["current_pvc"])
    v["raf_now"], v["wrs_now"] = raf_now, wrs

    # Category variance (rows 108-117)
    variance = []
    thr = num(mon["variance_threshold"])
    for cats, src_a, src_r, kind in ((MON_BENEFIT_CATS, app_b, real_b, "Benefit"), (MON_COST_CATS, app_c, real_c, "Cost")):
        for k, vid, name in cats:
            a = sum(src_a[k][t] for t in yrs if t <= m and t <= n)
            act = sum(src_r[k][t] for t in yrs if t <= m and t <= n)
            var = act - a
            pct = None if a == 0 else (act - a) / abs(a)
            fav = (var >= 0) if kind == "Benefit" else (var <= 0)
            variance.append({"category": name, "variable_id": vid, "type": kind, "approved": a, "actual": act,
                             "variance": var, "variance_pct": pct,
                             "preference": "Higher is favourable" if kind == "Benefit" else "Lower is favourable",
                             "assessment": "Favourable" if fav else "Adverse",
                             "magnitude": abs(pct) if is_number(pct) else 0.0})

    # Monitoring Gate 4 (rows 121-123)
    g4 = {}
    for s, (bf, cf) in mon["scenario_factors"].items():
        pvfb, pvfc = v["forecast_pvb"] * num(bf), v["forecast_pvc"] * num(cf)
        g4[s] = {"benefit_factor": num(bf), "cost_factor": num(cf), "pv_forecast_benefits": pvfb,
                 "pv_forecast_costs": pvfc, "npv": v["realised_pvb"] + pvfb - (v["realised_pvc"] + pvfc),
                 "ranpv": v["realised_pvb"] + pvfb * raf_now - (v["realised_pvc"] + pvfc)}

    # Monitoring Gate 5 (rows 126-133)
    req_mult = (None if v["forecast_pvb"] == 0 or raf_now == 0
                else (v["current_pvc"] - v["realised_pvb"]) / (raf_now * v["forecast_pvb"]))
    max_rem = v["realised_pvb"] + v["forecast_pvb"] * raf_now - v["realised_pvc"]
    g5a = is_number(req_mult) and req_mult <= num(mon["plausible_multiple"])
    g5b = max_rem >= v["forecast_pvc"]
    g5 = {"required_multiple": req_mult, "plausible_multiple": num(mon["plausible_multiple"]),
          "multiple_basis": mon.get("multiple_basis", ""), "max_viable_remaining_cost": max_rem,
          "pv_forecast_remaining_cost": v["forecast_pvc"], "benefit_breakeven_ok": bool(g5a),
          "cost_fits": bool(g5b), "pass": bool(g5a or g5b)}

    # Monitoring Gate 6 (rows 137-141)
    top = r["drivers"]["top3"]
    g6_rows = []
    for i, d in enumerate(top):
        st = mon["evidence_status"][i] if i < len(mon["evidence_status"]) else "Unchanged since approval"
        conf = d["confidence"]
        if st in ("Resolved by pilot evidence", "High", "Medium"):
            ok = True
        elif st == "Low":
            ok = False
        else:
            ok = not (conf in ("Low", NO_RECORD))
        g6_rows.append({"rank": i + 1, "driver": d["variable"], "confidence_at_approval": conf,
                        "status": st, "adequate": ok,
                        "notes": mon["evidence_notes"][i] if i < len(mon["evidence_notes"]) else ""})
    g6 = all(x["adequate"] for x in g6_rows)

    # Reassessment through the recommendation engine (14_Recommendation column I)
    ben_ok = r["benefits"]["valid"] and r["costs"]["valid"] and r["costs"]["residual_ok"]
    G0 = bool(alt["active"]) and ben_ok and checks["global_ok"] and all_scored
    G1 = is_number(v["current_cbr"]) and v["current_npv"] > 0 and v["current_cbr"] > 1
    G2 = is_number(v["current_racbr"]) and v["current_ranpv"] > 0 and v["current_racbr"] > 1
    G4 = g4["Downside"]["ranpv"] > 0
    G5 = g5["pass"] or g4["Upside"]["ranpv"] > 0
    pilot = mon.get("pilot_measurable", "Yes")
    level = level_from(G0, G1, G2, crit_now, G4, G5, g6, pilot, g4["Upside"]["npv"])
    codes = (("ECO_PASS; " if G1 else "ECO_FAIL; ") + ("RA_PASS; " if G2 else "RA_FAIL; ")
             + ("CRIT_RISK; " if crit_now > 0 else "") + ("" if G4 else "DOWN_FAIL; ")
             + ("BE_PLAUSIBLE; " if g5["pass"] else "BE_NOT_PLAUSIBLE; ") + ("" if g6 else "DATA_LOW; ")
             + "MONITORING_REVIEW")
    reassessment = {"gates": {"G0": G0, "G1": G1, "G2": G2, "G3": crit_now == 0, "G4": G4, "G5": G5, "G6": g6},
                    "level": level, "label": LEVEL_LABELS[level], "reason_codes": codes}

    # Triggers and warnings (rows 146-161)
    conds = r["recommendation"]["conditions"]
    triggers = [
        {"trigger": "Current risk-adjusted NPV below zero", "active": v["current_ranpv"] < 0},
        {"trigger": "Current risk-adjusted CBR below 1",
         "active": bool(is_number(v["current_racbr"]) and v["current_racbr"] < 1)},
        {"trigger": "Realised implementation cost above the break-even ceiling",
         "active": RC[0] > r["financial"]["summary"]["be_imp"]},
        {"trigger": "An approved R3/R4 condition has failed",
         "active": any(c["status"] == "Not Met" for c in conds[:3])},
        {"trigger": "A new unresolved critical risk has appeared", "active": crit_now > r["risk"]["critical"]},
        {"trigger": "Recommendation class has deteriorated since approval",
         "active": level < num(mon["approved_level"])},
    ]
    adverse = sum(1 for x in variance if x["assessment"] == "Adverse" and x["magnitude"] > thr)
    over_budget = RC[0] > AC[0]
    n_trig = sum(t["active"] for t in triggers)
    status = ("Formal Reassessment Required" if n_trig > 0
              else "Attention Required" if (adverse > 0 or over_budget) else "On Track")
    risk_rows = [{"variable_id": rid, "approved": a, "current": c, "critical": cs,
                  "note": mon["risk_notes"][i] if i < len(mon["risk_notes"]) else ""}
                 for i, (rid, a, c, cs) in enumerate(zip(RISK_IDS, approved_scores, cur_scores, mon["current_critical"]))]
    return {
        "alternative": aid, "review_year": m, "approved_rate": rate, "approved_horizon": n,
        "schedules": {"approved_benefits": AB, "approved_costs": AC, "realised_benefits": RB, "realised_costs": RC,
                      "forecast_benefits": FB, "forecast_costs": FC,
                      "forecast_benefits_by_cat": fc_b, "forecast_costs_by_cat": fc_c},
        "risk": {"rows": risk_rows, "wrs": wrs, "raf": raf_now, "critical": crit_now, "all_scored": all_scored},
        "valuation": v, "variance": variance, "gate4": g4, "gate5": g5,
        "gate6": {"rows": g6_rows, "pass": g6, "pilot_measurable": pilot},
        "triggers": triggers, "trigger_count": n_trig,
        "warnings": {"adverse_beyond_threshold": adverse, "threshold": thr, "implementation_over_budget": over_budget},
        "reassessment": reassessment, "status": status,
    }
