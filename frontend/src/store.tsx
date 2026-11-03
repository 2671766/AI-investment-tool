import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api } from "./api";

// The case lives in the browser. Edits are applied immutably by path, saved to this browser
// (localStorage) as a convenience, and re-evaluated by the Python engine after a short pause.
type Ctx = {
  config: any; caseData: any; results: any; busy: boolean; error: string | null;
  set: (path: (string | number)[], value: any) => void;
  replace: (c: any) => void;
  notify: (msg: string, bad?: boolean) => void;
  toast: { msg: string; bad?: boolean } | null;
  prefs: Prefs;
  setPref: (k: keyof Prefs, v: boolean) => void;
};
// View preferences only (never part of the case): technical view shows IDs, workbook
// references and validation rows; showInactive adds switched-off alternatives to the grids.
export type Prefs = { detail: boolean; showInactive: boolean };
const Store = createContext<Ctx>(null as any);
export const useStore = () => useContext(Store);
const KEY = "aidsm.case.v1";
const PREFS_KEY = "aidsm.prefs.v1";

function loadPrefs(): Prefs {
  try { const s = localStorage.getItem(PREFS_KEY); if (s) return { detail: false, showInactive: false, ...JSON.parse(s) }; } catch { /* storage unavailable */ }
  return { detail: false, showInactive: false };
}

export function setIn(obj: any, path: (string | number)[], value: any): any {
  if (!path.length) return value;
  const [k, ...rest] = path;
  const copy = Array.isArray(obj) ? obj.slice() : { ...(obj || {}) };
  copy[k as any] = setIn(obj ? obj[k as any] : undefined, rest, value);
  return copy;
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<any>(null);
  const [caseData, setCase] = useState<any>(null);
  const [results, setResults] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; bad?: boolean } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const seq = useRef(0);

  const notify = useCallback((msg: string, bad = false) => {
    setToast({ msg, bad });
    window.setTimeout(() => setToast(null), bad ? 7000 : 3500);
  }, []);

  const run = useCallback((c: any) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      const mine = ++seq.current;
      setBusy(true);
      try {
        const r = await api.evaluate(c);
        if (mine === seq.current) { setResults(r.results); setError(null); }
      } catch (e: any) {
        if (mine === seq.current) setError(e.message);
      } finally {
        if (mine === seq.current) setBusy(false);
      }
    }, 250);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setConfig(await api.config());
        let c: any = null;
        try { const s = localStorage.getItem(KEY); if (s) c = JSON.parse(s); } catch { /* storage unavailable */ }
        if (!c) c = await api.defaultCase();
        const r = await api.evaluate(c);
        setCase(r.case); setResults(r.results);
      } catch (e: any) {
        setError("Could not reach the calculation service: " + e.message + ". Start the backend (see README).");
      }
    })();
  }, []);

  const persist = (c: any) => { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* ignore */ } };

  const set = useCallback((path: (string | number)[], value: any) => {
    setCase((prev: any) => { const next = setIn(prev, path, value); persist(next); run(next); return next; });
  }, [run]);

  const replace = useCallback((c: any) => { setCase(c); persist(c); run(c); }, [run]);

  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const setPref = useCallback((k: keyof Prefs, v: boolean) => {
    setPrefs((p) => { const n = { ...p, [k]: v }; try { localStorage.setItem(PREFS_KEY, JSON.stringify(n)); } catch { /* ignore */ } return n; });
  }, []);

  return (
    <Store.Provider value={{ config, caseData, results, busy, error, set, replace, notify, toast, prefs, setPref }}>
      {children}
    </Store.Provider>
  );
}
