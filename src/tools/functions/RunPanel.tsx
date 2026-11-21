// Run a function: build the request, confirm in production, send it once, show the response, then wait
// for the invocation to reach Application Insights so its trace can be opened.
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, Play, Plus, ShieldAlert, Trash2, X } from "lucide-react";
import type { Fn, FunctionApp, HttpRun, InsightsLink, Invocation, RunResult } from "../../types";
import { api } from "../../lib/api";
import { cn, copy, envOf, fmtMs } from "../../lib/util";
import { fmtBytes } from "../servicebus/detect";
import * as G from "../../lib/glossary";
import { Button, Chip, CopyButton, Field, Select, Spinner, Tip } from "../../ui/ui";
import { JsonTree } from "../../ui/viewers/JsonTree";
import { triggerSummary } from "./common";

// Inputs are remembered for this session only. Request bodies can hold real data, so nothing is written to disk.
const drafts = new Map<string, { http: HttpRun; input: string }>();

const INPUT_LABEL: Record<string, string> = {
  serviceBusTrigger: "Message body", queueTrigger: "Queue message", blobTrigger: "Blob path", eventHubTrigger: "Event body",
  eventGridTrigger: "Event (JSON)", cosmosDBTrigger: "Changed documents (JSON array)", timerTrigger: "Input",
};

const b64ToText = (b: string) => new TextDecoder().decode(Uint8Array.from(atob(b), (c) => c.charCodeAt(0)));

