import { useState } from "react";
import { CumulativeChart } from "../components/charts";
import { AltGrid, Chip, Kpi, Page, PassFail, Section, SelIn, Status, Tech, Tip, type GridRow } from "../components/ui";
import { isNum, money, num, pct, ratio, yearOr } from "../format";
import { useStore } from "../store";
import { BUILD_STEPS, go } from "../steps";
import { isLocked } from "./setup";

const LEVEL_SHORT = ["Assessment incomplete", "Do not proceed under current assumptions", "Revise and reassess",
  "Proceed to controlled pilot / evidence gathering", "Conditional proceed", "Proceed"];

export function Ladder({ level }: { level: number }) {
  return (
    <div className="ladder" role="img" aria-label={`Advisory level R${level} of R5`}>
      {LEVEL_SHORT.map((t, i) => <div key={i} className={"rung" + (i === level ? " on" : "")}><div className="lvl">R{i}</div><div className="txt">{t}</div></div>)}
    </div>
  );
}

const GATE_TEXT: Record<string, string> = {
  G0: "Alternative active, inputs valid, no hard errors, all seven risks scored and assessed.",
  G1: "NPV above zero and lifecycle CBR above 1.",
  G2: "Risk-adjusted NPV above zero and risk-adjusted CBR above 1.",
  G3: "No unresolved critical risk issue.",
  G4: "The downside scenario stays risk-adjusted positive.",
  G5: "A break-even requirement lies inside its documented plausible range, or the upside is risk-adjusted positive.",
  G6: "The top three decision drivers are adequately evidenced, and a pilot could measure what remains.",
  G7: "Monte Carlo status (information only; it never changes the level).",
};

function gateValue(k: string, g: any) {
  switch (k) {
    case "G0": return Object.entries(g.parts).filter(([, v]) => !v).map(([p]) => p.replace(/_/g, " ")).join(", ") || "Ready";
    case "G1": return `NPV ${money(g.npv)}, CBR ${isNum(g.cbr) ? ratio(g.cbr) : "undefined"}`;
    case "G2": return `RA-NPV ${money(g.ranpv)}, RA-CBR ${isNum(g.racbr) ? ratio(g.racbr) : "undefined"}`;
    case "G3": return `${g.unresolved} unresolved, ${g.not_assessed} not assessed`;
    case "G4": return `Downside RA-NPV ${money(g.downside)}`;
    case "G5": return g.breakeven_plausible ? "Break-even plausible" : `Upside RA-NPV ${money(g.upside)}`;
    case "G6": return `${g.concerns} evidence concern(s), pilot measurable: ${g.pilot_measurable}`;
    default: return g.status;
  }
}

export function GateTrack({ rec }: { rec: any }) {
  return (
    <div className="gates">
      {Object.entries(rec.gates).map(([k, g]: any) => (
        <div className="gate" key={k}>
          <div className="g">{k === "G7" ? "Gate 7" : "Gate " + k.slice(1)}</div>
          <div className="n">{g.name}<Tip>{GATE_TEXT[k]}</Tip></div>
          {k === "G7" ? <Status text={g.status} /> : <PassFail pass={g.pass} />}
          <div className="v" style={{ marginTop: 6 }}>{gateValue(k, g)}</div>
        </div>
      ))}
    </div>
  );
}

function Conditions({ rec }: { rec: any }) {
  if (!rec.conditions?.length) return <div className="empty">No conditions apply to this option.</div>;
  const fmt = (c: any, v: any) => {
    if (!isNum(v)) return v ?? "–";
    if (c.variable_id === "BEN-FRAUD-RED") return pct(v, 2);
    if (c.variable_id === "CST-INIT-TOTAL") return money(v);
    if (c.variable_id === "FIN-HORIZON") return v + " years";
    return String(v);
  };
  return (
    <div className="tbl-wrap"><table className="grid">
      <thead><tr><th className="left">Condition</th><th>Required</th><th>Current</th><th className="left">Status</th><th className="left">Owner</th></tr></thead>
      <tbody>{rec.conditions.map((c: any) => (
        <tr key={c.variable_id}><td className="left">{c.condition}</td><td>{fmt(c, c.required)}</td><td>{fmt(c, c.current)}</td><td className="left"><Status text={c.status} /></td><td className="left">{c.owner}</td></tr>
      ))}</tbody>
    </table></div>
  );
}

