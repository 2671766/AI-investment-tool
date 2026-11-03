import { AltGrid, Issues, NumIn, Page, Section, SelIn, Status, TextIn, Tip, type GridRow } from "../components/ui";
import { money, num, pct, ratio } from "../format";
import { useStore } from "../store";
import { isLocked, LockNote } from "./setup";

const YEARS15 = Array.from({ length: 15 }, (_, i) => i + 1);

/** Validation messages of the active alternatives, for the always-visible issues banner. */
function altIssues(c: any, r: any, pick: (R: any) => [string, string][]) {
  return c.alternatives.filter((a: any) => a.active).flatMap((a: any) => pick(r.alternatives[a.id]).map(([, text]) => ({ who: a.name || a.id, text })));
}

function checkCell(checks: [string, string][], code: string) {
  const hit = checks.find(([c]) => c === code);
  return <Status text={hit ? hit[1] : "OK"} />;
}

// ------------------------------------------------------------------------------------- 05 Benefits
export function Benefits() {
  const { caseData: c, results: r, set, config } = useStore();
  const R = (a: any) => r.alternatives[a.id];
  const b = (i: number, k: string) => (v: any) => set(["alternatives", i, "benefits", k], v);
  const methods = config.lists.benefit_method;
  const n = (k: string, percent = false) => (a: any, i: number) =>
    <NumIn value={a.benefits[k]} percent={percent} disabled={isLocked(c, a)} onChange={b(i, k)} label={k + " " + a.id} />;
  const sel = (k: string, opts: string[]) => (a: any, i: number) =>
    <SelIn value={a.benefits[k]} options={opts} disabled={isLocked(c, a)} onChange={b(i, k)} label={k + " " + a.id} />;
  const calc = (k: string) => (a: any) => money(R(a).benefits[k]);
  const bl = c.baseline;
  const rows: GridRow[] = [
    { group: "1. Fraud losses avoided" },
    { label: "Method", id: "BEN-FRAUD-METHOD", cell: sel("fraud_method", methods.filter((m: string) => m !== "Workload driver" && m !== "Detailed event driver")) },
    { label: "Addressable fraud-loss exposure", id: "BL-FRAUD-EXP", unit: "R m/year", cell: () => money(bl.fraud_exposure) },
    { label: "Expected fraud-loss reduction", id: "BEN-FRAUD-RED", unit: "%", cell: n("fraud_red", true) },
    { label: "Direct monetary estimate", id: "BEN-FRAUD-DIR", unit: "R m/year", cell: n("fraud_direct") },
    { label: "Mature annual benefit", id: "BEN-FRAUD-VAL", unit: "R m/year", total: true, cell: calc("fraud"),
      tip: "Driver-based: exposure x expected reduction. Direct estimate: the amount entered. Not monetised: zero. (05_Benefits row 11)" },
    { group: "2. Case-handling / analyst workload saving", note: "Methods A and B measure the same saving; choose one" },
    { label: "Method", id: "BEN-CASE-METHOD", cell: sel("case_method", methods.filter((m: string) => m !== "Detailed event driver")) },
    { label: "Method A driver: case-handling operating cost", id: "BL-CASE-COST", unit: "R m/year", cell: () => money(bl.case_cost) },
    { label: "Method A: expected cost reduction", id: "BEN-CASE-RED", unit: "%", cell: n("case_red", true) },
    { label: "Method B: baseline analyst hours", id: "BL-AN-HOURS", unit: "hours/year", cell: () => num(bl.analyst_hours, 0) },
    { label: "Method B: expected workload reduction", id: "BEN-WORK-RED", unit: "%", cell: n("work_red", true) },
    { label: "Method B: fully loaded analyst cost", id: "BL-AN-COST", unit: "R/hour", cell: () => num(bl.analyst_cost, 0) },
    { label: "Direct monetary estimate", id: "BEN-CASE-DIR", unit: "R m/year", cell: n("case_direct") },
    { label: "Mature annual benefit", id: "BEN-CASE-VAL", unit: "R m/year", total: true, cell: calc("case"),
      tip: "Driver-based: case-handling cost x reduction. Workload driver: hours x reduction x hourly cost / 1,000,000. (05_Benefits row 21)" },
    { group: "3. False-positive / customer-friction saving" },
    { label: "Method", id: "BEN-FP-METHOD", cell: sel("fp_method", methods.filter((m: string) => m !== "Workload driver")) },
    { label: "Method A driver: false-positive cost", id: "BL-FP-COST", unit: "R m/year", cell: () => money(bl.fp_cost) },
    { label: "Expected reduction", id: "BEN-FP-RED", unit: "%", cell: n("fp_red", true) },
    { label: "Method B: alerts per year", id: "BL-ALERTS", unit: "alerts/year", cell: () => num(bl.alerts, 0) },
    { label: "Method B: false-positive rate", id: "BL-FP-RATE", unit: "%", cell: () => pct(bl.fp_rate) },
    { label: "Method B: cost per avoided false-positive event", id: "BEN-FP-EVENT", unit: "R/event", cell: n("fp_event_cost") },
    { label: "Direct monetary estimate", id: "BEN-FP-DIR", unit: "R m/year", cell: n("fp_direct") },
    { label: "Mature annual benefit", id: "BEN-FP-VAL", unit: "R m/year", total: true, cell: calc("fp"),
      tip: "Driver-based: false-positive cost x reduction. Detailed event driver: alerts x FP rate x reduction x cost per event / 1,000,000. (05_Benefits row 31)" },
    { group: "4. Other unique monetised benefit", note: "Only a distinct, non-overlapping mechanism" },
    { label: "Description", id: "BEN-OTH-DESC", cell: (a, i) => <TextIn value={a.benefits.other_desc} disabled={isLocked(c, a)} onChange={b(i, "other_desc")} /> },
    { label: "Direct monetary estimate", id: "BEN-OTH-DIR", unit: "R m/year", cell: n("other_direct") },
    { label: "Already monetised elsewhere?", id: "BEN-OTH-DUP", cell: sel("other_dup", ["No", "Yes"]) },
    { label: "Mature annual benefit", id: "BEN-OTH-VAL", unit: "R m/year", total: true, cell: calc("other"), tip: "Zero if already monetised elsewhere, otherwise the direct estimate." },
    { group: "5. Non-monetised operational benefits", note: "Reported as KPIs, excluded from the economics" },
    { label: "Faster case resolution", id: "BEN-RESOL", unit: "% improvement", cell: n("kpi_resolution", true) },
    { label: "Improved alert prioritisation", id: "BEN-PRIOR", unit: "% improvement", cell: n("kpi_prioritisation", true) },
    { label: "Operational efficiency", id: "BEN-EFFIC", unit: "% improvement", cell: n("kpi_efficiency", true) },
        { group: "Total" },
    { label: "Total mature annual monetised benefit", id: "BEN-TOTAL", unit: "R m/year", total: true, cell: calc("total") },
    { group: "Validation and plausibility", tech: true },
    { label: "Fraud benefit within addressable exposure", id: "VAL-BEN-01", tech: true, cell: (a) => checkCell(R(a).benefits.checks, "VAL-BEN-01") },
    { label: "Percentage improvements within -100% to +100%", id: "VAL-BEN-02", tech: true, cell: (a) => checkCell(R(a).benefits.checks, "VAL-BEN-02") },
    { label: "Case saving within baseline case-handling cost", id: "VAL-BEN-03", tech: true, cell: (a) => checkCell(R(a).benefits.checks, "VAL-BEN-03") },
    { label: "Inputs present for the selected methods", id: "VAL-BEN-04", tech: true, cell: (a) => checkCell(R(a).benefits.checks, "VAL-BEN-04") },
    { label: "Hours saved within the baseline workload", id: "VAL-BEN-05", tech: true, cell: (a) => checkCell(R(a).benefits.checks, "VAL-BEN-05") },
    { label: "Benefit ramp within 0-100%", id: "VAL-BEN-06", tech: true, cell: (a) => checkCell(R(a).benefits.checks, "VAL-BEN-06") },
    { label: "Benefit inputs valid (feeds Gate 0)", id: "VAL-BEN-OK", tech: true, cell: (a) => <Status text={R(a).benefits.valid ? "OK" : "HARD ERROR"} /> },
  ];
  return (
    <Page eyebrow="Step 4 of 6" title="Benefits" intro="What each option is expected to save once fully running. For each benefit, choose a method, then enter either a percentage improvement or a direct rand estimate. Only distinct, non-overlapping benefits are counted.">
      <LockNote />
      <Issues items={altIssues(c, r, (A) => A.benefits.checks)} />
      <Section title="Annual benefits when fully running" flush><AltGrid rows={rows} /></Section>
      <Section title="Benefit ramp-up (optional)" collapsible open={false} note="Share of the full benefit realised in each year, 0% to 100%" flush>
        <div className="tbl-wrap"><table className="grid years">
          <thead><tr><th className="left">Alternative</th>{YEARS15.map((t) => <th key={t}>Y{t}</th>)}</tr></thead>
          <tbody>{c.alternatives.map((a: any, i: number) => (
            <tr key={a.id}><td className="left label"><b>{a.id}</b> {a.name}</td>
              {YEARS15.map((t) => <td key={t}><NumIn value={a.ramp[t - 1]} percent min={0} max={1} disabled={isLocked(c, a)}
                onChange={(v) => set(["alternatives", i, "ramp", t - 1], v)} label={`${a.id} ramp year ${t}`} /></td>)}
            </tr>
          ))}</tbody>
        </table></div>
        <p className="small muted" style={{ padding: "0 16px" }}>The research benchmarks assume 100% realisation from Year 1. Years beyond the evaluation horizon are ignored.</p>
      </Section>
    </Page>
  );
}

