// The accounts menu at the bottom of the sidebar: which az accounts and subscriptions every tool shows,
// and Add account (az login). Shared by all tools.
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronUp, UserPlus } from "lucide-react";
import type { Account, Sub } from "../types";
import { api } from "../lib/api";
import { fetchQuery, invalidate } from "../lib/query";
import { cn } from "../lib/util";
import { Button, Checkbox, Field, Spinner, Tip } from "../ui/ui";
import { Avatar, byAccount } from "../ui/tree";

export function AccountsMenu({ account, all, hidden, onHiddenChange }: { account: Account; all: Sub[]; hidden: string[]; onHiddenChange: (ids: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const groups = byAccount(all);
  const shownUsers = byAccount(all.filter((s) => !hidden.includes(s.id))).map(([u]) => u);
  const shownCount = all.length - hidden.filter((id) => all.some((s) => s.id === id)).length;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onKey); };
  }, [open]);

  const toggle = (ids: string[], show: boolean) => onHiddenChange(show ? hidden.filter((id) => !ids.includes(id)) : [...new Set([...hidden, ...ids])]);

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.core.addAccount();
      // New subscriptions need their resource lists loaded.
      for (const p of ["ns:", "fnapps:", "aicomp:"]) invalidate(p);
      await fetchQuery("subs", () => api.core.subscriptions(), true);
    } catch (e) {
      if ((e as { code?: string }).code !== "CANCELLED") setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const q = query.trim().toLowerCase();
  const filtered = groups
    .map(([user, subs]) => [user, q ? subs.filter((s) => `${s.name} ${user}`.toLowerCase().includes(q)) : subs] as const)
    .filter(([, subs]) => subs.length);

  return (
    <div ref={root} className="relative shrink-0 border-t border-line p-2">
      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="Accounts and subscriptions"
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.14 }}
            style={{ transformOrigin: "bottom center" }}
            className="absolute inset-x-2 bottom-[calc(100%+6px)] z-40 flex max-h-[70vh] flex-col overflow-hidden rounded-lg border border-line-2 bg-bg-1 shadow-[0_-12px_40px_rgba(0,0,0,0.55)]"
          >
            <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
              <div>
                <div className="text-[13px] font-medium text-fg">Show in sidebar</div>
                <div className="text-[11px] text-fg-3">{shownCount} of {all.length} subscriptions · {groups.length} account{groups.length === 1 ? "" : "s"}</div>
              </div>
              {hidden.length > 0 && <Button variant="ghost" size="sm" onClick={() => onHiddenChange([])}>Show all</Button>}
            </div>
            {all.length > 6 && (
              <div className="border-b border-line p-2">
                <Field size="sm" value={query} onChange={setQuery} placeholder="Filter accounts and subscriptions" autoFocus />
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto p-1">
              {filtered.map(([user, subs]) => {
                const ids = subs.map((s) => s.id);
                const shown = ids.filter((id) => !hidden.includes(id)).length;
                return (
                  <div key={user} className="py-0.5">
                    <button onClick={() => toggle(ids, shown < ids.length)} className="flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left hover:bg-bg-3">
                      <Checkbox checked={shown === ids.length} mixed={shown > 0 && shown < ids.length} />
                      <Avatar name={user} className="size-5 text-[9px]" />
                      <span className="min-w-0 flex-1 truncate text-[12.5px] text-fg">{user}</span>
                      <span className="text-[11px] tabular text-fg-3">{shown}/{ids.length}</span>
                    </button>
                    {subs.map((s) => {
                      const on = !hidden.includes(s.id);
                      return (
                        <button key={s.id} onClick={() => toggle([s.id], !on)} className="flex h-7 w-full items-center gap-2.5 rounded-md pl-7 pr-2 text-left hover:bg-bg-3">
                          <Checkbox checked={on} />
                          <span className={cn("min-w-0 flex-1 truncate text-[12px]", on ? "text-fg-2" : "text-fg-3")}>{s.name}</span>
                          {s.isDefault && <Tip content="The subscription az uses by default (az account show)."><span className="text-[10px] uppercase tracking-wider text-fg-3">default</span></Tip>}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
              {!filtered.length && <div className="px-3 py-6 text-center text-[12px] text-fg-3">No matches</div>}
            </div>
            {!account.demo && (
              <div className="border-t border-line p-1">
                {busy ? (
                  <div className="flex h-9 items-center gap-2.5 px-2 text-[12px] text-fg-2">
                    <Spinner className="size-3" />
                    <span className="flex-1">Waiting for you to sign in in the browser…</span>
                    <Button variant="ghost" size="sm" onClick={() => api.core.cancelAddAccount()}>Cancel</Button>
                  </div>
                ) : (
                  <Tip content={{ title: "Add an Azure account", body: "Runs az login in your browser. The account is added alongside the ones you have. If you close the browser instead, press Cancel." }} side="right" block>
                    <button onClick={add} className="flex h-9 w-full items-center gap-2.5 rounded-md px-2 text-left text-[12.5px] text-fg-2 hover:bg-bg-3 hover:text-fg">
                      <UserPlus className="size-3.5" /> Add account
                    </button>
                  </Tip>
                )}
                {error && <div className="px-2 pb-2 text-[11px] text-bad">{error}</div>}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
        className={cn("flex h-11 w-full items-center gap-2.5 rounded-md px-2 text-left transition-colors duration-150 hover:bg-bg-2", open && "bg-bg-2")}
      >
        <div className="flex -space-x-1.5">{(shownUsers.length ? shownUsers : [account.user]).slice(0, 3).map((u) => <Avatar key={u} name={u} className="size-7 text-[11px] ring-2 ring-bg" />)}</div>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-[12px] text-fg-2">{groups.length > 1 ? `${groups.length} accounts` : account.user}</div>
          <div className="truncate text-[11px] text-fg-3">
            {busy ? "Signing in…" : account.demo ? "Demo data, not a real tenant" : hidden.length ? `${shownCount} of ${all.length} subscriptions shown` : "Signed in via az CLI"}
          </div>
        </div>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.15 }} className="flex text-fg-3"><ChevronUp className="size-3.5" /></motion.span>
      </button>
    </div>
  );
}
