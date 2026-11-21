// Design system. Every control is h-8 (32px), radius 6px, 13px text, and shares one focus ring.
// Surfaces: bg → bg-1 (fields, cards) → bg-2 (hover) → bg-3 (selected). Borders: line → line-2 on hover/focus.
import { animate, motion, useMotionValue, useTransform, AnimatePresence } from "motion/react";
import { createPortal } from "react-dom";
import { createContext, forwardRef, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronDown, ChevronRight, Copy, PanelLeft, Search, X } from "lucide-react";
import { isMac, isWindows, mod } from "../lib/platform";
import { cn, copy, compact, type Env } from "../lib/util";

export const ring = "outline-none focus-visible:ring-2 focus-visible:ring-fg/15 focus-visible:ring-offset-0";

// ─── Button ──────────────────────────────────────────────────────────────────
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "danger" | "secondary" | "ghost"; size?: "sm" | "md" | "icon" | "icon-sm" };
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = "secondary", size = "md", className, ...p }, ref) {
  return (
    <button
      ref={ref}
      {...p}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-[background-color,border-color,color] duration-150 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-3.5 [&_svg]:shrink-0",
        ring,
        variant === "primary" && "border border-fg bg-fg text-bg hover:bg-fg/85",
        variant === "danger" && "border border-bad bg-bad text-white hover:bg-bad/85",
        variant === "secondary" && "border border-line bg-bg-1 text-fg-2 hover:border-line-2 hover:bg-bg-2 hover:text-fg",
        variant === "ghost" && "text-fg-3 hover:bg-bg-2 hover:text-fg",
        size === "md" && "h-8 px-3 text-[13px]",
        size === "sm" && "h-7 px-2.5 text-[12px]",
        size === "icon" && "size-8",
        size === "icon-sm" && "size-6 [&_svg]:size-3.5",
        className,
      )}
    />
  );
});

// ─── Field (search / text input) ─────────────────────────────────────────────
type FieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "onChange"> & {
  value: string;
  onChange: (v: string) => void;
  icon?: ReactNode;
  trailing?: ReactNode;
  size?: "sm" | "md";
  wrapperClassName?: string;
};
export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field({ value, onChange, icon = <Search />, trailing, size = "md", wrapperClassName, className, ...p }, ref) {
  return (
    <label
      className={cn(
        "flex items-center gap-2 rounded-md border border-line bg-bg-1 text-fg-3 transition-[border-color,box-shadow] duration-150 hover:border-line-2",
        "focus-within:border-line-2 focus-within:shadow-[0_0_0_3px_rgba(255,255,255,0.05)]",
        "[&_svg]:size-3.5 [&_svg]:shrink-0",
        size === "md" ? "h-8 px-2.5" : "h-7 px-2",
        wrapperClassName,
      )}
    >
      {icon}
      <input
        ref={ref}
        {...p}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        className={cn("h-full min-w-0 flex-1 bg-transparent text-fg outline-none placeholder:text-fg-3", size === "md" ? "text-[13px]" : "text-[12px]", className)}
      />
      {value ? (
        <button type="button" aria-label="Clear" onClick={() => onChange("")} className="-mr-1 inline-flex size-5 items-center justify-center rounded text-fg-3 hover:bg-bg-3 hover:text-fg">
          <X className="!size-3" />
        </button>
      ) : (
        trailing
      )}
    </label>
  );
});

