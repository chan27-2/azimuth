import { useState } from "react";
import type { Fn, FunctionApp } from "../../types";
import { api } from "../../lib/api";
import { useQuery } from "../../lib/query";
import { cn, envOf } from "../../lib/util";
import * as G from "../../lib/glossary";
import { EnvBadge, Spinner, Tip } from "../../ui/ui";
import { FunctionsGlyph } from "../../ui/Logo";
import { Leaf, ResourceRow, SubGroup, SubscriptionList, TreeIndent, TreeNote } from "../../ui/tree";
import { useNav } from "../../shell/nav";
import { triggerIcon, triggerSummary } from "./common";

export function FunctionsNav() {
  const { subs, place, go } = useNav();
  const sel = place.tool === "fn" ? place : null;
  return (
    <SubscriptionList subs={subs}>
      {(sub) => (
        <SubGroup<FunctionApp> key={sub.id} sub={sub} queryKey={`fnapps:${sub.id}`} load={() => api.fn.apps(sub.id)}>
          {(app) => <AppItem key={app.id} app={app} selectedApp={sel?.app?.id} selectedFn={sel?.fn} onApp={() => go({ tool: "fn", app })} onFn={(fn) => go({ tool: "fn", app, fn })} />}
        </SubGroup>
      )}
    </SubscriptionList>
  );
}

function AppItem({ app, selectedApp, selectedFn, onApp, onFn }: { app: FunctionApp; selectedApp?: string; selectedFn?: string; onApp: () => void; onFn: (fn: string) => void }) {
  const active = selectedApp === app.id;
  const [expanded, setExpanded] = useState<boolean | null>(null);
  const open = expanded ?? active;
  const env = envOf(app.name);
  const stopped = app.state !== "Running";
  return (
    <ResourceRow
      icon={<FunctionsGlyph className={cn("size-3.5", stopped && "opacity-40")} />}
      label={app.name}
      active={active && !selectedFn}
      open={open}
      onToggle={() => setExpanded(!open)}
      onSelect={() => { onApp(); setExpanded(true); }}
      trailing={
        <>
          {stopped && <Tip content={{ title: app.state, body: "The app isn't running, so its functions don't run and can't be started." }} side="right"><span className="text-[10px] font-semibold uppercase tracking-wider text-fg-3">{app.state}</span></Tip>}
          <Tip content={G.env[env]} side="right"><EnvBadge env={env} /></Tip>
        </>
      }
    >
      {open && <FunctionList app={app} selected={active ? selectedFn : undefined} onSelect={onFn} />}
    </ResourceRow>
  );
}

function FunctionList({ app, selected, onSelect }: { app: FunctionApp; selected?: string; onSelect: (fn: string) => void }) {
  const q = useQuery<Fn[]>(`fns:${app.id}`, () => api.fn.functions(app));
  if (q.loading && !q.data) return <TreeIndent><TreeNote><Spinner className="size-3" /> Loading</TreeNote></TreeIndent>;
  if (q.error) return <TreeIndent><TreeNote tone="bad">{q.error}</TreeNote></TreeIndent>;
  if (!q.data?.length) return <TreeIndent><TreeNote>No functions</TreeNote></TreeIndent>;
  return (
    <TreeIndent>
      {q.data.map((f) => (
        <Tip key={f.name} content={{ title: `${G.fn.trigger(f.trigger.type).title} · ${triggerSummary(f)}`, body: f.disabled ? G.fn.disabled : G.fn.trigger(f.trigger.type).body }} side="right" block>
          <Leaf icon={triggerIcon(f.trigger.type)} label={f.name} muted={f.disabled} selected={selected === f.name} onClick={() => onSelect(f.name)} trailing={f.disabled ? <span className="text-[10px] uppercase tracking-wider text-fg-3">off</span> : undefined} />
        </Tip>
      ))}
    </TreeIndent>
  );
}
