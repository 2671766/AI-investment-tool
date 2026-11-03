import { Field, Issues, NumIn, Page, Section, SelIn, Status, Tech, TextIn } from "../components/ui";
import { useStore } from "../store";

export const isLocked = (c: any, alt: any) => alt.type === "Research Benchmark" && !c.settings?.unlock_benchmarks;

export function LockNote() {
  const { caseData } = useStore();
  if (caseData.settings?.unlock_benchmarks) return null;
  return <div className="banner info small">The two research benchmarks (RES-MOD, RES-ADV) are locked so they keep reproducing the research. Enter your own proposals in the custom options, or unlock the benchmarks in <a href="#settings">Settings</a>.</div>;
}

/** Non-OK case-level checks as plain-language issues. */
export const caseIssues = (r: any, keys: string[]) => keys.map((k) => r.checks[k]).filter((v) => v !== "OK" && v !== true && v !== undefined).map((text: any) => ({ text: String(text) }));

// ------------------------------------------------------------------------------------- 01 Case setup
export function CaseSetup() {
  const { caseData: c, results: r, set, config } = useStore();
  const m = c.meta, f = c.finance;
  return (
    <Page eyebrow="Step 1 of 6" title="Case details" intro="Give the case a name and set the financial settings every option shares.">
      <Issues items={caseIssues(r, ["case_fields", "horizon", "rate"])} />
      <Section title="Financial settings" note="The two numbers that matter most here">
        <Field label="Evaluation horizon" hint="How many years the system is expected to run (1 to 15). The research uses 3.">
          <NumIn value={f.horizon} integer min={1} max={15} onChange={(v) => set(["finance", "horizon"], v)} width={140} /></Field>
        <Field label="Discount / hurdle rate" hint="Use the bank's own hurdle rate. 10% is the research benchmark, not a bank default.">
          <NumIn value={f.rate} percent min={0} onChange={(v) => set(["finance", "rate"], v)} width={140} /></Field>
        <Field label="Basis" hint="Escalation is not modelled, so cash flows and the rate are both real.">R millions, constant money, pre-tax, unlevered</Field>
      </Section>
      <Section title="Case identity" note="All fields except notes are required">
        <Field label="Case ID"><TextIn value={m.case_id} onChange={(v) => set(["meta", "case_id"], v)} /></Field>
        <Field label="Case name"><TextIn value={m.case_name} onChange={(v) => set(["meta", "case_name"], v)} /></Field>
        <Field label="Assessment date"><input className="in text" type="date" value={m.assessment_date || ""} onChange={(e) => set(["meta", "assessment_date"], e.target.value)} /></Field>
        <Field label="Bank / operating context"><TextIn value={m.bank_context} onChange={(v) => set(["meta", "bank_context"], v)} /></Field>
        <Field label="Prepared by"><TextIn value={m.prepared_by} onChange={(v) => set(["meta", "prepared_by"], v)} /></Field>
        <Field label="Case status"><SelIn value={m.status} options={config.lists.case_status} onChange={(v) => set(["meta", "status"], v)} /></Field>
        <Field label="Notes"><TextIn area value={m.notes} onChange={(v) => set(["meta", "notes"], v)} /></Field>
      </Section>
      <Section title="Research settings" collapsible open={false} note="Only used by the annualised research benchmark">
        <Field label="Research annualisation period" hint="Years over which the implementation cost is spread in the annualised benchmark on the Financial detail page.">
          <NumIn value={f.ann_years} min={1} onChange={(v) => set(["finance", "ann_years"], v)} width={140} /></Field>
      </Section>
      <Tech><Section title="Validation">
        <Field label="Required case fields complete"><Status text={r.checks.case_fields} /></Field>
        <Field label="Evaluation horizon within 1 to 15 years"><Status text={r.checks.horizon} /></Field>
        <Field label="Discount rate not negative"><Status text={r.checks.rate} /></Field>
      </Section></Tech>
    </Page>
  );
}

// ------------------------------------------------------------------------------------- 02 Evidence register
const EV_COLS: [string, string][] = [["variable_id", "Variable ID"], ["alternative_id", "Option"], ["variable_name", "Variable name"],
  ["value", "Approved value"], ["unit", "Unit"], ["source_type", "Source type"], ["owner", "Owner"], ["date", "Date"], ["confidence", "Confidence"],
  ["source", "Source / reference"], ["rationale", "Assumption rationale"], ["notes", "Notes"]];