// ─── Select ──────────────────────────────────────────────────────────────────
export function Select<T extends string | number>({ value, onChange, options, label, align = "end" }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; label?: string; align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    setHi(Math.max(0, options.findIndex((o) => o.value === value)));
    const onDown = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open, options, value]);

  const choose = (v: T) => { onChange(v); setOpen(false); };

  return (
    <div ref={root} className="relative">
      <Button
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={id}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) { e.preventDefault(); setOpen(true); return; }
          if (!open) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setHi((i) => Math.min(i + 1, options.length - 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setHi((i) => Math.max(i - 1, 0)); }
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(options[hi].value); }
          if (e.key === "Escape") setOpen(false);
        }}
        className="gap-2 pl-3 pr-2.5"
      >
        <span className="text-fg">{current?.label}</span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.15 }} className="flex text-fg-3">
          <ChevronDown />
        </motion.span>
      </Button>
      <AnimatePresence>
        {open && (
          <motion.ul
            id={id}
            role="listbox"
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -2, scale: 0.98 }}
            transition={{ duration: 0.12 }}
            style={{ transformOrigin: align === "end" ? "top right" : "top left" }}
            className={cn("absolute top-[calc(100%+6px)] z-40 min-w-full overflow-hidden rounded-lg border border-line-2 bg-bg-1 p-1 shadow-[0_12px_32px_rgba(0,0,0,0.55)]", align === "end" ? "right-0" : "left-0")}
          >
            {options.map((o, i) => (
              <li
                key={String(o.value)}
                role="option"
                aria-selected={o.value === value}
                onMouseEnter={() => setHi(i)}
                onClick={() => choose(o.value)}
                className={cn("flex h-8 cursor-default items-center gap-6 whitespace-nowrap rounded-md pl-2.5 pr-2 text-[13px]", i === hi ? "bg-bg-3 text-fg" : "text-fg-2")}
              >
                <span className="flex-1">{o.label}</span>
                <Check className={cn("size-3.5", o.value === value ? "text-fg" : "invisible")} />
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Switch ──────────────────────────────────────────────────────────────────
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={cn("group inline-flex h-8 items-center gap-2 rounded-md text-[12px] text-fg-2 hover:text-fg", ring)}>
      <span className={cn("relative h-4 w-7 rounded-full border transition-colors duration-150", checked ? "border-fg bg-fg" : "border-line-2 bg-bg-3")}>
        <motion.span
          animate={{ x: checked ? 12 : 0 }}
          transition={{ type: "spring", stiffness: 600, damping: 35 }}
          className={cn("absolute left-[1px] top-[1px] size-3 rounded-full", checked ? "bg-bg" : "bg-fg-3")}
        />
      </span>
      {label}
    </button>
  );
}

// ─── Tabs (segmented) ────────────────────────────────────────────────────────
export function Tabs<T extends string>({ value, onChange, items, id }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode }[]; id: string }) {
  return (
    <div role="tablist" className="inline-flex h-8 items-center gap-0.5 rounded-md border border-line bg-bg-1 p-[3px]">
      {items.map((it) => (
        <button
          key={it.value}
          role="tab"
          aria-selected={value === it.value}
          onClick={() => onChange(it.value)}
          className={cn("relative h-full whitespace-nowrap rounded-[4px] px-2.5 text-[12px] font-medium transition-colors duration-150 [&_svg]:size-3.5", ring, value === it.value ? "text-fg" : "text-fg-3 hover:text-fg-2")}
        >
          {value === it.value && <motion.span layoutId={`tab-${id}`} className="absolute inset-0 rounded-[4px] bg-bg-3 shadow-[0_1px_2px_rgba(0,0,0,0.4)]" transition={{ type: "spring", bounce: 0.12, duration: 0.3 }} />}
          <span className="relative flex items-center gap-1.5">{it.label}</span>
        </button>
      ))}
    </div>
  );
}

// ─── Display bits ────────────────────────────────────────────────────────────
export function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const mv = useMotionValue(value);
  const text = useTransform(mv, (v) => compact(Math.round(v)));
  useEffect(() => {
    const c = animate(mv, value, { duration: 0.5, ease: "easeOut" });
    return c.stop;
  }, [value, mv]);
  return <motion.span className={cn("tabular", className)}>{text}</motion.span>;
}

