import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { money, num, pct } from "../format";

const S1 = "var(--series-1)", S2 = "var(--series-2)", S3 = "var(--series-3)";
const AX = { stroke: "#cbd5e1", fontSize: 12, tickLine: false, tick: { fill: "#64748b" } } as const;
const GRID = <CartesianGrid stroke="#edf1f5" vertical={false} />;

function Tt({ active, payload, label, fmt = money, title }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rt">
      <div className="rt-t">{title ? title(label, payload) : label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey}><span style={{ color: p.color || p.fill }}>■</span> {p.name}: <b>{fmt(p.value)}</b></div>
      ))}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; dash?: boolean }[] }) {
  return <div className="legend">{items.map((i) => <span key={i.label}><i style={{ background: i.color, opacity: i.dash ? .7 : 1 }} />{i.label}</span>)}</div>;
}

/** Cumulative discounted cash flow: unadjusted vs risk-adjusted, by year. */
export function CumulativeChart({ years, horizon }: { years: any; horizon: number }) {
  const data = years.cum_pv_net.map((v: number, t: number) => ({ t, cum: v, ra: years.cum_ra_pv_net[t] })).filter((d: any) => d.t <= Math.max(horizon, 1));
  return (
    <>
      <Legend items={[{ label: "Cumulative PV of net cash flow", color: S1 }, { label: "Risk-adjusted", color: S2 }]} />
      <div className="chart-box">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 10, right: 16, left: 8, bottom: 4 }}>
            {GRID}
            <XAxis dataKey="t" {...AX} tickFormatter={(t) => "Y" + t} />
            <YAxis {...AX} tickFormatter={(v) => num(v, 0)} width={52} />
            <ReferenceLine y={0} stroke="#94a3b8" />
            <Tooltip content={<Tt title={(l: any) => "Year " + l} />} />
            <Line isAnimationActive={false} dataKey="cum" name="Cumulative PV net" stroke={S1} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
            <Line isAnimationActive={false} dataKey="ra" name="Risk-adjusted" stroke={S2} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

