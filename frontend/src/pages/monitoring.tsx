import { useState } from "react";
import { GroupedBars } from "../components/charts";
import { AltPicker, Chip, Field, NumIn, Page, PassFail, Section, SelIn, Status, TextIn, Tip } from "../components/ui";
import { isNum, money, num, pct, ratio } from "../format";
import { useStore } from "../store";
import { Ladder } from "./decision";

const Y16 = Array.from({ length: 16 }, (_, t) => t);

function Schedule({ title, note, kind, cats, mode }: { title: string; note: string; kind: string; cats: any[]; mode: "benefits" | "costs" }) {
  const { caseData: c, results: r, set } = useStore();
  const m = c.monitoring;
  const key = `${kind}_${mode}`;
  const fcDefault = r.monitoring.schedules[`forecast_${mode}_by_cat`];
  const total = r.monitoring.schedules[key.replace("_by_cat", "")];
  return (
    <Section title={title} note={note} flush>
      <div className="tbl-wrap"><table className="grid years">
        <thead><tr><th className="left">Category</th>{Y16.map((t) => <th key={t}>Y{t}</th>)}</tr></thead>
        <tbody>
          {cats.map((cat: any) => (
            <tr key={cat.key}><td className="left label">{cat.name}</td>
              {Y16.map((t) => (
                <td key={t}>
                  <NumIn value={m[key][cat.key][t]} label={`${cat.name} year ${t}`}
                    placeholder={kind === "forecast" ? num(fcDefault[cat.key][t], 2) : undefined}
                    onChange={(v) => set(["monitoring", key, cat.key, t], kind === "forecast" ? v : v ?? 0)} />
                </td>
              ))}
            </tr>
          ))}
          <tr className="total"><td className="left">Total</td>{Y16.map((t) => <td key={t}>{num(total[t])}</td>)}</tr>
        </tbody>
      </table></div>
    </Section>
  );
}

