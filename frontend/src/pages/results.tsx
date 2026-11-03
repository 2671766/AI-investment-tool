import { useState } from "react";
import { CumulativeChart, GroupedBars, PanelLine, SimpleBars, Tornado } from "../components/charts";
import { AltGrid, AltPicker, Chip, NumIn, Page, Section, SelIn, Status, TextIn, Tip, YearGrid, type GridRow } from "../components/ui";
import { isNum, money, num, pct, ratio, yearOr } from "../format";
import { useStore } from "../store";
import { isLocked } from "./setup";

const Y16 = Array.from({ length: 16 }, (_, t) => t);

// ------------------------------------------------------------------------------------- 08 Financial model
export function Financial() {
  const { caseData: c, results: r } = useStore();
  const [alt, setAlt] = useState(c.dashboard.alternative || "RES-MOD");
  const R = (a: any) => r.alternatives[a.id];
  const A = (k: string) => (a: any) => R(a).financial.annualised[k];
  const S = (k: string) => (a: any) => R(a).financial.summary[k];
  const ann: GridRow[] = [
    { label: "Total mature annual benefit", id: "FIN-ANN-BEN", unit: "R m/year", cell: (a) => money(A("benefit")(a)) },
    { label: "Annualised implementation cost", id: "FIN-ANN-IMP", unit: "R m/year", cell: (a) => money(A("implementation")(a)), tip: "Initial cost / research annualisation period." },
    { label: "Recurring annual cost", id: "FIN-ANN-REC", unit: "R m/year", cell: (a) => money(A("recurring")(a)) },
    { label: "Total annualised cost", id: "FIN-ANN-CST", unit: "R m/year", cell: (a) => money(A("cost")(a)) },
    { label: "Raw cost-benefit ratio (CBR)", id: "FIN-ANN-CBR", unit: "ratio", total: true, cell: (a) => isNum(A("cbr")(a)) ? ratio(A("cbr")(a)) : "Undefined, zero cost" },
    { label: "Risk adjustment factor", id: "FIN-ANN-RAF", unit: "ratio", cell: (a) => ratio(A("raf")(a)) },
    { label: "Risk-adjusted CBR", id: "FIN-ANN-RACBR", unit: "ratio", total: true, cell: (a) => isNum(A("racbr")(a)) ? ratio(A("racbr")(a)) : "Undefined, zero cost" },
  ];
  const sum: GridRow[] = [
    { label: "PV of benefits", id: "FIN-PVB", unit: "R m", cell: (a) => money(S("pvb")(a)), tip: "Sum over years 1..H of benefit_t / (1 + r)^t; benefit_t = mature benefit x ramp_t, plus any residual value in year H." },
    { label: "PV of costs", id: "FIN-PVC", unit: "R m", cell: (a) => money(S("pvc")(a)), tip: "Initial cost in Year 0 plus the discounted recurring and year-specific costs for years 1..H." },
    { label: "NPV", id: "FIN-NPV", unit: "R m", total: true, cell: (a) => money(S("npv")(a)) },
    { label: "Lifecycle CBR", id: "FIN-CBR", unit: "ratio", cell: (a) => isNum(S("cbr")(a)) ? ratio(S("cbr")(a)) : "Undefined, zero cost" },
    { label: "Risk adjustment factor (RAF)", id: "RSK-RAF", unit: "ratio", cell: (a) => ratio(S("raf")(a)) },
    { label: "Risk-adjusted NPV", id: "FIN-RANPV", unit: "R m", total: true, cell: (a) => money(S("ranpv")(a)), tip: "PV of benefits x RAF - PV of costs." },
    { label: "Risk-adjusted CBR", id: "FIN-RACBR", unit: "ratio", cell: (a) => isNum(S("racbr")(a)) ? ratio(S("racbr")(a)) : "Undefined, zero cost" },
    { label: "Discounted payback", id: "FIN-PAYBACK", cell: (a) => yearOr(S("payback")(a), "None within horizon") },
    { label: "Risk-adjusted break-even year", cell: (a) => yearOr(S("ra_breakeven_year")(a), "Not within horizon") },
    { label: "IRR", id: "FIN-IRR", unit: "%", cell: (a) => isNum(S("irr")(a)) ? pct(S("irr")(a), 2) : "Not reliable / applicable" },
    { label: "PV annuity factor for benefits (ramp-weighted)", unit: "factor", tech: true, cell: (a) => num(S("af")(a), 4) },
    { group: "Break-even: what would have to be true (risk-adjusted)" },
    { label: "Maximum viable initial implementation cost", id: "FIN-BE-IMP", unit: "R m", cell: (a) => money(S("be_imp")(a)), tip: "PVB x RAF - (PVC - initial cost): the initial cost at which RA-NPV is exactly zero." },
    { label: "Minimum required fraud-loss reduction", id: "FIN-BE-FRAUD", unit: "%", cell: (a) => isNum(S("be_fraud")(a)) ? pct(S("be_fraud")(a), 2) : "Not applicable",
      tip: "((PVC / RAF) / annuity factor - other mature benefits) / fraud exposure." },
    { label: "Minimum viable system life", id: "FIN-BE-LIFE", unit: "years", cell: (a) => isNum(S("be_life")(a)) ? S("be_life")(a) : "Not reached in 15 years",
      tip: "First year in which the cumulative unconstrained risk-adjusted PV net reaches zero (searches all 15 years)." },
    { group: "Break-even outputs (financial, NPV = 0)", tech: true },
    { tech: true, label: "Maximum viable initial implementation cost", unit: "R m", cell: (a) => money(S("be_imp_raw")(a)) },
    { tech: true, label: "Minimum required fraud-loss reduction", unit: "%", cell: (a) => isNum(S("be_fraud_raw")(a)) ? pct(S("be_fraud_raw")(a), 2) : "Not applicable" },
    { tech: true, label: "Minimum viable system life (as the workbook reports it)", unit: "years", cell: (a) => isNum(S("be_life_raw_excel")(a)) ? S("be_life_raw_excel")(a) : "Not within horizon",
      tip: "Workbook v1.5 row 102 searches only inside the evaluation horizon, so it can never exceed it. The corrected figure below searches all 15 years, like the risk-adjusted version." },
    { tech: true, label: "Minimum viable system life (corrected, all 15 years)", unit: "years", cell: (a) => isNum(S("be_life_raw")(a)) ? S("be_life_raw")(a) : "Not reached in 15 years" },
  ];
  const yrs = r.alternatives[alt].financial.years;
  const H = c.finance.horizon;
  const yrow = (label: string, k: string, total = false) => ({ label, total, cell: (t: number) => <span className={t > H && k !== "unconstrained_ra_pv_net" && k !== "cum_unconstrained_ra_pv_net" ? "muted" : ""}>{num(yrs[k][t])}</span> });
  return (
    <Page eyebrow="Results" title="Financial detail" intro="The discounted lifecycle model is the primary appraisal. The annualised research benchmark is kept separately for comparison with the submitted research.">
      <Section title="Cumulative value over time" note={`Discounted, R m · horizon ${H} years`}
        actions={<div className="toolbar" style={{ margin: 0 }}><AltPicker value={alt} onChange={setAlt} label="Option" /></div>}>
        <CumulativeChart years={yrs} horizon={H} />
      </Section>
      <Section title="Lifecycle summary and break-even" flush><AltGrid rows={sum} /></Section>
      <Section title={`Year-by-year cash flows · ${alt}`} collapsible open={false} note={`R m; years beyond the ${H}-year horizon greyed`} flush>
        <YearGrid years={Y16} rows={[
          { label: "Discount factor", cell: (t) => num(yrs.df[t], 4) },
          yrow("Total benefit", "benefit"), yrow("Total cost", "cost"), yrow("Net cash flow", "net", true),
          yrow("PV of benefits", "pv_benefit"), yrow("PV of costs", "pv_cost"), yrow("PV of net cash flow", "pv_net"),
          yrow("Cumulative PV of net cash flow", "cum_pv_net", true), yrow("Risk-adjusted PV of benefits", "ra_pv_benefit"),
          yrow("Cumulative risk-adjusted PV net", "cum_ra_pv_net", true),
          yrow("Unconstrained risk-adjusted PV net (ignores the horizon)", "unconstrained_ra_pv_net"),
          yrow("Cumulative unconstrained risk-adjusted PV net", "cum_unconstrained_ra_pv_net"),
        ]} />
      </Section>
      <Section title="Annualised research benchmark" collapsible open={false} note="Implementation spread over the annualisation period, no discounting" flush><AltGrid rows={ann} /></Section>
    </Page>
  );
}

