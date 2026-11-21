import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowUpRight, Lock, Play, RefreshCw, SearchX, Zap } from "lucide-react";
import type { Component, Fn, FnAccess, FnStats, FunctionApp, Invocation, InsightsLink, Range } from "../../types";
import { api } from "../../lib/api";
import { invalidate, useQuery } from "../../lib/query";
import { ago, cn, compact, envOf, fmtMs, fmtTime, pct } from "../../lib/util";
import * as G from "../../lib/glossary";
import { Breadcrumbs, Button, Chip, CopyButton, Empty, EnvBadge, Header, NoDrag, Select, Spinner, Switch, Tip } from "../../ui/ui";
import { FunctionsGlyph, InsightsGlyph } from "../../ui/Logo";
import { useNav, type Place } from "../../shell/nav";
import { RangeSelect, useRange, useTrace } from "../insights/common";
import { TraceView } from "../insights/TraceView";
import { LogsTab } from "../insights/LogsTab";
import { triggerIcon, triggerSummary, useFnLink } from "./common";
import { RunPanel } from "./RunPanel";
import { ResizablePane, Th, useColumns, type Col } from "../../ui/resize";

const FN_COLS: Col[] = [
  { key: "name", label: "Function", width: 300 },
  { key: "trigger", label: "Trigger", width: 300 },
  { key: "runs", label: "Runs", width: 84, align: "right" },
  { key: "failed", label: "Failed", width: 84, align: "right" },
  { key: "p95", label: "p95", width: 84, align: "right" },
  { key: "last", label: "Last run", width: 110, align: "right" },
];

export function FunctionsView({ place }: { place: Extract<Place, { tool: "fn" }> }) {
  if (!place.app) {
    return (
      <div className="flex h-full flex-col">
        <Header><span className="text-[13px] font-medium text-fg">Azure Functions</span></Header>
        <Empty icon={<FunctionsGlyph className="size-4" />} title="Pick a function app">
          See every function and what triggers it, how often it ran and failed, its logs, and the full trace of any invocation. Run a function with confirmation when you have access.
        </Empty>
      </div>
    );
  }
  return <AppScope key={place.app.id} app={place.app} fn={place.fn} />;
}

function AppScope({ app, fn }: { app: FunctionApp; fn?: string }) {
  const fns = useQuery<Fn[]>(`fns:${app.id}`, () => api.fn.functions(app));
  const access = useQuery<FnAccess>(`fnaccess:${app.id}`, () => api.fn.access(app));
  const link = useFnLink(app, fns.data);
  const [range, setRange] = useRange();
  const f = fns.data?.find((x) => x.name === fn);
  const common = { app, fns: fns.data, access: access.data, link: link.link, linkLoading: link.loading, range, setRange };
  if (fn) {
    if (fns.loading && !fns.data) return <Frame {...common} fn={fn}><div className="flex h-full items-center justify-center gap-2 text-[13px] text-fg-3"><Spinner /> Loading</div></Frame>;
    if (!f) return <Frame {...common} fn={fn}><Empty icon={<SearchX />} title={`${fn} isn't in ${app.name}`}>{fns.error ?? "It may have been renamed or removed."}</Empty></Frame>;
    return <FunctionPage {...common} f={f} />;
  }
  return <AppPage {...common} fnsError={fns.error} fnsLoading={fns.loading} onChooseLink={link.choose} linkError={link.error} />;
}

type Common = { app: FunctionApp; fns?: Fn[]; access?: FnAccess; link: InsightsLink | null; linkLoading: boolean; range: Range; setRange: (r: Range) => void };

