import { useEffect, useState } from "react";
import { api } from "../api";
import { CdfLine, Histogram } from "../components/charts";
import { NumIn, Page, Section, SelIn, Status, Tech } from "../components/ui";
import { money, num, pct, ratio } from "../format";
import { useStore } from "../store";

// The uncertain inputs used in the research run of monte_carlo_engine.py v2.2 (tests/fixtures_mc.json).
const RESEARCH_SET = ["BEN-FRAUD-RED", "BEN-CASE-RED", "BEN-FP-RED", "CST-INIT-TOTAL", "CST-REC-TOTAL", "BL-FRAUD-EXP", "RSK-LAMBDA"];

/** The same checks the engine runs before sampling (montecarlo.validate), shown before you press Run. */
function rowProblems(rows: any[]) {
  const out: Record<string, string> = {};
  const on = rows.filter((t) => t.enabled === "Yes");
  for (const t of on) {
    if (!(t.min <= t.mode && t.mode <= t.max)) out[t.variable] = "Minimum ≤ most likely ≤ maximum is required";
    else if (t.min < t.domain_lo || t.max > t.domain_hi) out[t.variable] = "Range is outside the permitted values";
    else if (t.distribution.toLowerCase().startsWith("trunc") && t.sd <= 0 && t.max > t.min) out[t.variable] = "Needs a positive standard deviation";
  }
  const ids = new Set(on.map((t) => t.variable));
  if (ids.has("CST-REC-TOTAL") && (ids.has("CST-VENDOR") || ids.has("CST-MAINT-MON")))
    out["CST-REC-TOTAL"] = "Switch off either the total recurring cost or its components; both together count the same uncertainty twice";
  return out;
}

