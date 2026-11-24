// Application Insights: resources over ARM, telemetry over the ARM query proxy
// (POST {component}/query), which takes the same management token as everything else.
// KQL is read-only, and every built-in query here is bounded by a timespan and a row cap.
import { AppError, armList, pool, request, rgOf, token } from "./core.js";

// ─── KQL helpers ──────────────────────────────────────────────────────────────
// String literals are the only place user input enters a query.
export const kq = (s) => `'${String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n")}'`;
export const kqList = (xs) => `(${xs.map(kq).join(", ")})`;
const FAILED = "tostring(success) =~ 'false'";

export const RANGES = {
  "30m": { span: "PT30M", bin: "1m" },
  "1h": { span: "PT1H", bin: "2m" },
  "6h": { span: "PT6H", bin: "10m" },
  "24h": { span: "P1D", bin: "30m" },
  "3d": { span: "P3D", bin: "2h" },
  "7d": { span: "P7D", bin: "4h" },
  "30d": { span: "P30D", bin: "12h" },
  "60d": { span: "P60D", bin: "1d" },
  "90d": { span: "P90D", bin: "1d" },
};

// Custom ranges arrive as "c:<from ISO>/<to ISO>" and become an exact ISO 8601 interval. The timeline
// bucket is the smallest that keeps the chart under ~120 bars.
const BINS = [["1m", 6e4], ["2m", 12e4], ["5m", 3e5], ["10m", 6e5], ["15m", 9e5], ["30m", 18e5], ["1h", 36e5], ["2h", 72e5], ["4h", 144e5], ["6h", 216e5], ["12h", 432e5], ["1d", 864e5], ["2d", 1728e5], ["7d", 6048e5]];
export function rangeOf(r) {
  const m = /^c:([^/]+)\/([^/]+)$/.exec(String(r ?? ""));
  if (!m) return RANGES[r] ?? RANGES["24h"];
  const from = new Date(m[1]), to = new Date(m[2]);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) throw new AppError("That time range isn't valid: the start must be before the end.", "BAD_INPUT");
  const ms = to - from;
  const bin = (BINS.find(([, b]) => ms / b <= 120) ?? BINS[BINS.length - 1])[0];
  return { span: `${from.toISOString()}/${to.toISOString()}`, bin };
}
const range = rangeOf;

// W3C traceparent, Request-Id (|traceid.spanid.) or a bare operation id → the operation id.
export function operationIdOf(input) {
  const s = String(input ?? "").trim();
  const tp = s.match(/^[0-9a-f]{2}-([0-9a-f]{32})-[0-9a-f]{16}-[0-9a-f]{2}$/i);
  if (tp) return tp[1].toLowerCase();
  const rid = s.match(/^\|?([0-9a-f]{32})\./i);
  if (rid) return rid[1].toLowerCase();
  if (/^[0-9a-z-]{8,64}$/i.test(s)) return s;
  throw new AppError("That isn't an operation id, trace id or traceparent.", "BAD_INPUT");
}
// A GUID pasted with dashes (a correlation id from a log or message) is stored by Application Insights
// as 32 hex digits, so look for both spellings.
const idsOf = (id) => (/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id) ? [id, id.replace(/-/g, "").toLowerCase()] : [id]);

// ─── Resources ────────────────────────────────────────────────────────────────
const ikeys = new Map(); // component id -> instrumentation key, kept here for matching function apps
const componentsBySub = new Map(); // sub id -> { at, value }

