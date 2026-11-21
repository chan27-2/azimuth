import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Terminal } from "lucide-react";
import type { Account, Sub } from "../types";
import { api } from "../lib/api";
import { useQuery } from "../lib/query";
import { store, stored } from "../lib/storage";
import { Empty, SidebarState, Spinner } from "../ui/ui";
import { Sidebar } from "./Sidebar";
import { CommandMenu } from "./CommandMenu";
import { Home, HomeNav } from "./Home";
import { NavContext, describe, type Nav, type Place, type ToolId } from "./nav";
import { TOOLS } from "./tools";
import { ServiceBusNav } from "../tools/servicebus/Nav";
import { ServiceBusView } from "../tools/servicebus/View";
import { FunctionsNav } from "../tools/functions/Nav";
import { FunctionsView } from "../tools/functions/View";
import { InsightsNav } from "../tools/insights/Nav";
import { InsightsView } from "../tools/insights/View";


type Places = { sb: Place; fn: Place; ai: Place };
const EMPTY: Places = { sb: { tool: "sb" }, fn: { tool: "fn" }, ai: { tool: "ai" } };
export type Recent = { key: string; label: string; hint: string; place: Place; at: number };

// One level up within a tool, for ⌘[ and breadcrumbs.
function up(p: Place): Place {
  if (p.tool === "sb") return p.entity ? { tool: "sb", ns: p.ns } : p;
  if (p.tool === "fn") return p.fn ? { tool: "fn", app: p.app } : p;
  if (p.tool === "ai") return p.trace && p.component ? { tool: "ai", component: p.component } : p;
  return p;
}

export function App() {
  const account = useQuery<Account>("account", () => api.core.account());
  const subs = useQuery<Sub[]>("subs", () => api.core.subscriptions());
  const [tool, setTool] = useState<ToolId | "home">(() => stored("tool", "home"));
  const [places, setPlaces] = useState<Places>(() => ({ ...EMPTY, ...stored("places", {}) }));
  const [recent, setRecent] = useState<Recent[]>(() => stored("recent", []));
  const [cmd, setCmd] = useState(false);
  const [width, setWidth] = useState(() => stored("sidebar.width", 340));
  const [collapsed, setCollapsed] = useState(() => stored("sidebar.collapsed", false));
  // Subscriptions unticked in the accounts menu. Stored per id so new subscriptions show up by default.
  const [hidden, setHiddenState] = useState<string[]>(() => stored("sidebar.hiddenSubs", []));
  const setHidden = (ids: string[]) => { setHiddenState(ids); store("sidebar.hiddenSubs", ids); };
  const visibleSubs = useMemo(() => subs.data?.filter((s) => !hidden.includes(s.id)) ?? [], [subs.data, hidden]);

  const resize = (w: number) => { setWidth(w); store("sidebar.width", w); };
  const toggle = useCallback(() => setCollapsed((c) => { store("sidebar.collapsed", !c); return !c; }), []);

  const go = useCallback((p: Place) => {
    setTool(p.tool);
    store("tool", p.tool);
    if (p.tool === "home") return;
    // go({ tool }) alone just switches tools and keeps that tool's place.
    if (Object.keys(p).length > 1) {
      setPlaces((prev) => { const next = { ...prev, [p.tool]: p }; store("places", next); return next; });
    }
    const d = describe(p);
    if (d) setRecent((prev) => { const next = [{ ...d, place: p, at: Date.now() }, ...prev.filter((r) => r.key !== d.key)].slice(0, 12); store("recent", next); return next; });
  }, []);

  const place: Place = tool === "home" ? { tool: "home" } : places[tool];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "k") { e.preventDefault(); setCmd((o) => !o); }
      else if (k === "b") { e.preventDefault(); toggle(); }
      else if (k === "[") { e.preventDefault(); if (place.tool !== "home") go(up(place)); }
      else if (k === "0") { e.preventDefault(); go({ tool: "home" }); }
      else {
        const t = TOOLS.find((x) => x.key === k);
        if (t) { e.preventDefault(); go({ tool: t.id }); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, go, place]);

  const nav: Nav = useMemo(() => ({ place, go, subs: visibleSubs, openSearch: () => setCmd(true) }), [place, go, visibleSubs]);

  if (subs.error || account.error)
    return (
      <div className="drag flex h-full items-center justify-center">
        <Empty icon={<Terminal />} title="Couldn't reach Azure through the az CLI">
          <code className="mb-2 block text-[12px] text-bad">{subs.error ?? account.error}</code>
          Run <code className="rounded bg-bg-3 px-1 text-fg">az login</code> in a terminal, then reopen Azimuth.
        </Empty>
      </div>
    );

  const viewKey = JSON.stringify(describe(place)?.key ?? place.tool) + (place.tool === "ai" && place.trace ? place.trace.operationId : "");

  return (
    <NavContext.Provider value={nav}>
      <SidebarState.Provider value={{ collapsed, toggle }}>
        <div className="flex h-full">
          {subs.data ? (
            <Sidebar width={width} collapsed={collapsed} onResize={resize} account={account.data} allSubs={subs.data} hidden={hidden} onHiddenChange={setHidden}>
              {place.tool === "sb" ? <ServiceBusNav /> : place.tool === "fn" ? <FunctionsNav /> : place.tool === "ai" ? <InsightsNav /> : <HomeNav recent={recent} />}
            </Sidebar>
          ) : (
            <aside className="drag flex shrink-0 items-center justify-center gap-2 border-r border-line text-[13px] text-fg-3" style={{ width }}>
              <Spinner /> Signing in via az CLI
            </aside>
          )}
          <main className="relative min-w-0 flex-1 bg-bg">
            <AnimatePresence mode="wait">
              <motion.div key={viewKey} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }} className="h-full">
                {place.tool === "sb" ? (
                  <ServiceBusView place={place} onUp={() => go(up(place))} />
                ) : place.tool === "fn" ? (
                  <FunctionsView place={place} />
                ) : place.tool === "ai" ? (
                  <InsightsView place={place} />
                ) : (
                  <Home recent={recent} ready={!!account.data} />
                )}
              </motion.div>
            </AnimatePresence>
          </main>
          {subs.data && <CommandMenu open={cmd} onClose={() => setCmd(false)} />}
        </div>
      </SidebarState.Provider>
    </NavContext.Provider>
  );
}
