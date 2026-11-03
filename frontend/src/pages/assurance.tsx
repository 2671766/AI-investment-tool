import { api } from "../api";
import { Chip, Page, Section, Status } from "../components/ui";
import { num, pct } from "../format";
import { useStore } from "../store";

export function Verification() {
  const { results: r } = useStore();
  const fails = r.verification.filter((v: any) => v.result !== "PASS").length;
  return (
    <Page eyebrow="Assurance" title="Verification" intro="Checks the web engine runs on every recalculation. The full acceptance suite, including cell-by-cell parity with the workbook, lives in the project's tests folder.">
      <div className={"banner " + (fails ? "bad" : "good")}>{fails ? `${fails} internal check(s) failed.` : "All internal consistency checks pass for this case."}</div>
      <Section title="Research reproduction" note="Pass only while the research inputs are unchanged">
        <div className="tbl-wrap"><table className="grid">
          <thead><tr><th className="left">Alternative</th><th className="left">Metric</th><th>This case</th><th>Research</th><th className="left">Result</th></tr></thead>
          <tbody>{r.research_reproduction.map((x: any, i: number) => (
            <tr key={i}><td className="left">{x.alternative}</td><td className="left">{x.metric}</td><td>{num(x.value, 6)}</td><td>{num(x.research, 6)}</td>
              <td className="left">{x.result === "PASS" ? <Chip tone="good">PASS</Chip> : <Chip tone="neutral">{x.result}</Chip>}</td></tr>
          ))}</tbody>
        </table></div>
      </Section>
      <Section title="Internal consistency checks" flush>
        <div className="tbl-wrap"><table className="grid">
          <thead><tr><th className="left">Alternative</th><th className="left">Check</th><th className="left">Result</th></tr></thead>
          <tbody>{r.verification.map((x: any, i: number) => <tr key={i}><td className="left">{x.alternative}</td><td className="left">{x.check}</td><td className="left"><Status text={x.result} /></td></tr>)}</tbody>
        </table></div>
      </Section>
      <Section title="How the web app was verified against the workbook" collapsible open={false}>
        <div className="prose">
          <p>The engine was checked cell by cell against the v1.5 workbook: about 3,250 calculated cells per case (benefits, costs, risk, the full 16-year cash-flow blocks, break-evens, scenarios, the 110-point sensitivity grid, the driver ranking, every gate, level and reason code, comparison and monitoring) across six workbook variants recalculated in LibreOffice. All match to within 1e-7.</p>
          <p>Monte Carlo reproduces monte_carlo_engine.py v2.2 exactly for the same seed (summary statistics, probabilities, rank correlations and histogram counts).</p>
          <p>Run <code>pytest</code> in the backend folder to repeat the checks.</p>
        </div>
      </Section>
      <Section title="Known differences from workbook v1.5" collapsible open={false}>
        <div className="prose">
          <p><b>Sensitivity control panel.</b> In the workbook (09_Sensitivity rows 56 to 60), choosing any variable other than the three reduction percentages tests the wrong input, because the panel's columns are matched to the variable list by position and the two lists are in different orders. Selecting "Initial implementation cost", for example, changes the other-benefit value instead. The panel is display-only, so no gate or recommendation is affected. The web app tests the variable you choose.</p>
          <p><b>Driver-impact block.</b> In the workbook (09_Sensitivity, the analyst-workload and cost-per-event rows of each alternative's driver block), the -20% and +20% factors are never applied, so those two drivers always show zero impact. That can change the top-three ranking, and therefore Gate 6, for alternatives that use the workload or event-driver methods. The web app reproduces this while workbook compatibility is on (Settings), so both tools give the same recommendation; switch it off to see the corrected ranking.</p>
          <p><b>Minimum viable system life (financial).</b> The workbook's NPV = 0 version searches only inside the evaluation horizon. The web app shows that figure and, beside it, a corrected one that searches all 15 years like the risk-adjusted version.</p>
        </div>
      </Section>
    </Page>
  );
}

export function Settings() {
  const { caseData: c, set, replace, notify, config } = useStore();
  const st = c.settings || {};
  const reset = async (blank: boolean) => {
    if (!window.confirm(blank ? "Start a new blank case? Unsaved changes to this case will be lost." : "Reload the research benchmark case from the workbook? Unsaved changes will be lost.")) return;
    replace(blank ? await api.blankCase() : await api.defaultCase());
    notify(blank ? "Started a new blank case" : "Loaded the research benchmark case");
  };
  return (
    <Page eyebrow="Assurance" title="Settings" intro="Start a new case, choose model behaviour, and view the locked technical configuration.">
      <Section title="Model behaviour">
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 12 }}>
          <input type="checkbox" checked={!!st.workbook_compatibility} onChange={(e) => set(["settings", "workbook_compatibility"], e.target.checked)} style={{ marginTop: 3 }} />
          <span><b>Match workbook v1.5 exactly</b><br /><span className="small muted">Reproduces the workbook's driver-impact behaviour for the analyst-workload and cost-per-event drivers, so the web app and Excel always give the same Gate 6 and recommendation. Switch off to use the corrected calculation (see Verification).</span></span>
        </label>
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <input type="checkbox" checked={!!st.unlock_benchmarks} onChange={(e) => set(["settings", "unlock_benchmarks"], e.target.checked)} style={{ marginTop: 3 }} />
          <span><b>Allow editing the research benchmarks</b><br /><span className="small muted">RES-MOD and RES-ADV are protected in the workbook so they keep reproducing the research. Unlock them only to explore.</span></span>
        </label>
      </Section>
      <Section title="Starting points">
        <div className="btn-row">
          <button className="btn" onClick={() => reset(false)}>Load the research benchmark case</button>
          <button className="btn" onClick={() => reset(true)}>Start a blank case</button>
        </div>
        <p className="small muted">Your work is kept in this browser between visits. Use File → Save case for a file you can keep or share, and File → Export to Excel for a workbook copy that Excel recalculates on opening. Import from Excel reads the inputs from any v1.5 workbook, including one you have edited in Excel.</p>
      </Section>
      <Section title="Technical configuration" collapsible open={false} note="Locked; mirrors 18_Technical_Config">
        <div className="cols-2">
          <div className="tbl-wrap"><table className="grid">
            <thead><tr><th className="left">Benchmark risk category</th><th>Weight</th></tr></thead>
            <tbody>{config.risk.map((rk: any, j: number) => <tr key={rk.id}><td className="left">{rk.name}</td><td>{pct(config.benchmark_weights[j], 0)}</td></tr>)}
              <tr className="total"><td className="left">Benchmark lambda</td><td>{num(config.benchmark_lambda, 2)}</td></tr></tbody>
          </table></div>
          <div className="tbl-wrap"><table className="grid">
            <thead><tr><th className="left">Level</th><th className="left">Label</th></tr></thead>
            <tbody>{config.levels.map((l: string, i: number) => <tr key={i}><td className="left">R{i}</td><td className="left">{l.replace(/^R\d - /, "")}</td></tr>)}</tbody>
          </table></div>
        </div>
        <p className="small muted">Workbook {config.model_version}, web engine {config.engine_version}.</p>
      </Section>
    </Page>
  );
}