export async function components(subId) {
  const hit = componentsBySub.get(subId);
  if (hit && Date.now() - hit.at < 2 * 60_000) return hit.value;
  const list = await armList(subId, `/subscriptions/${subId}/providers/Microsoft.Insights/components`, { apiVersion: "2020-02-02", what: "list Application Insights resources" });
  const value = list
    .map((c) => {
      if (c.properties?.InstrumentationKey) ikeys.set(c.id.toLowerCase(), c.properties.InstrumentationKey.toLowerCase());
      return {
        id: c.id,
        name: c.name,
        subscriptionId: subId,
        resourceGroup: rgOf(c.id),
        location: c.location,
        appId: c.properties?.AppId,
        kind: c.properties?.Application_Type ?? c.kind,
        workspace: c.properties?.WorkspaceResourceId?.split("/").pop() ?? null,
        retentionDays: c.properties?.RetentionInDays ?? null,
        samplingPercentage: c.properties?.SamplingPercentage ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  componentsBySub.set(subId, { at: Date.now(), value });
  return value;
}

export async function componentByIkey(subIds, ikey) {
  const want = ikey.toLowerCase();
  for (const subId of subIds) {
    const list = await components(subId).catch(() => []);
    const hit = list.find((c) => ikeys.get(c.id.toLowerCase()) === want);
    if (hit) return hit;
  }
  return null;
}

// ─── Query ────────────────────────────────────────────────────────────────────
const MAX_ROWS = 10_000;

function queryError(status, body) {
  const msgs = [];
  for (let e = body?.error; e; e = e.innererror) if (e.message && !msgs.includes(e.message)) msgs.push(e.message);
  const detail = body?.error?.innererror?.innererror?.message ?? body?.error?.details?.[0]?.innererror?.message;
  if (status === 403) return new AppError("You don't have permission to query this Application Insights resource. Reader on the resource is enough.", "FORBIDDEN", msgs.join(" "));
  if (status === 400) return new AppError(msgs.slice(-1)[0] ?? "Azure rejected the query.", "QUERY_ERROR", detail ?? msgs.join(" "));
  return new AppError(msgs.join(" ") || `Query failed with HTTP ${status}.`, `HTTP_${status}`);
}

// Returns { columns: [{name,type}], rows: [[...]], truncated, ms }. Dynamic columns (customDimensions etc.)
// arrive as JSON strings through the proxy and are parsed here.
export async function run(component, kql, timespan) {
  const t0 = Date.now();
  const res = await request(`https://management.azure.com${component.id}/query?api-version=2018-04-20`, {
    method: "POST",
    timeout: 90_000,
    retry: true, // queries can't change anything, so retrying a throttled one is safe
    headers: { authorization: `Bearer ${await token(component.subscriptionId)}`, "content-type": "application/json" },
    body: JSON.stringify({ query: kql, timespan }),
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { error: { message: text.slice(0, 300) } }; }
  if (!res.ok) throw queryError(res.status, body);
  const table = body?.tables?.[0] ?? { columns: [], rows: [] };
  const dyn = table.columns.map((c) => c.type === "dynamic");
  const rows = table.rows.slice(0, MAX_ROWS).map((r) =>
    r.map((v, i) => {
      if (!dyn[i] || typeof v !== "string") return v;
      try { return JSON.parse(v); } catch { return v; }
    }),
  );
  return { columns: table.columns.map(({ name, type }) => ({ name, type })), rows, truncated: table.rows.length > MAX_ROWS, ms: Date.now() - t0 };
}

const objects = ({ columns, rows }) => rows.map((r) => Object.fromEntries(columns.map((c, i) => [c.name, r[i]])));
async function rowsOf(component, kql, timespan) {
  return objects(await run(component, kql, timespan));
}

const roleFilter = (role) => (role ? `| where cloud_RoleName == ${kq(role)}` : "");

// ─── Built-in views ───────────────────────────────────────────────────────────
export async function overview({ component, range: r, role }) {
  const { span, bin } = range(r);
  const rf = roleFilter(role);
  const [totals, timeline, operations, exceptions, roles] = await Promise.all([
    rowsOf(component, `print
      total = toscalar(requests ${rf} | summarize sum(itemCount)),
      failed = toscalar(requests ${rf} | where ${FAILED} | summarize sum(itemCount)),
      p50 = toscalar(requests ${rf} | summarize percentile(duration, 50)),
      p95 = toscalar(requests ${rf} | summarize percentile(duration, 95)),
      exceptions = toscalar(exceptions ${rf} | summarize sum(itemCount)),
      dependencies = toscalar(dependencies ${rf} | summarize sum(itemCount)),
      depFailed = toscalar(dependencies ${rf} | where ${FAILED} | summarize sum(itemCount))`, span),
    rowsOf(component, `requests ${rf}
      | summarize total = sum(itemCount), failed = sumif(itemCount, ${FAILED}) by bin(timestamp, ${bin})
      | order by timestamp asc`, span),
    rowsOf(component, `requests ${rf}
      | summarize n = sum(itemCount), failed = sumif(itemCount, ${FAILED}), p50 = percentile(duration, 50), p95 = percentile(duration, 95), role = take_any(cloud_RoleName) by name
      | top 100 by n desc`, span),
    rowsOf(component, `exceptions ${rf}
      | summarize n = sum(itemCount), lastSeen = max(timestamp), type = take_any(type), message = take_any(outerMessage), role = take_any(cloud_RoleName), operation = take_any(operation_Name) by problemId
      | top 30 by n desc`, span),
    rowsOf(component, `union requests, traces, dependencies, exceptions
      | summarize n = count() by cloud_RoleName
      | where isnotempty(cloud_RoleName)
      | top 50 by n desc`, span),
  ]);
  return { totals: totals[0] ?? {}, timeline, operations, exceptions, roles: roles.map((x) => x.cloud_RoleName), bin };
}

export async function requests({ component, range: r, role, name, failedOnly, minDuration, search, limit = 500 }) {
  const where = [
    role && `cloud_RoleName == ${kq(role)}`,
    name && `name == ${kq(name)}`,
    failedOnly && FAILED,
    Number(minDuration) > 0 && `duration >= ${Number(minDuration)}`,
    search && `(operation_Id == ${kq(search)} or name has ${kq(search)} or url has ${kq(search)} or resultCode == ${kq(search)})`,
  ].filter(Boolean);
  return rowsOf(component, `requests
    ${where.map((w) => `| where ${w}`).join("\n")}
    | project timestamp, id, name, resultCode, duration, success = tostring(success), cloud_RoleName, operation_Id, url
    | order by timestamp desc
    | take ${Math.min(Number(limit) || 500, 2000)}`, range(r).span);
}

export async function logs({ component, range: r, role, minSeverity = 0, search, operationName, after, limit = 500 }) {
  const where = [
    role && `cloud_RoleName == ${kq(role)}`,
    Number(minSeverity) > 0 && `severityLevel >= ${Number(minSeverity)}`,
    operationName && `operation_Name == ${kq(operationName)}`,
    search && `(message has ${kq(search)} or outerMessage has ${kq(search)} or operation_Id == ${kq(search)})`,
    after && `timestamp > datetime(${new Date(after).toISOString()})`,
  ].filter(Boolean);
  return rowsOf(component, `union traces, exceptions
    ${where.map((w) => `| where ${w}`).join("\n")}
    | project timestamp, itemType, itemId, severityLevel, message = iff(itemType == 'exception', strcat(type, ': ', outerMessage), message), cloud_RoleName, operation_Id, operation_Name, operation_ParentId, customDimensions, details
    | order by timestamp desc
    | take ${Math.min(Number(limit) || 500, 2000)}`, after ? "PT2H" : range(r).span);
}

const TRACE_COLUMNS = "itemType, itemId, timestamp, id, operation_ParentId, operation_Name, name, duration, success = tostring(success), resultCode, target, type, data, url, message, severityLevel, cloud_RoleName, cloud_RoleInstance, outerMessage, problemId, details, customDimensions, customMeasurements, sdkVersion";

// Every item in one operation. With `at` (a timestamp from the row that was clicked) the scan is limited
// to ±6 hours around it, which is much faster on busy resources than scanning the whole week.
export async function trace({ component, operationId, at }) {
  const id = operationIdOf(operationId);
  const timespan = at ? `${new Date(new Date(at).getTime() - 6 * 3600e3).toISOString()}/${new Date(new Date(at).getTime() + 6 * 3600e3).toISOString()}` : "P7D";
  const items = await rowsOf(component, `union requests, dependencies, traces, exceptions, customEvents, pageViews
    | where operation_Id in ${kqList(idsOf(id))}
    | project ${TRACE_COLUMNS}
    | order by timestamp asc
    | take 5000`, timespan);
  return { operationId: id, items: items.map((x) => ({ ...x, component: component.name })) };
}

// Looks for an operation id in every Application Insights resource of the given subscriptions, at most six
// queries at a time. Used by "Find trace" and to stitch a trace that crosses resources.
export async function findTrace({ subIds, operationId, at }) {
  const id = operationIdOf(operationId);
  const all = (await Promise.all(subIds.map((s) => components(s).catch(() => [])))).flat().slice(0, 80);
  const timespan = at ? `${new Date(new Date(at).getTime() - 6 * 3600e3).toISOString()}/${new Date(new Date(at).getTime() + 6 * 3600e3).toISOString()}` : "P7D";
  const results = await pool(all, 6, (c) => rowsOf(c, `union requests, dependencies, traces, exceptions
    | where operation_Id in ${kqList(idsOf(id))}
    | summarize n = count(), firstSeen = min(timestamp), roles = make_set(cloud_RoleName, 5)`, timespan));
  return {
    operationId: id,
    searched: all.length,
    hits: all.map((c, i) => ({ component: c, ...(results[i].ok ? results[i].value[0] : { n: 0 }) })).filter((h) => h.n > 0),
    failed: results.filter((r) => !r.ok).length,
  };
}

export async function traceAcross({ components: comps, operationId, at }) {
  const results = await pool(comps, 6, (c) => trace({ component: c, operationId, at }));
  const seen = new Set();
  const items = results.flatMap((r) => (r.ok ? r.value.items : [])).filter((x) => (x.itemId && seen.has(x.itemId) ? false : (seen.add(x.itemId), true)));
  items.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  return { operationId: operationIdOf(operationId), items };
}

// Free-form KQL from the Query tab. The user's query runs as written; the timespan bounds it and
// results are capped at 10,000 rows.
export async function query({ component, kql, range: r }) {
  if (!String(kql ?? "").trim()) throw new AppError("Write a query first.", "BAD_INPUT");
  return run(component, kql, range(r).span);
}
