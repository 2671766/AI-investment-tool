"""Deterministic model: a line-by-line port of sheets 05-10 and 14 of the v1.5 workbook.

Each function names the sheet and rows it reproduces. Values that Excel shows as text
(for example "CBR undefined - zero cost") are returned as None, with the reason available
from `messages`.
"""
from __future__ import annotations

import math

from .constants import (ALT_IDS, BENCHMARK_IDS, DRIVER_VARIABLES, LEVEL_LABELS, MAX_YEARS,
                        NO_RECORD, PANEL_PARAMETERS, RISK_IDS, SENS_FACTORS, SENS_VARIABLES)
from .model import is_blank, is_number, num

DP = "Driver-based %"
WD = "Workload driver"
ED = "Detailed event driver"
DE = "Direct estimate"
NM = "Not monetised"
CRIT = "Critical issue unresolved"
NA_RISK = "Not assessed"


def xround(x, digits=0):
    """Excel ROUND: half away from zero."""
    m = 10 ** digits
    return math.copysign(math.floor(abs(x) * m + 0.5) / m, x)


def rank_desc(values):
    """Excel RANK(v, range) + COUNTIF(range_to_here, v) - 1: descending, ties by position."""
    out = []
    for i, v in enumerate(values):
        greater = sum(1 for w in values if w > v)
        earlier_equal = sum(1 for w in values[:i] if w == v)
        out.append(greater + 1 + earlier_equal)
    return out


# ------------------------------------------------------------------ evidence register lookups
def evidence_index(case):
    idx = {}
    for row in case.get("evidence", []):
        vid, aid = (row.get("variable_id") or "").strip(), (row.get("alternative_id") or "").strip()
        if not vid:
            continue
        idx.setdefault("%s|%s" % (vid, aid), row)       # MATCH returns the first record
    return idx


def ev_lookup(idx, var_id, alt_id, field):
    """INDEX(EV_x, MATCH(var|alt)) falling back to var|CASE, else 'No evidence record'."""
    for key in ("%s|%s" % (var_id, alt_id), "%s|CASE" % var_id):
        if key in idx:
            v = idx[key].get(field)
            return "" if v is None else v
    return NO_RECORD


# ------------------------------------------------------------------ 05_Benefits
def benefits(case, alt):
    b, bl = alt["benefits"], case["baseline"]
    fm, cm, pm = b["fraud_method"], b["case_method"], b["fp_method"]
    exposure = num(bl["fraud_exposure"])
    if fm == NM:
        fraud = 0.0
    elif fm == DE:
        fraud = num(b["fraud_direct"])
    else:
        fraud = exposure * num(b["fraud_red"])
    if cm == NM:
        casev = 0.0
    elif cm == DE:
        casev = num(b["case_direct"])
    elif cm == WD:
        casev = num(bl["analyst_hours"]) * num(b["work_red"]) * num(bl["analyst_cost"]) / 1e6
    else:
        casev = num(bl["case_cost"]) * num(b["case_red"])
    if pm == NM:
        fp = 0.0
    elif pm == DE:
        fp = num(b["fp_direct"])
    elif pm in (ED, WD):
        fp = num(bl["alerts"]) * num(bl["fp_rate"]) * num(b["fp_red"]) * num(b["fp_event_cost"]) / 1e6
    else:
        fp = num(bl["fp_cost"]) * num(b["fp_red"])
    other = 0.0 if b["other_dup"] == "Yes" else num(b["other_direct"])
    total = fraud + casev + fp + other

    checks = []
    if fraud > exposure:
        checks.append(("VAL-BEN-01", "WARNING - benefit exceeds exposure"))
    v02 = any(abs(num(b[k])) > 1 for k in ("fraud_red", "case_red", "fp_red", "work_red"))
    v03 = casev > num(bl["case_cost"])
    v04 = ((fm == DP and is_blank(b["fraud_red"])) or (fm == DE and is_blank(b["fraud_direct"]))
           or (cm == DP and is_blank(b["case_red"])) or (cm == DE and is_blank(b["case_direct"]))
           or (cm == WD and (num(bl["analyst_hours"]) == 0 or is_blank(b["work_red"]) or num(bl["analyst_cost"]) == 0))
           or (pm == DP and is_blank(b["fp_red"])) or (pm == DE and is_blank(b["fp_direct"]))
           or (pm in (ED, WD) and (num(bl["alerts"]) == 0 or num(bl["fp_rate"]) == 0
                                   or is_blank(b["fp_event_cost"]) or is_blank(b["fp_red"]))))
    v05 = cm == WD and num(bl["analyst_hours"]) > 0 and num(b["work_red"]) > 1
    ramp_vals = [r for r in alt["ramp"] if is_number(r)]
    v06 = bool(ramp_vals) and (min(ramp_vals) < 0 or max(ramp_vals) > 1)
    if v02:
        checks.append(("VAL-BEN-02", "HARD ERROR - improvement above 100%"))
    if v03:
        checks.append(("VAL-BEN-03", "WARNING - saving exceeds baseline case-handling cost"))
    if v04:
        checks.append(("VAL-BEN-04", "HARD ERROR - missing input for the selected method"))
    if v05:
        checks.append(("VAL-BEN-05", "HARD ERROR - hours saved exceed the baseline workload"))
    if v06:
        checks.append(("VAL-BEN-06", "HARD ERROR - ramp outside 0-100%"))
    return {"fraud": fraud, "case": casev, "fp": fp, "other": other, "total": total,
            "exposure": exposure, "valid": not (v02 or v04 or v05 or v06), "checks": checks}


