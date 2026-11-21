// Where the user is. Each tool keeps its own place, so switching tools returns you to where you were.
// Tools link to each other through go(): a trace id on a Service Bus message opens App Insights, a
// function invocation opens its trace, and so on.
import { createContext, useContext } from "react";
import type { Component, EntityRef, FunctionApp, Namespace, Sub } from "../types";

export type ToolId = "sb" | "fn" | "ai";
export type TraceTarget = { operationId: string; at?: string; subIds?: string[] };
export type Place =
  | { tool: "home" }
  | { tool: "sb"; ns?: Namespace; entity?: EntityRef }
  | { tool: "fn"; app?: FunctionApp; fn?: string }
  | { tool: "ai"; component?: Component; trace?: TraceTarget; tab?: InsightsTab; op?: string; logSearch?: string };
export type InsightsTab = "overview" | "requests" | "logs" | "query";

// go() pushes onto the back/forward history, like a browser. back() and forward() walk it.
export type Nav = {
  place: Place; go: (p: Place) => void; subs: Sub[]; openSearch: () => void;
  back: () => void; forward: () => void; canBack: boolean; canForward: boolean;
};
export const NavContext = createContext<Nav>({ place: { tool: "home" }, go: () => {}, subs: [], openSearch: () => {}, back: () => {}, forward: () => {}, canBack: false, canForward: false });
export const useNav = () => useContext(NavContext);

// A short label and key for the Recent list.
export function describe(p: Place): { key: string; label: string; hint: string } | null {
  if (p.tool === "sb" && p.entity) {
    const e = p.entity;
    return { key: `sb|${e.ns.id}|${e.kind === "queue" ? e.queue : `${e.topic}/${e.subscription}`}`, label: e.kind === "queue" ? e.queue : `${e.topic} / ${e.subscription}`, hint: e.ns.name };
  }
  if (p.tool === "sb" && p.ns) return { key: `sb|${p.ns.id}`, label: p.ns.name, hint: "Service Bus namespace" };
  if (p.tool === "fn" && p.app && p.fn) return { key: `fn|${p.app.id}|${p.fn}`, label: p.fn, hint: p.app.name };
  if (p.tool === "fn" && p.app) return { key: `fn|${p.app.id}`, label: p.app.name, hint: "Function app" };
  if (p.tool === "ai" && p.component) return { key: `ai|${p.component.id}`, label: p.component.name, hint: "Application Insights" };
  return null;
}
