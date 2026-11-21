// Demo Azure Functions: fictional apps whose history comes from the demo telemetry in insights.js.
import { randomBytes } from "node:crypto";
import { SUB_DEV, SUB_PROD, SUB_SIDE, wait } from "./core.js";
import { COMPONENTS, componentById, functionRuns, remember } from "./insights.js";

const app = (name, sub, extra = {}) => ({
  id: `/subscriptions/${sub}/resourceGroups/${name}-rg/providers/Microsoft.Web/sites/${name}`,
  name, subscriptionId: sub, resourceGroup: `${name}-rg`, location: "westeurope", kind: "functionapp,linux", linux: true,
  state: "Running", hostName: `${name}.azurewebsites.net`, plan: "FlexConsumption", httpsOnly: true, ...extra,
});
const APPS = {
  [SUB_PROD]: [app("acme-prod-orders-func", SUB_PROD)],
  [SUB_DEV]: [app("acme-dev-orders-func", SUB_DEV, { plan: "Dynamic" })],
  [SUB_SIDE]: [app("hobby-dev-events-func", SUB_SIDE, { state: "Stopped", plan: "Dynamic" })],
};

const FUNCTIONS = [
  { name: "PlaceOrder", language: "dotnet-isolated", disabled: false, trigger: { type: "httpTrigger" }, http: { methods: ["post"], route: "orders", authLevel: "function" }, bindings: [{ type: "httpTrigger", direction: "in", name: "req" }, { type: "serviceBus", direction: "out", name: "events" }], runnable: true },
  { name: "ProcessOrderEvents", language: "dotnet-isolated", disabled: false, trigger: { type: "serviceBusTrigger", topicName: "order-events", subscriptionName: "fulfilment", connection: "ServiceBus" }, http: null, bindings: [{ type: "serviceBusTrigger", direction: "in", name: "message" }], runnable: true },
  { name: "NightlyInvoiceExport", language: "dotnet-isolated", disabled: false, trigger: { type: "timerTrigger", schedule: "0 0 2 * * *" }, http: null, bindings: [{ type: "timerTrigger", direction: "in", name: "timer" }, { type: "blob", direction: "out", name: "export" }], runnable: true },
  { name: "RunFulfilment", language: "dotnet-isolated", disabled: false, trigger: { type: "orchestrationTrigger" }, http: null, bindings: [{ type: "orchestrationTrigger", direction: "in", name: "context" }], runnable: false },
  { name: "ReserveStock", language: "dotnet-isolated", disabled: false, trigger: { type: "activityTrigger" }, http: null, bindings: [{ type: "activityTrigger", direction: "in", name: "input" }], runnable: false },
  { name: "LegacyCsvImport", language: "dotnet-isolated", disabled: true, trigger: { type: "blobTrigger", path: "imports/{name}.csv", connection: "Storage" }, http: null, bindings: [{ type: "blobTrigger", direction: "in", name: "blob" }], runnable: true },
];

export const apps = async (subId) => (await wait(200), APPS[subId] ?? []);
export const functions = async (a) => (await wait(250), FUNCTIONS.map((f) => ({ ...f, invokeUrl: f.http ? `https://${a.hostName}/api/${f.http.route}` : null })));
export const access = async (a) => ({ read: true, run: !a.name.startsWith("hobby"), settings: !a.name.includes("prod"), scope: a.id });

const componentFor = (a) => {
  const c = (COMPONENTS[a.subscriptionId] ?? [])[0];
  return c && { component: Object.fromEntries(Object.entries(c).filter(([k]) => k !== "roles")), role: a.name, via: a.name.includes("prod") ? "telemetry" : "settings" };
};
export const insights = async ({ app: a }) => (await wait(600), componentFor(a));

const RANGE_MS = { "30m": 18e5, "1h": 36e5, "6h": 216e5, "24h": 864e5, "3d": 2592e5, "7d": 6048e5, "30d": 2592e6 };

export async function stats({ link, functionNames, range = "24h" }) {
  await wait(300);
  const c = componentById(link.component.id);
  const quiet = ["RunFulfilment", "ReserveStock", "LegacyCsvImport"];
  return functionNames.filter((n) => !quiet.includes(n)).map((name) => {
    const runs = functionRuns(c, link.role, name, RANGE_MS[range] ?? RANGE_MS["24h"], 400, false);
    if (!runs.length) return null;
    const d = runs.map((r) => r.duration).sort((a, b) => a - b);
    return { name, n: runs.length * 20, failed: runs.filter((r) => r.success === "False").length * 20, p50: d[Math.floor(d.length / 2)], p95: d[Math.floor(d.length * 0.95)], lastRun: runs[0].timestamp };
  }).filter(Boolean);
}

export async function invocations({ link, fn, range = "24h", failedOnly, limit = 300 }) {
  await wait(300);
  if (["RunFulfilment", "ReserveStock", "LegacyCsvImport"].includes(fn)) return [];
  return functionRuns(componentById(link.component.id), link.role, fn, RANGE_MS[range] ?? RANGE_MS["24h"], limit, failedOnly);
}

// Pretend App Insights ingestion takes ~12 seconds after a run.
const runs = new Map();
export async function findInvocation({ link, fn, traceId, since }) {
  await wait(200);
  const started = runs.get(traceId);
  if (!started || Date.now() - started < 12_000) return null;
  return { timestamp: new Date(new Date(since).getTime() + 900).toISOString(), id: traceId.slice(0, 16), operation_Id: traceId, success: "True", resultCode: fn === "PlaceOrder" ? "201" : "0", duration: 412.6, exact: true };
}

export async function run({ app: a, fn, confirm, http, input }) {
  if (/(^|-)prod(-|$)/.test(a.name) && confirm !== a.name) throw Object.assign(new Error(`Type ${a.name} to confirm a run in production.`), { code: "CONFIRM_REQUIRED" });
  if (a.state !== "Running") throw Object.assign(new Error(`${a.name} is ${a.state.toLowerCase()}. Start it before running functions.`), { code: "APP_STOPPED" });
  const f = FUNCTIONS.find((x) => x.name === fn);
  if (f.disabled) throw Object.assign(new Error(`${fn} is disabled. Enable it in Azure before running it.`), { code: "DISABLED" });
  const t0 = Date.now();
  await wait(f.http ? 700 : 300);
  const traceId = randomBytes(16).toString("hex");
  runs.set(traceId, Date.now());
  const c = componentById(componentFor(a).component.id);
  remember(traceId, { at: Date.now(), c, forced: f.http ? "order" : fn === "NightlyInvoiceExport" ? "timer" : "events", fnName: f.http ? undefined : fn });
  const body = f.http ? JSON.stringify({ orderId: "ORD-048311", status: "accepted", total: { amount: 52.48, currency: "EUR" } }, null, 2) : "";
  return {
    status: f.http ? 201 : 202, statusText: f.http ? "Created" : "Accepted",
    headers: f.http ? { "content-type": "application/json; charset=utf-8", "request-context": "appId=cid-v1:demo", date: new Date().toUTCString() } : { date: new Date().toUTCString() },
    body: Buffer.from(body).toString("base64"), size: body.length, truncated: false, ms: Date.now() - t0, traceId, startedAt: new Date(t0).toISOString(), kind: f.http ? "http" : "admin",
  };
}
export const cancelRun = async () => true;
