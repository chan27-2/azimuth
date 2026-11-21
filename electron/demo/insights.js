// Demo Application Insights: fictional telemetry generated from seeds, so lists, traces and logs agree
// with each other and stay the same between refreshes.
import { SUB_DEV, SUB_PROD, SUB_SIDE, hex, rng, wait } from "./core.js";

const comp = (name, sub, roles) => ({
  id: `/subscriptions/${sub}/resourceGroups/${name}-rg/providers/microsoft.insights/components/${name}`,
  name, subscriptionId: sub, resourceGroup: `${name}-rg`, location: "westeurope", appId: hex(rng(name), 32),
  kind: "web", workspace: `${name.replace(/-appinsights$/, "")}-logs`, retentionDays: 90, samplingPercentage: null, roles,
});

export const COMPONENTS = {
  [SUB_PROD]: [comp("acme-prod-appinsights", SUB_PROD, ["orders-api", "acme-prod-orders-func", "billing-api"]), comp("acme-prod-web-appinsights", SUB_PROD, ["storefront"])],
  [SUB_DEV]: [comp("acme-dev-appinsights", SUB_DEV, ["orders-api", "acme-dev-orders-func", "billing-api"])],
  [SUB_SIDE]: [comp("hobby-appinsights", SUB_SIDE, ["hobby-dev-events-func"])],
};
const all = () => Object.values(COMPONENTS).flat();
const strip = ({ roles, ...c }) => c;
const byId = (id) => all().find((c) => c.id === id);

export const components = async (subId) => (await wait(150), (COMPONENTS[subId] ?? []).map(strip));

// ─── Trace generator ──────────────────────────────────────────────────────────
const RANGE_MS = { "30m": 18e5, "1h": 36e5, "6h": 216e5, "24h": 864e5, "3d": 2592e5, "7d": 6048e5, "30d": 2592e6 };
const BIN = { "30m": 6e4, "1h": 12e4, "6h": 6e5, "24h": 18e5, "3d": 72e5, "7d": 144e5, "30d": 864e5 };
const BIN_LABEL = { "30m": "1m", "1h": "2m", "6h": "10m", "24h": "30m", "3d": "2h", "7d": "4h", "30d": "1d" };
const iso = (ms) => new Date(ms).toISOString();

function item(base, extra) {
  return {
    itemId: hex(rng(base.seed + (extra.id ?? extra.message ?? extra.name)), 32), operation_ParentId: null, operation_Name: base.opName, name: "", duration: null, success: null,
    resultCode: null, target: null, type: null, data: null, url: null, message: null, severityLevel: null, cloud_RoleInstance: `${extra.cloud_RoleName}-7f9c`,
    outerMessage: null, problemId: null, details: null, customDimensions: {}, customMeasurements: null, sdkVersion: "dotnet9:otel1.11", component: base.component, ...extra,
  };
}

