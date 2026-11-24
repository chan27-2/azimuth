import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Radar, RefreshCw, SearchX } from "lucide-react";
import type { Component, Overview } from "../../types";
import { api } from "../../lib/api";
import { invalidate, useQuery } from "../../lib/query";
import { envOf, fmtTime } from "../../lib/util";
import * as G from "../../lib/glossary";
import { Breadcrumbs, Button, Empty, EnvBadge, Header, NoDrag, Select, Spinner, Tabs, Tip } from "../../ui/ui";
import { InsightsGlyph } from "../../ui/Logo";
import { useNav, type InsightsTab, type Place, type TraceTarget } from "../../shell/nav";
import { RangeSelect, SEARCH_CAP, useRange, useTrace, useTraceSearch, type ResourceState, type TraceSearch } from "./common";
import { TraceView } from "./TraceView";
import { OverviewTab } from "./OverviewTab";
import { RequestsTab } from "./RequestsTab";
import { LogsTab } from "./LogsTab";
import { QueryTab } from "./QueryTab";

export function InsightsView({ place }: { place: Extract<Place, { tool: "ai" }> }) {
  if (place.component) return <ComponentView key={place.component.id} place={place as Extract<Place, { tool: "ai" }> & { component: Component }} />;
  if (place.trace) return <TraceFinder target={place.trace} />;
  return (
    <div className="flex h-full flex-col">
      <Header><span className="text-[13px] font-medium text-fg">Application Insights</span></Header>
      <Empty icon={<InsightsGlyph className="size-4" />} title="Pick an Application Insights resource">
        See requests, failures and logs, open any operation as a waterfall, or write KQL. To follow a single operation, paste its id into Find trace.
      </Empty>
    </div>
  );
}

