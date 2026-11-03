"""Monte Carlo simulation: the same draws and equations as monte_carlo_engine.py v2.2.

The random stream is identical to the v2.2 engine (numpy default_rng(seed), variables drawn in
workbook order, one full vector per variable), and the evaluation is vectorised across the
iterations while keeping the engine's order of operations, so a given seed reproduces the
engine's results to floating-point precision.
"""
from __future__ import annotations

import hashlib
import json

import numpy as np

from .constants import ALT_IDS, BENCHMARK_IDS, MC_DOMAINS, MC_VARIABLES, MODEL_VERSION
from .model import get_alt, is_blank, is_number, num

DP, WD, ED, DE, NM = "Driver-based %", "Workload driver", "Detailed event driver", "Direct estimate", "Not monetised"


class MCInputError(ValueError):
    pass


def base_values(case, alt):
    """11_MC_Setup column E: the deterministic base value of each uncertain input."""
    b, c = alt["benefits"], alt["costs"]
    lam = (num(case["risk_config"]["benchmark_lambda"]) if alt["id"] in BENCHMARK_IDS
           else num(case["risk_config"]["case_lambda"]))
    return {
        "BEN-FRAUD-RED": num(b["fraud_red"]), "CST-VENDOR": num(c["recurring"]["vendor"]),
        "CST-MAINT-MON": num(c["recurring"]["maintenance"]) + num(c["recurring"]["monitoring"]),
        "BEN-CASE-RED": num(b["case_red"]), "BEN-FP-RED": num(b["fp_red"]), "BEN-RAMP-MULT": 1.0,
        "CST-INIT-TOTAL": sum(num(v) for v in c["initial"].values()),
        "CST-REC-TOTAL": sum(num(v) for v in c["recurring"].values()),
        "BL-FRAUD-EXP": num(case["baseline"]["fraud_exposure"]), "RSK-LAMBDA": lam,
    }


def input_table(case, alt_id):
    """The ten rows for one alternative, with the workbook defaults (base x 0.8 / 1 / 1.2) filled in."""
    alt = get_alt(case, alt_id)
    base = base_values(case, alt)
    rows = []
    given = {r["variable"]: r for r in case["monte_carlo"]["inputs"][alt_id]}
    for var, name, unit in MC_VARIABLES:
        g = given.get(var, {})
        e = base[var]
        lo, hi = MC_DOMAINS[var]
        # Workbook defaults are base x 0.8 / base / base x 1.2. They are ordered (a negative base
        # would otherwise give min > max) and kept inside the permitted domain: the ramp multiplier's
        # default 1.2 maximum is outside its 0-1 domain and used to make every default run fail.
        d_lo, d_hi = sorted((e * 0.8, e * 1.2))
        d_lo, d_hi, d_mode = max(lo, min(hi, d_lo)), max(lo, min(hi, d_hi)), max(lo, min(hi, e))
        mn = num(g["min"]) if is_number(g.get("min")) else d_lo
        mx = num(g["max"]) if is_number(g.get("max")) else d_hi
        rows.append({
            "variable": var, "name": name, "unit": unit, "base": e,
            "enabled": g.get("enabled") or "No",
            "distribution": g.get("distribution") or "Triangular",
            "min": mn,
            "mode": num(g["mode"]) if is_number(g.get("mode")) else d_mode,
            "max": mx,
            # A blank standard deviation defaults to a sixth of the range (about +/-3 sd fills it).
            "sd": num(g["sd"]) if is_number(g.get("sd")) else (mx - mn) / 6.0,
            "sd_default": not is_number(g.get("sd")),
            "domain_lo": lo, "domain_hi": hi,
        })
    return rows


def validate(rows):
    """11_MC_Setup F66, F69, F70 and the engine's pre-sampling checks."""
    errors = []
    on = [r for r in rows if r["enabled"] == "Yes"]
    for r in on:
        if not (r["min"] <= r["mode"] <= r["max"]):
            errors.append("%s: minimum <= most likely <= maximum is required" % r["name"])
        if r["min"] < r["domain_lo"] or r["max"] > r["domain_hi"]:
            errors.append("%s: the range is outside the permitted domain %g to %g"
                          % (r["name"], r["domain_lo"], r["domain_hi"]))
        if r["distribution"].lower().startswith("trunc") and r["sd"] <= 0 and r["max"] > r["min"]:
            errors.append("%s: a truncated normal needs a positive standard deviation" % r["name"])
    names = {r["variable"] for r in on}
    if "CST-REC-TOTAL" in names and names & {"CST-VENDOR", "CST-MAINT-MON"}:
        errors.append("Total recurring cost and its components are both enabled; that would double count the same uncertainty")
    return errors