// ------------------------------------------------------------------------------------- 06 Costs
export function Costs() {
  const { caseData: c, results: r, set, config } = useStore();
  const R = (a: any) => r.alternatives[a.id];
  const item = (group: "initial" | "recurring", k: string) => (a: any, i: number) =>
    <NumIn value={a.costs[group][k]} min={0} disabled={isLocked(c, a)} onChange={(v) => set(["alternatives", i, "costs", group, k], v)} label={k + " " + a.id} />;
  const rows: GridRow[] = [
    { group: "Initial / set-up costs (Year 0)" },
    ...config.initial_cost_items.map((it: any) => ({ label: it.name, id: it.id, unit: "R m", cell: item("initial", it.key) })),
    { label: "Total initial cost", id: "CST-INIT-TOTAL", unit: "R m", total: true, cell: (a: any) => money(R(a).costs.initial) },
    { group: "Recurring annual costs (Years 1 onward)" },
    ...config.recurring_cost_items.map((it: any) => ({ label: it.name, id: it.id, unit: "R m/year", cell: item("recurring", it.key) })),
    { label: "Total recurring annual cost", id: "CST-REC-TOTAL", unit: "R m/year", total: true, cell: (a: any) => money(R(a).costs.recurring) },
    { group: "Residual / terminal value", note: "Optional; added once, in the final year of the horizon" },
    { label: "Residual / terminal value", id: "FIN-RESIDUAL", unit: "R m", cell: (a: any, i: number) =>
      <NumIn value={a.costs.residual} disabled={isLocked(c, a)} onChange={(v) => set(["alternatives", i, "costs", "residual"], v ?? 0)} /> },
    { label: "Basis / evidence for the residual value", id: "FIN-RESIDUAL-SRC", cell: (a: any, i: number) =>
      <TextIn value={a.costs.residual_basis} disabled={isLocked(c, a)} onChange={(v) => set(["alternatives", i, "costs", "residual_basis"], v)} /> },
    { group: "Cost validation", tech: true },
    { label: "All constant cost entries non-negative", id: "VAL-CST-01", tech: true, cell: (a: any) => checkCell(R(a).costs.checks, "VAL-CST-01") },
    { label: "Year-specific costs non-negative", id: "VAL-CST-03", tech: true, cell: (a: any) => checkCell(R(a).costs.checks, "VAL-CST-03") },
    { label: "Implementation cost plausibility", id: "VAL-CST-02", tech: true, cell: (a: any) => checkCell(R(a).costs.checks, "VAL-CST-02") },
    { label: "Residual value supported by a recorded basis", id: "VAL-RESID", tech: true, cell: (a: any) => checkCell(R(a).costs.checks, "VAL-RESID") },
    { label: "Cost inputs valid (feeds Gate 0)", id: "VAL-CST-OK", tech: true, cell: (a: any) => <Status text={R(a).costs.valid ? "OK" : "HARD ERROR"} /> },
  ];
  return (
    <Page eyebrow="Step 5 of 6" title="Costs" intro="One-off set-up costs (Year 0) and annual running costs, in R millions. Leave a line at zero if it does not apply.">
      <LockNote />
      <Issues items={altIssues(c, r, (A) => A.costs.checks)} />
      <Section title="Set-up and running costs" flush><AltGrid rows={rows} /></Section>
      <Section title="Extra costs in specific years (optional)" collapsible open={false} note="Added to the running cost in that year, e.g. a re-platforming in Year 3" flush>
        <div className="tbl-wrap"><table className="grid years">
          <thead><tr><th className="left">Alternative</th>{YEARS15.map((t) => <th key={t}>Y{t}</th>)}</tr></thead>
          <tbody>{c.alternatives.map((a: any, i: number) => (
            <tr key={a.id}><td className="left label"><b>{a.id}</b> {a.name}</td>
              {YEARS15.map((t) => <td key={t}><NumIn value={a.costs.year_specific[t - 1]} min={0} disabled={isLocked(c, a)}
                onChange={(v) => set(["alternatives", i, "costs", "year_specific", t - 1], v ?? 0)} label={`${a.id} year ${t} cost`} /></td>)}
            </tr>
          ))}</tbody>
        </table></div>
      </Section>
    </Page>
  );
}

