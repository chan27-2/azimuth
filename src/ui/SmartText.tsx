// Shows any message so it can be read. If a format can be recognised it's formatted:
// - the whole text is JSON or XML → pretty-printed, JSON as a collapsible tree;
// - JSON embedded in a sentence ("…Context data: {…}") → the sentence, then the JSON formatted;
// - SQL → one clause per line, keywords highlighted;
// - stack traces → one frame per line, file and line picked out.
// Anything else keeps its own line breaks and wraps.
import { Fragment, useMemo, type ReactNode } from "react";
import { cn, copy } from "../lib/util";
import { JsonTree } from "./viewers/JsonTree";

type Part = { kind: "text"; text: string } | { kind: "json"; value: unknown } | { kind: "xml"; text: string } | { kind: "sql"; text: string } | { kind: "stack"; text: string };

const SQL_START = /^\s*(SELECT|INSERT|UPDATE|DELETE|MERGE|WITH|EXEC(UTE)?|CREATE|ALTER|DROP)\b/i;
const SQL_BREAK = /\s+(?=(FROM|WHERE|INNER JOIN|LEFT JOIN|RIGHT JOIN|FULL JOIN|CROSS JOIN|JOIN|GROUP BY|ORDER BY|HAVING|UNION ALL|UNION|VALUES|SET|OUTPUT|ON CONFLICT|RETURNING|LIMIT|OFFSET|AND|OR)\b)/gi;
const SQL_WORDS = /\b(SELECT|INSERT|INTO|UPDATE|DELETE|MERGE|WITH|FROM|WHERE|JOIN|INNER|LEFT|RIGHT|FULL|CROSS|OUTER|ON|GROUP|ORDER|BY|HAVING|UNION|ALL|VALUES|SET|AND|OR|NOT|NULL|IS|IN|AS|TOP|DISTINCT|CASE|WHEN|THEN|ELSE|END|LIKE|BETWEEN|EXISTS|OUTPUT|RETURNING|LIMIT|OFFSET|DESC|ASC|EXEC|EXECUTE|CREATE|ALTER|DROP|TABLE)\b/gi;

