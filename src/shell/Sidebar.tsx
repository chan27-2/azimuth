// The sidebar frame shared by every tool: title row (logo, toggle), a rail to switch tools, the current
// tool's navigation, and the accounts menu. Resizable and collapsible.
import { useRef, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { LayoutGrid, Search } from "lucide-react";
import type { Account, Sub } from "../types";
import { cn } from "../lib/util";
import { isMac, mod } from "../lib/platform";
import { Kbd, MAC_INSET, SidebarToggle, Tip } from "../ui/ui";
import { Logo } from "../ui/Logo";
import { AccountsMenu } from "./AccountsMenu";
import { TOOLS } from "./tools";
import { useNav } from "./nav";

export const SIDEBAR_MIN = 260;
export const SIDEBAR_MAX = 520;

export function Sidebar({ width, collapsed, onResize, account, allSubs, hidden, onHiddenChange, children }: {
  width: number; collapsed: boolean; onResize: (w: number) => void; account?: Account; allSubs: Sub[];
  hidden: string[]; onHiddenChange: (ids: string[]) => void; children: ReactNode;
}) {
  const [resizing, setResizing] = useState(false);
  const start = useRef({ x: 0, w: 0 });
  const { place, go, subs, openSearch } = useNav();
  const current = TOOLS.find((t) => t.id === place.tool);
  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 0 : width }}
      transition={resizing ? { duration: 0 } : { type: "spring", bounce: 0, duration: 0.3 }}
      className="relative h-full shrink-0 overflow-hidden border-r border-line bg-bg"
      style={{ borderRightWidth: collapsed ? 0 : 1 }}
    >
      <div className="flex h-full flex-col" style={{ width }} inert={collapsed}>
        <div className={cn("drag flex h-[52px] shrink-0 items-center justify-between pr-2", isMac ? MAC_INSET : "pl-4")}>
          <button onClick={() => go({ tool: "home" })} className="no-drag flex min-w-0 items-center gap-2 rounded-md">
            <Logo className="size-6" />
            <span className="truncate text-[14px] font-semibold tracking-[-0.02em] text-fg">Azimuth</span>
          </button>
          <SidebarToggle />
        </div>
        <div className="flex min-h-0 flex-1">
          <nav aria-label="Tools" className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-line pt-1">
            <RailButton active={place.tool === "home"} onClick={() => go({ tool: "home" })} tip={{ title: "Home", body: `All tools and recent items. ${mod("0")}` }}>
              <LayoutGrid className="size-[18px]" />
            </RailButton>
            <div className="my-1 h-px w-6 bg-line" />
            {TOOLS.map((t) => (
              <RailButton key={t.id} active={place.tool === t.id} onClick={() => go({ tool: t.id })} tip={{ title: `${t.name} · ${t.product}`, body: `${t.blurb} ${mod(t.key)}` }}>
                {t.glyph("size-[19px]")}
              </RailButton>
            ))}
          </nav>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex h-9 shrink-0 items-center px-4 text-[11px] font-medium uppercase tracking-[0.08em] text-fg-3">{current ? current.product : "Recent"}</div>
            <div className="px-3 pb-1">
              <button
                onClick={openSearch}
                className="flex h-8 w-full items-center gap-2 rounded-md border border-line bg-bg-1 pl-2.5 pr-1.5 text-[13px] text-fg-3 transition-colors duration-150 hover:border-line-2 hover:text-fg-2"
              >
                <Search className="size-3.5" />
                <span className="flex-1 text-left">Jump to…</span>
                <Kbd>{mod("K")}</Kbd>
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
              {!subs.length && allSubs.length > 0 && place.tool !== "home" ? (
                <div className="px-3 py-8 text-center text-[12px] leading-relaxed text-fg-3">All subscriptions are hidden. Choose which to show from the accounts menu below.</div>
              ) : (
                children
              )}
            </div>
          </div>
        </div>
        {account && <AccountsMenu account={account} all={allSubs} hidden={hidden} onHiddenChange={onHiddenChange} />}
      </div>
      {!collapsed && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            start.current = { x: e.clientX, w: width };
            setResizing(true);
          }}
          onPointerMove={(e) => {
            if (!resizing) return;
            onResize(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, start.current.w + e.clientX - start.current.x)));
          }}
          onPointerUp={() => setResizing(false)}
          onDoubleClick={() => onResize(340)}
          className="no-drag group absolute inset-y-0 right-0 z-10 w-2 translate-x-1/2 cursor-col-resize"
        >
          <span className={cn("absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors duration-150", resizing ? "bg-fg-3" : "group-hover:bg-line-2")} />
        </div>
      )}
    </motion.aside>
  );
}

function RailButton({ active, onClick, tip, children }: { active: boolean; onClick: () => void; tip: { title: string; body: string }; children: ReactNode }) {
  return (
    <Tip content={tip} side="right">
      <button
        onClick={onClick}
        aria-label={tip.title}
        aria-current={active ? "page" : undefined}
        className={cn("relative flex size-9 items-center justify-center rounded-lg transition-colors duration-150", active ? "text-fg" : "text-fg-3 opacity-70 hover:bg-bg-2 hover:opacity-100")}
      >
        {active && <motion.span layoutId="rail-sel" className="absolute inset-0 rounded-lg border border-line-2 bg-bg-3" transition={{ type: "spring", bounce: 0.12, duration: 0.3 }} />}
        <span className="relative flex">{children}</span>
      </button>
    </Tip>
  );
}
