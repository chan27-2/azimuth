import { memo, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Braces, ChevronRight, ClipboardCopy } from "lucide-react";
import { cn } from "../../lib/util";
import { Button, Tip } from "../ui";
import * as G from "../../lib/glossary";

type Copy = (what: string, text: string) => void;
type Props = { value: unknown; query: string; onCopy: Copy };

const keyPath = (parent: string, k: string | number) =>
  typeof k === "number" ? `${parent}[${k}]` : /^[A-Za-z_$][\w$]*$/.test(k) ? `${parent}.${k}` : `${parent}["${k}"]`;

// Paths whose subtree contains a match get force-expanded while searching.
function matchPaths(v: unknown, q: string, path = "$", out = new Set<string>()): boolean {
  let hit = false;
  if (v && typeof v === "object") {
    for (const [k, c] of Object.entries(v)) {
      const p = keyPath(path, Array.isArray(v) ? Number(k) : k);
      const kHit = !Array.isArray(v) && k.toLowerCase().includes(q);
      if (matchPaths(c, q, p, out) || kHit) hit = true;
    }
  } else hit = String(v).toLowerCase().includes(q);
  if (hit) out.add(path);
  return hit;
}

export function JsonTree({ value, query, onCopy }: Props) {
  const q = query.trim().toLowerCase();
  const hits = useMemo(() => (q ? (() => { const s = new Set<string>(); matchPaths(value, q, "$", s); return s; })() : null), [value, q]);
  return (
    <div className="selectable font-mono text-[12px] leading-[20px]">
      <Node k={null} v={value} path="$" depth={0} q={q} hits={hits} onCopy={onCopy} last />
    </div>
  );
}

const valueText = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v, null, v && typeof v === "object" ? 2 : 0));

const Node = memo(function Node({ k, v, path, depth, q, hits, onCopy, last }: {
  k: string | number | null; v: unknown; path: string; depth: number; q: string; hits: Set<string> | null; onCopy: Copy; last: boolean;
}) {
  const isObj = v !== null && typeof v === "object";
  const [open, setOpen] = useState(depth < 3);
  const forced = hits ? hits.has(path) : false;
  const expanded = isObj && (open || forced);
  const entries = isObj ? Object.entries(v as object) : [];
  const isArr = Array.isArray(v);
  const keyHit = q && k != null && typeof k === "string" && k.toLowerCase().includes(q);
  const dim = hits && !hits.has(path);

  const keyEl = k !== null && (
    <span className={cn("rounded-sm", typeof k === "number" ? "text-fg-3" : "text-tok-key", keyHit && "bg-warn/25")}>
      {typeof k === "number" ? k : `"${k}"`}
    </span>
  );
  const label = k === null ? "payload" : String(k);
  const actions = (
    <span className="ml-auto flex shrink-0 items-center gap-0.5 pl-3 opacity-0 transition-opacity duration-100 group-hover:opacity-100 has-[:focus-visible]:opacity-100" onClick={(e) => e.stopPropagation()}>
      <Tip content={isObj ? { title: `Copy ${label}`, body: `Copies this ${isArr ? "array" : "object"} as JSON.` } : G.ui.jsonValue}>
        <Button variant="ghost" size="icon-sm" aria-label={`Copy value of ${label}`} onClick={() => onCopy(label, valueText(v))}><ClipboardCopy /></Button>
      </Tip>
      {k !== null && (
        <Tip content={{ title: G.ui.jsonPath.title, body: <code className="font-mono text-[11px] text-fg">{path}</code> }}>
          <Button variant="ghost" size="icon-sm" aria-label={`Copy path of ${label}`} onClick={() => onCopy("path", path)}><Braces /></Button>
        </Tip>
      )}
    </span>
  );

  return (
    <div className={cn(dim && "opacity-35")}>
      <div
        className={cn("group flex min-h-6 items-start rounded-md pr-1 hover:bg-white/[0.03]", isObj && "cursor-pointer")}
        style={{ paddingLeft: depth * 14 }}
        onClick={() => isObj && setOpen(!expanded)}
      >
        <span className="inline-flex w-4 shrink-0 justify-center pt-[5px]">
          {isObj && entries.length > 0 && (
            <motion.span animate={{ rotate: expanded ? 90 : 0 }} transition={{ duration: 0.15 }}>
              <ChevronRight className="size-3.5 text-fg-3" />
            </motion.span>
          )}
        </span>
        <span className="min-w-0 break-all py-0.5">
          {keyEl}
          {k !== null && <span className="text-fg-3">: </span>}
          {isObj ? (
            <>
              <span className="text-fg-3">{isArr ? "[" : "{"}</span>
              {!expanded && (
                <span className="text-fg-3">
                  {entries.length ? <span className="mx-1 rounded bg-bg-3 px-1 text-[10px]">{isArr ? `${entries.length} items` : `${entries.length} keys`}</span> : null}
                  {isArr ? "]" : "}"}
                  {!last && ","}
                </span>
              )}
            </>
          ) : (
            <>
              <span onClick={() => onCopy(label, valueText(v))} className="cursor-copy rounded-sm hover:bg-white/[0.06]"><Primitive v={v} q={q} /></span>
              {!last && <span className="text-fg-3">,</span>}
            </>
          )}
        </span>
        {actions}
      </div>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
            {entries.map(([ck, cv], i) => {
              const key = isArr ? i : ck;
              return <Node key={ck} k={key} v={cv} path={keyPath(path, key)} depth={depth + 1} q={q} hits={hits} onCopy={onCopy} last={i === entries.length - 1} />;
            })}
            <div className="text-fg-3" style={{ paddingLeft: depth * 14 + 16 }}>
              {isArr ? "]" : "}"}
              {!last && ","}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

function Primitive({ v, q }: { v: unknown; q: string }) {
  const s = typeof v === "string" ? `"${v}"` : String(v);
  const color = v === null ? "text-tok-null" : typeof v === "string" ? "text-tok-str" : typeof v === "number" ? "text-tok-num" : typeof v === "boolean" ? "text-tok-bool" : "text-fg";
  if (q && s.toLowerCase().includes(q)) {
    const i = s.toLowerCase().indexOf(q);
    return (
      <span className={color}>
        {s.slice(0, i)}
        <mark className="rounded-sm bg-warn/30 text-inherit">{s.slice(i, i + q.length)}</mark>
        {s.slice(i + q.length)}
      </span>
    );
  }
  return <span className={color}>{s}</span>;
}