# ------------------------------------------------------------------ 06_Costs
def costs(case, alt, ben_total):
    c = alt["costs"]
    init_items = [c["initial"][k] for k in ("implement", "integrate", "train", "data", "governance", "other")]
    rec_items = [c["recurring"][k] for k in ("vendor", "data", "train", "maintenance", "monitoring", "governance", "other")]
    initial = sum(num(v) for v in init_items)
    recurring = sum(num(v) for v in rec_items)
    nums = [num(v) for v in init_items + rec_items if is_number(v)]
    ys = [num(v) for v in c["year_specific"]]
    checks = []
    v01 = bool(nums) and min(nums) < 0
    v03 = min(ys) < 0 if ys else False
    if v01:
        checks.append(("VAL-CST-01", "HARD ERROR - negative cost"))
    if v03:
        checks.append(("VAL-CST-03", "HARD ERROR - negative year-specific cost"))
    if initial == 0 and ben_total > 0:
        checks.append(("VAL-CST-02", "WARNING - zero implementation cost with positive benefits"))
    resid_ok = not (num(c["residual"]) != 0 and is_blank(c["residual_basis"]))
    if not resid_ok:
        checks.append(("VAL-RESID", "HARD ERROR - residual value needs a recorded basis"))
    return {"initial": initial, "recurring": recurring, "vendor": num(c["recurring"]["vendor"]),
            "maint_mon": num(c["recurring"]["maintenance"]) + num(c["recurring"]["monitoring"]),
            "year_specific": ys, "residual": num(c["residual"]),
            "valid": not (v01 or v03), "residual_ok": resid_ok, "checks": checks}


# ------------------------------------------------------------------ 07_Risk
def weights_for(case, alt_id):
    rc = case["risk_config"]
    return [num(w) for w in (rc["benchmark_weights"] if alt_id in BENCHMARK_IDS else rc["case_weights"])]


def risk(case, alt, ev_idx):
    aid = alt["id"]
    w = weights_for(case, aid)
    scores = alt["risk"]["scores"]
    contrib = [wi * num(s) for wi, s in zip(w, scores)]
    wrs = sum(contrib)
    ri = wrs / 5
    lam = num(case["risk_config"]["benchmark_lambda"]) if aid in BENCHMARK_IDS else num(case["risk_config"]["case_lambda"])
    raf = 1 - lam * ri
    crit = sum(1 for s in alt["risk"]["critical"] if s == CRIT)
    not_assessed = sum(1 for s in alt["risk"]["critical"] if s == NA_RISK)
    conf = [ev_lookup(ev_idx, r, aid, "confidence") for r in RISK_IDS]
    src = [ev_lookup(ev_idx, r, aid, "source") for r in RISK_IDS]
    owner = [ev_lookup(ev_idx, r, aid, "owner") for r in RISK_IDS]
    n_scored = sum(1 for s in scores if is_number(s))
    no_record = sum(1 for cf in conf if cf == NO_RECORD) if n_scored > 0 else 0
    no_rationale = sum(1 for s, r in zip(scores, alt["risk"]["rationale"]) if is_number(s) and is_blank(r))
    return {"weights": w, "contrib": contrib, "wrs": wrs, "ri": ri, "lambda": lam, "raf": raf,
            "critical": crit, "not_assessed": not_assessed, "n_scored": n_scored,
            "evidence_confidence": conf, "evidence_source": src, "evidence_owner": owner,
            "without_record": no_record, "without_rationale": no_rationale,
            "evidence_warning": (no_record + no_rationale) > 0}


