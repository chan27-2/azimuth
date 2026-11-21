import { useState } from "react";
import { AlertTriangle, BarChart3 } from "lucide-react";
import type { Component, Overview, Range } from "../../types";
import { api } from "../../lib/api";
import { useQuery } from "../../lib/query";
import { ago, cn, compact, fmtMs, pct } from "../../lib/util";
import * as G from "../../lib/glossary";
import { AnimatedNumber, Empty, Spinner, Tip, type TipContent } from "../../ui/ui";
import { Th, sortRows, useColumns, type Col } from "../../ui/resize";

const OP_COLS: Col[] = [
  { key: "name", label: "Name", width: 0, flex: true, min: 220 },
  { key: "n", label: "Count", width: 84, align: "right" },
  { key: "failed", label: "Failed", width: 84, align: "right", title: "Failure rate" },
  { key: "p50", label: "p50", width: 84, align: "right" },
  { key: "p95", label: "p95", width: 90, align: "right" },
];

export function OverviewTab({ component, range, role, onOperation, onException }: {
  component: Component; range: Range; role: string | null; onOperation: (name: string) => void; onException: (type: string) => void;
}) {
  const columns = useColumns("ai.operations", OP_COLS);
  const q = useQuery<Overview>(`aiov:${component.id}|${range}|${role ?? ""}`, () => api.ai.overview({ component, range, role }));
  if (q.loading && !q.data) return <div className="flex h-full items-center justify-center gap-2 text-[13px] text-fg-3"><Spinner /> Querying {component.name}</div>;
  if (q.error) return <Empty icon={<AlertTriangle />} title="Couldn't query this resource">{q.error}</Empty>;
  const o = q.data!;
  const t = o.totals;
  if (!t.total && !t.exceptions && !t.dependencies) return <Empty icon={<BarChart3 />} title="No telemetry in this time range">Pick a longer range, or check that the apps are sending telemetry to {component.name}.</Empty>;
  const total = t.total ?? 0;
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1280px] space-y-5 p-5">
        <div className="grid grid-cols-6 gap-px overflow-hidden rounded-xl border border-line bg-line">
          <Kpi tip={G.ai.requests} label="Requests" value={total} />
          <Kpi tip={G.ai.failed} label="Failed" value={t.failed ?? 0} sub={pct(t.failed ?? 0, total)} tone={(t.failed ?? 0) > 0 ? "bad" : undefined} />
          <Kpi tip={G.ai.p50} label="p50" text={fmtMs(t.p50)} />
          <Kpi tip={G.ai.p95} label="p95" text={fmtMs(t.p95)} />
          <Kpi tip={G.ai.exceptions} label="Exceptions" value={t.exceptions ?? 0} tone={(t.exceptions ?? 0) > 0 ? "bad" : undefined} />
          <Kpi tip={G.ai.depFailed} label="Failed calls" value={t.depFailed ?? 0} sub={`of ${compact(t.dependencies ?? 0)}`} tone={(t.depFailed ?? 0) > 0 ? "warn" : undefined} />
        </div>

        <Timeline data={o.timeline} bin={o.bin} />

        <div className="grid grid-cols-[3fr_2fr] gap-5">
          <section className="min-w-0 overflow-hidden rounded-xl border border-line">
            <div className="flex h-10 items-center justify-between border-b border-line px-4 text-[12px] font-medium text-fg-2">Operations <span className="font-normal text-fg-3">Click one to see its requests</span></div>
            <div className="overflow-x-auto">
            <table className="w-full table-fixed text-[12.5px]" style={{ minWidth: columns.total }}>
              <thead className="text-[11px] text-fg-3">
                <tr className="border-b border-line">
                  <Th col={OP_COLS[0]} columns={columns} className="py-1.5 pl-4 pr-2" />
                  <Th col={OP_COLS[1]} columns={columns} className="px-2 py-1.5" />
                  <Th col={OP_COLS[2]} columns={columns} className="px-2 py-1.5" />
                  <Th col={OP_COLS[3]} columns={columns} className="px-2 py-1.5"><Tip content={G.ai.p50}><span>p50</span></Tip></Th>
                  <Th col={OP_COLS[4]} columns={columns} className="px-2 py-1.5"><Tip content={G.ai.p95}><span>p95</span></Tip></Th>
                </tr>
              </thead>
              <tbody>
                {sortRows(o.operations, columns.sort, (op, k) => (k === "failed" ? (op.n ? op.failed / op.n : 0) : (op as Record<string, unknown>)[k])).map((op) => (
                  <tr key={op.name + op.role} onClick={() => onOperation(op.name)} className="cursor-default border-b border-line/60 last:border-0 hover:bg-bg-2">
                    <td className="truncate py-2 pl-4 pr-2 text-fg" title={`${op.name} · ${op.role}`}>{op.name}<span className="ml-2 text-[11.5px] text-fg-3">{op.role}</span></td>
                    <td className="px-2 py-2 text-right tabular text-fg-2">{compact(op.n)}</td>
                    <td className={cn("px-2 py-2 text-right tabular", op.failed ? "text-bad" : "text-fg-3")}>{op.failed ? pct(op.failed, op.n) : "—"}</td>
                    <td className="px-2 py-2 text-right tabular text-fg-2">{fmtMs(op.p50)}</td>
                    <td className="px-2 py-2 text-right tabular text-fg-2">{fmtMs(op.p95)}</td>
                  </tr>
                ))}
                {!o.operations.length && <tr><td colSpan={5} className="px-4 py-6 text-center text-fg-3">No requests</td></tr>}
              </tbody>
            </table>
            </div>
          </section>
          <section className="min-w-0 overflow-hidden rounded-xl border border-line">
            <div className="flex h-10 items-center justify-between border-b border-line px-4 text-[12px] font-medium text-fg-2">Exceptions <span className="font-normal text-fg-3">Click one to see its logs</span></div>
            {o.exceptions.map((e) => (
              <button key={e.problemId} onClick={() => onException(e.type)} className="block w-full border-b border-line/60 px-4 py-2.5 text-left last:border-0 hover:bg-bg-2">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-bad" title={e.type}>{e.type.split(".").pop()}</span>
                  <span className="text-[12px] tabular text-fg-2">{compact(e.n)}×</span>
                </div>
                <div className="mt-0.5 truncate text-[12px] text-fg-2" title={e.message}>{e.message}</div>
                <div className="mt-0.5 truncate text-[11px] text-fg-3">{e.role}{e.operation ? ` · ${e.operation}` : ""} · last {ago(e.lastSeen)}</div>
              </button>
            ))}
            {!o.exceptions.length && <div className="px-4 py-6 text-center text-[12.5px] text-fg-3">No exceptions</div>}
          </section>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, text, sub, tone, tip }: { label: string; value?: number; text?: string; sub?: string; tone?: "bad" | "warn"; tip: TipContent }) {
  return (
    <Tip content={tip} block className="bg-bg">
      <div className="w-full px-4 py-3">
        <div className="text-[11.5px] text-fg-3">{label}</div>
        <div className={cn("mt-1 flex items-baseline gap-1.5 text-[22px] font-semibold tracking-[-0.02em]", tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : "text-fg")}>
          {value != null ? <AnimatedNumber value={value} /> : text}
          {sub && <span className="text-[12px] font-normal text-fg-3">{sub}</span>}
        </div>
      </div>
    </Tip>
  );
}