function Frame({ app, fn, link, range, setRange, actions, children }: Common & { fn?: string; actions?: ReactNode; children: ReactNode }) {
  const { go } = useNav();
  const env = envOf(app.name);
  return (
    <div className="relative flex h-full flex-col">
      <Header>
        <Breadcrumbs items={[
          { label: "Functions", onClick: () => go({ tool: "fn", app: undefined }), tip: { title: "Functions", body: "All function apps." } },
          ...(fn ? [{ label: app.name, icon: <FunctionsGlyph className="size-3.5" />, onClick: () => go({ tool: "fn", app }), tip: { title: `Back to ${app.name}`, body: "All functions in the app, their numbers and live logs." } }] : []),
          fn ? { label: fn, icon: <Zap /> } : { label: app.name, icon: <FunctionsGlyph className="size-3.5" /> },
        ]} />
        <Tip content={G.env[env]}><EnvBadge env={env} /></Tip>
        {app.state !== "Running" && <Chip tone="warn">{app.state}</Chip>}
        <NoDrag className="ml-auto">
          <RangeSelect value={range} onChange={setRange} />
          <Tip content="Load again" side="bottom">
            <Button variant="ghost" size="icon" aria-label="Refresh" onClick={() => invalidate((k) => k.includes(app.id) || (!!link && k.startsWith("ai") && !k.startsWith("aicomp:") && k.includes(link.component.id)))}><RefreshCw /></Button>
          </Tip>
          {actions}
        </NoDrag>
      </Header>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}

function LinkInfo({ app, link, loading, onChoose, error }: { app: FunctionApp; link: InsightsLink | null; loading: boolean; onChoose?: (c: Component | null) => void; error?: string }) {
  const { go } = useNav();
  const comps = useQuery<Component[]>(onChoose ? `aicomp:${app.subscriptionId}` : null, () => api.ai.components(app.subscriptionId));
  if (loading) return <span className="flex items-center gap-1.5 text-fg-3"><Spinner className="size-3" /> Finding its Application Insights…</span>;
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <InsightsGlyph className="size-3.5 shrink-0" />
      {link ? (
        <Tip content={{ title: `Telemetry from ${link.component.name}${link.role ? `, service ${link.role}` : ""}`, body: G.fn.link(link.via) }}>
          <button onClick={() => go({ tool: "ai", component: link.component })} className="truncate text-fg-2 hover:text-fg">{link.component.name}{link.role && link.role !== app.name ? <span className="text-fg-3"> · {link.role}</span> : null}</button>
        </Tip>
      ) : (
        <span className="text-warn">{error ?? "No Application Insights found"}</span>
      )}
      {onChoose && comps.data && (
        <Select<string>
          value={link?.via === "manual" ? link.component.id : ""}
          onChange={(id) => onChoose(comps.data!.find((c) => c.id === id) ?? null)}
          label="Choose Application Insights resource"
          align="start"
          options={[{ value: "", label: link && link.via !== "manual" ? "Automatic" : "Choose…" }, ...comps.data.map((c) => ({ value: c.id, label: c.name }))]}
        />
      )}
    </span>
  );
}