def case_checks(case):
    """01_Case_Setup D24:D26, 03_Baseline D22:D27, 07_Risk D13, D14, D29."""
    m, f, bl, rc = case["meta"], case["finance"], case["baseline"], case["risk_config"]
    out = {}
    req = [m["case_id"], m["case_name"], m["assessment_date"], m["bank_context"], m["prepared_by"], m["status"]]
    out["case_fields"] = "HARD ERROR - missing case field" if any(is_blank(x) for x in req) else "OK"
    h = f["horizon"]
    out["horizon"] = ("OK" if is_number(h) and 1 <= h <= 15 and float(h).is_integer()
                      else "HARD ERROR - horizon must be a whole number 1-15")
    out["rate"] = "OK" if num(f["rate"]) >= 0 else "HARD ERROR - discount rate below zero"
    core = [bl["fraud_exposure"], bl["case_cost"], bl["fp_cost"]]
    out["baseline_core"] = ("HARD ERROR - core baseline missing or negative"
                            if sum(1 for x in core if is_number(x)) < 3 or min(num(x) for x in core) < 0 else "OK")
    out["baseline_workload"] = ("WARNING - analyst hours entered without an hourly cost"
                                if is_number(bl["analyst_hours"]) and not is_number(bl["analyst_cost"]) else "OK")
    opt = [bl[k] for k in ("alerts", "cases", "analyst_hours", "analyst_cost", "resolution_time", "loss_per_case")]
    out["baseline_nonneg"] = "HARD ERROR - negative baseline value" if min(num(x) for x in opt) < 0 else "OK"
    out["baseline_fprate"] = ("HARD ERROR - false-positive rate outside 0-100%"
                              if num(bl["fp_rate"]) < 0 or num(bl["fp_rate"]) > 1 else "OK")
    out["baseline_cases"] = ("WARNING - cases investigated exceed total alerts"
                             if num(bl["alerts"]) > 0 and num(bl["cases"]) > num(bl["alerts"]) else "OK")
    out["baseline_valid"] = (out["baseline_core"] == "OK" and out["baseline_nonneg"] == "OK"
                             and out["baseline_fprate"] == "OK")
    out["case_weights"] = ("HARD ERROR - case risk weights must total 100%"
                           if xround(sum(num(w) for w in rc["case_weights"]), 6) != 1 else "OK")
    out["benchmark_weights"] = ("HARD ERROR - benchmark weights must total 100%"
                                if xround(sum(num(w) for w in rc["benchmark_weights"]), 6) != 1 else "OK")
    out["lambda_rationale"] = ("HARD ERROR - a different case lambda needs a recorded rationale"
                               if xround(num(rc["case_lambda"]), 6) != 0.4 and is_blank(rc["case_lambda_rationale"]) else "OK")
    out["global_ok"] = (out["case_fields"] == "OK" and out["horizon"] == "OK" and out["rate"] == "OK"
                        and out["baseline_valid"] and out["case_weights"] == "OK"
                        and out["benchmark_weights"] == "OK" and out["lambda_rationale"] == "OK")
    out["home_status"] = ("HARD ERRORS PRESENT - see 01, 03 and 07"
                          if (out["case_fields"] != "OK" or out["horizon"] != "OK" or out["rate"] != "OK"
                              or out["baseline_core"] != "OK" or out["case_weights"] != "OK")
                          else "No hard errors detected")
    return out


# ------------------------------------------------------------------ 08_Financial_Model
def irr(cashflows):
    """IRR by bracketed bisection on the NPV function, refined by Newton; None if no root."""
    def npv(r):
        return sum(cf / (1 + r) ** t for t, cf in enumerate(cashflows))
    lo, hi = -0.99, 10.0
    f_lo, f_hi = npv(lo), npv(hi)
    if f_lo * f_hi > 0:
        return None
    for _ in range(300):
        mid = (lo + hi) / 2
        f_mid = npv(mid)
        if abs(f_mid) < 1e-13:
            break
        if f_lo * f_mid < 0:
            hi, f_hi = mid, f_mid
        else:
            lo, f_lo = mid, f_mid
    return (lo + hi) / 2


def first_nonneg(series):
    for t, v in enumerate(series):
        if v >= 0:
            return t
    return None