// ------------------------------------------------------------------------------------- 07 Risk
export function Risk() {
  const { caseData: c, results: r, set, config } = useStore();
  const R = (a: any) => r.alternatives[a.id];
  const rc = c.risk_config;
  const risks = config.risk;
  const scoreRows: GridRow[] = risks.map((rk: any, j: number) => ({
    label: <>{rk.name}<Tip>{rk.definition}</Tip></>, id: rk.id, unit: "1-5",
    cell: (a: any, i: number) => <NumIn value={a.risk.scores[j]} min={1} max={5} disabled={isLocked(c, a)}
      onChange={(v) => set(["alternatives", i, "risk", "scores", j], v)} label={`${rk.name} score ${a.id}`} />,
  }));
  const critRows: GridRow[] = [
    { group: "Critical issues", note: "An unresolved critical issue blocks a positive recommendation; it never changes the risk adjustment" },
    ...risks.map((rk: any, j: number) => ({ label: rk.name, id: rk.id, cell: (a: any, i: number) =>
      <SelIn value={a.risk.critical[j]} options={config.lists.critical} disabled={isLocked(c, a)} onChange={(v) => set(["alternatives", i, "risk", "critical", j], v)} /> })),
    { label: "Unresolved critical issues", id: "RSK-CRIT-N", unit: "count", total: true, cell: (a: any) => R(a).risk.critical },
    { label: "Categories not assessed", id: "RSK-NA-N", unit: "count", cell: (a: any) => R(a).risk.not_assessed },
    { group: "Result" },
    { label: "Risk adjustment factor", id: "RSK-RAF", unit: "ratio", total: true, cell: (a: any) => ratio(R(a).risk.raf),
      tip: "RAF = 1 - lambda x (weighted risk score / 5). It multiplies forecast benefits only; it never changes costs. 1.00 means no reduction." },
  ];
  const noteRows: GridRow[] = [
    { group: "Why each score was given" },
    ...risks.map((rk: any, j: number) => ({ label: rk.name, id: rk.id, cell: (a: any, i: number) =>
      <TextIn value={a.risk.rationale[j]} disabled={isLocked(c, a)} onChange={(v) => set(["alternatives", i, "risk", "rationale", j], v)} /> })),
    { label: "Overall confidence in the risk profile", id: "RSK-CONF", cell: (a: any, i: number) =>
      <SelIn value={a.risk.confidence} options={["", ...config.lists.confidence]} disabled={isLocked(c, a)} onChange={(v) => set(["alternatives", i, "risk", "confidence"], v)} /> },
    { group: "Mitigation / control notes" },
    ...risks.map((rk: any, j: number) => ({ label: rk.name, id: rk.id, cell: (a: any, i: number) =>
      <TextIn value={a.risk.mitigation[j]} onChange={(v) => set(["alternatives", i, "risk", "mitigation", j], v)} /> })),
  ];
  const calcRows: GridRow[] = [
    { group: "Weighted contributions (weight x score)", note: "Benchmarks use the locked benchmark weights; custom options use the case weights" },
    ...risks.map((rk: any, j: number) => ({ label: rk.name, id: rk.id, cell: (a: any) => num(R(a).risk.contrib[j], 3) })),
    { group: "Risk adjustment" },
    { label: "Weighted risk score (WRS)", id: "RSK-WRS", unit: "score", cell: (a: any) => num(R(a).risk.wrs, 3), tip: "Sum of weight x score over the seven categories." },
    { label: "Risk index (RI = WRS / 5)", id: "RSK-RI", unit: "ratio", cell: (a: any) => ratio(R(a).risk.ri) },
    { label: "Risk penalty coefficient (lambda)", id: "RSK-LAMBDA", unit: "ratio", cell: (a: any) => ratio(R(a).risk.lambda, 2),
      tip: "Benchmarks use the locked 0.40. Custom options use the case lambda set below." },
    { label: "Risk adjustment factor (RAF = 1 - lambda x RI)", id: "RSK-RAF", unit: "ratio", total: true, cell: (a: any) => ratio(R(a).risk.raf) },
    { group: "Evidence confidence from the evidence register" },
    ...risks.map((rk: any, j: number) => ({ label: rk.name, id: rk.id, cell: (a: any) => R(a).risk.evidence_confidence[j] })),
    { group: "Evidence completeness" },
    { label: "Categories scored without an evidence record", cell: (a: any) => R(a).risk.without_record },
    { label: "Categories scored without a rationale", cell: (a: any) => R(a).risk.without_rationale },
    { label: "Risk evidence warning", cell: (a: any) => <Status text={R(a).risk.evidence_warning ? "WARNING - risk scores without evidence or rationale" : "OK"} /> },
  ];
  const wsum = rc.case_weights.reduce((s: number, w: any) => s + (typeof w === "number" ? w : 0), 0);
  const riskIssues = [
    ...[r.checks.case_weights, r.checks.lambda_rationale].filter((v: any) => v !== "OK").map((text: any) => ({ text: String(text) })),
    ...c.alternatives.filter((a: any) => a.active && R(a).risk.not_assessed > 0).map((a: any) => ({ who: a.name || a.id, text: `WARNING - ${R(a).risk.not_assessed} risk categor${R(a).risk.not_assessed > 1 ? "ies" : "y"} not assessed yet` })),
    ...c.alternatives.filter((a: any) => a.active && R(a).risk.evidence_warning).map((a: any) => ({ who: a.name || a.id, text: "WARNING - some scores have no evidence record or rationale" })),
  ];
  return (
    <Page eyebrow="Step 6 of 6" title="Risks" intro="Score each of seven risk categories from 1 (low, well controlled) to 5 (severe, unresolved). Higher scores reduce the benefits the model counts.">
      <LockNote />
      <Issues items={riskIssues} />
      <Section title="Risk scores" note="1 = low · 5 = severe" flush><AltGrid rows={[...scoreRows, ...critRows]} /></Section>
      <Section title="Reasons and mitigations" collapsible open={false} note="Record why each score was given; feeds the evidence check" flush><AltGrid rows={noteRows} /></Section>
      <Section title="How the risk adjustment is calculated" collapsible open={false} flush><AltGrid rows={calcRows} /></Section>
      <div className="cols-2">
        <Section title="Risk weights for custom options" collapsible open={r.checks.case_weights !== "OK"} flush>
          <div className="tbl-wrap"><table className="grid">
            <thead><tr><th className="left">Category</th><th>Benchmark weight (locked)</th><th>Case weight</th></tr></thead>
            <tbody>
              {risks.map((rk: any, j: number) => (
                <tr key={rk.id}><td className="left">{rk.name}</td><td>{pct(rc.benchmark_weights[j], 0)}</td>
                  <td style={{ width: 130 }}><NumIn value={rc.case_weights[j]} percent min={0} max={1} onChange={(v) => set(["risk_config", "case_weights", j], v)} /></td></tr>
              ))}
              <tr className="total"><td className="left">Total (must equal 100%)</td><td>{pct(rc.benchmark_weights.reduce((s: number, w: number) => s + w, 0), 0)}</td><td>{pct(wsum, 1)}</td></tr>
            </tbody>
          </table></div>
          <div className="btn-row" style={{ padding: "10px 20px" }}><Status text={r.checks.case_weights} /><Status text={r.checks.benchmark_weights} /></div>
        </Section>
        <Section title="Risk penalty for custom options" collapsible open={r.checks.lambda_rationale !== "OK"}>
          <div className="prose small"><p>Lambda sets how strongly risk reduces benefits for the custom options. The research value is 0.40; any other value needs a recorded rationale.</p></div>
          <div className="field" style={{ gridTemplateColumns: "160px 1fr" }}><label>Case lambda</label><NumIn value={rc.case_lambda} min={0} max={1} onChange={(v) => set(["risk_config", "case_lambda"], v)} width={140} /></div>
          <div className="field" style={{ gridTemplateColumns: "160px 1fr" }}><label>Rationale</label><TextIn area value={rc.case_lambda_rationale} onChange={(v) => set(["risk_config", "case_lambda_rationale"], v)} /></div>
          <div style={{ marginTop: 8 }}><Status text={r.checks.lambda_rationale} /></div>
        </Section>
      </div>
    </Page>
  );
}