export function RunPanel({ app, f, link, onClose, onFound }: { app: FunctionApp; f: Fn; link: InsightsLink | null; onClose: () => void; onFound: (inv: Invocation) => void }) {
  const key = `${app.id}/${f.name}`;
  const initialPath = (() => { try { return new URL(f.invokeUrl ?? `https://${app.hostName}/api/${f.http?.route ?? f.name}`).pathname; } catch { return `/api/${f.name}`; } })();
  const methods = (f.http?.methods.length ? f.http.methods : ["get", "post", "put", "patch", "delete"]).map((m) => m.toUpperCase());
  const [http, setHttp] = useState<HttpRun>(() => drafts.get(key)?.http ?? {
    method: methods.includes("POST") ? "POST" : methods[0], path: initialPath, query: [], headers: methods.includes("POST") ? [["Content-Type", "application/json"]] : [], body: methods.includes("POST") ? "{\n  \n}" : "",
  });
  const [input, setInput] = useState(() => drafts.get(key)?.input ?? (f.trigger.type === "timerTrigger" ? "" : "{}"));
  const [confirm, setConfirm] = useState("");
  const [state, setState] = useState<"idle" | "running" | "done">("idle");
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const runId = useRef<string>("");
  const prod = envOf(app.name) === "prod";
  const isJsonBody = http.headers.some(([k, v]) => /^content-type$/i.test(k) && /json/i.test(v));
  const bodyInvalid = isJsonBody && http.body.trim() && (() => { try { JSON.parse(http.body); return false; } catch { return true; } })();

  useEffect(() => { drafts.set(key, { http, input }); }, [key, http, input]);
  useEffect(() => () => { if (runId.current) api.fn.cancelRun({ runId: runId.current }); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && state !== "running" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, state]);

  const run = async () => {
    runId.current = crypto.randomUUID();
    setState("running");
    setError(null);
    setResult(null);
    try {
      const r = await api.fn.run({ runId: runId.current, app, fn: f.name, confirm: prod ? confirm : undefined, http: f.http ? http : undefined, input: f.http ? undefined : input });
      setResult(r);
      setState("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState("idle");
    } finally {
      runId.current = "";
    }
  };

  const canRun = state !== "running" && (!prod || confirm === app.name) && !bodyInvalid;
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-4">
        <Play className="size-3.5 text-fg-3" />
        <span className="text-[13px] font-medium text-fg">Run {f.name}</span>
        <span className="truncate text-[12px] text-fg-3">{triggerSummary(f)}</span>
        <Button variant="ghost" size="icon" aria-label="Close" className="ml-auto" onClick={onClose} disabled={state === "running"}><X /></Button>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <div className="rounded-lg border border-line bg-bg-1 px-3 py-2.5 text-[12px] leading-relaxed text-fg-2">
          {G.fn.run.body} {f.http ? `Azimuth sends ${http.method} https://${app.hostName}${http.path}${f.http.authLevel !== "anonymous" ? " with the right key" : ""}.` : "Azimuth asks the Functions host to run it once with the input below, like the portal's Test/Run."} {G.fn.keys}
        </div>

        {f.http ? (
          <>
            <div className="flex gap-2">
              <Select value={http.method} onChange={(m) => setHttp({ ...http, method: m })} options={methods.map((m) => ({ value: m, label: m }))} label="Method" align="start" />
              <Field value={http.path} onChange={(path) => setHttp({ ...http, path })} icon={null} wrapperClassName="flex-1" className="font-mono" aria-label="Path" />
            </div>
            <Pairs title="Query" pairs={http.query} onChange={(query) => setHttp({ ...http, query })} />
            <Pairs title="Headers" pairs={http.headers} onChange={(headers) => setHttp({ ...http, headers })} />
            {!["GET", "HEAD"].includes(http.method) && (
              <label className="block">
                <span className="mb-1.5 flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.08em] text-fg-3">Body {bodyInvalid && <span className="normal-case tracking-normal text-bad">Not valid JSON</span>}</span>
                <textarea value={http.body} onChange={(e) => setHttp({ ...http, body: e.target.value })} spellCheck={false} rows={8} className={cn("selectable block w-full resize-y rounded-md border bg-bg-1 p-2.5 font-mono text-[12px] text-fg outline-none", bodyInvalid ? "border-bad/50" : "border-line focus:border-line-2")} />
              </label>
            )}
          </>
        ) : f.trigger.type === "timerTrigger" ? (
          <div className="text-[12.5px] text-fg-3">Timer functions take no input. Run starts it once now, outside its schedule.</div>
        ) : (
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.08em] text-fg-3">{INPUT_LABEL[f.trigger.type] ?? "Input"}</span>
            <textarea value={input} onChange={(e) => setInput(e.target.value)} spellCheck={false} rows={8} className="selectable block w-full resize-y rounded-md border border-line bg-bg-1 p-2.5 font-mono text-[12px] text-fg outline-none focus:border-line-2" />
            <span className="mt-1.5 block text-[11.5px] text-fg-3">{G.fn.trigger(f.trigger.type).body}</span>
          </label>
        )}

        {prod && (
          <div className="rounded-lg border border-bad/30 bg-bad/5 p-3">
            <div className="flex items-center gap-2 text-[12.5px] font-medium text-bad"><ShieldAlert className="size-4" />Production</div>
            <p className="mt-1 text-[12px] leading-relaxed text-fg-2">{G.fn.runProd}</p>
            <Field value={confirm} onChange={setConfirm} icon={null} placeholder={app.name} wrapperClassName="mt-2" className="font-mono" aria-label="Type the app name to confirm" />
          </div>
        )}

        {error && <div className="flex gap-2 rounded-lg border border-bad/25 bg-bad/5 p-3 text-[12.5px] text-bad"><AlertTriangle className="mt-0.5 size-4 shrink-0" /><span className="selectable">{error}</span></div>}
        {result && <Response result={result} />}
        {result && link && <Watch link={link} fn={f.name} result={result} onFound={onFound} />}
        {result && !link && <div className="text-[12px] text-fg-3">Without an Application Insights resource, Azimuth can't show this invocation's logs.</div>}
      </div>
      <div className="flex shrink-0 items-center gap-2 border-t border-line p-3">
        {state === "running" ? (
          <>
            <Spinner />
            <span className="text-[12.5px] text-fg-2">{f.http ? "Waiting for the response…" : "Asking the host to run it…"}</span>
            <Tip content="Stops waiting here. The function keeps running in Azure; a single invocation can't be stopped from outside.">
              <Button variant="ghost" className="ml-auto" onClick={() => api.fn.cancelRun({ runId: runId.current })}>Stop waiting</Button>
            </Tip>
          </>
        ) : (
          <>
            <span className="text-[11.5px] text-fg-3">Sent once, never retried.</span>
            <Button variant={!canRun ? "secondary" : prod ? "danger" : "primary"} onClick={run} disabled={!canRun} className="ml-auto">
              <Play /> {result ? "Run again" : prod ? "Run in production" : "Run"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function Pairs({ title, pairs, onChange }: { title: string; pairs: [string, string][]; onChange: (p: [string, string][]) => void }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.08em] text-fg-3">
        {title}
        <Button variant="ghost" size="icon-sm" aria-label={`Add ${title.toLowerCase()}`} onClick={() => onChange([...pairs, ["", ""]])}><Plus /></Button>
      </div>
      {pairs.length === 0 && <div className="text-[12px] text-fg-3">None</div>}
      <div className="space-y-1.5">
        {pairs.map(([k, v], i) => (
          <div key={i} className="flex gap-1.5">
            <Field size="sm" icon={null} value={k} onChange={(nk) => onChange(pairs.map((p, j) => (j === i ? [nk, p[1]] : p)))} placeholder="name" wrapperClassName="w-[40%]" className="font-mono" />
            <Field size="sm" icon={null} value={v} onChange={(nv) => onChange(pairs.map((p, j) => (j === i ? [p[0], nv] : p)))} placeholder="value" wrapperClassName="flex-1" className="font-mono" />
            <Button variant="ghost" size="icon-sm" aria-label="Remove" className="size-7" onClick={() => onChange(pairs.filter((_, j) => j !== i))}><Trash2 /></Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Response({ result }: { result: RunResult }) {
  const text = b64ToText(result.body);
  const json = (() => { try { return text.trim() ? JSON.parse(text) : undefined; } catch { return undefined; } })();
  const tone = result.status < 300 ? "ok" : result.status < 500 ? "warn" : "bad";
  return (
    <div className="overflow-hidden rounded-lg border border-line">
      <div className="flex items-center gap-2 border-b border-line bg-bg-1 px-3 py-2">
        <Chip tone={tone}>{result.status} {result.statusText}</Chip>
        <span className="text-[12px] text-fg-3">{fmtMs(result.ms)} · {fmtBytes(result.size)}{result.truncated ? " (first 2 MB shown)" : ""}</span>
        {result.kind === "admin" && result.status === 202 && <span className="text-[12px] text-fg-3">Accepted: the host started it.</span>}
        {text && <CopyButton text={text} className="ml-auto" label="Copy body" />}
      </div>
      {Object.keys(result.headers).length > 0 && (
        <details className="border-b border-line px-3 py-2 text-[12px]">
          <summary className="cursor-default text-fg-3">Headers ({Object.keys(result.headers).length})</summary>
          <div className="mt-1.5 grid grid-cols-[minmax(0,40%)_1fr] gap-x-3 gap-y-1 font-mono text-[11.5px]">
            {Object.entries(result.headers).map(([k, v]) => <div key={k} className="contents"><span className="truncate text-fg-3">{k}</span><span className="selectable break-all text-fg-2">{v}</span></div>)}
          </div>
        </details>
      )}
      {text ? (
        json !== undefined ? <div className="max-h-80 overflow-auto p-1.5"><JsonTree value={json} onCopy={(_, t) => copy(t)} /></div> : <pre className="selectable max-h-80 overflow-auto whitespace-pre-wrap break-all p-3 font-mono text-[12px] text-fg-2">{text}</pre>
      ) : (
        <div className="px-3 py-2.5 text-[12px] text-fg-3">Empty body</div>
      )}
    </div>
  );
}

// Polls App Insights every 5 seconds, for up to 5 minutes, for the invocation this run caused.
function Watch({ link, fn, result, onFound }: { link: InsightsLink; fn: string; result: RunResult; onFound: (inv: Invocation) => void }) {
  const [found, setFound] = useState<Invocation | null>(null);
  const [gaveUp, setGaveUp] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    let stop = false;
    let busy = false;
    const started = Date.now();
    const tick = async () => {
      if (stop || busy) return;
      setElapsed(Date.now() - started);
      if (Date.now() - started > 5 * 60_000) { setGaveUp(true); stop = true; return; }
      busy = true;
      try {
        const inv = await api.fn.findInvocation({ link, fn, traceId: result.traceId, since: result.startedAt });
        if (inv && !stop) { setFound(inv); stop = true; onFound(inv); }
      } catch { /* retried on the next tick */ } finally { busy = false; }
    };
    const id = window.setInterval(tick, 5000);
    const t = window.setTimeout(tick, 3000);
    return () => { stop = true; window.clearInterval(id); window.clearTimeout(t); };
    // onFound is stable enough; restarting on every render would reset the watch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.traceId]);
  if (found)
    return (
      <div className="flex items-center gap-2 rounded-lg border border-ok/25 bg-ok/5 px-3 py-2.5 text-[12.5px] text-ok">
        <CheckCircle2 className="size-4" /> Invocation recorded{found.exact ? "" : " (matched by time)"}. It's selected in the list, with its trace.
      </div>
    );
  return (
    <Tip content={{ title: "Waiting for Application Insights", body: G.fn.ingest }} block>
      <div className="flex w-full items-center gap-2 rounded-lg border border-line bg-bg-1 px-3 py-2.5 text-[12.5px] text-fg-2">
        {gaveUp ? <Clock className="size-4 text-fg-3" /> : <Spinner />}
        {gaveUp ? "Not in Application Insights after 5 minutes. It may be sampled out, or the app logs elsewhere." : `Waiting for the invocation to appear in Application Insights… ${Math.round(elapsed / 1000)}s`}
      </div>
    </Tip>
  );
}
