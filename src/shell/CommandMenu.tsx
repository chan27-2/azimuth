// ⌘K: jump to anything any tool has loaded, switch tools, or find a trace by id.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Box, CornerDownLeft, Inbox, LayoutGrid, Network, Radar, Search, Zap } from "lucide-react";
import type { Component, Entities, Fn, FunctionApp, Namespace } from "../types";
import { peekCache } from "../lib/query";
import { cn, envOf } from "../lib/util";
import { mod } from "../lib/platform";
import { Count, EnvBadge, Kbd } from "../ui/ui";
import { TOOLS, tool } from "./tools";
import { useNav } from "./nav";

type Hit = { id: string; label: string; hint: string; icon: ReactNode; dlq?: number; run: () => void; env?: ReturnType<typeof envOf>; kbd?: string };

const looksLikeTrace = (q: string) => /^[0-9a-f]{2}-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$|^[0-9a-f]{32}$/i.test(q.trim());

export function CommandMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { subs, go } = useNav();
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const all = useMemo<Hit[]>(() => {
    if (!open) return [];
    const hits: Hit[] = [
      { id: "home", label: "Home", hint: "All tools", icon: <LayoutGrid />, run: () => go({ tool: "home" }), kbd: mod("0") },
      ...TOOLS.map((t) => ({ id: `tool:${t.id}`, label: t.name, hint: t.product, icon: t.glyph("size-4"), run: () => go({ tool: t.id }), kbd: mod(t.key) })),
    ];
    for (const s of subs) {
      for (const ns of peekCache<Namespace[]>(`ns:${s.id}`) ?? []) {
        const env = envOf(ns.name);
        hits.push({ id: ns.id, label: ns.name, hint: `Service Bus · ${s.name}`, icon: <Network />, env, run: () => go({ tool: "sb", ns }) });
        const ents = peekCache<Entities>(`ent:${ns.id}`);
        for (const qu of ents?.queues ?? []) hits.push({ id: `${ns.id}/q/${qu.name}`, label: qu.name, hint: ns.name, icon: <Inbox />, env, dlq: qu.counts.deadLetter, run: () => go({ tool: "sb", ns, entity: { kind: "queue", ns, queue: qu.name } }) });
        for (const t of ents?.topics ?? [])
          for (const sb of t.subscriptions)
            hits.push({ id: `${ns.id}/s/${t.name}/${sb.name}`, label: `${t.name} / ${sb.name}`, hint: ns.name, icon: <Box />, env, dlq: sb.counts.deadLetter, run: () => go({ tool: "sb", ns, entity: { kind: "subscription", ns, topic: t.name, subscription: sb.name } }) });
      }
      for (const app of peekCache<FunctionApp[]>(`fnapps:${s.id}`) ?? []) {
        const env = envOf(app.name);
        hits.push({ id: app.id, label: app.name, hint: `Function app · ${s.name}`, icon: tool("fn").glyph("size-4"), env, run: () => go({ tool: "fn", app }) });
        for (const f of peekCache<Fn[]>(`fns:${app.id}`) ?? []) hits.push({ id: `${app.id}/${f.name}`, label: f.name, hint: app.name, icon: <Zap />, env, run: () => go({ tool: "fn", app, fn: f.name }) });
      }
      for (const c of peekCache<Component[]>(`aicomp:${s.id}`) ?? [])
        hits.push({ id: c.id, label: c.name, hint: `Application Insights · ${s.name}`, icon: tool("ai").glyph("size-4"), env: envOf(c.name), run: () => go({ tool: "ai", component: c }) });
    }
    return hits;
  }, [open, subs, go]);

  const results = useMemo<Hit[]>(() => {
    const trimmed = q.trim();
    const terms = trimmed.toLowerCase().split(/\s+/).filter(Boolean);
    const found = all.filter((h) => terms.every((t) => `${h.label} ${h.hint}`.toLowerCase().includes(t))).slice(0, 60);
    if (looksLikeTrace(trimmed))
      return [{ id: "trace", label: `Find trace ${trimmed.slice(0, 40)}`, hint: "Search Application Insights", icon: <Radar />, run: () => go({ tool: "ai", trace: { operationId: trimmed, subIds: subs.map((s) => s.id) } }) }, ...found];
    return found;
  }, [all, q, go, subs]);

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
            className="w-[680px] max-w-[calc(100vw-32px)] overflow-hidden rounded-xl border border-line-2 bg-bg-1 shadow-[0_24px_80px_rgba(0,0,0,0.7)]"
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
                placeholder="Search tools, namespaces, function apps, Insights resources… or paste a trace id"
                spellCheck={false}
                className="h-full flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-fg-3"
              />
            </div>
            <div className="max-h-[50vh] overflow-y-auto p-2">
              {!results.length && <div className="px-3 py-10 text-center text-[13px] text-fg-3">No matches. Resources appear here once their tool has loaded them.</div>}
              {results.map((h, i) => (
                <button key={h.id} onMouseMove={() => setIdx(i)} onClick={() => pick(h)} className={cn("relative flex h-10 w-full items-center gap-3 rounded-md px-3 text-left", i === idx ? "text-fg" : "text-fg-2")}>
                  {i === idx && <motion.span layoutId="cmd-sel" className="absolute inset-0 rounded-md bg-bg-3" transition={{ duration: 0.12 }} />}
                  <span className="relative flex text-fg-3 [&_svg]:size-4">{h.icon}</span>
                  <span className="relative truncate text-[13px]">{h.label}</span>
                  {h.env && <EnvBadge env={h.env} />}
                  {!!h.dlq && <Count value={h.dlq} tone="bad" title={`${h.dlq} dead-lettered`} />}
                  <span className="relative ml-auto truncate text-[12px] text-fg-3">{h.hint}</span>
                  {h.kbd && <span className="relative"><Kbd>{h.kbd}</Kbd></span>}
                  {i === idx && <CornerDownLeft className="relative size-3.5 shrink-0 text-fg-3" />}
                </button>
              ))}
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
