import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Box, ChevronRight, ChevronUp, CircleSlash, Inbox, Layers, Lock, Network, Search, UserPlus } from "lucide-react";
import { canRead, type Access, type Account, type EntityRef, type Namespace, type Sub, type Entities } from "../types";
import { fetchQuery, invalidate, useQuery } from "../lib/query";
import { cn, envOf } from "../lib/util";
import { Button, Checkbox, Count, EnvBadge, Field, Kbd, Spinner, Tip } from "./ui";
import { Logo } from "./Logo";
import * as G from "../lib/glossary";

type Props = {
  account?: Account;
  subs: Sub[];
  selectedNs: Namespace | null;
  selectedEntity: EntityRef | null;
  onSelectNs: (ns: Namespace) => void;
  onSelectEntity: (e: EntityRef) => void;
  onOpenSearch: () => void;
};

export const SIDEBAR_MIN = 240;
export const SIDEBAR_MAX = 480;

export function Sidebar(p: Props & { width: number; collapsed: boolean; onResize: (w: number) => void; allSubs: Sub[]; hidden: string[]; onHiddenChange: (ids: string[]) => void }) {
  const [resizing, setResizing] = useState(false);
  const start = useRef({ x: 0, w: 0 });
  return (
    <motion.aside
      initial={false}
      animate={{ width: p.collapsed ? 0 : p.width }}
      transition={resizing ? { duration: 0 } : { type: "spring", bounce: 0, duration: 0.3 }}
      className="relative h-full shrink-0 overflow-hidden border-r border-line bg-bg"
      style={{ borderRightWidth: p.collapsed ? 0 : 1 }}
    >
      <div className="flex h-full flex-col" style={{ width: p.width }}>
        <div className="drag flex h-[52px] shrink-0 items-center pl-[118px]">
          <div className="flex items-center gap-2">
            <Logo className="size-6" />
            <span className="text-[14px] font-semibold tracking-[-0.02em] text-fg">Busscope</span>
          </div>
        </div>
        <div className="px-3 pb-1">
          <button
            onClick={p.onOpenSearch}
            className="flex h-8 w-full items-center gap-2 rounded-md border border-line bg-bg-1 pl-2.5 pr-1.5 text-[13px] text-fg-3 transition-colors duration-150 hover:border-line-2 hover:text-fg-2"
          >
            <Search className="size-3.5" />
            <span className="flex-1 text-left">Jump to…</span>
            <Kbd>⌘K</Kbd>
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 pb-4">
          {!p.subs.length && p.allSubs.length > 0 && (
            <div className="px-3 py-8 text-center text-[12px] leading-relaxed text-fg-3">All subscriptions are hidden. Choose which to show from the accounts menu below.</div>
          )}
          {accounts(p.subs).length > 1
            ? accounts(p.subs).map(([user, owned]) => <AccountSection key={user} user={user} owned={owned} {...p} />)
            : p.subs.map((s) => <SubGroup key={s.id} sub={s} {...p} />)}
        </nav>
        {p.account && <AccountsMenu account={p.account} all={p.allSubs} hidden={p.hidden} onHiddenChange={p.onHiddenChange} />}
      </div>
      {!p.collapsed && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            start.current = { x: e.clientX, w: p.width };
            setResizing(true);
          }}
          onPointerMove={(e) => {
            if (!resizing) return;
            p.onResize(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, start.current.w + e.clientX - start.current.x)));
          }}
          onPointerUp={() => setResizing(false)}
          onDoubleClick={() => p.onResize(300)}
          className="no-drag group absolute inset-y-0 right-0 z-10 w-2 translate-x-1/2 cursor-col-resize"
        >
          <span className={cn("absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors duration-150", resizing ? "bg-fg-3" : "group-hover:bg-line-2")} />
        </div>
      )}
    </motion.aside>
  );
}

const accounts = (subs: Sub[]) => {
  const m = new Map<string, Sub[]>();
  for (const s of subs) m.set(s.user ?? "unknown", [...(m.get(s.user ?? "unknown") ?? []), s]);
  return [...m.entries()];
};

const Avatar = ({ name, className }: { name: string; className?: string }) => (
  <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full border border-line-2 bg-bg-2 text-[10px] font-semibold uppercase text-fg-2", className)}>{name.slice(0, 1)}</span>
);

