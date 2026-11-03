"""Build the parity fixtures from the v1.5 workbook.

Each fixture is a variant of the frozen workbook, recalculated by LibreOffice, then stored as
JSON: the case the web app imports from it, and the value Excel's formulas produce in every
compared cell. The tests (test_parity.py) only need the JSON, so they run anywhere.

    python tests/build_fixtures.py          # needs LibreOffice (soffice) on the PATH

Only needed when the workbook or the fixture recipes change.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from openpyxl import load_workbook

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE))

from aidsm.xlsx_io import TEMPLATE, import_workbook   # noqa: E402
from parity import expected_from_workbook             # noqa: E402

OUT = HERE / "fixtures"


def recalc(path: Path):
    """Recalculate in place with headless LibreOffice."""
    helper = Path("/mnt/skills/public/xlsx/scripts/recalc.py")       # authoring environment only
    if helper.exists():
        subprocess.run([sys.executable, str(helper), str(path), "600"], check=True, capture_output=True)
        return
    outdir = Path(tempfile.mkdtemp())
    exe = shutil.which("soffice") or shutil.which("libreoffice")
    if not exe:
        raise SystemExit("LibreOffice (soffice) is needed to rebuild the fixtures.")
    subprocess.run([exe, "--headless", "--norestore", "--convert-to", "xlsx", "--outdir", str(outdir), str(path)],
                   check=True, capture_output=True, timeout=600, env=dict(os.environ, HOME=str(outdir)))
    shutil.move(str(outdir / path.name), str(path))


def ev_add(ev, rows):
    """Append evidence records after the last used row of the register."""
    r = 5
    while ev["A%d" % r].value not in (None, ""):
        r += 1
    for rec in rows:
        for j, v in enumerate(rec):
            ev["%s%d" % (chr(ord("A") + j), r)] = v
        r += 1


def v_methods(wb):
    bl, be, co, rk, al = wb["03_Baseline"], wb["05_Benefits"], wb["06_Costs"], wb["07_Risk"], wb["04_AI_Alternatives"]
    bl["D12"], bl["D13"], bl["D14"], bl["D15"], bl["D16"], bl["D17"] = 100000, 12000, 0.20, 60000, 450, 6
    for r in (7, 8, 9):
        al["D%d" % r] = "Yes"
    co["H42"], co["H43"] = 5, "Test residual value for the fixture"
    be["F7"], be["F9"] = "Driver-based %", 0.08
    be["F14"], be["F18"] = "Workload driver", 0.20
    be["F24"], be["F26"], be["F29"] = "Detailed event driver", 0.50, 100
    co["F7"], co["F16"], co["F21"] = 30, 5, 2
    be["G7"], be["G10"] = "Direct estimate", 20
    be["G14"], be["G20"] = "Direct estimate", 4
    be["G24"], be["G30"] = "Direct estimate", 1.5
    be["G35"], be["G36"] = 2, "No"
    co["G7"], co["G16"], co["G21"] = 40, 8, 2
    be["H7"] = "Not monetised"
    be["H14"], be["H16"] = "Driver-based %", 0.10
    be["H24"], be["H26"] = "Driver-based %", 0.20
    be["H35"], be["H36"] = 3, "Yes"
    co["H7"], co["H16"], co["H21"] = 25, 4, 2
    for col, s in (("F", 3), ("G", 2.5), ("H", 4)):
        for r in range(6, 13):
            rk["%s%d" % (col, r)] = s
        for r in range(32, 39):
            rk["%s%d" % (col, r)] = "No critical issue"
    wb["09_Sensitivity"]["C5"] = "CUS-01"
    wb["15_Dashboard"]["B4"] = "CUS-02"
    wb["13_Comparison"]["C38"], wb["13_Comparison"]["C39"] = "CUS-01", "CUS-02"


def v_levels(wb):
    """R5 on CUS-01, R4 on CUS-02, R1 on CUS-03, a critical issue on RES-ADV; horizon 5."""
    cs, be, co, rk, al, ev = (wb["01_Case_Setup"], wb["05_Benefits"], wb["06_Costs"], wb["07_Risk"],
                              wb["04_AI_Alternatives"], wb["02_Evidence_Register"])
    cs["D16"] = 5
    for r in (7, 8, 9):
        al["D%d" % r] = "Yes"
    # CUS-01: strongly positive, low risk, well evidenced -> R5
    be["F9"], be["F16"], be["F26"] = 0.15, 0.15, 0.20
    co["F7"], co["F16"], co["F17"] = 30, 6, 2
    # CUS-02: positive on base, negative in the downside -> R4
    be["G9"], be["G16"], be["G26"] = 0.10, 0.12, 0.15
    co["G7"], co["G16"], co["G17"], co["G21"] = 55, 8, 3, 3
    # CUS-03: not viable even in the upside -> R1
    be["H9"], be["H16"], be["H26"] = 0.02, 0.02, 0.02
    co["H7"], co["H16"] = 80, 10
    for col, s in (("F", 1.5), ("G", 2.5), ("H", 3)):
        for r in range(6, 13):
            rk["%s%d" % (col, r)] = s
        for r in range(32, 39):
            rk["%s%d" % (col, r)] = "No critical issue"
        for r in range(44, 51):
            rk["%s%d" % (col, r)] = "Fixture rationale"
    rk["E35"] = "Critical issue unresolved"
    ev_add(ev, [
        ["BEN-FRAUD-RED", "CUS-01", "Fraud-loss reduction", 0.15, "%", "Bank internal data", "Pilot results 2026", "Fraud operations", "2026-10-01", "High", "Measured in pilot", ""],
        ["BL-FRAUD-EXP", "CUS-01", "Exposure", 300, "R m/year", "Bank internal data", "Loss ledger", "Finance", "2026-10-01", "High", "Ledger", ""],
        ["FIN-HORIZON", "CUS-01", "Horizon", 5, "Years", "Bank internal data", "IT asset policy", "Finance", "2026-10-01", "High", "Policy", ""],
        ["CST-INIT-TOTAL", "CUS-01", "Initial cost", 30, "R m", "Vendor estimate", "Quote", "Technology / IT", "2026-10-01", "Medium", "Quote", ""],
        ["CST-REC-TOTAL", "CUS-01", "Recurring cost", 8, "R m/year", "Vendor estimate", "Quote", "Technology / IT", "2026-10-01", "Medium", "Quote", ""],
        ["BEN-CASE-RED", "CUS-01", "Case reduction", 0.15, "%", "Bank internal data", "Pilot", "Fraud operations", "2026-10-01", "Medium", "Pilot", ""],
    ])
    sc = wb["10_Scenarios"]
    sc["F34"], sc["F35"], sc["F36"] = 3, 7, "Asset life policy"
    wb["09_Sensitivity"]["C5"] = "CUS-02"
    wb["15_Dashboard"]["B4"] = "CUS-01"
    wb["13_Comparison"]["C38"], wb["13_Comparison"]["C39"] = "CUS-02", "CUS-01"
    mo = wb["16_Monitoring"]
    mo["C5"] = "CUS-01"
    mo["C10"], mo["C11"] = 5, 5


def v_config(wb):
    """Case weights and lambda 0.3, year-specific costs, residual value, a ramp, horizon 15, rate 7%."""
    cs, be, co, rk, al = wb["01_Case_Setup"], wb["05_Benefits"], wb["06_Costs"], wb["07_Risk"], wb["04_AI_Alternatives"]
    cs["D16"], cs["D17"], cs["D20"] = 15, 0.07, 4
    al["D7"], al["D8"] = "Yes", "Yes"
    for r, w in zip(range(6, 13), [0.3, 0.1, 0.1, 0.2, 0.1, 0.1, 0.1]):
        rk["C%d" % r] = w
    rk["C27"], rk["C29"] = 0.3, "Board risk appetite statement 2026"
    be["F9"], be["F16"], be["F26"] = 0.12, 0.10, 0.10
    for t, v in enumerate([0.3, 0.6, 0.9]):
        be["%s60" % chr(ord("D") + t)] = v
    co["F7"], co["F8"], co["F9"], co["F16"], co["F19"], co["F20"] = 35, 5, 2, 6, 1.5, 0.5
    for t, v in ((2, 4.0), (6, 7.5), (11, 3.0)):
        co["%s35" % chr(ord("D") + t)] = v
    co["F42"], co["F43"] = 12, "Licence resale value per vendor contract"
    for r, s in zip(range(6, 13), [3, 2.5, 2, 3.5, 2.5, 2, 3]):
        rk["F%d" % r] = s
    for r in range(32, 39):
        rk["F%d" % r] = "No critical issue"
    # CUS-02 with user-entered scenario values and plausible ranges
    be["G9"], be["G16"], be["G26"] = 0.09, 0.08, 0.12
    co["G7"], co["G16"] = 28, 7
    for r in range(6, 13):
        rk["G%d" % r] = 2
    for r in range(32, 39):
        rk["G%d" % r] = "No critical issue"
    sc = wb["10_Scenarios"]
    sc["G6"], sc["G7"], sc["G8"] = 0.05, 0.09, 0.14
    sc["G18"], sc["G20"] = 40, 20
    sc["G15"], sc["G24"] = 0.7, 0.5
    sc["G30"], sc["G31"], sc["G32"], sc["G33"] = 0.06, 0.15, 20, 45
    sc["G35"], sc["G36"] = 10, "Vendor support horizon"
    wb["09_Sensitivity"]["C5"] = "CUS-01"
    wb["15_Dashboard"]["B4"] = "CUS-01"
    mo = wb["16_Monitoring"]
    mo["C5"], mo["C8"] = "RES-ADV", 2
    mo["D80"], mo["D81"] = 4, 4.5
    mo["E82"] = "Critical issue unresolved"
    mo["D137"], mo["D138"], mo["D139"] = "Resolved by pilot evidence", "Low", "Medium"
    mo["H52"] = 25           # a user forecast override in year 4


def v_errors(wb):
    """Hard errors: blank core baseline value and weights that do not total 100% -> R0 everywhere."""
    bl, rk = wb["03_Baseline"], wb["07_Risk"]
    bl["D8"] = None
    rk["C6"] = 0.3
    wb["01_Case_Setup"]["D17"] = 0.0


def v_monitor_ok(wb):
    """Monitoring with realised values on plan (On Track / Attention Required paths)."""
    mo = wb["16_Monitoring"]
    mo["C8"] = 2
    for r_app, r_real in ((16, 34), (17, 35), (18, 36), (19, 37), (24, 42), (25, 43), (26, 44), (27, 45), (28, 46), (29, 47)):
        for c in "DEFG":
            mo["%s%d" % (c, r_real)] = mo["%s%d" % (c, r_app)].value
    mo["E34"] = 31
    mo["C11"] = 2


VARIANTS = {"frozen": None, "methods": v_methods, "levels": v_levels, "config": v_config,
            "errors": v_errors, "monitor_ok": v_monitor_ok}


def build(name, fn):
    work = Path(tempfile.mkdtemp()) / ("fx_%s.xlsx" % name)
    shutil.copy(TEMPLATE, work)
    if fn:
        wb = load_workbook(work)
        fn(wb)
        wb.calculation.fullCalcOnLoad = True
        wb.save(work)
        recalc(work)
    data = work.read_bytes()
    case = import_workbook(data)
    expected = expected_from_workbook(work)
    OUT.mkdir(exist_ok=True)
    (OUT / ("%s.json" % name)).write_text(json.dumps({"case": case, "expected": expected}, indent=1, default=str))
    return work


if __name__ == "__main__":
    names = sys.argv[1:] or list(VARIANTS)
    for n in names:
        p = build(n, VARIANTS[n])
        print("built", n, "->", p)