// Plain-language meaning of each advisory level and gate (the formal names stay in technical view).
const LEVEL_PLAIN = [
  "Some inputs are missing or invalid, so the model cannot advise yet. Fix the flagged steps first.",
  "Under the current assumptions the economics or risks do not support this investment.",
  "There is a material issue to resolve, such as a critical risk, before a decision can be supported.",
  "Promising but uncertain. A controlled pilot would gather the evidence still missing.",
  "The case supports investing, subject to the conditions listed below.",
  "Every gate passes. The case supports the investment.",
];
const GATE_PLAIN: Record<string, string> = {
  G0: "Assessment is complete", G1: "Pays for itself", G2: "Still pays after allowing for risk", G3: "No unresolved critical risk",
  G4: "Holds up in the downside scenario", G5: "Break-even is realistic", G6: "Key drivers are well evidenced", G7: "Monte Carlo simulation",
};
const levelTone = (l: number) => (l >= 4 ? "good" : l === 3 ? "neutral" : l === 0 ? "warn" : "bad");
const gatesPassed = (rec: any) => Object.entries(rec.gates).filter(([k]) => k !== "G7");

const Tk = () => <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.3l2.3 2.3 4.7-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const Xx = () => <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>;
const Ii = () => <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 5.5v3.5M6 3v.1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>;

/** The headline: advisory level for one alternative, in plain words. */
function VerdictHero({ alt, onAlt, rec, title = "Model recommendation" }: { alt: string; onAlt: (v: string) => void; rec: any; title?: string }) {
  const { caseData: c } = useStore();
  const gates = gatesPassed(rec);
  const passed = gates.filter(([, g]: any) => g.pass).length;
  return (
    <div className="hero">
      <div className="hero-top">
        <div className="k">{title} · advisory</div>
        <label className="alt-sel">Option
          <select value={alt} onChange={(e) => onAlt(e.target.value)} aria-label="Alternative">
            {c.alternatives.map((a: any) => <option key={a.id} value={a.id}>{a.name || a.id}{a.active ? "" : " (switched off)"}</option>)}
          </select>
        </label>
      </div>
      <div className="hero-verdict">
        <div className={"level-badge " + levelTone(rec.level)}>R{rec.level}</div>
        <div>
          <div className="hero-title">{rec.label.replace(/^R\d - /, "")}</div>
          <div className="hero-desc">{LEVEL_PLAIN[rec.level]}</div>
        </div>
      </div>
      <Ladder level={rec.level} />
      <div className="hero-foot">
        <span className="gate-dots" aria-hidden="true">{gates.map(([k, g]: any) => <i key={k} className={g.pass ? "p" : "f"} />)}</span>
        <span>{passed} of {gates.length} decision checks passed</span>
        <Tech><span className="codes" style={{ color: "#9fb3cf" }}>Reason codes: {rec.reason_codes}</span></Tech>
      </div>
    </div>
  );
}

/** Gates as a readable checklist: what each tests, whether it passed, and the figure behind it. */
function GateChecklist({ rec }: { rec: any }) {
  return (
    <ul className="checklist">
      {Object.entries(rec.gates).map(([k, g]: any) => {
        const info = k === "G7";
        const mark = info ? "i" : g.pass ? "p" : "f";
        return (
          <li key={k}>
            <span className={"mark " + mark} aria-label={info ? "information" : g.pass ? "passed" : "failed"}>{info ? <Ii /> : g.pass ? <Tk /> : <Xx />}</span>
            <div>
              <div className="t">{GATE_PLAIN[k]}<Tech><span className="muted small" style={{ fontWeight: 400 }}> · Gate {k.slice(1)}: {g.name}</span></Tech></div>
              <div className="d">{GATE_TEXT[k]}</div>
            </div>
            <div className="v">{info ? <Status text={g.status} /> : gateValue(k, g)}</div>
          </li>
        );
      })}
    </ul>
  );
}