def financial(case, alt, ben, cst, rsk):
    H, rate = int(num(case["finance"]["horizon"])), num(case["finance"]["rate"])
    ann_years = num(case["finance"]["ann_years"])
    ramp = [num(r) for r in alt["ramp"]]
    df = [1 / (1 + rate) ** t for t in range(MAX_YEARS + 1)]
    raf = rsk["raf"]
    total = ben["total"]
    ann_imp = cst["initial"] / ann_years if ann_years else float("nan")
    ann_cost = ann_imp + cst["recurring"]
    ann = {"benefit": total, "implementation": ann_imp, "recurring": cst["recurring"], "cost": ann_cost,
           "cbr": None if ann_cost == 0 else total / ann_cost, "raf": raf}
    ann["racbr"] = None if ann_cost == 0 else ann["cbr"] * raf

    benefit, cost = [0.0], [cst["initial"]]
    for t in range(1, MAX_YEARS + 1):
        if t > H:
            benefit.append(0.0)
            cost.append(0.0)
        else:
            benefit.append(total * ramp[t - 1] + (cst["residual"] if t == H else 0.0))
            cost.append(cst["recurring"] + cst["year_specific"][t - 1])
    net = [b - c for b, c in zip(benefit, cost)]
    pvb = [b * d for b, d in zip(benefit, df)]
    pvc = [c * d for c, d in zip(cost, df)]
    pvnet = [b - c for b, c in zip(pvb, pvc)]
    cum, cum_ra, ra_pvb = [], [], []
    for t in range(MAX_YEARS + 1):
        cum.append(pvnet[t] + (cum[-1] if t else 0.0))
        ra_pvb.append(pvb[t] * raf)
        cum_ra.append((cum_ra[-1] if t else 0.0) + ra_pvb[t] - pvc[t])
    unc_ra, unc_fin = [-cst["initial"]], [-cst["initial"]]
    for t in range(1, MAX_YEARS + 1):
        yr_cost = cst["recurring"] + cst["year_specific"][t - 1]
        unc_ra.append((total * ramp[t - 1] * raf - yr_cost) * df[t])
        unc_fin.append((total * ramp[t - 1] - yr_cost) * df[t])
    cum_unc_ra, cum_unc_fin = [], []
    for t in range(MAX_YEARS + 1):
        cum_unc_ra.append(unc_ra[t] + (cum_unc_ra[-1] if t else 0.0))
        cum_unc_fin.append(unc_fin[t] + (cum_unc_fin[-1] if t else 0.0))

    PVB, PVC = sum(pvb), sum(pvc)
    s = {"pvb": PVB, "pvc": PVC, "npv": PVB - PVC, "raf": raf,
         "cbr": None if PVC == 0 else PVB / PVC, "ranpv": PVB * raf - PVC}
    s["racbr"] = None if PVC == 0 else s["cbr"] * raf

    def within(series):
        if max(series) < 0:
            return None
        t = first_nonneg(series)
        return None if t > H else t
    s["payback"] = within(cum)
    s["ra_breakeven_year"] = within(cum_ra)
    s["irr"] = None if (max(net) <= 0 or min(net) >= 0) else irr(net)
    af = sum(ramp[t - 1] * df[t] for t in range(1, MAX_YEARS + 1) if t <= H)
    s["af"] = af
    exposure = num(case["baseline"]["fraud_exposure"])
    others = ben["case"] + ben["fp"] + ben["other"]
    s["be_imp"] = PVB * raf - (PVC - cst["initial"])
    s["be_fraud"] = (None if af == 0 or exposure == 0 or raf == 0
                     else ((PVC / raf) / af - others) / exposure)
    s["be_life"] = None if max(cum_unc_ra) < 0 else first_nonneg(cum_unc_ra)
    s["be_imp_raw"] = PVB - (PVC - cst["initial"])
    s["be_fraud_raw"] = None if af == 0 or exposure == 0 else (PVC / af - others) / exposure
    # Workbook v1.5 searches the financial life inside the case horizon only (row 25);
    # the web app reports the corrected 15-year search and keeps the workbook value for parity.
    s["be_life_raw_excel"] = None if max(cum) < 0 else first_nonneg(cum)
    s["be_life_raw"] = None if max(cum_unc_fin) < 0 else first_nonneg(cum_unc_fin)
    years = {"df": df, "benefit": benefit, "cost": cost, "net": net, "pv_benefit": pvb, "pv_cost": pvc,
             "pv_net": pvnet, "cum_pv_net": cum, "ra_pv_benefit": ra_pvb, "cum_ra_pv_net": cum_ra,
             "unconstrained_ra_pv_net": unc_ra, "cum_unconstrained_ra_pv_net": cum_unc_ra}
    return {"annualised": ann, "summary": s, "years": years}


# ------------------------------------------------------------------ 10_Scenarios
SCN_DEFAULT_FACTORS = {"fraud_red": (0.8, 1.2), "case_red": (0.8, 1.2), "fp_red": (0.8, 1.2),
                       "init_cost": (1.2, 0.8), "rec_cost": (1.1, 0.9), "risk_index": (1.1, 0.9)}


def scenario_inputs(alt, cst, rsk):
    b = alt["benefits"]
    base = {"fraud_red": num(b["fraud_red"]), "case_red": num(b["case_red"]), "fp_red": num(b["fp_red"]),
            "init_cost": cst["initial"], "rec_cost": cst["recurring"], "risk_index": rsk["ri"]}
    out = {}
    for key, given in alt["scenarios"].items():
        if key == "ramp_mult":
            default = {"Downside": 0.9, "Base": 1.0, "Upside": 1.0}
        else:
            lo, hi = SCN_DEFAULT_FACTORS[key]
            default = {"Downside": base[key] * lo, "Base": base[key], "Upside": base[key] * hi}
        out[key] = {s: (num(given.get(s)) if is_number(given.get(s)) else default[s]) for s in default}
    return out


def plausible_ranges(alt, cst):
    p, b = alt["plausible"], alt["benefits"]
    d = {"fraud_lo": num(b["fraud_red"]) * 0.8, "fraud_hi": num(b["fraud_red"]) * 1.2,
         "cost_lo": cst["initial"] * 0.8, "cost_hi": cst["initial"] * 1.2}
    out = {k: (num(p.get(k)) if is_number(p.get(k)) else v) for k, v in d.items()}
    out["life_lo"] = p.get("life_lo") if is_number(p.get("life_lo")) else None
    out["life_hi"] = p.get("life_hi") if is_number(p.get("life_hi")) else None
    out["life_basis"] = p.get("life_basis") or ""
    out["life_status"] = "Documented" if is_number(out["life_hi"]) and out["life_basis"] != "" else "Not assessed"
    return out