/** Tornado: movement of RA-NPV below and above the base, sorted by impact. */
export function Tornado({ rows, top = 12 }: { rows: any[]; top?: number }) {
  const data = rows.slice(0, top).map((r) => ({ name: r.variable, down: Math.min(r.down, r.up), up: Math.max(r.down, r.up), flips: r.flips }));
  return (
    <>
      <Legend items={[{ label: "Movement when the input falls 20% (or worst case)", color: S2 }, { label: "Movement when it rises 20%", color: S1 }]} />
      <div className="chart-box tall">
        <ResponsiveContainer>
          <BarChart data={data} layout="vertical" stackOffset="sign" margin={{ top: 6, right: 20, left: 10, bottom: 4 }} barCategoryGap={6}>
            <CartesianGrid stroke="#edf1f5" horizontal={false} />
            <XAxis type="number" {...AX} tickFormatter={(v) => num(v, 0)} />
            <YAxis type="category" dataKey="name" width={230} {...AX} interval={0} />
            <ReferenceLine x={0} stroke="#94a3b8" />
            <Tooltip content={<Tt />} />
            <Bar isAnimationActive={false} dataKey="down" name="Down" fill={S2} stackId="a" radius={[4, 0, 0, 4]} />
            <Bar isAnimationActive={false} dataKey="up" name="Up" fill={S1} stackId="a" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

/** Bars by category with negatives shown below zero (one series, so no legend). */
export function SimpleBars({ data, x, y, name, fmt = money, height = 260 }: { data: any[]; x: string; y: string; name: string; fmt?: any; height?: number }) {
  return (
    <div className="chart-box" style={{ height }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 10, right: 12, left: 8, bottom: 4 }}>
          {GRID}
          <XAxis dataKey={x} {...AX} interval={0} />
          <YAxis {...AX} tickFormatter={(v) => num(v, 0)} width={52} />
          <ReferenceLine y={0} stroke="#94a3b8" />
          <Tooltip content={<Tt fmt={fmt} />} cursor={{ fill: "rgba(31,78,140,.06)" }} />
          <Bar isAnimationActive={false} dataKey={y} name={name} radius={[4, 4, 0, 0]} maxBarSize={56}>
            {data.map((d, i) => <Cell key={i} fill={d[y] < 0 ? S2 : S1} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function GroupedBars({ data, x, series, height = 280, fmt = money }: { data: any[]; x: string; series: { key: string; name: string; color: string }[]; height?: number; fmt?: any }) {
  return (
    <>
      <Legend items={series.map((s) => ({ label: s.name, color: s.color }))} />
      <div className="chart-box" style={{ height }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 10, right: 12, left: 8, bottom: 4 }} barGap={2}>
            {GRID}
            <XAxis dataKey={x} {...AX} interval={0} />
            <YAxis {...AX} tickFormatter={(v) => num(v, 0)} width={52} />
            <ReferenceLine y={0} stroke="#94a3b8" />
            <Tooltip content={<Tt fmt={fmt} />} cursor={{ fill: "rgba(31,78,140,.06)" }} />
            {series.map((s) => <Bar isAnimationActive={false} key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={40} />)}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

/** Distribution of simulated RA-NPV. */
export function Histogram({ bins }: { bins: any[] }) {
  const data = bins.map((b) => ({ mid: (b.lo + b.hi) / 2, count: b.count, lo: b.lo, hi: b.hi }));
  return (
    <div className="chart-box">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 10, right: 12, left: 8, bottom: 4 }} barCategoryGap={1}>
          {GRID}
          <XAxis dataKey="mid" {...AX} tickFormatter={(v) => num(v, 0)} />
          <YAxis {...AX} width={52} />
          <Tooltip content={({ active, payload }: any) => active && payload?.length ? (
            <div className="rt"><div className="rt-t">{money(payload[0].payload.lo)} to {money(payload[0].payload.hi)}</div>{payload[0].value} iterations</div>) : null} />
          <Bar isAnimationActive={false} dataKey="count" name="Iterations" radius={[3, 3, 0, 0]}>
            {data.map((d, i) => <Cell key={i} fill={d.hi <= 0 ? S2 : d.lo >= 0 ? S1 : "#94a3b8"} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PanelLine({ rows, metric }: { rows: any[]; metric: string }) {
  const key = { NPV: "npv", "Risk-adjusted NPV": "ranpv", CBR: "cbr", "Risk-adjusted CBR": "racbr" }[metric] || "ranpv";
  const isRatio = key === "cbr" || key === "racbr";
  const data = rows.map((r) => ({ x: r.tested, y: r[key], point: r.point }));
  return (
    <div className="chart-box" style={{ height: 240 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 10, right: 16, left: 8, bottom: 4 }}>
          {GRID}
          <XAxis dataKey="x" {...AX} tickFormatter={(v) => num(v, Math.abs(v) < 2 ? 3 : 1)} />
          <YAxis {...AX} width={56} tickFormatter={(v) => num(v, isRatio ? 2 : 0)} domain={["auto", "auto"]} />
          <ReferenceLine y={isRatio ? 1 : 0} stroke="#94a3b8" strokeDasharray="4 3" />
          <Tooltip content={<Tt fmt={isRatio ? (v: any) => num(v, 3) : money} title={(l: any, p: any) => p?.[0]?.payload?.point + " – tested value " + num(l, 4)} />} />
          <Line isAnimationActive={false} dataKey="y" name={metric} stroke={S1} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CdfLine({ cdf }: { cdf: any[] }) {
  return (
    <div className="chart-box" style={{ height: 240 }}>
      <ResponsiveContainer>
        <LineChart data={cdf} margin={{ top: 10, right: 16, left: 8, bottom: 4 }}>
          {GRID}
          <XAxis dataKey="value" type="number" domain={["dataMin", "dataMax"]} {...AX} tickFormatter={(v) => num(v, 0)} />
          <YAxis {...AX} width={44} tickFormatter={(v) => pct(v, 0)} domain={[0, 1]} />
          <ReferenceLine x={0} stroke="#94a3b8" strokeDasharray="4 3" />
          <Tooltip content={({ active, payload }: any) => active && payload?.length ? (
            <div className="rt">{pct(payload[0].payload.p, 0)} of outcomes are at or below {money(payload[0].payload.value)}</div>) : null} />
          <Line isAnimationActive={false} dataKey="p" stroke={S3} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