// ------------------------------------------------------------------------------------- 14 Recommendation
export function Recommendation() {
  const { caseData: c, results: r, set } = useStore();
  const [alt, setAlt] = useState(c.dashboard.alternative || "RES-MOD");
  const rec = r.alternatives[alt].recommendation;
  const R = (a: any) => r.alternatives[a.id].recommendation;
  const G = (a: any, k: string) => R(a).gates[k];
  const rows: GridRow[] = [
    { group: "Gate 0 - assessment readiness" },
    { label: "Alternative active in this case", cell: (a) => <PassFail pass={G(a, "G0").parts.active} yes="Yes" no="No" /> },
    { label: "Benefit and cost inputs valid", cell: (a) => <PassFail pass={G(a, "G0").parts.inputs_valid} yes="Yes" no="No" /> },
    { label: "No hard errors on case, baseline, weights or lambda", cell: (a) => <PassFail pass={G(a, "G0").parts.no_hard_errors} yes="Yes" no="No" /> },
    { label: "All seven risk scores present and assessed", cell: (a) => <PassFail pass={G(a, "G0").parts.risk_complete} yes="Yes" no="No" /> },
    { label: "Gate 0 result", total: true, cell: (a) => <PassFail pass={G(a, "G0").pass} /> },
    { group: "Gate 1 - raw economics" },
    { label: "NPV", unit: "R m", cell: (a) => money(G(a, "G1").npv) },
    { label: "Lifecycle CBR", unit: "ratio", cell: (a) => (isNum(G(a, "G1").cbr) ? ratio(G(a, "G1").cbr) : "Undefined") },
    { label: "Gate 1 result", total: true, cell: (a) => <PassFail pass={G(a, "G1").pass} /> },
    { group: "Gate 2 - risk-adjusted economics" },
    { label: "Risk-adjusted NPV", unit: "R m", cell: (a) => money(G(a, "G2").ranpv) },
    { label: "Risk-adjusted CBR", unit: "ratio", cell: (a) => (isNum(G(a, "G2").racbr) ? ratio(G(a, "G2").racbr) : "Undefined") },
    { label: "Gate 2 result", total: true, cell: (a) => <PassFail pass={G(a, "G2").pass} /> },
    { group: "Gate 3 - critical risk" },
    { label: "Unresolved critical issues", cell: (a) => G(a, "G3").unresolved },
    { label: "Risk categories not assessed", cell: (a) => G(a, "G3").not_assessed },
    { label: "Gate 3 result", total: true, cell: (a) => <PassFail pass={G(a, "G3").pass} /> },
    { group: "Gate 4 - deterministic scenario robustness" },
    { label: "Scenario base RA-NPV", unit: "R m", cell: (a) => money(G(a, "G4").base) },
    { label: "Scenario downside RA-NPV", unit: "R m", cell: (a) => money(G(a, "G4").downside) },
    { label: "Scenario upside RA-NPV", unit: "R m", cell: (a) => money(G(a, "G4").upside) },
    { label: "Scenario upside NPV (unadjusted)", unit: "R m", cell: (a) => money(G(a, "G4").upside_npv) },
    { label: "Gate 4 result", total: true, cell: (a) => <PassFail pass={G(a, "G4").pass} /> },
    { group: "Gate 5 - break-even feasibility" },
    { label: "A break-even requirement lies inside its plausible range", cell: (a) => <PassFail pass={G(a, "G5").breakeven_plausible} yes="Yes" no="No" /> },
    { label: "Gate 5 result (break-even plausible or upside positive)", total: true, cell: (a) => <PassFail pass={G(a, "G5").pass} /> },
    { group: "Gate 6 - evidence quality" },
    { label: "A pilot could measure the remaining uncertainty", cell: (a, i) => <SelIn value={a.pilot_measurable} options={["Yes", "No"]} disabled={isLocked(c, a)} onChange={(v) => set(["alternatives", i, "pilot_measurable"], v)} /> },
    { label: "Gate 6 result (top three drivers evidenced)", total: true, cell: (a) => <PassFail pass={G(a, "G6").pass} /> },
    { group: "Gate 7 - Monte Carlo evidence" },
    { label: "Monte Carlo status", cell: (a) => <Status text={G(a, "G7").status} /> },
    { group: "Final advisory recommendation" },
    { label: "Recommendation level (0-5)", total: true, cell: (a) => <b>R{R(a).level}</b> },
    { label: "Model recommendation - advisory", cell: (a) => <span className="small">{R(a).label}</span> },
    { label: "Reason codes", tech: true, cell: (a) => <span className="codes">{R(a).reason_codes}</span> },
  ];
  const mon = r.monitoring;
  const idx = c.alternatives.findIndex((a: any) => a.id === alt);
  const A = c.alternatives[idx];
  return (
    <Page eyebrow="Results" title="Recommendation" intro="Eight decision checks, applied in order. The advisory level follows from them by fixed rules; the decision itself stays with the bank's authorised decision-makers.">
      <VerdictHero alt={alt} onAlt={setAlt} rec={rec} />
      <Section title="Decision checks" note="Why the model reached this level" flush><GateChecklist rec={rec} /></Section>
      <Section title="Could a pilot settle the remaining uncertainty?" note="Your judgement; feeds the evidence check">
        <div className="toolbar" style={{ margin: 0 }}>
          <label>{A.name || A.id}<SelIn value={A.pilot_measurable} options={["Yes", "No"]} disabled={isLocked(c, A)} onChange={(v) => set(["alternatives", idx, "pilot_measurable"], v)} /></label>
        </div>
      </Section>
      <Section title="Conditions to meet" note="Apply to pilot and conditional-proceed decisions" flush><Conditions rec={rec} /></Section>
      <Section title="All options, check by check" collapsible open={false} flush><AltGrid rows={rows} /></Section>
      <Section title="Reassessment after approval" collapsible open={false} note={`${mon.alternative} at review year ${mon.review_year}`}>
        <div className="verdict"><span className="big" style={{ fontSize: 24 }}>R{mon.reassessment.level}</span><span>{mon.reassessment.label.replace(/^R\d - /, "")}</span><Status text={mon.status} /></div>
        <Tech><p className="codes">{mon.reassessment.reason_codes}</p></Tech>
        <a href="#monitoring">Open monitoring →</a>
      </Section>
    </Page>
  );
}

