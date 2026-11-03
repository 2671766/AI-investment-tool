import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { useStore } from "./store";
import { BUILD_STEPS, go, type Flag } from "./steps";
import { CaseSetup, Evidence, Baseline, Alternatives } from "./pages/setup";
import { Benefits, Costs, Risk } from "./pages/inputs";
import { Financial, Scenarios, Sensitivity, Comparison } from "./pages/results";
import { Recommendation, Overview } from "./pages/decision";
import { MonteCarlo } from "./pages/montecarlo";
import { Monitoring } from "./pages/monitoring";
import { Verification, Settings } from "./pages/assurance";

type PageDef = { id: string; label: string; sheet: string; el: () => JSX.Element; icon?: JSX.Element; flag?: (r: any) => Flag };

// ---------------------------------------------------------------- icons (16px, stroke)
const I = (d: string) => <svg className="ico" viewBox="0 0 16 16" aria-hidden="true"><path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const ICON = {
  home: I("M2.5 7.5L8 3l5.5 4.5V13a.5.5 0 0 1-.5.5H10v-4H6v4H3a.5.5 0 0 1-.5-.5z"),
  rec: I("M8 1.8l1.8 3.7 4 .6-2.9 2.8.7 4L8 11l-3.6 1.9.7-4L2.2 6.1l4-.6z"),
  fin: I("M2.5 13.5h11M4 11V8m3 3V5m3 6V7m3 4V3.5"),
  cmp: I("M3 3.5h4v9H3zM9 6.5h4v6H9z"),
  scn: I("M2.5 12l3.5-4 3 2.5 4.5-6"),
  sens: I("M8 2.5v11M3 5.5h10M5 8.5h6M6.5 11.5h3"),
  mc: I("M2.5 13.5c1.5 0 2-9 3.5-9s2 9 3.5 9 2-5 3.5-5"),
  ev: I("M4 2.5h6l2.5 2.5v8.5h-8.5zM6 7.5h4M6 10h4"),
  mon: I("M8 3c3.3 0 5.5 3.5 5.5 5s-2.2 5-5.5 5-5.5-3.5-5.5-5S4.7 3 8 3zm0 3.2a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6z"),
  ver: I("M8 1.8l5 2v4c0 3-2.2 5.3-5 6.4C5.2 13.1 3 10.8 3 7.8v-4zM5.8 8l1.6 1.6L10.4 6.5"),
  set: I("M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM8 1.5v1.8M8 12.7v1.8M1.5 8h1.8M12.7 8h1.8M3.4 3.4l1.3 1.3M11.3 11.3l1.3 1.3M3.4 12.6l1.3-1.3M11.3 4.7l1.3-1.3"),
  file: I("M2.5 4.5h4l1.5 1.5h5.5v6.5h-11z"),
  down: I("M4.5 6.5L8 10l3.5-3.5"),
};

const STEP_EL: Record<string, () => JSX.Element> = { case: CaseSetup, baseline: Baseline, alternatives: Alternatives, benefits: Benefits, costs: Costs, risk: Risk };
const STEP_SHEET: Record<string, string> = { case: "01_Case_Setup", baseline: "03_Baseline", alternatives: "04_AI_Alternatives", benefits: "05_Benefits", costs: "06_Costs", risk: "07_Risk" };
const STEPS: PageDef[] = BUILD_STEPS.map((s) => ({ id: s.id, label: s.label, sheet: STEP_SHEET[s.id], el: STEP_EL[s.id], flag: s.flag }));

const OVERVIEW: PageDef = { id: "home", label: "Overview", sheet: "00_Home / 15_Dashboard", el: Overview, icon: ICON.home };
const RESULTS: PageDef[] = [
  { id: "recommendation", label: "Recommendation", sheet: "14_Recommendation", el: Recommendation, icon: ICON.rec },
  { id: "financial", label: "Financial detail", sheet: "08_Financial_Model", el: Financial, icon: ICON.fin },
  { id: "comparison", label: "Compare options", sheet: "13_Comparison", el: Comparison, icon: ICON.cmp },
];
const ADVANCED: PageDef[] = [
  { id: "scenarios", label: "Scenarios", sheet: "10_Scenarios", el: Scenarios, icon: ICON.scn },
  { id: "sensitivity", label: "Sensitivity", sheet: "09_Sensitivity", el: Sensitivity, icon: ICON.sens },
  { id: "montecarlo", label: "Monte Carlo", sheet: "11_MC_Setup / 12_MC_Results", el: MonteCarlo, icon: ICON.mc,
    flag: (r) => (r.monte_carlo.state.status === "Out of Date" || r.monte_carlo.state.status === "Error" ? "warn" : null) },
  { id: "evidence", label: "Evidence register", sheet: "02_Evidence_Register", el: Evidence, icon: ICON.ev },
];
const AFTER: PageDef[] = [
  { id: "monitoring", label: "Monitoring", sheet: "16_Monitoring", el: Monitoring, icon: ICON.mon,
    flag: (r) => (r.monitoring.status === "Formal Reassessment Required" ? "bad" : r.monitoring.status === "Attention Required" ? "warn" : null) },
];
const UTIL: PageDef[] = [
  { id: "verification", label: "Verification", sheet: "17_Verification", el: Verification, icon: ICON.ver,
    flag: (r) => (r.verification.some((v: any) => v.result !== "PASS") ? "bad" : null) },
  { id: "settings", label: "Settings", sheet: "18_Technical_Config", el: Settings, icon: ICON.set },
];
const ALL = [OVERVIEW, ...STEPS, ...RESULTS, ...ADVANCED, ...AFTER, ...UTIL];
const ALIAS: Record<string, string> = { dashboard: "home", "": "home" };

