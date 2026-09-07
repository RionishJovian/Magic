import { LockKeyhole, Minus, Send, X } from "lucide-react";
import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClientOnlyFn, useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/lib/i18n";
import { toErrorMessage } from "@/lib/error-message";
import { getMagicDudeUnlockAccess, purchaseMagicDudeUnlock } from "@/lib/magic-dude.functions";
import { getVoucherPrintLayout } from "@/lib/voucher-print-layout.functions";
import type { VoucherPrintLayout } from "@/lib/voucher-print-layout";
import { MagicCoinIcon } from "./MagicCoinIcon";

type Message = { role: "user" | "assistant"; content: string };
type VoucherOption = { id: string; name?: string; label?: string; duration_label?: string | null; data_quota_mb?: number | null; price_mmk?: number | null; status?: string | null };
type CreatedVoucher = { code: string; profile: string; priceMmk?: number; expiresAt?: string | null };

const MAGIC_DUDE_AVATAR_SRC = "/magic-dude/magic-dude-boy-glasses.png";
const MAGIC_DUDE_BLINK_SRC = "/magic-dude/magic-dude-boy-glasses-blink.png";
const MAGIC_DUDE_WAVE_SRC = "/magic-dude/magic-dude-boy-glasses-wave.png";
const MAGIC_DUDE_WAND_SRC = "/magic-dude/magic-dude-boy-glasses-wand.png";

const suggestions = ["Check my hotspot", "Create vouchers", "Explain this warning"];

