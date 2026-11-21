import { useMemo } from "react";
import { motion } from "motion/react";
import { cn } from "../../lib/util";

function flatten(v: unknown, path = "$", out = new Map<string, string>()) {
  if (v && typeof v === "object" && Object.keys(v).length) {
    for (const [k, c] of Object.entries(v)) flatten(c, Array.isArray(v) ? `${path}[${k}]` : `${path}.${k}`, out);
  } else out.set(path, JSON.stringify(v));
  return out;
}

export type DiffSide = { label: string; value: unknown };

export function DiffView({ a, b, onlyChanges }: { a: DiffSide; b: DiffSide; onlyChanges: boolean }) {
  const rows = useMemo(() => {
    const fa = flatten(a.value), fb = flatten(b.value);
    const keys = Array.from(new Set([...fa.keys(), ...fb.keys()]));
    return keys.map((k) => {
      const x = fa.get(k), y = fb.get(k);
      const kind = x === undefined ? "added" : y === undefined ? "removed" : x === y ? "same" : "changed";
      return { k, x, y, kind };
    });
  }, [a, b]);
  const shown = onlyChanges ? rows.filter((r) => r.kind !== "same") : rows;
  const n = rows.filter((r) => r.kind !== "same").length;
  return (
    <div className="selectable font-mono text-[12px]">
      <div className="mb-3 flex items-center gap-3 font-sans text-[12px] text-fg-3">
        <span>{n} difference{n === 1 ? "" : "s"} across {rows.length} paths</span>
      </div>
      <div className="overflow-hidden rounded-lg border border-line">
        <div className="grid grid-cols-[minmax(160px,1.2fr)_1fr_1fr] border-b border-line bg-bg-2 font-sans text-[11px] font-medium text-fg-3">
          <div className="px-3 py-2">Path</div>
          <div className="border-l border-line px-3 py-2">{a.label}</div>
          <div className="border-l border-line px-3 py-2">{b.label}</div>
        </div>
        {shown.map((r, i) => (
          <motion.div
            key={r.k}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i * 0.01, 0.2) }}
            className="grid grid-cols-[minmax(160px,1.2fr)_1fr_1fr] border-b border-line/60 last:border-0"
          >
            <div className="break-all px-3 py-1.5 text-fg-2">{r.k}</div>
            <div className={cn("break-all border-l border-line px-3 py-1.5", r.kind === "removed" || r.kind === "changed" ? "bg-bad/[0.08] text-bad" : "text-fg-3")}>{r.x ?? "—"}</div>
            <div className={cn("break-all border-l border-line px-3 py-1.5", r.kind === "added" || r.kind === "changed" ? "bg-ok/[0.08] text-ok" : "text-fg-3")}>{r.y ?? "—"}</div>
          </motion.div>
        ))}
        {!shown.length && <div className="px-3 py-6 text-center font-sans text-fg-3">Payloads are identical.</div>}
      </div>
    </div>
  );
}
