// Shared Azure plumbing for every tool: az accounts, per-subscription credentials, a careful ARM client
// and permission checks. Tools never talk to az or ARM any other way.
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { AzureCliCredential } from "@azure/identity";

const run = promisify(execFile);
// On Windows az is az.cmd, a batch file, which Node only runs through a shell. Every az argument is a fixed string.
const azOpts = process.platform === "win32" ? { shell: true, windowsHide: true } : {};

export class AppError extends Error {
  constructor(message, code, detail) {
    super(message);
    this.code = code;
    this.detail = detail;
  }
}

// ─── Accounts ─────────────────────────────────────────────────────────────────
export async function account() {
  const { stdout } = await run("az", ["account", "show", "-o", "json"], { timeout: 30_000, ...azOpts });
  const a = JSON.parse(stdout);
  return { user: a.user?.name, tenantId: a.tenantId, defaultSubscription: a.name };
}

// Every enabled subscription from every account az is signed in to. Tenant-level entries
// (signed in to a tenant with no subscriptions) have id === tenantId and are skipped.
export async function subscriptions() {
  const { stdout } = await run("az", ["account", "list", "--all", "-o", "json"], { timeout: 30_000, ...azOpts });
  return JSON.parse(stdout)
    .filter((s) => s.state === "Enabled" && s.id && s.id !== s.tenantId)
    .map((s) => ({ id: s.id, name: s.name, tenantId: s.tenantId, user: s.user?.name ?? "unknown", isDefault: !!s.isDefault }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Runs `az login`, which opens the browser and adds an account alongside the existing ones. az can't tell
// when the browser tab is closed, so the UI offers Cancel, which kills the process.
let login = null;
export function addAccount() {
  if (login) return login.done;
  const child = spawn("az", ["login", "--only-show-errors", "-o", "none"], { stdio: ["ignore", "ignore", "pipe"], ...azOpts });
  let stderr = "";
  child.stderr.on("data", (d) => (stderr += d));
  const done = new Promise((resolve, reject) => {
    const timer = setTimeout(() => child.kill(), 5 * 60_000);
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      login = null;
      if (code === 0) resolve(true);
      else if (signal) reject(new AppError("Sign-in cancelled.", "CANCELLED"));
      else reject(new Error(stderr.trim().split("\n").pop() || `az login exited with code ${code}`));
    });
    child.on("error", (e) => { clearTimeout(timer); login = null; reject(e); });
  });
  login = { child, done };
  return done;
}

export async function cancelAddAccount() {
  login?.child.kill();
  return true;
}

// ─── Credentials ──────────────────────────────────────────────────────────────
// az can be signed in to several accounts and tenants at once. Each subscription gets a credential that
// asks az for a token as the account that owns it. Tokens are cached until five minutes before expiry,
// because every `az account get-access-token` call costs a process spawn.
const credentials = new Map();
export const credFor = (subId) => {
  if (!credentials.has(subId)) credentials.set(subId, new AzureCliCredential({ subscription: subId }));
  return credentials.get(subId);
};

const tokens = new Map();
export async function token(subId, scope = "https://management.azure.com/.default") {
  const key = `${subId}|${scope}`;
  const hit = tokens.get(key);
  if (hit && hit.expiresOnTimestamp - Date.now() > 5 * 60_000) return hit.token;
  const pending = hit?.pending ?? credFor(subId).getToken(scope);
  tokens.set(key, { ...hit, pending });
  try {
    const t = await pending;
    tokens.set(key, t);
    return t.token;
  } catch (e) {
    tokens.delete(key);
    throw e;
  }
}

// ─── HTTP ─────────────────────────────────────────────────────────────────────
// Reads retry on throttling and transient server errors, honouring Retry-After. Anything that changes
// state (retry: false) is sent exactly once: a retried function invocation would run the function twice.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function request(url, { method = "GET", headers = {}, body, timeout = 30_000, retry = method === "GET", signal } = {}) {
  for (let attempt = 0; ; attempt++) {
    const signals = [AbortSignal.timeout(timeout), signal].filter(Boolean);
    let res;
    try {
      res = await fetch(url, { method, headers, body, signal: AbortSignal.any(signals) });
    } catch (e) {
      if (signal?.aborted) throw new AppError("Cancelled.", "CANCELLED");
      if (e?.name === "TimeoutError") throw new AppError(`No response after ${Math.round(timeout / 1000)}s.`, "TIMEOUT");
      if (retry && attempt < 2) { await sleep(500 * 2 ** attempt); continue; }
      throw new AppError(`Couldn't reach ${new URL(url).host}: ${e?.cause?.code ?? e?.message ?? e}`, "NETWORK");
    }
    if (retry && attempt < 2 && (res.status === 429 || res.status >= 500)) {
      const after = Number(res.headers.get("retry-after"));
      await sleep(Math.min(Number.isFinite(after) && after > 0 ? after * 1000 : 800 * 2 ** attempt, 10_000));
      continue;
    }
    return res;
  }
}