// One operation. The flavour (an order placed through the API, a timer run, a health probe) follows from
// the operation id, so the same id always produces the same trace.
const remembered = new Map(); // demo only: operation id -> how it was generated, so trace() reproduces it
export function makeTrace(operationId, atMs, c, forced, fnName) {
  const known = remembered.get(operationId);
  if (known && !forced) return makeTrace(operationId, known.at, known.c, known.forced, known.fnName);
  const r = rng(operationId);
  const env = c.name.includes("prod") ? "prod" : c.name.includes("dev") ? "dev" : "side";
  const func = c.roles.find((x) => x.endsWith("-func")) ?? "orders-func";
  const roll = r();
  const flavour = forced ?? (c.roles.length === 1 && func === c.roles[0] ? (roll < 0.5 ? "events" : "timer") : roll < 0.62 ? "order" : roll < 0.8 ? "get" : roll < 0.9 ? "timer" : "health");
  const fail = r() < (flavour === "order" ? 0.18 : 0.04);
  const items = [];
  const span = () => hex(r, 16);
  const base = { seed: operationId, component: c.name, opName: "" };
  let t = atMs;

  if (flavour === "order" || flavour === "get" || flavour === "health") {
    const name = flavour === "order" ? "POST /orders" : flavour === "get" ? "GET /orders/{id}" : "GET /health";
    base.opName = name;
    const root = span();
    const total = flavour === "health" ? 3 + r() * 4 : flavour === "get" ? 20 + r() * 60 : 180 + r() * 500;
    items.push(item(base, { itemType: "request", id: root, operation_ParentId: operationId, timestamp: iso(t), name, duration: total, success: fail && flavour === "order" ? "False" : "True", resultCode: fail && flavour === "order" ? "500" : flavour === "order" ? "201" : "200", url: `https://${env === "side" ? "hobby" : "acme-" + env}-orders.example.com${name.split(" ")[1].replace("{id}", "ORD-0" + Math.floor(48000 + r() * 900))}`, cloud_RoleName: "orders-api", customDimensions: { "http.route": name.split(" ")[1], "enduser.id": `cus_${1000 + Math.floor(r() * 90)}` } }));
    if (flavour === "health") return { operationId, items };
    const sqlId = span();
    const sqlDur = 4 + r() * 30;
    items.push(item(base, { itemType: "dependency", id: sqlId, operation_ParentId: root, timestamp: iso(t + 2), name: flavour === "order" ? "INSERT dbo.Orders" : "SELECT dbo.Orders", type: "SQL", target: `acme-${env}-sql.database.windows.net | orders`, data: flavour === "order" ? "INSERT INTO dbo.Orders (Id, CustomerId, Total, Currency) VALUES (@id, @customer, @total, @currency)" : "SELECT TOP 1 * FROM dbo.Orders WHERE Id = @id", duration: sqlDur, success: "True", resultCode: "0", cloud_RoleName: "orders-api" }));
    items.push(item(base, { itemType: "trace", timestamp: iso(t + 3 + sqlDur), operation_ParentId: root, message: flavour === "order" ? "Order accepted, total EUR 52.48" : "Order found", severityLevel: 1, cloud_RoleName: "orders-api", customDimensions: { CategoryName: "Acme.Orders.Api.OrdersController" } }));
    if (flavour === "get") return { operationId, items };
    // Billing call
    const httpId = span();
    const billStart = t + 8 + sqlDur;
    const billDur = 40 + r() * 120;
    items.push(item(base, { itemType: "dependency", id: httpId, operation_ParentId: root, timestamp: iso(billStart), name: "POST /invoices", type: "HTTP", target: "billing-api", data: "https://billing.internal/invoices", duration: billDur, success: "True", resultCode: "201", cloud_RoleName: "orders-api" }));
    const billReq = span();
    items.push(item(base, { itemType: "request", id: billReq, operation_ParentId: httpId, timestamp: iso(billStart + 3), name: "POST /invoices", duration: billDur - 6, success: "True", resultCode: "201", url: "https://billing.internal/invoices", cloud_RoleName: "billing-api" }));
    items.push(item(base, { itemType: "dependency", id: span(), operation_ParentId: billReq, timestamp: iso(billStart + 6), name: "INSERT dbo.Invoices", type: "SQL", target: `acme-${env}-sql.database.windows.net | billing`, data: "INSERT INTO dbo.Invoices (OrderId, Amount) VALUES (@orderId, @amount)", duration: 6 + r() * 12, success: "True", resultCode: "0", cloud_RoleName: "billing-api" }));
    // Publish to Service Bus, then the function picks it up
    const sbId = span();
    const sbStart = billStart + billDur + 4;
    items.push(item(base, { itemType: "dependency", id: sbId, operation_ParentId: root, timestamp: iso(sbStart), name: "Send order-events", type: "Azure Service Bus", target: `acme-${env}-orders-sbns.servicebus.windows.net/order-events`, duration: 8 + r() * 10, success: "True", resultCode: "", cloud_RoleName: "orders-api", customDimensions: { "messaging.message.id": hex(r, 32) } }));
    t = sbStart + 40 + r() * 400;
    const fnReq = span();
    const fnDur = 60 + r() * 300;
    items.push(item(base, { itemType: "request", id: fnReq, operation_ParentId: sbId, timestamp: iso(t), name: "ProcessOrderEvents", duration: fnDur, success: fail ? "False" : "True", resultCode: fail ? "1" : "0", cloud_RoleName: func, customDimensions: { "faas.name": "ProcessOrderEvents", "faas.trigger": "pubsub", "faas.invocation_id": hex(r, 8) + "-" + hex(r, 4) + "-4" + hex(r, 3) + "-a" + hex(r, 3) + "-" + hex(r, 12) } }));
    items.push(item(base, { itemType: "trace", timestamp: iso(t + 1), operation_ParentId: fnReq, message: "Executing 'ProcessOrderEvents' (Reason='New ServiceBus message detected on 'order-events/Subscriptions/fulfilment'.')", severityLevel: 1, cloud_RoleName: func, customDimensions: { CategoryName: "Function.ProcessOrderEvents" } }));
    const whId = span();
    items.push(item(base, { itemType: "dependency", id: whId, operation_ParentId: fnReq, timestamp: iso(t + 5), name: "POST /reservations", type: "HTTP", target: "warehouse.acme.example", data: "https://warehouse.acme.example/reservations", duration: fnDur - 20, success: fail ? "False" : "True", resultCode: fail ? "409" : "200", cloud_RoleName: func }));
    if (fail) {
      items.push(item(base, { itemType: "trace", timestamp: iso(t + fnDur - 14), operation_ParentId: whId, message: `HTTP call failed with retry count 2 for policy DefaultHttpPolicy: 409 Conflict. Context data: {"request":{"method":"POST","url":"https://warehouse.acme.example/reservations","body":{"orderId":"ORD-0${Math.floor(48000 + r() * 900)}","lines":[{"sku":"SKU-1182","qty":2}]}},"response":{"status":409,"error":"insufficient_stock","available":0}}`, severityLevel: 2, cloud_RoleName: func, customDimensions: { CategoryName: "Acme.Orders.Fulfilment.ResilientHttpClient", retryCount: "2", context: '{"policy":"DefaultHttpPolicy","attempts":[{"at":1,"status":409},{"at":2,"status":409}]}' } }));
      items.push(item(base, { itemType: "trace", timestamp: iso(t + fnDur - 12), operation_ParentId: whId, message: "Warehouse rejected reservation for SKU-1182: insufficient stock (requested 2, available 0)", severityLevel: 2, cloud_RoleName: func, customDimensions: { CategoryName: "Acme.Orders.Fulfilment.StockClient", sku: "SKU-1182" } }));
      items.push(item(base, { itemType: "exception", timestamp: iso(t + fnDur - 4), operation_ParentId: fnReq, type: "Acme.Orders.StockNotReservedException", outerMessage: "Stock for SKU-1182 could not be reserved.", problemId: "Acme.Orders.StockNotReservedException at Acme.Orders.Fulfilment.ProcessOrderEvents.Run", severityLevel: 3, cloud_RoleName: func, details: [{ outerType: "Acme.Orders.StockNotReservedException", message: "Stock for SKU-1182 could not be reserved.", rawStack: "Acme.Orders.StockNotReservedException: Stock for SKU-1182 could not be reserved.\n   at Acme.Orders.Fulfilment.StockClient.ReserveAsync(String sku, Int32 qty) in /src/Fulfilment/StockClient.cs:line 58\n   at Acme.Orders.Fulfilment.ProcessOrderEvents.Run(ServiceBusReceivedMessage message) in /src/Fulfilment/ProcessOrderEvents.cs:line 31\n   at Microsoft.Azure.Functions.Worker.Invocation.DefaultFunctionExecutor.ExecuteAsync(FunctionContext context)" }] }));
      items.push(item(base, { itemType: "trace", timestamp: iso(t + fnDur), operation_ParentId: fnReq, message: `Executed 'ProcessOrderEvents' (Failed, Duration=${Math.round(fnDur)}ms)`, severityLevel: 3, cloud_RoleName: func, customDimensions: { CategoryName: "Function.ProcessOrderEvents" } }));
    } else {
      items.push(item(base, { itemType: "trace", timestamp: iso(t + fnDur), operation_ParentId: fnReq, message: `Executed 'ProcessOrderEvents' (Succeeded, Duration=${Math.round(fnDur)}ms)`, severityLevel: 1, cloud_RoleName: func, customDimensions: { CategoryName: "Function.ProcessOrderEvents" } }));
    }
    if (fail) {
      items[0].success = "False";
      items[0].resultCode = "500";
      items.push(item(base, { itemType: "exception", timestamp: iso(atMs + 6), operation_ParentId: root, type: "System.TimeoutException", outerMessage: "Fulfilment confirmation timed out.", problemId: "System.TimeoutException at Acme.Orders.Api.OrdersController.Place", severityLevel: 3, cloud_RoleName: "orders-api", details: [{ outerType: "System.TimeoutException", message: "Fulfilment confirmation timed out.", rawStack: "System.TimeoutException: Fulfilment confirmation timed out.\n   at Acme.Orders.Api.OrdersController.Place(PlaceOrderRequest request) in /src/Api/OrdersController.cs:line 74" }] }));
    }
  } else if (flavour === "events" || flavour === "timer" || flavour === "fn") {
    const name = fnName ?? (flavour === "timer" ? "NightlyInvoiceExport" : "ProcessOrderEvents");
    base.opName = name;
    const root = span();
    const dur = flavour === "timer" ? 1200 + r() * 2500 : 50 + r() * 300;
    items.push(item(base, { itemType: "request", id: root, operation_ParentId: operationId, timestamp: iso(t), name, duration: dur, success: fail ? "False" : "True", resultCode: fail ? "1" : "0", cloud_RoleName: func, customDimensions: { "faas.name": name, "faas.invocation_id": `${hex(r, 8)}-${hex(r, 4)}-4${hex(r, 3)}-a${hex(r, 3)}-${hex(r, 12)}`, TriggerReason: flavour === "timer" ? "Timer fired at " + iso(t) : "" } }));
    items.push(item(base, { itemType: "trace", timestamp: iso(t + 1), operation_ParentId: root, message: `Executing '${name}'`, severityLevel: 1, cloud_RoleName: func, customDimensions: { CategoryName: `Function.${name}` } }));
    items.push(item(base, { itemType: "dependency", id: span(), operation_ParentId: root, timestamp: iso(t + 4), name: flavour === "timer" ? "SELECT dbo.Invoices" : "POST /reservations", type: flavour === "timer" ? "SQL" : "HTTP", target: flavour === "timer" ? `acme-${env}-sql.database.windows.net | billing` : "warehouse.acme.example", duration: dur * 0.6, success: "True", resultCode: flavour === "timer" ? "0" : "200", cloud_RoleName: func }));
    if (flavour === "timer") items.push(item(base, { itemType: "trace", timestamp: iso(t + dur * 0.7), operation_ParentId: root, message: `Exported ${Math.floor(200 + r() * 400)} invoices to acme-${env}-exports/invoices/${iso(t).slice(0, 10)}.csv`, severityLevel: 1, cloud_RoleName: func, customDimensions: { CategoryName: `Function.${name}.User` } }));
    if (fail) items.push(item(base, { itemType: "exception", timestamp: iso(t + dur - 3), operation_ParentId: root, type: "System.InvalidOperationException", outerMessage: "Sequence contains no matching element", problemId: `System.InvalidOperationException at ${name}.Run`, severityLevel: 3, cloud_RoleName: func, details: [{ outerType: "System.InvalidOperationException", message: "Sequence contains no matching element", rawStack: `System.InvalidOperationException: Sequence contains no matching element\n   at System.Linq.ThrowHelper.ThrowNoMatchException()\n   at Acme.Orders.Functions.${name}.Run(FunctionContext context) in /src/Functions/${name}.cs:line 42` }] }));
    items.push(item(base, { itemType: "trace", timestamp: iso(t + dur), operation_ParentId: root, message: `Executed '${name}' (${fail ? "Failed" : "Succeeded"}, Duration=${Math.round(dur)}ms)`, severityLevel: fail ? 3 : 1, cloud_RoleName: func, customDimensions: { CategoryName: `Function.${name}` } }));
  }
  return { operationId, items };
}

