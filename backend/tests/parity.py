"""Cell-by-cell parity between the web engine and a calculated v1.5 workbook.

`expected_from_workbook(path)` reads the values Excel (or LibreOffice) stored in the workbook,
`actual_from_engine(results)` lays the engine's results out on the same cell addresses, and
`compare` reports every cell that differs. The same map is used to build the JSON fixtures in
tests/fixtures, so the tests run without Excel or LibreOffice.
"""
from __future__ import annotations

import math

from aidsm.constants import ALT_IDS, MAX_YEARS, SENS_VARIABLES

COLS = ["D", "E", "F", "G", "H"]
YCOLS = [chr(ord("D") + t) for t in range(MAX_YEARS + 1)]          # D..S = years 0..15
TEXT_FOR_NONE = True                                               # Excel text messages <-> engine None


def _cells():
    """(sheet, cell, getter) for every compared output. getter(results) -> value."""
    out = []

    def add(sheet, cell, fn):
        out.append((sheet, cell, fn))

    A = lambda r, aid: r["alternatives"][aid]
    for i, aid in enumerate(ALT_IDS):
        c = COLS[i]
        # 05_Benefits
        for row, key in ((11, "fraud"), (21, "case"), (31, "fp"), (37, "other"), (45, "total")):
            add("05_Benefits", "%s%d" % (c, row), lambda r, a=aid, k=key: A(r, a)["benefits"][k])
        add("05_Benefits", "%s54" % c, lambda r, a=aid: A(r, a)["benefits"]["valid"])
        # 06_Costs
        add("06_Costs", "%s13" % c, lambda r, a=aid: A(r, a)["costs"]["initial"])
        add("06_Costs", "%s23" % c, lambda r, a=aid: A(r, a)["costs"]["recurring"])
        add("06_Costs", "%s29" % c, lambda r, a=aid: A(r, a)["costs"]["valid"])
        # 07_Risk
        for row, key in ((25, "wrs"), (26, "ri"), (27, "lambda"), (28, "raf"), (39, "critical"),
                         (40, "not_assessed"), (103, "without_record"), (104, "without_rationale")):
            add("07_Risk", "%s%d" % (c, row), lambda r, a=aid, k=key: A(r, a)["risk"][k])
        for j in range(7):
            add("07_Risk", "%s%d" % (c, 54 + j), lambda r, a=aid, j=j: A(r, a)["risk"]["evidence_confidence"][j])
            add("07_Risk", "%s%d" % (c, 64 + j), lambda r, a=aid, j=j: A(r, a)["risk"]["evidence_source"][j])
            add("07_Risk", "%s%d" % (c, 74 + j), lambda r, a=aid, j=j: A(r, a)["risk"]["evidence_owner"][j])
        # 08_Financial_Model - annualised
        for row, key in ((6, "benefit"), (7, "implementation"), (8, "recurring"), (9, "cost"), (10, "cbr"),
                         (11, "raf"), (12, "racbr")):
            add("08_Financial_Model", "%s%d" % (c, row), lambda r, a=aid, k=key: A(r, a)["financial"]["annualised"][k])
        # 08 - lifecycle block for this alternative
        b0 = 19 + 13 * i
        keys = ["benefit", "cost", "net", "pv_benefit", "pv_cost", "pv_net", "cum_pv_net", "ra_pv_benefit",
                "cum_ra_pv_net", "unconstrained_ra_pv_net", "cum_unconstrained_ra_pv_net"]
        for k_i, key in enumerate(keys):
            for t, yc in enumerate(YCOLS):
                add("08_Financial_Model", "%s%d" % (yc, b0 + k_i),
                    lambda r, a=aid, k=key, t=t: A(r, a)["financial"]["years"][k][t])
        # 08 - summary
        for row, key in ((86, "pvb"), (87, "pvc"), (88, "npv"), (89, "cbr"), (90, "raf"), (91, "ranpv"),
                         (92, "racbr"), (93, "payback"), (94, "ra_breakeven_year"), (95, "irr"), (96, "af"),
                         (97, "be_imp"), (98, "be_fraud"), (99, "be_life"), (100, "be_imp_raw"),
                         (101, "be_fraud_raw"), (102, "be_life_raw_excel")):
            add("08_Financial_Model", "%s%d" % (c, row), lambda r, a=aid, k=key: A(r, a)["financial"]["summary"][k])
        # 10_Scenarios
        for j, key in enumerate(["fraud_red", "case_red", "fp_red", "ramp_mult", "init_cost", "rec_cost", "risk_index"]):
            for s_i, s in enumerate(("Downside", "Base", "Upside")):
                add("10_Scenarios", "%s%d" % (c, 6 + 3 * j + s_i),
                    lambda r, a=aid, k=key, s=s: A(r, a)["scenarios"]["inputs"][k][s])
        for row0, key in ((40, "pvb"), (43, "pvc"), (46, "npv"), (49, "cbr"), (52, "raf"), (55, "ranpv"), (58, "racbr")):
            for s_i, s in enumerate(("Downside", "Base", "Upside")):
                add("10_Scenarios", "%s%d" % (c, row0 + s_i),
                    lambda r, a=aid, k=key, s=s: A(r, a)["scenarios"]["results"][s][k])
        add("10_Scenarios", "%s64" % c, lambda r, a=aid: A(r, a)["scenarios"]["coherence"])
        for row, key in ((30, "fraud_lo"), (31, "fraud_hi"), (32, "cost_lo"), (33, "cost_hi"), (37, "life_status")):
            add("10_Scenarios", "%s%d" % (c, row), lambda r, a=aid, k=key: A(r, a)["plausible"][k])
        # 09 Gate 5 and driver block
        for row, key in ((261, "fraud_inside"), (264, "cost_inside"), (267, "life_inside"), (268, "has_content"),
                         (269, "gate5_be")):
            add("09_Sensitivity", "%s%d" % (c, row), lambda r, a=aid, k=key: A(r, a)["breakeven"][k])
        for j in range(13):
            row = 280 + 13 * i + j
            for col, key in (("D", "ranpv_low"), ("E", "ranpv_high"), ("F", "impact"), ("G", "rank"),
                             ("I", "confidence"), ("K", "source_type"), ("L", "source"), ("M", "owner")):
                add("09_Sensitivity", "%s%d" % (col, row), lambda r, a=aid, j=j, k=key: A(r, a)["drivers"]["rows"][j][k])
            add("09_Sensitivity", "J%d" % row,
                lambda r, a=aid, j=j: "Evidence concern" if A(r, a)["drivers"]["rows"][j]["concern"] else "OK")
        add("09_Sensitivity", "%s348" % c, lambda r, a=aid: A(r, a)["drivers"]["concerns"])
        add("09_Sensitivity", "%s349" % c, lambda r, a=aid: A(r, a)["drivers"]["gate6"])
        # 14_Recommendation
        G = lambda r, a: A(r, a)["recommendation"]["gates"]
        add("14_Recommendation", "%s10" % c, lambda r, a=aid: G(r, a)["G0"]["pass"])
        add("14_Recommendation", "%s15" % c, lambda r, a=aid: G(r, a)["G1"]["pass"])
        add("14_Recommendation", "%s20" % c, lambda r, a=aid: G(r, a)["G2"]["pass"])
        add("14_Recommendation", "%s25" % c, lambda r, a=aid: G(r, a)["G3"]["pass"])
        add("14_Recommendation", "%s32" % c, lambda r, a=aid: G(r, a)["G4"]["pass"])
        add("14_Recommendation", "%s37" % c, lambda r, a=aid: G(r, a)["G5"]["pass"])
        add("14_Recommendation", "%s41" % c, lambda r, a=aid: G(r, a)["G6"]["pass"])
        add("14_Recommendation", "%s44" % c, lambda r, a=aid: G(r, a)["G7"]["status"])
        add("14_Recommendation", "%s47" % c, lambda r, a=aid: A(r, a)["recommendation"]["level"])
        add("14_Recommendation", "%s48" % c, lambda r, a=aid: A(r, a)["recommendation"]["label"])
        add("14_Recommendation", "%s49" % c, lambda r, a=aid: A(r, a)["recommendation"]["reason_codes"])
        for k in range(5):
            for off, key in ((0, "required"), (1, "current"), (2, "status")):
                add("14_Recommendation", "%s%d" % (c, 54 + 4 * k + off),
                    lambda r, a=aid, k=k, key=key: A(r, a)["recommendation"]["conditions"][k][key])
        # 13_Comparison
        for row, key in ((6, "initial_cost"), (7, "recurring_cost"), (8, "benefit_total"), (9, "pvb"), (10, "pvc"),
                         (11, "npv"), (12, "cbr"), (13, "wrs"), (14, "ri"), (15, "raf"), (16, "ranpv"), (17, "racbr"),
                         (18, "payback"), (19, "critical"), (20, "be_fraud"), (21, "be_imp"), (22, "be_life"),
                         (23, "scn_down"), (24, "scn_base"), (25, "scn_up"), (26, "evidence_concerns"),
                         (30, "mc_status"), (35, "recommendation")):
            add("13_Comparison", "%s%d" % (c, row), lambda r, i=i, k=key: r["comparison"]["table"][i][k])
        for j in range(3):
            add("13_Comparison", "%s%d" % (c, 27 + j), lambda r, i=i, j=j: r["comparison"]["table"][i]["drivers"][j])

    for cell, key in (("C40", "d_pvb"), ("C41", "d_pvc"), ("C42", "icbr"), ("C43", "d_npv"), ("C44", "d_ranpv"),
                      ("C45", "reading")):
        add("13_Comparison", cell, lambda r, k=key: r["comparison"]["incremental"][k])

    # 09 sensitivity grid / ranking / tornado / shadow check for the selected alternative
    for v_i, (vid, _) in enumerate(SENS_VARIABLES):
        for p in range(5):
            row = 65 + 5 * v_i + p
            for col, key in (("AH", "pvb"), ("AI", "pvc"), ("AJ", "npv"), ("AL", "raf"), ("AM", "ranpv")):
                add("09_Sensitivity", "%s%d" % (col, row),
                    lambda r, v=v_i, p=p, k=key: r["sensitivity"]["grid"][v]["points"][p][k])
        row = 178 + v_i
        for col, key in (("C", "low"), ("D", "high"), ("E", "impact"), ("F", "rank"), ("H", "confidence")):
            add("09_Sensitivity", "%s%d" % (col, row), lambda r, v=v_i, k=key: r["sensitivity"]["ranking"][v][k])
        row = 204 + v_i
        for col, key in (("B", "variable"), ("C", "down"), ("D", "up"), ("E", "base"), ("F", "low"), ("G", "high")):
            add("09_Sensitivity", "%s%d" % (col, row), lambda r, v=v_i, k=key: r["sensitivity"]["tornado"][v][k])
    add("09_Sensitivity", "E200", lambda r: r["sensitivity"]["evidence_concerns"])
    for j, row in enumerate(range(273, 277)):
        add("09_Sensitivity", "D%d" % row, lambda r, j=j: r["sensitivity"]["shadow_check"][j]["shadow"])
        add("09_Sensitivity", "F%d" % row, lambda r, j=j: r["sensitivity"]["shadow_check"][j]["result"])

    # 01 / 03 / 07 / 00 checks
    for sheet, cell, key in (("01_Case_Setup", "D24", "case_fields"), ("01_Case_Setup", "D25", "horizon"),
                             ("01_Case_Setup", "D26", "rate"), ("03_Baseline", "D22", "baseline_core"),
                             ("03_Baseline", "D23", "baseline_workload"), ("03_Baseline", "D24", "baseline_nonneg"),
                             ("03_Baseline", "D25", "baseline_fprate"), ("03_Baseline", "D26", "baseline_cases"),
                             ("03_Baseline", "D27", "baseline_valid"), ("07_Risk", "D13", "case_weights"),
                             ("07_Risk", "D14", "benchmark_weights"), ("07_Risk", "D29", "lambda_rationale"),
                             ("00_Home", "B14", "home_status")):
        add(sheet, cell, lambda r, k=key: r["checks"][k])

    # 16_Monitoring
    M = lambda r: r["monitoring"]
    add("16_Monitoring", "C85", lambda r: M(r)["risk"]["wrs"])
    add("16_Monitoring", "C86", lambda r: M(r)["risk"]["raf"])
    add("16_Monitoring", "C87", lambda r: M(r)["risk"]["critical"])
    add("16_Monitoring", "C88", lambda r: M(r)["risk"]["all_scored"])
    for row, key in ((91, "approved_pvb"), (92, "approved_pvc"), (93, "approved_npv"), (94, "approved_ranpv"),
                     (95, "realised_pvb"), (96, "forecast_pvb"), (97, "realised_pvc"), (98, "forecast_pvc"),
                     (99, "current_pvb"), (100, "current_pvc"), (101, "current_npv"), (102, "current_cbr"),
                     (103, "current_ranpv"), (104, "current_racbr")):
        add("16_Monitoring", "C%d" % row, lambda r, k=key: M(r)["valuation"][k])
    for j in range(10):
        for col, key in (("D", "approved"), ("E", "actual"), ("F", "variance"), ("G", "variance_pct"),
                         ("I", "assessment"), ("J", "magnitude")):
            add("16_Monitoring", "%s%d" % (col, 108 + j), lambda r, j=j, k=key: M(r)["variance"][j][k])
    for s, row in (("Downside", 121), ("Base", 122), ("Upside", 123)):
        for col, key in (("D", "pv_forecast_benefits"), ("E", "pv_forecast_costs"), ("F", "npv"), ("G", "ranpv")):
            add("16_Monitoring", "%s%d" % (col, row), lambda r, s=s, k=key: M(r)["gate4"][s][k])
    for cell, key in (("C126", "required_multiple"), ("C129", "max_viable_remaining_cost"),
                      ("C130", "pv_forecast_remaining_cost"), ("C131", "benefit_breakeven_ok"),
                      ("C132", "cost_fits"), ("C133", "pass")):
        add("16_Monitoring", cell, lambda r, k=key: M(r)["gate5"][k])
    for j in range(3):
        add("16_Monitoring", "B%d" % (137 + j), lambda r, j=j: M(r)["gate6"]["rows"][j]["driver"])
        add("16_Monitoring", "C%d" % (137 + j), lambda r, j=j: M(r)["gate6"]["rows"][j]["confidence_at_approval"])
        add("16_Monitoring", "E%d" % (137 + j), lambda r, j=j: M(r)["gate6"]["rows"][j]["adequate"])
    add("16_Monitoring", "C141", lambda r: M(r)["gate6"]["pass"])
    for j in range(6):
        add("16_Monitoring", "C%d" % (146 + j), lambda r, j=j: M(r)["triggers"][j]["active"])
    add("16_Monitoring", "C154", lambda r: M(r)["warnings"]["adverse_beyond_threshold"])
    add("16_Monitoring", "C155", lambda r: M(r)["warnings"]["implementation_over_budget"])
    add("16_Monitoring", "C157", lambda r: M(r)["reassessment"]["level"])
    add("16_Monitoring", "C158", lambda r: M(r)["reassessment"]["label"])
    add("16_Monitoring", "C159", lambda r: M(r)["reassessment"]["reason_codes"])
    add("16_Monitoring", "C160", lambda r: M(r)["trigger_count"])
    add("16_Monitoring", "C161", lambda r: M(r)["status"])
    return out


