import { useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { AlertTriangle, Inbox, X } from "lucide-react";
import type { Component, Range, RequestRow } from "../../types";
import { api } from "../../lib/api";
import { useQuery } from "../../lib/query";
import { cn, fmtMs, fmtTime } from "../../lib/util";
import { Button, Chip, Empty, Field, Select, Spinner, Switch, Tip } from "../../ui/ui";
import * as G from "../../lib/glossary";

const DURATIONS = [
  { value: 0, label: "Any duration" }, { value: 100, label: "≥ 100ms" }, { value: 500, label: "≥ 500ms" },
  { value: 1000, label: "≥ 1s" }, { value: 5000, label: "≥ 5s" }, { value: 30000, label: "≥ 30s" },
];

export function RequestsTab({ component, range, role, name, onClearName, onOpen }: {
  component: Component; range: Range; role: string | null; name?: string; onClearName: () => void; onOpen: (r: RequestRow) => void;
}) {
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState("");
  const [failedOnly, setFailedOnly] = useState(false);
  const [minDuration, setMinDuration] = useState(0);
  const key = `aireq:${component.id}|${range}|${role ?? ""}|${name ?? ""}|${failedOnly}|${minDuration}|${applied}`;
  const q = useQuery<RequestRow[]>(key, () => api.ai.requests({ component, range, role, name, failedOnly, minDuration, search: applied || undefined, limit: 500 }));
  const rows = q.data ?? [];
  const max = Math.max(1, ...rows.map((r) => r.duration));
  const scroller = useRef<HTMLDivElement>(null);
  const v = useVirtualizer({ count: rows.length, getScrollElement: () => scroller.current, estimateSize: () => 36, overscan: 12 });

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-5 py-2.5">
        <form className="w-[340px]" onSubmit={(e) => { e.preventDefault(); setApplied(search.trim()); }}>
          <Field value={search} onChange={(v) => { setSearch(v); if (!v) setApplied(""); }} placeholder="Operation id, name, URL or result code ↵" />
        </form>
        {name && <Chip className="pr-0.5">{name}<Button variant="ghost" size="icon-sm" aria-label="Clear operation filter" className="size-5" onClick={onClearName}><X /></Button></Chip>}
        <Select value={minDuration} onChange={setMinDuration} options={DURATIONS} label="Minimum duration" align="start" />
        <Switch checked={failedOnly} onChange={setFailedOnly} label="Failed only" />
        <span className="ml-auto text-[12px] text-fg-3">{q.loading ? <Spinner className="size-3" /> : `${rows.length}${rows.length >= 500 ? "+" : ""} requests, newest first`}</span>
      </div>
      {q.error ? (
        <Empty icon={<AlertTriangle />} title="Couldn't load requests">{q.error}</Empty>
      ) : !q.loading && !rows.length ? (
        <Empty icon={<Inbox />} title="No requests match">Try a longer time range or fewer filters.</Empty>
      ) : (
        <>
          <div className="grid shrink-0 grid-cols-[150px_64px_minmax(0,1fr)_180px_120px] gap-3 border-b border-line px-5 py-1.5 text-[11px] text-fg-3">
            <span>Time</span><span>Result</span><span>Name</span><span>Service</span><span className="text-right">Duration</span>
          </div>
          <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
            <div style={{ height: v.getTotalSize(), position: "relative" }}>
              {v.getVirtualItems().map((it) => {
                const r = rows[it.index];
                const failed = r.success.toLowerCase() === "false";
                return (
                  <button
                    key={r.id + it.index}
                    onClick={() => onOpen(r)}
                    style={{ position: "absolute", top: 0, left: 0, right: 0, height: it.size, transform: `translateY(${it.start}px)` }}
                    className="grid grid-cols-[150px_64px_minmax(0,1fr)_180px_120px] items-center gap-3 border-b border-line/50 px-5 text-left text-[12.5px] hover:bg-bg-2"
                  >
                    <span className="tabular text-fg-3">{fmtTime(r.timestamp)}</span>
                    <span className={cn("flex items-center gap-1.5 tabular", failed ? "text-bad" : "text-fg-2")}><span className={cn("size-1.5 rounded-full", failed ? "bg-bad" : "bg-ok")} />{r.resultCode}</span>
                    <span className="min-w-0 truncate text-fg" title={r.url || r.name}>{r.name}</span>
                    <span className="min-w-0 truncate text-fg-3" title={r.cloud_RoleName}>{r.cloud_RoleName}</span>
                    <span className="flex items-center justify-end gap-2">
                      <span className="h-1 w-12 overflow-hidden rounded-full bg-bg-3"><span className={cn("block h-full rounded-full", failed ? "bg-bad" : "bg-fg-3")} style={{ width: `${Math.max(4, (r.duration / max) * 100)}%` }} /></span>
                      <span className="w-14 text-right tabular text-fg-2">{fmtMs(r.duration)}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="shrink-0 border-t border-line px-5 py-1.5 text-[11.5px] text-fg-3">
            <Tip content={G.ai.requests}><span>Click a request to open its whole operation as a waterfall.</span></Tip>
          </div>
        </>
      )}
    </div>
  );
}
