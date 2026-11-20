import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { AzureCliCredential } from "@azure/identity";
import { ServiceBusManagementClient } from "@azure/arm-servicebus";
import { ServiceBusClient } from "@azure/service-bus";
import Long from "long";

const toLong = (b) => Long.fromString(b.toString());

const run = promisify(execFile);

// az can be signed in to several accounts and tenants at once. Each subscription gets a credential that
// asks az for a token as the account that owns it.
const credentials = new Map();
const credFor = (subId) => {
  if (!credentials.has(subId)) credentials.set(subId, new AzureCliCredential({ subscription: subId }));
  return credentials.get(subId);
};

const mgmtClients = new Map();
const mgmt = (subId) => {
  if (!mgmtClients.has(subId)) mgmtClients.set(subId, new ServiceBusManagementClient(credFor(subId), subId));
  return mgmtClients.get(subId);
};

async function collect(iter) {
  const out = [];
  for await (const x of iter) out.push(x);
  return out;
}

const counts = (c = {}) => ({
  active: c.activeMessageCount ?? 0,
  deadLetter: c.deadLetterMessageCount ?? 0,
  scheduled: c.scheduledMessageCount ?? 0,
  transfer: c.transferMessageCount ?? 0,
});

export async function account() {
  const { stdout } = await run("az", ["account", "show", "-o", "json"]);
  const a = JSON.parse(stdout);
  return { user: a.user?.name, tenantId: a.tenantId, defaultSubscription: a.name };
}

