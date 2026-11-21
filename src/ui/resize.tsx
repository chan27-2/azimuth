// Resizable panes and columns, and collapsible side panels. Sizes are remembered per view on this machine.
// Double-click any handle to go back to the default size.
import { useCallback, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDown, ArrowUp, PanelRight } from "lucide-react";
import { stored, store } from "../lib/storage";
import { cn } from "../lib/util";
import { Button, Tip } from "./ui";

export function useStoredSize(key: string, initial: number): [number, (n: number) => void, () => void] {
  const [size, setSize] = useState(() => stored(`size.${key}`, initial));
  const set = useCallback((n: number) => { setSize(n); store(`size.${key}`, n); }, [key]);
  return [size, set, () => set(initial)];
}

// A vertical drag handle. `edge` says which side of its container it sits on; dragging away from the
// container makes it bigger.
export function ResizeHandle({ size, onSize, onReset, min, max, edge = "right", className, label = "Resize" }: {
  size: number; onSize: (n: number) => void; onReset?: () => void; min: number; max: number; edge?: "left" | "right"; className?: string; label?: string;
}) {
  const start = useRef({ x: 0, size: 0 });
  const [dragging, setDragging] = useState(false);
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={Math.round(size)}
      tabIndex={0}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { x: e.clientX, size };
        setDragging(true);
      }}
      onPointerMove={(e) => {
        if (!dragging) return;
        const delta = (e.clientX - start.current.x) * (edge === "right" ? 1 : -1);
        onSize(Math.round(Math.min(max, Math.max(min, start.current.size + delta))));
      }}
      onPointerUp={() => setDragging(false)}
      onDoubleClick={(e) => { e.stopPropagation(); onReset?.(); }}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 40 : 10;
        if (e.key === "ArrowLeft") onSize(Math.min(max, Math.max(min, size + (edge === "right" ? -step : step))));
        if (e.key === "ArrowRight") onSize(Math.min(max, Math.max(min, size + (edge === "right" ? step : -step))));
      }}
      className={cn("no-drag group absolute inset-y-0 z-10 w-2 cursor-col-resize", edge === "right" ? "right-0 translate-x-1/2" : "left-0 -translate-x-1/2", className)}
    >
      <span className={cn("absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors duration-150", dragging ? "bg-fg-3" : "group-hover:bg-line-2 group-focus-visible:bg-fg-3")} />
    </div>
  );
}

// A pane with a fixed, draggable width (lists beside a detail view).
export function ResizablePane({ id, initial, min, max, className, children }: { id: string; initial: number; min: number; max: number; className?: string; children: ReactNode }) {
  const [w, setW, reset] = useStoredSize(id, initial);
  return (
    <div className={cn("relative shrink-0", className)} style={{ width: w }}>
      {children}
      <ResizeHandle size={w} onSize={setW} onReset={reset} min={min} max={max} label="Resize list" />
    </div>
  );
}

// ─── Collapsible right-hand panels ───────────────────────────────────────────
export function usePanel(id: string, initiallyOpen = true): [boolean, () => void, (v: boolean) => void] {
  const [open, setOpen] = useState(() => stored(`panel.${id}`, initiallyOpen));
  const set = useCallback((v: boolean) => { setOpen(v); store(`panel.${id}`, v); }, [id]);
  return [open, () => set(!open), set];
}

export function PanelToggle({ open, onToggle, label = "details" }: { open: boolean; onToggle: () => void; label?: string }) {
  return (
    <Tip content={open ? `Hide ${label}` : `Show ${label}`} side="bottom">
      <Button variant="ghost" size="icon" aria-label={open ? `Hide ${label}` : `Show ${label}`} aria-pressed={open} onClick={onToggle} className={cn(open && "text-fg")}>
        <PanelRight />
      </Button>
    </Tip>
  );
}

export function SidePanel({ id, open, initial = 380, min = 280, max = 760, children }: { id: string; open: boolean; initial?: number; min?: number; max?: number; children: ReactNode }) {
  const [w, setW, reset] = useStoredSize(`panel.${id}`, initial);
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.aside
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: w, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ type: "spring", bounce: 0, duration: 0.25 }}
          className="relative shrink-0 border-l border-line"
        >
          <div className="h-full overflow-hidden" style={{ width: w }}>{children}</div>
          <ResizeHandle size={w} onSize={setW} onReset={reset} min={min} max={max} edge="left" label="Resize panel" />
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

// ─── Columns ──────────────────────────────────────────────────────────────────
// Each column has a stored width; one column can be `flex` and takes the remaining space.
export type Col = { key: string; label: ReactNode; width: number; min?: number; flex?: boolean; align?: "right"; title?: string; sortable?: boolean };

// ─── Sorting ──────────────────────────────────────────────────────────────────
export type Sort = { key: string; dir: "asc" | "desc" } | null;

// Numbers (and numeric strings like "200" or "14.2"), then dates/ISO strings, then text with natural
// ordering ("item2" before "item10"). Empty values always go last.
export function compareValues(a: unknown, b: unknown): number {
  const empty = (v: unknown) => v == null || v === "" || (typeof v === "number" && Number.isNaN(v));
  if (empty(a) || empty(b)) return empty(a) && empty(b) ? 0 : empty(a) ? 1 : -1;
  const na = typeof a === "number" ? a : typeof a === "string" && /^-?\d+(\.\d+)?$/.test(a.trim()) ? Number(a) : NaN;
  const nb = typeof b === "number" ? b : typeof b === "string" && /^-?\d+(\.\d+)?$/.test(b.trim()) ? Number(b) : NaN;
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  const sa = typeof a === "object" ? JSON.stringify(a) : String(a);
  const sb = typeof b === "object" ? JSON.stringify(b) : String(b);
  return sa.localeCompare(sb, undefined, { numeric: true, sensitivity: "base" });
}

