// Number formats used throughout. Money is in R millions, as in the workbook.
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
export { isNum };

export function money(v: unknown, dp = 2) {
  if (!isNum(v)) return "–";
  if (Number(v.toFixed(dp)) === 0) v = 0;
  const s = Math.abs(v as number).toLocaleString("en-GB", { minimumFractionDigits: dp, maximumFractionDigits: dp });
  return ((v as number) < 0 ? "−" : "") + "R" + s + "m";
}
export function num(v: unknown, dp = 2) {
  if (!isNum(v)) return "–";
  if (Number(v.toFixed(dp)) === 0) v = 0;
  const s = Math.abs(v as number).toLocaleString("en-GB", { minimumFractionDigits: dp, maximumFractionDigits: dp });
  return ((v as number) < 0 ? "−" : "") + s;
}
export function pct(v: unknown, dp = 1) {
  if (!isNum(v)) return "–";
  return num(v * 100, dp) + "%";
}
export function ratio(v: unknown, dp = 3) { return num(v, dp); }
export function yearOr(v: unknown, text: string) { return isNum(v) ? "Year " + v : text; }
export function bool(v: unknown) { return v ? "Yes" : "No"; }