function AccountSection({ user, owned, ...p }: { user: string; owned: Sub[] } & Props) {
  const [open, setOpen] = useState(true);
  return (
    <div className="mt-3 border-b border-line/60 pb-2 last:border-0">
      <Tip content={{ title: user, body: `${owned.length} subscription${owned.length === 1 ? "" : "s"} in tenant ${owned[0]?.tenantId ?? "unknown"}. ${G.access.noAccount}` }} side="right" block>
        <button onClick={() => setOpen(!open)} className="flex h-8 w-full min-w-0 items-center gap-2 rounded-md px-2 text-[12px] text-fg-2 transition-colors duration-150 hover:bg-bg-2 hover:text-fg">
          <Avatar name={user} className="size-5 text-[9px]" />
          <span className="min-w-0 flex-1 truncate">{user}</span>
          <Chevron open={open} />
        </button>
      </Tip>
      <Disclosure open={open}>{owned.map((s) => <SubGroup key={s.id} sub={s} {...p} />)}</Disclosure>
    </div>
  );
}

function AccountsMenu({ account, all, hidden, onHiddenChange }: { account: Account; all: Sub[]; hidden: string[]; onHiddenChange: (ids: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const groups = accounts(all);
  const shownUsers = accounts(all.filter((s) => !hidden.includes(s.id))).map(([u]) => u);
  const shownCount = all.length - hidden.filter((id) => all.some((s) => s.id === id)).length;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onKey); };
  }, [open]);

  const toggle = (ids: string[], show: boolean) => onHiddenChange(show ? hidden.filter((id) => !ids.includes(id)) : [...new Set([...hidden, ...ids])]);

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      await window.bus.addAccount();
      invalidate("ns:");
      await fetchQuery("subs", () => window.bus.subscriptions(), true);
    } catch (e) {
      if ((e as { code?: string }).code !== "CANCELLED") setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const q = query.trim().toLowerCase();
  const filtered = groups
    .map(([user, subs]) => [user, q ? subs.filter((s) => `${s.name} ${user}`.toLowerCase().includes(q)) : subs] as const)
    .filter(([, subs]) => subs.length);

  return (
    <div ref={root} className="relative shrink-0 border-t border-line p-2">
      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="Accounts and subscriptions"
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.14 }}
            style={{ transformOrigin: "bottom center" }}
            className="absolute inset-x-2 bottom-[calc(100%+6px)] z-40 flex max-h-[70vh] flex-col overflow-hidden rounded-lg border border-line-2 bg-bg-1 shadow-[0_-12px_40px_rgba(0,0,0,0.55)]"
          >
            <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
              <div>
                <div className="text-[13px] font-medium text-fg">Show in sidebar</div>
                <div className="text-[11px] text-fg-3">{shownCount} of {all.length} subscriptions · {groups.length} account{groups.length === 1 ? "" : "s"}</div>
              </div>
              {hidden.length > 0 && <Button variant="ghost" size="sm" onClick={() => onHiddenChange([])}>Show all</Button>}
            </div>
            {all.length > 6 && (
              <div className="border-b border-line p-2">
                <Field size="sm" value={query} onChange={setQuery} placeholder="Filter accounts and subscriptions" autoFocus />
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto p-1">
              {filtered.map(([user, subs]) => {
                const ids = subs.map((s) => s.id);
                const shown = ids.filter((id) => !hidden.includes(id)).length;
                return (
                  <div key={user} className="py-0.5">
                    <button onClick={() => toggle(ids, shown < ids.length)} className="flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left hover:bg-bg-3">
                      <Checkbox checked={shown === ids.length} mixed={shown > 0 && shown < ids.length} />
                      <Avatar name={user} className="size-5 text-[9px]" />
                      <span className="min-w-0 flex-1 truncate text-[12.5px] text-fg">{user}</span>
                      <span className="text-[11px] tabular text-fg-3">{shown}/{ids.length}</span>
                    </button>
                    {subs.map((s) => {
                      const on = !hidden.includes(s.id);
                      return (
                        <button key={s.id} onClick={() => toggle([s.id], !on)} className="flex h-7 w-full items-center gap-2.5 rounded-md pl-7 pr-2 text-left hover:bg-bg-3">
                          <Checkbox checked={on} />
                          <span className={cn("min-w-0 flex-1 truncate text-[12px]", on ? "text-fg-2" : "text-fg-3")}>{s.name}</span>
                          {s.isDefault && <Tip content="The subscription az uses by default (az account show)."><span className="text-[10px] uppercase tracking-wider text-fg-3">default</span></Tip>}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
              {!filtered.length && <div className="px-3 py-6 text-center text-[12px] text-fg-3">No matches</div>}
            </div>
            {!account.demo && (
              <div className="border-t border-line p-1">
                {busy ? (
                  <div className="flex h-9 items-center gap-2.5 px-2 text-[12px] text-fg-2">
                    <Spinner className="size-3" />
                    <span className="flex-1">Waiting for you to sign in in the browser…</span>
                    <Button variant="ghost" size="sm" onClick={() => window.bus.cancelAddAccount()}>Cancel</Button>
                  </div>
                ) : (
                  <Tip content={{ title: "Add an Azure account", body: "Runs az login in your browser. The account is added alongside the ones you have. If you close the browser instead, press Cancel." }} side="right" block>
                    <button onClick={add} className="flex h-9 w-full items-center gap-2.5 rounded-md px-2 text-left text-[12.5px] text-fg-2 hover:bg-bg-3 hover:text-fg">
                      <UserPlus className="size-3.5" /> Add account
                    </button>
                  </Tip>
                )}
                {error && <div className="px-2 pb-2 text-[11px] text-bad">{error}</div>}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
        className={cn("flex h-11 w-full items-center gap-2.5 rounded-md px-2 text-left transition-colors duration-150 hover:bg-bg-2", open && "bg-bg-2")}
      >
        <div className="flex -space-x-1.5">{(shownUsers.length ? shownUsers : [account.user]).slice(0, 3).map((u) => <Avatar key={u} name={u} className="size-7 text-[11px] ring-2 ring-bg" />)}</div>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-[12px] text-fg-2">{groups.length > 1 ? `${groups.length} accounts` : account.user}</div>
          <div className="truncate text-[11px] text-fg-3">
            {busy ? "Signing in…" : account.demo ? "Demo data, not a real tenant" : hidden.length ? `${shownCount} of ${all.length} subscriptions shown` : "Signed in via az CLI"}
          </div>
        </div>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.15 }} className="flex text-fg-3"><ChevronUp className="size-3.5" /></motion.span>
      </button>
    </div>
  );
}

function Disclosure({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }} className="overflow-hidden">
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const Chevron = ({ open }: { open: boolean }) => (
  <motion.span className="flex text-fg-3" animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.15 }}>
    <ChevronRight className="size-3" />
  </motion.span>
);

function SubGroup({ sub, ...p }: { sub: Sub } & Props) {
  const [open, setOpen] = useState(true);
  const q = useQuery(`ns:${sub.id}`, () => window.bus.namespaces(sub.id));
  if (q.data && !q.data.length) return null;
  return (
    <div className="mt-4 first:mt-3">
      <button onClick={() => setOpen(!open)} className="flex h-6 w-full items-center gap-1.5 rounded-md px-2 text-[11px] font-medium text-fg-3 transition-colors duration-150 hover:text-fg-2">
        <Chevron open={open} />
        <span className="truncate">{sub.name}</span>
        <span className="ml-auto tabular">{q.loading ? <Spinner className="size-3" /> : q.data?.length}</span>
      </button>
      {q.errorInfo?.code === "SUBSCRIPTION_NOT_FOUND" ? (
        <Tip content={{ title: "Subscription not found", body: q.error }} side="right" block>
          <div className="flex h-7 items-center gap-2 pl-7 text-[12px] text-fg-3"><CircleSlash className="size-3.5" />No longer exists in Azure</div>
        </Tip>
      ) : (
        q.error && <div className="px-3 py-1 text-[12px] text-bad">{q.error}</div>
      )}
      <Disclosure open={open && !!q.data}>
        <div className="mt-0.5 space-y-px">
          {[...(q.data ?? [])].sort((a, b) => a.name.localeCompare(b.name)).map((ns) => <NsItem key={ns.id} ns={ns} {...p} />)}
        </div>
      </Disclosure>
    </div>
  );
}

const rowBase = "relative flex h-8 w-full items-center gap-2 rounded-md text-left text-[13px] transition-colors duration-150";

function NsItem({ ns, selectedNs, selectedEntity, onSelectNs, onSelectEntity }: { ns: Namespace } & Props) {
  const active = selectedNs?.id === ns.id;
  const [expanded, setExpanded] = useState<boolean | null>(null);
  const open = expanded ?? active;
  const env = envOf(ns.name);
  const acc = useQuery<Access>(`access:${ns.id}`, () => window.bus.access(ns));
  const locked = acc.data && !canRead(acc.data);
  return (
    <div>
      <div className={cn(rowBase, "pr-2", active && !selectedEntity ? "bg-bg-3 text-fg" : "text-fg-2 hover:bg-bg-2 hover:text-fg")}>
        <button aria-label={open ? "Collapse" : "Expand"} onClick={() => setExpanded(!open)} className="flex h-full w-7 shrink-0 items-center justify-center rounded-l-md">
          <Chevron open={open} />
        </button>
        <button onClick={() => { onSelectNs(ns); setExpanded(true); }} className="flex h-full min-w-0 flex-1 items-center gap-2">
          <Network className={cn("size-3.5 shrink-0", env === "prod" ? "text-bad" : "text-fg-3")} />
          <span title={ns.name} className="min-w-0 flex-1 truncate">{ns.name}</span>
          {locked && <Tip content={G.access.locked} side="right"><Lock className="size-3.5 shrink-0 text-fg-3" aria-label="Counts only" /></Tip>}
          <Tip content={G.env[env]} side="right"><EnvBadge env={env} /></Tip>
        </button>
      </div>
      <Disclosure open={open}>
        <EntityTree ns={ns} selected={selectedEntity} onSelect={onSelectEntity} />
      </Disclosure>
    </div>
  );
}

function EntityTree({ ns, selected, onSelect }: { ns: Namespace; selected: EntityRef | null; onSelect: (e: EntityRef) => void }) {
  const q = useQuery<Entities>(`ent:${ns.id}`, () => window.bus.entities(ns));
  if (q.loading && !q.data) return <div className="flex h-7 items-center gap-2 pl-9 text-[12px] text-fg-3"><Spinner className="size-3" /> Loading</div>;
  if (q.error) return <div className="py-1.5 pl-9 pr-2 text-[12px] text-bad">{q.error}</div>;
  if (!q.data) return null;
  const isSel = (r: EntityRef) =>
    selected?.ns.id === ns.id &&
    (r.kind === "queue" ? selected.kind === "queue" && selected.queue === r.queue : selected.kind === "subscription" && selected.topic === r.topic && selected.subscription === r.subscription);
  return (
    <div className="relative ml-[13px] space-y-px border-l border-line py-0.5 pl-2">
      {!q.data.queues.length && !q.data.topics.length && <div className="flex h-7 items-center pl-2 text-[12px] text-fg-3">No entities</div>}
      {q.data.queues.map((qu) => {
        const ref: EntityRef = { kind: "queue", ns, queue: qu.name };
        return <Leaf key={qu.name} icon={<Inbox />} label={qu.name} active={qu.counts.active} dlq={qu.counts.deadLetter} selected={isSel(ref)} onClick={() => onSelect(ref)} />;
      })}
      {q.data.topics.map((t) => (
        <div key={t.name}>
          <Tip content={{ title: `Topic · ${t.name}`, body: G.stats.topics.body }} side="right" block>
            <div className="flex h-7 min-w-0 items-center gap-2 pl-2 text-[12px] text-fg-3">
              <Layers className="size-3.5 shrink-0" />
              <span className="truncate">{t.name}</span>
            </div>
          </Tip>
          <div className="ml-[13px] space-y-px border-l border-line pl-2">
            {t.subscriptions.map((s) => {
              const ref: EntityRef = { kind: "subscription", ns, topic: t.name, subscription: s.name };
              return <Leaf key={s.name} icon={<Box />} label={s.name} active={s.counts.active} dlq={s.counts.deadLetter} selected={isSel(ref)} onClick={() => onSelect(ref)} />;
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function Leaf({ icon, label, active, dlq, selected, onClick }: { icon: ReactNode; label: string; active: number; dlq: number; selected: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={cn(rowBase, "h-7 pl-2 pr-1.5 text-[12.5px]", selected ? "text-fg" : "text-fg-2 hover:bg-bg-2 hover:text-fg")}>
      {selected && <motion.span layoutId="leaf-sel" className="absolute inset-0 rounded-md bg-bg-3" transition={{ type: "spring", bounce: 0.1, duration: 0.3 }} />}
      <span className="relative flex text-fg-3 [&_svg]:size-3.5">{icon}</span>
      <span title={label} className="relative min-w-0 flex-1 truncate">{label}</span>
      {active > 0 && <Tip content={{ title: `${active.toLocaleString()} active`, body: G.ui.sidebarActive.body }} side="right"><Count value={active} /></Tip>}
      {dlq > 0 && <Tip content={{ title: `${dlq.toLocaleString()} dead-lettered`, body: G.ui.sidebarDlq.body }} side="right"><Count value={dlq} tone="bad" /></Tip>}
    </button>
  );
}
