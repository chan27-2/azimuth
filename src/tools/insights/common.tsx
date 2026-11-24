import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CalendarRange, Check, ChevronDown } from "lucide-react";
import { cn } from "../../lib/util";
import type { Component, Range, Trace, TraceItem } from "../../types";
import { api } from "../../lib/api";
import { fetchQuery, peekCache, useQuery } from "../../lib/query";
import { Button, Tip } from "../../ui/ui";
import * as G from "../../lib/glossary";
import { stored, store } from "../../lib/storage";

export const RANGES: { value: Range; label: string }[] = [
  { value: "30m", label: "Last 30 minutes" }, { value: "1h", label: "Last hour" }, { value: "6h", label: "Last 6 hours" },
  { value: "24h", label: "Last 24 hours" }, { value: "3d", label: "Last 3 days" }, { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" }, { value: "60d", label: "Last 60 days" }, { value: "90d", label: "Last 90 days" },
];
const PRESET_DAYS: Record<string, number> = { "30d": 30, "60d": 60, "90d": 90 };

export const isCustom = (r: Range) => r.startsWith("c:");
export function customRange(r: Range): { from: Date; to: Date } | null {
  const m = /^c:([^/]+)\/([^/]+)$/.exec(r);
  return m ? { from: new Date(m[1]), to: new Date(m[2]) } : null;
}
const short = (d: Date) => d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
export function rangeLabel(r: Range) {
  const c = customRange(r);
  return c ? `${short(c.from)} – ${short(c.to)}` : RANGES.find((x) => x.value === r)?.label ?? "Last 24 hours";
}

// One time range for all of Insights and Functions history, remembered between launches.
export function useRange(): [Range, (r: Range) => void] {
  const [range, setRange] = useState<Range>(() => stored("insights.range", "24h"));
  return [range, (r) => { setRange(r); store("insights.range", r); }];
}

// <input type="datetime-local"> works in local time without a zone; these convert both ways.
const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
const fromLocalInput = (s: string) => (s ? new Date(s) : null);

export function RangeSelect({ value, onChange, retentionDays, align = "end" }: { value: Range; onChange: (r: Range) => void; retentionDays?: number | null; align?: "start" | "end" }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"list" | "custom">("list");
  const current = customRange(value);
  const [from, setFrom] = useState(() => toLocalInput(current?.from ?? new Date(Date.now() - 864e5)));
  const [to, setTo] = useState(() => toLocalInput(current?.to ?? new Date()));
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onKey); };
  }, [open]);

  const f = fromLocalInput(from), t = fromLocalInput(to);
  const error = !f || !t ? "Pick both a start and an end." : f >= t ? "The start must be before the end." : f > new Date() ? "The start is in the future." : null;
  const beyond = retentionDays && f ? (Date.now() - f.getTime()) / 864e5 > retentionDays : false;
  const apply = () => { if (f && t && !error) { onChange(`c:${f.toISOString()}/${t.toISOString()}`); setOpen(false); } };
  const quick = (fromMs: number, toMs: number) => { setFrom(toLocalInput(new Date(fromMs))); setTo(toLocalInput(new Date(toMs))); };
  const midnight = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); })();

  return (
    <div ref={root} className="relative">
      <Tip content={open ? null : G.ai.range} side="bottom">
        <Button aria-haspopup="dialog" aria-expanded={open} aria-label="Time range" onClick={() => { setOpen(!open); setMode(isCustom(value) ? "custom" : "list"); }} className="gap-2 pl-3 pr-2.5">
          {isCustom(value) && <CalendarRange className="text-fg-3" />}
          <span className="text-fg">{rangeLabel(value)}</span>
          <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.15 }} className="flex text-fg-3"><ChevronDown /></motion.span>
        </Button>
      </Tip>
      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="Choose a time range"
            initial={{ opacity: 0, y: -4, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -2, scale: 0.98 }} transition={{ duration: 0.12 }}
            style={{ transformOrigin: align === "end" ? "top right" : "top left" }}
            className={cn("absolute top-[calc(100%+6px)] z-40 overflow-hidden rounded-lg border border-line-2 bg-bg-1 shadow-[0_12px_32px_rgba(0,0,0,0.55)]", align === "end" ? "right-0" : "left-0", mode === "custom" ? "w-[320px]" : "min-w-[220px]")}
          >
            {mode === "list" ? (
              <div className="p-1">
                {RANGES.map((o) => {
                  const over = retentionDays && PRESET_DAYS[o.value] > retentionDays;
                  return (
                    <button key={o.value} onClick={() => { onChange(o.value); setOpen(false); }} className={cn("flex h-8 w-full items-center gap-6 whitespace-nowrap rounded-md pl-2.5 pr-2 text-left text-[13px] hover:bg-bg-3", o.value === value ? "text-fg" : "text-fg-2")}>
                      <span className="flex-1">{o.label}</span>
                      {over && <span className="text-[11px] text-fg-3">beyond {retentionDays}-day retention</span>}
                      <Check className={cn("size-3.5", o.value === value ? "text-fg" : "invisible")} />
                    </button>
                  );
                })}
                <div className="my-1 h-px bg-line" />
                <button onClick={() => setMode("custom")} className={cn("flex h-8 w-full items-center gap-2 rounded-md pl-2.5 pr-2 text-left text-[13px] hover:bg-bg-3", isCustom(value) ? "text-fg" : "text-fg-2")}>
                  <CalendarRange className="size-3.5 text-fg-3" /><span className="flex-1">Custom range…</span>
                  <Check className={cn("size-3.5", isCustom(value) ? "text-fg" : "invisible")} />
                </button>
              </div>
            ) : (
              <form className="space-y-3 p-3" onSubmit={(e) => { e.preventDefault(); apply(); }}>
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-medium text-fg">Custom range</span>
                  <button type="button" onClick={() => setMode("list")} className="text-[12px] text-fg-3 hover:text-fg">Presets</button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {([["Today", midnight, Date.now()], ["Yesterday", midnight - 864e5, midnight], ["Last 14 days", Date.now() - 14 * 864e5, Date.now()], ["This month", new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime(), Date.now()]] as const).map(([label, a, b]) => (
                    <button key={label} type="button" onClick={() => quick(a, b)} className="h-6 rounded-md border border-line bg-bg px-2 text-[11.5px] text-fg-2 hover:border-line-2 hover:text-fg">{label}</button>
                  ))}
                </div>
                {([["From", from, setFrom], ["To", to, setTo]] as const).map(([label, v, set]) => (
                  <label key={label} className="block">
                    <span className="mb-1 block text-[11px] font-medium uppercase tracking-[0.08em] text-fg-3">{label}</span>
                    <input type="datetime-local" value={v} max={toLocalInput(new Date())} onChange={(e) => set(e.target.value)}
                      className="h-8 w-full rounded-md border border-line bg-bg px-2.5 font-mono text-[12.5px] text-fg outline-none [color-scheme:dark] focus:border-line-2" />
                  </label>
                ))}
                <div className="min-h-4 text-[11.5px]">
                  {error ? <span className="text-bad">{error}</span> : beyond ? <span className="text-warn">Starts before this resource's {retentionDays}-day retention, so the earliest part will be empty.</span> : <span className="text-fg-3">Your local time ({Intl.DateTimeFormat().resolvedOptions().timeZone}).</span>}
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button type="submit" variant="primary" disabled={!!error}>Apply</Button>
                </div>
              </form>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Loads one operation from a resource; "Look in other resources" widens it to every resource in the
// subscriptions that has the same operation id.
export function useTrace(component: Component | undefined, operationId: string | undefined, at?: string, subIds: string[] = []) {
  const key = component && operationId ? `aitrace:${component.id}|${operationId}` : null;
  const q = useQuery<Trace>(key, () => api.ai.trace({ component: component!, operationId: operationId!, at }));
  const [wide, setWide] = useState<{ state: "idle" | "searching" | "done"; trace?: Trace; error?: string }>({ state: "idle" });
  useEffect(() => setWide({ state: "idle" }), [key]);
  const widen = async () => {
    if (!operationId) return;
    setWide({ state: "searching" });
    const done = await searchTrace({ subIds: [...new Set([component?.subscriptionId, ...subIds].filter(Boolean) as string[])], operationId, at }, () => {});
    setWide(done.error ? { state: "idle", error: done.error } : { state: "done", trace: done.trace });
  };
  return { trace: wide.trace ?? q.data, loading: q.loading, error: q.error ?? wide.error, widen, wide: wide.state };
}

// ─── Find trace ───────────────────────────────────────────────────────────────
// Searches every Application Insights resource in the given subscriptions for one operation, reporting as
// it goes: first listing resources per subscription, then asking each resource, six at a time. A resource
// that has the operation returns its items in the same call, so the trace fills in as hits arrive.
export const SEARCH_CAP = 80;
const PARALLEL = 6;
export type ResourceState = "waiting" | "searching" | "found" | "none" | "failed";
export type TraceSearch = {
  phase: "listing" | "searching" | "done";
  operationId: string;
  subsTotal: number; subsListed: number; subsFailed: number;
  resources: { component: Component; state: ResourceState; n?: number }[];
  skipped: number; // resources beyond SEARCH_CAP
  trace?: Trace;
  error?: string;
};

export async function searchTrace(
  { subIds, operationId, at }: { subIds: string[]; operationId: string; at?: string },
  onUpdate: (s: TraceSearch) => void,
  cancelled: () => boolean = () => false,
): Promise<TraceSearch> {
  let s: TraceSearch = { phase: "listing", operationId, subsTotal: subIds.length, subsListed: 0, subsFailed: 0, resources: [], skipped: 0 };
  const set = (patch: Partial<TraceSearch>) => { s = { ...s, ...patch }; if (!cancelled()) onUpdate(s); };
  set({});

  // Resource lists share the sidebar's cache, so subscriptions already expanded there are instant.
  const found: Component[] = [];
  await Promise.all(subIds.map(async (sub) => {
    await fetchQuery(`aicomp:${sub}`, () => api.ai.components(sub));
    const cs = peekCache<Component[]>(`aicomp:${sub}`);
    if (cs) found.push(...cs);
    set({ subsListed: s.subsListed + 1, subsFailed: s.subsFailed + (cs ? 0 : 1) });
  }));
  const all = found.slice(0, SEARCH_CAP);
  set({ phase: "searching", resources: all.map((component) => ({ component, state: "waiting" })), skipped: found.length - all.length });

  const items = new Map<string, TraceItem>();
  const mark = (i: number, state: ResourceState, n?: number) => set({ resources: s.resources.map((r, k) => (k === i ? { ...r, state, n } : r)) });
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(PARALLEL, all.length) }, async () => {
    while (next < all.length && !cancelled() && !s.error) {
      const i = next++;
      mark(i, "searching");
      try {
        const t = await api.ai.trace({ component: all[i], operationId, at, search: true });
        for (const x of t.items) items.set(x.itemId || `${x.timestamp}|${x.itemType}|${items.size}`, x);
        if (t.items.length) {
          const merged = [...items.values()].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
          set({ operationId: t.operationId, trace: { operationId: t.operationId, items: merged } });
        }
        mark(i, t.items.length ? "found" : "none", t.items.length);
      } catch (e) {
        // A malformed id fails the same way everywhere, so stop at the first one.
        if ((e as { code?: string }).code === "BAD_INPUT") set({ error: (e as Error).message });
        mark(i, "failed");
      }
    }
  }));
  set({ phase: "done" });
  return s;
}

// Searches are kept for the session, so going back to a finished search doesn't run it again.
const searches = new Map<string, TraceSearch>();
export function useTraceSearch(subIds: string[], operationId: string, at?: string) {
  const key = `${operationId}|${at ?? ""}|${subIds.join(",")}`;
  const [state, setState] = useState<TraceSearch | undefined>(() => searches.get(key));
  useEffect(() => {
    const done = searches.get(key);
    if (done) { setState(done); return; }
    let stop = false;
    searchTrace({ subIds, operationId, at }, setState, () => stop).then((r) => { if (!stop && !r.error) searches.set(key, r); });
    return () => { stop = true; };
    // The key covers every input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}