// ------------------------------------------------------------------------------------- 10 Scenarios
const SCN_LABELS: [string, string, string, boolean][] = [["fraud_red", "Fraud-loss reduction", "BEN-FRAUD-RED", true], ["case_red", "Case-handling reduction", "BEN-CASE-RED", true],
  ["fp_red", "False-positive reduction", "BEN-FP-RED", true], ["ramp_mult", "Benefit ramp multiplier", "BEN-RAMP-MULT", false],
  ["init_cost", "Initial implementation cost", "CST-INIT-TOTAL", false], ["rec_cost", "Recurring annual cost", "CST-REC-TOTAL", false], ["risk_index", "Risk index", "RSK-RI", false]];
const SC = ["Downside", "Base", "Upside"];

export function Scenarios() {
  const { caseData: c, results: r, set } = useStore();
  const R = (a: any) => r.alternatives[a.id];
  const inputRows: GridRow[] = SCN_LABELS.flatMap(([k, label, id, p]) => [
    { group: label, note: id },
    ...SC.map((s) => ({ label: s, unit: p ? "%" : k === "ramp_mult" || k === "risk_index" ? "ratio" : "R m", cell: (a: any, i: number) =>
      <NumIn value={a.scenarios[k][s]} percent={p} disabled={isLocked(c, a)} placeholder={num(p ? R(a).scenarios.inputs[k][s] * 100 : R(a).scenarios.inputs[k][s], p ? 2 : 3)}
        onChange={(v) => set(["alternatives", i, "scenarios", k, s], v)} label={`${label} ${s} ${a.id}`} /> })),
  ]);
  const plRows: GridRow[] = [
    ...([["fraud_lo", "Fraud-loss reduction, lower", true], ["fraud_hi", "Fraud-loss reduction, upper", true], ["cost_lo", "Initial cost, lower", false], ["cost_hi", "Initial cost, upper", false],
      ["life_lo", "System life, lower (years)", false], ["life_hi", "System life, upper (years)", false]] as [string, string, boolean][]).map(([k, label, p]) => ({
      label, unit: p ? "%" : k.startsWith("life") ? "years" : "R m", cell: (a: any, i: number) =>
        <NumIn value={a.plausible[k]} percent={p} disabled={isLocked(c, a)} placeholder={isNum(R(a).plausible[k]) ? num(p ? R(a).plausible[k] * 100 : R(a).plausible[k], 2) : ""}
          onChange={(v) => set(["alternatives", i, "plausible", k], v)} /> })),
    { label: "Basis for the system-life range", cell: (a: any, i: number) =>
      <TextIn value={a.plausible.life_basis} disabled={isLocked(c, a)} onChange={(v) => set(["alternatives", i, "plausible", "life_basis"], v)} /> },
    { label: "System-life range usable by Gate 5", cell: (a: any) => <Status text={R(a).plausible.life_status} /> },
  ];
  const resRows: GridRow[] = ([["pvb", "PV of benefits", money], ["pvc", "PV of costs", money], ["npv", "NPV", money], ["cbr", "CBR", ratio], ["raf", "RAF", ratio],
    ["ranpv", "Risk-adjusted NPV", money], ["racbr", "Risk-adjusted CBR", ratio]] as [string, string, any][]).flatMap(([k, label, f]) => [
    { group: label },
    ...SC.map((s) => ({ label: s, total: k === "ranpv", cell: (a: any) => isNum(R(a).scenarios.results[s][k]) ? f(R(a).scenarios.results[s][k]) : "n/a" })),
  ]);
  const chart = c.alternatives.filter((a: any) => a.active).map((a: any) => ({ name: a.id, Downside: R(a).scenarios.results.Downside.ranpv, Base: R(a).scenarios.results.Base.ranpv, Upside: R(a).scenarios.results.Upside.ranpv }));
  return (
    <Page eyebrow="Advanced analysis" title="Scenarios" intro="How each option performs if things go worse or better than expected. The defaults scale your base inputs by standard factors; override them if you have better estimates.">
      <Section title="Risk-adjusted NPV by scenario" note="Switched-on options">
        <GroupedBars data={chart} x="name" series={[{ key: "Downside", name: "Downside", color: "var(--series-2)" }, { key: "Base", name: "Base", color: "var(--series-1)" }, { key: "Upside", name: "Upside", color: "var(--series-3)" }]} />
      </Section>
      <Section title="Scenario results" flush>
        <AltGrid rows={[...resRows, { group: "Coherence" }, { label: "Downside <= Base <= Upside on RA-NPV", cell: (a: any) => <Status text={R(a).scenarios.coherence} /> }]} />
      </Section>
      <Section title="Scenario assumptions" collapsible open={false} note="Blank cells use the default shown in grey italics" flush>
        <div className="banner info small" style={{ margin: "14px 20px" }}>As in the workbook, scenario benefits always use the driver-based route (exposure x reduction and so on) and leave out any residual value, so a direct-estimate option's base scenario can differ from its financial model result.</div>
        <AltGrid rows={inputRows} />
      </Section>
      <Section title="Plausible ranges" collapsible open={false} note="Used by the break-even check (Gate 5). Documented test ranges, not statistical intervals" flush><AltGrid rows={plRows} /></Section>
    </Page>
  );
}