function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function NavItem({ p, current, results }: { p: PageDef; current: string; results: any }) {
  const f = p.flag ? p.flag(results) : null;
  return (
    <button className="nav-item" aria-current={p.id === current ? "page" : undefined} onClick={() => go(p.id)}>
      {p.icon}<span className="lbl">{p.label}</span>{f && <span className={"nav-flag " + f} aria-label={f === "bad" ? "needs attention" : "warning"} />}
    </button>
  );
}

/** Back / next footer for the six build steps. */
function StepFooter({ id }: { id: string }) {
  const i = STEPS.findIndex((s) => s.id === id);
  if (i < 0) return null;
  const prev = STEPS[i - 1], next = STEPS[i + 1];
  return (
    <div className="stepper-foot">
      {prev ? <button className="btn" onClick={() => go(prev.id)}>← {prev.label}</button> : <button className="btn" onClick={() => go("home")}>← Overview</button>}
      <div className="mid">Step {i + 1} of {STEPS.length}<div className="stepper-bar">{STEPS.map((s, k) => <i key={s.id} className={k <= i ? "on" : ""} />)}</div></div>
      {next ? <button className="btn primary" onClick={() => go(next.id)}>Next: {next.label} →</button>
        : <button className="btn primary" onClick={() => go("recommendation")}>See the recommendation →</button>}
    </div>
  );
}