export function Evidence() {
  const { caseData: c, set, config, prefs } = useStore();
  const rows: any[] = c.evidence || [];
  const update = (i: number, k: string, v: any) => set(["evidence", i, k], v);
  const add = () => set(["evidence"], [...rows, { variable_id: "", alternative_id: "CASE", confidence: "Medium", source_type: "Bank internal data" }]);
  const remove = (i: number) => set(["evidence"], rows.filter((_, j) => j !== i));
  return (
    <Page eyebrow="Advanced analysis" title="Evidence register" intro="Record where each important input comes from, who owns it and how confident you are. The risk scores and the evidence check (Gate 6) look evidence up by variable ID and option, falling back to the CASE record.">
      <Section title={`Records (${rows.length} of 49)`} flush
        actions={<button className="btn primary" onClick={add} disabled={rows.length >= 49}>+ Add a record</button>}>
        <div className="ev-list">{rows.map((row, i) => (
          <div className="ev-card" key={i}>
            <div className="ev-head">
              <b>Record {i + 1}</b>{row.variable_name && <span className="muted"> · {row.variable_name}</span>}
              {prefs.detail && row.variable_id && <span className="row-id" style={{ marginLeft: 10 }}>{`${row.variable_id}|${row.alternative_id}`}</span>}
              <button className="btn" style={{ marginLeft: "auto" }} onClick={() => remove(i)} aria-label={"Remove record " + (i + 1)}>Remove</button>
            </div>
            <div className="ev-fields">{EV_COLS.map(([k, l]) => (
              <label key={k} className={"ev-field" + (k === "rationale" || k === "notes" || k === "source" ? " wide" : "")}>
                <span>{l}</span>
                {k === "confidence" ? <SelIn value={row[k]} options={config.lists.confidence} onChange={(v) => update(i, k, v)} />
                  : k === "source_type" ? <SelIn value={row[k]} options={config.lists.source_type} onChange={(v) => update(i, k, v)} />
                  : k === "alternative_id" ? <SelIn value={row[k]} options={["CASE", ...config.alt_ids]} onChange={(v) => update(i, k, v)} />
                  : k === "value" ? <NumIn value={row[k]} onChange={(v) => update(i, k, v)} />
                  : <TextIn value={row[k]} onChange={(v) => update(i, k, v)} />}
              </label>
            ))}</div>
          </div>
        ))}</div>
        {!rows.length && <div className="empty">No evidence recorded yet. Add a record for each material input.</div>}
      </Section>
    </Page>
  );
}

// ------------------------------------------------------------------------------------- 03 Baseline
export function Baseline() {
  const { caseData: c, results: r, set } = useStore();
  const b = c.baseline;
  const f = (k: string, label: string, unit: string, hint?: string, pctMode?: boolean) => (
    <Field label={<>{label} <span className="muted small">({unit})</span></>} hint={hint}>
      <NumIn value={b[k]} percent={pctMode} min={0} onChange={(v) => set(["baseline", k], v)} width={180} />
    </Field>
  );
  return (
    <Page eyebrow="Step 2 of 6" title="Current baseline" intro="Where the bank stands today, before any AI. Every option is measured against this.">
      <Issues items={caseIssues(r, ["baseline_core", "baseline_workload", "baseline_nonneg", "baseline_fprate", "baseline_cases"])} />
      <Section title="Required" note="Three annual figures, in R millions">
        {f("fraud_exposure", "Annual addressable fraud-loss exposure", "R m/year", "Fraud losses the AI could realistically address. Research benchmark 300.")}
        {f("case_cost", "Annual fraud case-handling operating cost", "R m/year", "Including analyst time on false-positive alerts. Research benchmark 45.")}
        {f("fp_cost", "Annual false-positive / customer-friction cost", "R m/year", "Customer-side cost only. Research benchmark 15.")}
      </Section>
      <Section title="Optional operating detail" collapsible open={false} note="Only needed if you use the workload or event-driver benefit methods">
        {f("alerts", "Fraud alerts generated per year", "alerts/year")}
        {f("cases", "Fraud cases investigated per year", "cases/year")}
        {f("fp_rate", "False-positive rate", "% of alerts", undefined, true)}
        {f("analyst_hours", "Analyst hours per year on fraud work", "hours/year")}
        {f("analyst_cost", "Fully loaded analyst cost", "R/hour")}
        {f("resolution_time", "Average case resolution time", "hours/case")}
        {f("loss_per_case", "Average loss per fraud case", "R/case")}
      </Section>
      <Tech><Section title="Baseline validation">
        <Field label="Core baseline complete and non-negative"><Status text={r.checks.baseline_core} /></Field>
        <Field label="Optional workload fields consistent"><Status text={r.checks.baseline_workload} /></Field>
        <Field label="Optional detailed inputs non-negative"><Status text={r.checks.baseline_nonneg} /></Field>
        <Field label="False-positive rate between 0% and 100%"><Status text={r.checks.baseline_fprate} /></Field>
        <Field label="Cases investigated within total alerts"><Status text={r.checks.baseline_cases} /></Field>
        <Field label="Baseline valid (feeds Gate 0)"><Status text={r.checks.baseline_valid ? "OK" : "HARD ERROR - baseline invalid"} /></Field>
      </Section></Tech>
    </Page>
  );
}

