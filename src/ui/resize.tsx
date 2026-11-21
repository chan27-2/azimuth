// Resizable panes and columns, and collapsible side panels. Sizes are remembered per view on this machine.
// Double-click any handle to go back to the default size.
import { useCallback, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { PanelRight } from "lucide-react";
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
export type Col = { key: string; label: ReactNode; width: number; min?: number; flex?: boolean; align?: "right"; title?: string };

export function useColumns(id: string, cols: Col[]) {
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
  return { template, total, width, handle };
}

// A <th> with a stored width and a drag handle, for real tables (table-layout: fixed, plus a trailing
// empty <th /> so the last column doesn't stretch).
export function Th({ col, columns, className, children }: { col: Col; columns: ReturnType<typeof useColumns>; className?: string; children?: ReactNode }) {
  return (
    <th className={cn("relative truncate font-normal", col.align === "right" ? "text-right" : "text-left", className)} style={{ width: columns.width(col) }} title={col.title}>
      {children ?? col.label}
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
          {c.label}
          {columns.handle(c)}
        </div>
      ))}
    </div>
  );
}