def required_inputs(case, alt):
    """The engine refuses to default a required input. Mirrors read_case(strict) and _validate_methods."""
    errs = []
    f = case["finance"]
    if not is_number(f["horizon"]) or not (1 <= f["horizon"] <= 15) or not float(f["horizon"]).is_integer():
        errs.append("Evaluation horizon must be a whole number from 1 to 15")
    if not is_number(f["rate"]) or not (0 <= f["rate"] <= 1):
        errs.append("Discount rate must be between 0% and 100%")
    bl = case["baseline"]
    for k, label in (("fraud_exposure", "Annual addressable fraud-loss exposure"),
                     ("case_cost", "Annual fraud case-handling operating cost"),
                     ("fp_cost", "Annual false-positive / customer-friction cost")):
        if not is_number(bl[k]) or bl[k] < 0:
            errs.append("%s is required" % label)
    rc = case["risk_config"]
    for w, label in ((rc["benchmark_weights"], "Benchmark"), (rc["case_weights"], "Case")):
        if any(not is_number(x) for x in w) or abs(sum(num(x) for x in w) - 1) > 1e-6:
            errs.append("%s risk weights must total 100%%" % label)
    for s, nm in zip(alt["risk"]["scores"], range(1, 8)):
        if not is_number(s) or not (1 <= s <= 5):
            errs.append("Risk score %d of 7 must be a number from 1 to 5" % nm)
            break
    b = alt["benefits"]
    if b["fraud_method"] == DE and is_blank(b["fraud_direct"]):
        errs.append("Fraud direct estimate is missing")
    if b["fraud_method"] == DP and is_blank(b["fraud_red"]):
        errs.append("Fraud-loss reduction is missing")
    if b["case_method"] == DE and is_blank(b["case_direct"]):
        errs.append("Case-handling direct estimate is missing")
    if b["case_method"] == WD and (not num(bl["analyst_hours"]) or not num(bl["analyst_cost"]) or is_blank(b["work_red"])):
        errs.append("The workload driver needs analyst hours, analyst cost and the workload reduction")
    if b["case_method"] == DP and is_blank(b["case_red"]):
        errs.append("Case-handling reduction is missing")
    if b["fp_method"] == DE and is_blank(b["fp_direct"]):
        errs.append("False-positive direct estimate is missing")
    if b["fp_method"] in (ED, WD) and (not num(bl["alerts"]) or not num(bl["fp_rate"]) or is_blank(b["fp_event_cost"])):
        errs.append("The event driver needs alerts, the false-positive rate and the cost per event")
    if b["fp_method"] == DP and is_blank(b["fp_red"]):
        errs.append("False-positive reduction is missing")
    return errs


def draw(rng, spec, n):
    lo, mid, hi, sd = spec["min"], spec["mode"], spec["max"], spec["sd"]
    dist = spec["distribution"].lower()
    if dist.startswith("uniform"):     # still consumes draws at zero range, as engine v2.2 does
        return rng.uniform(lo, hi, n)
    if hi == lo:                       # no range (e.g. a zero base): the value is fixed
        return np.full(n, lo)
    if dist.startswith("trunc"):
        out = rng.normal(mid, sd, n)
        bad = (out < lo) | (out > hi)
        # Resample out-of-range draws as engine v2.2 does, but never loop forever: a range that is
        # tiny relative to the sd would otherwise hang the server. Clip any remainder.
        for _ in range(1000):
            if not bad.any():
                break
            out[bad] = rng.normal(mid, sd, int(bad.sum()))
            bad = (out < lo) | (out > hi)
        return np.clip(out, lo, hi)
    return rng.triangular(lo, mid, hi, n)


def spearman(x, y):
    def rank(a):
        order = np.argsort(a, kind="mergesort")
        r = np.empty(len(a), dtype=float)
        r[order] = np.arange(1, len(a) + 1)
        _, inv, counts = np.unique(a, return_inverse=True, return_counts=True)
        if (counts > 1).any():
            sums = np.zeros(len(counts))
            np.add.at(sums, inv, r)
            r = (sums / counts)[inv]
        return r
    rx, ry = rank(np.asarray(x, float)), rank(np.asarray(y, float))
    if rx.std() == 0 or ry.std() == 0:
        return 0.0
    return float(np.corrcoef(rx, ry)[0, 1])


