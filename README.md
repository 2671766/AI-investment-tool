# AI Investment Decision Support — web app

A web version of the **AI Investment Decision-Support Model v1.5** workbook for evaluating AI
investment in bank fraud detection. It does everything the workbook does: case setup, evidence
register, baseline, alternatives, benefits, costs, risk, the annualised and lifecycle financial
model, break-evens, scenarios, sensitivity, Monte Carlo, comparison, the gated advisory
recommendation, the dashboard and post-implementation monitoring.

The web app **complements the workbook; it does not replace it.** The frozen v1.5 workbook
stays the verified reference model. The web app:

- runs the same formulas, checked cell by cell against the workbook (see *Verification*);
- imports the inputs from any v1.5 workbook (**File → Import from Excel**);
- exports a case back into a copy of the v1.5 workbook that Excel recalculates on opening
  (**File → Export to Excel**), so any result can be confirmed in Excel.

---

## Quick start

You need **Python 3.10 or later** and **Node.js 18 or later**.

```bash
# macOS / Linux
./start.sh

# Windows
start.bat
```

The script creates a Python virtual environment, installs the packages, builds the front end
the first time, and serves the whole app at **http://localhost:8000**. Run it with `--rebuild`
after changing front-end code.

### Development mode (live reload)

Two terminals:

```bash
# 1. API on :8000
cd backend
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# 2. React app on :5173 (forwards /api to :8000)
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. In VS Code, `.vscode/launch.json` has launch configurations for the
API and the tests.

---

## Project layout

```
backend/
  aidsm/                 calculation engine (pure Python, no web code)
    constants.py         fixed definitions from 18_Technical_Config
    model.py             the case data structure, defaults and normalisation
    core.py              sheets 05-10 and 14: benefits, costs, risk, financial model,
                         break-evens, scenarios, sensitivity shadow engine, driver block, gates
    montecarlo.py        sheets 11-12: same random stream and equations as engine v2.2
    monitoring.py        sheet 16 and the monitoring reassessment (14_Recommendation column I)
    compute.py           evaluate(case) -> every result, plus comparison and verification
    xlsx_io.py           import from / export to the v1.5 workbook
    data/template.xlsx   the frozen v1.5 workbook, used for export
    data/default_case.json  the research benchmark case read from that workbook
  app/main.py            FastAPI service (stateless; also serves the built front end)
  tests/                 parity, engine and API tests (pytest)
frontend/
  src/pages/             one page per workbook sheet
  src/components/        input grid, status chips, formula tooltips, charts (Recharts)
  src/store.tsx          case state, autosave to the browser, recalculation
```

### How it works

The case is a single JSON document held in the browser. Every edit sends the whole case to
`POST /api/evaluate`, which returns all results; nothing is stored on the server. The case is
also kept in the browser between visits, and **File → Save case** / **Open case** write and read it as a
`.json` file you can keep or share.

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | service status |
| `GET /api/config` | lists, labels and locked configuration |
| `GET /api/case/default` | the research benchmark case |
| `GET /api/case/blank` | an empty case |
| `POST /api/evaluate` | case in, all results out |
| `POST /api/montecarlo` | run a simulation for one alternative |
| `POST /api/import/xlsx` | upload a v1.5 workbook, get its case |
| `POST /api/export/xlsx` | case in, v1.5 workbook out |

Interactive API docs are at http://localhost:8000/docs while the server runs.

### Conventions kept from the workbook

- Blue figures are inputs; everything else is calculated. The ⓘ icons give the formula behind
  a figure.
- Money is in R millions, constant (real) terms, pre-tax and unlevered.
- Where the workbook shows explanatory text instead of a number ("CBR undefined - zero cost",
  "Not applicable"), the engine returns `null` and the page shows the text.
- Blank scenario, plausible-range and Monte Carlo cells use the workbook's default formulas
  (shown in grey italics), exactly as in Excel.
- The research benchmarks are locked by default, as in the workbook; unlock them under
  *Settings* to explore.
- Monte Carlo results go out of date as soon as an input that defines the run changes (a hash
  of the run state, the web equivalent of 12_MC_Results rows 67-80).

---

## Verification

```bash
cd backend
pytest
```

- **Workbook parity** (`tests/test_parity.py`): about 3,250 calculated cells per case are
  compared with the values Excel's formulas produce — benefits, costs, risk, the full 16-year
  cash-flow block of every alternative, break-evens, scenarios, the 110-point sensitivity grid,
  ranking and tornado, the driver block, every gate, level and reason code, comparison and
  monitoring. Six workbook variants are covered: the frozen research case, every benefit method,
  every recommendation level (R0, R1, R2 with a critical issue, R3, R4, R5), custom weights and
  lambda, ramps, year-specific costs, residual values, user-entered scenarios, hard-error cases
  and monitoring paths. All match to within 1e-7.
- **Monte Carlo** (`tests/test_engine.py`): reproduces `monte_carlo_engine.py` v2.2 exactly for
  the same seed — summary statistics, probabilities, rank correlations and histogram counts.
  (This relies on NumPy's random generator producing the same stream; it has been stable across
  NumPy releases.)
- **Round trip**: export a case to the workbook, recalculate in LibreOffice, compare every cell,
  re-import — identical.

The expected values are stored as JSON in `tests/fixtures/`, so the tests need neither Excel nor
LibreOffice. `tests/build_fixtures.py` rebuilds them from the workbook (this one needs LibreOffice).

---

## Known differences from workbook v1.5

Building the parity tests surfaced two defects in the frozen workbook. Neither affects the
research results reported for RES-MOD and RES-ADV.

1. **Sensitivity control panel (09_Sensitivity rows 56-60).** The panel's columns are matched to
   the variable list by position, but the two lists are in different orders, so any selection
   other than the three reduction percentages tests the wrong input (for example, choosing
   *Initial implementation cost* changes the other-benefit value). The panel is display-only and
   feeds no gate. **The web app tests the variable chosen.**
2. **Driver-impact block (09_Sensitivity, the analyst-workload and cost-per-event rows of each
   alternative's block).** The ×0.8 / ×1.2 factors are never applied, so those two drivers always
   show zero impact. For alternatives using the workload or event-driver methods this can change
   the top-three ranking and therefore Gate 6. **The web app reproduces the workbook while
   "Match workbook v1.5 exactly" is on (the default)**, so both tools give the same
   recommendation; switch it off under *Settings* for the corrected ranking.

Monte Carlo defaults. Blank minimum / most likely / maximum cells still default to base x 0.8 /
base / base x 1.2, but are now kept inside each variable's permitted domain (the workbook's default
1.2 maximum for the benefit ramp multiplier lies outside its 0-1 domain, so enabling it always
failed validation), and a blank truncated-normal standard deviation defaults to a sixth of the
range. Entered values are never changed, and results for the research run are unaffected.

One further presentational choice: for the financial (NPV = 0) minimum system life, the workbook
searches only inside the evaluation horizon. The web app shows the workbook figure and, beside
it, a corrected figure that searches all 15 years like the risk-adjusted version.

Export writes inputs only. 12_MC_Results in an exported workbook is not populated; run
`monte_carlo_engine.py` on it if Excel needs the simulation tables.

---

## Authorship

The code was drafted with AI assistance (Claude, Anthropic) from the v1.5 workbook's formulas,
and verified with the automated parity tests above. Declare it as such in any academic
submission.
