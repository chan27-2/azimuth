import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronRight, Radar, RefreshCw, SearchX } from "lucide-react";
import type { Component, FoundTrace, Overview, Trace } from "../../types";
import { api } from "../../lib/api";
import { invalidate, useQuery } from "../../lib/query";
import { envOf, fmtTime } from "../../lib/util";
import * as G from "../../lib/glossary";
import { Button, Empty, EnvBadge, Header, NoDrag, Select, Spinner, Tabs, Tip } from "../../ui/ui";
import { InsightsGlyph } from "../../ui/Logo";
import { useNav, type Place, type TraceTarget } from "../../shell/nav";
import { RangeSelect, useRange, useTrace } from "./common";
import { TraceView } from "./TraceView";
import { OverviewTab } from "./OverviewTab";
import { RequestsTab } from "./RequestsTab";
import { LogsTab } from "./LogsTab";
import { QueryTab } from "./QueryTab";

export function InsightsView({ place }: { place: Extract<Place, { tool: "ai" }> }) {
  if (place.component) return <ComponentView key={place.component.id} component={place.component} initialTrace={place.trace} />;
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

type Tab = "overview" | "requests" | "logs" | "query";

function ComponentView({ component, initialTrace }: { component: Component; initialTrace?: TraceTarget }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [range, setRange] = useRange();
  const [role, setRole] = useState<string | null>(null);
  const [trace, setTrace] = useState<TraceTarget | null>(initialTrace ?? null);
  const [opFilter, setOpFilter] = useState<string | undefined>();
  const [logSearch, setLogSearch] = useState<string | undefined>();
  const env = envOf(component.name);
  // Roles come from the unfiltered overview, so the list doesn't shrink to the selected role.
  const roles = useQuery<Overview>(`aiov:${component.id}|${range}|`, () => api.ai.overview({ component, range, role: null }));
  const refresh = () => invalidate((k) => k.startsWith("ai") && !k.startsWith("aicomp:") && k.includes(component.id));

  return (
    <div className="relative flex h-full flex-col">
      <Header>
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-[13px]">
          <span className="shrink-0 text-fg-3">Insights</span>
          <ChevronRight className="size-3.5 shrink-0 text-fg-3" />
          <span className="truncate font-medium text-fg" title={component.name}>{component.name}</span>
          <Tip content={G.env[env]}><EnvBadge env={env} /></Tip>
        </nav>
        <NoDrag className="ml-auto">
          {(roles.data?.roles.length ?? 0) > 1 && (
            <Tip content={G.ai.roleFilter} side="bottom">
              <Select value={role ?? ""} onChange={(v) => setRole(v || null)} label="Service" options={[{ value: "", label: "All services" }, ...roles.data!.roles.map((r) => ({ value: r, label: r }))]} />
            </Tip>
          )}
          <RangeSelect value={range} onChange={setRange} />
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
            onOperation={(name) => { setOpFilter(name); setTab("requests"); }}
            onException={(type) => { setLogSearch(type); setTab("logs"); }} />
        )}
        {tab === "requests" && <RequestsTab component={component} range={range} role={role} name={opFilter} onClearName={() => setOpFilter(undefined)} onOpen={(r) => setTrace({ operationId: r.operation_Id, at: r.timestamp })} />}
        {tab === "logs" && <LogsTab component={component} range={range} role={role} initialSearch={logSearch} onOpen={(l) => setTrace({ operationId: l.operation_Id, at: l.timestamp })} />}
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

// Find trace: search every resource in the given subscriptions, then show the operation stitched
// together from all of them.
function TraceFinder({ target }: { target: TraceTarget }) {
  const { subs, go } = useNav();
  const subIds = target.subIds?.length ? target.subIds : subs.map((s) => s.id);
  const found = useQuery<FoundTrace>(`aifind:${target.operationId}|${target.at ?? ""}`, () => api.ai.findTrace({ subIds, operationId: target.operationId, at: target.at }));
  const comps = found.data?.hits.map((h) => h.component) ?? [];
  const trace = useQuery<Trace>(comps.length ? `aiacross:${found.data!.operationId}|${comps.map((c) => c.id).join(",")}` : null, () => api.ai.traceAcross({ components: comps, operationId: found.data!.operationId, at: target.at }));

  return (
    <div className="flex h-full flex-col">
      <Header>
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-[13px]">
          <span className="shrink-0 text-fg-3">Insights</span>
          <ChevronRight className="size-3.5 shrink-0 text-fg-3" />
          <span className="flex items-center gap-1.5 font-medium text-fg"><Radar className="size-3.5 text-fg-3" />Find trace</span>
        </nav>
        {found.data && (
          <NoDrag className="ml-auto text-[12px] text-fg-3">
            Found in {found.data.hits.map((h, i) => (
              <span key={h.component.id}>{i > 0 && ", "}<button className="text-fg-2 hover:text-fg" onClick={() => go({ tool: "ai", component: h.component })}>{h.component.name}</button></span>
            ))}
          </NoDrag>
        )}
      </Header>
      <div className="min-h-0 flex-1">
        {found.loading ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-[13px] text-fg-3">
            <Spinner />
            <div>Looking for <code className="font-mono text-fg-2">{target.operationId}</code></div>
            <div className="text-[12px]">Searching Application Insights in {subIds.length} subscription{subIds.length === 1 ? "" : "s"}, {target.at ? `around ${fmtTime(target.at)}` : "over the last 7 days"}.</div>
          </div>
        ) : found.error ? (
          <Empty icon={<SearchX />} title="Couldn't search for this trace">{found.error}</Empty>
        ) : !comps.length ? (
          <Empty icon={<SearchX />} title="No resource has this operation">
            Searched {found.data?.searched ?? 0} Application Insights resources {target.at ? `around ${fmtTime(target.at)}` : "over the last 7 days"}
            {found.data?.failed ? `, ${found.data.failed} of which couldn't be queried` : ""}. {G.ai.noTrace}
          </Empty>
        ) : (
          <TraceView items={trace.data?.items} operationId={found.data!.operationId} loading={trace.loading} error={trace.error} />
        )}
      </div>
    </div>
  );
}
