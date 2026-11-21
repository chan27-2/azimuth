import { useState } from "react";
import { Box, Inbox, Layers, Lock, Network } from "lucide-react";
import { canRead, type Access, type Entities, type EntityRef, type Namespace } from "../../types";
import { api } from "../../lib/api";
import { useQuery } from "../../lib/query";
import { cn, envOf } from "../../lib/util";
import * as G from "../../lib/glossary";
import { Count, EnvBadge, Spinner, Tip } from "../../ui/ui";
import { Leaf, ResourceRow, SubGroup, SubscriptionList, TreeIndent, TreeNote } from "../../ui/tree";
import { useNav } from "../../shell/nav";

export function ServiceBusNav() {
  const { subs, place, go } = useNav();
  const sel = place.tool === "sb" ? place : null;
  return (
    <SubscriptionList subs={subs}>
      {(sub) => (
        <SubGroup<Namespace> key={sub.id} sub={sub} queryKey={`ns:${sub.id}`} load={() => api.sb.namespaces(sub.id)}>
          {(ns) => <NsItem key={ns.id} ns={ns} selectedNs={sel?.ns ?? null} selectedEntity={sel?.entity ?? null} onSelectNs={(n) => go({ tool: "sb", ns: n })} onSelectEntity={(e) => go({ tool: "sb", ns: e.ns, entity: e })} />}
        </SubGroup>
      )}
    </SubscriptionList>
  );
}

function NsItem({ ns, selectedNs, selectedEntity, onSelectNs, onSelectEntity }: {
  ns: Namespace; selectedNs: Namespace | null; selectedEntity: EntityRef | null; onSelectNs: (n: Namespace) => void; onSelectEntity: (e: EntityRef) => void;
}) {
  const active = selectedNs?.id === ns.id;
  const [expanded, setExpanded] = useState<boolean | null>(null);
  const open = expanded ?? active;
  const env = envOf(ns.name);
  const acc = useQuery<Access>(`access:${ns.id}`, () => api.sb.access(ns));
  const locked = acc.data && !canRead(acc.data);
  return (
    <ResourceRow
      icon={<Network className={cn(env === "prod" ? "text-bad" : "text-fg-3")} />}
      label={ns.name}
      active={active && !selectedEntity}
      open={open}
      onToggle={() => setExpanded(!open)}
      onSelect={() => { onSelectNs(ns); setExpanded(true); }}
      trailing={
        <>
          {locked && <Tip content={G.access.locked} side="right"><Lock className="size-3.5 shrink-0 text-fg-3" aria-label="Counts only" /></Tip>}
          <Tip content={G.env[env]} side="right"><EnvBadge env={env} /></Tip>
        </>
      }
    >
      <EntityTree ns={ns} selected={selectedEntity} onSelect={onSelectEntity} />
    </ResourceRow>
  );
}

function EntityTree({ ns, selected, onSelect }: { ns: Namespace; selected: EntityRef | null; onSelect: (e: EntityRef) => void }) {
  const q = useQuery<Entities>(`ent:${ns.id}`, () => api.sb.entities(ns));
  if (q.loading && !q.data) return <TreeIndent><TreeNote><Spinner className="size-3" /> Loading</TreeNote></TreeIndent>;
  if (q.error) return <TreeIndent><TreeNote tone="bad">{q.error}</TreeNote></TreeIndent>;
  if (!q.data) return null;
  const isSel = (r: EntityRef) =>
    selected?.ns.id === ns.id &&
    (r.kind === "queue" ? selected.kind === "queue" && selected.queue === r.queue : selected.kind === "subscription" && selected.topic === r.topic && selected.subscription === r.subscription);
  const counts = (active: number, dlq: number) => (
    <>
      {active > 0 && <Tip content={{ title: `${active.toLocaleString()} active`, body: G.ui.sidebarActive.body }} side="right"><Count value={active} /></Tip>}
      {dlq > 0 && <Tip content={{ title: `${dlq.toLocaleString()} dead-lettered`, body: G.ui.sidebarDlq.body }} side="right"><Count value={dlq} tone="bad" /></Tip>}
    </>
  );
  return (
    <TreeIndent>
      {!q.data.queues.length && !q.data.topics.length && <TreeNote>No entities</TreeNote>}
      {q.data.queues.map((qu) => {
        const ref: EntityRef = { kind: "queue", ns, queue: qu.name };
        return <Leaf key={qu.name} icon={<Inbox />} label={qu.name} selected={isSel(ref)} onClick={() => onSelect(ref)} trailing={counts(qu.counts.active, qu.counts.deadLetter)} />;
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
              return <Leaf key={s.name} icon={<Box />} label={s.name} selected={isSel(ref)} onClick={() => onSelect(ref)} trailing={counts(s.counts.active, s.counts.deadLetter)} />;
            })}
          </div>
        </div>
      ))}
    </TreeIndent>
  );
}
