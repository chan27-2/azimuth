// Plain-English explanations shown in tooltips. One place, so wording stays consistent.
import type { Layer } from "./detect";
import type { Env } from "./util";

type Entry = { title: string; body?: string };

export const env: Record<Env, Entry> = {
  prod: { title: "Production", body: "The name contains “prod”. Busscope only peeks, but treat what you see here as live customer data." },
  preview: { title: "Preview environment", body: "The name contains “preview”." },
  dev: { title: "Development", body: "The name contains “dev”." },
  ci: { title: "CI environment", body: "The name contains “ci”." },
  other: { title: "" },
};

export const access = {
  locked: {
    title: "Counts only",
    body: "You can read this namespace through Azure Resource Manager, which is where the counts come from. Reading messages is a separate data-plane permission you don't have here. Open a queue or subscription to see your options.",
  },
  whyCounts: "Counts, topics and filter rules come from Azure Resource Manager, which a Reader role can see. Message bodies come from the Service Bus data plane, which needs its own permission.",
  role: "Azure Service Bus Data Receiver",
  roleWhy: "A built-in role that lets you peek and receive messages, and nothing else. Scoped to this namespace, it doesn't touch anything else in the subscription.",
  connWhy: "A shared access policy with Listen rights, e.g. from Key Vault or the namespace's “Shared access policies” page. Busscope keeps it in memory until you quit and never writes it to disk.",
  noAccount: "This subscription came from a different az account. Busscope asks az for a token as that account.",
};

export const auth = {
  entra: { title: "Signed in with Entra ID", body: "Your az CLI identity has a Service Bus data role on this namespace, so Busscope reads messages as you." },
  connection: {
    title: "Using your connection string",
    body: "You pasted a connection string for this namespace. It's kept in memory until you quit Busscope. Click × to forget it now.",
  },
  sas: {
    title: "Using a SAS key read over ARM",
    body: "Your identity has no Service Bus data role here, so Busscope used your management (Contributor) access to read the namespace's RootManageSharedAccessKey and peek with it. The key stays in memory. Ask for “Azure Service Bus Data Receiver” to use Entra instead.",
  },
};

export const ui = {
  peek: { title: "Peek", body: "Reads messages without locking or removing them. Consumers are unaffected and delivery counts don't change." },
  peekSize: { title: "How many messages to peek", body: "Busscope reads from the oldest message forward, up to this many." },
  activeTab: { title: "Active messages", body: "Messages waiting to be received by a consumer." },
  dlqTab: { title: "Dead-letter queue", body: "Messages Service Bus set aside because they couldn't be delivered or processed. They stay here until someone resubmits or deletes them." },
  histogram: { title: "When these messages were enqueued", body: "Each bar is a slice of time between the oldest and newest peeked message. Click a bar to show only that slice." },
  reasonChip: { title: "Filter by dead-letter reason", body: "Count of peeked messages with this reason. Click to show only these." },
  compare: { title: "Compare two messages", body: "⌘-click another row to diff its payload and properties against the selected message." },
  copyPayload: { title: "Copy payload", body: "Copies the decoded body: unwrapped from gzip, base64 and any envelope, then pretty-printed." },
  copyMessage: { title: "Copy whole message", body: "Copies body, broker properties and application properties as one JSON document." },
  searchTree: { title: "Search the payload", body: "Highlights matching keys and values and expands the branches that contain them." },
  sidebarActive: { title: "Active messages", body: "Waiting to be received." },
  sidebarDlq: { title: "Dead-lettered messages", body: "Set aside after failing delivery or processing." },
  seq: { title: "Sequence number", body: "A unique, increasing number Service Bus assigns when the message is accepted. Dead-lettered messages keep their original number." },
  deliveryCount: { title: "Delivery count", body: "How many times a consumer received this message and failed to complete it. When it reaches the subscription's max delivery count, the message is dead-lettered." },
  jsonPath: { title: "Copy path", body: "Copies the JSONPath to this value, e.g. $.data.email." },
  jsonValue: { title: "Copy value" },
};