export function MonteCarlo() {
  const { caseData: c, results: r, set, notify } = useStore();
  const mc = c.monte_carlo;
  const alt = mc.alternative;
  const A = c.alternatives.find((a: any) => a.id === alt);
  const table = r.monte_carlo.inputs[alt];
  const state = r.monte_carlo.state;
  const res = c.mc_result;
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState<string[] | null>(null);
  const rowSet = (j: number, k: string) => (v: any) => set(["monte_carlo", "inputs", alt, j, k], v);
  const enabled = table.filter((t: any) => t.enabled === "Yes").length;
  const problems = rowProblems(table);
  const nProblems = Object.keys(problems).length;
  const isPct = (u: string) => u === "%";
  const active = c.alternatives.filter((a: any) => a.active);
  const suggest = active.find((a: any) => a.id === c.dashboard.alternative) || active[0];
  // Open on a switched-on option (Research Moderate AI when it is on), never a switched-off one.
  useEffect(() => {
    if (A?.active || !active.length) return;
    set(["monte_carlo", "alternative"], (active.find((a: any) => a.id === "RES-MOD") || suggest).id);
  }, []);

  const useResearchSet = () => {
    set(["monte_carlo", "inputs", alt], mc.inputs[alt].map((g: any, j: number) => {
      const on = RESEARCH_SET.includes(g.variable) && table[j].base !== 0;
      return on ? { ...g, enabled: "Yes", distribution: "Triangular", min: null, mode: null, max: null, sd: null } : { ...g, enabled: "No" };
    }));
    setErr(null);
  };

  const run = async () => {
    setRunning(true); setErr(null);
    try {
      const out = await api.monteCarlo(c, alt, mc.iterations, mc.seed);
      set(["mc_result"], { ...out, timestamp: new Date().toLocaleString("en-GB") });
      notify(`Simulated ${out.iterations.toLocaleString()} iterations for ${A?.name || alt}`);
    } catch (e: any) {
      // The run never started (an input problem), so keep the last good result rather than
      // replacing it with an error that would also clear it from the dashboard and Gate 7.
      setErr(String(e.message).split("; "));
    } finally { setRunning(false); }
  };

  const blocker = enabled === 0 ? "Switch on at least one uncertain input below, or use the research set."
    : nProblems ? `Fix the ${nProblems} highlighted input${nProblems > 1 ? "s" : ""} below first.` : null;
  const stats = res && res.summary;
  return (
    <Page eyebrow="Advanced analysis" title="Monte Carlo simulation" intro="Optional. Simulates thousands of possible outcomes when chosen inputs are uncertain, to show the range of results and the chance of a positive return. The main model stays the primary appraisal; a current simulation feeds the dashboard, the comparison and Gate 7.">
      {A && !A.active && (
        <div className="banner warn with-icon"><div>
          <b>{A.name || alt} is switched off</b>, so its result is not used anywhere in the model{suggest ? "" : ". Switch an option on under AI options first"}.
          {suggest && <> <button className="linkbtn" onClick={() => set(["monte_carlo", "alternative"], suggest.id)}>Simulate {suggest.name || suggest.id} instead</button></>}
        </div></div>
      )}
      <Section title="1. Choose what to simulate">
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <label>Option
            <SelIn value={alt} onChange={(v) => { set(["monte_carlo", "alternative"], v); setErr(null); }} label="Option to simulate"
              options={c.alternatives.map((a: any) => ({ value: a.id, label: `${a.name || a.id}${a.active ? "" : " (switched off)"}` }))} />
          </label>
          <label>Iterations<SelIn value={mc.iterations} options={[1000, 5000, 10000, 25000, 50000].map((n) => ({ value: n, label: n.toLocaleString() }))} onChange={(v) => set(["monte_carlo", "iterations"], v)} /></label>
          <label>Random seed<NumIn value={mc.seed} integer min={0} onChange={(v) => set(["monte_carlo", "seed"], v ?? 0)} width={110} /></label>
        </div>
        <p className="small muted" style={{ margin: "10px 0 0" }}>25,000 iterations is the research default (from its convergence test). The same seed always gives the same answer.</p>
      </Section>
      <Section title={`2. Uncertain inputs for ${A?.name || alt}`} note={`${enabled} of 10 switched on`}
        actions={<button className="btn" onClick={useResearchSet}>Use the research set</button>} flush>
        <div className="tbl-wrap"><table className="grid">
          <thead><tr><th className="left">Input</th><th>Base value</th><th className="left">Uncertain?</th><th className="left">Distribution</th><th>Minimum</th><th>Most likely</th><th>Maximum</th><th>Std deviation</th><th className="left">Unit</th><th className="left">Allowed</th></tr></thead>
          <tbody>{table.map((t: any, j: number) => {
            const given = mc.inputs[alt][j];
            const on = given.enabled === "Yes";
            const ph = (v: number) => num(isPct(t.unit) ? v * 100 : v, 3);
            const bad = problems[t.variable];
            return (
              <tr key={t.variable} style={on ? undefined : { color: "var(--ink-3)" }}>
                <td className="left">{t.name}<Tech><div className="row-id">{t.variable}</div></Tech>{bad && <div className="status-text bad small">{bad}</div>}</td>
                <td>{isPct(t.unit) ? pct(t.base, 2) : num(t.base, 3)}</td>
                <td className="left"><label className="switch"><input type="checkbox" checked={on} onChange={(e) => rowSet(j, "enabled")(e.target.checked ? "Yes" : "No")} aria-label={"Uncertain: " + t.name} /><span className="track" /></label></td>
                <td className="left" style={{ minWidth: 160 }}><SelIn value={given.distribution} options={["Triangular", "Uniform", "Truncated Normal"]} onChange={rowSet(j, "distribution")} disabled={!on} /></td>
                <td style={{ minWidth: 104 }}><NumIn value={given.min} percent={isPct(t.unit)} placeholder={ph(t.min)} onChange={rowSet(j, "min")} disabled={!on} /></td>
                <td style={{ minWidth: 104 }}><NumIn value={given.mode} percent={isPct(t.unit)} placeholder={ph(t.mode)} onChange={rowSet(j, "mode")} disabled={!on || given.distribution === "Uniform"} /></td>
                <td style={{ minWidth: 104 }}><NumIn value={given.max} percent={isPct(t.unit)} placeholder={ph(t.max)} onChange={rowSet(j, "max")} disabled={!on} /></td>
                <td style={{ minWidth: 104 }}><NumIn value={given.sd} percent={isPct(t.unit)} placeholder={given.distribution === "Truncated Normal" ? ph(t.sd) : ""} onChange={rowSet(j, "sd")} disabled={!on || given.distribution !== "Truncated Normal"} /></td>
                <td className="left unit">{t.unit}</td>
                <td className="left small muted">{isPct(t.unit) ? `${pct(t.domain_lo, 0)} to ${pct(t.domain_hi, 0)}` : `${num(t.domain_lo, 0)} to ${num(t.domain_hi, 0)}`}</td>
              </tr>
            );
          })}</tbody>
        </table></div>
        <p className="small muted" style={{ padding: "0 20px" }}>Blank cells use the defaults shown in grey: base × 0.8, base and base × 1.2, kept inside the allowed values, and a standard deviation of a sixth of the range. Don't make the total recurring cost uncertain together with its vendor or maintenance components; that counts the same uncertainty twice. The research benchmarks are deterministic in the research, so simulating them is for exploration only.</p>
      </Section>
      <Section title="3. Run">
        <div className="btn-row">
          <button className="btn primary" onClick={run} disabled={running || !!blocker}>{running ? "Simulating…" : `Run ${Number(mc.iterations).toLocaleString()} simulations`}</button>
          {blocker ? <span className="small" style={{ color: "var(--warn)" }}>{blocker}</span> : <span className="small muted">{enabled} uncertain input{enabled > 1 ? "s" : ""} · {A?.name || alt}</span>}
        </div>
        {err && <div className="banner bad" style={{ marginTop: 12, marginBottom: 0 }}><b>The simulation could not start:</b><ul>{err.map((e, k) => <li key={k}>{e}</li>)}</ul>{res?.summary && <span className="small">Your previous result has been kept.</span>}</div>}
      </Section>
      <Section title="Results" note={res?.timestamp ? `Run ${res.timestamp}` : undefined} actions={<Status text={state.text} />}>
        {!stats ? <div className="empty">{state.status === "Error" ? "The last run failed. Fix the message above and run again." : "Not run yet. Switch on at least one uncertain input above and press Run."}</div> : (
          <>
            {state.status !== "Current" && <div className="banner warn">These results are out of date: an input that defines the run has changed since {res.alternative} was simulated. Do not rely on them; run the simulation again.</div>}
            <p className="small muted">{res.alternative}, {Number(res.iterations).toLocaleString()} iterations, seed {res.seed}{res.variables ? ", uncertain: " + res.variables.join(", ") : ""}. {res.engine}.</p>
            <div className="cols-2">
              <div>
                <div className="tbl-wrap"><table className="grid">
                  <thead><tr><th className="left">Metric</th><th>Mean</th><th>Median</th><th>Std dev</th><th>P5</th><th>P25</th><th>P75</th><th>P95</th></tr></thead>
                  <tbody>{[["NPV", "NPV (R m)", false], ["Risk-adjusted NPV", "Risk-adjusted NPV (R m)", false], ["Lifecycle CBR", "CBR", true], ["Risk-adjusted CBR", "Risk-adjusted CBR", true]].map(([k, l, isR]: any) => (
                    <tr key={k}><td className="left">{l}</td>{["mean", "median", "std", "p5", "p25", "p75", "p95"].map((q) => <td key={q}>{isR ? ratio(stats[k][q]) : num(stats[k][q])}</td>)}</tr>
                  ))}</tbody>
                </table></div>
                <h3 style={{ fontSize: 14, margin: "16px 0 6px" }}>Threshold probabilities</h3>
                <dl className="kv">
                  <dt>NPV above zero</dt><dd>{pct(res.probabilities.npv_pos)}</dd>
                  <dt>Risk-adjusted NPV above zero</dt><dd><b>{pct(res.probabilities.ranpv_pos)}</b></dd>
                  <dt>CBR above 1</dt><dd>{pct(res.probabilities.cbr_gt1)}</dd>
                  <dt>Risk-adjusted CBR above 1</dt><dd>{pct(res.probabilities.racbr_gt1)}</dd>
                </dl>
                <p className="small muted">Read these as conditional statements: under the specified input distributions, this share of simulated outcomes clears the threshold.</p>
                <h3 style={{ fontSize: 14, margin: "16px 0 6px" }}>Input importance (Spearman rank correlation with RA-NPV)</h3>
                <table className="grid"><thead><tr><th>Rank</th><th className="left">Variable</th><th>Correlation</th></tr></thead>
                  <tbody>{res.drivers.map((d: any) => <tr key={d.variable_id}><td>{d.rank}</td><td className="left">{d.variable}</td><td>{num(d.rho, 3)}</td></tr>)}</tbody></table>
              </div>
              <div>
                <div className="small muted">Distribution of simulated risk-adjusted NPV (R m); orange bins lie below zero</div>
                <Histogram bins={res.histogram} />
                {res.cdf?.length > 0 && <><div className="small muted">Cumulative share of outcomes</div><CdfLine cdf={res.cdf} /></>}
                <p className="small muted">Mean RA-NPV {money(stats["Risk-adjusted NPV"].mean)}; 90% of outcomes between {money(stats["Risk-adjusted NPV"].p5)} and {money(stats["Risk-adjusted NPV"].p95)}.</p>
              </div>
            </div>
          </>
        )}
      </Section>
    </Page>
  );
}
