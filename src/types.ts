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

declare global {
  interface Window {
    bus: {
      account(): Promise<Account>;
      subscriptions(): Promise<Sub[]>;
      addAccount(): Promise<boolean>;
      cancelAddAccount(): Promise<boolean>;
      access(ns: Namespace): Promise<Access>;
      setConnectionString(arg: { ns: Namespace; connectionString: string }): Promise<boolean>;
      clearConnectionString(arg: { ns: Namespace }): Promise<boolean>;
      namespaces(subId: string): Promise<Namespace[]>;
      entities(ns: Namespace): Promise<Entities>;
      peek(arg: { ns: Namespace; queue?: string; topic?: string; subscription?: string; deadLetter?: boolean; max?: number }): Promise<PeekResult>;
      openExternal(url: string): Promise<void>;
    };
  }
}