export function Monitoring() {
  const { caseData: c, results: r, set, config } = useStore();
  const m = c.monitoring;
  const mr = r.monitoring;
  const v = mr.valuation;
  const [tab, setTab] = useState("schedules");
  const s = (k: string) => (val: any) => set(["monitoring", k], val);
  const statusTone = mr.status === "On Track" ? "good" : mr.status === "Attention Required" ? "warn" : "bad";
  const chart = Y16.slice(1, m.approved_horizon + 1).map((t) => ({ y: "Y" + t, approved: mr.schedules.approved_benefits[t], realised: t <= m.review_year ? mr.schedules.realised_benefits[t] : null, forecast: t > m.review_year ? mr.schedules.forecast_benefits[t] : null }));
  return (
    <Page eyebrow="After approval" title="Monitoring" intro="Once an option is approved, record what was actually realised at each review. The model re-values the remaining case and re-runs the decision checks, so you can see whether it is still on track.">
      <div className={"banner " + statusTone}><b>{mr.status}</b>{mr.trigger_count > 0 ? ` - ${mr.trigger_count} decision-critical trigger(s) active.` : mr.status === "Attention Required" ? " - management variance warnings only." : ""}</div>
      <Section title="Monitoring setup" collapsible open={!m.approval_date}>
        <div className="cols-2">
          <div>
            <Field label="Alternative being monitored"><AltPicker value={m.alternative} onChange={s("alternative")} label="" /></Field>
            <Field label="Approval date"><input className="in text" type="date" value={m.approval_date || ""} onChange={(e) => s("approval_date")(e.target.value)} /></Field>
            <Field label="Current review year (m)"><NumIn value={m.review_year} integer min={0} max={15} onChange={s("review_year")} width={120} /></Field>
          </div>
          <div>
            <Field label="Approved discount rate (locked at approval)"><NumIn value={m.approved_rate} percent onChange={s("approved_rate")} width={120} /></Field>
            <Field label="Approved horizon (locked at approval)"><NumIn value={m.approved_horizon} integer min={1} max={15} onChange={s("approved_horizon")} width={120} /></Field>
            <Field label="Approved recommendation level"><SelIn value={m.approved_level} options={[0, 1, 2, 3, 4, 5].map((n) => ({ value: n, label: "R" + n }))} onChange={s("approved_level")} /></Field>
          </div>
        </div>
      </Section>
      <div className="kpis">
        <div className="kpi"><div className="k">Approved risk-adjusted NPV</div><div className={"v" + (v.approved_ranpv < 0 ? " neg" : "")}>{money(v.approved_ranpv)}</div></div>
        <div className="kpi"><div className="k">Current risk-adjusted NPV</div><div className={"v" + (v.current_ranpv < 0 ? " neg" : "")}>{money(v.current_ranpv)}</div><div className="s">realised + forecast x RAF {ratio(v.raf_now)} - costs</div></div>
        <div className="kpi"><div className="k">Current NPV</div><div className={"v" + (v.current_npv < 0 ? " neg" : "")}>{money(v.current_npv)}</div></div>
        <div className="kpi"><div className="k">Current risk-adjusted CBR</div><div className="v">{isNum(v.current_racbr) ? ratio(v.current_racbr) : "n/a"}</div></div>
        <div className="kpi"><div className="k">Level at this review</div><div className="v">R{mr.reassessment.level}</div><div className="s">approved R{m.approved_level}</div></div>
      </div>
      <div className="tabs" role="tablist">
        {[["schedules", "Schedules"], ["risk", "Risk at review"], ["appraisal", "Rolling appraisal and variance"], ["gates", "Gates and triggers"], ["log", "Review log"]].map(([k, l]) =>
          <button key={k} role="tab" className="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {tab === "schedules" && (<>
        <Section title="Benefits: approved, realised and forecast" note="R m by year">
          <GroupedBars data={chart} x="y" series={[{ key: "approved", name: "Approved forecast", color: "var(--series-1)" }, { key: "realised", name: "Realised actual", color: "var(--series-2)" }, { key: "forecast", name: "Current forecast", color: "var(--series-3)" }]} height={240} />
        </Section>
        <Schedule title="Approved forecast: benefits" note="Entered at approval; do not change after" kind="approved" mode="benefits" cats={config.mon_benefit_cats} />
        <Schedule title="Approved forecast: costs" note="Entered at approval" kind="approved" mode="costs" cats={config.mon_cost_cats} />
        <Schedule title="Realised actual: benefits" note="Years 1 to m" kind="realised" mode="benefits" cats={config.mon_benefit_cats} />
        <Schedule title="Realised actual: costs" note="Year 0 and years 1 to m" kind="realised" mode="costs" cats={config.mon_cost_cats} />
        <Schedule title="Current forecast: benefits" note="Years m+1 to n; blank cells carry the approved forecast forward" kind="forecast" mode="benefits" cats={config.mon_benefit_cats} />
        <Schedule title="Current forecast: costs" note="Years m+1 to n" kind="forecast" mode="costs" cats={config.mon_cost_cats} />
        <Section title="Operational KPIs" note="Optional; reported next to the money" flush>
          <div className="tbl-wrap"><table className="grid years">
            <thead><tr><th className="left">KPI</th>{Y16.map((t) => <th key={t}>Y{t}</th>)}</tr></thead>
            <tbody>{config.mon_kpis.map((k: string) => (
              <tr key={k}><td className="left label">{k}</td>{Y16.map((t) => <td key={t}><NumIn value={m.kpis[k]?.[t]} onChange={(val) => set(["monitoring", "kpis", k, t], val)} /></td>)}</tr>
            ))}</tbody>
          </table></div>
        </Section>
      </>)}
      {tab === "risk" && (
        <Section title="Updated risk assessment at this review" note="Blank current scores carry the approved score forward" flush>
          <div className="tbl-wrap"><table className="grid">
            <thead><tr><th className="left">Risk category</th><th>Approved score</th><th>Current score</th><th className="left">Critical status now</th><th className="left">Evidence / rationale at this review</th></tr></thead>
            <tbody>{config.risk.map((rk: any, j: number) => (
              <tr key={rk.id}><td className="left">{rk.name}</td><td>{num(mr.risk.rows[j].approved, 1)}</td>
                <td style={{ width: 110 }}><NumIn value={m.current_scores[j]} min={1} max={5} placeholder={num(mr.risk.rows[j].approved, 1)} onChange={(val) => set(["monitoring", "current_scores", j], val)} /></td>
                <td className="left" style={{ width: 210 }}><SelIn value={m.current_critical[j]} options={config.lists.critical} onChange={(val) => set(["monitoring", "current_critical", j], val)} /></td>
                <td className="left"><TextIn value={m.risk_notes[j]} onChange={(val) => set(["monitoring", "risk_notes", j], val)} /></td></tr>
            ))}
              <tr className="total"><td className="left">Current weighted risk score</td><td /><td>{num(mr.risk.wrs, 3)}</td><td className="left" colSpan={2}>RAF now {ratio(mr.risk.raf)}, unresolved critical issues {mr.risk.critical}, all seven scored: {mr.risk.all_scored ? "Yes" : "No"}</td></tr>
            </tbody>
          </table></div>
        </Section>
      )}
      {tab === "appraisal" && (<>
        <Section title="Rolling lifetime appraisal" note={`At the approved ${pct(m.approved_rate)} over ${m.approved_horizon} years`}>
          <div className="cols-2">
            <dl className="kv">
              <dt>Approved PV of benefits</dt><dd>{money(v.approved_pvb)}</dd><dt>Approved PV of costs</dt><dd>{money(v.approved_pvc)}</dd>
              <dt>Approved NPV</dt><dd>{money(v.approved_npv)}</dd><dt>Approved risk-adjusted NPV</dt><dd>{money(v.approved_ranpv)}</dd>
            </dl>
            <dl className="kv">
              <dt>PV of realised benefits (1 to m)</dt><dd>{money(v.realised_pvb)}</dd><dt>PV of forecast benefits (m+1 to n)</dt><dd>{money(v.forecast_pvb)}</dd>
              <dt>PV of realised costs (0 to m)</dt><dd>{money(v.realised_pvc)}</dd><dt>PV of forecast costs (m+1 to n)</dt><dd>{money(v.forecast_pvc)}</dd>
              <dt>Current NPV</dt><dd>{money(v.current_npv)}</dd><dt>Current CBR</dt><dd>{isNum(v.current_cbr) ? ratio(v.current_cbr) : "n/a"}</dd>
              <dt>Current risk-adjusted NPV<Tip>Realised benefits are history and are not risk-adjusted. Only the forecast benefits are multiplied by the current RAF.</Tip></dt><dd><b>{money(v.current_ranpv)}</b></dd>
              <dt>Current risk-adjusted CBR</dt><dd>{isNum(v.current_racbr) ? ratio(v.current_racbr) : "n/a"}</dd>
            </dl>
          </div>
        </Section>
        <Section title="Category variance against the approved case" note={`Years 1 to ${m.review_year}, undiscounted`} flush>
          <div className="tbl-wrap"><table className="grid">
            <thead><tr><th className="left">Category</th><th className="left">Type</th><th>Approved to date</th><th>Actual to date</th><th>Variance</th><th>Variance %</th><th className="left">Assessment</th></tr></thead>
            <tbody>{mr.variance.map((x: any) => (
              <tr key={x.variable_id + x.type}><td className="left">{x.category}</td><td className="left">{x.type}</td><td>{money(x.approved)}</td><td>{money(x.actual)}</td><td>{money(x.variance)}</td>
                <td>{isNum(x.variance_pct) ? pct(x.variance_pct) : "n/a"}</td><td className="left"><Chip tone={x.assessment === "Favourable" ? "good" : x.magnitude > mr.warnings.threshold ? "bad" : "warn"}>{x.assessment}</Chip></td></tr>
            ))}</tbody>
          </table></div>
          <div style={{ padding: "8px 16px 12px" }} className="toolbar">
            <label>Adverse variance threshold for an attention warning<NumIn value={m.variance_threshold} percent onChange={s("variance_threshold")} width={100} /></label>
            <span className="small muted">{mr.warnings.adverse_beyond_threshold} categories beyond the threshold. Implementation over approved budget: {mr.warnings.implementation_over_budget ? "Yes" : "No"}.</span>
          </div>
        </Section>
      </>)}
      {tab === "gates" && (<>
        <Section title="Reassessment through the recommendation engine">
          <div className="verdict"><span className="big">R{mr.reassessment.level}</span><span style={{ fontWeight: 600 }}>{mr.reassessment.label.replace(/^R\d - /, "")}</span></div>
          <Ladder level={mr.reassessment.level} />
          <p className="codes">{mr.reassessment.reason_codes}</p>
          <div className="btn-row">{Object.entries(mr.reassessment.gates).map(([k, val]: any) => <span key={k}><span className="small muted">{k}</span> <PassFail pass={val} /></span>)}</div>
        </Section>
        <div className="cols-2">
          <Section title="Monitoring Gate 4: scenarios on the remaining case" note="Realised history is fixed" flush>
            <div className="tbl-wrap"><table className="grid">
              <thead><tr><th className="left">Scenario</th><th>Benefit factor</th><th>Cost factor</th><th>Current NPV</th><th>Current RA-NPV</th></tr></thead>
              <tbody>{["Downside", "Base", "Upside"].map((sc) => (
                <tr key={sc}><td className="left">{sc}</td>
                  <td style={{ width: 90 }}><NumIn value={m.scenario_factors[sc][0]} onChange={(val) => set(["monitoring", "scenario_factors", sc, 0], val)} /></td>
                  <td style={{ width: 90 }}><NumIn value={m.scenario_factors[sc][1]} onChange={(val) => set(["monitoring", "scenario_factors", sc, 1], val)} /></td>
                  <td>{money(mr.gate4[sc].npv)}</td><td>{money(mr.gate4[sc].ranpv)}</td></tr>
              ))}</tbody>
            </table></div>
          </Section>
          <Section title="Monitoring Gate 5: break-even on the remaining case">
            <dl className="kv">
              <dt>Required multiple of forecast benefits</dt><dd>{isNum(mr.gate5.required_multiple) ? num(mr.gate5.required_multiple, 3) + "x" : "Not applicable"}</dd>
              <dt>Documented plausible multiple</dt><dd><NumIn value={m.plausible_multiple} onChange={s("plausible_multiple")} width={100} /></dd>
              <dt>Basis for that multiple</dt><dd><TextIn value={m.multiple_basis} onChange={s("multiple_basis")} /></dd>
              <dt>Maximum viable remaining cost</dt><dd>{money(mr.gate5.max_viable_remaining_cost)}</dd>
              <dt>PV of forecast remaining cost</dt><dd>{money(mr.gate5.pv_forecast_remaining_cost)}</dd>
              <dt>Gate 5 now</dt><dd><PassFail pass={mr.gate5.pass} /></dd>
            </dl>
          </Section>
        </div>
        <Section title="Monitoring Gate 6: evidence quality at this review" flush>
          <div className="tbl-wrap"><table className="grid">
            <thead><tr><th>Rank</th><th className="left">Material driver now</th><th className="left">Confidence at approval</th><th className="left">Evidence status at this review</th><th className="left">Adequate?</th><th className="left">Notes</th></tr></thead>
            <tbody>{mr.gate6.rows.map((g: any, j: number) => (
              <tr key={j}><td>{g.rank}</td><td className="left">{g.driver}</td><td className="left">{g.confidence_at_approval}</td>
                <td className="left" style={{ width: 230 }}><SelIn value={m.evidence_status[j]} options={config.lists.monitor_evidence} onChange={(val) => set(["monitoring", "evidence_status", j], val)} /></td>
                <td className="left"><PassFail pass={g.adequate} yes="Yes" no="No" /></td>
                <td className="left"><TextIn value={m.evidence_notes[j]} onChange={(val) => set(["monitoring", "evidence_notes", j], val)} /></td></tr>
            ))}</tbody>
          </table></div>
          <div className="toolbar" style={{ padding: "8px 16px" }}><label>A pilot or further review could still measure the remaining uncertainty<SelIn value={m.pilot_measurable} options={["Yes", "No"]} onChange={s("pilot_measurable")} /></label></div>
        </Section>
        <Section title="Decision-critical triggers" note="Any active trigger requires a formal reassessment">
          <table className="grid"><tbody>{mr.triggers.map((t: any) => (
            <tr key={t.trigger}><td className="left">{t.trigger}</td><td className="left" style={{ width: 140 }}>{t.active ? <Chip tone="bad">Triggered</Chip> : <Chip tone="good">Clear</Chip>}</td></tr>
          ))}</tbody></table>
          <p className="small muted" style={{ marginBottom: 0 }}>Monitoring status: <Status text={mr.status} /></p>
        </Section>
      </>)}
      {tab === "log" && <ReviewLog />}
    </Page>
  );
}

