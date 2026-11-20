import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronRight } from "lucide-react";
import { cn } from "../../lib/util";

export function XmlTree({ doc, query }: { doc: Document; query: string }) {
  return (
    <div className="selectable font-mono text-[12px] leading-[20px]">
      <El el={doc.documentElement} depth={0} q={query.trim().toLowerCase()} />
    </div>
  );
}

function El({ el, depth, q }: { el: Element; depth: number; q: string }) {
  const [open, setOpen] = useState(depth < 4);
  const kids = Array.from(el.childNodes).filter((n) => n.nodeType === 1 || (n.nodeType === 3 && n.textContent!.trim()) || n.nodeType === 4);
  const onlyText = kids.length === 1 && kids[0].nodeType !== 1;
  const hit = q && (el.nodeName.toLowerCase().includes(q) || (onlyText && kids[0].textContent!.toLowerCase().includes(q)));
  const attrs = Array.from(el.attributes);
  const tag = (
    <>
      <span className="text-fg-3">&lt;</span>
      <span className={cn("text-tok-num", hit && "bg-warn/25 rounded-sm")}>{el.nodeName}</span>
      {attrs.map((a) => (
        <span key={a.name}>
          {" "}
          <span className="text-tok-bool">{a.name}</span>
          <span className="text-fg-3">=</span>
          <span className="text-tok-str">"{a.value}"</span>
        </span>
      ))}
      <span className="text-fg-3">{kids.length ? ">" : " />"}</span>
    </>
  );
  const close = (
    <>
      <span className="text-fg-3">&lt;/</span>
      <span className="text-tok-num">{el.nodeName}</span>
      <span className="text-fg-3">&gt;</span>
    </>
  );
  if (!kids.length || onlyText)
    return (
      <div className="rounded-sm pl-4 hover:bg-white/[0.03]" style={{ marginLeft: depth * 14 }}>
        {tag}
        {onlyText && <span className="text-fg">{kids[0].textContent}</span>}
        {onlyText && close}
      </div>
    );
  return (
    <div>
      <div className="flex cursor-pointer items-start rounded-sm hover:bg-white/[0.03]" style={{ paddingLeft: depth * 14 }} onClick={() => setOpen(!open)}>
        <motion.span animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.15 }} className="inline-flex w-4 shrink-0 justify-center pt-[3px]">
          <ChevronRight className="size-3.5 text-fg-3" />
        </motion.span>
        <span>
          {tag}
          {!open && <span className="mx-1 rounded bg-bg-3 px-1 text-[10px] text-fg-3">{kids.length}</span>}
          {!open && close}
        </span>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            {kids.map((k, i) =>
              k.nodeType === 1 ? (
                <El key={i} el={k as Element} depth={depth + 1} q={q} />
              ) : (
                <div key={i} className="pl-4 text-fg" style={{ marginLeft: (depth + 1) * 14 }}>{k.textContent!.trim()}</div>
              ),
            )}
            <div className="pl-4" style={{ marginLeft: depth * 14 }}>{close}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
