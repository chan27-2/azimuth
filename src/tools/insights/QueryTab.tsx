import { useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { AlertTriangle, Braces, FileSpreadsheet, Play, Table2 } from "lucide-react";
import type { Component, QueryResult, Range } from "../../types";
import { api } from "../../lib/api";
import { stored, store } from "../../lib/storage";
import { cn, copy, fmtMs } from "../../lib/util";
import { mod } from "../../lib/platform";
import * as G from "../../lib/glossary";
import { Button, Empty, Kbd, Select, Spinner, Tip } from "../../ui/ui";
import { RANGES } from "./common";

const SAMPLES: { value: string; label: string }[] = [
  { value: "requests\n| where success == false\n| summarize failures = count() by name, resultCode\n| order by failures desc", label: "Failures by operation" },
  { value: "requests\n| summarize p50 = percentile(duration, 50), p95 = percentile(duration, 95), n = count() by bin(timestamp, 1h)\n| order by timestamp asc", label: "Latency per hour" },
  { value: "dependencies\n| where success == false\n| summarize n = count() by type, target, resultCode\n| order by n desc", label: "Failing dependencies" },
  { value: "exceptions\n| summarize n = count(), lastSeen = max(timestamp) by type, outerMessage\n| order by n desc", label: "Exceptions" },
  { value: "traces\n| where severityLevel >= 3\n| project timestamp, cloud_RoleName, message, operation_Id\n| order by timestamp desc\n| take 200", label: "Recent errors" },
];

const csvCell = (v: unknown) => {
  const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const show = (v: unknown) => (v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));

export function QueryTab({ component, range: defaultRange, onOpenTrace }: { component: Component; range: Range; onOpenTrace: (operationId: string, at?: string) => void }) {
  const [kql, setKql] = useState(() => stored("insights.kql", SAMPLES[0].value));
  const [range, setRange] = useState<Range>(defaultRange);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<{ message: string; detail?: string } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const v = useVirtualizer({ count: result?.rows.length ?? 0, getScrollElement: () => scroller.current, estimateSize: () => 30, overscan: 20 });

  const run = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    store("insights.kql", kql);
    try {
      setResult(await api.ai.query({ component, kql, range }));
    } catch (e) {
      const err = e as { message: string; detail?: string };
      setError({ message: err.message, detail: err.detail !== err.message ? err.detail : undefined });
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  const opCol = result?.columns.findIndex((c) => c.name === "operation_Id") ?? -1;
  const tsCol = result?.columns.findIndex((c) => c.name === "timestamp") ?? -1;
  const cols = result?.columns.length ?? 0;
  const template = `repeat(${cols}, minmax(140px, 1fr))`;

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-line p-4">
        <div className="overflow-hidden rounded-lg border border-line bg-bg-1 focus-within:border-line-2">
          <textarea
            value={kql}
            onChange={(e) => setKql(e.target.value)}
            onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); run(); } }}
            spellCheck={false}
            rows={6}
            aria-label="KQL query"
            className="selectable block w-full resize-y bg-transparent p-3 font-mono text-[12.5px] leading-relaxed text-fg outline-none"
          />
          <div className="flex items-center gap-2 border-t border-line px-2 py-1.5">
            <Tip content={G.ai.kql}><span className="cursor-help px-1 text-[11px] font-medium uppercase tracking-[0.08em] text-fg-3">KQL</span></Tip>
            <Select value="" onChange={(s) => s && setKql(s)} label="Examples" align="start" options={[{ value: "", label: "Examples" }, ...SAMPLES]} />
            <Select value={range} onChange={setRange} options={RANGES} label="Time range" align="start" />
            <span className="ml-auto text-[11.5px] text-fg-3"><Kbd>{mod("↵")}</Kbd> to run</span>
            <Button onClick={run} disabled={busy || !kql.trim()}>{busy ? <Spinner className="size-3" /> : <Play />} Run</Button>
          </div>
        </div>
      </div>
      {error ? (
        <div className="m-4 rounded-lg border border-bad/25 bg-bad/5 p-4">
          <div className="flex items-center gap-2 text-[13px] font-medium text-bad"><AlertTriangle className="size-4" />{error.message}</div>
          {error.detail && <pre className="selectable mt-2 whitespace-pre-wrap font-mono text-[12px] text-fg-2">{error.detail}</pre>}
        </div>
      ) : !result ? (
        <Empty icon={<Table2 />} title="Run a query">Queries are read-only, limited to the time range, and stop at 10,000 rows. Pick an example to start.</Empty>
      ) : (
        <>
          <div className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-2 text-[12px] text-fg-3">
            <span>{result.rows.length.toLocaleString()} row{result.rows.length === 1 ? "" : "s"}{result.truncated ? " (first 10,000)" : ""} · {fmtMs(result.ms)}</span>
            {opCol >= 0 && <span>Click a row to open its trace.</span>}
            <span className="ml-auto flex gap-1">
              <Tip content="Copy results as CSV"><Button variant="ghost" size="sm" onClick={() => copy([result.columns.map((c) => csvCell(c.name)).join(","), ...result.rows.map((r) => r.map(csvCell).join(","))].join("\n"))}><FileSpreadsheet /> CSV</Button></Tip>
              <Tip content="Copy results as JSON"><Button variant="ghost" size="sm" onClick={() => copy(JSON.stringify(result.rows.map((r) => Object.fromEntries(result.columns.map((c, i) => [c.name, r[i]]))), null, 2))}><Braces /> JSON</Button></Tip>
            </span>
          </div>
          <div ref={scroller} className="min-h-0 flex-1 overflow-auto">
            <div style={{ minWidth: cols * 140 }}>
              <div className="sticky top-0 z-10 grid border-b border-line bg-bg text-[11px] text-fg-3" style={{ gridTemplateColumns: template }}>
                {result.columns.map((c) => <div key={c.name} className="truncate px-3 py-1.5" title={`${c.name} (${c.type})`}>{c.name}</div>)}
              </div>
              <div style={{ height: v.getTotalSize(), position: "relative" }}>
                {v.getVirtualItems().map((it) => {
                  const r = result.rows[it.index];
                  const op = opCol >= 0 ? String(r[opCol] ?? "") : "";
                  return (
                    <div
                      key={it.index}
                      onClick={() => op && onOpenTrace(op, tsCol >= 0 ? String(r[tsCol]) : undefined)}
                      style={{ position: "absolute", top: 0, left: 0, right: 0, height: it.size, transform: `translateY(${it.start}px)`, gridTemplateColumns: template }}
                      className={cn("grid items-center border-b border-line/50 text-[12px]", op ? "cursor-default hover:bg-bg-2" : "")}
                    >
                      {r.map((cell, i) => <div key={i} className="selectable truncate px-3 font-mono text-fg-2" title={show(cell)}>{show(cell)}</div>)}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
