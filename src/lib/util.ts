export const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export type Env = "prod" | "preview" | "dev" | "ci" | "other";
export function envOf(name: string): Env {
  if (/(^|-)prod(-|$)/.test(name)) return "prod";
  if (/(^|-)preview(-|$)/.test(name)) return "preview";
  if (/(^|-)ci(-|$)/.test(name)) return "ci";
  if (/(^|-)dev(-|$)/.test(name)) return "dev";
  return "other";
}

export function ago(iso: string | null | undefined) {
  if (!iso) return "—";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return `${Math.max(0, Math.floor(s))}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  if (s < 86400 * 365) return `${Math.floor(s / 86400 / 30)}mo ago`;
  return `${Math.floor(s / 86400 / 365)}y ago`;
}

export const fmtTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—";

export const compact = (n: number) => (n >= 10000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k` : n.toLocaleString());

// W3C traceparent: 00-<trace-id>-<span-id>-<flags>; Diagnostic-Id uses the same format.
export function traceIdOf(props: Record<string, unknown>): string | null {
  const v = props["traceparent"] ?? props["Diagnostic-Id"] ?? props["diagnostic-id"];
  if (typeof v !== "string") return null;
  const m = v.match(/^[0-9a-f]{2}-([0-9a-f]{32})-[0-9a-f]{16}-[0-9a-f]{2}$/i);
  return m ? m[1] : null;
}

export async function copy(text: string) {
  await navigator.clipboard.writeText(text);
}

export function fmtMs(ms: number | null | undefined) {
  if (ms == null || !Number.isFinite(ms)) return "—";
  if (ms < 1) return `${ms.toFixed(2)}ms`;
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

export const SEVERITY = ["Verbose", "Info", "Warning", "Error", "Critical"] as const;

export const pct = (part: number, whole: number) => (whole ? `${((part / whole) * 100).toFixed(part / whole < 0.1 ? 2 : 1)}%` : "0%");
