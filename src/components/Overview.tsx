import { useEffect, useMemo } from "react";
import { BaseEdge, Background, BackgroundVariant, Controls, EdgeLabelRenderer, getBezierPath, Handle, Position, ReactFlow, useNodesState, type Edge, type EdgeProps, type Node, type NodeProps } from "@xyflow/react";
import { AlertTriangle, Box, Inbox, Layers, Lock, Network, RefreshCw, Skull } from "lucide-react";
import { canRead, type Access, type Entities, type EntityRef, type Namespace } from "../types";
import { useQuery } from "../lib/query";
import { ago, cn, envOf } from "../lib/util";
import { AnimatedNumber, Button, EnvBadge, Header, NoDrag, Spinner, Tip, type TipContent } from "./ui";
import * as G from "../lib/glossary";

export function Overview({ ns, onSelect }: { ns: Namespace; onSelect: (e: EntityRef) => void }) {
  const q = useQuery<Entities>(`ent:${ns.id}`, () => window.bus.entities(ns));
  const env = envOf(ns.name);
  const access = useQuery<Access>(`access:${ns.id}`, () => window.bus.access(ns));
  const totals = useMemo(() => {
    const t = { topics: 0, subs: 0, queues: 0, active: 0, dlq: 0 };
    if (!q.data) return t;
    t.queues = q.data.queues.length;
    t.topics = q.data.topics.length;
    for (const qu of q.data.queues) { t.active += qu.counts.active; t.dlq += qu.counts.deadLetter; }
    for (const tp of q.data.topics) for (const s of tp.subscriptions) { t.subs++; t.active += s.counts.active; t.dlq += s.counts.deadLetter; }
    return t;
  }, [q.data]);

  return (
    <div className="flex h-full flex-col">
      <Header>
        <Network className="size-4 shrink-0 text-fg-3" />
        <h1 className="truncate text-[14px] font-semibold tracking-tight">{ns.name}</h1>
        <Tip content={G.env[env]} side="bottom"><EnvBadge env={env} /></Tip>
        <span className="hidden truncate text-[12px] text-fg-3 lg:block">{ns.location} · {ns.sku} · {ns.resourceGroup}</span>
        <NoDrag className="ml-auto">
          {q.at && <span className="text-[12px] text-fg-3">Updated {ago(new Date(q.at).toISOString())}</span>}
          <Button onClick={q.reload}>{q.loading ? <Spinner className="size-3" /> : <RefreshCw />} Refresh</Button>
        </NoDrag>
      </Header>
      {env === "prod" && (
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-bad/20 bg-bad/[0.06] px-5 text-[12px] text-bad">
          <AlertTriangle className="size-3.5" /> Production namespace. Busscope only peeks, so no message is locked, completed or moved.
        </div>
      )}
      {access.data && !canRead(access.data) && (
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line bg-bg-1 px-5 text-[12px] text-fg-2">
          <Lock className="size-3.5 text-fg-3" />
          <span>Counts only. You can read this namespace but not its messages.</span>
          <Tip content={G.access.locked} side="bottom"><span className="cursor-help text-fg-3 underline decoration-line-2 decoration-dotted underline-offset-4">Why?</span></Tip>
        </div>
      )}
      <div className="grid shrink-0 grid-cols-5 divide-x divide-line border-b border-line">
        <Stat label="Topics" value={totals.topics} tip={G.stats.topics} />
        <Stat label="Subscriptions" value={totals.subs} tip={G.stats.subscriptions} />
        <Stat label="Queues" value={totals.queues} tip={G.stats.queues} />
        <Stat label="Active messages" value={totals.active} tip={G.stats.active} />
        <Stat label="Dead-lettered" value={totals.dlq} tone={totals.dlq ? "bad" : undefined} tip={G.stats.dlq} />
      </div>
      <div className="relative min-h-0 flex-1">
        {q.error && <div className="p-6 text-[13px] text-bad">{q.error}</div>}
        {q.data && <Topology data={q.data} ns={ns} onSelect={onSelect} />}
        {!q.data && q.loading && <div className="flex h-full items-center justify-center gap-2 text-[13px] text-fg-3"><Spinner /> Mapping namespace</div>}
      </div>
    </div>
  );
}

function Stat({ label, value, tone, tip }: { label: string; value: number; tone?: "bad"; tip: TipContent }) {
  return (
    <div className="px-5 py-4">
      <Tip content={tip} side="bottom"><span className="cursor-help text-[12px] text-fg-3 underline decoration-line-2 decoration-dotted underline-offset-4">{label}</span></Tip>
      <AnimatedNumber value={value} className={cn("mt-1 block text-[24px] font-semibold tracking-tight", tone === "bad" ? "text-bad" : "text-fg")} />
    </div>
  );
}

