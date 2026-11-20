// Demo mode (BUSSCOPE_DEMO=1): a made-up "Acme" estate so you can try Busscope, or take screenshots,
// without an Azure subscription. Every name, id and payload here is fictional.
import { gzipSync } from "node:zlib";
import { randomUUID } from "node:crypto";

const SUB_PROD = "00000000-0000-4000-8000-000000000001";
const SUB_DEV = "00000000-0000-4000-8000-000000000002";
const SUB_SIDE = "00000000-0000-4000-8000-000000000003";
const demoConnections = new Set();

const ns = (name, sub, location) => ({
  id: `/subscriptions/${sub}/resourceGroups/${name}-rg/providers/Microsoft.ServiceBus/namespaces/${name}`,
  name, subscriptionId: sub, resourceGroup: `${name}-rg`, location, sku: "Standard",
  endpoint: `https://${name}.servicebus.windows.net:443/`, status: "Active",
});

const NAMESPACES = {
  [SUB_PROD]: [ns("acme-prod-orders-sbns", SUB_PROD, "westeurope"), ns("acme-prod-billing-sbns", SUB_PROD, "westeurope")],
  [SUB_DEV]: [ns("acme-dev-orders-sbns", SUB_DEV, "uksouth"), ns("acme-preview-orders-sbns", SUB_DEV, "uksouth")],
  [SUB_SIDE]: [ns("hobby-dev-events-sbns", SUB_SIDE, "eastus")],
};

const counts = (active, deadLetter, scheduled = 0) => ({ active, deadLetter, scheduled, transfer: 0 });
const sub = (name, c, rules, extra = {}) => ({
  name, counts: c, status: "Active", requiresSession: false, maxDeliveryCount: 10, forwardTo: null,
  forwardDeadLetteredMessagesTo: null, accessedAt: new Date().toISOString(), rules, ...extra,
});
const sql = (name, sqlExpression, action = null) => ({ name, filterType: "SqlFilter", sql: sqlExpression, correlation: null, action });
const all = [sql("$Default", "1=1")];

function estate(name) {
  const big = name.includes("prod") ? 1 : 0.1;
  return {
    queues: [
      { name: "email-outbox", counts: counts(Math.round(42 * big), 3), sizeInBytes: 81234, status: "Active", requiresSession: false, maxDeliveryCount: 5, forwardTo: null, accessedAt: new Date().toISOString() },
      { name: "invoice-exports", counts: counts(0, Math.round(12 * big) || 2), sizeInBytes: 20480, status: "Active", requiresSession: true, maxDeliveryCount: 10, forwardTo: null, accessedAt: new Date().toISOString() },
    ],
    topics: [
      {
        name: "order-events", sizeInBytes: 512000, status: "Active", accessedAt: new Date().toISOString(),
        subscriptions: [
          sub("fulfilment", counts(Math.round(318 * big), 0), [sql("order-lifecycle", "[type] IN ('acme.order.placed.v1', 'acme.order.cancelled.v1')")]),
          sub("analytics", counts(Math.round(1204 * big), 0), all),
          sub("payments", counts(Math.round(9 * big), Math.round(57 * big) || 6), [
            { name: "eu-orders", filterType: "CorrelationFilter", sql: undefined, correlation: { properties: { region: "eu" }, label: "order.placed" }, action: null },
          ]),
          sub("notifications", counts(0, 4), [sql("customer-facing", "[type] LIKE 'acme.order.%' AND [channel] = 'email'", "SET priority = 'high'")], { forwardTo: "email-outbox" }),
        ],
      },
      {
        name: "inventory", sizeInBytes: 128000, status: "Active", accessedAt: new Date().toISOString(),
        subscriptions: [sub("warehouse-sync", counts(Math.round(77 * big), 1), all)],
      },
    ],
  };
}

const ago = (mins) => new Date(Date.now() - mins * 60_000);
const b64 = (s) => Buffer.from(s).toString("base64");

