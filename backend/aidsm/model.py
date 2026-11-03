"""Case data model: the JSON structure the web app edits, with defaults and normalisation.

A case is a plain dictionary so it can travel as JSON between the browser, the API and files.
`normalise` fills every missing field with the workbook's default, so partial cases (for
example an older saved file) always evaluate.
"""
from __future__ import annotations

import copy

from .constants import (ALT_IDS, BENCHMARK_IDS, BENCHMARK_WEIGHTS, MAX_YEARS, MC_VARIABLES,
                        MON_BENEFIT_CATS, MON_COST_CATS, MON_KPIS)

SCHEMA = "aidsm-case/1"
SCENARIO_KEYS = ["fraud_red", "case_red", "fp_red", "ramp_mult", "init_cost", "rec_cost", "risk_index"]
SCENARIOS = ["Downside", "Base", "Upside"]


def num(x):
    """Excel N(): numbers pass through, blanks and text become 0."""
    if isinstance(x, bool):
        return 1.0 if x else 0.0
    if isinstance(x, (int, float)):
        return float(x)
    return 0.0


def is_blank(x):
    return x is None or (isinstance(x, str) and x.strip() == "")


def is_number(x):
    return isinstance(x, (int, float)) and not isinstance(x, bool)


def _alt_defaults(alt_id: str, index: int) -> dict:
    custom = alt_id not in BENCHMARK_IDS
    return {
        "id": alt_id,
        "name": "Custom Option %d" % (index - 1) if custom else alt_id,
        "type": "Custom" if custom else "Research Benchmark",
        "active": not custom,
        "description": "", "adoption_depth": "", "workflow_areas": "", "human_oversight": "",
        "start_year": 0, "notes": "",
        "benefits": {
            "fraud_method": "Driver-based %", "fraud_red": None, "fraud_direct": None,
            "case_method": "Driver-based %", "case_red": None, "work_red": None, "case_direct": None,
            "fp_method": "Driver-based %", "fp_red": None, "fp_event_cost": None, "fp_direct": None,
            "other_desc": "", "other_direct": None, "other_dup": "No",
            "kpi_resolution": None, "kpi_prioritisation": None, "kpi_efficiency": None,
        },
        "ramp": [1.0] * MAX_YEARS,
        "costs": {
            "initial": {"implement": None, "integrate": None, "train": None, "data": None,
                        "governance": None, "other": None},
            "recurring": {"vendor": None, "data": None, "train": None, "maintenance": None,
                          "monitoring": None, "governance": None, "other": None},
            "year_specific": [0.0] * MAX_YEARS,
            "residual": 0.0, "residual_basis": "",
        },
        "risk": {
            "scores": [None] * 7,
            "critical": ["Not assessed"] * 7 if custom else ["No critical issue"] * 7,
            "rationale": [""] * 7, "confidence": "",
            "mitigation": [""] * 7, "review_date": [""] * 7,
        },
        # Scenario inputs: None means "use the workbook default formula" (base x factor)
        "scenarios": {k: {"Downside": None, "Base": None, "Upside": None} for k in SCENARIO_KEYS},
        # Plausible ranges for Gate 5: None means the default +/-20% template
        "plausible": {"fraud_lo": None, "fraud_hi": None, "cost_lo": None, "cost_hi": None,
                      "life_lo": None, "life_hi": None, "life_basis": ""},
        "pilot_measurable": "Yes",
    }


def _mc_defaults() -> dict:
    return {"alternative": "CUS-01", "iterations": 25000, "seed": 2026,
            "inputs": {aid: [{"variable": v, "enabled": "No", "distribution": "Triangular",
                              "min": None, "mode": None, "max": None, "sd": None}
                             for v, _, _ in MC_VARIABLES] for aid in ALT_IDS}}


def _mon_series():
    return [0.0] * (MAX_YEARS + 1)