// The tab, an operation or exception filter and an open trace all live in the place, so back and
// forward step through them like pages.
function ComponentView({ place }: { place: Extract<Place, { tool: "ai" }> & { component: Component } }) {
  const { go } = useNav();
  const component = place.component;
  const tab: InsightsTab = place.tab ?? "overview";
  const trace = place.trace ?? null;
  const opFilter = place.op;
  const logSearch = place.logSearch;
  const setTab = (t: InsightsTab) => go({ tool: "ai", component, tab: t, op: t === "requests" ? opFilter : undefined, logSearch: t === "logs" ? logSearch : undefined });
  const setTrace = (t: TraceTarget | null) => go({ ...place, trace: t ?? undefined });
  const [range, setRange] = useRange();
  const [role, setRole] = useState<string | null>(null);
  const env = envOf(component.name);
  // Roles come from the unfiltered overview, so the list doesn't shrink to the selected role.
  const roles = useQuery<Overview>(`aiov:${component.id}|${range}|`, () => api.ai.overview({ component, range, role: null }));
  const refresh = () => invalidate((k) => k.startsWith("ai") && !k.startsWith("aicomp:") && k.includes(component.id));

  return (
    <div className="relative flex h-full flex-col">
      <Header>
        <Breadcrumbs items={[
          { label: "Insights", onClick: () => go({ tool: "ai", component: undefined }), tip: { title: "Application Insights", body: "All resources, and Find trace." } },
          trace
            ? { label: component.name, icon: <InsightsGlyph className="size-3.5" />, onClick: () => setTrace(null), tip: { title: `Back to ${component.name}`, body: "Closes the trace. Esc does the same." } }
            : { label: component.name, icon: <InsightsGlyph className="size-3.5" /> },
          ...(trace ? [{ label: `Trace ${trace.operationId.slice(0, 8)}…`, icon: <Radar /> }] : []),
        ]} />
        <Tip content={G.env[env]}><EnvBadge env={env} /></Tip>
        <NoDrag className="ml-auto">
          {(roles.data?.roles.length ?? 0) > 1 && (
            <Tip content={G.ai.roleFilter} side="bottom">
              <Select value={role ?? ""} onChange={(v) => setRole(v || null)} label="Service" options={[{ value: "", label: "All services" }, ...roles.data!.roles.map((r) => ({ value: r, label: r }))]} />
            </Tip>
          )}
          <RangeSelect value={range} onChange={setRange} retentionDays={component.retentionDays} />
          <Tip content="Run the queries again" side="bottom"><Button variant="ghost" size="icon" aria-label="Refresh" onClick={refresh}><RefreshCw /></Button></Tip>
        </NoDrag>
      </Header>
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-line px-5">
        <Tabs id="ai-tab" value={tab} onChange={setTab} items={[{ value: "overview", label: "Overview" }, { value: "requests", label: "Requests" }, { value: "logs", label: "Logs" }, { value: "query", label: "Query" }]} />
        {component.samplingPercentage != null && component.samplingPercentage < 100 && (
          <Tip content={{ title: `Sampling at ${component.samplingPercentage}%`, body: G.ai.sampling }}><span className="cursor-help text-[12px] text-warn">Sampled {component.samplingPercentage}%</span></Tip>
        )}
        <span className="ml-auto text-[12px] text-fg-3">{component.location} · {component.workspace ? `workspace ${component.workspace}` : "classic"}{component.retentionDays ? ` · ${component.retentionDays}-day retention` : ""}</span>
      </div>
      <div className="min-h-0 flex-1">
        {tab === "overview" && (
          <OverviewTab component={component} range={range} role={role}
            onOperation={(name) => go({ tool: "ai", component, tab: "requests", op: name })}
            onException={(type) => go({ tool: "ai", component, tab: "logs", logSearch: type })}
            onRange={setRange} />
        )}
        {tab === "requests" && <RequestsTab component={component} range={range} role={role} name={opFilter} onClearName={() => go({ tool: "ai", component, tab: "requests" })} onOpen={(r) => setTrace({ operationId: r.operation_Id, at: r.timestamp })} />}
        {tab === "logs" && <LogsTab key={logSearch ?? ""} component={component} range={range} role={role} initialSearch={logSearch} onOpen={(l) => setTrace({ operationId: l.operation_Id, at: l.timestamp })} />}
        {tab === "query" && <QueryTab component={component} range={range} onOpenTrace={(operationId, at) => setTrace({ operationId, at })} />}
      </div>
      <AnimatePresence>
        {trace && (
          <motion.div
            initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }} transition={{ type: "spring", bounce: 0, duration: 0.3 }}
            className="absolute inset-x-0 bottom-0 top-[52px] z-20 border-t border-line bg-bg shadow-[-24px_0_48px_rgba(0,0,0,0.4)]"
          >
            <ComponentTrace component={component} target={trace} onClose={() => setTrace(null)} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ComponentTrace({ component, target, onClose }: { component: Component; target: TraceTarget; onClose: () => void }) {
  const { subs } = useNav();
  const t = useTrace(component, target.operationId, target.at, target.subIds ?? subs.map((s) => s.id));
  return <TraceView items={t.trace?.items} operationId={t.trace?.operationId ?? target.operationId} loading={t.loading} error={t.error} onClose={onClose} onSearchWider={t.widen} wider={t.wide} />;
}

// Find trace: search every resource in the given subscriptions, showing what it's doing as it goes,
// and the operation stitched together from every resource that has part of it.
function TraceFinder({ target }: { target: TraceTarget }) {
  const { subs, go } = useNav();
  const subIds = target.subIds?.length ? target.subIds : subs.map((s) => s.id);
  const s = useTraceSearch(subIds, target.operationId, target.at);
  const hits = s?.resources.filter((r) => r.state === "found") ?? [];
  const where = target.at ? `around ${fmtTime(target.at)}` : "over the last 7 days";
  const failed = s?.resources.filter((r) => r.state === "failed").length ?? 0;

  return (
    <div className="flex h-full flex-col">
      <Header>
        <Breadcrumbs items={[
          { label: "Insights", onClick: () => go({ tool: "ai", component: undefined }), tip: { title: "Application Insights", body: "All resources." } },
          { label: "Find trace", icon: <Radar /> },
        ]} />
        {hits.length > 0 && (
          <NoDrag className="ml-auto truncate text-[12px] text-fg-3">
            Found in {hits.map((h, i) => (
              <span key={h.component.id}>{i > 0 && ", "}<button className="text-fg-2 hover:text-fg" onClick={() => go({ tool: "ai", component: h.component })}>{h.component.name}</button></span>
            ))}
          </NoDrag>
        )}
      </Header>
      <div className="flex min-h-0 flex-1 flex-col">
        {s?.trace ? (
          <>
            {s.phase !== "done" && <SearchStrip s={s} />}
            <div className="min-h-0 flex-1"><TraceView items={s.trace.items} operationId={s.trace.operationId} /></div>
          </>
        ) : s?.error ? (
          <Empty icon={<SearchX />} title="Couldn't search for this trace">{s.error}</Empty>
        ) : s?.phase === "done" ? (
          <Empty icon={<SearchX />} title="No resource has this operation">
            Searched {s.resources.length} Application Insights resource{s.resources.length === 1 ? "" : "s"} {where}
            {failed ? `, ${failed} of which couldn't be queried` : ""}{s.subsFailed ? `. ${s.subsFailed} subscription${s.subsFailed === 1 ? "" : "s"} couldn't be listed` : ""}
            {s.skipped ? `. ${s.skipped} more weren't searched (the first ${SEARCH_CAP} only)` : ""}. {G.ai.noTrace}
          </Empty>
        ) : (
          <SearchProgress s={s} operationId={target.operationId} where={where} subsTotal={subIds.length} />
        )}
      </div>
    </div>
  );
}

const STATE: Record<ResourceState, { label: (n?: number) => string; className: string }> = {
  waiting: { label: () => "Waiting", className: "text-fg-3/60" },
  searching: { label: () => "Searching…", className: "text-fg-2" },
  found: { label: (n) => `Found ${n} item${n === 1 ? "" : "s"}`, className: "text-ok" },
  none: { label: () => "Not here", className: "text-fg-3" },
  failed: { label: () => "Couldn't query", className: "text-warn" },
};

function progressOf(s: TraceSearch | undefined) {
  if (!s || s.phase === "listing") return { done: s?.subsListed ?? 0, total: s?.subsTotal || 1 };
  return { done: s.resources.filter((r) => r.state !== "waiting" && r.state !== "searching").length, total: s.resources.length || 1 };
}

function SearchProgress({ s, operationId, where, subsTotal }: { s?: TraceSearch; operationId: string; where: string; subsTotal: number }) {
  const { done, total } = progressOf(s);
  const step = !s || s.phase === "listing"
    ? `Step 1 of 2 · Listing Application Insights resources · ${s?.subsListed ?? 0} of ${subsTotal} subscription${subsTotal === 1 ? "" : "s"}`
    : `Step 2 of 2 · Asking ${s.resources.length} resource${s.resources.length === 1 ? "" : "s"} ${where}, six at a time · ${done} of ${s.resources.length} done`;
  // Resources being asked right now first, then the finished ones, newest state at the top.
  const order: ResourceState[] = ["searching", "found", "failed", "none", "waiting"];
  const rows = [...(s?.resources ?? [])].sort((a, b) => order.indexOf(a.state) - order.indexOf(b.state));
  return (
    <div className="flex h-full items-start justify-center overflow-y-auto px-6 pt-[12vh]">
      <div className="w-full max-w-[560px]">
        <div className="flex items-center gap-2 text-[13px] text-fg-2"><Spinner /> Looking for <code className="truncate font-mono text-fg">{operationId}</code></div>
        <div className="mt-2 text-[12px] text-fg-3">{step}</div>
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-bg-3">
          <motion.div className="h-full rounded-full bg-fg-2" initial={false} animate={{ width: `${(done / total) * 100}%` }} transition={{ duration: 0.25 }} />
        </div>
        {rows.length > 0 && (
          <ul className="mt-4 divide-y divide-line/60 rounded-lg border border-line text-[12px]">
            {rows.map((r) => (
              <li key={r.component.id} className="flex h-8 items-center gap-2 px-3">
                {r.state === "searching" ? <Spinner className="size-3" /> : <span className="size-3" />}
                <span className="min-w-0 flex-1 truncate text-fg-2">{r.component.name}</span>
                <span className={STATE[r.state].className}>{STATE[r.state].label(r.n)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// Shown above a trace that has been found while other resources are still being asked.
function SearchStrip({ s }: { s: TraceSearch }) {
  const { done, total } = progressOf(s);
  return (
    <div className="relative flex h-8 shrink-0 items-center gap-2 border-b border-line px-5 text-[12px] text-fg-3">
      <Spinner className="size-3" />
      Still searching other resources for more of this operation · {done} of {total} done
      <motion.div className="absolute bottom-0 left-0 h-px bg-fg-3" initial={false} animate={{ width: `${(done / total) * 100}%` }} transition={{ duration: 0.25 }} />
    </div>
  );
}
