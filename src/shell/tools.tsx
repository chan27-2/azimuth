import type { ReactNode } from "react";
import { BusGlyph, FunctionsGlyph, InsightsGlyph } from "../ui/Logo";
import type { ToolId } from "./nav";

export type ToolInfo = { id: ToolId; name: string; product: string; blurb: string; key: string; glyph: (cls?: string) => ReactNode };

export const TOOLS: ToolInfo[] = [
  { id: "sb", name: "Busscope", product: "Service Bus", key: "1", blurb: "Topology, peek and decode messages, dead-letter reasons. Read-only.", glyph: (c) => <BusGlyph className={c} /> },
  { id: "fn", name: "Functions", product: "Azure Functions", key: "2", blurb: "Every function and its trigger, invocation history with logs, and Run with confirmation.", glyph: (c) => <FunctionsGlyph className={c} /> },
  { id: "ai", name: "Insights", product: "Application Insights", key: "3", blurb: "Requests, failures, logs and end-to-end traces as a waterfall. Plus raw KQL.", glyph: (c) => <InsightsGlyph className={c} /> },
];
export const tool = (id: ToolId) => TOOLS.find((t) => t.id === id)!;