export const stats = {
  topics: { title: "Topics", body: "Publish/subscribe entities. A sender writes once to a topic, and every subscription whose filter matches gets its own copy." },
  subscriptions: { title: "Subscriptions", body: "A subscription is a named queue attached to a topic. Each one has filter rules that decide which messages it receives." },
  queues: { title: "Queues", body: "Point-to-point entities: each message is received by one consumer." },
  active: { title: "Active messages", body: "Total waiting to be received across all queues and subscriptions." },
  dlq: { title: "Dead-lettered", body: "Total sitting in dead-letter queues. Usually a sign of a failing consumer or a poison message." },
};

export const node = {
  topic: (subs: number): Entry => ({ title: "Topic", body: `Senders publish here. Copies go to the ${subs} subscription${subs === 1 ? "" : "s"} on the right, depending on their filters.` }),
  sub: (maxDelivery: number, session: boolean, forward: string | null): Entry => ({
    title: "Subscription",
    body: `Receives copies of matching topic messages. Dead-letters a message after ${maxDelivery} failed deliveries.${session ? " Requires sessions, so messages are delivered in order per session id." : ""}${forward ? ` Auto-forwards to ${forward}.` : ""} Click to open.`,
  }),
  queue: (maxDelivery: number): Entry => ({ title: "Queue", body: `Each message goes to one consumer. Dead-letters a message after ${maxDelivery} failed deliveries. Click to open.` }),
  dlq: { title: "Dead-letter queue", body: "Every queue and subscription has one. Click to inspect why messages ended up here." },
  fwd: { title: "Auto-forward target", body: "Messages arriving at the subscription are moved here automatically." },
};

export const edge = {
  all: "This subscription has the default rule (1=1), so it receives every message published to the topic.",
  sql: "A SQL filter decides which messages this subscription receives. [name] refers to an application property on the message: [type] is the property called “type”, which often holds the event type.",
  correlation: "A correlation filter: the message is delivered only if these properties match exactly. It's cheaper for Service Bus to evaluate than SQL.",
  multi: "With more than one rule, a message is delivered if any rule matches. It's delivered once, not once per rule.",
  action: "A rule action rewrites properties on matching messages before they're delivered.",
  forward: "Auto-forwarding: everything that reaches the subscription is moved on to this entity.",
};

export function layer(l: Layer): Entry {
  switch (l.kind) {
    case "gzip": return { title: "Gzip-compressed", body: "The body started with the gzip magic bytes 1F 8B, so Busscope decompressed it and kept detecting." };
    case "base64": return { title: "Base64 text", body: "The body was a base64 string. Busscope decoded it to bytes and kept detecting." };
    case "bom": return { title: "UTF-8 byte-order mark", body: "The body started with EF BB BF, an invisible marker some .NET serializers add. Busscope stripped it." };
    case "json-string": return { title: "Double-encoded JSON", body: "The body was a JSON string whose contents were JSON again, which usually means the sender serialized twice." };
    case "cloudevent": return { title: `CloudEvent ${l.envelope.specversion}`, body: "A CNCF CloudEvents envelope (it has specversion, type and source). Busscope shows the envelope separately and decodes its data field." };
    case "masstransit": return { title: "MassTransit envelope", body: "A MassTransit message envelope. The envelope is shown separately and the inner message is decoded." };
  }
}

export const bodyType: Record<string, Entry> = {
  data: { title: "AMQP data section", body: "The body travels as raw bytes, which is what the .NET and Java SDKs send. Busscope has to work out the format itself." },
  value: { title: "AMQP value section", body: "The body is a single AMQP-typed value, such as a string or a map. Older or non-.NET senders often use this." },
  sequence: { title: "AMQP sequence section", body: "The body is a list of AMQP values. This is rare." },
};