type Data = { label: string; sub?: string; kind: "topic" | "sub" | "queue" | "dlq" | "fwd"; count?: number; ref?: EntityRef; dim?: boolean; tip: TipContent };

function FlowNode({ data, selected }: NodeProps<Node<Data>>) {
  const Icon = { topic: Layers, sub: Box, queue: Inbox, dlq: Skull, fwd: Inbox }[data.kind];
  const isDlq = data.kind === "dlq";
  return (
    <Tip content={data.tip} side="bottom" block>
    <div
      className={cn(
        "w-[240px] rounded-lg border bg-bg-1 px-3 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.4)] transition-[border-color,opacity] duration-150",
        isDlq ? "border-bad/30" : "border-line-2",
        data.ref && "hover:border-fg-3",
        selected && "border-fg-3",
        data.dim && "opacity-60",
      )}
    >
      <Handle type="target" position={Position.Left} className="!size-1.5 !min-h-0 !min-w-0 !border-0 !bg-line-2" />
      <div className="flex items-center gap-2">
        <Icon className={cn("size-3.5 shrink-0", isDlq ? "text-bad" : "text-fg-3")} />
        <span className="truncate text-[13px] font-medium text-fg">{data.label}</span>
      </div>
      <div className="mt-1.5 flex h-5 items-center gap-1.5 text-[12px]">
        {data.count !== undefined && (
          <span className={cn("inline-flex h-5 items-center gap-1 rounded px-1.5 font-medium", isDlq ? "bg-bad/10 text-bad" : data.count ? "bg-accent/10 text-accent" : "bg-bg-3 text-fg-3")}>
            <AnimatedNumber value={data.count} /> {isDlq ? "dead-lettered" : "active"}
          </span>
        )}
        {data.sub && <span className="truncate text-fg-3">{data.sub}</span>}
      </div>
      <Handle type="source" position={Position.Right} className="!size-1.5 !min-h-0 !min-w-0 !border-0 !bg-line-2" />
    </div>
    </Tip>
  );
}

type Rule = Entities["topics"][number]["subscriptions"][number]["rules"][number];
type EdgeData = { label: string; rules?: Rule[]; note?: string };

// Correlation filters nest custom properties under `properties`; flatten them next to system ones.
function correlationPairs(c: Record<string, unknown>) {
  const { properties, ...system } = c as { properties?: Record<string, unknown> } & Record<string, unknown>;
  return [...Object.entries(system), ...Object.entries(properties ?? {})].map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : v}`);
}

function ruleText(r: Rule) {
  if (r.sql) return r.sql;
  if (r.correlation) return correlationPairs(r.correlation).join(" AND ");
  return r.filterType;
}

function RuleTip({ rules, note }: { rules?: Rule[]; note?: string }) {
  if (!rules) return <>{note}</>;
  const all = rules.length === 1 && rules[0].sql === "1=1";
  return (
    <span className="block space-y-2">
      <span className="block">{all ? G.edge.all : rules.some((r) => r.correlation) ? G.edge.correlation : G.edge.sql}</span>
      {rules.length > 1 && <span className="block">{G.edge.multi}</span>}
      {!all && rules.map((r) => (
        <span key={r.name} className="block rounded-md border border-line bg-bg-1 px-2 py-1.5">
          <span className="block text-[11px] text-fg-3">{r.name}</span>
          <code className="block break-words font-mono text-[11px] text-fg">{ruleText(r)}</code>
          {r.action && <code className="mt-1 block break-words font-mono text-[11px] text-warn">SET {r.action}</code>}
        </span>
      ))}
    </span>
  );
}

function RuleEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, markerEnd, data }: EdgeProps<Edge<EdgeData>>) {
  const [path, x, y] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  return (
    <>
      <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} />
      {data?.label && (
        <EdgeLabelRenderer>
          <div className="nodrag nopan absolute" style={{ transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`, pointerEvents: "all" }}>
            <Tip content={{ title: data.rules ? (data.rules.length > 1 ? `${data.rules.length} filter rules` : "Subscription filter") : "Auto-forward", body: <RuleTip rules={data.rules} note={data.note} /> }}>
              <span className="inline-flex h-6 cursor-help items-center rounded-md border border-line bg-bg px-2 font-mono text-[11px] text-fg-2 transition-colors duration-150 hover:border-line-2 hover:text-fg">{data.label}</span>
            </Tip>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const edgeTypes = { rule: RuleEdge };

const nodeTypes = { bus: FlowNode };

function ruleLabel(r: Rule) {
  if (r.sql) return r.sql === "1=1" ? "all" : r.sql.length > 34 ? r.sql.slice(0, 33) + "…" : r.sql;
  if (r.correlation) {
    const t = correlationPairs(r.correlation).join(", ");
    return t.length > 34 ? t.slice(0, 33) + "…" : t;
  }
  return r.filterType;
}

const COL = [0, 540, 900, 1260];
const ROW = 96;