// ------------------------------------------------------------------------------------- 04 Alternatives
export function Alternatives() {
  const { caseData: c, set } = useStore();
  const detail: [string, string, boolean][] = [["adoption_depth", "Adoption depth", false], ["workflow_areas", "Fraud workflow areas", false],
    ["human_oversight", "Human oversight", false], ["notes", "Notes", true]];
  const on = c.alternatives.filter((a: any) => a.active).length;
  return (
    <Page eyebrow="Step 3 of 6" title="AI options" intro="Up to five options per case. Switch on the ones you want assessed; only switched-on options get a recommendation.">
      <LockNote />
      {on === 0 && <div className="banner warn">No option is switched on yet. Switch on at least one to get a recommendation.</div>}
      <Section title="Options" note={`${on} of ${c.alternatives.length} switched on`} flush>
        <div className="tbl-wrap"><table className="grid">
          <thead><tr><th className="left" style={{ width: 90 }}>Include</th><th className="left">Name</th><th className="left">Description / use case</th><th className="left">Type</th></tr></thead>
          <tbody>{c.alternatives.map((a: any, i: number) => {
            const lock = isLocked(c, a);
            return (
              <tr key={a.id}>
                <td className="left"><label className="switch"><input type="checkbox" checked={!!a.active} disabled={lock} onChange={(e) => set(["alternatives", i, "active"], e.target.checked)} aria-label={"Include " + a.id} /><span className="track" /></label></td>
                <td className="left" style={{ minWidth: 200 }}><TextIn value={a.name} disabled={lock} onChange={(v) => set(["alternatives", i, "name"], v)} label={"Name " + a.id} /><div className="muted small">{a.id}</div></td>
                <td className="left" style={{ minWidth: 300 }}><TextIn value={a.description} disabled={lock} onChange={(v) => set(["alternatives", i, "description"], v)} label={"Description " + a.id} /></td>
                <td className="left small muted">{a.type}</td>
              </tr>
            );
          })}</tbody>
        </table></div>
      </Section>
      <Section title="More about each option" collapsible open={false} note="Adoption depth, oversight, start year and notes" flush>
        <div className="tbl-wrap"><table className="grid">
          <thead><tr><th className="left">Option</th>{detail.map(([k, l]) => <th key={k} className="left">{l}</th>)}<th className="left">Start year</th></tr></thead>
          <tbody>{c.alternatives.map((a: any, i: number) => {
            const lock = isLocked(c, a);
            return (
              <tr key={a.id}>
                <td className="left"><b>{a.name || a.id}</b><div className="muted small">{a.id}</div></td>
                {detail.map(([k, , wide]) => <td key={k} className="left" style={{ minWidth: wide ? 240 : 150 }}><TextIn value={a[k]} disabled={lock} onChange={(v) => set(["alternatives", i, k], v)} /></td>)}
                <td style={{ minWidth: 90 }}><NumIn value={a.start_year} disabled={lock} onChange={(v) => set(["alternatives", i, "start_year"], v)} /></td>
              </tr>
            );
          })}</tbody>
        </table></div>
      </Section>
    </Page>
  );
}
