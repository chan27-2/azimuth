import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, ArrowRight, ArrowUpRight, Binary, Braces, Check, ClipboardCopy, FileJson, FileText, GitCompare, ListTree, Radio, Table2 } from "lucide-react";
import type { Item } from "./EntityView";
import { fmtBytes, layerLabel, type Detection } from "./detect";
import { ago, cn, copy, fmtTime, traceIdOf } from "../../lib/util";
import * as G from "../../lib/glossary";
import { useNav } from "../../shell/nav";
import { Button, Chip, CopyButton, Field, Switch, Tabs, Tip, type TipContent } from "../../ui/ui";
import { JsonTree } from "../../ui/viewers/JsonTree";
import { XmlTree } from "../../ui/viewers/XmlTree";
import { HexView } from "../../ui/viewers/HexView";
import { CsvTable } from "../../ui/viewers/CsvTable";
import { DiffView } from "../../ui/viewers/DiffView";
import { ResizeHandle, useStoredSize } from "../../ui/resize";
import { SmartText, parseText } from "../../ui/SmartText";

// A property value: short plain values inline; JSON, XML or SQL inside a value gets formatted.
function Value({ text }: { text: string }) {
  const formatted = text.length > 2 && parseText(text).some((p) => p.kind !== "text");
  return formatted ? <SmartText text={text} className="py-1.5" maxHeight={260} /> : <span className="selectable break-all py-2 font-mono text-[12px] text-fg">{text}</span>;
}

type View = "smart" | "raw" | "hex" | "props" | "diff";

const formatLabel: Record<string, string> = { json: "JSON", xml: "XML", csv: "CSV", text: "Text", binary: "Binary", empty: "Empty" };

