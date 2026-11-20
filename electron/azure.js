import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { AzureCliCredential } from "@azure/identity";
import { SubscriptionClient } from "@azure/arm-resources-subscriptions";
import { ServiceBusManagementClient } from "@azure/arm-servicebus";
import { ServiceBusClient } from "@azure/service-bus";
import Long from "long";

const toLong = (b) => Long.fromString(b.toString());

const run = promisify(execFile);
const credential = new AzureCliCredential();

const mgmtClients = new Map();
const mgmt = (subId) => {
  if (!mgmtClients.has(subId)) mgmtClients.set(subId, new ServiceBusManagementClient(credential, subId));
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

export async function subscriptions() {
  const client = new SubscriptionClient(credential);
  const subs = await collect(client.subscriptions.list());
  return subs
    .filter((s) => s.state === "Enabled" && s.subscriptionId)
    .map((s) => ({ id: s.subscriptionId, name: s.displayName }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const rgOf = (id) => id.split("/")[4];

export async function namespaces(subId) {
  const list = await collect(mgmt(subId).namespaces.list());
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

// Data plane. Entra first; if the identity has no data role, fall back to a SAS key read over ARM.
const dataClients = new Map(); // ns id -> { client, auth }

async function dataClient(ns, forceSas = false) {
  const cached = dataClients.get(ns.id);
  if (cached && (!forceSas || cached.auth === "sas")) return cached;
  if (cached) await cached.client.close().catch(() => {});
  const host = `${ns.name}.servicebus.windows.net`;
  let entry;
  if (!forceSas) {
    entry = { client: new ServiceBusClient(host, credential, { retryOptions: { maxRetries: 0, timeoutInMs: 20000 } }), auth: "entra" };
  } else {
    const keys = await mgmt(ns.subscriptionId).namespaces.listKeys(ns.resourceGroup, ns.name, "RootManageSharedAccessKey");
    entry = { client: new ServiceBusClient(keys.primaryConnectionString), auth: "sas" };
  }
  dataClients.set(ns.id, entry);
  return entry;
}

const isAuthError = (e) =>
  [e, ...(e?.errors ?? [])].some((x) => /unauthori[sz]ed|401|claim|not authorized/i.test(`${x?.code} ${x?.message}`));

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
  const attempt = async (forceSas) => {
    const { client, auth } = await dataClient(ns, forceSas);
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
  const cached = dataClients.get(ns.id);
  try {
    return await attempt(cached?.auth === "sas");
  } catch (e) {
    if (cached?.auth === "sas" || !isAuthError(e)) throw e;
    return await attempt(true);
  }
}