const envStyles: Record<Env, string> = {
  prod: "text-bad bg-bad/10 border-bad/25",
  preview: "text-warn bg-warn/10 border-warn/25",
  dev: "text-fg-3 bg-bg-2 border-line-2",
  ci: "text-tok-bool bg-tok-bool/10 border-tok-bool/25",
  other: "",
};
export function EnvBadge({ env, className }: { env: Env; className?: string }) {
  if (env === "other") return null;
  return <span className={cn("relative inline-flex h-[18px] shrink-0 items-center rounded-[4px] border px-1.5 text-[10px] font-semibold uppercase tracking-wider", envStyles[env], className)}>{env}</span>;
}

export function Count({ value, tone = "default", title }: { value: number; tone?: "default" | "bad"; title?: string }) {
  return (
    <span title={title} className={cn("relative inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-[4px] px-1 text-[11px] font-medium", tone === "bad" ? "bg-bad/12 text-bad" : "bg-bg-3 text-fg-2")}>
      <AnimatedNumber value={value} />
    </span>
  );
}

export function Chip({ children, tone = "default", className, title }: { children: ReactNode; tone?: "default" | "bad" | "warn" | "ok" | "accent"; className?: string; title?: string }) {
  const tones = {
    default: "border-line bg-bg-1 text-fg-2",
    bad: "border-bad/25 bg-bad/10 text-bad",
    warn: "border-warn/25 bg-warn/10 text-warn",
    ok: "border-ok/25 bg-ok/10 text-ok",
    accent: "border-accent/25 bg-accent/10 text-accent",
  };
  return (
    <span title={title} className={cn("inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border px-2 text-[12px] [&_svg]:size-3", tones[tone], className)}>
      {children}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="inline-flex h-5 items-center rounded border border-line-2 bg-bg-2 px-1.5 font-sans text-[11px] text-fg-3">{children}</kbd>;
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cn("inline-block size-3.5 animate-spin rounded-full border-[1.5px] border-fg-3 border-t-transparent", className)} />;
}

export function CopyButton({ text, className, label }: { text: string; className?: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={label ?? "Copy"}
      title={label ?? "Copy"}
      onClick={async (e) => {
        e.stopPropagation();
        await copy(text);
        setDone(true);
        setTimeout(() => setDone(false), 1200);
      }}
      className={className}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={done ? "y" : "n"} className="flex" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }} transition={{ duration: 0.12 }}>
          {done ? <Check className="text-ok" /> : <Copy />}
        </motion.span>
      </AnimatePresence>
    </Button>
  );
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
      {icon && <div className="mb-1 flex size-10 items-center justify-center rounded-lg border border-line bg-bg-1 text-fg-3 [&_svg]:size-4">{icon}</div>}
      <div className="text-[14px] font-medium text-fg">{title}</div>
      {children && <div className="max-w-sm text-[13px] leading-relaxed text-fg-3">{children}</div>}
    </div>
  );
}

// Window header: 52px, draggable, shared by every screen. It doubles as the title bar, so it leaves room
// for the OS window controls: traffic lights on the left on macOS, min/max/close on the right on Windows.
// When the sidebar is hidden, its toggle moves here, right after the traffic lights.
export const SidebarState = createContext<{ collapsed: boolean; toggle: () => void }>({ collapsed: false, toggle: () => {} });
export const MAC_INSET = "pl-[88px]";
// Windows draws its caption buttons over the top-right corner; env() gives the area left for us.
const winControls = isWindows ? { paddingRight: "calc(100vw - env(titlebar-area-x, 0px) - env(titlebar-area-width, 100vw) + 16px)" } : undefined;

export function SidebarToggle({ className }: { className?: string }) {
  const { collapsed, toggle } = useContext(SidebarState);
  return (
    <Tip content={{ title: collapsed ? "Show sidebar" : "Hide sidebar", body: `Shortcut: ${mod("B")}` }} side="bottom">
      <Button variant="ghost" size="icon" onClick={toggle} aria-label={collapsed ? "Show sidebar" : "Hide sidebar"} className={cn("no-drag shrink-0 text-fg-3", className)}>
        <PanelLeft />
      </Button>
    </Tip>
  );
}