def scenarios(case, alt, ben, cst, rsk):
    H, rate = int(num(case["finance"]["horizon"])), num(case["finance"]["rate"])
    bl = case["baseline"]
    ramp = [num(r) for r in alt["ramp"]]
    inp = scenario_inputs(alt, cst, rsk)
    flat = sum((1 + rate) ** -t for t in range(1, MAX_YEARS + 1) if t <= H)
    ys = sum(cst["year_specific"][t - 1] * (1 + rate) ** -t for t in range(1, MAX_YEARS + 1) if t <= H)
    res = {}
    for s in ("Downside", "Base", "Upside"):
        af = sum(ramp[t - 1] * inp["ramp_mult"][s] * (1 + rate) ** -t for t in range(1, MAX_YEARS + 1) if t <= H)
        pvb = (num(bl["fraud_exposure"]) * inp["fraud_red"][s] + num(bl["case_cost"]) * inp["case_red"][s]
               + num(bl["fp_cost"]) * inp["fp_red"][s] + ben["other"]) * af
        pvc = inp["init_cost"][s] + inp["rec_cost"][s] * flat + ys
        raf = 1 - rsk["lambda"] * inp["risk_index"][s]
        cbr = None if pvc == 0 else pvb / pvc
        res[s] = {"pvb": pvb, "pvc": pvc, "npv": pvb - pvc, "cbr": cbr, "raf": raf,
                  "ranpv": pvb * raf - pvc, "racbr": None if pvc == 0 else cbr * raf}
    coherent = res["Downside"]["ranpv"] <= res["Base"]["ranpv"] <= res["Upside"]["ranpv"]
    return {"inputs": inp, "results": res,
            "coherence": "Coherent" if coherent else "WARNING - scenario labels look inconsistent"}


# ------------------------------------------------------------------ 09_Sensitivity shadow engine
def base_params(case, alt, ben, cst, rsk):
    """09_Sensitivity C8:C43 and the effective weights C46:C52 for one alternative."""
    b, bl = alt["benefits"], case["baseline"]
    p = {"BEN-FRAUD-RED": num(b["fraud_red"]), "BEN-CASE-RED": num(b["case_red"]), "BEN-FP-RED": num(b["fp_red"]),
         "BEN-OTH-VAL": ben["other"], "BEN-RAMP-MULT": 1.0, "CST-INIT-TOTAL": cst["initial"],
         "CST-REC-TOTAL": cst["recurring"], "CST-VENDOR": cst["vendor"], "CST-MAINT-MON": cst["maint_mon"],
         "FIN-HORIZON": num(case["finance"]["horizon"]), "FIN-RATE": num(case["finance"]["rate"]),
         "RSK-LAMBDA": rsk["lambda"], "RSK-RI": rsk["ri"],
         "BL-FRAUD-EXP": num(bl["fraud_exposure"]), "BL-CASE-COST": num(bl["case_cost"]),
         "BL-FP-COST": num(bl["fp_cost"]), "BEN-WORK-RED": num(b["work_red"]),
         "BEN-FP-EVENT": num(b["fp_event_cost"])}
    for rid, s in zip(RISK_IDS, alt["risk"]["scores"]):
        p[rid] = num(s)
    fixed = {"fraud_method": b["fraud_method"], "case_method": b["case_method"], "fp_method": b["fp_method"],
             "fraud_direct": num(b["fraud_direct"]), "case_direct": num(b["case_direct"]),
             "fp_direct": num(b["fp_direct"]), "hours": num(bl["analyst_hours"]),
             "an_cost": num(bl["analyst_cost"]), "alerts": num(bl["alerts"]), "fp_rate": num(bl["fp_rate"]),
             "residual": cst["residual"], "ramp": [num(r) for r in alt["ramp"]],
             "year_specific": cst["year_specific"], "weights": rsk["weights"]}
    return p, fixed


