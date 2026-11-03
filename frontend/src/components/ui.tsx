import { useEffect, useState, type ReactNode } from "react";
import { isNum } from "../format";
import { useStore } from "../store";

// ---------------------------------------------------------------- inputs (blue = you can type here)
type NumProps = {
  value: any; onChange: (v: number | null) => void; percent?: boolean; disabled?: boolean;
  placeholder?: string; min?: number; max?: number; step?: number; integer?: boolean; label?: string;
  width?: number;
};
export function NumIn({ value, onChange, percent, disabled, placeholder, min, max, integer, label, width }: NumProps) {
  const show = (v: any) => (isNum(v) ? String(+(percent ? v * 100 : v).toPrecision(12)) : "");
  const [text, setText] = useState(show(value));
  const [focus, setFocus] = useState(false);
  useEffect(() => { if (!focus) setText(show(value)); }, [value, percent, focus]);
  const parsed = text.trim() === "" ? null : Number(text.replace(",", "."));
  const invalid = parsed !== null && (!Number.isFinite(parsed) || (integer && !Number.isInteger(parsed)) ||
    (min !== undefined && parsed < (percent ? min * 100 : min)) || (max !== undefined && parsed > (percent ? max * 100 : max)));
  const commit = () => {
    setFocus(false);
    if (parsed === null) { if (value !== null && value !== undefined) onChange(null); return; }
    if (!Number.isFinite(parsed)) { setText(show(value)); return; }
    const v = percent ? parsed / 100 : parsed;
    if (v !== value) onChange(v);
  };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, width: width ? width : "100%" }}>
      <input
        className={"in" + (invalid ? " invalid" : "") + (!text && placeholder ? " defaulted" : "")}
        inputMode="decimal" value={text} disabled={disabled} placeholder={placeholder} aria-label={label}
        onFocus={() => setFocus(true)} onChange={(e) => setText(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      />
      {percent && <span className="muted small">%</span>}
    </span>
  );
}

