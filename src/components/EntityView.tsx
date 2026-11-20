import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Box, ChevronRight, GitCompare, Inbox, KeyRound, Layers, Lock, Network, RefreshCw, ShieldCheck, Skull, X } from "lucide-react";
import { canRead, type Access, type Auth, type Entities, type EntityRef, type Message, type Sub } from "../types";
import { fetchQuery, useQuery, peekCache } from "../lib/query";
import { AccessPanel } from "./AccessPanel";
import { b64ToBytes, detect, type Detection } from "../lib/detect";
import { ago, cn, envOf, fmtTime } from "../lib/util";
import { AnimatedNumber, Button, Chip, Empty, EnvBadge, Field, Header, NoDrag, Select, Spinner, Tabs, Tip } from "./ui";
import * as G from "../lib/glossary";
import { MessageDetail } from "./MessageDetail";

export type Item = { msg: Message; det: Detection };
type Peeked = { auth: Auth; items: Item[]; at: number };

const refKey = (r: EntityRef) => (r.kind === "queue" ? `${r.ns.id}|q|${r.queue}` : `${r.ns.id}|s|${r.topic}|${r.subscription}`);

export function EntityView({ entity, onBack }: { entity: EntityRef; onBack: () => void }) {
  const ents = peekCache<Entities>(`ent:${entity.ns.id}`);
  const counts = useMemo(() => {
    if (!ents) return null;
    if (entity.kind === "queue") return ents.queues.find((q) => q.name === entity.queue)?.counts ?? null;
    return ents.topics.find((t) => t.name === entity.topic)?.subscriptions.find((s) => s.name === entity.subscription)?.counts ?? null;
  }, [ents, entity]);

  const [dlq, setDlq] = useState<boolean>(entity.dlq ?? (!!counts && counts.active === 0 && counts.deadLetter > 0));
  const [max, setMax] = useState(250);
  const accessKey = `access:${entity.ns.id}`;
  const access = useQuery<Access>(accessKey, () => window.bus.access(entity.ns));
  const refreshAccess = () => fetchQuery(accessKey, () => window.bus.access(entity.ns), true);
  // Don't peek until we know we're allowed to; if the permission check itself fails, try anyway.
  const allowed = access.data ? canRead(access.data) : !!access.error;
  const key = allowed ? `peek:${refKey(entity)}|${dlq ? "dlq" : "active"}|${max}|${access.data?.connectionString ? "cs" : "id"}` : null;
  const q = useQuery<Peeked>(key, async () => {
    const r = await window.bus.peek({
      ns: entity.ns,
      ...(entity.kind === "queue" ? { queue: entity.queue } : { topic: entity.topic, subscription: entity.subscription }),
      deadLetter: dlq,
      max,
    });
    const items = await Promise.all(r.messages.map(async (msg) => ({ msg, det: await detect(b64ToBytes(msg.body), msg.contentType) })));
    return { auth: r.auth, items: items.reverse(), at: Date.now() };
  });

  const [filter, setFilter] = useState("");
  const [reason, setReason] = useState<string | null>(null);
  const [range, setRange] = useState<[number, number] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [compare, setCompare] = useState<string | null>(null);

  const items = q.data?.items ?? [];
  const reasons = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of items) if (it.msg.deadLetterReason) m.set(it.msg.deadLetterReason, (m.get(it.msg.deadLetterReason) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [items]);

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return items.filter((it) => {
      if (reason && it.msg.deadLetterReason !== reason) return false;
      if (range && it.msg.enqueuedTime) {
        const t = new Date(it.msg.enqueuedTime).getTime();
        if (t < range[0] || t > range[1]) return false;
      }
      if (!f) return true;
      return (
        it.det.summary.toLowerCase().includes(f) ||
        (it.det.text ?? "").toLowerCase().includes(f) ||
        (it.msg.messageId ?? "").toLowerCase().includes(f) ||
        (it.msg.correlationId ?? "").toLowerCase().includes(f) ||
        (it.msg.subject ?? "").toLowerCase().includes(f) ||
        JSON.stringify(it.msg.applicationProperties).toLowerCase().includes(f)
      );
    });
  }, [items, filter, reason, range]);

  const sel = filtered.find((i) => i.msg.sequenceNumber === selected) ?? filtered[0] ?? null;
  const cmp = compare ? items.find((i) => i.msg.sequenceNumber === compare) ?? null : null;

  const blocked = (access.data && !canRead(access.data)) || q.errorInfo?.code === "NO_ACCESS";
  const Icon = entity.kind === "queue" ? Inbox : Box;
  const title = entity.kind === "queue" ? entity.queue : entity.subscription;

  return (
    <div className="flex h-full flex-col">
      <Header>
        <nav aria-label="Breadcrumb" className="no-drag -ml-1.5 flex min-w-0 items-center gap-1 text-[13px]">
          <Tip content={{ title: `Back to ${entity.ns.name}`, body: "Topology and totals for the whole namespace. Shortcut: ⌘[" }} side="bottom" className="min-w-[56px] shrink-[4]">
            <button onClick={onBack} className="flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-fg-3 transition-colors duration-150 hover:bg-bg-2 hover:text-fg">
              <Network className="size-3.5 shrink-0" />
              <span className="truncate">{entity.ns.name}</span>
            </button>
          </Tip>
          <ChevronRight className="size-3.5 shrink-0 text-line-2" />
          {entity.kind === "subscription" && (
            <>
              <Tip content={{ title: `Topic · ${entity.topic}`, body: "Opens the namespace, where this topic and all its subscriptions are drawn." }} side="bottom" className="min-w-[56px] shrink-[2]">
                <button onClick={onBack} className="flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-fg-3 transition-colors duration-150 hover:bg-bg-2 hover:text-fg">
                  <Layers className="size-3.5 shrink-0" />
                  <span className="truncate">{entity.topic}</span>
                </button>
              </Tip>
              <ChevronRight className="size-3.5 shrink-0 text-line-2" />
            </>
          )}
          <h1 title={title} className="flex min-w-[80px] shrink items-center gap-1.5 px-1.5 text-[14px] font-semibold tracking-tight">
            <Icon className="size-3.5 shrink-0 text-fg-3" />
            <span className="truncate">{title}</span>
          </h1>
        </nav>
        <Tip content={G.env[envOf(entity.ns.name)]} side="bottom"><EnvBadge env={envOf(entity.ns.name)} /></Tip>
        <NoDrag className="ml-auto shrink-0 pl-2">
          {q.data && (
            <Tip content={G.auth[q.data.auth]} side="bottom">
              <Chip tone={q.data.auth === "entra" ? "ok" : q.data.auth === "connection" ? "accent" : "warn"} className={cn("h-8 cursor-help px-2.5", q.data.auth === "connection" && "pr-1")}>
                {q.data.auth === "entra" ? <ShieldCheck /> : <KeyRound />}
                <span className="hidden min-[1600px]:inline">{{ entra: "Entra ID", sas: "SAS via ARM", connection: "Connection string" }[q.data.auth]}</span>
                {q.data.auth === "connection" && (
                  <Button variant="ghost" size="icon-sm" aria-label="Forget connection string" className="text-accent hover:text-accent" onClick={async () => { await window.bus.clearConnectionString({ ns: entity.ns }); refreshAccess(); }}>
                    <X />
                  </Button>
                )}
              </Chip>
            </Tip>
          )}
          {blocked && (
            <Tip content={G.access.locked} side="bottom">
              <Chip className="h-8 cursor-help px-2.5"><Lock /><span className="hidden min-[1600px]:inline">Counts only</span></Chip>
            </Tip>
          )}
          <Tabs
            id="dlq"
            value={dlq ? "dlq" : "active"}
            onChange={(v) => { setDlq(v === "dlq"); setSelected(null); setCompare(null); setReason(null); setRange(null); }}
            items={[
              { value: "active", label: <Tip content={G.ui.activeTab} side="bottom"><span className="flex items-center gap-1.5">Active {counts && <span className="tabular text-fg-3"><AnimatedNumber value={counts.active} /></span>}</span></Tip> },
              { value: "dlq", label: <Tip content={G.ui.dlqTab} side="bottom"><span className="flex items-center gap-1.5">Dead-letter {counts && <span className={cn("tabular", counts.deadLetter ? "text-bad" : "text-fg-3")}><AnimatedNumber value={counts.deadLetter} /></span>}</span></Tip> },
            ]}
          />
          <Tip content={G.ui.peekSize} side="bottom"><Select label="Peek size" value={max} onChange={setMax} options={[50, 250, 1000, 5000].map((n) => ({ value: n, label: `${n.toLocaleString()} messages` }))} /></Tip>
          <Tip content={G.ui.peek} side="bottom"><Button onClick={q.reload}>{q.loading ? <Spinner className="size-3" /> : <RefreshCw />} Peek</Button></Tip>
        </NoDrag>
      </Header>

      {q.error && !blocked && <div className="border-b border-bad/20 bg-bad/[0.06] px-5 py-2 text-[12px] text-bad">{q.error}</div>}

      {blocked ? (
        <AccessPanel
          ns={entity.ns}
          access={access.data ?? (q.errorInfo?.detail as Access)}
          rejected={q.errorInfo?.code === "NO_ACCESS"}
          user={peekCache<Sub[]>("subs")?.find((s) => s.id === entity.ns.subscriptionId)?.user}
          onConnected={refreshAccess}
        />
      ) : (
      <div className="flex min-h-0 flex-1">
        <section className="flex w-[400px] shrink-0 flex-col border-r border-line">
          <div className="space-y-3 border-b border-line p-3">
            <Field value={filter} onChange={setFilter} placeholder="Filter by body, id, property…" />
            {items.length > 1 && <Histogram items={items} range={range} onRange={setRange} />}
            {reasons.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {reasons.map(([r, n]) => (
                  <Tip key={r} content={{ title: G.dlqReason(r).title, body: `${G.dlqReason(r).body} ${G.ui.reasonChip.body}` }}>
                  <button aria-pressed={reason === r} onClick={() => setReason(reason === r ? null : r)} className="rounded-md">
                    <Chip tone={reason === r ? "bad" : "default"} className="cursor-pointer transition-colors duration-150 hover:border-line-2 hover:text-fg">{r} <span className="tabular opacity-60">{n}</span></Chip>
                  </button>
                  </Tip>
                ))}
              </div>
            )}
          </div>
          <div className="flex h-9 shrink-0 items-center justify-between border-b border-line px-3 text-[12px] text-fg-3">
            <span className="tabular">{q.data ? `${filtered.length} of ${items.length} peeked` : "—"}</span>
            {compare && (
              <Button variant="ghost" size="sm" onClick={() => setCompare(null)} className="-mr-1.5 text-accent hover:text-accent">
                <GitCompare /> Comparing #{compare} <X />
              </Button>
            )}
            {!compare && items.length > 1 && <Tip content={G.ui.compare} side="bottom"><span className="cursor-help">⌘-click a row to compare</span></Tip>}
          </div>
          {q.loading && !q.data ? (
            <div className="flex flex-1 items-center justify-center gap-2 text-[13px] text-fg-3"><Spinner /> Peeking messages</div>
          ) : !items.length && q.data ? (
            <Empty icon={dlq ? <Skull /> : <Inbox />} title={dlq ? "Dead-letter queue is empty" : "No active messages"}>
              Peek reads without locking, so messages consumed in real time may not show up here.
            </Empty>
          ) : (
            <MessageList
              items={filtered}
              selected={sel?.msg.sequenceNumber ?? null}
              compare={compare}
              onSelect={(s, meta) => (meta ? setCompare(compare === s ? null : s) : setSelected(s))}
            />
          )}
        </section>
        <section className="min-w-0 flex-1">
          <AnimatePresence mode="wait">
            {sel ? (
              <motion.div key={sel.msg.sequenceNumber + (cmp?.msg.sequenceNumber ?? "")} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }} className="h-full">
                <MessageDetail item={sel} compare={cmp && cmp !== sel ? cmp : null} />
              </motion.div>
            ) : (
              q.data && <Empty title="Select a message" />
            )}
          </AnimatePresence>
        </section>
      </div>
      )}
    </div>
  );
}