def shadow_eval(base, fixed, over=None):
    """One test point: columns AD:AN of the sensitivity grid."""
    v = dict(base)
    if over:
        v.update(over)
    P, Q, K = v["FIN-HORIZON"], v["FIN-RATE"], v["BEN-RAMP-MULT"]
    yrs = [t for t in range(1, MAX_YEARS + 1) if t <= P]
    af_b = sum(fixed["ramp"][t - 1] * K * (1 + Q) ** -t for t in yrs)
    af_flat = sum((1 + Q) ** -t for t in yrs)
    rec_eff = v["CST-REC-TOTAL"] - base["CST-VENDOR"] - base["CST-MAINT-MON"] + v["CST-VENDOR"] + v["CST-MAINT-MON"]
    ri_eff = v["RSK-RI"] + sum(w * (v[r] - base[r]) / 5 for w, r in zip(fixed["weights"], RISK_IDS))
    fm, cm, pm = fixed["fraud_method"], fixed["case_method"], fixed["fp_method"]
    fraud = 0.0 if fm == NM else fixed["fraud_direct"] if fm == DE else v["BL-FRAUD-EXP"] * v["BEN-FRAUD-RED"]
    if cm == NM:
        casev = 0.0
    elif cm == DE:
        casev = fixed["case_direct"]
    elif cm == WD:
        casev = fixed["hours"] * v["BEN-WORK-RED"] * fixed["an_cost"] / 1e6
    else:
        casev = v["BL-CASE-COST"] * v["BEN-CASE-RED"]
    if pm == NM:
        fp = 0.0
    elif pm == DE:
        fp = fixed["fp_direct"]
    elif pm in (ED, WD):
        fp = fixed["alerts"] * fixed["fp_rate"] * v["BEN-FP-RED"] * v["BEN-FP-EVENT"] / 1e6
    else:
        fp = v["BL-FP-COST"] * v["BEN-FP-RED"]
    pvb = (fraud + casev + fp + v["BEN-OTH-VAL"]) * af_b + fixed["residual"] * (1 + Q) ** -P
    pvc = v["CST-INIT-TOTAL"] + rec_eff * af_flat + sum(fixed["year_specific"][t - 1] * (1 + Q) ** -t for t in yrs)
    raf = 1 - v["RSK-LAMBDA"] * ri_eff
    cbr = None if pvc == 0 else pvb / pvc
    npv, ranpv = pvb - pvc, pvb * raf - pvc
    racbr = None if pvc == 0 else cbr * raf
    if npv > 0 and cbr is not None and cbr > 1:
        status = "Risk-adjusted viable" if (ranpv > 0 and racbr > 1) else "Raw viable, risk-adjusted negative"
    else:
        status = "Not viable"
    return {"af_benefits": af_b, "af_flat": af_flat, "recurring_eff": rec_eff, "ri_eff": ri_eff,
            "pvb": pvb, "pvc": pvc, "npv": npv, "cbr": cbr, "raf": raf, "ranpv": ranpv, "racbr": racbr,
            "status": status}


def tested_override(var, base_value, factor):
    """Grid tested value: ramp is capped at 100%, the horizon is rounded to whole years."""
    if var == "BEN-RAMP-MULT":
        return {var: min(base_value * factor, 1.0)}
    if var == "FIN-HORIZON":
        return {var: xround(base_value * factor)}
    return {var: base_value * factor}


# Workbook v1.5 defect: on 09_Sensitivity rows 283-284 (and the same rows for every alternative) the
# driver-impact formulas for these two variables never apply the x0.8 / x1.2 factor, so their impact
# is always zero. In compatibility mode the web engine reproduces that; otherwise it tests them.
DRIVER_BLOCK_UNFLEXED = ("BEN-WORK-RED", "BEN-FP-EVENT")


def driver_block(alt, base, fixed, ev_idx, compat=True):
    """09_Sensitivity rows 280-344 for one alternative (Gate 6 source)."""
    rows = []
    for vid, name in DRIVER_VARIABLES:
        f_lo, f_hi = (1.0, 1.0) if (compat and vid in DRIVER_BLOCK_UNFLEXED) else (0.8, 1.2)
        lo = shadow_eval(base, fixed, tested_override(vid, base[vid], f_lo))["ranpv"]
        hi = shadow_eval(base, fixed, tested_override(vid, base[vid], f_hi))["ranpv"]
        rows.append({"variable_id": vid, "variable": name, "ranpv_low": lo, "ranpv_high": hi,
                     "impact": abs(hi - lo)})
    ranks = rank_desc([xround(r["impact"], 6) for r in rows])
    concerns = 0
    for r, k in zip(rows, ranks):
        r["rank"] = k
        r["material"] = k <= 3
        r["confidence"] = ev_lookup(ev_idx, r["variable_id"], alt["id"], "confidence")
        r["source_type"] = ev_lookup(ev_idx, r["variable_id"], alt["id"], "source_type")
        r["source"] = ev_lookup(ev_idx, r["variable_id"], alt["id"], "source")
        r["owner"] = ev_lookup(ev_idx, r["variable_id"], alt["id"], "owner")
        r["concern"] = k <= 3 and r["confidence"] in ("Low", NO_RECORD, "")
        concerns += r["concern"]
    top = sorted(rows, key=lambda r: r["rank"])[:3]
    return {"rows": rows, "top3": top, "concerns": concerns, "gate6": concerns == 0}


