// Typed client for the main process (electron/main.js lists every channel). Rebuilds errors with their
// code and detail, which the context bridge would otherwise drop (see electron/preload.cjs).
import type { Api } from "../types";

type Result = { ok: true; data: unknown } | { ok: false; error: string; code?: string; detail?: unknown };
type Ipc = { invoke(name: string, arg?: unknown): Promise<Result>; openExternal(url: string): Promise<void>; platform: string; onNav(cb: (cmd: "back" | "forward") => void): () => void };

const ipc = (window as unknown as { azimuthIpc: Ipc }).azimuthIpc;

const call = (name: string) => async (arg?: unknown) => {
  const r = await ipc.invoke(name, arg);
  if (!r.ok) throw Object.assign(new Error(r.error), { code: r.code, detail: r.detail });
  return r.data;
};

const channels = {
  core: ["account", "subscriptions", "addAccount", "cancelAddAccount"],
  sb: ["namespaces", "entities", "access", "setConnectionString", "clearConnectionString", "peek"],
  fn: ["apps", "functions", "access", "insights", "stats", "invocations", "findInvocation", "run", "cancelRun"],
  ai: ["components", "overview", "requests", "logs", "trace", "traceAcross", "findTrace", "query"],
} as const;

export const api = Object.fromEntries(
  Object.entries(channels).map(([tool, names]) => [tool, Object.fromEntries(names.map((n) => [n, call(`${tool}.${n}`)]))]),
) as unknown as Api;

export const openExternal = (url: string) => ipc.openExternal(url);

// Back/forward from outside the page: the macOS swipe gesture (when set to three fingers), Windows
// browser keys and some mice. Returns an unsubscribe function.
export const onNavCommand = (cb: (cmd: "back" | "forward") => void) => ipc.onNav?.(cb) ?? (() => {});