export default function App() {
  const { caseData, results, busy, error, replace, notify, toast, prefs, setPref } = useStore();
  const read = () => { const h = window.location.hash.slice(1); return ALIAS[h] ?? h; };
  const [page, setPage] = useState(read);
  const [menu, setMenu] = useState(false);
  const [advOpen, setAdvOpen] = useState(() => ADVANCED.some((p) => p.id === read()));
  const jsonIn = useRef<HTMLInputElement>(null);
  const xlsxIn = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const on = () => setPage(read());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  useEffect(() => { document.querySelector(".content")?.scrollTo(0, 0); if (ADVANCED.some((p) => p.id === page)) setAdvOpen(true); }, [page]);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(false); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [menu]);

  if (!caseData || !results) {
    return <div className="empty" style={{ paddingTop: 120 }}>{error ? <div className="banner bad" style={{ maxWidth: 640, margin: "0 auto" }}>{error}</div> : "Loading the model…"}</div>;
  }
  const current = ALL.find((p) => p.id === page) || OVERVIEW;
  const Body = current.el;
  const cid = (caseData.meta.case_id || "case").replace(/[^\w-]/g, "");

  const saveJson = () => download(new Blob([JSON.stringify(caseData, null, 1)], { type: "application/json" }), `AIDSM_${cid}.json`);
  const loadJson = async (f: File) => {
    try {
      const c = JSON.parse(await f.text());
      const r = await api.evaluate(c);
      replace(r.case); notify(`Opened ${f.name}`);
    } catch (e: any) { notify("That file could not be opened as a saved case: " + e.message, true); }
  };
  const importX = async (f: File) => {
    try { replace(await api.importXlsx(f)); notify(`Imported the inputs from ${f.name}`); }
    catch (e: any) { notify(e.message, true); }
  };
  const exportX = async () => {
    try { download(await api.exportXlsx(caseData), `AIDSM_${cid}.xlsx`); notify("Workbook exported. Excel recalculates every sheet when you open it."); }
    catch (e: any) { notify("Export failed: " + e.message, true); }
  };
  const act = (f: () => void) => () => { setMenu(false); f(); };

  return (
    <div className="shell">
      <nav className="side" aria-label="Main">
        <div className="brand">
          <div className="brand-mark"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 15h3V10H4zm4.5 0h3V5h-3zm4.5 0h3V8h-3z" fill="#fff" /></svg></div>
          <div><div className="brand-name">AI Investment Decision Support</div><div className="brand-sub">Fraud-detection AI · Banking</div></div>
        </div>
        <div className="side-scroll">
        <div className="nav-group"><NavItem p={OVERVIEW} current={current.id} results={results} /></div>
        <div className="nav-group">
          <div className="nav-group-title">Build your case</div>
          {STEPS.map((p, i) => {
            const f = p.flag ? p.flag(results) : null;
            return (
              <button key={p.id} className="nav-item" aria-current={p.id === current.id ? "page" : undefined} onClick={() => go(p.id)}>
                <span className={"nav-step" + (f ? " " + f : "")} aria-label={f === "bad" ? "needs attention" : f === "warn" ? "warning" : undefined}>{f === "bad" ? "!" : i + 1}</span>
                <span className="lbl">{p.label}</span>
              </button>
            );
          })}
        </div>
        <div className="nav-group">
          <div className="nav-group-title">Results</div>
          {RESULTS.map((p) => <NavItem key={p.id} p={p} current={current.id} results={results} />)}
        </div>
        <div className="nav-group">
          <button className="nav-group-title" aria-expanded={advOpen} onClick={() => setAdvOpen(!advOpen)}>
            Advanced analysis <span aria-hidden="true">{advOpen ? "−" : "+"}</span>
          </button>
          {advOpen && ADVANCED.map((p) => <NavItem key={p.id} p={p} current={current.id} results={results} />)}
        </div>
        <div className="nav-group">
          <div className="nav-group-title">After approval</div>
          {AFTER.map((p) => <NavItem key={p.id} p={p} current={current.id} results={results} />)}
        </div>
        </div>
        <div className="side-foot">
          {UTIL.map((p) => <NavItem key={p.id} p={p} current={current.id} results={results} />)}
          <div className="ver">Workbook v{results.model_version} · Engine {results.engine_version}</div>
        </div>
      </nav>
      <div className="main">
        <header className="topbar">
          <div>
            <div className="case-title">{caseData.meta.case_name || "Untitled case"}</div>
            <div className="case-meta">{caseData.meta.case_id} · {caseData.meta.status}{caseData.meta.prepared_by ? " · " + caseData.meta.prepared_by : ""}</div>
          </div>
          <span className="spacer" />
          <span className="live" aria-live="polite"><span className={"dot-live" + (busy ? " busy" : "")} />{busy ? "Recalculating…" : "All figures up to date"}</span>
          <label className="switch" title="Show variable IDs, workbook references, validation rows and engine checks">
            <input type="checkbox" checked={prefs.detail} onChange={(e) => setPref("detail", e.target.checked)} />
            <span className="track" />Technical view
          </label>
          <div className="menu" ref={menuRef}>
            <button className="btn" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>{ICON.file}File{ICON.down}</button>
            {menu && (
              <div className="menu-list" role="menu">
                <button role="menuitem" onClick={act(saveJson)}>Save case<small>Download this case as a file</small></button>
                <button role="menuitem" onClick={act(() => jsonIn.current?.click())}>Open case…<small>Load a case file you saved earlier</small></button>
                <hr />
                <button role="menuitem" onClick={act(exportX)}>Export to Excel<small>A v1.5 workbook copy that recalculates on opening</small></button>
                <button role="menuitem" onClick={act(() => xlsxIn.current?.click())}>Import from Excel…<small>Read the inputs from a v1.5 workbook</small></button>
                <hr />
                <button role="menuitem" onClick={act(() => go("settings"))}>New case or benchmark…<small>Start again from Settings</small></button>
              </div>
            )}
          </div>
          <input ref={jsonIn} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) loadJson(f); e.target.value = ""; }} />
          <input ref={xlsxIn} type="file" accept=".xlsx" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importX(f); e.target.value = ""; }} />
        </header>
        <main className="content">
          <div className="page" style={{ marginBottom: 0 }}>{error && <div className="banner bad">{error}</div>}</div>
          <Body />
          <div className="page"><StepFooter id={current.id} />
            {prefs.detail && <p className="foot-note">Mirrors workbook sheet {current.sheet}. Blue figures are inputs; everything else is calculated by the same formulas as the workbook.</p>}
          </div>
        </main>
      </div>
      {toast && <div className={"toast" + (toast.bad ? " bad" : "")} role="status">{toast.msg}</div>}
    </div>
  );
}