function tryJson(s: string): { ok: true; value: unknown } | { ok: false } {
  const t = s.trim();
  if (!/^[[{]/.test(t)) return { ok: false };
  try {
    const value = JSON.parse(t);
    return value && typeof value === "object" ? { ok: true, value } : { ok: false };
  } catch {
    return { ok: false };
  }
}

// Finds balanced {...} or [...] spans that parse as JSON, so JSON inside a log sentence is found.
function embeddedJson(text: string): Part[] | null {
  const parts: Part[] = [];
  let last = 0;
  for (let i = 0; i < text.length; i++) {
    const open = text[i];
    if (open !== "{" && open !== "[") continue;
    const close = open === "{" ? "}" : "]";
    let depth = 0, inStr = false, esc = false, end = -1;
    for (let j = i; j < text.length && j - i < 200_000; j++) {
      const ch = text[j];
      if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; continue; }
      if (ch === '"') inStr = true;
      else if (ch === open) depth++;
      else if (ch === close && --depth === 0) { end = j; break; }
    }
    if (end < 0) continue;
    const candidate = text.slice(i, end + 1);
    const parsed = candidate.length > 2 ? tryJson(candidate) : { ok: false as const };
    if (parsed.ok) {
      if (i > last) parts.push({ kind: "text", text: text.slice(last, i) });
      parts.push({ kind: "json", value: parsed.value });
      last = end + 1;
      i = end;
    }
  }
  if (!parts.some((p) => p.kind === "json")) return null;
  if (last < text.length) parts.push({ kind: "text", text: text.slice(last) });
  return parts;
}

export function parseText(raw: string): Part[] {
  const text = raw ?? "";
  const json = tryJson(text);
  if (json.ok) return [{ kind: "json", value: json.value }];
  const t = text.trim();
  if (/^<([A-Za-z_][\w:.-]*)[\s>][\s\S]*>$/.test(t) || /^<\?xml/.test(t)) {
    if (!new DOMParser().parseFromString(t, "application/xml").querySelector("parsererror")) return [{ kind: "xml", text: t }];
  }
  if (SQL_START.test(t) && t.length < 20_000) return [{ kind: "sql", text: t }];
  const embedded = embeddedJson(text);
  if (embedded) return embedded;
  if (/\n\s+at\s+\S/.test(text) || /\s{2,}at\s+[\w.<>`$]+\(/.test(text)) return [{ kind: "stack", text }];
  return [{ kind: "text", text }];
}

function prettyXml(xml: string) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const out: string[] = [];
  const walk = (n: Node, depth: number) => {
    const pad = "  ".repeat(depth);
    if (n.nodeType === Node.TEXT_NODE) { const v = n.nodeValue?.trim(); if (v) out.push(pad + v); return; }
    if (n.nodeType !== Node.ELEMENT_NODE) return;
    const el = n as Element;
    const attrs = [...el.attributes].map((a) => ` ${a.name}="${a.value}"`).join("");
    const kids = [...el.childNodes].filter((c) => c.nodeType === Node.ELEMENT_NODE || c.nodeValue?.trim());
    if (!kids.length) out.push(`${pad}<${el.tagName}${attrs}/>`);
    else if (kids.length === 1 && kids[0].nodeType === Node.TEXT_NODE) out.push(`${pad}<${el.tagName}${attrs}>${kids[0].nodeValue!.trim()}</${el.tagName}>`);
    else { out.push(`${pad}<${el.tagName}${attrs}>`); kids.forEach((k) => walk(k, depth + 1)); out.push(`${pad}</${el.tagName}>`); }
  };
  walk(doc.documentElement, 0);
  return out.join("\n");
}

const prettySql = (sql: string) => sql.replace(/\s+/g, " ").replace(SQL_BREAK, "\n").replace(/\n(AND|OR)\b/gi, "\n  $1");

function highlightSql(sql: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  for (const m of sql.matchAll(SQL_WORDS)) {
    if (m.index! > last) nodes.push(sql.slice(last, m.index));
    nodes.push(<span key={m.index} className="text-tok-bool">{m[0].toUpperCase()}</span>);
    last = m.index! + m[0].length;
  }
  nodes.push(sql.slice(last));
  return nodes;
}

function Stack({ text }: { text: string }) {
  const lines = text.replace(/\s+(?=at\s+[\w.<>`$]+[.(])/g, "\n   ").split("\n");
  return (
    <>
      {lines.map((line, i) => {
        const frame = line.match(/^(\s*at\s+)(.*?)(\s+in\s+(.+?):line\s+(\d+))?$/);
        if (!frame) return <div key={i} className={cn(i === 0 && "text-fg")}>{line}</div>;
        return (
          <div key={i} className="pl-4 text-fg-3">
            at <span className="text-fg-2">{frame[2]}</span>
            {frame[4] && <> in <span className="text-tok-str">{frame[4].split(/[\\/]/).pop()}</span>:<span className="text-tok-num">{frame[5]}</span></>}
          </div>
        );
      })}
    </>
  );
}

const block = "selectable whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed";

export function SmartText({ text, className, maxHeight = 480 }: { text: string; className?: string; maxHeight?: number }) {
  const parts = useMemo(() => parseText(text), [text]);
  return (
    <div className={cn("min-w-0 space-y-2 overflow-auto", className)} style={{ maxHeight }}>
      {parts.map((p, i) => (
        <Fragment key={i}>
          {p.kind === "text" && p.text.trim() && <div className={cn(block, "text-fg-2")}>{p.text.trim()}</div>}
          {p.kind === "json" && <div className="rounded-md border border-line bg-bg p-1.5"><JsonTree value={p.value} onCopy={(_, t) => copy(t)} /></div>}
          {p.kind === "xml" && <pre className={cn(block, "rounded-md border border-line bg-bg p-2.5 text-fg-2")}>{prettyXml(p.text)}</pre>}
          {p.kind === "sql" && <pre className={cn(block, "rounded-md border border-line bg-bg p-2.5 text-fg-2")}>{highlightSql(prettySql(p.text))}</pre>}
          {p.kind === "stack" && <div className={cn(block, "text-fg-2")}><Stack text={p.text} /></div>}
        </Fragment>
      ))}
    </div>
  );
}

// For single-line list rows: collapse whitespace so a multi-line message doesn't break the row.
export const oneLine = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

// customDimensions often hold JSON as strings; parse those so the tree can expand them.
export function deepParse(v: unknown, depth = 0): unknown {
  if (depth > 4) return v;
  if (typeof v === "string") { const j = tryJson(v); return j.ok ? deepParse(j.value, depth + 1) : v; }
  if (Array.isArray(v)) return v.map((x) => deepParse(x, depth + 1));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deepParse(x, depth + 1)]));
  return v;
}
