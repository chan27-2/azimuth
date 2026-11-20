import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Network, PanelLeft, Terminal } from "lucide-react";
import type { EntityRef, Namespace, Sub, Account } from "./types";
import { useQuery } from "./lib/query";
import { Sidebar } from "./components/Sidebar";
import { Overview } from "./components/Overview";
import { EntityView } from "./components/EntityView";
import { CommandMenu } from "./components/CommandMenu";
import { Button, Empty, Header, HeaderInset, Kbd, Spinner } from "./components/ui";

const refKey = (r: EntityRef) => (r.kind === "queue" ? `${r.ns.id}|q|${r.queue}` : `${r.ns.id}|s|${r.topic}|${r.subscription}`) + (r.dlq ? "|dlq" : "");

function stored<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}
function store(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage unavailable */ }
}

export function App() {
  const account = useQuery<Account>("account", () => window.bus.account());
  const subs = useQuery<Sub[]>("subs", () => window.bus.subscriptions());
  const [ns, setNs] = useState<Namespace | null>(null);
  const [entity, setEntity] = useState<EntityRef | null>(null);
  const [cmd, setCmd] = useState(false);
  const [width, setWidth] = useState(() => stored("sidebar.width", 320));
  const [collapsed, setCollapsed] = useState(() => stored("sidebar.collapsed", false));

  const resize = (w: number) => { setWidth(w); store("sidebar.width", w); };
  const toggle = useCallback(() => setCollapsed((c) => { store("sidebar.collapsed", !c); return !c; }), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key.toLowerCase() === "k") { e.preventDefault(); setCmd((o) => !o); }
      if (e.key.toLowerCase() === "b") { e.preventDefault(); toggle(); }
      if (e.key === "[") { e.preventDefault(); setEntity(null); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  const selectNs = useCallback((n: Namespace) => { setNs(n); setEntity(null); }, []);
  const selectEntity = useCallback((e: EntityRef) => { setNs(e.ns); setEntity(e); }, []);

  if (subs.error || account.error)
    return (
      <div className="drag flex h-full items-center justify-center">
        <Empty icon={<Terminal />} title="Couldn't reach Azure through the az CLI">
          <code className="mb-2 block text-[12px] text-bad">{subs.error ?? account.error}</code>
          Run <code className="rounded bg-bg-3 px-1 text-fg">az login</code> in a terminal, then reopen Busscope.
        </Empty>
      </div>
    );

  return (
    <HeaderInset.Provider value={collapsed}>
      <div className="flex h-full">
        {subs.data ? (
          <Sidebar
            width={width}
            collapsed={collapsed}
            onResize={resize}
            account={account.data}
            subs={subs.data}
            selectedNs={ns}
            selectedEntity={entity}
            onSelectNs={selectNs}
            onSelectEntity={selectEntity}
            onOpenSearch={() => setCmd(true)}
          />
        ) : (
          <aside className="drag flex shrink-0 items-center justify-center gap-2 border-r border-line text-[13px] text-fg-3" style={{ width }}>
            <Spinner /> Signing in via az CLI
          </aside>
        )}
        <main className="relative min-w-0 flex-1 bg-bg">
          <AnimatePresence mode="wait">
            <motion.div key={entity ? refKey(entity) : ns?.id ?? "home"} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }} className="h-full">
              {entity ? (
                <EntityView entity={entity} onBack={() => selectNs(entity.ns)} />
              ) : ns ? (
                <Overview ns={ns} onSelect={selectEntity} />
              ) : (
                <div className="flex h-full flex-col">
                  <Header><span /></Header>
                  <Empty icon={<Network />} title="Busscope">
                    {account.data ? <>Pick a namespace to see its topology, or press <Kbd>⌘K</Kbd> to jump anywhere.</> : "Connecting…"}
                  </Empty>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </main>
        <Button variant="ghost" size="icon" onClick={toggle} aria-label={collapsed ? "Show sidebar" : "Hide sidebar"} title="Toggle sidebar (⌘B)" className="no-drag fixed left-[76px] top-[10px] z-30">
          <PanelLeft />
        </Button>
        {subs.data && <CommandMenu open={cmd} onClose={() => setCmd(false)} subs={subs.data} onNs={selectNs} onEntity={selectEntity} />}
      </div>
    </HeaderInset.Provider>
  );
}