// ─── App page ─────────────────────────────────────────────────────────────────
function AppPage(p: Common & { fnsError?: string; fnsLoading: boolean; onChooseLink: (c: Component | null) => void; linkError?: string }) {
  const { app, fns, link, range } = p;
  const { go } = useNav();
  const names = useMemo(() => fns?.map((f) => f.name) ?? [], [fns]);
  const stats = useQuery<FnStats[]>(link && names.length ? `fnstats:${app.id}|${link.component.id}|${link.role ?? ""}|${range}` : null, () => api.fn.stats({ link: link!, functionNames: names, range }));
  const byName = new Map((stats.data ?? []).map((s) => [s.name.toLowerCase(), s]));
  const columns = useColumns("fn.functions", FN_COLS);
  return (
    <Frame {...p}>
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-1 border-b border-line px-5 py-2.5 text-[12px] text-fg-3">
          <span className="flex items-center gap-1"><span className="selectable font-mono text-fg-2">{app.hostName}</span><CopyButton text={`https://${app.hostName}`} label="Copy URL" /></span>
          <span>{app.plan ?? "Unknown plan"} · {app.linux ? "Linux" : "Windows"} · {app.location}</span>
          <LinkInfo app={app} link={link} loading={p.linkLoading} onChoose={p.onChooseLink} error={p.linkError} />
          {p.access && !p.access.run && <Tip content={{ title: "Read-only here", body: G.fn.noRunAccess }}><span className="flex items-center gap-1 text-fg-3"><Lock className="size-3" />Read-only</span></Tip>}
        </div>
        <div className="max-h-[48%] shrink-0 overflow-auto border-b border-line">
          {p.fnsLoading && !fns ? (
            <div className="flex items-center gap-2 px-5 py-6 text-[13px] text-fg-3"><Spinner /> Loading functions</div>
          ) : p.fnsError ? (
            <div className="px-5 py-6 text-[13px] text-bad">{p.fnsError}</div>
          ) : (
            <table className="w-full table-fixed text-[12.5px]" style={{ minWidth: columns.total }}>
              <thead className="sticky top-0 z-10 bg-bg text-[11px] text-fg-3">
                <tr className="border-b border-line">
                  <Th col={FN_COLS[0]} columns={columns} className="py-1.5 pl-5 pr-2" />
                  <Th col={FN_COLS[1]} columns={columns} className="px-2 py-1.5" />
                  <Th col={FN_COLS[2]} columns={columns} className="px-2 py-1.5" />
                  <Th col={FN_COLS[3]} columns={columns} className="px-2 py-1.5" />
                  <Th col={FN_COLS[4]} columns={columns} className="px-2 py-1.5"><Tip content={G.ai.p95}><span>p95</span></Tip></Th>
                  <Th col={FN_COLS[5]} columns={columns} className="px-2 py-1.5" />
                  <th />
                </tr>
              </thead>
              <tbody>
                {fns?.map((f) => {
                  const s = byName.get(f.name.toLowerCase());
                  return (
                    <tr key={f.name} onClick={() => go({ tool: "fn", app, fn: f.name })} className={cn("cursor-default border-b border-line/60 last:border-0 hover:bg-bg-2", f.disabled && "opacity-60")}>
                      <td className="py-2 pl-5 pr-2">
                        <span className="flex min-w-0 items-center gap-2 text-fg"><span className="flex shrink-0 text-fg-3 [&_svg]:size-3.5">{triggerIcon(f.trigger.type)}</span><span className="truncate">{f.name}</span>{f.disabled && <span className="text-[10px] uppercase tracking-wider text-fg-3">disabled</span>}</span>
                      </td>
                      <td className="truncate px-2 py-2 text-fg-3"><Tip content={G.fn.trigger(f.trigger.type)}><span className="truncate">{triggerSummary(f)}</span></Tip></td>
                      <td className="px-2 py-2 text-right tabular text-fg-2">{stats.loading ? "·" : s ? compact(s.n) : "—"}</td>
                      <td className={cn("px-2 py-2 text-right tabular", s?.failed ? "text-bad" : "text-fg-3")}>{s?.failed ? pct(s.failed, s.n) : "—"}</td>
                      <td className="px-2 py-2 text-right tabular text-fg-2">{s ? fmtMs(s.p95) : "—"}</td>
                      <td className="px-2 py-2 text-right tabular text-fg-3">{s ? ago(s.lastRun) : "—"}</td>
                      <td />
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {stats.error && <div className="px-5 py-2 text-[12px] text-bad">{stats.error}</div>}
        </div>
        <div className="min-h-0 flex-1">
          {link ? (
            <LogsTab component={link.component} range={range} role={link.role} compact onOpen={(l) => go({ tool: "ai", component: link.component, trace: { operationId: l.operation_Id, at: l.timestamp } })} />
          ) : !p.linkLoading ? (
            <Empty icon={<InsightsGlyph className="size-4" />} title="No logs to show">Azimuth couldn't work out which Application Insights resource this app sends telemetry to. Choose it above and Azimuth will remember.</Empty>
          ) : null}
        </div>
      </div>
    </Frame>
  );
}

// ─── Function page ────────────────────────────────────────────────────────────
function FunctionPage(p: Common & { f: Fn }) {
  const { app, f, link, range, access } = p;
  const { subs, go } = useNav();
  const [failedOnly, setFailedOnly] = useState(false);
  const [selected, setSelected] = useState<Invocation | null>(null);
  const [running, setRunning] = useState(false);
  const [fresh, setFresh] = useState<Invocation | null>(null);
  const invKey = link ? `fninv:${app.id}|${f.name}|${link.component.id}|${link.role ?? ""}|${range}|${failedOnly}` : null;
  const inv = useQuery<Invocation[]>(invKey, () => api.fn.invocations({ link: link!, fn: f.name, range, failedOnly }));
  const list = useMemo(() => (fresh && !inv.data?.some((i) => i.operation_Id === fresh.operation_Id) ? [fresh, ...(inv.data ?? [])] : inv.data ?? []), [inv.data, fresh]);
  useEffect(() => { if (!selected && list.length) setSelected(list[0]); }, [list, selected]);
  const trace = useTrace(link?.component, selected?.operation_Id, selected?.timestamp, subs.map((s) => s.id));
  const stats = useQuery<FnStats[]>(link ? `fnstats:${app.id}|${link.component.id}|${link.role ?? ""}|${range}|${f.name}` : null, () => api.fn.stats({ link: link!, functionNames: [f.name], range }));
  const s = stats.data?.[0];
  const scroller = useRef<HTMLDivElement>(null);
  const v = useVirtualizer({ count: list.length, getScrollElement: () => scroller.current, estimateSize: () => 44, overscan: 10 });

  const canRun = !!access?.run && f.runnable && !f.disabled && app.state === "Running";
  const why = !access ? "Checking your permissions…" : !access.run ? G.fn.noRunAccess : !f.runnable ? G.fn.trigger(f.trigger.type).body : f.disabled ? G.fn.disabled : app.state !== "Running" ? `${app.name} is ${app.state.toLowerCase()}.` : G.fn.run.body;

  const details = Object.entries(f.trigger).filter(([k]) => k !== "type");
  return (
    <Frame
      {...p}
      fn={f.name}
      actions={
        <Tip content={{ title: canRun ? "Run this function" : "Can't run", body: why }} side="bottom">
          <Button variant={canRun ? "primary" : "secondary"} onClick={() => setRunning(true)} disabled={!canRun}><Play /> Run</Button>
        </Tip>
      }
    >
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-5 py-2.5">
          <Tip content={G.fn.trigger(f.trigger.type)}><Chip><span className="flex [&_svg]:size-3">{triggerIcon(f.trigger.type)}</span>{G.fn.trigger(f.trigger.type).title}</Chip></Tip>
          <span className="text-[12.5px] text-fg-2">{triggerSummary(f)}</span>
          {f.http && <Tip content={{ title: `Auth level: ${f.http.authLevel}`, body: G.fn.authLevel(f.http.authLevel) }}><Chip>{f.http.authLevel}</Chip></Tip>}
          {details.filter(([k]) => !["schedule", "route", "methods", "authLevel"].includes(k)).slice(0, 4).map(([k, val]) => <Chip key={k} className="font-mono text-[11px]"><span className="text-fg-3">{k}</span>{String(val)}</Chip>)}
          {f.disabled && <Tip content={G.fn.disabled}><Chip tone="warn">Disabled</Chip></Tip>}
          <span className="ml-auto flex items-center gap-4 text-[12px] text-fg-3">
            {s ? (
              <>
                <span><span className="tabular text-fg-2">{compact(s.n)}</span> runs</span>
                <span className={s.failed ? "text-bad" : ""}><span className="tabular">{pct(s.failed, s.n)}</span> failed</span>
                <Tip content={G.ai.p50}><span>p50 <span className="tabular text-fg-2">{fmtMs(s.p50)}</span></span></Tip>
                <Tip content={G.ai.p95}><span>p95 <span className="tabular text-fg-2">{fmtMs(s.p95)}</span></span></Tip>
              </>
            ) : stats.loading ? <Spinner className="size-3" /> : null}
          </span>
        </div>
        {!link ? (
          p.linkLoading ? <div className="flex flex-1 items-center justify-center gap-2 text-[13px] text-fg-3"><Spinner /> Finding its Application Insights…</div>
          : <Empty icon={<InsightsGlyph className="size-4" />} title="No invocation history">Choose this app's Application Insights resource on the app page and Azimuth will remember it.</Empty>
        ) : (
          <div className="flex min-h-0 flex-1">
            <ResizablePane id="fn.invocations" initial={320} min={220} max={640} className="flex flex-col border-r border-line">
              <div className="flex h-10 shrink-0 items-center justify-between border-b border-line px-4 text-[12px] text-fg-3">
                <Tip content={G.fn.invocation}><span>{inv.loading ? "Loading…" : `${list.length}${list.length >= 300 ? "+" : ""} invocations`}</span></Tip>
                <Switch checked={failedOnly} onChange={(x) => { setFailedOnly(x); setSelected(null); }} label="Failed only" />
              </div>
              {inv.error ? (
                <div className="p-4 text-[12.5px] text-bad">{inv.error}</div>
              ) : !inv.loading && !list.length ? (
                <div className="p-6 text-center text-[12.5px] leading-relaxed text-fg-3">No invocations recorded in this time range{failedOnly ? " that failed" : ""}. {f.runnable ? "" : G.fn.trigger(f.trigger.type).body}</div>
              ) : (
                <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
                  <div style={{ height: v.getTotalSize(), position: "relative" }}>
                    {v.getVirtualItems().map((it) => {
                      const x = list[it.index];
                      const failed = x.success.toLowerCase() === "false";
                      const isSel = selected?.operation_Id === x.operation_Id && selected?.id === x.id;
                      return (
                        <button key={x.id + it.index} onClick={() => setSelected(x)} style={{ position: "absolute", top: 0, left: 0, right: 0, height: it.size, transform: `translateY(${it.start}px)` }}
                          className={cn("flex items-center gap-3 border-b border-line/50 px-4 text-left", isSel ? "bg-bg-3" : "hover:bg-bg-2")}>
                          <span className={cn("size-2 shrink-0 rounded-full", failed ? "bg-bad" : "bg-ok")} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12.5px] text-fg">{fmtTime(x.timestamp)}{fresh?.operation_Id === x.operation_Id && <span className="ml-2 rounded bg-accent/15 px-1 text-[10px] font-semibold uppercase tracking-wider text-accent">your run</span>}</span>
                            <span className="block truncate text-[11.5px] text-fg-3">{ago(x.timestamp)} · result {x.resultCode || "—"}{x.cloud_RoleInstance ? ` · ${x.cloud_RoleInstance}` : ""}</span>
                          </span>
                          <span className={cn("shrink-0 text-[12px] tabular", failed ? "text-bad" : "text-fg-2")}>{fmtMs(x.duration)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </ResizablePane>
            <div className="min-w-0 flex-1">
              {selected ? (
                <TraceView items={trace.trace?.items} operationId={selected.operation_Id} loading={trace.loading} error={trace.error} onSearchWider={trace.widen} wider={trace.wide}
                  actions={<Tip content="Open in Insights, with the resource's other tabs"><Button variant="ghost" size="icon" aria-label="Open in Insights" onClick={() => go({ tool: "ai", component: link.component, trace: { operationId: selected.operation_Id, at: selected.timestamp } })}><ArrowUpRight /></Button></Tip>} />
              ) : (
                <Empty icon={<Zap />} title="Pick an invocation">See every call it made, every log line and any exception, in order.</Empty>
              )}
            </div>
          </div>
        )}
      </div>
      <AnimatePresence>
        {running && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="absolute inset-0 top-[52px] z-30 flex justify-end bg-black/40" onMouseDown={() => setRunning(false)}>
            <motion.div initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }} transition={{ type: "spring", bounce: 0, duration: 0.3 }} onMouseDown={(e) => e.stopPropagation()} className="h-full w-[540px] max-w-full border-l border-line bg-bg shadow-[-24px_0_48px_rgba(0,0,0,0.45)]">
              <RunPanel app={app} f={f} link={link} onClose={() => setRunning(false)} onFound={(x) => { setFresh(x); setSelected(x); setFailedOnly(false); }} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Frame>
  );
}
