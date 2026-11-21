import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { AlertTriangle, ArrowUpRight, MessageSquare } from "lucide-react";
import type { Component, LogRow, Range } from "../../types";
import { api } from "../../lib/api";
import { useQuery } from "../../lib/query";
import { cn, copy } from "../../lib/util";
import * as G from "../../lib/glossary";
import { Button, Empty, Field, Select, Spinner, Switch, Tip } from "../../ui/ui";
import { JsonTree } from "../../ui/viewers/JsonTree";
import { LogEntry, SeverityBadge } from "./TraceView";
import { ColumnHeader, PanelToggle, SidePanel, useColumns, usePanel, type Col } from "../../ui/resize";
import { deepParse, oneLine } from "../../ui/SmartText";

const LEVELS = [{ value: 0, label: "All levels" }, { value: 1, label: "Info and up" }, { value: 2, label: "Warnings and up" }, { value: 3, label: "Errors only" }];
const LIVE_EVERY = 10_000;

// Live tail: every 10 seconds, ask only for logs newer than the newest one shown. Skips a tick while
// the previous request is still running or the window is hidden, so it never piles up queries.
export function useLiveTail<T extends { timestamp: string; itemId: string }>(enabled: boolean, base: T[] | undefined, fetchNewer: (after: string) => Promise<T[]>, resetKey: string) {
  const [extra, setExtra] = useState<T[]>([]);
  const busy = useRef(false);
  const latest = useRef<string | undefined>(undefined);
  useEffect(() => { setExtra([]); latest.current = undefined; }, [resetKey]);
  const merged = useMemo(() => {
    const seen = new Set<string>();
    return [...extra, ...(base ?? [])].filter((x) => (seen.has(x.itemId) ? false : (seen.add(x.itemId), true))).slice(0, 2000);
  }, [extra, base]);
  latest.current = merged[0]?.timestamp;
  useEffect(() => {
    if (!enabled) return;
    const tick = async () => {
      if (busy.current || document.hidden) return;
      busy.current = true;
      try {
        const after = latest.current ?? new Date(Date.now() - 5 * 60_000).toISOString();
        const newer = await fetchNewer(after);
        if (newer.length) setExtra((prev) => [...newer, ...prev].slice(0, 2000));
      } catch { /* a failed tick is retried on the next one */ } finally {
        busy.current = false;
      }
    };
    tick();
    const id = window.setInterval(tick, LIVE_EVERY);
    return () => window.clearInterval(id);
    // fetchNewer changes every render; resetKey captures its inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, resetKey]);
  return merged;
}

export function LogsTab({ component, range, role, initialSearch, onOpen, operationName, compact }: {
  component: Component; range: Range; role: string | null; initialSearch?: string; onOpen: (l: LogRow) => void; operationName?: string; compact?: boolean;
}) {
  const [search, setSearch] = useState(initialSearch ?? "");
  const [applied, setApplied] = useState(initialSearch ?? "");
  const [level, setLevel] = useState(0);
  const [live, setLive] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const key = `ailogs:${component.id}|${range}|${role ?? ""}|${level}|${applied}|${operationName ?? ""}`;
  const q = useQuery<LogRow[]>(key, () => api.ai.logs({ component, range, role, minSeverity: level, search: applied || undefined, operationName, limit: 500 }));
  const rows = useLiveTail(live, q.data, (after) => api.ai.logs({ component, range, role, minSeverity: level, search: applied || undefined, operationName, after, limit: 500 }), key);
  const sel = rows.find((r) => r.itemId === selected) ?? null;
  const scroller = useRef<HTMLDivElement>(null);
  const v = useVirtualizer({ count: rows.length, getScrollElement: () => scroller.current, estimateSize: () => 34, overscan: 16 });
  const [panelOpen, togglePanel, setPanelOpen] = usePanel("logs.detail");
  const cols: Col[] = [
    { key: "time", label: "Time", width: 96 },
    { key: "level", label: "Level", width: 86 },
    ...(compact ? [] : [{ key: "service", label: "Service", width: 170 }]),
    { key: "message", label: "Message", width: 0, flex: true, min: 200 },
  ];
  const columns = useColumns(compact ? "logs.compact" : "logs", cols);

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-5 py-2.5">
        <form className={compact ? "w-[260px]" : "w-[340px]"} onSubmit={(e) => { e.preventDefault(); setApplied(search.trim()); }}>
          <Field value={search} onChange={(v) => { setSearch(v); if (!v) setApplied(""); }} placeholder="Search messages or an operation id ↵" />
        </form>
        <Select value={level} onChange={setLevel} options={LEVELS} label="Severity" align="start" />
        <Tip content={G.ai.live} side="bottom">
          <span className="inline-flex items-center gap-2">
            <Switch checked={live} onChange={setLive} label="Live" />
            {live && <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-ok opacity-60" /><span className="relative inline-flex size-2 rounded-full bg-ok" /></span>}
          </span>
        </Tip>
        <span className="ml-auto text-[12px] text-fg-3">{q.loading ? <Spinner className="size-3" /> : `${rows.length}${rows.length >= 500 ? "+" : ""} entries, newest first`}</span>
        <PanelToggle open={panelOpen} onToggle={togglePanel} label="log details" />
      </div>
      {q.error ? (
        <Empty icon={<AlertTriangle />} title="Couldn't load logs">{q.error}</Empty>
      ) : !q.loading && !rows.length ? (
        <Empty icon={<MessageSquare />} title="No logs match">Try a longer time range, a lower severity or a different search.{live ? " New entries will appear here as they arrive." : ""}</Empty>
      ) : (
        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col">
          <div ref={scroller} className="min-h-0 flex-1 overflow-auto">
            <div style={{ minWidth: columns.total + 40 }}>
            <ColumnHeader cols={cols} columns={columns} className="px-5" />
            <div style={{ height: v.getTotalSize(), position: "relative" }}>
              {v.getVirtualItems().map((it) => {
                const r = rows[it.index];
                return (
                  <button
                    key={r.itemId}
                    onClick={() => { setSelected(r.itemId); setPanelOpen(true); }}
                    style={{ position: "absolute", top: 0, left: 0, right: 0, height: it.size, transform: `translateY(${it.start}px)`, gridTemplateColumns: columns.template }}
                    className={cn("grid items-center border-b border-line/50 px-5 text-left text-[12.5px] [&>*]:pr-3", selected === r.itemId ? "bg-bg-3" : "hover:bg-bg-2")}
                  >
                    <span className="truncate tabular text-fg-3">{new Date(r.timestamp).toLocaleTimeString(undefined, { hour12: false })}</span>
                    <span className="flex"><SeverityBadge item={r} /></span>
                    {!compact && <span className="truncate text-fg-3" title={r.cloud_RoleName}>{r.cloud_RoleName}</span>}
                    <span className={cn("min-w-0 truncate font-mono text-[12px]", r.itemType === "exception" ? "text-bad" : "text-fg-2")}>{oneLine(r.message)}</span>
                  </button>
                );
              })}
            </div>
            </div>
          </div>
          </div>
          <SidePanel id="logs.detail" open={!!sel && panelOpen} initial={440}>
            {sel && (
                <div className="h-full space-y-3 overflow-y-auto p-4">
                  <LogEntry item={{ ...sel, outerMessage: null, type: null }} />
                  <div className="grid grid-cols-[96px_1fr] gap-y-1.5 text-[12px]">
                    <span className="text-fg-3">Service</span><span className="selectable truncate text-fg-2">{sel.cloud_RoleName || "—"}</span>
                    <span className="text-fg-3">Operation</span><span className="selectable truncate text-fg-2">{sel.operation_Name || "—"}</span>
                    <span className="text-fg-3">Operation id</span><span className="selectable truncate font-mono text-fg-2">{sel.operation_Id || "—"}</span>
                  </div>
                  {sel.operation_Id && <Button onClick={() => onOpen(sel)}><ArrowUpRight /> Open its trace</Button>}
                  {sel.customDimensions && Object.keys(sel.customDimensions).length > 0 && (
                    <div>
                      <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-fg-3">Custom properties</div>
                      <div className="rounded-md border border-line bg-bg-1 p-1.5"><JsonTree value={deepParse(sel.customDimensions)} onCopy={(_, t) => copy(t)} /></div>
                    </div>
                  )}
                </div>
            )}
          </SidePanel>
        </div>
      )}
    </div>
  );
}
