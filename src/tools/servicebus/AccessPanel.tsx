import { useState } from "react";
import { api } from "../../lib/api";
import { motion } from "motion/react";
import { KeyRound, Lock, ShieldCheck } from "lucide-react";
import type { Access, Namespace } from "../../types";
import * as G from "../../lib/glossary";
import { Button, CopyButton, Field, Spinner, Tip } from "../../ui/ui";

// Shown instead of the message list when you can read a namespace's counts but not its messages.
export function AccessPanel({ ns, access, rejected, user, onConnected }: { ns: Namespace; access: Access; rejected?: boolean; user?: string; onConnected: () => void }) {
  const [cs, setCs] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const command = `az role assignment create \\\n  --role "${G.access.role}" \\\n  --assignee ${user ?? "<your-upn>"} \\\n  --scope ${access.scope}`;

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.sb.setConnectionString({ ns, connectionString: cs });
      setCs("");
      onConnected();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-[640px] px-6 py-10">
        <div className="flex size-10 items-center justify-center rounded-lg border border-line bg-bg-1 text-fg-3"><Lock className="size-4" /></div>
        <h2 className="mt-4 text-[16px] font-semibold tracking-tight text-fg">You can see the counts, but not the messages</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-fg-2">
          {G.access.whyCounts}{" "}
          {rejected && (access.receive || access.listKeys) ? (
            <>Azure says you have access to <span className="font-mono text-[12px] text-fg">{ns.name}</span>, but Service Bus rejected it. A new role assignment can take a few minutes to apply, and if local (SAS) authentication is disabled on the namespace, access keys don't work at all.</>
          ) : (
            <>On <span className="font-mono text-[12px] text-fg">{ns.name}</span> your account has neither a Service Bus data role nor permission to read the access keys, so Busscope has no way to peek.</>
          )}
        </p>

        <div className="mt-5 grid grid-cols-3 gap-2 text-[12px]">
          <Check ok={access.read} label="Read namespace" hint="Counts, topics and filter rules" />
          <Check ok={access.receive} label="Data Receiver role" hint="Peek as yourself" />
          <Check ok={access.listKeys} label="Read access keys" hint="Contributor or Owner" />
        </div>

        <section className="mt-8 rounded-lg border border-line">
          <div className="flex items-center gap-2 border-b border-line px-4 py-3">
            <ShieldCheck className="size-4 text-fg-3" />
            <Tip content={{ title: G.access.role, body: G.access.roleWhy }}><h3 className="cursor-help text-[13px] font-medium text-fg">Ask for read access</h3></Tip>
            <span className="ml-auto text-[12px] text-fg-3">Recommended</span>
          </div>
          <div className="space-y-3 px-4 py-4 text-[13px] text-fg-2">
            <p>
              Ask a subscription Owner or User Access Administrator to give you <span className="text-fg">{G.access.role}</span> on this namespace. Send them this command:
            </p>
            <div className="relative rounded-md border border-line bg-bg-1">
              <pre className="selectable overflow-x-auto px-3 py-2.5 pr-10 font-mono text-[11.5px] leading-5 text-fg">{command}</pre>
              <CopyButton text={command.replace(/\\\n\s*/g, "")} label="Copy command" className="absolute right-1.5 top-1.5" />
            </div>
            <div className="flex items-center gap-2 text-[12px] text-fg-3">
              <span className="shrink-0">Scope</span>
              <code className="selectable min-w-0 flex-1 truncate font-mono text-[11px] text-fg-2">{access.scope}</code>
              <CopyButton text={access.scope} label="Copy scope" />
            </div>
          </div>
        </section>

        <section className="mt-3 rounded-lg border border-line">
          <div className="flex items-center gap-2 border-b border-line px-4 py-3">
            <KeyRound className="size-4 text-fg-3" />
            <h3 className="text-[13px] font-medium text-fg">Or use a connection string</h3>
          </div>
          <div className="space-y-3 px-4 py-4 text-[13px] text-fg-2">
            <p>{G.access.connWhy}</p>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (cs.trim()) connect();
              }}
            >
              <Field
                type="password"
                value={cs}
                onChange={setCs}
                icon={<KeyRound />}
                placeholder={`Endpoint=sb://${ns.name}.servicebus.windows.net/;SharedAccessKeyName=…`}
                wrapperClassName="flex-1"
                autoComplete="off"
              />
              <Button type="submit" disabled={!cs.trim() || busy}>{busy ? <Spinner className="size-3" /> : null}Connect</Button>
            </form>
            {error && <p className="text-[12px] text-bad">{error}</p>}
          </div>
        </section>
      </motion.div>
    </div>
  );
}

function Check({ ok, label, hint }: { ok: boolean; label: string; hint: string }) {
  return (
    <div className="rounded-md border border-line bg-bg-1 px-3 py-2">
      <div className={ok ? "text-ok" : "text-fg-3"}>{ok ? "✓" : "✕"} {label}</div>
      <div className="mt-0.5 text-[11px] text-fg-3">{hint}</div>
    </div>
  );
}