def evaluate_vector(case, alt, o, n):
    """monte_carlo_engine.evaluate, vectorised over n iterations."""
    b, c, bl = alt["benefits"], alt["costs"], case["baseline"]
    full = lambda key, default: np.asarray(o[key], float) if key in o else np.full(n, float(default))
    exposure = full("BL-FRAUD-EXP", num(bl["fraud_exposure"]))
    fraud_red = full("BEN-FRAUD-RED", num(b["fraud_red"]))
    case_red = full("BEN-CASE-RED", num(b["case_red"]))
    fp_red = full("BEN-FP-RED", num(b["fp_red"]))
    fm, cm, pm = b["fraud_method"], b["case_method"], b["fp_method"]
    fraud = (np.zeros(n) if fm == NM else np.full(n, num(b["fraud_direct"])) if fm == DE else exposure * fraud_red)
    if cm == NM:
        casev = np.zeros(n)
    elif cm == DE:
        casev = np.full(n, num(b["case_direct"]))
    elif cm == WD:
        casev = np.full(n, num(bl["analyst_hours"]) * num(b["work_red"]) * num(bl["analyst_cost"]) / 1_000_000.0)
    else:
        casev = num(bl["case_cost"]) * case_red
    if pm == NM:
        fp = np.zeros(n)
    elif pm == DE:
        fp = np.full(n, num(b["fp_direct"]))
    elif pm in (ED, WD):
        fp = num(bl["alerts"]) * num(bl["fp_rate"]) * fp_red * num(b["fp_event_cost"]) / 1_000_000.0
    else:
        fp = num(bl["fp_cost"]) * fp_red
    other = 0.0 if b["other_dup"] == "Yes" else num(b["other_direct"])
    total = fraud + casev + fp + other

    rec_items = c["recurring"]
    initial = full("CST-INIT-TOTAL", sum(num(v) for v in c["initial"].values()))
    recurring = full("CST-REC-TOTAL", sum(num(rec_items[k]) for k in
                                          ("vendor", "data", "train", "maintenance", "monitoring", "governance", "other")))
    if "CST-VENDOR" in o:
        recurring = recurring - num(rec_items["vendor"]) + np.asarray(o["CST-VENDOR"], float)
    if "CST-MAINT-MON" in o:
        recurring = recurring - (num(rec_items["maintenance"]) + num(rec_items["monitoring"])) + np.asarray(o["CST-MAINT-MON"], float)
    ramp_mult = full("BEN-RAMP-MULT", 1.0)
    base_lam = (num(case["risk_config"]["benchmark_lambda"]) if alt["id"] in BENCHMARK_IDS
                else num(case["risk_config"]["case_lambda"]))
    lam = full("RSK-LAMBDA", base_lam)
    rate, hz = num(case["finance"]["rate"]), int(num(case["finance"]["horizon"]))
    ramp = [num(r) for r in alt["ramp"]]
    ys = [num(v) for v in c["year_specific"]]
    residual = num(c["residual"])
    pv_b, pv_c = np.zeros(n), initial.copy()
    for t in range(1, hz + 1):
        df = 1.0 / (1.0 + rate) ** t
        benefit_t = total * np.minimum(ramp[t - 1] * ramp_mult, 1.0)
        if t == hz:
            benefit_t = benefit_t + residual
        pv_b = pv_b + benefit_t * df
        pv_c = pv_c + (recurring + ys[t - 1]) * df
    rc = case["risk_config"]
    w = rc["benchmark_weights"] if alt["id"] in BENCHMARK_IDS else rc["case_weights"]
    ri = float(np.dot([num(x) for x in w], [num(s) for s in alt["risk"]["scores"]])) / 5.0
    raf = 1.0 - lam * ri
    with np.errstate(divide="ignore", invalid="ignore"):
        cbr = np.where(pv_c != 0, pv_b / pv_c, np.nan)
        racbr = np.where(pv_c != 0, cbr * raf, np.nan)
    return {"NPV": pv_b - pv_c, "Risk-adjusted NPV": pv_b * raf - pv_c, "Lifecycle CBR": cbr,
            "Risk-adjusted CBR": racbr}