// Every enabled subscription from every account az is signed in to. Tenant-level entries
// (signed in to a tenant with no subscriptions) have id === tenantId and are skipped.
export async function subscriptions() {
  const { stdout } = await run("az", ["account", "list", "--all", "-o", "json"]);
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
  const child = spawn("az", ["login", "--only-show-errors", "-o", "none"], { stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  child.stderr.on("data", (d) => (stderr += d));
  const done = new Promise((resolve, reject) => {
    const timer = setTimeout(() => child.kill(), 5 * 60_000);
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      login = null;
      if (code === 0) resolve(true);
      else if (signal) reject(Object.assign(new Error("Sign-in cancelled."), { code: "CANCELLED" }));
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

const rgOf = (id) => id.split("/")[4];

export async function namespaces(subId) {
  const list = await collect(mgmt(subId).namespaces.list()).catch((e) => {
    if (e?.statusCode === 404 || /SubscriptionNotFound|could not be found/i.test(e?.message ?? "")) {
      const err = new Error("Azure says this subscription no longer exists, but az still has it cached. Run `az account clear` and `az login` to refresh.");
      err.code = "SUBSCRIPTION_NOT_FOUND";
      throw err;
    }
    throw e;
  });
  return list.map((n) => ({
    id: n.id,
    name: n.name,
    subscriptionId: subId,
    resourceGroup: rgOf(n.id),
    location: n.location,
    sku: n.sku?.name,
    endpoint: n.serviceBusEndpoint,
    status: n.status,
  }));
}

export async function entities({ subscriptionId, resourceGroup, name }) {
  const c = mgmt(subscriptionId);
  const [queues, topics] = await Promise.all([
    collect(c.queues.listByNamespace(resourceGroup, name)),
    collect(c.topics.listByNamespace(resourceGroup, name)),
  ]);
  const topicsOut = await Promise.all(
    topics.map(async (t) => {
      const subs = await collect(c.subscriptions.listByTopic(resourceGroup, name, t.name));
      const subsOut = await Promise.all(
        subs.map(async (s) => {
          const rules = await collect(c.rules.listBySubscriptions(resourceGroup, name, t.name, s.name)).catch(() => []);
          return {
            name: s.name,
            counts: counts(s.countDetails),
            status: s.status,
            requiresSession: !!s.requiresSession,
            maxDeliveryCount: s.maxDeliveryCount,
            forwardTo: s.forwardTo || null,
            forwardDeadLetteredMessagesTo: s.forwardDeadLetteredMessagesTo || null,
            accessedAt: s.accessedAt?.toISOString?.() ?? null,
            rules: rules.map((r) => ({
              name: r.name,
              filterType: r.filterType,
              sql: r.sqlFilter?.sqlExpression,
              correlation: r.correlationFilter
                ? Object.fromEntries(Object.entries(r.correlationFilter).filter(([, v]) => v != null && v !== false && !(typeof v === "object" && !Object.keys(v).length)))
                : null,
              action: r.action?.sqlExpression || null,
            })),
          };
        }),
      );
      return {
        name: t.name,
        sizeInBytes: t.sizeInBytes ?? 0,
        status: t.status,
        accessedAt: t.accessedAt?.toISOString?.() ?? null,
        subscriptions: subsOut.sort((a, b) => a.name.localeCompare(b.name)),
      };
    }),
  );
  return {
    queues: queues
      .map((q) => ({
        name: q.name,
        counts: counts(q.countDetails),
        sizeInBytes: q.sizeInBytes ?? 0,
        status: q.status,
        requiresSession: !!q.requiresSession,
        maxDeliveryCount: q.maxDeliveryCount,
        forwardTo: q.forwardTo || null,
        accessedAt: q.accessedAt?.toISOString?.() ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    topics: topicsOut.sort((a, b) => a.name.localeCompare(b.name)),
  };
}

// ─── Access ───────────────────────────────────────────────────────────────────
// Counts come from ARM (management plane). Messages need the data plane: either a data role such as
// "Azure Service Bus Data Receiver", or the right to read the namespace's SAS keys. Ask ARM which of those
// the caller has before trying, so the UI can explain instead of failing.
const RECEIVE = "Microsoft.ServiceBus/namespaces/messages/receive/action";
const LIST_KEYS = "Microsoft.ServiceBus/namespaces/authorizationRules/listKeys/action";
const READ = "Microsoft.ServiceBus/namespaces/read";

const wildcard = (pattern) => new RegExp("^" + pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$", "i");
const permits = (allow, deny, op) => allow.some((p) => wildcard(p).test(op)) && !deny.some((p) => wildcard(p).test(op));

const manualConnections = new Map(); // ns id -> connection string, memory only
const accessCache = new Map(); // ns id -> { at, value }

export async function access(ns) {
  const hit = accessCache.get(ns.id);
  if (hit && Date.now() - hit.at < 5 * 60_000) return { ...hit.value, connectionString: manualConnections.has(ns.id) };
  const { token } = await credFor(ns.subscriptionId).getToken("https://management.azure.com/.default");
  const res = await fetch(`https://management.azure.com${ns.id}/providers/Microsoft.Authorization/permissions?api-version=2022-04-01`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Couldn't read your permissions on ${ns.name} (HTTP ${res.status}).`);
  const perms = (await res.json()).value ?? [];
  const actions = perms.flatMap((p) => p.actions ?? []);
  const notActions = perms.flatMap((p) => p.notActions ?? []);
  const dataActions = perms.flatMap((p) => p.dataActions ?? []);
  const notDataActions = perms.flatMap((p) => p.notDataActions ?? []);
  const value = {
    read: permits(actions, notActions, READ),
    receive: permits(dataActions, notDataActions, RECEIVE),
    listKeys: permits(actions, notActions, LIST_KEYS),
    scope: ns.id,
  };
  accessCache.set(ns.id, { at: Date.now(), value });
  return { ...value, connectionString: manualConnections.has(ns.id) };
}

export async function setConnectionString({ ns, connectionString }) {
  const cs = connectionString.trim();
  const endpoint = cs.match(/Endpoint=sb:\/\/([^/;]+)/i)?.[1];
  if (!endpoint || !/SharedAccessKey(Name)?=/i.test(cs)) throw new Error("That doesn't look like a Service Bus connection string. It should contain Endpoint=sb://…, SharedAccessKeyName and SharedAccessKey.");
  if (endpoint.split(".")[0].toLowerCase() !== ns.name.toLowerCase()) throw new Error(`This connection string is for ${endpoint.split(".")[0]}, not ${ns.name}.`);
  if (/EntityPath=/i.test(cs)) throw new Error("This connection string is scoped to a single entity (it has EntityPath). Use a namespace-level policy with Listen rights.");
  manualConnections.set(ns.id, cs);
  await dropClient(ns.id);
  return true;
}

export async function clearConnectionString({ ns }) {
  manualConnections.delete(ns.id);
  await dropClient(ns.id);
  return true;
}

// ─── Data plane ─────────────────────────────────────────────────────────────
const dataClients = new Map(); // ns id -> { client, auth }

async function dropClient(id) {
  const c = dataClients.get(id);
  dataClients.delete(id);
  if (c) await c.client.close().catch(() => {});
}

async function dataClient(ns, auth) {
  const cached = dataClients.get(ns.id);
  if (cached?.auth === auth) return cached;
  await dropClient(ns.id);
  let client;
  if (auth === "connection") client = new ServiceBusClient(manualConnections.get(ns.id));
  else if (auth === "entra") client = new ServiceBusClient(`${ns.name}.servicebus.windows.net`, credFor(ns.subscriptionId), { retryOptions: { maxRetries: 0, timeoutInMs: 20000 } });
  else {
    const keys = await mgmt(ns.subscriptionId).namespaces.listKeys(ns.resourceGroup, ns.name, "RootManageSharedAccessKey");
    client = new ServiceBusClient(keys.primaryConnectionString);
  }
  const entry = { client, auth };
  dataClients.set(ns.id, entry);
  return entry;
}

const isAuthError = (e) =>
  [e, ...(e?.errors ?? [])].some((x) => /unauthori[sz]ed|401|403|claim|not authorized|authorizationfailed/i.test(`${x?.code} ${x?.message}`));

class NoAccessError extends Error {
  constructor(ns, detail) {
    super(`You can see ${ns.name}'s counts, but you don't have permission to read its messages.`);
    this.code = "NO_ACCESS";
    this.detail = detail;
  }
}

function toBytes(body) {
  if (body == null) return Buffer.alloc(0);
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (typeof body === "string") return Buffer.from(body, "utf8");
  return Buffer.from(
    JSON.stringify(body, (_, v) => (v && v.type === "Buffer" && Array.isArray(v.data) ? Buffer.from(v.data).toString("base64") : v)),
    "utf8",
  );
}

function plain(v) {
  if (v == null) return v;
  if (v instanceof Date) return v.toISOString();
  if (Buffer.isBuffer(v) || v instanceof Uint8Array) return `0x${Buffer.from(v).toString("hex")}`;
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "object" && typeof v.toNumber === "function" && "high" in v) return v.toString();
  if (Array.isArray(v)) return v.map(plain);
  if (typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]));
  return v;
}

function serialize(m) {
  const bytes = toBytes(m.body);
  return {
    sequenceNumber: m.sequenceNumber?.toString(),
    messageId: m.messageId != null ? String(m.messageId) : null,
    contentType: m.contentType ?? null,
    subject: m.subject ?? null,
    correlationId: m.correlationId != null ? String(m.correlationId) : null,
    sessionId: m.sessionId ?? null,
    to: m.to ?? null,
    replyTo: m.replyTo ?? null,
    enqueuedTime: m.enqueuedTimeUtc?.toISOString() ?? null,
    expiresAt: m.expiresAtUtc?.toISOString() ?? null,
    scheduledEnqueueTime: m.scheduledEnqueueTimeUtc?.toISOString() ?? null,
    timeToLive: m.timeToLive ?? null,
    deliveryCount: m.deliveryCount ?? 0,
    state: m.state,
    deadLetterReason: m.deadLetterReason ?? null,
    deadLetterErrorDescription: m.deadLetterErrorDescription ?? null,
    deadLetterSource: m.deadLetterSource ?? null,
    applicationProperties: plain(m.applicationProperties ?? {}),
    bodyType: m._rawAmqpMessage?.bodyType ?? "data",
    size: bytes.length,
    body: bytes.toString("base64"),
  };
}

export async function peek({ ns, topic, subscription, queue, deadLetter, max = 200, fromSequenceNumber }) {
  const opts = { skipParsingBodyAsJson: true, skipConvertingDate: true, subQueueType: deadLetter ? "deadLetter" : undefined };
  const attempt = async (mode) => {
    const { client, auth } = await dataClient(ns, mode);
    const receiver = queue ? client.createReceiver(queue, opts) : client.createReceiver(topic, subscription, opts);
    try {
      const out = [];
      // The SDK keeps a peek cursor on the shared management link; always start explicitly.
      let from = fromSequenceNumber != null ? BigInt(fromSequenceNumber) : 0n;
      while (out.length < max) {
        const batch = await receiver.peekMessages(Math.min(100, max - out.length), { fromSequenceNumber: toLong(from) });
        if (!batch.length) break;
        out.push(...batch);
        from = BigInt(batch[batch.length - 1].sequenceNumber.toString()) + 1n;
      }
      return { auth, messages: out.map(serialize) };
    } finally {
      await receiver.close().catch(() => {});
    }
  };
  // Order of preference: a pasted connection string, your own identity, then a SAS key read over ARM.
  // If the permission check fails or says no, still try your identity once: PIM activations and
  // conditional assignments don't always show up in the permissions API.
  if (manualConnections.has(ns.id)) return await attempt("connection");
  const acc = await access(ns).catch(() => null);
  const order = acc ? [acc.receive && "entra", acc.listKeys && "sas"].filter(Boolean) : ["entra", "sas"];
  if (!order.length) order.push("entra");
  let last;
  for (const auth of order) {
    try {
      return await attempt(auth);
    } catch (e) {
      last = e;
      if (!isAuthError(e)) throw e;
      await dropClient(ns.id);
    }
  }
  throw new NoAccessError(ns, acc ?? { read: true, receive: false, listKeys: false, scope: ns.id, connectionString: false });
}
