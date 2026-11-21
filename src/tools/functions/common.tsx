import type { ReactNode } from "react";
import { Activity, Clock, Database, FileBox, GitBranch, Globe, Inbox, Radio, Waypoints, Zap } from "lucide-react";
import type { Component, Fn, FunctionApp, InsightsLink } from "../../types";
import { api } from "../../lib/api";
import { fetchQuery, useQuery } from "../../lib/query";
import { stored, store } from "../../lib/storage";
import { useNav } from "../../shell/nav";

export function triggerIcon(type: string): ReactNode {
  const t = type.toLowerCase();
  if (t.startsWith("http")) return <Globe />;
  if (t.startsWith("timer")) return <Clock />;
  if (t.startsWith("servicebus")) return <Radio />;
  if (t.startsWith("queue")) return <Inbox />;
  if (t.startsWith("blob")) return <FileBox />;
  if (t.startsWith("cosmos")) return <Database />;
  if (t.startsWith("eventhub")) return <Activity />;
  if (t.startsWith("eventgrid")) return <Waypoints />;
  if (t.startsWith("activity") || t.startsWith("orchestration") || t.startsWith("entity")) return <GitBranch />;
  return <Zap />;
}

// "0 0 2 * * *" → "Every day at 02:00". Falls back to the expression for anything unusual.
export function describeCron(expr: string) {
  const f = expr.trim().split(/\s+/);
  if (f.length !== 6) return expr;
  const [s, m, h, dom, mon, dow] = f;
  const pad = (x: string) => x.padStart(2, "0");
  const every = (x: string) => x.match(/^\*\/(\d+)$/)?.[1];
  const n = (x: string | undefined, unit: string) => (x === "1" ? `Every ${unit}` : `Every ${x} ${unit}s`);
  if (dom === "*" && mon === "*" && dow === "*") {
    if (s === "0" && every(m) && h === "*") return n(every(m), "minute");
    if (every(s) && m === "*" && h === "*") return n(every(s), "second");
    if (s === "0" && m === "*" && h === "*") return "Every minute";
    if (s === "0" && /^\d+$/.test(m) && h === "*") return `Every hour at :${pad(m)}`;
    if (s === "0" && /^\d+$/.test(m) && every(h)) return `${n(every(h), "hour")} at :${pad(m)}`;
    if (s === "0" && /^\d+$/.test(m) && /^\d+$/.test(h)) return `Every day at ${pad(h)}:${pad(m)}`;
  }
  return expr;
}

// One line describing what starts the function.
export function triggerSummary(f: Fn): string {
  const t = f.trigger;
  if (f.http) return `${f.http.methods.map((m) => m.toUpperCase()).join(", ")} /api/${f.http.route ?? f.name}`;
  if (t.type === "timerTrigger" && t.schedule) return describeCron(String(t.schedule));
  if (t.queueName) return `queue ${t.queueName}`;
  if (t.topicName) return `${t.topicName} / ${t.subscriptionName ?? "?"}`;
  if (t.containerName) return `container ${t.containerName}`;
  if (t.path) return String(t.path);
  if (t.eventHubName) return `event hub ${t.eventHubName}`;
  return t.type.replace(/Trigger$/, "");
}

// The app's Application Insights resource: picked by hand (remembered per app), else found by the main process.
export function useFnLink(app: FunctionApp, fns: Fn[] | undefined) {
  const { subs } = useNav();
  const manualKey = `fn.link.${app.id}`;
  const manual = stored<InsightsLink | null>(manualKey, null);
  const q = useQuery<InsightsLink | null>(fns && !manual ? `fnlink:${app.id}` : null, () => api.fn.insights({ app, functionNames: fns!.map((f) => f.name), subIds: subs.map((s) => s.id) }));
  const choose = (component: Component | null) => {
    store(manualKey, component ? { component, role: null, via: "manual" } : null);
    fetchQuery(`fnlink:${app.id}`, async () => (component ? { component, role: null, via: "manual" as const } : api.fn.insights({ app, functionNames: fns?.map((f) => f.name) ?? [], subIds: subs.map((s) => s.id) })), true);
  };
  return { link: manual ?? q.data ?? null, loading: !manual && (q.loading || !fns), error: q.error, choose };
}
