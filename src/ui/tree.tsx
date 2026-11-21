// Sidebar tree used by every tool: accounts → subscriptions → resources → children.
// A tool supplies how to load a subscription's resources and how to draw one; grouping, loading,
// errors and the "subscription no longer exists" state are handled here once.
import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronRight, CircleSlash } from "lucide-react";
import type { Sub } from "../types";
import { useQuery } from "../lib/query";
import { cn } from "../lib/util";
import * as G from "../lib/glossary";
import { Spinner, Tip } from "./ui";

export const rowBase = "relative flex h-8 w-full items-center gap-2 rounded-md text-left text-[13px] transition-colors duration-150";

export function Disclosure({ open, children }: { open: boolean; children: ReactNode }) {
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

export const Chevron = ({ open }: { open: boolean }) => (
  <motion.span className="flex text-fg-3" animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.15 }}>
    <ChevronRight className="size-3" />
  </motion.span>
);

export const Avatar = ({ name, className }: { name: string; className?: string }) => (
  <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full border border-line-2 bg-bg-2 text-[10px] font-semibold uppercase text-fg-2", className)}>{name.slice(0, 1)}</span>
);

export const byAccount = (subs: Sub[]) => {
  const m = new Map<string, Sub[]>();
  for (const s of subs) m.set(s.user ?? "unknown", [...(m.get(s.user ?? "unknown") ?? []), s]);
  return [...m.entries()];
};

// Subscriptions, grouped under their az account when more than one account is shown.
export function SubscriptionList({ subs, children }: { subs: Sub[]; children: (sub: Sub) => ReactNode }) {
  const groups = byAccount(subs);
  if (groups.length <= 1) return <>{subs.map((s) => children(s))}</>;
  return <>{groups.map(([user, owned]) => <AccountSection key={user} user={user} owned={owned}>{children}</AccountSection>)}</>;
}

function AccountSection({ user, owned, children }: { user: string; owned: Sub[]; children: (sub: Sub) => ReactNode }) {
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
      <Disclosure open={open}>{owned.map((s) => children(s))}</Disclosure>
    </div>
  );
}

// One subscription's resources of one kind. Hidden when the subscription has none.
export function SubGroup<T extends { id: string; name: string }>({ sub, queryKey, load, children }: {
  sub: Sub; queryKey: string; load: () => Promise<T[]>; children: (item: T) => ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const q = useQuery<T[]>(queryKey, load);
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
      ) : q.errorInfo?.code === "FORBIDDEN" ? (
        <Tip content={{ title: "No access", body: q.error }} side="right" block>
          <div className="flex h-7 items-center gap-2 pl-7 text-[12px] text-fg-3"><CircleSlash className="size-3.5" />No permission to list these</div>
        </Tip>
      ) : (
        q.error && <div className="px-3 py-1 text-[12px] text-bad">{q.error}</div>
      )}
      <Disclosure open={open && !!q.data}>
        <div className="mt-0.5 space-y-px">{[...(q.data ?? [])].sort((a, b) => a.name.localeCompare(b.name)).map((item) => children(item))}</div>
      </Disclosure>
    </div>
  );
}

// A child row (queue, function, …) with a sliding selection highlight.
export function Leaf({ icon, label, selected, onClick, trailing, muted, title }: {
  icon: ReactNode; label: string; selected: boolean; onClick: () => void; trailing?: ReactNode; muted?: boolean; title?: string;
}) {
  return (
    <button onClick={onClick} title={title ?? label} className={cn(rowBase, "h-7 pl-2 pr-1.5 text-[12.5px]", selected ? "text-fg" : muted ? "text-fg-3 hover:bg-bg-2 hover:text-fg-2" : "text-fg-2 hover:bg-bg-2 hover:text-fg")}>
      {selected && <motion.span layoutId="leaf-sel" className="absolute inset-0 rounded-md bg-bg-3" transition={{ type: "spring", bounce: 0.1, duration: 0.3 }} />}
      <span className="relative flex text-fg-3 [&_svg]:size-3.5">{icon}</span>
      <span className="relative min-w-0 flex-1 truncate">{label}</span>
      {trailing && <span className="relative flex shrink-0 items-center gap-1">{trailing}</span>}
    </button>
  );
}

// A resource row (namespace, function app, …): chevron to expand, label to select.
export function ResourceRow({ icon, label, active, open, onToggle, onSelect, trailing, children, expandable = true }: {
  icon: ReactNode; label: string; active: boolean; open: boolean; onToggle: () => void; onSelect: () => void; trailing?: ReactNode; children?: ReactNode; expandable?: boolean;
}) {
  return (
    <div>
      <div className={cn(rowBase, "pr-2", active ? "bg-bg-3 text-fg" : "text-fg-2 hover:bg-bg-2 hover:text-fg")}>
        {expandable ? (
          <button aria-label={open ? "Collapse" : "Expand"} onClick={onToggle} className="flex h-full w-7 shrink-0 items-center justify-center rounded-l-md">
            <Chevron open={open} />
          </button>
        ) : (
          <span className="w-2 shrink-0" />
        )}
        <button onClick={onSelect} className="flex h-full min-w-0 flex-1 items-center gap-2">
          <span className="flex shrink-0 [&_svg]:size-3.5">{icon}</span>
          <span title={label} className="min-w-0 flex-1 truncate">{label}</span>
          {trailing}
        </button>
      </div>
      {expandable && <Disclosure open={open}>{children}</Disclosure>}
    </div>
  );
}

export const TreeIndent = ({ children }: { children: ReactNode }) => <div className="relative ml-[13px] space-y-px border-l border-line py-0.5 pl-2">{children}</div>;
export const TreeNote = ({ children, tone }: { children: ReactNode; tone?: "bad" }) => (
  <div className={cn("flex min-h-7 items-center gap-2 py-1 pl-2 pr-2 text-[12px]", tone === "bad" ? "text-bad" : "text-fg-3")}>{children}</div>
);