// One operation every `step` ms, newest first, ids derived from the time slot.
function* opsBack(c, fromMs, toMs, step = 20_000, salt = "") {
  for (let slot = Math.floor(toMs / step); slot * step >= fromMs; slot--) {
    const r = rng(`${c.name}${salt}${slot}`);
    yield { operationId: hex(r, 32), at: slot * step + Math.floor(r() * step * 0.8) };
  }
}

const matchRole = (role) => (x) => !role || x.cloud_RoleName === role;

export async function overview({ component, range = "24h", role }) {
  await wait(350);
  const c = byId(component.id);
  const span = RANGE_MS[range] ?? RANGE_MS["24h"];
  const bin = BIN[range] ?? BIN["24h"];
  const scale = (c.name.includes("prod") ? 24 : 3) * (role ? 0.4 : 1);
  const now = Date.now();
  const timeline = [];
  for (let t = Math.floor((now - span) / bin) * bin; t <= now; t += bin) {
    const r = rng(`${c.name}${role}${t}`);
    const day = Math.sin(((t / 36e5) % 24) / 24 * Math.PI * 2 - 1.8) * 0.45 + 1;
    const total = Math.round((bin / 6e4) * scale * day * (0.85 + r() * 0.3));
    const spike = Math.abs(((t / 36e5) % 24) - 14.5) < 0.6 ? 6 : 1;
    timeline.push({ timestamp: iso(t), total, failed: Math.round(total * (0.006 + r() * 0.01) * spike) });
  }
  const total = timeline.reduce((a, b) => a + b.total, 0);
  const failed = timeline.reduce((a, b) => a + b.failed, 0);
  const ops = [
    ["POST /orders", 0.34, 0.05, 210, 690, "orders-api"], ["GET /orders/{id}", 0.28, 0.002, 38, 120, "orders-api"], ["GET /health", 0.14, 0, 4, 9, "orders-api"],
    ["ProcessOrderEvents", 0.12, 0.06, 140, 420, c.roles.find((x) => x.endsWith("-func"))], ["POST /invoices", 0.09, 0.01, 72, 190, "billing-api"], ["NightlyInvoiceExport", 0.0004, 0, 2400, 3900, c.roles.find((x) => x.endsWith("-func"))],
  ].filter((o) => c.roles.includes(o[5]) && (!role || o[5] === role));
  return {
    totals: { total, failed, p50: 61.2, p95: 742.8, exceptions: Math.round(failed * 1.4), dependencies: total * 3, depFailed: Math.round(failed * 0.6) },
    timeline,
    operations: ops.map(([name, share, f, p50, p95, r]) => ({ name, n: Math.max(1, Math.round(total * share)), failed: Math.round(total * share * f), p50, p95, role: r })),
    exceptions: [
      { problemId: "Acme.Orders.StockNotReservedException at Acme.Orders.Fulfilment.ProcessOrderEvents.Run", n: Math.round(failed * 0.7), lastSeen: iso(now - 4 * 6e4), type: "Acme.Orders.StockNotReservedException", message: "Stock for SKU-1182 could not be reserved.", role: c.roles.find((x) => x.endsWith("-func")), operation: "ProcessOrderEvents" },
      { problemId: "System.TimeoutException at Acme.Orders.Api.OrdersController.Place", n: Math.round(failed * 0.5), lastSeen: iso(now - 9 * 6e4), type: "System.TimeoutException", message: "Fulfilment confirmation timed out.", role: "orders-api", operation: "POST /orders" },
      { problemId: "System.InvalidOperationException at NightlyInvoiceExport.Run", n: 3, lastSeen: iso(now - 26 * 36e5), type: "System.InvalidOperationException", message: "Sequence contains no matching element", role: c.roles.find((x) => x.endsWith("-func")), operation: "NightlyInvoiceExport" },
    ].filter((e) => c.roles.includes(e.role) && (!role || e.role === role)),
    roles: c.roles,
    bin: BIN_LABEL[range],
  };
}