// ------------------------------------------------------------------------------------- 00 Home + 15 Dashboard
export function Overview() {
  const { caseData: c, results: r, set } = useStore();
  const alt = c.dashboard.alternative;
  const A = r.alternatives[alt];
  const s = A.financial.summary;
  const rec = A.recommendation;
  const sc = A.scenarios.results;
  const mcCurrent = r.monte_carlo.state.status === "Current" && r.monte_carlo.state.alternative === alt;
  const mc = c.mc_result;
  const caseOk = r.home.status === "No hard errors detected";
  const pick = (v: string) => set(["dashboard", "alternative"], v);
  return (
    <Page eyebrow="Overview" title={A.name || alt} intro="Advisory decision support for AI investment in bank fraud detection. Every figure is calculated live from your inputs.">
      {!caseOk && <div className="banner bad"><b>Some required inputs are missing or invalid.</b> Open the steps marked <b>!</b> in the sidebar to fix them.<Tech> <span className="small">({r.home.status})</span></Tech></div>}
      <VerdictHero alt={alt} onAlt={pick} rec={rec} />
      <div className="kpis">
        <Kpi k="Risk-adjusted NPV" v={money(s.ranpv)} neg={s.ranpv < 0} s="Value created after allowing for risk" />
        <Kpi k="NPV" v={money(s.npv)} neg={s.npv < 0} s="Value created before risk adjustment" />
        <Kpi k="Risk-adjusted benefit / cost" v={isNum(s.racbr) ? ratio(s.racbr, 2) + "×" : "–"} neg={isNum(s.racbr) && s.racbr < 1} s="Benefit per R1 of cost; above 1 pays back" />
        <Kpi k="Discounted payback" v={yearOr(s.payback, "Not reached")} s={`Within the ${c.finance.horizon}-year horizon`} />
      </div>
      <div className="cols-2">
        <Section title="All options at a glance" flush>
          <div className="tbl-wrap"><table className="grid">
            <thead><tr><th className="left">Option</th><th>Risk-adj. NPV</th><th className="left">Advice</th></tr></thead>
            <tbody>{r.home.summary.map((x: any) => (
              <tr key={x.id} style={{ cursor: "pointer", opacity: x.active ? 1 : .55 }} onClick={() => pick(x.id)} aria-selected={x.id === alt}>
                <td className="left">{x.id === alt ? <b>{x.name}</b> : x.name}<div className="muted small">{x.id}{x.active ? "" : " · switched off"}</div></td>
                <td>{money(x.ranpv)}</td>
                <td className="left"><Chip tone={levelTone(x.level)}>R{x.level}</Chip></td></tr>
            ))}</tbody>
          </table></div>
        </Section>
        <Section title="Cumulative value over time" note="Discounted, R m">
          <CumulativeChart years={A.financial.years} horizon={c.finance.horizon} />
        </Section>
      </div>
      <div className="cols-2">
        <Section title="How robust is it?">
          <dl className="kv">
            <dt>Downside scenario</dt><dd>{money(sc.Downside.ranpv)}</dd>
            <dt>Base scenario</dt><dd>{money(sc.Base.ranpv)}</dd>
            <dt>Upside scenario</dt><dd>{money(sc.Upside.ranpv)}</dd>
          </dl>
          <hr className="soft" />
          <dl className="kv">
            <dt>Fraud reduction needed to break even</dt><dd>{isNum(s.be_fraud) ? pct(s.be_fraud, 1) : "Not applicable"}</dd>
            <dt>Most it can cost to set up</dt><dd>{money(s.be_imp)}</dd>
            <dt>Shortest life that still pays</dt><dd>{isNum(s.be_life) ? s.be_life + " years" : "Not reached in 15 years"}</dd>
          </dl>
          <hr className="soft" />
          {mcCurrent ? (
            <dl className="kv">
              <dt>Chance of positive risk-adj. NPV</dt><dd>{pct(mc.probabilities.ranpv_pos)}</dd>
              <dt>Median outcome (simulated)</dt><dd>{money(mc.summary["Risk-adjusted NPV"].median)}</dd>
              <dt>Bad case (5th percentile)</dt><dd>{money(mc.summary["Risk-adjusted NPV"].p5)}</dd>
            </dl>
          ) : <p className="small muted" style={{ margin: 0 }}>Monte Carlo: {r.monte_carlo.state.alternative === alt ? r.monte_carlo.state.text : "not run for this option"}. <a href="#montecarlo">Run a simulation</a></p>}
        </Section>
        <Section title="Your case, step by step" flush>
          <ol className="steps">
            {BUILD_STEPS.map((st, i) => {
              const f = st.flag(r);
              return (
                <li key={st.id}><a href={"#" + st.id} onClick={(e) => { e.preventDefault(); go(st.id); }}>
                  <span className={"n" + (f ? " " + f : " done")}>{f ? i + 1 : <Tk />}</span>
                  <span className="lbl">{st.label}<div className="muted small" style={{ fontWeight: 400 }}>{st.hint}</div></span>
                  <span className="st">{f === "bad" ? "Needs attention" : f === "warn" ? "Worth a check" : "No issues"}</span>
                </a></li>
              );
            })}
          </ol>
        </Section>
      </div>
      <Section title="What drives the result" note="The three inputs that move risk-adjusted NPV most" collapsible flush
        actions={A.drivers.concerns === 0 ? <Chip tone="good">Well evidenced</Chip> : <Chip tone="bad">{A.drivers.concerns} evidence concern(s)</Chip>}>
        <div className="tbl-wrap"><table className="grid">
          <thead><tr><th>Rank</th><th className="left">Input</th><th>Impact on risk-adj. NPV</th><th className="left">Evidence confidence</th><th className="left">Source</th></tr></thead>
          <tbody>{A.drivers.top3.map((d: any) => <tr key={d.variable_id}><td>{d.rank}</td><td className="left">{d.variable}</td><td>{money(d.impact)}</td><td className="left">{d.confidence}</td><td className="left small">{d.source}</td></tr>)}</tbody>
        </table></div>
      </Section>
      <Section title="Conditions to meet" collapsible open={rec.conditions?.length > 0 && (rec.level === 3 || rec.level === 4)} flush><Conditions rec={rec} /></Section>
      <Tech>
        <div className="kpis">
          <Kpi k="Lifecycle CBR" v={isNum(s.cbr) ? ratio(s.cbr) : "–"} />
          <Kpi k="Risk adjustment factor" v={ratio(A.risk.raf)} s={`${A.risk.critical} critical, ${A.risk.not_assessed} not assessed`} />
        </div>
      </Tech>
      <p className="small muted">{rec.advisory} Figures: {num(c.finance.horizon, 0)}-year horizon at {pct(c.finance.rate)}, R millions, constant money, pre-tax. Figures in <span style={{ color: "var(--input-ink)", fontWeight: 600 }}>blue</span> are inputs; hover <Tip>Hover or focus these icons for the formula behind a figure.</Tip> for how a figure is calculated.</p>
    </Page>
  );
}
