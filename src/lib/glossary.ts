// Plain-English explanations shown in tooltips. One place, so wording stays consistent.
import type { Layer } from "../tools/servicebus/detect";
import type { Env } from "./util";
import { modClick } from "./platform";

type Entry = { title: string; body?: string };

export const env: Record<Env, Entry> = {
  prod: { title: "Production", body: "The name contains “prod”. Treat what you see here as live customer data. Busscope only peeks, and running a function asks you to confirm." },
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
  connWhy: "A shared access policy with Listen rights, e.g. from Key Vault or the namespace's “Shared access policies” page. Azimuth keeps it in memory until you quit and never writes it to disk.",
  noAccount: "This subscription came from a different az account. Azimuth asks az for a token as that account.",
};

export const auth = {
  entra: { title: "Signed in with Entra ID", body: "Your az CLI identity has a Service Bus data role on this namespace, so Busscope reads messages as you." },
  connection: {
    title: "Using your connection string",
    body: "You pasted a connection string for this namespace. It's kept in memory until you quit Azimuth. Click × to forget it now.",
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
  compare: { title: "Compare two messages", body: `${modClick} another row to diff its payload and properties against the selected message.` },
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

// ─── Application Insights ────────────────────────────────────────────────────
export const ai = {
  operationId: "Every request, dependency call and log written while handling one operation shares this id, even across services. It's the trace id from the W3C traceparent header.",
  role: "cloud_RoleName: the service that sent this telemetry. With OpenTelemetry it's the service name; otherwise usually the app's name.",
  noTrace: "No telemetry with this operation id in the time window. It may be in another Application Insights resource, sampled out, or not ingested yet (ingestion usually takes 30 seconds to 3 minutes).",
  noLogs: "Nothing in this operation called a logger, or those logs were filtered by the app's log level.",
  missingParents: "Some spans point to a parent span that isn't in this resource, usually because the calling service sends telemetry to a different Application Insights resource. Azimuth can search the other resources in your subscriptions and stitch the operation together.",
  range: { title: "Time range", body: "Every query is limited to this window, which keeps them fast on busy resources." },
  roleFilter: { title: "Service", body: "Only telemetry from this cloud_RoleName. Useful when several apps share one Application Insights resource." },
  requests: { title: "Requests", body: "Incoming operations: HTTP requests and function invocations. Counts respect sampling (itemCount)." },
  failed: { title: "Failed requests", body: "Requests whose success flag is false, such as HTTP 5xx and functions that threw." },
  p50: { title: "Median duration (p50)", body: "Half of requests finished faster than this." },
  p95: { title: "95th percentile duration", body: "95% of requests finished faster than this. A better measure of what slow users experience." },
  exceptions: { title: "Exceptions", body: "Exceptions logged by the apps, handled or not." },
  depFailed: { title: "Failed dependency calls", body: "Outgoing calls (SQL, HTTP, Service Bus…) that failed. Often the root cause behind failed requests." },
  timeline: { title: "Requests over time", body: "Grey is all requests, red is failures. Hover a bar for numbers." },
  live: { title: "Live", body: "Checks for new logs every 10 seconds. Telemetry reaches Application Insights 30 seconds to 3 minutes after it's written, so live means recent, not instant." },
  kql: { title: "KQL", body: "Kusto Query Language, the same as Logs in the Azure portal. Tables: requests, dependencies, traces, exceptions, customEvents, pageViews. The time range applies on top of your query, and results stop at 10,000 rows." },
  sampling: "This resource keeps a sample of telemetry. Counts are scaled up by itemCount, but individual operations may be missing.",
  findTrace: { title: "Find trace", body: "Paste an operation id, trace id or traceparent. Azimuth searches every Application Insights resource in the subscriptions you show, six at a time." },
};

// ─── Functions ───────────────────────────────────────────────────────────────
export const fn = {
  trigger: (type: string): Entry => {
    const t: Record<string, Entry> = {
      httpTrigger: { title: "HTTP trigger", body: "Runs when its URL is called. Run sends a real HTTP request to it." },
      timerTrigger: { title: "Timer trigger", body: "Runs on a CRON schedule (seconds minutes hours day month weekday), in UTC unless WEBSITE_TIME_ZONE is set. Run starts it once now." },
      serviceBusTrigger: { title: "Service Bus trigger", body: "Runs for each message on a queue or topic subscription. Run passes your input as the message body, without touching the queue." },
      queueTrigger: { title: "Storage queue trigger", body: "Runs for each message on an Azure Storage queue. Run passes your input as the message, without touching the queue." },
      blobTrigger: { title: "Blob trigger", body: "Runs when a blob is created or updated. Run passes your input as the blob path." },
      eventHubTrigger: { title: "Event Hubs trigger", body: "Runs for batches of events from an event hub. Run passes your input as one event." },
      eventGridTrigger: { title: "Event Grid trigger", body: "Runs when Event Grid delivers an event. Run passes your input as the event." },
      cosmosDBTrigger: { title: "Cosmos DB trigger", body: "Runs on changes to a Cosmos DB container (the change feed). Run passes your input as the changed documents." },
      activityTrigger: { title: "Durable activity", body: "A step called by a Durable orchestration. It can't be run on its own." },
      orchestrationTrigger: { title: "Durable orchestrator", body: "Coordinates activities. Start it through its HTTP starter function instead." },
      entityTrigger: { title: "Durable entity", body: "Stateful Durable entity. It can't be run on its own." },
    };
    return t[type] ?? { title: type, body: "Run passes your input to the function host's admin endpoint." };
  },
  run: { title: "Run", body: "Executes the function for real, in Azure, with the input you give. It's sent once and never retried." },
  runProd: "This is a production app. The function will do real work: send real emails, write real data, call real services. Type the app's name to confirm.",
  noRunAccess: "Running needs permission to read the app's keys (Microsoft.Web/sites/host/listkeys/action), which Website Contributor and Contributor include. History and logs only need Reader.",
  keys: "Azimuth reads the key it needs from Azure for each run and keeps it in memory. It never shows it or writes it to disk.",
  link: (via: string) => via === "settings"
    ? "Found from the app's APPLICATIONINSIGHTS_CONNECTION_STRING setting."
    : via === "telemetry"
      ? "You can't read this app's settings, so Azimuth asked each Application Insights resource in the subscription which service ran these functions recently."
      : "You picked this resource. Azimuth remembers the choice on this machine.",
  ingest: "Application Insights shows an invocation 30 seconds to 3 minutes after it ran. Azimuth keeps checking for up to five minutes.",
  authLevel: (l: string) => l === "anonymous" ? "Anyone with the URL can call it." : l === "admin" ? "Needs the app's master key. Azimuth adds it for you." : "Needs a function key. Azimuth adds it for you.",
  disabled: "Disabled in Azure (AzureWebJobs.<name>.Disabled). It doesn't run on its trigger and Run won't start it.",
  invocation: { title: "Invocation", body: "One run of the function. Click to see everything it did: calls it made, logs it wrote and exceptions it threw." },
};