export const format: Record<string, Entry> = {
  json: { title: "JSON", body: "Shown as a collapsible tree." },
  xml: { title: "XML", body: "Parsed successfully and shown as an element tree." },
  csv: { title: "CSV", body: "Rows with a consistent delimiter. Shown as a sortable table." },
  text: { title: "Plain text", body: "Valid UTF-8 that isn't JSON, XML or CSV." },
  binary: { title: "Binary", body: "Not valid UTF-8 text. Formats like Protobuf need a schema to decode, so the bytes are shown as hex." },
  empty: { title: "Empty body" },
};

export const declared = (ct: string, mismatch: boolean): Entry => ({
  title: mismatch ? "Content-Type doesn't match the body" : "Content-Type",
  body: mismatch
    ? `The sender labelled this “${ct}”, but the body parses as something else. Consumers that trust the label may fail on this message.`
    : `The sender labelled this “${ct}”. Busscope treats the label as a hint and still checks the bytes.`,
});

export const tag = {
  CE: { title: "CloudEvent", body: "The body is a CloudEvents envelope." },
  GZ: { title: "Gzip", body: "The body was gzip-compressed." },
  mismatch: { title: "Content-Type mismatch", body: "The declared Content-Type disagrees with what the body actually contains." },
};

export const chip = {
  subject: { title: "Subject", body: "The message's Subject (called Label in older SDKs). Often used for routing or as a short description." },
  correlation: { title: "Correlation id", body: "Links related messages, such as a request and its reply, or all messages from one operation." },
  trace: { title: "Distributed trace id", body: "Read from the traceparent or Diagnostic-Id property. Search for it in Application Insights to see the whole request." },
  session: { title: "Session id", body: "Messages with the same session id are delivered in order to one consumer at a time." },
};

const dlqReasons: Record<string, string> = {
  MaxDeliveryCountExceeded: "A consumer received this message and abandoned it, or its lock expired, too many times in a row. The consumer is probably throwing on it.",
  TTLExpiredException: "The message expired before anyone received it. This only dead-letters when dead-lettering on expiration is enabled.",
  HeaderSizeExceeded: "The message's properties grew past the header size limit.",
  "Session id is null": "The entity requires sessions, but the message was sent without a session id.",
  MaxTransferHopCountExceeded: "The message was auto-forwarded through too many entities. Check for a forwarding loop.",
};
export const dlqReason = (r: string): Entry => ({
  title: r,
  body: dlqReasons[r] ?? "Set by the consumer that dead-lettered this message. Look at the error description for details.",
});

export const props: Record<string, string> = {
  MessageId: "Set by the sender. Duplicate detection uses it when that's enabled.",
  SequenceNumber: "Assigned by Service Bus, unique and increasing within the entity.",
  ContentType: "The sender's label for the body format.",
  Subject: "Application-defined label, often the event or command name.",
  CorrelationId: "Links related messages together.",
  SessionId: "Groups messages that must be processed in order.",
  To: "Reserved for auto-forwarding scenarios; usually empty.",
  ReplyTo: "Where a reply should be sent, in request/reply patterns.",
  EnqueuedTime: "When Service Bus accepted the message.",
  ExpiresAt: "EnqueuedTime + TimeToLive. After this the message is dropped or dead-lettered.",
  ScheduledEnqueueTime: "When a scheduled message becomes visible to consumers.",
  TimeToLive: "How long the message is kept before it expires.",
  DeliveryCount: "Times it has been received and not completed.",
  State: "Active, deferred or scheduled.",
  BodyType: "How the body is encoded in AMQP: data (bytes), value or sequence.",
  Size: "Body size in bytes, before any decompression.",
  DeadLetterReason: "Why the message was dead-lettered.",
  DeadLetterErrorDescription: "Extra detail recorded when it was dead-lettered.",
  DeadLetterSource: "The entity it was dead-lettered from, when it came through auto-forwarding.",
};