function Timeline({ data, bin }: { data: Overview["timeline"]; bin: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.total));
  const h = hover != null ? data[hover] : null;
  return (
    <section className="rounded-xl border border-line p-4">
      <div className="mb-3 flex items-center justify-between">
        <Tip content={G.ai.timeline}><span className="text-[12px] font-medium text-fg-2">Requests per {bin}</span></Tip>
        <span className="text-[12px] tabular text-fg-3">
          {h ? <>{new Date(h.timestamp).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} · <span className="text-fg-2">{h.total.toLocaleString()}</span> requests · <span className={h.failed ? "text-bad" : ""}>{h.failed.toLocaleString()} failed</span></> : `peak ${max.toLocaleString()}`}
        </span>
      </div>
      <div className="flex h-28 items-end gap-px" onMouseLeave={() => setHover(null)}>
        {data.map((d, i) => (
          <div key={d.timestamp} onMouseEnter={() => setHover(i)} className="relative flex h-full min-w-0 flex-1 flex-col justify-end">
            <div className={cn("w-full rounded-t-[2px] transition-colors duration-100", hover === i ? "bg-fg-2" : "bg-fg-3/45")} style={{ height: `${(d.total / max) * 100}%` }}>
              {d.failed > 0 && <div className="absolute bottom-0 w-full rounded-t-[2px] bg-bad" style={{ height: `${Math.max(2, (d.failed / max) * 100)}%` }} />}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