const fmtTag: Record<string, string> = { json: "JSON", xml: "XML", csv: "CSV", text: "TEXT", binary: "BIN", empty: "EMPTY" };

function MessageList({ items, selected, compare, onSelect }: { items: Item[]; selected: string | null; compare: string | null; onSelect: (seq: string, meta: boolean) => void }) {
  const parent = useRef<HTMLDivElement>(null);
  const v = useVirtualizer({ count: items.length, getScrollElement: () => parent.current, estimateSize: () => 72, overscan: 12 });
  return (
    <div ref={parent} className="flex-1 overflow-y-auto" role="listbox" aria-label="Messages">
      <div style={{ height: v.getTotalSize(), position: "relative" }}>
        {v.getVirtualItems().map((row) => {
          const it = items[row.index];
          const m = it.msg;
          const isSel = m.sequenceNumber === selected;
          const isCmp = m.sequenceNumber === compare;
          const ce = it.det.layers.some((l) => l.kind === "cloudevent");
          return (
            <button
              key={m.sequenceNumber}
              role="option"
              aria-selected={isSel}
              onClick={(e) => onSelect(m.sequenceNumber, e.metaKey || e.ctrlKey)}
              style={{ position: "absolute", top: 0, left: 0, width: "100%", height: row.size, transform: `translateY(${row.start}px)` }}
              className={cn("flex flex-col justify-center gap-1 border-b border-line/70 px-4 text-left transition-colors duration-150", isSel ? "bg-bg-2" : "hover:bg-bg-1")}
            >
              {isSel && <motion.span layoutId="msg-sel" className="absolute inset-y-0 left-0 w-[2px] bg-fg" transition={{ type: "spring", bounce: 0.1, duration: 0.25 }} />}
              {isCmp && <span className="absolute inset-y-0 left-0 w-[2px] bg-accent" />}
              <div className="flex items-center gap-2 text-[11px] text-fg-3">
                <Tip content={G.ui.seq}><span className="tabular font-mono">#{m.sequenceNumber}</span></Tip>
                <Tip content={ce ? G.tag.CE : G.format[it.det.format]}><span className={cn("inline-flex h-[18px] items-center rounded-[4px] px-1.5 font-mono text-[10px] font-medium", it.det.format === "binary" ? "bg-warn/10 text-warn" : "bg-bg-3 text-fg-2")}>{ce ? "CE" : fmtTag[it.det.format]}</span></Tip>
                {it.det.layers.some((l) => l.kind === "gzip") && <Tip content={G.tag.GZ}><span className="inline-flex h-[18px] items-center rounded-[4px] px-1.5 font-mono text-[10px] font-medium bg-tok-bool/10 text-tok-bool">GZ</span></Tip>}
                {it.det.mismatch && <Tip content={G.tag.mismatch}><span className="inline-flex h-[18px] items-center rounded-[4px] px-1.5 font-mono text-[10px] font-medium bg-warn/10 text-warn">≠ type</span></Tip>}
                {m.deliveryCount > 1 && <Tip content={G.ui.deliveryCount}><span className="tabular">↻{m.deliveryCount}</span></Tip>}
                <Tip content={{ title: "Enqueued", body: fmtTime(m.enqueuedTime) }} className="ml-auto"><span className="tabular">{ago(m.enqueuedTime)}</span></Tip>
              </div>
              <div className="truncate font-mono text-[12.5px] text-fg">{it.det.summary}</div>
              {(m.subject || m.deadLetterReason) && (
                <div className="truncate text-[12px] text-fg-3">
                  {m.deadLetterReason && <span className="text-bad/90">{m.deadLetterReason}</span>}
                  {m.deadLetterReason && m.subject && " · "}
                  {m.subject}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Histogram({ items, range, onRange }: { items: Item[]; range: [number, number] | null; onRange: (r: [number, number] | null) => void }) {
  const BINS = 48;
  const { bins, min, step, peak } = useMemo(() => {
    const ts = items.map((i) => (i.msg.enqueuedTime ? new Date(i.msg.enqueuedTime).getTime() : NaN)).filter((t) => !isNaN(t));
    const min = Math.min(...ts), max = Math.max(...ts);
    const step = Math.max(1, (max - min) / BINS);
    const bins = new Array(BINS).fill(0);
    for (const t of ts) bins[Math.min(BINS - 1, Math.floor((t - min) / step))]++;
    return { bins, min, step, peak: Math.max(...bins) };
  }, [items]);
  const fmt = (t: number) => new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  return (
    <div>
      <div className="flex h-10 w-full items-end gap-px">
        {bins.map((n, i) => {
          const lo = min + i * step, hi = lo + step;
          const on = range ? range[0] === lo : false;
          return (
            <Tip key={i} block className="h-full flex-1" content={n ? { title: `${n} message${n === 1 ? "" : "s"}`, body: `${fmt(lo)} – ${fmt(hi)}. Click to ${on ? "clear the filter" : "show only these"}.` } : G.ui.histogram}>
            <button
              onClick={() => n && onRange(on ? null : [lo, hi])}
              className="group flex h-full w-full items-end"
              aria-label={`${n} messages from ${fmt(lo)}`}
            >
              <motion.span
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ delay: i * 0.006, duration: 0.3 }}
                style={{ height: n ? `${Math.max(8, (n / peak) * 100)}%` : undefined, originY: 1 }}
                className={cn("block w-full rounded-[1.5px] transition-colors", !n ? "h-px bg-line" : on ? "bg-fg" : range ? "bg-line-2" : "bg-fg-3/60 group-hover:bg-fg-2")}
              />
            </button>
            </Tip>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-fg-3 tabular">
        <span>{fmt(min)}</span>
        {range && <button onClick={() => onRange(null)} className="text-accent hover:underline">clear range</button>}
        <span>{fmt(min + step * BINS)}</span>
      </div>
    </div>
  );
}