export async function requests({ component, range = "24h", role, name, failedOnly, minDuration, search, limit = 500 }) {
  await wait(300);
  const c = byId(component.id);
  const now = Date.now();
  const out = [];
  let scanned = 0;
  for (const op of opsBack(c, now - (RANGE_MS[range] ?? RANGE_MS["24h"]), now)) {
    if (++scanned > 6000 || out.length >= limit) break;
    for (const x of makeTrace(op.operationId, op.at, c).items) {
      if (x.itemType !== "request" || !matchRole(role)(x)) continue;
      if (name && x.name !== name) continue;
      if (failedOnly && x.success !== "False") continue;
      if (Number(minDuration) > 0 && x.duration < Number(minDuration)) continue;
      if (search && ![x.operation_Id, x.name, x.url, x.resultCode].some((v) => String(v ?? "").includes(search)) && op.operationId !== search) continue;
      out.push({ timestamp: x.timestamp, id: x.id, name: x.name, resultCode: x.resultCode, duration: x.duration, success: x.success, cloud_RoleName: x.cloud_RoleName, operation_Id: op.operationId, url: x.url });
    }
  }
  return out.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1)).slice(0, limit);
}

export async function logs({ component, range = "24h", role, minSeverity = 0, search, operationName, after, limit = 500 }) {
  await wait(after ? 120 : 300);
  const c = byId(component.id);
  const now = Date.now();
  const from = after ? new Date(after).getTime() : now - (RANGE_MS[range] ?? RANGE_MS["24h"]);
  const out = [];
  let scanned = 0;
  for (const op of opsBack(c, from - 60_000, now)) {
    if (++scanned > 4000 || out.length >= limit) break;
    for (const x of makeTrace(op.operationId, op.at, c).items) {
      if (x.itemType !== "trace" && x.itemType !== "exception") continue;
      const ts = new Date(x.timestamp).getTime();
      if (ts <= from || ts > now) continue;
      if (!matchRole(role)(x) || (x.severityLevel ?? 0) < Number(minSeverity)) continue;
      if (operationName && x.operation_Name !== operationName) continue;
      const message = x.itemType === "exception" ? `${x.type}: ${x.outerMessage}` : x.message;
      if (search && !message.toLowerCase().includes(search.toLowerCase()) && op.operationId !== search) continue;
      out.push({ timestamp: x.timestamp, itemType: x.itemType, itemId: x.itemId, severityLevel: x.severityLevel, message, cloud_RoleName: x.cloud_RoleName, operation_Id: op.operationId, operation_Name: x.operation_Name, operation_ParentId: x.operation_ParentId, customDimensions: x.customDimensions, details: x.details });
    }
  }
  return out.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1)).slice(0, limit);
}