def sensitivity_grid(case, alt, base, fixed, ev_idx, model_ranpv):
    """Rows 65-226: the 22-variable grid, ranking and tornado for the selected alternative."""
    grid = []
    for vid, name in SENS_VARIABLES:
        pts = []
        for f, lab in zip(SENS_FACTORS, ["-20%", "-10%", "Base", "+10%", "+20%"]):
            over = tested_override(vid, base[vid], f)
            res = shadow_eval(base, fixed, over)
            pts.append({"point": lab, "factor": f, "tested": base[vid] * f if vid != "BEN-RAMP-MULT" else min(base[vid] * f, 1.0),
                        "used": over[vid], **res})
        grid.append({"variable_id": vid, "variable": name, "points": pts})
    rank_rows = []
    for g in grid:
        vals = [p["ranpv"] for p in g["points"]]
        rank_rows.append({"variable_id": g["variable_id"], "variable": g["variable"],
                          "low": min(vals), "high": max(vals), "impact": max(vals) - min(vals)})
    ranks = rank_desc([xround(r["impact"], 6) for r in rank_rows])
    concerns = 0
    for r, k in zip(rank_rows, ranks):
        r["rank"] = k
        r["material"] = k <= 3
        r["confidence"] = ev_lookup(ev_idx, r["variable_id"], alt["id"], "confidence")
        r["source_type"] = ev_lookup(ev_idx, r["variable_id"], alt["id"], "source_type")
        r["source"] = ev_lookup(ev_idx, r["variable_id"], alt["id"], "source")
        r["owner"] = ev_lookup(ev_idx, r["variable_id"], alt["id"], "owner")
        r["concern"] = k <= 3 and r["confidence"] in ("Low", NO_RECORD, "")
        concerns += r["concern"]
    tornado = []
    for r in sorted(rank_rows, key=lambda x: x["rank"]):
        e, lo, hi = model_ranpv, r["low"], r["high"]
        flips = (e > 0 and lo <= 0) or (e <= 0 and hi > 0)
        tornado.append({"rank": r["rank"], "variable": r["variable"], "variable_id": r["variable_id"],
                        "down": lo - e, "up": hi - e, "base": e, "low": lo, "high": hi,
                        "flips": "Yes - the risk-adjusted verdict flips" if flips else "No"})
    return {"grid": grid, "ranking": rank_rows, "tornado": tornado, "evidence_concerns": concerns}


def panel_test(case, base, fixed, panel):
    """Rows 56-60: the control-panel five-point test for any selectable parameter."""
    names = [n for n, _ in PANEL_PARAMETERS]
    var_name = panel.get("variable") if panel.get("variable") in names else names[0]
    vid = dict(PANEL_PARAMETERS)[var_name]
    lower, upper = num(panel.get("lower", 0.8)), num(panel.get("upper", 1.2))
    absolute = panel.get("mode") == "Absolute (value)"
    metric = panel.get("metric") or "Risk-adjusted NPV"
    key = {"NPV": "npv", "Risk-adjusted NPV": "ranpv", "CBR": "cbr"}.get(metric, "racbr")
    rows = []
    for frac, lab in zip([0, 0.25, 0.5, 0.75, 1], ["Lower", "Lower-mid", "Base", "Upper-mid", "Upper"]):
        factor = lower + (upper - lower) * frac
        tested = factor if absolute else base[vid] * factor
        used = xround(tested) if vid == "FIN-HORIZON" else tested
        rows.append({"point": lab, "factor": factor, "tested": tested,
                     **shadow_eval(base, fixed, {vid: used})})
    ref = rows[2][key]
    for r in rows:
        r["change_vs_base"] = None if (ref in (None, 0) or r[key] is None) else r[key] / ref - 1
    return {"variable": var_name, "variable_id": vid, "metric": metric, "rows": rows}


# ------------------------------------------------------------------ Gate 5 source (rows 258-269)
def breakeven_feasibility(fin_s, ben, cst, rng):
    be_f, be_i, be_l = fin_s["be_fraud"], fin_s["be_imp"], fin_s["be_life"]
    a = is_number(be_f) and rng["fraud_lo"] < rng["fraud_hi"] and rng["fraud_lo"] <= be_f <= rng["fraud_hi"]
    b = is_number(be_i) and rng["cost_lo"] > 0 and be_i >= rng["cost_lo"]
    life_hi = num(rng["life_hi"])
    c = is_number(be_l) and life_hi > 0 and be_l <= life_hi
    content = ben["total"] != 0 and (cst["initial"] + cst["recurring"]) != 0
    return {"fraud_inside": bool(a), "cost_inside": bool(b), "life_inside": bool(c),
            "has_content": content, "gate5_be": bool(content and (a or b or c))}


# ------------------------------------------------------------------ 14_Recommendation
def level_from(g0, g1, g2, crit, g4, g5, g6, pilot, upside_npv):
    if not g0:
        return 0
    if g2:
        return 2 if crit > 0 else (5 if (g4 and g6) else 4)
    if g1:
        return 2 if crit > 0 else (3 if (g5 and pilot == "Yes") else 2)
    return 1 if upside_npv <= 0 else 2


def mc_code(mc_state, alt_id):
    st = (mc_state or {}).get("status", "Not Run")
    if st == "Current" and mc_state.get("alternative") == alt_id:
        return "MC_CURRENT", "Current"
    if st == "Current":
        return "MC_NOT_RUN_FOR_THIS_ALT", "Not run for this alternative"
    if st == "Error":
        return "MC_ERROR", "Not run for this alternative"
    if st.startswith("Out of Date"):
        return "MC_NOT_RUN", "Not run for this alternative"
    return "MC_NOT_RUN", "Not run"


