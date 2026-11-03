// The guided path through the case, shared by the sidebar, the overview and the step footer.
// Each flag reads the calculated results: "bad" blocks the recommendation, "warn" is worth a look.
export type Flag = "bad" | "warn" | null;
const anyAlt = (r: any, f: (a: any) => boolean) => Object.values(r.alternatives).some((a: any) => a.active && f(a));

export const BUILD_STEPS: { id: string; label: string; hint: string; flag: (r: any) => Flag }[] = [
  { id: "case", label: "Case details", hint: "Name, horizon and discount rate",
    flag: (r) => (["case_fields", "horizon", "rate"].some((k) => r.checks[k] !== "OK") ? "bad" : null) },
  { id: "baseline", label: "Current baseline", hint: "Today's fraud losses and costs",
    flag: (r) => (r.checks.baseline_valid ? null : "bad") },
  { id: "alternatives", label: "AI options", hint: "Describe and switch on the proposals",
    flag: (r) => (Object.values(r.alternatives).some((a: any) => a.active) ? null : "warn") },
  { id: "benefits", label: "Benefits", hint: "What each option is expected to save",
    flag: (r) => (anyAlt(r, (a) => !a.benefits.valid) ? "bad" : anyAlt(r, (a) => a.benefits.checks.length > 0) ? "warn" : null) },
  { id: "costs", label: "Costs", hint: "Set-up and running costs",
    flag: (r) => (anyAlt(r, (a) => !a.costs.valid || !a.costs.residual_ok) ? "bad" : anyAlt(r, (a) => a.costs.checks.length > 0) ? "warn" : null) },
  { id: "risk", label: "Risks", hint: "Score seven risk categories",
    flag: (r) => (r.checks.case_weights !== "OK" || r.checks.lambda_rationale !== "OK" ? "bad" : anyAlt(r, (a) => a.risk.not_assessed > 0) ? "warn" : null) },
];

export const go = (id: string) => { window.location.hash = id; };