function message(i, kind, deadLetter) {
  const id = randomUUID();
  const orderId = `ORD-${String(48210 + i).padStart(6, "0")}`;
  const trace = randomUUID().replace(/-/g, "");
  const base = {
    sequenceNumber: String(1000 + i), messageId: id, correlationId: randomUUID().replace(/-/g, ""), sessionId: null, to: null, replyTo: null,
    enqueuedTime: ago(5 + i * 37 + (i % 3) * 11).toISOString(), expiresAt: null, scheduledEnqueueTime: null, timeToLive: 14 * 864e5,
    deliveryCount: deadLetter ? 10 : i % 4, state: "active", deadLetterReason: null, deadLetterErrorDescription: null, deadLetterSource: null,
    applicationProperties: { traceparent: `00-${trace}-${trace.slice(0, 16)}-01` }, bodyType: "data",
  };
  if (deadLetter) {
    const r = [
      ["MaxDeliveryCountExceeded", "Message could not be consumed after 10 delivery attempts."],
      ["PaymentDeclined", "Card issuer returned 'insufficient_funds' for payment intent pi_3Nf…"],
      ["TTLExpiredException", "The message expired and was dead lettered."],
    ][i % 3];
    Object.assign(base, { deadLetterReason: r[0], deadLetterErrorDescription: r[1] });
  }
  const order = { orderId, customer: { id: `cus_${1000 + i}`, email: `customer${i}@example.com`, tier: i % 2 ? "gold" : "standard" }, total: { amount: +(19.99 + i * 7.5).toFixed(2), currency: "EUR" }, items: [{ sku: "SKU-1182", qty: 1 + (i % 3) }, { sku: "SKU-0091", qty: 1 }] };
  let body, contentType, subject = "order.placed";
  switch (kind % 6) {
    case 0: {
      const ce = { specversion: "1.0", id, source: "/acme/orders", type: "acme.order.placed.v1", time: base.enqueuedTime, datacontenttype: "application/json", subject: `Order/${orderId}`, data: order };
      body = Buffer.from(JSON.stringify(ce)); contentType = "application/cloudevents+json";
      base.applicationProperties.type = "acme.order.placed.v1";
      break;
    }
    case 1: body = Buffer.from(JSON.stringify(order)); contentType = "application/json"; break;
    case 2: body = Buffer.from(b64(gzipSync(JSON.stringify(order)))); contentType = "application/json"; subject = "order.placed.compressed"; break;
    case 3: body = Buffer.from(`<?xml version="1.0"?><Invoice number="INV-${9000 + i}" currency="EUR"><Customer id="cus_${1000 + i}">Example Customer</Customer><Line sku="SKU-1182" qty="2">39.98</Line><Line sku="SKU-0091" qty="1">12.50</Line><Total>52.48</Total></Invoice>`); contentType = "application/xml"; subject = "invoice.issued"; break;
    case 4: body = Buffer.from(JSON.stringify({ messageId: id, messageType: ["urn:message:Acme.Contracts:StockReserved"], message: { orderId, sku: "SKU-1182", warehouse: "AMS-2", reserved: 2 }, sentTime: base.enqueuedTime })); contentType = "application/vnd.masstransit+json"; subject = "stock.reserved"; break;
    case 5: body = Buffer.from("sku,warehouse,on_hand,reserved\nSKU-1182,AMS-2,140,12\nSKU-0091,AMS-2,8,3\nSKU-7731,DUB-1,0,0\n"); contentType = "application/json"; subject = "inventory.snapshot"; break;
  }
  return { ...base, contentType, subject, size: body.length, body: body.toString("base64") };
}

export const demo = {
  account: async () => ({ demo: true, user: "demo@example.com", tenantId: "00000000-0000-0000-0000-000000000000", defaultSubscription: "Acme Production" }),
  subscriptions: async () => [
    { id: SUB_DEV, name: "Acme Development", tenantId: "00000000-0000-4000-8000-0000000000aa", user: "you@acme.example", isDefault: true },
    { id: SUB_PROD, name: "Acme Production", tenantId: "00000000-0000-4000-8000-0000000000aa", user: "you@acme.example", isDefault: false },
    { id: SUB_SIDE, name: "Side project", tenantId: "00000000-0000-4000-8000-0000000000bb", user: "you@example.com", isDefault: false },
  ],
  addAccount: async () => true,
  cancelAddAccount: async () => true,
  access: async (n) => ({
    read: true,
    receive: n.name.includes("dev"),
    listKeys: !n.name.includes("billing"),
    connectionString: demoConnections.has(n.id),
    scope: n.id,
  }),
  setConnectionString: async ({ ns: n, connectionString }) => {
    if (!connectionString.includes(n.name)) throw new Error(`This connection string isn't for ${n.name}.`);
    demoConnections.add(n.id);
    return true;
  },
  clearConnectionString: async ({ ns: n }) => (demoConnections.delete(n.id), true),
  namespaces: async (subId) => NAMESPACES[subId] ?? [],
  entities: async (n) => estate(n.name),
  peek: async ({ ns: n, queue, topic, subscription, deadLetter, max = 250 }) => {
    if (n.name.includes("billing") && !demoConnections.has(n.id)) {
      const e = new Error(`You can see ${n.name}'s counts, but you don't have permission to read its messages.`);
      e.code = "NO_ACCESS";
      throw e;
    }
    const e = estate(n.name);
    const c = queue ? e.queues.find((q) => q.name === queue)?.counts : e.topics.find((t) => t.name === topic)?.subscriptions.find((s) => s.name === subscription)?.counts;
    const total = Math.min(max, deadLetter ? c?.deadLetter ?? 0 : c?.active ?? 0);
    const seed = (queue ?? topic + subscription).length;
    return { auth: demoConnections.has(n.id) ? "connection" : n.name.includes("dev") ? "entra" : "sas", messages: Array.from({ length: total }, (_, i) => message(i, i + seed, deadLetter)) };
  },
};
