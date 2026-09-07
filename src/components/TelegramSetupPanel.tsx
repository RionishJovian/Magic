import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  telegramSetupStatus,
  registerTelegramWebhook,
  sendTelegramTest,
  listNotifierAudit,
} from "@/lib/telegram.functions";
import { fmtDateTime } from "@/lib/time";
import { toErrorMessage } from "@/lib/error-message";

/**
 * Owner/admin Telegram status and setup for Tier Pass review. Clients never
 * see this panel. Everything sensitive stays server-side: configured/not,
 * bot username, webhook state and a masked chat id — never the token.
 */
export function TelegramSetupPanel() {
  const qc = useQueryClient();
  const statusFn = useServerFn(telegramSetupStatus);
  const registerFn = useServerFn(registerTelegramWebhook);
  const testFn = useServerFn(sendTelegramTest);
  const auditFn = useServerFn(listNotifierAudit);
  const [confirming, setConfirming] = useState(false);

  const status = useQuery({ queryKey: ["telegram-setup"], queryFn: () => statusFn({}) });
  const audit = useQuery({ queryKey: ["notifier-audit"], queryFn: () => auditFn({}) });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["telegram-setup"] });
    void qc.invalidateQueries({ queryKey: ["notifier-audit"] });
    void qc.invalidateQueries({ queryKey: ["notifier-status"] });
  };

  const register = useMutation({
    mutationFn: () => registerFn({}),
    onSuccess: (r) => {
      toast.success(`Webhook registered at ${r.url}`);
      refresh();
    },
    onError: (e: Error) => toast.error(toErrorMessage(e)),
  });

  const test = useMutation({
    mutationFn: () => testFn({ data: { confirm: true } as const }),
    onSuccess: () => {
      setConfirming(false);
      toast.success("Test notification sent to the owner chat.");
      refresh();
    },
    onError: (e: Error) => {
      setConfirming(false);
      toast.error(toErrorMessage(e));
    },
  });

  const s = status.data;
  const configured = Boolean(s?.configured);
  const wh = s?.webhook;

  return (
    <section className="glass-panel space-y-4 rounded-2xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium">Telegram approvals</h2>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
            configured ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-200"
          }`}
        >
          {status.isLoading ? "Checking…" : configured ? "Configured" : "Not configured"}
        </span>
      </div>

      {status.error ? (
        <p role="alert" className="text-sm text-red-300">
          {status.error instanceof Error ? status.error.message : "Could not read Telegram status."}
        </p>
      ) : null}

      {s && !configured && (
        <div className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
          <p>{s.hint}</p>
          <ol className="list-decimal space-y-1 pl-4">
            <li>Link your bot through the Lovable Telegram connector (no token to paste).</li>
            <li>Message your bot once, then get your chat id from @userinfobot.</li>
            <li>
              Add <code>TELEGRAM_OWNER_CHAT_ID</code> in Project Settings → Secrets.
            </li>
          </ol>

          <p>Tier Pass review on this page keeps working without Telegram.</p>
        </div>
      )}

      {s && configured && (
        <dl className="grid gap-2 text-xs sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Bot</dt>
            <dd className="break-all">
              {s.bot_username ? `@${s.bot_username}` : "Token rejected"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Owner chat</dt>
            <dd>{s.chat_id_masked || "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Webhook</dt>
            <dd>{wh?.registered ? "Registered" : "Not registered"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Pending updates</dt>
            <dd>{wh?.pending_update_count ?? 0}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">Registered URL</dt>
            <dd className="break-all">{wh?.url ?? "—"}</dd>
          </div>
          {wh?.last_error_message ? (
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">Last error</dt>
              <dd className="break-words text-red-300">
                {wh.last_error_message}
                {wh.last_error_date ? ` · ${fmtDateTime(wh.last_error_date)}` : ""}
              </dd>
            </div>
          ) : null}
        </dl>
      )}

      {s && !s.public_url_ok && (
        <p className="rounded-xl border border-border/60 p-3 text-xs text-muted-foreground">
          No canonical public URL is configured, so nothing is registered automatically. Set{" "}
          <code>PUBLIC_APP_URL</code> in Project Settings → Secrets to your production origin. The
          callback URL to register is <code className="break-all">{s.suggested_callback_url}</code>.
        </p>
      )}

      {s?.public_url_ok && (
        <p className="text-xs text-muted-foreground">
          Callback URL: <code className="break-all">{s.expected_callback_url}</code>
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!configured || !s?.public_url_ok || register.isPending}
          onClick={() => register.mutate()}
          className="min-h-10 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {register.isPending ? "Registering…" : "Register webhook"}
        </button>
        <button
          type="button"
          disabled={!configured}
          onClick={() => void status.refetch()}
          className="min-h-10 rounded-lg border border-border/60 px-3 text-sm disabled:opacity-50"
        >
          Re-check status
        </button>
        {!confirming ? (
          <button
            type="button"
            disabled={!configured}
            onClick={() => setConfirming(true)}
            className="min-h-10 rounded-lg border border-border/60 px-3 text-sm disabled:opacity-50"
          >
            Send test notification
          </button>
        ) : (
          <span className="flex flex-wrap items-center gap-2 text-xs">
            Send a generic test message to the owner chat?
            <button
              type="button"
              disabled={test.isPending}
              onClick={() => test.mutate()}
              className="min-h-10 rounded-lg bg-primary px-3 font-medium text-primary-foreground disabled:opacity-50"
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="min-h-10 rounded-lg border border-border/60 px-3"
            >
              Cancel
            </button>
          </span>
        )}
      </div>

      {audit.data?.length ? (
        <div>
          <h3 className="mb-1 text-xs font-medium text-muted-foreground">Recent setup activity</h3>
          <ul className="space-y-1 text-[11px] text-muted-foreground">
            {audit.data.map((a) => (
              <li key={a.id} className="break-words">
                {fmtDateTime(a.created_at)} · {a.action} · {a.outcome}
                {a.detail ? ` · ${a.detail}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
