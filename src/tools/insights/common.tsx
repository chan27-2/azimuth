import { useEffect, useState } from "react";
import type { Component, Range, Trace } from "../../types";
import { api } from "../../lib/api";
import { useQuery } from "../../lib/query";
import { Select, Tip } from "../../ui/ui";
import * as G from "../../lib/glossary";
import { stored, store } from "../../lib/storage";

export const RANGES: { value: Range; label: string }[] = [
  { value: "30m", label: "Last 30 minutes" }, { value: "1h", label: "Last hour" }, { value: "6h", label: "Last 6 hours" },
  { value: "24h", label: "Last 24 hours" }, { value: "3d", label: "Last 3 days" }, { value: "7d", label: "Last 7 days" }, { value: "30d", label: "Last 30 days" },
];

// One time range for all of Insights and Functions history, remembered between launches.
export function useRange(): [Range, (r: Range) => void] {
  const [range, setRange] = useState<Range>(() => stored("insights.range", "24h"));
  return [range, (r) => { setRange(r); store("insights.range", r); }];
}

export function RangeSelect({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  return (
    <Tip content={G.ai.range} side="bottom">
      <Select value={value} onChange={onChange} options={RANGES} label="Time range" />
    </Tip>
  );
}

// Loads one operation from a resource; "Look in other resources" widens it to every resource in the
// subscriptions that has the same operation id.
export function useTrace(component: Component | undefined, operationId: string | undefined, at?: string, subIds: string[] = []) {
  const key = component && operationId ? `aitrace:${component.id}|${operationId}` : null;
  const q = useQuery<Trace>(key, () => api.ai.trace({ component: component!, operationId: operationId!, at }));
  const [wide, setWide] = useState<{ state: "idle" | "searching" | "done"; trace?: Trace; error?: string }>({ state: "idle" });
  useEffect(() => setWide({ state: "idle" }), [key]);
  const widen = async () => {
    if (!operationId) return;
    setWide({ state: "searching" });
    try {
      const found = await api.ai.findTrace({ subIds: [...new Set([component?.subscriptionId, ...subIds].filter(Boolean) as string[])], operationId, at });
      const comps = found.hits.map((h) => h.component);
      const trace = comps.length ? await api.ai.traceAcross({ components: comps, operationId, at }) : undefined;
      setWide({ state: "done", trace });
    } catch (e) {
      setWide({ state: "idle", error: e instanceof Error ? e.message : String(e) });
    }
  };
  return { trace: wide.trace ?? q.data, loading: q.loading, error: q.error ?? wide.error, widen, wide: wide.state };
}