function layout(data: Entities, ns: Namespace) {
  const nodes: Node<Data>[] = [];
  const edges: Edge[] = [];
  let y = 0;
  for (const t of data.topics) {
    const subs = t.subscriptions;
    const h = Math.max(1, subs.length) * ROW;
    const tid = `t:${t.name}`;
    nodes.push({ id: tid, type: "bus", position: { x: COL[0], y: y + h / 2 - ROW / 2 }, data: { label: t.name, kind: "topic", sub: `${subs.length} subscription${subs.length === 1 ? "" : "s"}`, tip: G.node.topic(subs.length) } });
    subs.forEach((s, i) => {
      const sid = `s:${t.name}/${s.name}`;
      const ref: EntityRef = { kind: "subscription", ns, topic: t.name, subscription: s.name };
      nodes.push({ id: sid, type: "bus", position: { x: COL[1], y: y + i * ROW }, data: { label: s.name, kind: "sub", count: s.counts.active, ref, dim: !s.counts.active && !s.counts.deadLetter, tip: G.node.sub(s.maxDeliveryCount, s.requiresSession, s.forwardTo) } });
      edges.push({
        id: `${tid}->${sid}`, source: tid, target: sid, type: "rule",
        data: { label: s.rules.length > 1 ? `${s.rules.length} rules` : s.rules.map(ruleLabel)[0] ?? "no rules", rules: s.rules },
        animated: s.counts.active > 0,
        style: { stroke: s.counts.active ? "#3b82f6" : "#3a3a3a", strokeWidth: Math.min(1 + Math.log10(1 + s.counts.active), 4) },
      });
      if (s.counts.deadLetter) {
        const did = `d:${t.name}/${s.name}`;
        nodes.push({ id: did, type: "bus", position: { x: COL[2], y: y + i * ROW }, data: { label: "Dead-letter queue", kind: "dlq", count: s.counts.deadLetter, ref: { ...ref, dlq: true }, tip: G.node.dlq } });
        edges.push({ id: `${sid}->${did}`, source: sid, target: did, style: { stroke: "#ff5b4f", strokeOpacity: 0.7, strokeWidth: Math.min(1 + Math.log10(1 + s.counts.deadLetter), 3), strokeDasharray: "4 4" } });
      }
      if (s.forwardTo) {
        const fid = `f:${s.forwardTo}`;
        if (!nodes.find((n) => n.id === fid)) nodes.push({ id: fid, type: "bus", position: { x: COL[3], y: y + i * ROW }, data: { label: s.forwardTo, kind: "fwd", sub: "forward target", tip: G.node.fwd } });
        edges.push({ id: `${sid}->${fid}`, source: sid, target: fid, type: "rule", data: { label: "forward", note: G.edge.forward } });
      }
    });
    y += h + 40;
  }
  for (const q of data.queues) {
    const qid = `q:${q.name}`;
    const ref: EntityRef = { kind: "queue", ns, queue: q.name };
    nodes.push({ id: qid, type: "bus", position: { x: COL[1], y }, data: { label: q.name, kind: "queue", count: q.counts.active, ref, tip: G.node.queue(q.maxDeliveryCount) } });
    if (q.counts.deadLetter) {
      const did = `qd:${q.name}`;
      nodes.push({ id: did, type: "bus", position: { x: COL[2], y }, data: { label: "Dead-letter queue", kind: "dlq", count: q.counts.deadLetter, ref: { ...ref, dlq: true }, tip: G.node.dlq } });
      edges.push({ id: `${qid}->${did}`, source: qid, target: did, style: { stroke: "#ff5b4f", strokeOpacity: 0.7, strokeDasharray: "4 4" } });
    }
    y += ROW;
  }
  return { nodes, edges };
}

function Topology({ data, ns, onSelect }: { data: Entities; ns: Namespace; onSelect: (e: EntityRef) => void }) {
  const initial = useMemo(() => layout(data, ns), [data, ns]);
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);

  // On refresh, keep positions the user dragged to and take fresh counts.
  useEffect(() => {
    setNodes((cur) => {
      const pos = new Map(cur.map((n) => [n.id, n.position]));
      return initial.nodes.map((n) => ({ ...n, position: pos.get(n.id) ?? n.position }));
    });
  }, [initial, setNodes]);

  if (!initial.nodes.length) return <div className="flex h-full items-center justify-center text-[13px] text-fg-3">This namespace has no queues or topics.</div>;
  return (
    <ReactFlow
      nodes={nodes}
      edges={initial.edges}
      onNodesChange={onNodesChange}
      onNodeClick={(_, n) => n.data.ref && onSelect(n.data.ref)}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      nodesConnectable={false}
      nodeDragThreshold={4}
      fitView
      fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
      minZoom={0.2}
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#262626" />
      <Controls showInteractive={false} position="bottom-right" />
    </ReactFlow>
  );
}