def _monitoring_defaults() -> dict:
    return {
        "alternative": "RES-MOD", "approval_date": "", "review_year": 1,
        "approved_rate": 0.1, "approved_horizon": 3, "approved_level": 3,
        "approved_benefits": {k: _mon_series() for k, _, _ in MON_BENEFIT_CATS},
        "approved_costs": {k: _mon_series() for k, _, _ in MON_COST_CATS},
        "realised_benefits": {k: _mon_series() for k, _, _ in MON_BENEFIT_CATS},
        "realised_costs": {k: _mon_series() for k, _, _ in MON_COST_CATS},
        # Current forecast: None in a year means "use the approved schedule" (workbook default)
        "forecast_benefits": {k: [None] * (MAX_YEARS + 1) for k, _, _ in MON_BENEFIT_CATS},
        "forecast_costs": {k: [None] * (MAX_YEARS + 1) for k, _, _ in MON_COST_CATS},
        "kpis": {name: [None] * (MAX_YEARS + 1) for name in MON_KPIS},
        "current_scores": [None] * 7,          # None = approved score carried forward
        "current_critical": ["No critical issue"] * 7,
        "risk_notes": [""] * 7,
        "scenario_factors": {"Downside": [0.8, 1.15], "Base": [1.0, 1.0], "Upside": [1.2, 0.9]},
        "plausible_multiple": 1.2, "multiple_basis": "",
        "evidence_status": ["Unchanged since approval"] * 3, "evidence_notes": [""] * 3,
        "pilot_measurable": "Yes",
        "variance_threshold": 0.1,
        "log": [],
    }


def blank_case() -> dict:
    return {
        "schema": SCHEMA,
        "meta": {"case_id": "CASE-NEW", "case_name": "", "assessment_date": "", "bank_context": "",
                 "prepared_by": "", "status": "Draft", "notes": ""},
        "finance": {"horizon": 3, "rate": 0.1, "ann_years": 3},
        "baseline": {"fraud_exposure": None, "case_cost": None, "fp_cost": None,
                     "alerts": None, "cases": None, "fp_rate": None, "analyst_hours": None,
                     "analyst_cost": None, "resolution_time": None, "loss_per_case": None},
        "risk_config": {"benchmark_weights": list(BENCHMARK_WEIGHTS), "benchmark_lambda": 0.4,
                        "case_weights": list(BENCHMARK_WEIGHTS), "case_lambda": 0.4,
                        "case_lambda_rationale": ""},
        "alternatives": [_alt_defaults(a, i + 1) for i, a in enumerate(ALT_IDS)],
        "evidence": [],
        "sensitivity": {"alternative": "RES-MOD", "variable": "Fraud-loss reduction",
                        "mode": "Relative (% of base)", "lower": 0.8, "upper": 1.2,
                        "metric": "Risk-adjusted NPV"},
        "comparison": {"a": "RES-MOD", "b": "RES-ADV"},
        "dashboard": {"alternative": "RES-MOD"},
        "monte_carlo": _mc_defaults(),
        "monitoring": _monitoring_defaults(),
        # Reproduce workbook v1.5 exactly, including its known driver-block defect (see README).
        "settings": {"workbook_compatibility": True, "unlock_benchmarks": False},
    }


def _merge(default, given):
    """Deep-merge `given` onto `default`; lists of fixed length are merged element by element."""
    if isinstance(default, dict) and isinstance(given, dict):
        out = dict(default)
        for k, v in given.items():
            out[k] = _merge(default[k], v) if k in default else copy.deepcopy(v)
        return out
    if isinstance(default, list) and isinstance(given, list):
        if default and all(not isinstance(d, (dict, list)) for d in default) and len(given) <= len(default):
            return list(given) + default[len(given):]
        return copy.deepcopy(given)
    return copy.deepcopy(given) if given is not None or default is None else None


def normalise(case: dict | None) -> dict:
    base = blank_case()
    if not case:
        return base
    out = _merge(base, {k: v for k, v in case.items() if k != "alternatives"})
    alts_in = {a.get("id"): a for a in case.get("alternatives", []) if isinstance(a, dict)}
    out["alternatives"] = [_merge(_alt_defaults(a, i + 1), alts_in.get(a, {})) for i, a in enumerate(ALT_IDS)]
    for a in out["alternatives"]:                       # ids and types are structural, never edited
        a["type"] = "Research Benchmark" if a["id"] in BENCHMARK_IDS else "Custom"
    mc = out["monte_carlo"]
    for aid in ALT_IDS:
        rows = mc["inputs"].get(aid) or []
        by_var = {r.get("variable"): r for r in rows if isinstance(r, dict)}
        mc["inputs"][aid] = [{**{"variable": v, "enabled": "No", "distribution": "Triangular",
                                 "min": None, "mode": None, "max": None, "sd": None},
                              **by_var.get(v, {})} for v, _, _ in MC_VARIABLES]
    out["schema"] = SCHEMA
    return out


def alt_index(case: dict, alt_id: str) -> int:
    return ALT_IDS.index(alt_id)


def get_alt(case: dict, alt_id: str) -> dict:
    return case["alternatives"][ALT_IDS.index(alt_id)]