def recommendation(case, alt, ben, cst, rsk, fin_s, scn, be, drv, checks, mc_state):
    s = fin_s
    g0_parts = {
        "active": bool(alt["active"]),
        "inputs_valid": ben["valid"] and cst["valid"] and cst["residual_ok"],
        "no_hard_errors": checks["global_ok"],
        "risk_complete": rsk["not_assessed"] == 0 and rsk["n_scored"] == 7,
    }
    g0 = all(g0_parts.values())
    g1 = is_number(s["npv"]) and is_number(s["cbr"]) and s["npv"] > 0 and s["cbr"] > 1
    g2 = is_number(s["ranpv"]) and is_number(s["racbr"]) and s["ranpv"] > 0 and s["racbr"] > 1
    crit = rsk["critical"]
    r = scn["results"]
    down, base_s, up, up_npv = r["Downside"]["ranpv"], r["Base"]["ranpv"], r["Upside"]["ranpv"], r["Upside"]["npv"]
    g4 = down > 0
    g5 = be["gate5_be"] or up > 0
    g6 = drv["gate6"]
    pilot = alt.get("pilot_measurable", "Yes")
    level = level_from(g0, g1, g2, crit, g4, g5, g6, pilot, up_npv)
    code, mc_text = mc_code(mc_state, alt["id"])
    reasons = (("ECO_PASS; " if g1 else "ECO_FAIL; ") + ("RA_PASS; " if g2 else "RA_FAIL; ")
               + ("CRIT_RISK; " if crit > 0 else "") + ("UP_VIABLE; " if up > 0 else "")
               + ("" if down > 0 else "DOWN_FAIL; ") + ("BE_PLAUSIBLE; " if be["gate5_be"] else "BE_NOT_PLAUSIBLE; ")
               + ("" if g6 else "DATA_LOW; ") + code)
    fraud_now = alt["benefits"]["fraud_red"]
    conditions = [
        {"condition": "Achieve at least the break-even fraud-loss reduction", "variable_id": "BEN-FRAUD-RED",
         "required": s["be_fraud"], "current": num(fraud_now),
         "status": "Not applicable" if not is_number(s["be_fraud"]) else ("Met" if num(fraud_now) >= s["be_fraud"] else "Not Met"),
         "owner": "Fraud operations"},
        {"condition": "Hold the initial implementation cost at or below the break-even ceiling", "variable_id": "CST-INIT-TOTAL",
         "required": s["be_imp"], "current": cst["initial"],
         "status": "Not applicable" if not is_number(s["be_imp"]) else ("Met" if cst["initial"] <= s["be_imp"] else "Not Met"),
         "owner": "Technology / IT"},
        {"condition": "Operate the system for at least the minimum viable life", "variable_id": "FIN-HORIZON",
         "required": s["be_life"], "current": num(case["finance"]["horizon"]),
         "status": "Not applicable" if not is_number(s["be_life"]) else ("Met" if num(case["finance"]["horizon"]) >= s["be_life"] else "Not Met"),
         "owner": "Finance"},
        {"condition": "Resolve all critical risk issues before full implementation", "variable_id": "RSK-CRIT-N",
         "required": "Zero unresolved", "current": crit, "status": "Met" if crit == 0 else "Not Met",
         "owner": "Risk / governance"},
        {"condition": "Strengthen the evidence behind the top three decision drivers", "variable_id": "EVID-TOP3",
         "required": "No evidence concern", "current": drv["concerns"],
         "status": "Met" if drv["concerns"] == 0 else "Not Met", "owner": "Model operator"},
    ]
    gates = {
        "G0": {"name": "Assessment readiness", "pass": g0, "parts": g0_parts},
        "G1": {"name": "Raw economics", "pass": g1, "npv": s["npv"], "cbr": s["cbr"]},
        "G2": {"name": "Risk-adjusted economics", "pass": g2, "ranpv": s["ranpv"], "racbr": s["racbr"]},
        "G3": {"name": "Critical risk", "pass": crit == 0, "unresolved": crit, "not_assessed": rsk["not_assessed"]},
        "G4": {"name": "Deterministic scenario robustness", "pass": g4, "base": base_s, "downside": down,
               "upside": up, "upside_npv": up_npv},
        "G5": {"name": "Break-even feasibility", "pass": g5, "breakeven_plausible": be["gate5_be"]},
        "G6": {"name": "Evidence quality", "pass": g6, "pilot_measurable": pilot, "concerns": drv["concerns"]},
        "G7": {"name": "Monte Carlo evidence", "status": mc_text},
    }
    return {"gates": gates, "level": level, "label": LEVEL_LABELS[level], "reason_codes": reasons,
            "conditions": conditions,
            "advisory": "This output is advisory. The investment decision remains with the authorised bank decision-makers (URS-17)."}