const readJson = async (res) => {
  const text = await res.text();
  try { return text ? JSON.parse(text) : null; } catch { return text; }
};

function armError(status, body, what) {
  const code = body?.error?.code ?? "";
  const message = body?.error?.message ?? (typeof body === "string" ? body.slice(0, 300) : "");
  if (status === 404 && /SubscriptionNotFound/i.test(code + message))
    return new AppError("Azure says this subscription no longer exists, but az still has it cached. Run `az account clear` and `az login` to refresh.", "SUBSCRIPTION_NOT_FOUND");
  if (status === 403 || /AuthorizationFailed/i.test(code)) return new AppError(`You don't have permission to ${what}.`, "FORBIDDEN", message);
  if (status === 401) return new AppError("Azure rejected your az CLI token. Run `az login` again.", "UNAUTHENTICATED", message);
  return new AppError(message || `Azure returned HTTP ${status} while trying to ${what}.`, code || `HTTP_${status}`);
}

// One call to Azure Resource Manager. `path` is everything after the host, without api-version.
export async function arm(subId, path, { method = "GET", apiVersion, body, what = "read this resource", timeout, retry } = {}) {
  const url = `https://management.azure.com${path}${path.includes("?") ? "&" : "?"}api-version=${apiVersion}`;
  const res = await request(url, {
    method,
    timeout,
    retry,
    headers: { authorization: `Bearer ${await token(subId)}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await readJson(res);
  if (!res.ok) throw armError(res.status, json, what);
  return json;
}

// List endpoints page with nextLink. Stops at `limit` so a huge subscription can't stall the UI.
export async function armList(subId, path, { apiVersion, what, limit = 5000 } = {}) {
  const out = [];
  let page = await arm(subId, path, { apiVersion, what });
  out.push(...(page?.value ?? []));
  while (page?.nextLink && out.length < limit) {
    const res = await request(page.nextLink, { headers: { authorization: `Bearer ${await token(subId)}` } });
    page = await readJson(res);
    if (!res.ok) throw armError(res.status, page, what);
    out.push(...(page?.value ?? []));
  }
  return out;
}

export const rgOf = (id) => id.split("/")[4];

// Runs `fn` over `items` with at most `n` in flight, so fan-out (one query per resource) stays polite.
export async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const k = i++;
      out[k] = await fn(items[k], k).then((value) => ({ ok: true, value }), (error) => ({ ok: false, error }));
    }
  }));
  return out;
}

// ─── Permissions ──────────────────────────────────────────────────────────────
// ARM's permissions API returns the caller's effective actions on a scope. Used to explain what a tool
// can do before trying, instead of failing halfway.
const wildcard = (pattern) => new RegExp("^" + pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$", "i");
const permits = (allow, deny, op) => allow.some((p) => wildcard(p).test(op)) && !deny.some((p) => wildcard(p).test(op));

const permCache = new Map();
export async function permissions(subId, scope) {
  const hit = permCache.get(scope);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.value;
  const perms = (await arm(subId, `${scope}/providers/Microsoft.Authorization/permissions`, { apiVersion: "2022-04-01", what: "read your permissions" }))?.value ?? [];
  const value = {
    can: (op) => permits(perms.flatMap((p) => p.actions ?? []), perms.flatMap((p) => p.notActions ?? []), op),
    canData: (op) => permits(perms.flatMap((p) => p.dataActions ?? []), perms.flatMap((p) => p.notDataActions ?? []), op),
  };
  permCache.set(scope, { at: Date.now(), value });
  return value;
}