// Operation ids that came from somewhere else (a Service Bus traceparent, a Functions run) still get a
// trace: an order flow, timed from `at` or a few minutes ago.
export async function trace({ component, operationId, at }) {
  await wait(250);
  const c = byId(component.id) ?? all()[0];
  const id = String(operationId).match(/[0-9a-f]{32}/i)?.[0]?.toLowerCase() ?? operationId;
  return makeTrace(id, at ? new Date(at).getTime() : Date.now() - 5 * 6e4, c);
}

export async function traceAcross({ components: comps, operationId, at }) {
  return trace({ component: comps[0], operationId, at });
}

export async function findTrace({ subIds, operationId, at }) {
  await wait(900);
  const id = String(operationId).match(/[0-9a-f]{32}/i)?.[0]?.toLowerCase();
  if (!id) throw Object.assign(new Error("That isn't an operation id, trace id or traceparent."), { code: "BAD_INPUT" });
  const searched = subIds.flatMap((s) => COMPONENTS[s] ?? []);
  const hit = searched.find((c) => c.name.startsWith("acme-prod-app")) ?? searched.find((c) => c.name.startsWith("acme-dev"));
  // An id from outside (say, a Service Bus traceparent) gets the full order flow.
  if (hit && !remembered.has(id)) remembered.set(id, { at: at ? new Date(at).getTime() : Date.now() - 5 * 6e4, c: hit, forced: "order" });
  return { operationId: id, searched: searched.length, failed: 0, hits: hit ? [{ component: strip(hit), n: 14, firstSeen: iso(Date.now() - 5 * 6e4), roles: ["orders-api", "billing-api"] }] : [] };
}