// Back and forward, like a browser. Shared by every header so they're always in the same spot.
export const HistoryState = createContext<{ back: () => void; forward: () => void; canBack: boolean; canForward: boolean }>({ back: () => {}, forward: () => {}, canBack: false, canForward: false });

export function HistoryButtons() {
  const h = useContext(HistoryState);
  return (
    <div className="no-drag flex shrink-0 items-center">
      <Tip content={{ title: "Back", body: `${mod("[")}, swipe right with two fingers, or the mouse back button.` }} side="bottom">
        <Button variant="ghost" size="icon" aria-label="Back" disabled={!h.canBack} onClick={h.back} className="disabled:opacity-30"><ArrowLeft /></Button>
      </Tip>
      <Tip content={{ title: "Forward", body: `${mod("]")}, or swipe left with two fingers.` }} side="bottom">
        <Button variant="ghost" size="icon" aria-label="Forward" disabled={!h.canForward} onClick={h.forward} className="disabled:opacity-30"><ArrowRight /></Button>
      </Tip>
    </div>
  );
}

export function Header({ children }: { children: ReactNode }) {
  const { collapsed } = useContext(SidebarState);
  return (
    <header style={winControls} className={cn("drag flex h-[52px] shrink-0 items-center gap-3 border-b border-line pr-4", collapsed ? (isMac ? "pl-[82px]" : "pl-2") : "pl-3")}>
      <div className="flex shrink-0 items-center">
        {collapsed && <SidebarToggle />}
        <HistoryButtons />
      </div>
      {children}
    </header>
  );
}
// ─── Breadcrumbs ─────────────────────────────────────────────────────────────
// Every level but the last is a button back to it. Earlier levels give up space first when it's tight.
export type Crumb = { label: string; icon?: ReactNode; onClick?: () => void; tip?: TipContent };
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="no-drag -ml-1.5 flex min-w-0 items-center gap-0.5 text-[13px]">
      {items.map((c, i) => {
        const last = i === items.length - 1;
        const inner = (
          <>
            {c.icon && <span className="flex shrink-0 text-fg-3 [&_svg]:size-3.5">{c.icon}</span>}
            <span className="truncate">{c.label}</span>
          </>
        );
        return (
          // The current page keeps its name (up to 45% of the bar); the root gives up space first, then parents.
          <span key={i} className="flex min-w-0 items-center gap-0.5" style={last ? { flexShrink: 0, maxWidth: "45%", minWidth: 72 } : { flexShrink: i === 0 ? 12 : 4, minWidth: i === 0 ? 28 : 40 }}>
            {last ? (
              <h1 title={c.label} className="flex min-w-0 items-center gap-1.5 px-1.5 text-[14px] font-semibold tracking-tight text-fg">{inner}</h1>
            ) : (
              <Tip content={c.tip ?? { title: `Back to ${c.label}` }} side="bottom" className="min-w-0">
                <button onClick={c.onClick} disabled={!c.onClick} title={c.label} className={cn("flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-fg-3 transition-colors duration-150 enabled:hover:bg-bg-2 enabled:hover:text-fg", ring)}>
                  {inner}
                </button>
              </Tip>
            )}
            {!last && <ChevronRight className="size-3.5 shrink-0 text-line-2" />}
          </span>
        );
      })}
    </nav>
  );
}

export const NoDrag = ({ children, className }: { children: ReactNode; className?: string }) => <div className={cn("no-drag flex items-center gap-2", className)}>{children}</div>;

// ─── Tooltip ─────────────────────────────────────────────────────────────────
// Hover or focus for 350ms opens it; moving between tips within 400ms opens the next one instantly.
let lastClose = 0;