export function sortRows<T>(rows: T[], sort: Sort, get: (row: T, key: string) => unknown): T[] {
  if (!sort) return rows;
  const dir = sort.dir === "asc" ? 1 : -1;
  // Stable: ties keep the original (server) order. Empty values stay last in both directions.
  return rows
    .map((row, i) => ({ row, i, v: get(row, sort.key) }))
    .sort((x, y) => {
      const ex = x.v == null || x.v === "", ey = y.v == null || y.v === "";
      if (ex !== ey) return ex ? 1 : -1;
      return compareValues(x.v, y.v) * dir || x.i - y.i;
    })
    .map((x) => x.row);
}

export function useSort(id: string): [Sort, (key: string) => void] {
  const [sort, setSort] = useState<Sort>(() => stored(`sort.${id}`, null));
  // Click cycles: ascending → descending → back to the original order.
  const toggle = (key: string) => setSort((cur) => {
    const next: Sort = cur?.key !== key ? { key, dir: "asc" } : cur.dir === "asc" ? { key, dir: "desc" } : null;
    store(`sort.${id}`, next);
    return next;
  });
  return [sort, toggle];
}

export function SortLabel({ label, active, dir, align, onClick }: { label: ReactNode; active: boolean; dir?: "asc" | "desc"; align?: "right"; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={active ? (dir === "asc" ? "Sorted ascending. Click for descending." : "Sorted descending. Click to reset.") : "Click to sort"}
      className={cn("inline-flex max-w-full items-center gap-1 rounded-sm transition-colors duration-150 hover:text-fg", active && "text-fg", align === "right" && "flex-row-reverse")}
    >
      <span className="truncate">{label}</span>
      {active ? (dir === "asc" ? <ArrowUp className="size-3 shrink-0" /> : <ArrowDown className="size-3 shrink-0" />) : null}
    </button>
  );
}

export function useColumns(id: string, cols: Col[]) {
  const [sort, toggleSort] = useSort(id);
  const [widths, setWidths] = useState<Record<string, number>>(() => stored(`cols.${id}`, {}));
  const width = (c: Col) => widths[c.key] ?? (c.flex ? c.min ?? 160 : c.width);
  const setWidth = (key: string, n: number) => setWidths((prev) => { const next = { ...prev, [key]: n }; store(`cols.${id}`, next); return next; });
  const reset = (key: string) => setWidths((prev) => { const next = { ...prev }; delete next[key]; store(`cols.${id}`, next); return next; });
  // The flex column fills spare room; dragging its edge sets the least it may shrink to. When columns add
  // up to more than the window, the list scrolls sideways (give its content `minWidth: total`).
  const template = cols.map((c) => (c.flex ? `minmax(${width(c)}px, 1fr)` : `${width(c)}px`)).join(" ");
  const total = cols.reduce((n, c) => n + width(c), 0);
  const handle = (c: Col) => (
    <ResizeHandle size={width(c)} onSize={(n) => setWidth(c.key, n)} onReset={() => reset(c.key)} min={c.flex ? 80 : c.min ?? 48} max={1600} label={`Resize ${typeof c.label === "string" ? c.label : c.key} column`} />
  );
  return { template, total, width, handle, sort, toggleSort };
}

// A <th> with a stored width and a drag handle, for real tables (table-layout: fixed). A flex column
// takes the spare width; give the table `minWidth: columns.total` so it scrolls instead of squashing.
export function Th({ col, columns, className, children }: { col: Col; columns: ReturnType<typeof useColumns>; className?: string; children?: ReactNode }) {
  return (
    <th className={cn("relative truncate font-normal", col.align === "right" ? "text-right" : "text-left", className)} style={{ width: col.flex ? undefined : columns.width(col) }} title={col.title}>
      {col.sortable === false ? children ?? col.label : (
        <SortLabel label={children ?? col.label} active={columns.sort?.key === col.key} dir={columns.sort?.dir} align={col.align} onClick={() => columns.toggleSort(col.key)} />
      )}
      {columns.handle(col)}
    </th>
  );
}

// A header row for a grid laid out with `template`. Pass `gap`/padding classes to match the rows.
export function ColumnHeader({ cols, columns, className }: { cols: Col[]; columns: ReturnType<typeof useColumns>; className?: string }) {
  return (
    <div className={cn("sticky top-0 z-10 grid shrink-0 border-b border-line bg-bg text-[11px] text-fg-3", className)} style={{ gridTemplateColumns: columns.template }}>
      {cols.map((c) => (
        <div key={c.key} title={c.title} className={cn("relative truncate py-1.5 pr-3", c.align === "right" && "text-right")}>
          {c.sortable === false ? c.label : <SortLabel label={c.label} active={columns.sort?.key === c.key} dir={columns.sort?.dir} align={c.align} onClick={() => columns.toggleSort(c.key)} />}
          {columns.handle(c)}
        </div>
      ))}
    </div>
  );
}