def state_hash(case, alt_id):
    """Fingerprint of everything that defines a run (the web equivalent of 12_MC_Results rows 67-80)."""
    alt = get_alt(case, alt_id)
    mc = case["monte_carlo"]
    state = {"case_id": case["meta"]["case_id"], "model": MODEL_VERSION, "alt": alt_id,
             "finance": case["finance"], "baseline": case["baseline"], "risk_config": case["risk_config"],
             "benefits": alt["benefits"], "ramp": alt["ramp"], "costs": alt["costs"],
             "scores": alt["risk"]["scores"], "mc_inputs": mc["inputs"][alt_id],
             "iterations": mc["iterations"], "seed": mc["seed"]}
    return hashlib.sha256(json.dumps(state, sort_keys=True, default=str).encode()).hexdigest()


def run(case, alt_id=None, iterations=None, seed=None):
    mc = case["monte_carlo"]
    alt_id = alt_id or mc["alternative"]
    if alt_id not in ALT_IDS:
        raise MCInputError("Unknown alternative %r" % alt_id)
    iterations = int(iterations or mc["iterations"])
    seed = int(mc["seed"] if seed is None else seed)
    if not (1 <= iterations <= 1_000_000):
        raise MCInputError("Iterations must be between 1 and 1,000,000")
    alt = get_alt(case, alt_id)
    rows = input_table(case, alt_id)
    errs = validate(rows) + required_inputs(case, alt)
    if errs:
        raise MCInputError("; ".join(errs))
    specs = [r for r in rows if r["enabled"] == "Yes"]
    if not specs:
        raise MCInputError("No variables have uncertainty enabled for %s. Set 'Uncertainty enabled?' to Yes "
                           "for the variables you want to simulate." % alt_id)
    rng = np.random.default_rng(seed)
    samples = {s["variable"]: draw(rng, s, iterations) for s in specs}
    out = evaluate_vector(case, alt, samples, iterations)

    def stats(arr):
        return {"mean": float(arr.mean()), "median": float(np.median(arr)),
                "std": float(arr.std(ddof=1)) if len(arr) > 1 else 0.0,
                "p5": float(np.percentile(arr, 5)), "p25": float(np.percentile(arr, 25)),
                "p75": float(np.percentile(arr, 75)), "p95": float(np.percentile(arr, 95))}
    summary = {k: stats(v) for k, v in out.items()}
    probs = {"npv_pos": float((out["NPV"] > 0).mean()), "ranpv_pos": float((out["Risk-adjusted NPV"] > 0).mean()),
             "cbr_gt1": float((out["Lifecycle CBR"] > 1).mean()), "racbr_gt1": float((out["Risk-adjusted CBR"] > 1).mean())}
    names = {v: n for v, n, _ in MC_VARIABLES}
    drivers = sorted(((v, spearman(samples[v], out["Risk-adjusted NPV"])) for v in samples),
                     key=lambda t: abs(t[1]), reverse=True)
    counts, edges = np.histogram(out["Risk-adjusted NPV"], bins=20)
    ra = np.sort(out["Risk-adjusted NPV"])
    cdf_idx = np.linspace(0, len(ra) - 1, min(101, len(ra))).astype(int)
    return {
        "status": "Run complete", "alternative": alt_id, "iterations": iterations, "seed": seed,
        "input_hash": state_hash(case, alt_id), "engine": "aidsm-web (MC logic of engine v2.2)",
        "variables": [s["variable"] for s in specs], "inputs": rows,
        "summary": summary, "probabilities": probs,
        "drivers": [{"rank": i + 1, "variable_id": v, "variable": names[v], "rho": r, "abs_rho": abs(r)}
                    for i, (v, r) in enumerate(drivers[:8])],
        "histogram": [{"lo": float(edges[i]), "hi": float(edges[i + 1]), "count": int(counts[i])} for i in range(20)],
        "cdf": [{"value": float(ra[i]), "p": float(i / (len(ra) - 1)) if len(ra) > 1 else 1.0} for i in cdf_idx],
    }


def status(case):
    """12_MC_Results C15 equivalent: Not Run / Error / Out of Date / Current."""
    res = case.get("mc_result")
    if not res:
        return {"status": "Not Run", "text": "Not Run - Monte Carlo has not been run for this case"}
    if res.get("status") == "Error":
        return {"status": "Error", "text": "Error - the last run failed, see the engine message",
                "alternative": res.get("alternative")}
    alt = res.get("alternative")
    if alt not in ALT_IDS:
        return {"status": "Error", "text": "Error - unknown alternative in the stored result"}
    current = state_hash(case, alt) == res.get("input_hash")
    if not current:
        return {"status": "Out of Date", "text": "Out of Date - rerun simulation", "alternative": alt}
    return {"status": "Current", "text": "Current", "alternative": alt}
