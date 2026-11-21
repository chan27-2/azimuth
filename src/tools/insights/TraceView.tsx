// One operation as a waterfall: requests and dependencies as spans nested by parent id, logs and
// exceptions pinned to the span that emitted them. Used by Insights and by Functions invocations.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, ArrowDownToLine, Braces, ChevronRight, Database, Globe, Link2, MessageSquare, Radio, Server, X, Zap } from "lucide-react";
import type { TraceItem } from "../../types";
import { cn, copy, fmtMs, fmtTime, SEVERITY } from "../../lib/util";
import * as G from "../../lib/glossary";
import { Button, Chip, CopyButton, Empty, Spinner, Tabs, Tip } from "../../ui/ui";
import { JsonTree } from "../../ui/viewers/JsonTree";

type Span = TraceItem & { start: number; end: number; children: Span[]; logs: TraceItem[]; depth: number; failed: boolean };

const isSpan = (x: TraceItem) => (x.itemType === "request" || x.itemType === "dependency" || x.itemType === "pageView") && !!x.id;
const failedOf = (x: TraceItem) => String(x.success).toLowerCase() === "false";

export function buildTrace(items: TraceItem[], operationId: string) {
  const spans = new Map<string, Span>();
  for (const x of items) {
    if (!isSpan(x)) continue;
    const start = new Date(x.timestamp).getTime();
    spans.set(x.id!, { ...x, start, end: start + Math.max(0, x.duration ?? 0), children: [], logs: [], depth: 0, failed: failedOf(x) });
  }
  const roots: Span[] = [];
  for (const s of spans.values()) {
    const parent = s.operation_ParentId ? spans.get(s.operation_ParentId) : undefined;
    if (parent && parent !== s) parent.children.push(s);
    else roots.push(s);
  }
  // Logs whose parent span wasn't exported (common with OpenTelemetry, where in-process activities
  // aren't sent as dependencies) belong to the request that was running when they were written.
  const orphans: TraceItem[] = [];
  const requests = [...spans.values()].filter((sp) => sp.itemType === "request");
  for (const x of items) {
    if (isSpan(x)) continue;
    const at = new Date(x.timestamp).getTime();
    const owner = (x.operation_ParentId ? spans.get(x.operation_ParentId) : undefined)
      ?? requests.filter((r) => r.start <= at + 1 && at <= r.end + 1).sort((a, b) => b.start - a.start)[0]
      ?? (requests.length === 1 ? requests[0] : undefined);
    if (owner) owner.logs.push(x);
    else orphans.push(x);
  }
  const byStart = (a: Span, b: Span) => a.start - b.start;
  roots.sort(byStart);
  const walk = (s: Span, depth: number) => { s.depth = depth; s.children.sort(byStart); s.children.forEach((c) => walk(c, depth + 1)); };
  roots.forEach((r) => walk(r, 0));
  const times = items.map((x) => new Date(x.timestamp).getTime());
  const t0 = Math.min(...times);
  const t1 = Math.max(...[...spans.values()].map((s) => s.end), ...times);
  // A true root's parent is the operation itself (or empty). Any other root points at a span that isn't
  // here, usually because that service sends telemetry to a different resource.
  const missingParents = roots.filter((r) => r.operation_ParentId && r.operation_ParentId !== operationId).length;
  return { roots, orphans, t0, t1: Math.max(t1, t0 + 1), spans: [...spans.values()], missingParents };
}

const ROLE_COLORS = ["#60a5fa", "#a78bfa", "#45d483", "#f5a524", "#f472b6", "#22d3ee", "#fb923c", "#a3e635"];

function spanIcon(s: TraceItem) {
  if (s.itemType === "request") return s.customDimensions?.["faas.name"] ? <Zap /> : <Server />;
  const t = String(s.type ?? "").toLowerCase();
  if (t.includes("sql") || t.includes("cosmos") || t.includes("redis") || t.includes("table")) return <Database />;
  if (t.includes("service bus") || t.includes("queue") || t.includes("event")) return <Radio />;
  if (t.includes("http")) return <Globe />;
  return <Link2 />;
}