function ReviewLog() {
  const { caseData: c, results: r, set } = useStore();
  const log: any[] = c.monitoring.log || [];
  const mr = r.monitoring;
  const add = () => set(["monitoring", "log"], [...log, {
    date: new Date().toISOString().slice(0, 10), reviewer: c.meta.prepared_by || "", review_year: c.monitoring.review_year,
    ranpv: Math.round(mr.valuation.current_ranpv * 1000) / 1000, status: mr.status, recommendation: mr.reassessment.label, action: "",
  }].slice(-7));
  const upd = (i: number, k: string) => (v: any) => set(["monitoring", "log", i, k], v);
  return (
    <Section title="Reassessment log" note="One row per formal review, kept for audit (the workbook holds seven)" actions={<button className="btn" onClick={add}>Record this review</button>} flush>
      <div className="tbl-wrap"><table className="grid">
        <thead><tr><th className="left">Review date</th><th className="left">Reviewer</th><th>Review year</th><th>Current RA-NPV</th><th className="left">Monitoring status</th><th className="left">Recommendation at review</th><th className="left">Decision / action taken</th><th /></tr></thead>
        <tbody>{log.map((e, i) => (
          <tr key={i}><td className="left">{e.date}</td><td className="left"><TextIn value={e.reviewer} onChange={upd(i, "reviewer")} /></td><td>{e.review_year}</td><td>{money(e.ranpv)}</td>
            <td className="left">{e.status}</td><td className="left small">{e.recommendation}</td><td className="left" style={{ minWidth: 240 }}><TextIn value={e.action} onChange={upd(i, "action")} /></td>
            <td><button className="btn" onClick={() => set(["monitoring", "log"], log.filter((_, j) => j !== i))}>Remove</button></td></tr>
        ))}</tbody>
      </table></div>
      {!log.length && <div className="empty">No reviews recorded. Record a review once the realised figures for year m are in.</div>}
    </Section>
  );
}
