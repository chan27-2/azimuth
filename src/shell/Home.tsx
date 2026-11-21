import { useState } from "react";
import { motion } from "motion/react";
import { ArrowRight, Clock, Radar } from "lucide-react";
import { mod } from "../lib/platform";
import { ago, cn } from "../lib/util";
import { Button, Field, Header, Kbd, Tip } from "../ui/ui";
import { Tile } from "../ui/Logo";
import { Leaf } from "../ui/tree";
import { TOOLS, tool } from "./tools";
import { useNav } from "./nav";
import type { Recent } from "./App";

export function Home({ recent, ready }: { recent: Recent[]; ready: boolean }) {
  const { go, subs } = useNav();
  const [trace, setTrace] = useState("");
  const accounts = new Set(subs.map((s) => s.user)).size;
  const findTrace = () => trace.trim() && go({ tool: "ai", trace: { operationId: trace.trim(), subIds: subs.map((s) => s.id) } });
  return (
    <div className="flex h-full flex-col">
      <Header><span className="text-[13px] font-medium text-fg">Home</span></Header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[980px] px-8 pb-16 pt-12">
          <h1 className="text-[28px] font-semibold tracking-[-0.03em] text-fg">Azimuth</h1>
          <p className="mt-1.5 text-[14px] text-fg-3">
            {ready ? `${subs.length} subscription${subs.length === 1 ? "" : "s"} across ${accounts} account${accounts === 1 ? "" : "s"}, through your az CLI login.` : "Connecting through your az CLI login…"}
          </p>

          <div className="mt-8 grid grid-cols-3 gap-3">
            {TOOLS.map((t, i) => (
              <motion.button
                key={t.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.04 * i, duration: 0.25 }}
                onClick={() => go({ tool: t.id })}
                className="group flex flex-col items-start gap-4 rounded-xl border border-line bg-bg-1 p-5 text-left transition-[border-color,background-color] duration-150 hover:border-line-2 hover:bg-bg-2"
              >
                <div className="flex w-full items-center justify-between">
                  <Tile className="size-10 rounded-[9px]">{t.glyph("size-6")}</Tile>
                  <Kbd>{mod(t.key)}</Kbd>
                </div>
                <div>
                  <div className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.01em] text-fg">
                    {t.name}
                    <ArrowRight className="size-3.5 -translate-x-1 text-fg-3 opacity-0 transition-[opacity,transform] duration-150 group-hover:translate-x-0 group-hover:opacity-100" />
                  </div>
                  <div className="text-[12px] text-fg-3">{t.product}</div>
                </div>
                <p className="text-[12.5px] leading-relaxed text-fg-2">{t.blurb}</p>
              </motion.button>
            ))}
          </div>

          <div className="mt-8 rounded-xl border border-line bg-bg-1 p-5">
            <div className="flex items-center gap-2 text-[13px] font-medium text-fg"><Radar className="size-4 text-fg-3" />Find a trace</div>
            <p className="mt-1 text-[12.5px] text-fg-3">Paste an operation id, trace id or traceparent. Azimuth looks for it in every Application Insights resource you can see and shows the whole operation.</p>
            <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); findTrace(); }}>
              <Field value={trace} onChange={setTrace} placeholder="00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01" wrapperClassName="flex-1" className="font-mono" />
              <Button type="submit" disabled={!trace.trim()}>Find</Button>
            </form>
          </div>

          <div className="mt-8">
            <div className="mb-2 flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.08em] text-fg-3">Recent</div>
            {recent.length ? (
              <div className="overflow-hidden rounded-xl border border-line">
                {recent.slice(0, 8).map((r) => (
                  <button key={r.key} onClick={() => go(r.place)} className="flex h-11 w-full items-center gap-3 border-b border-line px-4 text-left last:border-0 hover:bg-bg-2">
                    <span className="flex text-fg-2">{r.place.tool !== "home" && tool(r.place.tool).glyph("size-4")}</span>
                    <span className="min-w-0 truncate text-[13px] text-fg">{r.label}</span>
                    <span className="min-w-0 flex-1 truncate text-[12px] text-fg-3">{r.hint}</span>
                    <span className="text-[12px] tabular text-fg-3">{ago(new Date(r.at).toISOString())}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-[12.5px] text-fg-3">Things you open show up here.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function HomeNav({ recent }: { recent: Recent[] }) {
  const { go } = useNav();
  if (!recent.length) return <div className="px-3 py-8 text-center text-[12px] leading-relaxed text-fg-3">Nothing opened yet. Pick a tool on the left.</div>;
  return (
    <div className="mt-1 space-y-px">
      {recent.map((r) => (
        <Tip key={r.key} content={{ title: r.label, body: `${r.hint} · opened ${ago(new Date(r.at).toISOString())}` }} side="right" block>
          <Leaf icon={r.place.tool !== "home" ? tool(r.place.tool).glyph(cn("size-3.5")) : <Clock />} label={r.label} selected={false} onClick={() => go(r.place)} />
        </Tip>
      ))}
    </div>
  );
}