export async function query({ component, kql }) {
  await wait(500);
  const t0 = Date.now();
  if (!String(kql ?? "").trim()) throw Object.assign(new Error("Write a query first."), { code: "BAD_INPUT" });
  if (/\bwher\b|\|\s*$/.test(kql)) throw Object.assign(new Error("Query could not be parsed at 'wher' on line [2,3]"), { code: "QUERY_ERROR" });
  const rows = await requests({ component, range: "24h", limit: 50 });
  if (/summarize/i.test(kql)) {
    const counts = {};
    for (const r of rows) counts[r.name] = (counts[r.name] ?? 0) + 1;
    return { columns: [{ name: "name", type: "string" }, { name: "count_", type: "long" }], rows: Object.entries(counts).sort((a, b) => b[1] - a[1]), truncated: false, ms: Date.now() - t0 + 412 };
  }
  const cols = ["timestamp", "name", "resultCode", "duration", "success", "cloud_RoleName", "operation_Id"];
  return { columns: cols.map((name) => ({ name, type: name === "duration" ? "real" : name === "timestamp" ? "datetime" : "string" })), rows: rows.map((r) => cols.map((k) => r[k])), truncated: false, ms: Date.now() - t0 + 380 };
}

// Used by demo Functions for invocation history.
export function functionRuns(c, role, fn, rangeMs, limit, failedOnly) {
  const now = Date.now();
  const step = fn === "NightlyInvoiceExport" ? 864e5 : fn === "PlaceOrder" ? 45_000 : 30_000;
  const out = [];
  let scanned = 0;
  for (const op of opsBack(c, now - rangeMs, now, step, fn)) {
    if (++scanned > 3000 || out.length >= limit) break;
    const forced = fn === "NightlyInvoiceExport" ? "timer" : "events";
    remembered.set(op.operationId, { at: op.at, c, forced, fnName: fn });
    const root = makeTrace(op.operationId, op.at, c, forced, fn).items[0];
    if (failedOnly && root.success !== "False") continue;
    out.push({ timestamp: root.timestamp, id: root.id, operation_Id: op.operationId, success: root.success, resultCode: root.resultCode, duration: root.duration, cloud_RoleInstance: root.cloud_RoleInstance, invocationId: root.customDimensions["faas.invocation_id"], triggerReason: root.customDimensions.TriggerReason ?? "" });
  }
  return out;
}

export const componentById = byId;
export const remember = (operationId, value) => remembered.set(operationId, value);
