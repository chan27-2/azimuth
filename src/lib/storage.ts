// Per-machine UI preferences in localStorage. Every access is guarded: storage can be unavailable.
// Demo mode keeps its own copy, so fictional and real places never mix.
const demo = !!(window as unknown as { azimuthIpc?: { demo?: boolean } }).azimuthIpc?.demo;
const k = (key: string) => (demo ? `demo.${key}` : key);
export function stored<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(k(key)); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}
export function store(key: string, v: unknown) {
  try { localStorage.setItem(k(key), JSON.stringify(v)); } catch { /* storage unavailable */ }
}