// ------------------------------------------------------------------------------------- 09 Sensitivity
export function Sensitivity() {
  const { caseData: c, results: r, set, config, prefs } = useStore();
  const s = r.sensitivity;
  const p = c.sensitivity;
  const [tab, setTab] = useState("tornado");
  const isRatio = p.metric === "CBR" || p.metric === "Risk-adjusted CBR";
  const mkey = { NPV: "npv", "Risk-adjusted NPV": "ranpv", CBR: "cbr", "Risk-adjusted CBR": "racbr" }[p.metric as string] || "ranpv";
  return (
    <Page eyebrow="Advanced analysis" title="Sensitivity" intro="Which inputs move the result most, and what would have to be true for the option to break even.">
      <div className="toolbar"><AltPicker value={p.alternative} onChange={(v) => set(["sensitivity", "alternative"], v)} label="Option to analyse" /></div>
      <div className="tabs" role="tablist">
        {[["tornado", "Biggest drivers"], ["panel", "What-if explorer"], ["breakeven", "Break-even"], ["ranking", "Driver ranking"],
          ...(prefs.detail ? [["grid", "Test grid"], ["shadow", "Shadow-engine check"]] : [])].map(([k, l]) =>
          <button key={k} role="tab" className="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {tab === "panel" && (
      <Section title="What-if explorer" note="Vary one input and watch the result">
        <div className="toolbar">
          <label>Variable<SelIn value={p.variable} options={config.panel_parameters.map((x: any) => x.name)} onChange={(v) => set(["sensitivity", "variable"], v)} /></label>
          <label>Mode<SelIn value={p.mode} options={["Relative (% of base)", "Absolute (value)"]} onChange={(v) => set(["sensitivity", "mode"], v)} /></label>
          <label>Lower<NumIn value={p.lower} onChange={(v) => set(["sensitivity", "lower"], v)} width={90} /></label>
          <label>Upper<NumIn value={p.upper} onChange={(v) => set(["sensitivity", "upper"], v)} width={90} /></label>
          <label>Metric<SelIn value={p.metric} options={["NPV", "Risk-adjusted NPV", "CBR", "Risk-adjusted CBR"]} onChange={(v) => set(["sensitivity", "metric"], v)} /></label>
        </div>
        <div className="cols-2">
          <div><PanelLine rows={s.panel.rows} metric={p.metric} /></div>
          <div className="tbl-wrap"><table className="grid">
            <thead><tr><th className="left">Point</th><th>Factor</th><th>Tested value</th><th>{p.metric}</th><th>Change vs base</th><th className="left">Economic status</th></tr></thead>
            <tbody>{s.panel.rows.map((row: any) => (
              <tr key={row.point}><td className="left">{row.point}</td><td>{num(row.factor, 3)}</td><td>{num(row.tested, 4)}</td>
                <td>{isRatio ? ratio(row[mkey]) : money(row[mkey])}</td><td>{isNum(row.change_vs_base) ? pct(row.change_vs_base) : "–"}</td>
                <td className="left small">{row.status}</td></tr>
            ))}</tbody>
          </table>
          <p className="small muted">Relative mode multiplies the base value by the factor; absolute mode tests the factor itself as the value. The horizon is rounded to whole years.</p></div>
        </div>
      </Section>
      )}
      {tab === "tornado" && (
        <Section title={`Tornado for ${s.alternative}`} note="Movement of RA-NPV around the base, each input at -20% and +20%, sorted by impact">
          <Tornado rows={s.tornado} />
          <div className="tbl-wrap"><table className="grid">
            <thead><tr><th>Rank</th><th className="left">Variable</th><th>Downside movement</th><th>Upside movement</th><th>Low outcome</th><th>High outcome</th><th className="left">Verdict changes?</th></tr></thead>
            <tbody>{s.tornado.map((t: any) => (
              <tr key={t.variable_id}><td>{t.rank}</td><td className="left">{t.variable}</td><td>{money(t.down)}</td><td>{money(t.up)}</td><td>{money(t.low)}</td><td>{money(t.high)}</td>
                <td className="left">{t.flips.startsWith("Yes") ? <Chip tone="warn">Yes, the risk-adjusted verdict flips</Chip> : "No"}</td></tr>
            ))}</tbody>
          </table></div>
        </Section>
      )}
      {tab === "ranking" && (
        <Section title="Decision-driver ranking" note="Impact on RA-NPV; the top three are material drivers" flush>
          <div className="tbl-wrap"><table className="grid">
            <thead><tr><th className="left">Variable</th><th className="left">ID</th><th>Low RA-NPV</th><th>High RA-NPV</th><th>Impact</th><th>Rank</th><th className="left">Evidence confidence</th><th className="left">Evidence concern</th><th className="left">Source</th></tr></thead>
            <tbody>{[...s.ranking].sort((a: any, b: any) => a.rank - b.rank).map((x: any) => (
              <tr key={x.variable_id}><td className="left">{x.variable}</td><td className="left small muted">{x.variable_id}</td><td>{money(x.low)}</td><td>{money(x.high)}</td><td>{money(x.impact)}</td>
                <td>{x.rank}{x.material && <b> *</b>}</td><td className="left">{x.confidence}</td><td className="left">{x.concern ? <Chip tone="bad">Evidence concern</Chip> : "OK"}</td><td className="left small">{x.source}</td></tr>
            ))}</tbody>
          </table></div>
          <p className="small muted" style={{ padding: "0 16px" }}>Top three drivers with an evidence concern: {s.evidence_concerns}.</p>
        </Section>
      )}
      {tab === "grid" && prefs.detail && (
        <Section title="Sensitivity test grid" note="22 variables x 5 points, each recalculated through the shadow engine" flush>
          <div className="tbl-wrap"><table className="grid">
            <thead><tr><th className="left">Variable</th><th className="left">Point</th><th>Value used</th><th>PV benefits</th><th>PV costs</th><th>NPV</th><th>RAF</th><th>RA-NPV</th><th className="left">Economic status</th></tr></thead>
            <tbody>{s.grid.flatMap((g: any) => g.points.map((pt: any, j: number) => (
              <tr key={g.variable_id + j}><td className="left">{j === 0 ? g.variable : ""}</td><td className="left">{pt.point}</td><td>{num(pt.used, 4)}</td><td>{num(pt.pvb)}</td><td>{num(pt.pvc)}</td><td>{num(pt.npv)}</td><td>{ratio(pt.raf)}</td><td>{num(pt.ranpv)}</td><td className="left small">{pt.status}</td></tr>
            )))}</tbody>
          </table></div>
        </Section>
      )}
      {tab === "breakeven" && (
        <Section title={`Break-even conditions for ${s.alternative}`}>
          <div className="tbl-wrap"><table className="grid">
            <thead><tr><th className="left">Break-even condition</th><th>Required value</th><th>Plausible lower</th><th>Plausible upper</th><th className="left">Inside the plausible range?</th></tr></thead>
            <tbody>
              <tr><td className="left">Minimum required fraud-loss reduction</td><td>{isNum(s.breakeven.be_fraud) ? pct(s.breakeven.be_fraud, 2) : "Not applicable"}</td><td>{pct(s.breakeven.plausible.fraud_lo, 2)}</td><td>{pct(s.breakeven.plausible.fraud_hi, 2)}</td><td className="left"><Chip tone={s.breakeven.fraud_inside ? "good" : "neutral"}>{s.breakeven.fraud_inside ? "Yes" : "No"}</Chip></td></tr>
              <tr><td className="left">Maximum viable initial implementation cost</td><td>{money(s.breakeven.be_imp)}</td><td>{money(s.breakeven.plausible.cost_lo)}</td><td>{money(s.breakeven.plausible.cost_hi)}</td><td className="left"><Chip tone={s.breakeven.cost_inside ? "good" : "neutral"}>{s.breakeven.cost_inside ? "Yes" : "No"}</Chip></td></tr>
              <tr><td className="left">Minimum viable system life</td><td>{isNum(s.breakeven.be_life) ? s.breakeven.be_life + " years" : "Not reached"}</td><td>{s.breakeven.plausible.life_lo ?? "–"}</td><td>{s.breakeven.plausible.life_hi ?? "Not assessed"}</td><td className="left"><Chip tone={s.breakeven.life_inside ? "good" : "neutral"}>{s.breakeven.life_inside ? "Yes" : "No"}</Chip></td></tr>
            </tbody>
          </table></div>
          <p>At least one break-even condition plausible (Gate 5 source): <Chip tone={s.breakeven.gate5_be ? "good" : "bad"}>{s.breakeven.gate5_be ? "Yes" : "No"}</Chip></p>
        </Section>
      )}
      {tab === "shadow" && prefs.detail && (
        <Section title="Shadow-engine check" note="The base point must reproduce the financial model">
          <div className="tbl-wrap"><table className="grid">
            <thead><tr><th className="left">Check</th><th>Model value</th><th>Sensitivity base point</th><th>Difference</th><th className="left">Result</th></tr></thead>
            <tbody>{s.shadow_check.map((x: any) => <tr key={x.check}><td className="left">{x.check}</td><td>{money(x.model)}</td><td>{money(x.shadow)}</td><td>{num(x.difference, 8)}</td><td className="left"><Status text={x.result} /></td></tr>)}</tbody>
          </table></div>
        </Section>
      )}
    </Page>
  );
}

