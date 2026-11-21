export type Account = { user: string; tenantId: string; defaultSubscription: string; demo?: boolean };
export type Sub = { id: string; name: string; tenantId?: string; user?: string; isDefault?: boolean };
export type Namespace = {
  id: string; name: string; subscriptionId: string; resourceGroup: string;
  location: string; sku: string; endpoint: string; status: string;
};
export type Counts = { active: number; deadLetter: number; scheduled: number; transfer: number };
export type Rule = { name: string; filterType: string; sql?: string; correlation: Record<string, unknown> | null; action: string | null };
export type SubEntity = {
  name: string; counts: Counts; status: string; requiresSession: boolean; maxDeliveryCount: number;
  forwardTo: string | null; forwardDeadLetteredMessagesTo: string | null; accessedAt: string | null; rules: Rule[];
};
export type Topic = { name: string; sizeInBytes: number; status: string; accessedAt: string | null; subscriptions: SubEntity[] };
export type Queue = {
  name: string; counts: Counts; sizeInBytes: number; status: string; requiresSession: boolean;
  maxDeliveryCount: number; forwardTo: string | null; accessedAt: string | null;
};
export type Entities = { queues: Queue[]; topics: Topic[] };
export type Message = {
  sequenceNumber: string; messageId: string | null; contentType: string | null; subject: string | null;
  correlationId: string | null; sessionId: string | null; to: string | null; replyTo: string | null;
  enqueuedTime: string | null; expiresAt: string | null; scheduledEnqueueTime: string | null; timeToLive: number | null;
  deliveryCount: number; state: string; deadLetterReason: string | null; deadLetterErrorDescription: string | null;
  deadLetterSource: string | null; applicationProperties: Record<string, unknown>; bodyType: string; size: number; body: string;
};
export type Auth = "entra" | "sas" | "connection";
export type PeekResult = { auth: Auth; messages: Message[] };
export type Access = { read: boolean; receive: boolean; listKeys: boolean; connectionString: boolean; scope: string };
export const canRead = (a: Access) => a.receive || a.listKeys || a.connectionString;

export type EntityRef =
  | { kind: "queue"; ns: Namespace; queue: string; dlq?: boolean }
  | { kind: "subscription"; ns: Namespace; topic: string; subscription: string; dlq?: boolean };

// ─── Functions ────────────────────────────────────────────────────────────────
export type FunctionApp = {
  id: string; name: string; subscriptionId: string; resourceGroup: string; location: string; kind: string;
  linux: boolean; state: string; hostName: string; plan: string | null; httpsOnly: boolean;
};
export type Trigger = { type: string; [setting: string]: string | number | boolean };
export type Fn = {
  name: string; language: string | null; disabled: boolean; invokeUrl: string | null; trigger: Trigger;
  http: { methods: string[]; route: string | null; authLevel: string } | null;
  bindings: { type: string; direction: string; name: string }[]; runnable: boolean;
};
export type FnAccess = { read: boolean; run: boolean; settings: boolean; scope: string };
export type InsightsLink = { component: Component; role: string | null; via: "settings" | "telemetry" | "manual" };
export type FnStats = { name: string; n: number; failed: number; p50: number; p95: number; lastRun: string };
export type Invocation = {
  timestamp: string; id: string; operation_Id: string; success: string; resultCode: string; duration: number;
  cloud_RoleInstance?: string; invocationId?: string; triggerReason?: string; exact?: boolean;
};
export type RunResult = {
  status: number; statusText: string; headers: Record<string, string>; body: string; size: number; truncated: boolean;
  ms: number; traceId: string; startedAt: string; kind: "http" | "admin";
};
export type HttpRun = { method: string; path: string; query: [string, string][]; headers: [string, string][]; body: string };
export type FnRef = { app: FunctionApp; fn?: string };

