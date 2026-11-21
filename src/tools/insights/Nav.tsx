import { useState } from "react";
import { Radar } from "lucide-react";
import type { Component } from "../../types";
import { api } from "../../lib/api";
import { envOf } from "../../lib/util";
import * as G from "../../lib/glossary";
import { EnvBadge, Field, Tip } from "../../ui/ui";
import { InsightsGlyph } from "../../ui/Logo";
import { ResourceRow, SubGroup, SubscriptionList } from "../../ui/tree";
import { useNav } from "../../shell/nav";

export function InsightsNav() {
  const { subs, place, go } = useNav();
  const [trace, setTrace] = useState("");
  const selected = place.tool === "ai" ? place.component?.id : undefined;
  return (
    <>
      <form className="px-1 pt-1" onSubmit={(e) => { e.preventDefault(); if (trace.trim()) { go({ tool: "ai", trace: { operationId: trace.trim(), subIds: subs.map((s) => s.id) } }); setTrace(""); } }}>
        <Tip content={G.ai.findTrace} side="right" block>
          <Field size="sm" value={trace} onChange={setTrace} icon={<Radar />} placeholder="Find trace by id…" className="font-mono" wrapperClassName="w-full" />
        </Tip>
      </form>
      <SubscriptionList subs={subs}>
        {(sub) => (
          <SubGroup<Component> key={sub.id} sub={sub} queryKey={`aicomp:${sub.id}`} load={() => api.ai.components(sub.id)}>
            {(c) => {
              const env = envOf(c.name);
              return (
                <ResourceRow
                  key={c.id}
                  expandable={false}
                  icon={<InsightsGlyph className="size-3.5" />}
                  label={c.name}
                  active={selected === c.id}
                  open={false}
                  onToggle={() => {}}
                  onSelect={() => go({ tool: "ai", component: c })}
                  trailing={<Tip content={G.env[env]} side="right"><EnvBadge env={env} /></Tip>}
                />
              );
            }}
          </SubGroup>
        )}
      </SubscriptionList>
    </>
  );
}
