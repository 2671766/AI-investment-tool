// Thin client for the Python API. Every call sends the whole case; the server keeps nothing.
async function call(path: string, init?: RequestInit) {
  const res = await fetch(path, init);
  if (!res.ok) {
    let msg = res.statusText;
    try { const j = await res.json(); msg = j.detail || msg; } catch { /* not JSON */ }
    throw new Error(msg);
  }
  return res;
}
const json = (body: unknown): RequestInit => ({
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});

export const api = {
  config: async () => (await call("/api/config")).json(),
  defaultCase: async () => (await call("/api/case/default")).json(),
  blankCase: async () => (await call("/api/case/blank")).json(),
  evaluate: async (c: any) => (await call("/api/evaluate", json(c))).json(),
  monteCarlo: async (c: any, alternative: string, iterations: number, seed: number) =>
    (await call("/api/montecarlo", json({ case: c, alternative, iterations, seed }))).json(),
  importXlsx: async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return (await call("/api/import/xlsx", { method: "POST", body: fd })).json();
  },
  exportXlsx: async (c: any) => (await call("/api/export/xlsx", json(c))).blob(),
};