// ─── Application Insights ────────────────────────────────────────────────────
export type Component = {
  id: string; name: string; subscriptionId: string; resourceGroup: string; location: string; appId: string; kind: string;
  workspace: string | null; retentionDays: number | null; samplingPercentage: number | null;
};
export type Range = "30m" | "1h" | "6h" | "24h" | "3d" | "7d" | "30d";
export type Overview = {
  totals: { total?: number; failed?: number; p50?: number; p95?: number; exceptions?: number; dependencies?: number; depFailed?: number };
  timeline: { timestamp: string; total: number; failed: number }[];
  operations: { name: string; n: number; failed: number; p50: number; p95: number; role: string }[];
  exceptions: { problemId: string; n: number; lastSeen: string; type: string; message: string; role: string; operation: string }[];
  roles: string[]; bin: string;
};
export type RequestRow = { timestamp: string; id: string; name: string; resultCode: string; duration: number; success: string; cloud_RoleName: string; operation_Id: string; url: string };
export type LogRow = {
  timestamp: string; itemType: "trace" | "exception"; itemId: string; severityLevel: number | null; message: string; cloud_RoleName: string;
  operation_Id: string; operation_Name: string; operation_ParentId: string; customDimensions: Record<string, unknown> | null; details: ExceptionDetail[] | null;
};
export type ExceptionDetail = { outerType?: string; type?: string; message?: string; rawStack?: string; parsedStack?: { method: string; fileName?: string; line?: number }[] };
export type TraceItem = {
  itemType: "request" | "dependency" | "trace" | "exception" | "customEvent" | "pageView"; itemId: string; timestamp: string; id: string | null;
  operation_ParentId: string | null; operation_Name: string; name: string; duration: number | null; success: string | null; resultCode: string | null;
  target: string | null; type: string | null; data: string | null; url: string | null; message: string | null; severityLevel: number | null;
  cloud_RoleName: string; cloud_RoleInstance: string | null; outerMessage: string | null; problemId: string | null; details: ExceptionDetail[] | null;
  customDimensions: Record<string, unknown> | null; customMeasurements: Record<string, unknown> | null; sdkVersion: string | null; component: string;
};
export type Trace = { operationId: string; items: TraceItem[] };
export type FoundTrace = { operationId: string; searched: number; failed: number; hits: { component: Component; n: number; firstSeen: string; roles: string[] }[] };
export type QueryResult = { columns: { name: string; type: string }[]; rows: unknown[][]; truncated: boolean; ms: number };

export type Api = {
  core: {
    account(): Promise<Account>;
    subscriptions(): Promise<Sub[]>;
    addAccount(): Promise<boolean>;
    cancelAddAccount(): Promise<boolean>;
  };
  sb: {
    namespaces(subId: string): Promise<Namespace[]>;
    entities(ns: Namespace): Promise<Entities>;
    access(ns: Namespace): Promise<Access>;
    setConnectionString(arg: { ns: Namespace; connectionString: string }): Promise<boolean>;
    clearConnectionString(arg: { ns: Namespace }): Promise<boolean>;
    peek(arg: { ns: Namespace; queue?: string; topic?: string; subscription?: string; deadLetter?: boolean; max?: number }): Promise<PeekResult>;
  };
  fn: {
    apps(subId: string): Promise<FunctionApp[]>;
    functions(app: FunctionApp): Promise<Fn[]>;
    access(app: FunctionApp): Promise<FnAccess>;
    insights(arg: { app: FunctionApp; functionNames: string[]; subIds: string[] }): Promise<InsightsLink | null>;
    stats(arg: { link: InsightsLink; functionNames: string[]; range: Range }): Promise<FnStats[]>;
    invocations(arg: { link: InsightsLink; fn: string; range: Range; failedOnly?: boolean; limit?: number }): Promise<Invocation[]>;
    findInvocation(arg: { link: InsightsLink; fn: string; traceId: string; since: string }): Promise<Invocation | null>;
    run(arg: { runId: string; app: FunctionApp; fn: string; confirm?: string; http?: HttpRun; input?: string }): Promise<RunResult>;
    cancelRun(arg: { runId: string }): Promise<boolean>;
  };
  ai: {
    components(subId: string): Promise<Component[]>;
    overview(arg: { component: Component; range: Range; role?: string | null }): Promise<Overview>;
    requests(arg: { component: Component; range: Range; role?: string | null; name?: string; failedOnly?: boolean; minDuration?: number; search?: string; limit?: number }): Promise<RequestRow[]>;
    logs(arg: { component: Component; range: Range; role?: string | null; minSeverity?: number; search?: string; operationName?: string; after?: string; limit?: number }): Promise<LogRow[]>;
    trace(arg: { component: Component; operationId: string; at?: string }): Promise<Trace>;
    traceAcross(arg: { components: Component[]; operationId: string; at?: string }): Promise<Trace>;
    findTrace(arg: { subIds: string[]; operationId: string; at?: string }): Promise<FoundTrace>;
    query(arg: { component: Component; kql: string; range: Range }): Promise<QueryResult>;
  };
};
