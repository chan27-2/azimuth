import { useCallback, useEffect, useSyncExternalStore } from "react";

export type QueryError = { message: string; code?: string; detail?: unknown };
type Entry<T> = { data?: T; error?: QueryError; loading: boolean; at?: number; promise?: Promise<void> };
const cache = new Map<string, Entry<unknown>>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => (listeners.add(l), () => listeners.delete(l));
const IDLE: Entry<never> = { loading: false };

export function fetchQuery<T>(key: string, fn: () => Promise<T>, force = false) {
  const cur = cache.get(key) as Entry<T> | undefined;
  if (cur?.promise && !force) return cur.promise;
  if (cur?.data !== undefined && !force) return Promise.resolve();
  const promise = fn().then(
    (data) => { cache.set(key, { data, loading: false, at: Date.now() }); emit(); },
    (e) => {
      cache.set(key, { ...cache.get(key), error: { message: e?.message ?? String(e), code: e?.code, detail: e?.detail }, loading: false, promise: undefined });
      emit();
    },
  );
  cache.set(key, { ...cur, loading: true, error: undefined, promise });
  emit();
  return promise;
}

export function useQuery<T>(key: string | null, fn: () => Promise<T>) {
  const entry = useSyncExternalStore(subscribe, () => (key ? (cache.get(key) as Entry<T>) ?? IDLE : IDLE));
  useEffect(() => {
    if (key) fetchQuery(key, fn);
    // fn is recreated each render; the key fully identifies the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const reload = useCallback(() => (key ? fetchQuery(key, fn, true) : Promise.resolve()), [key, fn]);
  return { data: entry.data as T | undefined, error: entry.error?.message, errorInfo: entry.error, loading: entry.loading || (!!key && !entry.data && !entry.error), at: entry.at, reload };
}

export function peekCache<T>(key: string) {
  return (cache.get(key) as Entry<T> | undefined)?.data;
}

// Drops cached results so they load again. Takes a key prefix or a predicate.
export function invalidate(match: string | ((key: string) => boolean)) {
  const hit = typeof match === "string" ? (k: string) => k.startsWith(match) : match;
  for (const k of [...cache.keys()]) if (hit(k)) cache.delete(k);
  emit();
}