export function TextIn({ value, onChange, disabled, area, label, placeholder }:
  { value: any; onChange: (v: string) => void; disabled?: boolean; area?: boolean; label?: string; placeholder?: string }) {
  const [text, setText] = useState(value ?? "");
  useEffect(() => setText(value ?? ""), [value]);
  const commit = () => { if (text !== (value ?? "")) onChange(text); };
  // Locked text is shown as plain wrapped text, so nothing is hidden behind a scroll.
  if (disabled) return <div className="ro-text" aria-label={label}>{text || <span className="muted">—</span>}</div>;
  // Single-line fields are textareas that grow with their content, so long text wraps instead of being cut off.
  // Modern browsers size it with CSS (field-sizing); older ones fall back to measuring.
  const grow = (el: HTMLTextAreaElement | null) => {
    if (!el || area || CSS.supports("field-sizing", "content") || !el.scrollHeight) return;
    el.style.height = "auto"; el.style.height = el.scrollHeight + 2 + "px";
  };
  return (
    <textarea className={"in text" + (area ? "" : " grow")} rows={area ? undefined : 1} value={text} aria-label={label} placeholder={placeholder}
      ref={grow} onInput={(e) => grow(e.currentTarget)} onChange={(e) => setText(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (!area && e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }} />
  );
}

export function SelIn({ value, options, onChange, disabled, label }:
  { value: any; options: (string | { value: any; label: string })[]; onChange: (v: any) => void; disabled?: boolean; label?: string }) {
  const opts = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  return (
    <select className="in" value={value ?? ""} disabled={disabled} aria-label={label}
      onChange={(e) => {
        const o = opts.find((x) => String(x.value) === e.target.value);
        onChange(o ? o.value : e.target.value);
      }}>
      {!opts.some((o) => String(o.value) === String(value ?? "")) && <option value={value ?? ""}>{value || "Choose…"}</option>}
      {opts.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
    </select>
  );
}

// ---------------------------------------------------------------- display helpers
const InfoIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.4" />
    <path d="M8 7v4.2M8 4.6v.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
);
/** Formula transparency: how a calculated figure is produced, and where it sits in the workbook. */
export function Tip({ children }: { children: ReactNode }) {
  return <span className="tip" tabIndex={0} aria-label="How this is calculated"><InfoIcon /><span className="tip-body" role="tooltip">{children}</span></span>;
}

const Tick = () => <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.3l2.3 2.3 4.7-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const Cross = () => <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
const Bang = () => <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 2.5v4.2M6 9.2v.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;

export function Chip({ tone, children }: { tone: "good" | "warn" | "bad" | "neutral"; children: ReactNode }) {
  return <span className={"chip " + tone}>{tone === "good" ? <Tick /> : tone === "bad" ? <Cross /> : tone === "warn" ? <Bang /> : null}{children}</span>;
}
export function PassFail({ pass, yes = "Pass", no = "Fail" }: { pass: boolean; yes?: string; no?: string }) {
  return <Chip tone={pass ? "good" : "bad"}>{pass ? yes : no}</Chip>;
}
export function toneOf(text: any): "good" | "warn" | "bad" | "neutral" {
  const s = String(text ?? "");
  if (/^No hard errors/i.test(s)) return "good";
  if (/HARD ERROR|FAIL|Not Met|Formal Reassessment|Error/i.test(s)) return "bad";
  if (/WARNING|Attention|Out of Date|Not assessed|Not run/i.test(s)) return "warn";
  if (/^OK$|PASS|Met$|On Track|Coherent|Current|No hard errors|Documented/i.test(s)) return "good";
  return "neutral";
}
export function Status({ text }: { text: any }) { return <Chip tone={toneOf(text)}>{String(text ?? "–")}</Chip>; }

export function Section({ title, note, children, flush, actions, collapsible, open: startOpen = true }:
  { title: string; note?: ReactNode; children: ReactNode; flush?: boolean; actions?: ReactNode; collapsible?: boolean; open?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const shown = !collapsible || open;
  return (
    <section className={"section" + (collapsible ? " collapsible" : "") + (shown ? "" : " closed")}>
      <header>
        {collapsible ? (
          <button className="sec-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
            <Chevron open={open} /><h2>{title}</h2>
          </button>
        ) : <h2>{title}</h2>}
        {note && <span className="note">{note}</span>}
        {actions && shown && <span className="sec-actions">{actions}</span>}
      </header>
      {shown && <div className={"body" + (flush ? " flush" : "")}>{children}</div>}
    </section>
  );
}

const Chevron = ({ open }: { open: boolean }) => (
  <svg className={"chev" + (open ? " open" : "")} viewBox="0 0 16 16" aria-hidden="true"><path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

/** Plain-language list of validation problems; always shown, whatever the view. */
export function Issues({ items, okText }: { items: { who?: string; text: string }[]; okText?: string }) {
  if (!items.length) return okText ? <div className="banner good with-icon"><Tick />{okText}</div> : null;
  const hard = items.some((i) => /HARD ERROR|FAIL|ERROR/i.test(i.text));
  return (
    <div className={"banner with-icon " + (hard ? "bad" : "warn")} role="status">
      {hard ? <Cross /> : <Bang />}
      <div>
        <b>{hard ? `${items.length} issue${items.length > 1 ? "s" : ""} to fix before the model can advise` : `${items.length} thing${items.length > 1 ? "s" : ""} to check`}</b>
        <ul>{items.map((i, k) => <li key={k}>{i.who && <b>{i.who}: </b>}{tidy(i.text)}</li>)}</ul>
      </div>
    </div>
  );
}
/** "HARD ERROR - missing input" -> "Missing input" */
export const tidy = (t: string) => { const s = String(t).replace(/^(HARD ERROR|WARNING)\s*[-:]\s*/i, ""); return s.charAt(0).toUpperCase() + s.slice(1); };

export function Page({ title, intro, eyebrow, children }: { title: string; intro?: ReactNode; eyebrow?: ReactNode; children: ReactNode }) {
  return <div className="page"><div className="page-head">{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1>{intro && <p>{intro}</p>}</div>{children}</div>;
}

/** Shown only in technical view. */
export function Tech({ children }: { children: ReactNode }) {
  const { prefs } = useStore();
  return prefs.detail ? <>{children}</> : null;
}

export function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return <div className="field"><label>{label}</label><div>{children}</div><div className="hint">{hint}</div></div>;
}

export function Kpi({ k, v, s, neg }: { k: string; v: ReactNode; s?: ReactNode; neg?: boolean }) {
  return <div className="kpi"><div className="k">{k}</div><div className={"v" + (neg ? " neg" : "")}>{v}</div>{s && <div className="s">{s}</div>}</div>;
}

// ---------------------------------------------------------------- the alternatives grid
export type GridRow =
  | { group: string; note?: string; tech?: boolean }
  | { label: ReactNode; id?: string; unit?: string; tip?: ReactNode; total?: boolean; tech?: boolean; cell: (alt: any, i: number) => ReactNode };

/** The workbook's core layout: one row per item, one column per alternative.
 *  Shows active alternatives only unless "show inactive" is on; technical rows only in technical view. */
export function AltGrid({ rows, only }: { rows: GridRow[]; only?: string[] }) {
  const { caseData, prefs, setPref } = useStore();
  const all = caseData.alternatives.map((a: any, i: number) => ({ a, i })).filter(({ a }: any) => !only || only.includes(a.id));
  const anyActive = all.some(({ a }: any) => a.active);
  const alts = prefs.showInactive || !anyActive ? all : all.filter(({ a }: any) => a.active);
  const hidden = all.length - alts.length;
  const visible = rows.filter((r) => prefs.detail || !r.tech);
  return (
    <div className="tbl-wrap">
      <table className="grid altgrid" style={{ minWidth: 380 + alts.length * 150 }}>
        <colgroup><col style={{ width: 300 }} /><col style={{ width: 92 }} />{alts.map(({ a }: any) => <col key={a.id} />)}</colgroup>
        <thead><tr><th className="left">Item</th><th className="unit">Unit</th>
          {alts.map(({ a }: any) => (
            <th key={a.id}><div className={"alt-head" + (a.active ? "" : " inactive")}>{a.name || a.id}<div className="id">{a.id}{a.active ? "" : " · off"}</div></div></th>
          ))}</tr></thead>
        <tbody>
          {visible.map((r, k) => "group" in r ? (
            <tr className="group" key={k}><td colSpan={2 + alts.length}>{r.group}{r.note && <span className="group-note">{r.note}</span>}</td></tr>
          ) : (
            <tr key={k} className={r.total ? "total" : ""}>
              <td className="label">{r.label}{r.tip && <Tip>{r.tip}</Tip>}{r.id && prefs.detail && <div className="row-id">{r.id}</div>}</td>
              <td className="unit">{r.unit}</td>
              {alts.map(({ a, i }: any) => <td key={a.id}>{r.cell(a, i)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {anyActive && (hidden > 0 || prefs.showInactive) && (
        <div className="grid-foot">
          {hidden > 0 ? `${hidden} switched-off option${hidden > 1 ? "s" : ""} hidden.` : "Showing switched-off options."}{" "}
          <button className="linkbtn" onClick={() => setPref("showInactive", !prefs.showInactive)}>{prefs.showInactive ? "Hide them" : "Show them"}</button>
        </div>
      )}
    </div>
  );
}

/** Year-by-year grid (rows x years 0..15 or 1..15). */
export function YearGrid({ rows, years }: { rows: { label: ReactNode; cell: (t: number) => ReactNode; total?: boolean }[]; years: number[] }) {
  return (
    <div className="tbl-wrap">
      <table className="grid years">
        <thead><tr><th className="left">Item</th>{years.map((t) => <th key={t}>Y{t}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, k) => (
            <tr key={k} className={r.total ? "total" : ""}><td className="label">{r.label}</td>{years.map((t) => <td key={t}>{r.cell(t)}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AltPicker({ value, onChange, label = "Alternative" }: { value: string; onChange: (v: string) => void; label?: string }) {
  const { caseData } = useStore();
  return (
    <label>{label}
      <SelIn value={value} onChange={onChange} label={label}
        options={caseData.alternatives.map((a: any) => ({ value: a.id, label: `${a.id} – ${a.name}` }))} />
    </label>
  );
}