export function MessageDetail({ item, compare }: { item: Item; compare: Item | null }) {
  const [view, setView] = useState<View>(compare ? "diff" : "smart");
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState<{ what: string; text: string; n: number } | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const notify = async (what: string, text: string) => {
    await copy(text);
    setToast({ what, text, n: Date.now() });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 1800);
  };
  const [onlyChanges, setOnlyChanges] = useState(true);
  const { msg, det } = item;
  const traceId = traceIdOf(msg.applicationProperties);
  const { go, subs, place } = useNav();
  // Search the namespace's own subscription first; the rest follow.
  const openTrace = (operationId: string, at?: string) => {
    const home = place.tool === "sb" ? place.ns?.subscriptionId : undefined;
    go({ tool: "ai", trace: { operationId, at, subIds: [...new Set([home, ...subs.map((s) => s.id)].filter(Boolean) as string[])] } });
  };
  const ce = det.layers.find((l) => l.kind === "cloudevent");

  return (
    <div className="relative flex h-full flex-col">
      <div className="border-b border-line px-5 pb-3 pt-4">
        <div className="flex items-center gap-2">
          <Tip content={G.ui.seq}><span className="font-mono text-[12px] text-fg-3">#{msg.sequenceNumber}</span></Tip>
          <h2 className="selectable truncate font-mono text-[13px] font-medium text-fg">{msg.messageId ?? "(no message id)"}</h2>
          {msg.messageId && <CopyButton text={msg.messageId} label="Copy message id" />}
          <Tip content={{ title: "Enqueued", body: G.props.EnqueuedTime }} className="ml-auto"><span className="text-[12px] text-fg-3">{fmtTime(msg.enqueuedTime)} · {ago(msg.enqueuedTime)}</span></Tip>
        </div>
        <Pipeline det={det} bodyType={msg.bodyType} size={msg.size} />
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {msg.subject && <Tip content={G.chip.subject}><Chip>{msg.subject}</Chip></Tip>}
          {msg.correlationId && <Tip content={{ title: G.chip.correlation.title, body: <>{G.chip.correlation.body}<code className="mt-1 block break-all font-mono text-[11px] text-fg">{msg.correlationId}</code></> }}><Chip className="pr-0.5">corr {msg.correlationId.slice(0, 12)}…<CopyButton text={msg.correlationId} label="Copy correlation id" className="size-5" /></Chip></Tip>}
          {traceId && <Tip content={{ title: G.chip.trace.title, body: <>{G.chip.trace.body}<code className="mt-1 block break-all font-mono text-[11px] text-fg">{traceId}</code></> }}><Chip tone="accent" className="pr-0.5"><Radio />trace {traceId.slice(0, 10)}…<CopyButton text={traceId} className="size-5 text-accent hover:text-accent" label="Copy trace id" /></Chip></Tip>}
          {traceId && (
            <Tip content={{ title: "Open this trace in Insights", body: "Finds the operation in your Application Insights resources and shows every request, dependency and log it produced, across services." }}>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-accent hover:text-accent" onClick={() => openTrace(traceId, msg.enqueuedTime ?? undefined)}>
                <ArrowUpRight /> Insights
              </Button>
            </Tip>
          )}
          {msg.sessionId && <Tip content={G.chip.session}><Chip>session {msg.sessionId}</Chip></Tip>}
          {msg.deliveryCount > 0 && <Tip content={G.ui.deliveryCount}><Chip tone={msg.deliveryCount > 3 ? "warn" : "default"}>delivered {msg.deliveryCount}×</Chip></Tip>}
        </div>
        {msg.deadLetterReason && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="mt-3 flex gap-2.5 rounded-lg border border-bad/25 bg-bad/[0.06] px-3 py-2.5">
            <AlertTriangle className="mt-px size-3.5 shrink-0 text-bad" />
            <div className="selectable min-w-0 text-[12px]">
              <Tip content={G.dlqReason(msg.deadLetterReason)}><span className="cursor-help font-medium text-bad underline decoration-bad/40 decoration-dotted underline-offset-4">{msg.deadLetterReason}</span></Tip>
              {msg.deadLetterErrorDescription && <div className="mt-0.5 break-words text-fg-2">{msg.deadLetterErrorDescription}</div>}
              {msg.deadLetterSource && <div className="mt-0.5 text-fg-3">from {msg.deadLetterSource}</div>}
            </div>
          </motion.div>
        )}
      </div>

      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-line px-5">
        <Tabs
          id="detail"
          value={view}
          onChange={setView}
          items={[
            { value: "smart", label: <><SmartIcon det={det} />{formatLabel[det.format]}</> },
            { value: "raw", label: <><FileText className="size-3.5" />Raw</> },
            { value: "hex", label: <><Binary className="size-3.5" />Hex</> },
            { value: "props", label: <><ListTree className="size-3.5" />Properties</> },
            ...(compare ? [{ value: "diff" as View, label: <><GitCompare className="size-3.5" />Diff #{compare.msg.sequenceNumber}</> }] : []),
          ]}
        />
        {view === "smart" && (det.format === "json" || det.format === "xml") && (
          <Tip content={G.ui.searchTree} side="bottom" className="ml-auto shrink"><Field value={query} onChange={setQuery} placeholder="Search keys & values" wrapperClassName="w-56 min-w-0" /></Tip>
        )}
        {view !== "diff" && (
          <div className={cn("flex shrink-0 items-center gap-1", !(view === "smart" && (det.format === "json" || det.format === "xml")) && "ml-auto")}>
            <Tip content={G.ui.copyPayload} side="bottom">
              <Button variant="secondary" size="icon" aria-label="Copy payload" onClick={() => notify("payload", payloadText(det, msg.body))}><ClipboardCopy /></Button>
            </Tip>
            <Tip content={G.ui.copyMessage} side="bottom">
              <Button variant="secondary" size="icon" aria-label="Copy whole message" onClick={() => notify("message", JSON.stringify(wholeMessage(item), null, 2))}><FileJson /></Button>
            </Tip>
          </div>
        )}
        {view === "diff" && (
          <div className="ml-auto"><Switch checked={onlyChanges} onChange={setOnlyChanges} label="Only changes" /></div>
        )}
      </div>

      <div className="relative min-h-0 flex-1 overflow-auto px-5 py-4">
        {view === "smart" && (
          <>
            {ce && ce.kind === "cloudevent" && <Envelope title="CloudEvent envelope" tip={G.layer(ce)} data={ce.envelope} onCopy={notify} />}
            {det.layers.map((l, i) => l.kind === "masstransit" && <Envelope key={i} title="MassTransit envelope" tip={G.layer(l)} data={l.envelope} onCopy={notify} />)}
            <SmartBody det={det} query={query} onCopy={notify} />
          </>
        )}
        {view === "raw" && <RawView det={det} raw={item.msg.body} />}
        {view === "hex" && <HexView bytes={det.bytes} />}
        {view === "props" && <Props item={item} onCopy={notify} />}
        {view === "diff" && compare && (
          <DiffView a={{ label: `#${compare.msg.sequenceNumber}`, value: diffValue(compare) }} b={{ label: `#${msg.sequenceNumber} (selected)`, value: diffValue(item) }} onlyChanges={onlyChanges} />
        )}
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-5 flex justify-center">
        <AnimatePresence>
          {toast && (
            <motion.div
              key={toast.n}
              role="status"
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.16 }}
              className="flex max-w-[70%] items-center gap-2 rounded-lg border border-line-2 bg-bg-2 px-3 py-2 text-[12px] shadow-[0_8px_24px_rgba(0,0,0,0.5)]"
            >
              <Check className="size-3.5 shrink-0 text-ok" />
              <span className="shrink-0 text-fg">Copied {toast.what}</span>
              <span className="truncate font-mono text-[11px] text-fg-3">{toast.text.replace(/\s+/g, " ").slice(0, 80)}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export type Notify = (what: string, text: string) => void;

function payloadText(det: Detection, raw: string) {
  if (det.json !== undefined) return JSON.stringify(det.json, null, 2);
  if (det.text !== undefined) return det.text;
  return raw;
}

function wholeMessage({ msg, det }: Item) {
  const { body: _raw, ...broker } = msg;
  const envelope = det.layers.find((l) => l.kind === "cloudevent" || l.kind === "masstransit") as { envelope: unknown } | undefined;
  return { ...broker, envelope: envelope?.envelope, body: det.json ?? det.text ?? msg.body };
}

const diffValue = (it: Item) => ({
  body: it.det.json ?? it.det.text ?? null,
  properties: it.msg.applicationProperties,
  subject: it.msg.subject,
  contentType: it.msg.contentType,
});

function SmartIcon({ det }: { det: Detection }) {
  const cls = "size-3.5";
  if (det.format === "json") return <Braces className={cls} />;
  if (det.format === "csv") return <Table2 className={cls} />;
  if (det.format === "binary") return <Binary className={cls} />;
  return <FileText className={cls} />;
}

// The detection pipeline made visible: wire → each unwrapped layer → final format.
function Pipeline({ det, bodyType, size }: { det: Detection; bodyType: string; size: number }) {
  const steps: { label: string; tone: "muted" | "layer" | "final"; tip: TipContent }[] = [
    { label: `AMQP ${bodyType} · ${fmtBytes(size)}`, tone: "muted", tip: G.bodyType[bodyType] ?? G.bodyType.data },
    ...det.layers.map((l) => ({ label: layerLabel(l), tone: "layer" as const, tip: G.layer(l) })),
    { label: det.format === "binary" ? det.binaryHint ?? "Binary" : formatLabel[det.format], tone: "final", tip: G.format[det.format] },
  ];
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1">
      {steps.map((s, i) => (
        <motion.span key={i} initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className="flex items-center gap-1">
          {i > 0 && <ArrowRight className="size-3 text-fg-3" />}
          <Tip content={s.tip}>
            <span
              className={cn(
                "inline-flex h-6 cursor-help items-center rounded-md border px-2 font-mono text-[11px] transition-colors duration-150",
                s.tone === "muted" && "border-line bg-bg-1 text-fg-3 hover:border-line-2",
                s.tone === "layer" && "border-tok-bool/25 bg-tok-bool/[0.08] text-tok-bool hover:border-tok-bool/50",
                s.tone === "final" && "border-line-2 bg-bg-3 text-fg hover:border-fg-3",
              )}
            >
              {s.label}
            </span>
          </Tip>
        </motion.span>
      ))}
      {det.declared && (
        <Tip content={G.declared(det.declared, det.mismatch)}>
          <span className={cn("ml-1.5 inline-flex cursor-help items-center gap-1 text-[12px]", det.mismatch ? "text-warn" : "text-fg-3")}>
            {det.mismatch && <AlertTriangle className="size-3" />}
            declared {det.declared}
          </span>
        </Tip>
      )}
    </div>
  );
}

function Envelope({ title, tip, data, onCopy }: { title: string; tip: TipContent; data: Record<string, unknown>; onCopy: Notify }) {
  const [keyW, setKeyW, resetKeyW] = useStoredSize("sb.envelope.key", 160);
  const entries = Object.entries(data);
  return (
    <div className="mb-4 overflow-hidden rounded-lg border border-line">
      <div className="flex h-9 items-center justify-between border-b border-line bg-bg-1 pl-3 pr-1.5">
        <Tip content={tip}><span className="cursor-help text-[12px] font-medium text-fg-3">{title}</span></Tip>
        <Tip content="Copy envelope as JSON"><Button variant="ghost" size="icon-sm" aria-label="Copy envelope" onClick={() => onCopy("envelope", JSON.stringify(data, null, 2))}><ClipboardCopy /></Button></Tip>
      </div>
      <div className="selectable py-1 font-mono text-[12px]">
        {entries.map(([k, v]) => {
          const val = typeof v === "object" ? JSON.stringify(v) : String(v);
          return (
            <div key={k} className="group grid items-center gap-x-4 pl-3 pr-1.5 hover:bg-white/[0.02]" style={{ gridTemplateColumns: `${keyW}px 1fr auto` }}>
              <span className="relative truncate py-1 pr-2 text-fg-3" title={k}>{k}<ResizeHandle size={keyW} onSize={setKeyW} onReset={resetKeyW} min={80} max={480} label="Resize key column" /></span>
              <Value text={val} />
              <Tip content={`Copy ${k}`}><Button variant="ghost" size="icon-sm" aria-label={`Copy ${k}`} onClick={() => onCopy(k, val)} className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"><ClipboardCopy /></Button></Tip>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SmartBody({ det, query, onCopy }: { det: Detection; query: string; onCopy: Notify }) {
  switch (det.format) {
    case "json": return <JsonTree value={det.json} query={query} onCopy={onCopy} />;
    case "xml": return <XmlTree doc={det.xml!} query={query} />;
    case "csv": return <CsvTable rows={det.csv!.rows} />;
    case "text": return <SmartText text={det.text ?? ""} maxHeight={100_000} />;
    case "binary":
      return (
        <>
          <div className="mb-3 rounded-lg border border-warn/25 bg-warn/[0.06] px-3 py-2 text-[12px] text-warn">
            {det.binaryHint}. Without a schema, Busscope can only show the raw bytes.
          </div>
          <HexView bytes={det.bytes} />
        </>
      );
    default: return <div className="text-[13px] text-fg-3">The message body is empty.</div>;
  }
}

function RawView({ det, raw }: { det: Detection; raw: string }) {
  const [pretty, setPretty] = useState(true);
  const text = useMemo(() => {
    if (pretty && det.text) return det.text;
    try { return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(atob(raw), (c) => c.charCodeAt(0))); } catch { return `(binary, base64)\n${raw}`; }
  }, [pretty, det, raw]);
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <Switch checked={pretty} onChange={setPretty} label="Unwrapped & formatted" />
        <CopyButton text={text} label="Copy body" />
      </div>
      <pre className="whitespace-pre-wrap break-all rounded-lg border border-line bg-bg-1 p-3 font-mono text-[12px] leading-5 text-fg">{text}</pre>
    </div>
  );
}

function Props({ item, onCopy }: { item: Item; onCopy: Notify }) {
  const m = item.msg;
  const broker: [string, unknown][] = [
    ["MessageId", m.messageId], ["SequenceNumber", m.sequenceNumber], ["ContentType", m.contentType], ["Subject", m.subject],
    ["CorrelationId", m.correlationId], ["SessionId", m.sessionId], ["To", m.to], ["ReplyTo", m.replyTo],
    ["EnqueuedTime", m.enqueuedTime], ["ExpiresAt", m.expiresAt], ["ScheduledEnqueueTime", m.scheduledEnqueueTime],
    ["TimeToLive", m.timeToLive != null ? `${Math.round(m.timeToLive / 1000 / 60 / 60 / 24)} days` : null],
    ["DeliveryCount", m.deliveryCount], ["State", m.state], ["BodyType", m.bodyType], ["Size", fmtBytes(m.size)],
    ["DeadLetterReason", m.deadLetterReason], ["DeadLetterErrorDescription", m.deadLetterErrorDescription], ["DeadLetterSource", m.deadLetterSource],
  ];
  return (
    <div className="space-y-6">
      <PropTable
        title="Application properties"
        tip="Custom key/value pairs set by the sender. Subscription filters like [type] match against these."
        rows={Object.entries(m.applicationProperties)}
        empty="No application properties"
        onCopy={onCopy}
      />
      <PropTable title="Broker properties" tip="Standard properties Service Bus defines for every message." rows={broker.filter(([, v]) => v != null && v !== "")} explain onCopy={onCopy} />
    </div>
  );
}

function PropTable({ title, tip, rows, empty, explain, onCopy }: { title: string; tip: string; rows: [string, unknown][]; empty?: string; explain?: boolean; onCopy: Notify }) {
  const [propW, setPropW, resetPropW] = useStoredSize("sb.props.key", 220);
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <Tip content={{ title, body: tip }}><span className="cursor-help text-[12px] font-medium text-fg-3">{title}</span></Tip>
        {rows.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => onCopy(title.toLowerCase(), JSON.stringify(Object.fromEntries(rows), null, 2))}><ClipboardCopy />Copy all</Button>
        )}
      </div>
      <div className="overflow-hidden rounded-lg border border-line">
        {!rows.length && <div className="px-3 py-3 text-[13px] text-fg-3">{empty}</div>}
        {rows.map(([k, v]) => {
          const s = typeof v === "object" && v !== null ? JSON.stringify(v) : String(v);
          return (
            <div key={k} className="group grid items-center border-b border-line/60 pr-1.5 last:border-0 hover:bg-white/[0.02]" style={{ gridTemplateColumns: `${propW}px 1fr auto` }}>
              <Tip content={explain && G.props[k] ? { title: k, body: G.props[k] } : null} className="relative px-3">
                <span title={k} className={cn("selectable truncate py-2 font-mono text-[12px] text-fg-3", explain && G.props[k] && "cursor-help")}>{k}</span>
                <ResizeHandle size={propW} onSize={setPropW} onReset={resetPropW} min={100} max={520} label="Resize name column" />
              </Tip>
              <Value text={s} />
              <Tip content={`Copy ${k}`}><Button variant="ghost" size="icon-sm" aria-label={`Copy ${k}`} onClick={() => onCopy(k, s)} className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"><ClipboardCopy /></Button></Tip>
            </div>
          );
        })}
      </div>
    </div>
  );
}