CELLS = _cells()


def expected_from_workbook(path):
    from openpyxl import load_workbook
    wb = load_workbook(path, data_only=True)
    exp = {}
    for sheet, cell, _ in CELLS:
        v = wb[sheet][cell].value
        exp["%s!%s" % (sheet, cell)] = v
    wb.close()
    return exp


def actual_from_engine(results):
    out = {}
    for sheet, cell, fn in CELLS:
        out["%s!%s" % (sheet, cell)] = fn(results)
    return out


def _same(exp, got, tol=1e-7):
    if isinstance(exp, bool) or isinstance(got, bool):
        return bool(exp) == bool(got) if (isinstance(exp, bool) and isinstance(got, bool)) else False
    if isinstance(exp, (int, float)) and isinstance(got, (int, float)):
        if math.isnan(got) and math.isnan(exp):
            return True
        return abs(exp - got) <= tol * max(1.0, abs(exp))
    if isinstance(exp, str) and got is None:
        return TEXT_FOR_NONE           # engine returns None where Excel shows an explanatory text
    if exp is None and got in (None, "", 0, 0.0):
        return True
    if exp in (None, "") and got in (None, ""):
        return True
    if isinstance(exp, str) and isinstance(got, str):
        return exp.strip() == got.strip()
    return exp == got


def compare(expected, actual, tol=1e-7):
    bad = []
    for key, exp in expected.items():
        got = actual[key]
        if not _same(exp, got, tol):
            bad.append((key, exp, got))
    return bad