export type TipContent = ReactNode | { title: ReactNode; body?: ReactNode };

export function Tip({ content, children, side = "top", className, block }: { content: TipContent; children: ReactNode; side?: "top" | "bottom" | "right" | "left"; className?: string; block?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const [rect, setRect] = useState<DOMRect | null>(null);
  if (content == null || content === false) return className ? <span className={cn(block ? "flex" : "inline-flex", "min-w-0", className)}>{children}</span> : <>{children}</>;
  const show = () => {
    window.clearTimeout(timer.current);
    const delay = Date.now() - lastClose < 400 ? 0 : 350;
    timer.current = window.setTimeout(() => ref.current && setRect(ref.current.getBoundingClientRect()), delay);
  };
  const hide = () => {
    window.clearTimeout(timer.current);
    if (rect) lastClose = Date.now();
    setRect(null);
  };
  const c = typeof content === "object" && content !== null && "title" in (content as object) ? (content as { title: ReactNode; body?: ReactNode }) : { title: content as ReactNode };
  return (
    <span ref={ref} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide} onMouseDown={hide} className={cn(block ? "flex" : "inline-flex", "min-w-0", className)}>
      {children}
      {createPortal(<AnimatePresence>{rect && <TipBubble rect={rect} side={side} title={c.title} body={c.body} />}</AnimatePresence>, document.body)}
    </span>
  );
}

function TipBubble({ rect, side, title, body }: { rect: DOMRect; side: "top" | "bottom" | "right" | "left"; title: ReactNode; body?: ReactNode }) {
  const el = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  useLayoutEffect(() => {
    const b = el.current!.getBoundingClientRect();
    const gap = 8, pad = 8, vw = window.innerWidth, vh = window.innerHeight;
    let s = side;
    if (s === "top" && rect.top - b.height - gap < pad) s = "bottom";
    if (s === "bottom" && rect.bottom + b.height + gap > vh - pad) s = "top";
    if (s === "right" && rect.right + b.width + gap > vw - pad) s = "left";
    let x = s === "right" ? rect.right + gap : s === "left" ? rect.left - b.width - gap : rect.left + rect.width / 2 - b.width / 2;
    let y = s === "top" ? rect.top - b.height - gap : s === "bottom" ? rect.bottom + gap : rect.top + rect.height / 2 - b.height / 2;
    x = Math.min(Math.max(pad, x), vw - b.width - pad);
    y = Math.min(Math.max(pad, y), vh - b.height - pad);
    setPos({ x, y });
  }, [rect, side]);
  return (
    <motion.div
      ref={el}
      role="tooltip"
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: pos ? 1 : 0, scale: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.08 } }}
      transition={{ duration: 0.12 }}
      style={{ left: pos?.x ?? -9999, top: pos?.y ?? -9999 }}
      className="pointer-events-none fixed z-[100] max-w-[300px] rounded-lg border border-line-2 bg-bg-2 px-3 py-2 text-left shadow-[0_8px_24px_rgba(0,0,0,0.5)]"
    >
      <div className="text-[12px] font-medium leading-snug text-fg">{title}</div>
      {body && <div className="mt-1 text-[12px] leading-relaxed text-fg-2">{body}</div>}
    </motion.div>
  );
}

// ─── Checkbox (supports a mixed state for parent rows) ───────────────────────
export function Checkbox({ checked, mixed, className }: { checked: boolean; mixed?: boolean; className?: string }) {
  const on = checked || mixed;
  return (
    <span aria-hidden className={cn("flex size-3.5 shrink-0 items-center justify-center rounded-[4px] border transition-colors duration-150", on ? "border-fg bg-fg text-bg" : "border-line-2 bg-bg-1", className)}>
      {mixed ? <span className="h-[1.5px] w-2 rounded-full bg-bg" /> : checked ? <Check className="size-2.5" strokeWidth={3.5} /> : null}
    </span>
  );
}