export function TraceView({ items, operationId, loading, error, onClose, actions, onSearchWider, wider }: {
  items: TraceItem[] | undefined; operationId: string; loading?: boolean; error?: string; onClose?: () => void; actions?: ReactNode;
  // Offered when spans point at parents that aren't in this resource.
  onSearchWider?: () => void; wider?: "idle" | "searching" | "done";
}) {
  const model = useMemo(() => (items?.length ? buildTrace(items, operationId) : null), [items, operationId]);
  const [selected, setSelected] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<"waterfall" | "logs">("waterfall");

  // Select the first failing span, else the root.
  useEffect(() => {
    if (!model) return;
    const firstFailed = model.spans.filter((s) => s.failed).sort((a, b) => b.depth - a.depth)[0];
    setSelected((firstFailed ?? model.roots[0])?.id ?? null);
  }, [model]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const roles = useMemo(() => [...new Set((items ?? []).map((x) => x.cloud_RoleName).filter(Boolean))], [items]);
  const colorOf = (role: string) => ROLE_COLORS[Math.max(0, roles.indexOf(role)) % ROLE_COLORS.length];

  const rows = useMemo(() => {
    const out: Span[] = [];
    const add = (s: Span) => { out.push(s); if (!collapsed.has(s.id!)) s.children.forEach(add); };
    model?.roots.forEach(add);
    return out;
  }, [model, collapsed]);

  const sel = model?.spans.find((s) => s.id === selected) ?? null;
  const logs = useMemo(() => (items ?? []).filter((x) => !isSpan(x)), [items]);
  const errors = (items ?? []).filter((x) => x.itemType === "exception" || (isSpan(x) && failedOf(x))).length;

  const header = (
    <div className="flex h-12 shrink-0 items-center gap-3 border-b border-line px-4">
      <div className="flex min-w-0 items-center gap-2">
        <span className="text-[13px] font-medium text-fg">Trace</span>
        <Tip content={{ title: "Operation id", body: G.ai.operationId }}>
          <code className="truncate font-mono text-[12px] text-fg-3">{operationId}</code>
        </Tip>
        <CopyButton text={operationId} label="Copy operation id" />
      </div>
      {model && (
        <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
          <Chip>{fmtMs(model.t1 - model.t0)}</Chip>
          <Chip>{model.spans.length} span{model.spans.length === 1 ? "" : "s"}</Chip>
          {errors > 0 && <Chip tone="bad"><AlertTriangle />{errors} error{errors === 1 ? "" : "s"}</Chip>}
          {roles.slice(0, 4).map((r) => (
            <Tip key={r} content={{ title: r, body: G.ai.role }}>
              <Chip><span className="size-2 rounded-full" style={{ background: colorOf(r) }} />{r}</Chip>
            </Tip>
          ))}
        </div>
      )}
      <div className="ml-auto flex items-center gap-1.5">
        {actions}
        {items && <Tip content="Copy every item in this operation as JSON"><Button variant="ghost" size="icon" aria-label="Copy trace as JSON" onClick={() => copy(JSON.stringify(items, null, 2))}><Braces /></Button></Tip>}
        {onClose && <Tip content="Close (Esc)"><Button variant="ghost" size="icon" aria-label="Close trace" onClick={onClose}><X /></Button></Tip>}
      </div>
    </div>
  );

  if (loading && !items) return <div className="flex h-full flex-col">{header}<div className="flex flex-1 items-center justify-center gap-2 text-[13px] text-fg-3"><Spinner /> Loading the operation…</div></div>;
  if (error) return <div className="flex h-full flex-col">{header}<Empty icon={<AlertTriangle />} title="Couldn't load this trace">{error}</Empty></div>;
  if (!model) return <div className="flex h-full flex-col">{header}<Empty icon={<ArrowDownToLine />} title="Nothing recorded for this operation">{G.ai.noTrace}</Empty></div>;

  const total = model.t1 - model.t0;
  const pos = (t: number) => `${((t - model.t0) / total) * 100}%`;

  return (
    <div className="flex h-full flex-col">
      {header}
      <div className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-2">
        <Tabs id="trace-tab" value={tab} onChange={setTab} items={[{ value: "waterfall", label: "Waterfall" }, { value: "logs", label: <>Logs <span className="tabular text-fg-3">{logs.length}</span></> }]} />
        <span className="text-[12px] text-fg-3">Started {fmtTime(new Date(model.t0).toISOString())}</span>
        {model.missingParents > 0 && onSearchWider && wider !== "done" && (
          <Tip content={{ title: "Part of this operation is elsewhere", body: G.ai.missingParents }}>
            <Button variant="ghost" size="sm" className="ml-auto text-warn hover:text-warn" disabled={wider === "searching"} onClick={onSearchWider}>
              {wider === "searching" ? <Spinner className="size-3" /> : <AlertTriangle />} Look in other resources
            </Button>
          </Tip>
        )}
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-auto">
          {tab === "waterfall" ? (
            <div className="min-w-[480px]">
              <div className="sticky top-0 z-10 grid grid-cols-[minmax(200px,36%)_1fr] border-b border-line bg-bg/95 text-[11px] text-fg-3 backdrop-blur">
                <div className="px-4 py-1.5">Span</div>
                <div className="relative overflow-hidden py-1.5 pr-4"><span className="invisible">0</span>
                  {[0, 0.25, 0.5, 1].map((f) => (
                    <span key={f} className="absolute top-1.5 tabular" style={f === 1 ? { right: 16 } : { left: `calc((100% - 16px) * ${f})`, translate: f === 0 ? "0" : "-50%" }}>{fmtMs(total * f)}</span>
                  ))}
                </div>
              </div>
              {rows.map((s) => {
                const open = !collapsed.has(s.id!);
                const color = s.failed ? "var(--color-bad)" : colorOf(s.cloud_RoleName);
                return (
                  <div
                    key={s.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelected(s.id)}
                    onKeyDown={(e) => e.key === "Enter" && setSelected(s.id)}
                    className={cn("group grid h-8 cursor-default grid-cols-[minmax(200px,36%)_1fr] items-center border-b border-line/50 text-[12.5px]", selected === s.id ? "bg-bg-3" : "hover:bg-bg-2")}
                  >
                    <div className="flex min-w-0 items-center gap-1.5 pr-3" style={{ paddingLeft: 12 + s.depth * 16 }}>
                      {s.children.length ? (
                        <button onClick={(e) => { e.stopPropagation(); setCollapsed((c) => { const n = new Set(c); if (n.has(s.id!)) n.delete(s.id!); else n.add(s.id!); return n; }); }} className="flex size-4 shrink-0 items-center justify-center rounded text-fg-3 hover:text-fg" aria-label={open ? "Collapse" : "Expand"}>
                          <motion.span animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.12 }} className="flex"><ChevronRight className="size-3" /></motion.span>
                        </button>
                      ) : <span className="w-4 shrink-0" />}
                      <span className="flex shrink-0 [&_svg]:size-3.5" style={{ color }}>{spanIcon(s)}</span>
                      <span className={cn("min-w-0 truncate", s.failed ? "text-bad" : "text-fg")}>{s.name || s.type || s.itemType}</span>
                      {s.itemType === "dependency" && s.target && <span className="min-w-0 truncate text-[11.5px] text-fg-3">{s.target}</span>}
                      {s.logs.some((l) => l.itemType === "exception") && <AlertTriangle className="size-3 shrink-0 text-bad" />}
                    </div>
                    <div className="relative h-full overflow-hidden pr-4">
                      <div className="absolute inset-y-0 right-4 left-0">
                        <div className="absolute top-1/2 h-[14px] -translate-y-1/2" style={{ left: pos(s.start), width: `max(3px, ${((s.end - s.start) / total) * 100}%)` }}>
                          <Tip block className="h-full w-full" content={{ title: `${s.name || s.type} · ${fmtMs(s.duration)}`, body: `${s.itemType === "request" ? "Request handled by" : "Call made by"} ${s.cloud_RoleName || "an unknown service"}, starting ${fmtMs(s.start - model.t0)} into the operation.${s.resultCode ? ` Result ${s.resultCode}.` : ""}` }}>
                            <span className="block h-full w-full rounded-[3px]" style={{ background: color, opacity: selected === s.id ? 1 : 0.75 }} />
                          </Tip>
                        </div>
                        {s.logs.map((l) => (
                          <span key={l.itemId} className={cn("pointer-events-none absolute top-1/2 size-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full", l.itemType === "exception" ? "bg-bad" : (l.severityLevel ?? 0) >= 2 ? "bg-warn" : "bg-fg-2")} style={{ left: pos(new Date(l.timestamp).getTime()), marginTop: 10 }} />
                        ))}
                        {/* Near the right edge the label goes before the bar, so it isn't cut off. */}
                        <span className="pointer-events-none absolute top-1/2 -translate-y-1/2 px-1.5 text-[11px] tabular text-fg-3"
                          style={(s.end - model.t0) / total <= 0.85
                            ? { left: `calc(${pos(s.end)} + 2px)` }
                            : (s.start - model.t0) / total > 0.15
                              ? { right: `calc(${100 - ((s.start - model.t0) / total) * 100}% + 2px)` }
                              : { right: `calc(${100 - ((s.end - model.t0) / total) * 100}% + 2px)`, color: "var(--color-bg)", fontWeight: 600 }}>{fmtMs(s.duration)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
              {model.orphans.length > 0 && (
                <div className="border-b border-line/50 px-4 py-2 text-[12px] text-fg-3">
                  {model.orphans.length} log{model.orphans.length === 1 ? "" : "s"} not tied to a span. See the Logs tab.
                </div>
              )}
            </div>
          ) : (
            <LogList items={logs} colorOf={colorOf} onSelectSpan={(id) => { setSelected(id); setTab("waterfall"); }} spanIds={new Set(model.spans.map((s) => s.id!))} />
          )}
        </div>
        <AnimatePresence initial={false}>
          {sel && tab === "waterfall" && (
            <motion.aside initial={{ width: 0, opacity: 0 }} animate={{ width: 360, opacity: 1 }} exit={{ width: 0, opacity: 0 }} transition={{ type: "spring", bounce: 0, duration: 0.25 }} className="shrink-0 overflow-hidden border-l border-line">
              <SpanDetail span={sel} />
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function SpanDetail({ span }: { span: Span }) {
  const rows: [string, ReactNode, string?][] = [
    ["Type", span.itemType === "dependency" ? `${span.type ?? "Dependency"} call` : span.itemType === "request" ? "Incoming request" : span.itemType],
    ["Service", span.cloud_RoleName || "—", span.cloud_RoleName],
    ["Instance", span.cloud_RoleInstance || "—", span.cloud_RoleInstance ?? undefined],
    ["Resource", span.component],
    ["Started", fmtTime(span.timestamp)],
    ["Duration", fmtMs(span.duration)],
    ["Result", <span className={span.failed ? "text-bad" : "text-ok"}>{span.resultCode || "—"} · {span.failed ? "failed" : "succeeded"}</span>],
    ...(span.target ? [["Target", span.target, span.target] as [string, ReactNode, string]] : []),
    ...(span.url ? [["URL", span.url, span.url] as [string, ReactNode, string]] : []),
  ];
  return (
    <div className="flex h-full w-[360px] flex-col overflow-y-auto">
      <div className="border-b border-line px-4 py-3">
        <div className={cn("break-words text-[13px] font-medium", span.failed ? "text-bad" : "text-fg")}>{span.name || span.type}</div>
        <div className="mt-0.5 font-mono text-[11px] text-fg-3">span {span.id}</div>
      </div>
      <dl className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-1.5 border-b border-line px-4 py-3 text-[12px]">
        {rows.map(([k, v, c]) => (
          <div key={k} className="contents">
            <dt className="text-fg-3">{k}</dt>
            <dd className="group flex min-w-0 items-start gap-1 text-fg-2"><span className="selectable min-w-0 break-all">{v}</span>{c && <CopyButton text={c} className="-my-0.5 opacity-0 group-hover:opacity-100" label={`Copy ${k.toLowerCase()}`} />}</dd>
          </div>
        ))}
      </dl>
      {span.data && (
        <Section title={span.type?.toLowerCase().includes("sql") ? "Command" : "Data"} copyText={span.data}>
          <pre className="selectable max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-md border border-line bg-bg-1 p-2.5 font-mono text-[11.5px] text-fg-2">{span.data}</pre>
        </Section>
      )}
      {span.logs.length > 0 && (
        <Section title={`Logs (${span.logs.length})`}>
          <div className="space-y-1.5">
            {span.logs.map((l) => <LogEntry key={l.itemId} item={l} />)}
          </div>
        </Section>
      )}
      {span.customDimensions && Object.keys(span.customDimensions).length > 0 && (
        <Section title="Custom properties" copyText={JSON.stringify(span.customDimensions, null, 2)}>
          <div className="rounded-md border border-line bg-bg-1 p-1.5"><JsonTree value={span.customDimensions} onCopy={(_, t) => copy(t)} /></div>
        </Section>
      )}
    </div>
  );
}

function Section({ title, copyText, children }: { title: string; copyText?: string; children: ReactNode }) {
  return (
    <div className="border-b border-line px-4 py-3">
      <div className="mb-2 flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.08em] text-fg-3">
        {title}
        {copyText && <CopyButton text={copyText} label={`Copy ${title.toLowerCase()}`} />}
      </div>
      {children}
    </div>
  );
}

export function severityTone(item: { itemType: string; severityLevel: number | null }) {
  if (item.itemType === "exception" || (item.severityLevel ?? 0) >= 3) return "bad" as const;
  if ((item.severityLevel ?? 0) === 2) return "warn" as const;
  return "default" as const;
}

export function SeverityBadge({ item }: { item: { itemType: string; severityLevel: number | null } }) {
  const tone = severityTone(item);
  const label = item.itemType === "exception" ? "Exception" : SEVERITY[item.severityLevel ?? 1] ?? "Info";
  return (
    <span className={cn("inline-flex h-[18px] w-[64px] shrink-0 items-center justify-center rounded-[4px] border text-[10px] font-semibold uppercase tracking-wider",
      tone === "bad" ? "border-bad/25 bg-bad/10 text-bad" : tone === "warn" ? "border-warn/25 bg-warn/10 text-warn" : "border-line-2 bg-bg-2 text-fg-3")}>{label}</span>
  );
}

export function LogEntry({ item }: { item: Pick<TraceItem, "itemType" | "severityLevel" | "message" | "outerMessage" | "type" | "details" | "timestamp" | "itemId"> }) {
  const [open, setOpen] = useState(false);
  const text = item.itemType === "exception" && item.outerMessage ? `${item.type ?? "Exception"}: ${item.outerMessage}` : item.message ?? "";
  const stack = item.details?.map((d) => d.rawStack ?? d.parsedStack?.map((f) => `   at ${f.method}${f.fileName ? ` in ${f.fileName}:line ${f.line}` : ""}`).join("\n")).filter(Boolean).join("\n\n");
  return (
    <div className={cn("rounded-md border px-2.5 py-2", item.itemType === "exception" ? "border-bad/25 bg-bad/5" : "border-line bg-bg-1")}>
      <div className="flex items-center gap-2">
        <SeverityBadge item={item} />
        <span className="text-[11px] tabular text-fg-3">{new Date(item.timestamp).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, fractionalSecondDigits: 3 } as Intl.DateTimeFormatOptions)}</span>
        <CopyButton text={stack ? `${text}\n${stack}` : text} className="ml-auto" label="Copy log" />
      </div>
      <div className="selectable mt-1.5 whitespace-pre-wrap break-words font-mono text-[11.5px] leading-relaxed text-fg-2">{text}</div>
      {stack && (
        <>
          <button onClick={() => setOpen(!open)} className="mt-1.5 text-[11px] text-fg-3 hover:text-fg-2">{open ? "Hide" : "Show"} stack trace</button>
          {open && <pre className="selectable mt-1.5 max-h-72 overflow-auto whitespace-pre font-mono text-[11px] leading-relaxed text-fg-3">{stack}</pre>}
        </>
      )}
    </div>
  );
}

function LogList({ items, colorOf, onSelectSpan, spanIds }: { items: TraceItem[]; colorOf: (r: string) => string; onSelectSpan: (id: string) => void; spanIds: Set<string> }) {
  if (!items.length) return <Empty icon={<MessageSquare />} title="No logs in this operation">{G.ai.noLogs}</Empty>;
  return (
    <div className="space-y-1.5 p-4">
      {items.map((l) => (
        <div key={l.itemId} className="flex gap-2">
          <span className="mt-2.5 size-2 shrink-0 rounded-full" style={{ background: colorOf(l.cloud_RoleName) }} title={l.cloud_RoleName} />
          <div className="min-w-0 flex-1">
            <LogEntry item={l} />
            {l.operation_ParentId && spanIds.has(l.operation_ParentId) && <button onClick={() => onSelectSpan(l.operation_ParentId!)} className="mt-1 text-[11px] text-fg-3 hover:text-fg-2">Show its span →</button>}
          </div>
        </div>
      ))}
    </div>
  );
}
