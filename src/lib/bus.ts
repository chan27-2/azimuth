// Typed client for the main process. Rebuilds errors with their code and detail (see electron/preload.cjs).
type Result = { ok: true; data: unknown } | { ok: false; error: string; code?: string; detail?: unknown };
type Ipc = { invoke(name: string, arg?: unknown): Promise<Result>; openExternal(url: string): Promise<void> };

const ipc = (window as unknown as { busIpc: Ipc }).busIpc;

const call = (name: string) => async (arg?: unknown) => {
  const r = await ipc.invoke(name, arg);
  if (!r.ok) throw Object.assign(new Error(r.error), { code: r.code, detail: r.detail });
  return r.data;
};

const names = ["account", "subscriptions", "addAccount", "cancelAddAccount", "namespaces", "entities", "access", "setConnectionString", "clearConnectionString", "peek"] as const;

window.bus = { ...Object.fromEntries(names.map((n) => [n, call(n)])), openExternal: ipc.openExternal } as unknown as Window["bus"];