// ------------------------------------------------------------------------------------- 13 Comparison
export function Comparison() {
  const { caseData: c, results: r, set } = useStore();
  const t = r.comparison.table;
  const row = (label: string, k: string, f: any = money, tip?: string): GridRow => ({ label, tip, cell: (_a: any, i: number) => (isNum(t[i][k]) || typeof t[i][k] === "string" || typeof t[i][k] === "boolean" ? f(t[i][k]) : "–") });
  const id = (v: any) => v;
  const rows: GridRow[] = [
    row("Active in this case", "active", (v: boolean) => (v ? "Yes" : "No")), row("Initial implementation cost", "initial_cost"), row("Recurring annual cost", "recurring_cost"),
    row("Total mature annual benefit", "benefit_total"), row("PV of benefits", "pvb"), row("PV of costs", "pvc"), row("NPV", "npv"), row("Lifecycle CBR", "cbr", ratio),
    { ...row("Weighted risk score", "wrs", (v: number) => num(v, 3)), tech: true } as GridRow, { ...row("Risk index", "ri", ratio), tech: true } as GridRow, row("Risk adjustment factor", "raf", ratio),
    row("Risk-adjusted NPV", "ranpv"), row("Risk-adjusted CBR", "racbr", ratio), row("Discounted payback (year)", "payback", id), row("Unresolved critical risks", "critical", id),
    row("Break-even fraud-loss reduction", "be_fraud", (v: number) => pct(v, 2)), row("Maximum viable implementation cost", "be_imp"), row("Minimum viable system life", "be_life", id),
    row("Scenario downside RA-NPV", "scn_down"), row("Scenario base RA-NPV", "scn_base"), row("Scenario upside RA-NPV", "scn_up"),
    row("Evidence concerns among top three drivers", "evidence_concerns", id),
    { label: "Top driver", cell: (_a, i) => t[i].drivers[0] }, { label: "Second driver", cell: (_a, i) => t[i].drivers[1] }, { label: "Third driver", cell: (_a, i) => t[i].drivers[2] },
    row("Monte Carlo status", "mc_status", id), row("Monte Carlo median RA-NPV", "mc_median"), row("Monte Carlo 5th percentile RA-NPV", "mc_p5"),
    row("Monte Carlo P(RA-NPV > 0)", "mc_p_ranpv", (v: number) => pct(v)), row("Monte Carlo P(RA-CBR > 1)", "mc_p_racbr", (v: number) => pct(v)),
    { label: "Model recommendation (advisory)", total: true, cell: (_a, i) => <span className="small">{t[i].recommendation}</span> },
  ];
  const inc = r.comparison.incremental;
  const ids = c.alternatives.map((a: any) => a.id);
  return (
    <Page eyebrow="Results" title="Compare options" intro="Every option side by side, and whether spending more on a bigger option is worth it.">
      <Section title="Risk-adjusted NPV by option"><SimpleBars data={t.map((x: any) => ({ name: x.id, ranpv: x.ranpv }))} x="name" y="ranpv" name="Risk-adjusted NPV" /></Section>
      <Section title="Side-by-side metrics" flush><AltGrid rows={rows} /></Section>
      <Section title="Is the bigger option worth the extra spend?" note="Option B compared with option A">
        <div className="toolbar">
          <label>Alternative A (base option)<SelIn value={c.comparison.a} options={ids} onChange={(v) => set(["comparison", "a"], v)} /></label>
          <label>Alternative B (more expensive option)<SelIn value={c.comparison.b} options={ids} onChange={(v) => set(["comparison", "b"], v)} /></label>
        </div>
        <dl className="kv">
          <dt>Change in PV of benefits</dt><dd>{money(inc.d_pvb)}</dd>
          <dt>Change in PV of costs</dt><dd>{money(inc.d_pvc)}</dd>
          <dt>Incremental CBR<Tip>Change in PV of benefits / change in PV of costs. Above 1, the extra spend pays for itself on unadjusted terms.</Tip></dt><dd>{isNum(inc.icbr) ? ratio(inc.icbr) : "Not meaningful, no additional cost"}</dd>
          <dt>Change in NPV</dt><dd>{money(inc.d_npv)}</dd>
          <dt>Change in risk-adjusted NPV</dt><dd>{money(inc.d_ranpv)}</dd>
          <dt>Reading</dt><dd><b>{inc.reading}</b></dd>
        </dl>
      </Section>
    </Page>
  );
}