function unlockStatus(expiresAt: string | null | undefined) {
  if (!expiresAt) return "Online";
  const date = new Date(expiresAt);
  return Number.isNaN(date.getTime())
    ? "Online"
    : `Unlocked until ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

const printVoucherBatch = createClientOnlyFn(
  async (vouchers: CreatedVoucher[], layout: VoucherPrintLayout) => {
    const { printVoucherBatch: print } = await import("@/lib/voucher-print.client");
    return print(vouchers, layout);
  },
);

function MagicDudeAvatar({ size = "md" }: { size?: "sm" | "md" }) {
  return (
    <span
      className={`magic-dude-chat-avatar relative block shrink-0 overflow-hidden rounded-full border border-primary/50 bg-primary/15 ${size === "sm" ? "h-8 w-8" : "h-11 w-11"}`}
      aria-hidden="true"
    >
      <img
        src={MAGIC_DUDE_AVATAR_SRC}
        alt=""
        aria-hidden="true"
        draggable={false}
        className="magic-dude-chat-avatar-image absolute left-[-40%] top-[-18%] max-w-none select-none"
        style={{ width: "190%", height: "190%" }}
      />
      <img
        src={MAGIC_DUDE_BLINK_SRC}
        alt=""
        aria-hidden="true"
        draggable={false}
        className="magic-dude-chat-avatar-image magic-dude-chat-avatar-blink absolute left-[-40%] top-[-18%] max-w-none select-none"
        style={{ width: "190%", height: "190%" }}
      />
      <img
        src={MAGIC_DUDE_WAVE_SRC}
        alt=""
        aria-hidden="true"
        draggable={false}
        className="magic-dude-chat-avatar-image magic-dude-chat-avatar-wave absolute left-[-40%] top-[-18%] max-w-none select-none"
        style={{ width: "190%", height: "190%" }}
      />
      <img
        src={MAGIC_DUDE_WAND_SRC}
        alt=""
        aria-hidden="true"
        draggable={false}
        className="magic-dude-chat-avatar-image magic-dude-chat-avatar-wand absolute left-[-40%] top-[-18%] max-w-none select-none"
        style={{ width: "190%", height: "190%" }}
      />
    </span>
  );
}

export function MagicDudeChatPopup() {
  const { lang } = useLanguage();
  const queryClient = useQueryClient();
  const fetchPrintLayout = useServerFn(getVoucherPrintLayout);
  const fetchAccess = useServerFn(getMagicDudeUnlockAccess);
  const buyUnlock = useServerFn(purchaseMagicDudeUnlock);
  const [open, setOpen] = useState(false);
  const [confirmUnlock, setConfirmUnlock] = useState(false);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [voucherAction, setVoucherAction] = useState<{ routers: VoucherOption[]; plans: VoucherOption[] } | null>(null);
  const [voucherForm, setVoucherForm] = useState({ routerId: "", planId: "", count: "10" });
  const [voucherResult, setVoucherResult] = useState<string | null>(null);
  const [createdVouchers, setCreatedVouchers] = useState<CreatedVoucher[] | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Hi! I can help you understand your hotspot, guests, vouchers, or warnings.",
    },
  ]);
  const access = useQuery({
    queryKey: ["magic-dude-access"],
    queryFn: () => fetchAccess(),
    enabled: open,
    staleTime: 30_000,
  });
  const unlock = useMutation({
    mutationFn: () => buyUnlock(),
    onSuccess: () => {
      setConfirmUnlock(false);
      void queryClient.invalidateQueries({ queryKey: ["magic-dude-access"] });
    },
  });

  async function openVoucherAction() {
    if (pending || !access.data?.allowed) return;
    setPending(true);
    setVoucherResult(null);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Please sign in again to use Magic Dude.");
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ mode: "options" }),
      });
      const payload = (await response.json()) as { routers?: VoucherOption[]; plans?: VoucherOption[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not load voucher options.");
      const routers = payload.routers ?? [];
      const plans = (payload.plans ?? []).filter((plan) => plan.status !== "inactive");
      setVoucherAction({ routers, plans });
      setVoucherForm({ routerId: routers[0]?.id ?? "", planId: plans[0]?.id ?? "", count: "10" });
    } catch (error) {
      setMessages((current) => [...current, { role: "assistant", content: error instanceof Error ? error.message : "Please try again shortly." }]);
    } finally {
      setPending(false);
    }
  }

  async function createVouchers() {
    const count = Number(voucherForm.count);
    if (!voucherForm.routerId || !voucherForm.planId || !Number.isInteger(count) || count < 1 || count > 100 || pending) return;
    setPending(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Please sign in again to use Magic Dude.");
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ mode: "create", ...voucherForm, count, confirmation: true }),
      });
      const payload = (await response.json()) as { issued?: string[]; failed?: Array<{ code: string }>; error?: string; planLabel?: string; priceMmk?: number | null; expiresAt?: string | null };
      if (!response.ok) throw new Error(payload.error ?? "Could not create vouchers.");
      setVoucherResult(`${payload.issued?.length ?? 0} voucher${payload.issued?.length === 1 ? "" : "s"} created successfully.`);
      setCreatedVouchers((payload.issued ?? []).map((code) => ({ code, profile: payload.planLabel ?? "Voucher", priceMmk: payload.priceMmk ?? undefined, expiresAt: payload.expiresAt })));
      setVoucherAction(null);
      setMessages((current) => [...current, { role: "assistant", content: `${payload.issued?.length ?? 0} voucher codes are ready. Open Vouchers to review or print them.` }]);
    } catch (error) {
      setVoucherResult(error instanceof Error ? error.message : "Could not create vouchers.");
    } finally {
      setPending(false);
    }
  }

  async function printCreatedVouchers() {
    if (!createdVouchers?.length || pending) return;
    setPending(true);
    try {
      const layout = await fetchPrintLayout();
      await printVoucherBatch(createdVouchers, layout as VoucherPrintLayout);
    } catch (error) {
      setVoucherResult(error instanceof Error ? error.message : "Could not open the print dialog.");
    } finally {
      setPending(false);
    }
  }

  async function sendMessage(event?: FormEvent, suggested?: string) {
    event?.preventDefault();
    const content = (suggested ?? input).trim();
    if (!content || pending || !access.data?.allowed) return;
    setInput("");
    const nextMessages = [...messages, { role: "user" as const, content }];
    setMessages(nextMessages);
    if (/voucher|ဗောက်ချာ|代金券|凭证/i.test(content) && /create|generate|make|ထုတ်|ဖန်တီး|生成|创建/i.test(content)) {
      setMessages((current) => [...current, { role: "assistant", content: "I can prepare those vouchers. Choose the router, plan, and quantity below, then confirm the creation." }]);
      await openVoucherAction();
      return;
    }
    setPending(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Please sign in again to use Magic Dude.");
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messages: nextMessages.slice(-20), language: lang }),
      });
      const payload = (await response.json()) as { answer?: string; error?: string };
      if (!response.ok || !payload.answer) throw new Error(payload.error ?? "Magic Dude could not answer right now.");
      setMessages((current) => [...current, { role: "assistant", content: payload.answer! }]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        { role: "assistant", content: error instanceof Error ? error.message : "Please try again shortly." },
      ]);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+5.75rem)] z-50 pointer-events-none sm:inset-x-auto sm:bottom-24 sm:right-6">
      {open && (
        <section
          aria-label="Magic Dude chat"
          className="pointer-events-auto mb-3 w-full max-w-[23rem] overflow-hidden rounded-3xl border border-[color:var(--glass-border)] bg-[color:var(--glass-bg-strong)] text-foreground shadow-2xl shadow-black/40 ring-1 ring-white/10 backdrop-blur-2xl"
        >
          <header className="flex items-center justify-between border-b border-[color:var(--glass-border)] px-4 py-3">
            <div className="flex items-center gap-2">
              <MagicDudeAvatar size="sm" />
              <div>
                <h2 className="text-sm font-semibold">Magic Dude</h2>
                <p className="flex items-center gap-1 text-[11px] text-muted-foreground"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />{access.data?.allowed ? unlockStatus(access.data.expiresAt) : "Access check"}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" aria-label="Minimize Magic Dude" onClick={() => setOpen(false)} className="rounded-full p-2 text-muted-foreground hover:bg-primary/10 hover:text-foreground"><Minus className="h-4 w-4" aria-hidden /></button>
              <button type="button" aria-label="Close Magic Dude" onClick={() => setOpen(false)} className="rounded-full p-2 text-muted-foreground hover:bg-primary/10 hover:text-foreground"><X className="h-4 w-4" aria-hidden /></button>
            </div>
          </header>
          <div className="max-h-[min(48dvh,22rem)] space-y-3 overflow-y-auto px-4 py-3" aria-live="polite">
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={message.role === "user" ? "ml-8 rounded-2xl rounded-br-md bg-primary px-3 py-2 text-sm text-primary-foreground" : "mr-5 rounded-2xl rounded-bl-md bg-background/45 px-3 py-2 text-sm text-foreground"}>
                {message.content}
              </div>
            ))}
            {pending && <div className="mr-5 rounded-2xl bg-background/45 px-3 py-2 text-sm text-muted-foreground">Magic Dude is checking…</div>}
          </div>
          {access.isLoading && (
            <div className="border-t border-[color:var(--glass-border)] px-4 py-4 text-sm text-muted-foreground">
              Checking Magic Dude access…
            </div>
          )}
          {access.isError && (
            <div className="border-t border-[color:var(--glass-border)] px-4 py-4 text-sm text-amber-200">
              I couldn’t check your access yet. Please close and open me again.
              <button type="button" onClick={() => void access.refetch()} className="mt-2 block text-xs font-medium text-primary underline underline-offset-4">Try again</button>
            </div>
          )}
          {access.data && !access.data.allowed && (
            <div className="border-t border-[color:var(--glass-border)] px-4 py-4">
              <div className="flex items-start gap-3">
                <span className="rounded-2xl bg-primary/10 p-2 text-primary"><LockKeyhole className="h-5 w-5" aria-hidden /></span>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold">Magic Dude is resting</h3>
                  {access.data.purchaseEligible ? (
                    <>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">Unlock your friendly hotspot helper for 30 days with 5 Magic Coins.</p>
                      <div className="mt-3 flex items-center justify-between rounded-2xl border border-[color:var(--glass-border)] bg-background/25 px-3 py-2 text-xs">
                        <span className="flex items-center gap-1.5 text-muted-foreground"><MagicCoinIcon className="h-4 w-4" /> Your balance</span>
                        <strong className="text-foreground">{access.data.balance ?? 0} coins</strong>
                      </div>
                      {!confirmUnlock ? (
                        <button type="button" onClick={() => setConfirmUnlock(true)} className="mt-3 w-full rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90">Unlock for 30 days · 5 coins</button>
                      ) : (
                        <div className="mt-3 rounded-2xl border border-primary/30 bg-primary/5 p-3">
                          <p className="text-xs text-muted-foreground">Spend 5 Magic Coins now?</p>
                          <div className="mt-2 flex gap-2">
                            <button type="button" onClick={() => setConfirmUnlock(false)} className="flex-1 rounded-xl border border-[color:var(--glass-border)] px-3 py-2 text-xs">Cancel</button>
                            <button type="button" disabled={unlock.isPending} onClick={() => unlock.mutate()} className="flex-1 rounded-xl bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50">{unlock.isPending ? "Unlocking…" : "Confirm unlock"}</button>
                          </div>
                        </div>
                      )}
                      {(access.data.balance ?? 0) < 5 && <a href="/app/services" className="mt-2 block text-center text-xs text-primary underline underline-offset-4">Get Magic Coins in Services</a>}
                    </>
                  ) : (
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">Magic Dude unlocks for active User accounts. Staff accounts have access automatically.</p>
                  )}
                  {unlock.isError && (
                    <div className="mt-2 space-y-1 text-xs text-rose-300">
                      <p>{toErrorMessage(unlock.error, "Could not unlock Magic Dude.")}</p>
                      {toErrorMessage(unlock.error, "") === "You don't have sufficient coins" && (
                        <a href="/app/services" className="block text-primary underline underline-offset-4">Open Services to buy Magic Coins</a>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          {access.data?.allowed && messages.length === 1 && (
            <div className="flex gap-2 overflow-x-auto px-4 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {suggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => suggestion === "Create vouchers" ? void openVoucherAction() : void sendMessage(undefined, suggestion)} className="shrink-0 rounded-full border border-[color:var(--glass-border)] px-3 py-1.5 text-xs text-muted-foreground hover:border-primary/50 hover:text-primary">{suggestion}</button>)}
            </div>
          )}
          {access.data?.allowed && voucherAction && (
            <div className="space-y-2 border-t border-[color:var(--glass-border)] px-4 py-3">
              <p className="text-xs font-medium text-muted-foreground">Choose what Magic Dude should create</p>
              <select aria-label="Voucher router" value={voucherForm.routerId} onChange={(event) => setVoucherForm((form) => ({ ...form, routerId: event.target.value }))} className="w-full rounded-xl border border-[color:var(--glass-border)] bg-background/30 px-3 py-2 text-sm">
                {voucherAction.routers.map((router) => <option key={router.id} value={router.id}>{router.name}</option>)}
              </select>
              <select aria-label="Voucher plan" value={voucherForm.planId} onChange={(event) => setVoucherForm((form) => ({ ...form, planId: event.target.value }))} className="w-full rounded-xl border border-[color:var(--glass-border)] bg-background/30 px-3 py-2 text-sm">
                {voucherAction.plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.label}</option>)}
              </select>
              <input aria-label="Voucher quantity" type="number" min="1" max="100" value={voucherForm.count} onChange={(event) => setVoucherForm((form) => ({ ...form, count: event.target.value }))} className="w-full rounded-xl border border-[color:var(--glass-border)] bg-background/30 px-3 py-2 text-sm" />
              <p className="text-[11px] text-muted-foreground">Magic Dude will create these only after you confirm.</p>
              <button type="button" disabled={pending || !voucherAction.routers.length || !voucherAction.plans.length} onClick={() => void createVouchers()} className="w-full rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">{pending ? "Creating…" : "Confirm and create vouchers"}</button>
              {voucherResult && <p className="text-xs text-danger">{voucherResult}</p>}
            </div>
          )}
          {access.data?.allowed && createdVouchers?.length ? (
            <div className="space-y-2 border-t border-[color:var(--glass-border)] px-4 py-3">
              {voucherResult && <p className="text-xs text-emerald-400">{voucherResult}</p>}
              <button type="button" disabled={pending} onClick={() => void printCreatedVouchers()} className="w-full rounded-xl border border-[color:var(--glass-border)] px-3 py-2 text-sm font-medium hover:border-primary hover:text-primary disabled:opacity-50">{pending ? "Preparing print…" : "Print these vouchers"}</button>
            </div>
          ) : null}
          {access.data?.allowed && <form onSubmit={(event) => void sendMessage(event)} className="flex gap-2 border-t border-[color:var(--glass-border)] p-3">
            <input value={input} onChange={(event) => setInput(event.target.value)} disabled={pending} placeholder="Ask Magic Dude…" aria-label="Ask Magic Dude" className="min-w-0 flex-1 rounded-full border border-[color:var(--glass-border)] bg-background/30 px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-primary" />
            <button type="submit" disabled={!input.trim() || pending} aria-label="Send message" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition hover:opacity-90 disabled:opacity-50"><Send className="h-4 w-4" aria-hidden /></button>
          </form>}
        </section>
      )}
      {!open && (
        <button type="button" aria-label="Open Magic Dude" onClick={() => setOpen(true)} className="pointer-events-auto ml-auto flex h-14 w-14 items-center justify-center rounded-full border border-primary/50 bg-[color:var(--glass-bg-strong)] text-primary shadow-2xl shadow-black/40 ring-1 ring-white/10 backdrop-blur-2xl transition hover:-translate-y-1 hover:bg-primary/15 active:scale-95">
          <MagicDudeAvatar />
        </button>
      )}
    </div>
  );
}
