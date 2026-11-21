// Azure Functions: apps and functions over ARM, history and logs from Application Insights, and Run.
//
// Run is the one thing in Azimuth that changes anything: it executes the function for real. So:
// - it is never retried (a retry would run the function twice);
// - keys are fetched in the main process and never sent to the window;
// - production apps need the app name typed back (checked here too, not only in the UI);
// - Durable activity/orchestrator/entity functions are refused, because the host can't run them directly.
import { randomBytes } from "node:crypto";
import { AppError, arm, armList, permissions, pool, request, rgOf } from "./core.js";
import * as ai from "./insights.js";

const API = "2023-12-01";
const isProd = (name) => /(^|-)prod(-|$)/i.test(name);

export async function apps(subId) {
  const sites = await armList(subId, `/subscriptions/${subId}/providers/Microsoft.Web/sites`, { apiVersion: API, what: "list function apps" });
  return sites
    .filter((s) => /functionapp/i.test(s.kind ?? "") && !/workflowapp/i.test(s.kind ?? ""))
    .map((s) => ({
      id: s.id,
      name: s.name,
      subscriptionId: subId,
      resourceGroup: rgOf(s.id),
      location: s.location,
      kind: s.kind,
      linux: /linux/i.test(s.kind ?? ""),
      state: s.properties?.state ?? "Unknown",
      hostName: s.properties?.defaultHostName,
      plan: s.properties?.sku ?? null,
      httpsOnly: !!s.properties?.httpsOnly,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const NOT_RUNNABLE = new Set(["activityTrigger", "orchestrationTrigger", "entityTrigger"]);
const SECRETISH = /connection|key|secret|password|token/i;

function shape(f) {
  const p = f.properties ?? {};
  const bindings = p.config?.bindings ?? [];
  const trigger = bindings.find((b) => /Trigger$/i.test(b.type ?? "")) ?? bindings[0] ?? { type: "unknown" };
  // Binding settings are names of app settings (e.g. "%TOPIC%" or "ServiceBus"), not values, but keep
  // anything that looks like a secret out of the UI anyway.
  const details = Object.fromEntries(
    Object.entries(trigger).filter(([k, v]) => !["type", "direction", "name", "properties"].includes(k) && v != null && typeof v !== "object" && !(SECRETISH.test(k) && k !== "connection")),
  );
  return {
    name: p.name ?? f.name.split("/").pop(),
    language: p.language ?? null,
    disabled: !!p.isDisabled,
    invokeUrl: p.invoke_url_template ?? null,
    trigger: { type: trigger.type, ...details },
    http: /^httpTrigger$/i.test(trigger.type) ? { methods: trigger.methods ?? ["get", "post"], route: trigger.route ?? null, authLevel: (trigger.authLevel ?? "function").toLowerCase() } : null,
    bindings: bindings.map((b) => ({ type: b.type, direction: b.direction, name: b.name })),
    runnable: !NOT_RUNNABLE.has(trigger.type),
  };
}

export async function functions(app) {
  const list = await armList(app.subscriptionId, `${app.id}/functions`, { apiVersion: API, what: "list this app's functions" }).catch((e) => {
    if (/ServiceUnavailable|BadGateway|host runtime/i.test(`${e.code} ${e.message}`))
      throw new AppError("The Functions host didn't answer. The app may be stopped, starting up, or failing to start.", "HOST_UNAVAILABLE", e.message);
    throw e;
  });
  return list.map(shape).sort((a, b) => a.name.localeCompare(b.name));
}

export async function access(app) {
  const p = await permissions(app.subscriptionId, app.id);
  return {
    read: p.can("Microsoft.Web/sites/read"),
    run: p.can("Microsoft.Web/sites/host/listkeys/action"),
    settings: p.can("Microsoft.Web/sites/config/list/action"),
    scope: app.id,
  };
}

// ─── Finding the app's Application Insights resource ─────────────────────────
// Telemetry doesn't always say which function app sent it: with OpenTelemetry, cloud_RoleName is the
// service name, not the app name. So, in order:
// 1. the instrumentation key from the app's settings, when you're allowed to read them;
// 2. otherwise, ask each Application Insights resource in the subscription which role ran these
//    function names in the last 3 days (one small query each, six at a time);
// 3. otherwise the UI asks you to pick, and remembers.
const links = new Map(); // app id -> { at, value }

export async function insights({ app, functionNames = [], subIds = [] }) {
  const hit = links.get(app.id);
  if (hit && Date.now() - hit.at < 30 * 60_000) return hit.value;
  const value = (await viaSettings(app, subIds, functionNames)) ?? (await viaTelemetry(app, functionNames));
  links.set(app.id, { at: Date.now(), value });
  return value;
}

async function viaSettings(app, subIds, names) {
  const acc = await access(app).catch(() => null);
  if (!acc?.settings) return null;
  const settings = await arm(app.subscriptionId, `${app.id}/config/appsettings/list`, { method: "POST", apiVersion: API, what: "read app settings", retry: true }).catch(() => null);
  const props = settings?.properties ?? {};
  const ikey = props.APPLICATIONINSIGHTS_CONNECTION_STRING?.match(/InstrumentationKey=([0-9a-f-]{36})/i)?.[1] ?? props.APPINSIGHTS_INSTRUMENTATIONKEY;
  if (!ikey) return null;
  const component = await ai.componentByIkey([app.subscriptionId, ...subIds.filter((s) => s !== app.subscriptionId)], ikey);
  if (!component) return null;
  const role = await roleIn(component, app, names.slice(0, 60)).catch(() => null);
  return { component, role: role?.role ?? null, via: "settings" };
}

async function roleIn(component, app, names) {
  // Both halves must produce the same column types, or union splits them into fns_int / fns_long.
  const byName = `union requests, traces, dependencies | where cloud_RoleName =~ ${ai.kq(app.name)} | take 1 | project cloud_RoleName, fns = tolong(0), n = tolong(1)`;
  const byFn = `requests | where name in~ ${ai.kqList(names)} or tostring(customDimensions['faas.name']) in~ ${ai.kqList(names)} | summarize fns = tolong(dcount(name)), n = tolong(sum(itemCount)) by cloud_RoleName`;
  const rows = (await ai.run(component, `let byName = ${byName};
    ${names.length ? `let byFn = ${byFn};\n    union byFn, byName` : "byName"}
    | summarize fns = max(fns), n = sum(n) by cloud_RoleName | order by fns desc, n desc | take 5`, "P3D")).rows;
  if (!rows.length) return null;
  // A role that actually ran these functions beats one that only shares the app's name.
  const score = ([role, fns, n]) => fns * 100 + (role?.toLowerCase() === app.name.toLowerCase() ? 50 : 0) + Math.log10(1 + n);
  const best = rows.map((r) => ({ role: r[0], fns: r[1], n: r[2], score: score(r) })).sort((a, b) => b.score - a.score)[0];
  return best.score > 0 ? best : null;
}

async function viaTelemetry(app, names) {
  const comps = await ai.components(app.subscriptionId).catch(() => []);
  const results = await pool(comps, 6, (c) => roleIn(c, app, names.slice(0, 60)));
  const best = comps
    .map((c, i) => ({ component: c, match: results[i].ok ? results[i].value : null }))
    .filter((x) => x.match)
    .sort((a, b) => b.match.score - a.match.score)[0];
  return best ? { component: best.component, role: best.match.role, via: "telemetry" } : null;
}

// ─── History ──────────────────────────────────────────────────────────────────
const roleWhere = (role) => (role ? `| where cloud_RoleName == ${ai.kq(role)}` : "");

export async function stats({ link, functionNames, range }) {
  if (!functionNames.length) return [];
  const { span } = ai.RANGES[range] ?? ai.RANGES["24h"];
  const r = await ai.run(link.component, `requests ${roleWhere(link.role)}
    | where name in~ ${ai.kqList(functionNames)}
    | summarize n = sum(itemCount), failed = sumif(itemCount, tostring(success) =~ 'false'), p50 = percentile(duration, 50), p95 = percentile(duration, 95), lastRun = max(timestamp) by name`, span);
  return r.rows.map((x) => Object.fromEntries(r.columns.map((c, i) => [c.name, x[i]])));
}

export async function invocations({ link, fn, range, failedOnly, limit = 300 }) {
  const { span } = ai.RANGES[range] ?? ai.RANGES["24h"];
  const r = await ai.run(link.component, `requests ${roleWhere(link.role)}
    | where name =~ ${ai.kq(fn)}
    ${failedOnly ? "| where tostring(success) =~ 'false'" : ""}
    | project timestamp, id, operation_Id, success = tostring(success), resultCode, duration, cloud_RoleInstance,
        invocationId = coalesce(tostring(customDimensions['faas.invocation_id']), tostring(customDimensions['InvocationId'])),
        triggerReason = tostring(customDimensions['TriggerReason'])
    | order by timestamp desc
    | take ${Math.min(Number(limit) || 300, 1000)}`, span);
  return r.rows.map((x) => Object.fromEntries(r.columns.map((c, i) => [c.name, x[i]])));
}

// After Run: look for the invocation we caused. HTTP runs carry our traceparent, so the operation id
// matches exactly; other triggers are matched by time.
export async function findInvocation({ link, fn, traceId, since }) {
  const r = await ai.run(link.component, `requests ${roleWhere(link.role)}
    | where name =~ ${ai.kq(fn)}
    | where operation_Id == ${ai.kq(traceId ?? "")} or timestamp >= datetime(${new Date(new Date(since).getTime() - 5000).toISOString()})
    | project timestamp, id, operation_Id, success = tostring(success), resultCode, duration, exact = operation_Id == ${ai.kq(traceId ?? "")}
    | order by exact desc, timestamp asc
    | take 1`, "PT3H");
  return r.rows.length ? Object.fromEntries(r.columns.map((c, i) => [c.name, r.rows[0][i]])) : null;
}

// ─── Run ──────────────────────────────────────────────────────────────────────
const keyCache = new Map(); // app id -> { at, keys }, memory only, 10 minutes
async function hostKeys(app) {
  const hit = keyCache.get(app.id);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.keys;
  const keys = await arm(app.subscriptionId, `${app.id}/host/default/listkeys`, { method: "POST", apiVersion: API, what: "read this function app's keys", retry: true }).catch((e) => {
    if (e.code === "FORBIDDEN") throw new AppError(`Running functions needs permission to read ${app.name}'s keys (Microsoft.Web/sites/host/listkeys/action), which Website Contributor or Contributor include. You can still see history and logs.`, "NO_RUN_ACCESS");
    throw e;
  });
  keyCache.set(app.id, { at: Date.now(), keys });
  return keys;
}

async function functionKey(app, fn, keys) {
  const own = await arm(app.subscriptionId, `${app.id}/functions/${encodeURIComponent(fn)}/listkeys`, { method: "POST", apiVersion: API, what: "read this function's keys", retry: true }).catch(() => null);
  return own?.default ?? Object.values(own ?? {})[0] ?? keys.functionKeys?.default ?? keys.masterKey;
}

const inflight = new Map(); // run id -> AbortController
const MAX_BODY = 2 * 1024 * 1024;

export async function run({ runId, app: requested, fn, confirm, http, input }) {
  // Look the app up again rather than trusting what the window sent: the key must only ever go to the
  // app's real host, and the production check must use its real name and state.
  if (!/^\/subscriptions\/[^/]+\/resourceGroups\/[^/]+\/providers\/Microsoft\.Web\/sites\/[^/]+$/i.test(requested?.id ?? "")) throw new AppError("That isn't a function app.", "BAD_INPUT");
  const site = await arm(requested.id.split("/")[2], requested.id, { apiVersion: API, what: "read this function app" });
  const app = { ...requested, name: site.name, subscriptionId: requested.id.split("/")[2], state: site.properties?.state ?? "Unknown", hostName: site.properties?.defaultHostName };
  if (!app.hostName) throw new AppError(`${app.name} has no host name.`, "NOT_FOUND");
  if (isProd(app.name) && confirm !== app.name) throw new AppError(`Type ${app.name} to confirm a run in production.`, "CONFIRM_REQUIRED");
  if (app.state !== "Running") throw new AppError(`${app.name} is ${app.state.toLowerCase()}. Start it before running functions.`, "APP_STOPPED");
  const f = (await functions(app)).find((x) => x.name === fn);
  if (!f) throw new AppError(`${fn} isn't in ${app.name} any more.`, "NOT_FOUND");
  if (f.disabled) throw new AppError(`${fn} is disabled. Enable it in Azure before running it.`, "DISABLED");
  if (!f.runnable) throw new AppError(`${f.trigger.type} functions are started by their Durable orchestration and can't be run directly.`, "NOT_RUNNABLE");

  const keys = await hostKeys(app);
  const traceId = randomBytes(16).toString("hex");
  const traceparent = `00-${traceId}-${randomBytes(8).toString("hex")}-01`;
  const controller = new AbortController();
  inflight.set(runId, controller);
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  try {
    let res;
    if (f.http) {
      const path = String(http?.path ?? new URL(f.invokeUrl ?? `https://${app.hostName}/api/${fn}`).pathname);
      if (!path.startsWith("/")) throw new AppError("The path must start with /.", "BAD_INPUT");
      const url = new URL(`https://${app.hostName}${path}`);
      for (const [k, v] of http?.query ?? []) if (k) url.searchParams.append(k, v);
      if (url.host !== app.hostName) throw new AppError("The request has to go to the function app's own host.", "BAD_INPUT");
      const method = String(http?.method ?? "GET").toUpperCase();
      const headers = Object.fromEntries((http?.headers ?? []).filter(([k]) => k && !/^x-functions-key$/i.test(k)));
      headers.traceparent = traceparent;
      if (f.http.authLevel === "admin") headers["x-functions-key"] = keys.masterKey;
      else if (f.http.authLevel !== "anonymous") headers["x-functions-key"] = await functionKey(app, fn, keys);
      res = await request(url.toString(), { method, headers, body: ["GET", "HEAD"].includes(method) ? undefined : http?.body ?? "", timeout: 230_000, retry: false, signal: controller.signal });
    } else {
      // The host's admin endpoint runs any non-HTTP function once with the given input, as the portal's Test/Run does.
      res = await request(`https://${app.hostName}/admin/functions/${encodeURIComponent(fn)}`, {
        method: "POST",
        headers: { "x-functions-key": keys.masterKey, "content-type": "application/json", traceparent },
        body: JSON.stringify({ input: input ?? "" }),
        timeout: 60_000,
        retry: false,
        signal: controller.signal,
      });
    }
    const buf = Buffer.from(await res.arrayBuffer().catch((e) => {
      if (controller.signal.aborted) throw new AppError("Stopped waiting. The function may still be running in Azure.", "CANCELLED");
      throw e;
    }));
    if (res.status === 403 && /ip forbidden|access restriction/i.test(buf.toString("utf8", 0, 2000)))
      throw new AppError(`${app.name} only accepts requests from allowed networks, and this machine isn't one of them.`, "NETWORK_RESTRICTED");
    return {
      status: res.status,
      statusText: res.statusText,
      headers: Object.fromEntries([...res.headers].filter(([k]) => !/^set-cookie$/i.test(k))),
      body: buf.subarray(0, MAX_BODY).toString("base64"),
      size: buf.length,
      truncated: buf.length > MAX_BODY,
      ms: Date.now() - t0,
      traceId,
      startedAt,
      kind: f.http ? "http" : "admin",
    };
  } finally {
    inflight.delete(runId);
  }
}

// Stops waiting for the response. The function itself keeps running in Azure; there's no way to stop
// a single invocation from outside.
export async function cancelRun({ runId }) {
  inflight.get(runId)?.abort();
  return true;
}
