import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Box, CornerDownLeft, Inbox, Network, Search } from "lucide-react";
import type { Entities, EntityRef, Namespace, Sub } from "../types";
import { peekCache } from "../lib/query";
import { cn, envOf } from "../lib/util";
import { Count, EnvBadge, Kbd } from "./ui";

type Hit = { id: string; label: string; hint: string; icon: "ns" | "queue" | "sub"; dlq?: number; run: () => void; env: ReturnType<typeof envOf> };

export function CommandMenu({ open, onClose, subs, onNs, onEntity }: { open: boolean; onClose: () => void; subs: Sub[]; onNs: (n: Namespace) => void; onEntity: (e: EntityRef) => void }) {
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const all = useMemo<Hit[]>(() => {
    if (!open) return [];
    const hits: Hit[] = [];
    for (const s of subs) {
      for (const ns of peekCache<Namespace[]>(`ns:${s.id}`) ?? []) {
        const env = envOf(ns.name);
        hits.push({ id: ns.id, label: ns.name, hint: s.name, icon: "ns", env, run: () => onNs(ns) });
        const ents = peekCache<Entities>(`ent:${ns.id}`);
        for (const qu of ents?.queues ?? []) hits.push({ id: `${ns.id}/q/${qu.name}`, label: qu.name, hint: ns.name, icon: "queue", env, dlq: qu.counts.deadLetter, run: () => onEntity({ kind: "queue", ns, queue: qu.name }) });
        for (const t of ents?.topics ?? [])
          for (const sb of t.subscriptions)
            hits.push({ id: `${ns.id}/s/${t.name}/${sb.name}`, label: `${t.name} / ${sb.name}`, hint: ns.name, icon: "sub", env, dlq: sb.counts.deadLetter, run: () => onEntity({ kind: "subscription", ns, topic: t.name, subscription: sb.name }) });
      }
    }
    return hits;
  }, [open, subs, onNs, onEntity]);

  const results = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    return all.filter((h) => terms.every((t) => `${h.label} ${h.hint}`.toLowerCase().includes(t))).slice(0, 60);
  }, [all, q]);

  useEffect(() => { if (open) { setQ(""); setIdx(0); setTimeout(() => input.current?.focus(), 0); } }, [open]);

  const pick = (h: Hit | undefined) => { if (h) { h.run(); onClose(); } };

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-[14vh]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }} onMouseDown={onClose}>
          <motion.div
            role="dialog"
            aria-label="Jump to"
            initial={{ opacity: 0, scale: 0.97, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            onMouseDown={(e) => e.stopPropagation()}
            className="w-[640px] overflow-hidden rounded-xl border border-line-2 bg-bg-1 shadow-[0_24px_80px_rgba(0,0,0,0.7)]"
          >
            <div className="flex h-14 items-center gap-3 border-b border-line px-4">
              <Search className="size-4 text-fg-3" />
              <input
                ref={input}
                value={q}
                onChange={(e) => { setQ(e.target.value); setIdx(0); }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(i + 1, results.length - 1)); }
                  if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
                  if (e.key === "Enter") pick(results[idx]);
                  if (e.key === "Escape") onClose();
                }}
                placeholder="Search namespaces, topics, subscriptions, queues…"
                spellCheck={false}
                className="h-full flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-fg-3"
              />
            </div>
            <div className="max-h-[50vh] overflow-y-auto p-2">
              {!results.length && <div className="px-3 py-10 text-center text-[13px] text-fg-3">No matches. Entities appear here after their namespace has been opened once.</div>}
              {results.map((h, i) => {
                const Icon = h.icon === "ns" ? Network : h.icon === "queue" ? Inbox : Box;
                return (
                  <button key={h.id} onMouseMove={() => setIdx(i)} onClick={() => pick(h)} className={cn("relative flex h-10 w-full items-center gap-3 rounded-md px-3 text-left", i === idx ? "text-fg" : "text-fg-2")}>
                    {i === idx && <motion.span layoutId="cmd-sel" className="absolute inset-0 rounded-md bg-bg-3" transition={{ duration: 0.12 }} />}
                    <Icon className="relative size-4 text-fg-3" />
                    <span className="relative truncate text-[13px]">{h.label}</span>
                    <EnvBadge env={h.env} />
                    {!!h.dlq && <Count value={h.dlq} tone="bad" title={`${h.dlq} dead-lettered`} />}
                    <span className="relative ml-auto truncate text-[12px] text-fg-3">{h.hint}</span>
                    {i === idx && <CornerDownLeft className="relative size-3.5 text-fg-3" />}
                  </button>
                );
              })}
            </div>
            <div className="flex h-10 items-center gap-4 border-t border-line px-4 text-[12px] text-fg-3">
              <span className="flex items-center gap-1.5"><Kbd>↑</Kbd><Kbd>↓</Kbd> Navigate</span>
              <span className="flex items-center gap-1.5"><Kbd>↵</Kbd> Open</span>
              <span className="flex items-center gap-1.5"><Kbd>esc</Kbd> Close</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
