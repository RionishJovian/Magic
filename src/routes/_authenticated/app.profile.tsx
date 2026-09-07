import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { setSelectedSite } from "@/hooks/useSelectedSite";
import { markIntentionalSignOut } from "@/lib/session-signout";
import {
  getProfile,
  updateDisplayName,
  changePassword,
  updateLanguage,
  purchaseWebfigUnlockKey,
  purchaseResellerAddKey,
  purchaseRouterUnlockKey,
} from "@/lib/profile.functions";
import { fmtDateTime } from "@/lib/time";
import { InstallAppCard } from "@/components/InstallAppCard";
import { DevBadge } from "@/components/DevBadge";
import { VerifiedAgentBadge } from "@/components/VerifiedAgentBadge";
import { MagicCoinIcon } from "@/components/MagicCoinIcon";
import { fmtMagicCoins } from "@/lib/magic-coins";
import { canLaunchWebfig } from "@/lib/webfig-access";
import { canManageResellerInventory } from "@/lib/reseller-operation-access";
import {
  ACCOUNT_RANKS,
  DEVELOPER_BLURB,
  ROLE_LABEL,
  resolveAccountRank,
} from "@/lib/product-terminology";
import { LANGUAGES, isLanguage, useLanguage, useT, type LanguageCode } from "@/lib/i18n";
import { toErrorMessage } from "@/lib/error-message";
import { PASSWORD_MIN_LENGTH, PASSWORD_POLICY_MESSAGE } from "@/lib/password-policy";

export const Route = createFileRoute("/_authenticated/app/profile")({
  head: () => ({
    meta: [
      { title: "Profile — MikroTik Hotspot Admin" },
      {
        name: "description",
        content: "Your MikroTik Magic account: display name, password, role, expiry and sign out.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ProfilePage,
});

const ROLE_INFO: Record<string, { label: string; blurb: string; tone: string }> = {
  developer: {
    label: ROLE_LABEL.dev,
    blurb: DEVELOPER_BLURB,
    tone: "border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-800 dark:text-fuchsia-200",
  },
  primary: {
    label: ROLE_LABEL.primary,
    blurb: ACCOUNT_RANKS[1]!.blurb,
    tone: "border-violet-500/40 bg-violet-500/10 text-violet-800 dark:text-violet-200",
  },
  user: {
    label: ROLE_LABEL.user,
    blurb: ACCOUNT_RANKS[2]!.blurb,
    tone: "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
  },
  agent: {
    label: "Verified Agent",
    blurb: ACCOUNT_RANKS[3]!.blurb,
    tone: "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
  },
  expired: {
    label: ROLE_LABEL.expired,
    blurb: ACCOUNT_RANKS[4]!.blurb,
    tone: "border-red-500/40 bg-red-500/10 text-red-800 dark:text-red-200",
  },
  trial: {
    label: ROLE_LABEL.trial,
    blurb: ACCOUNT_RANKS[5]!.blurb,
    tone: "border-sky-500/40 bg-sky-500/10 text-sky-800 dark:text-sky-200",
  },
  read_only: {
    label: "Read only",
    blurb: "Can view dashboards but cannot make changes.",
    tone: "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200",
  },
  site_manager: {
    label: "Site manager",
    blurb: "Manages the devices and vouchers of assigned sites.",
    tone: "border-cyan-500/40 bg-cyan-500/10 text-cyan-800 dark:text-cyan-200",
  },
};

function Card({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="glass-panel rounded-2xl p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      {desc && <p className="mt-1 text-xs text-muted-foreground">{desc}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function ProfilePage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const fetchProfile = useServerFn(getProfile);
  const saveName = useServerFn(updateDisplayName);
  const savePassword = useServerFn(changePassword);
  const saveLanguage = useServerFn(updateLanguage);
  const buyWebfigKey = useServerFn(purchaseWebfigUnlockKey);
  const buyResellerAddKey = useServerFn(purchaseResellerAddKey);
  const buyRouterUnlockKey = useServerFn(purchaseRouterUnlockKey);
  const t = useT();
  const { lang, setLang, hydrateFromServer } = useLanguage();

  const profile = useQuery({ queryKey: ["profile"], queryFn: () => fetchProfile() });

  const [name, setName] = useState("");
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });

  useEffect(() => {
    if (profile.data?.display_name) setName(profile.data.display_name);
  }, [profile.data?.display_name]);

  // Account-level language wins only when this device has no local choice yet.
  useEffect(() => {
    const remote = profile.data?.language;
    if (isLanguage(remote)) hydrateFromServer(remote);
  }, [profile.data?.language, hydrateFromServer]);

  const langMut = useMutation({
    mutationFn: (l: LanguageCode) => saveLanguage({ data: { language: l } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile"] }),
    onError: (e: Error) => toast.error(toErrorMessage(e)),
  });

  const pickLanguage = (l: LanguageCode) => {
    setLang(l);
    langMut.mutate(l);
  };

  const nameLocked = Boolean(profile.data?.display_name_changed_at);

  const nameMut = useMutation({
    mutationFn: (v: string) => saveName({ data: { display_name: v } }),
    onSuccess: () => {
      toast.success("Display name updated");
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (e: Error) => toast.error(toErrorMessage(e)),
  });

  const pwMut = useMutation({
    mutationFn: () =>
      savePassword({
        data: { current_password: pw.current, new_password: pw.next, confirm_password: pw.confirm },
      }),
    onSuccess: () => {
      toast.success("Password changed");
      setPw({ current: "", next: "", confirm: "" });
    },
    onError: (e: Error) => toast.error(toErrorMessage(e)),
  });

  const webfigKeyMut = useMutation({
    mutationFn: () => buyWebfigKey(),
    onSuccess: (result) => {
      toast.success(`WebFig unlocked until ${fmtDateTime(result.expires_at)}.`);
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["routers"] });
    },
    onError: (e: Error) => toast.error(toErrorMessage(e)),
  });
  const resellerAddKeyMut = useMutation({
    mutationFn: () => buyResellerAddKey(),
    onSuccess: (result) => {
      toast.success(`Add reseller key ready until ${fmtDateTime(result.expires_at)}.`);
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["owner-operations"] });
    },
    onError: (e: Error) => toast.error(toErrorMessage(e)),
  });
  const routerUnlockKeyMut = useMutation({
    mutationFn: () => buyRouterUnlockKey(),
    onSuccess: (result) => {
      toast.success(`Router key ready until ${fmtDateTime(result.expires_at)}.`);
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["routers"] });
    },
    onError: (e: Error) => toast.error(toErrorMessage(e)),
  });

  async function signOut() {
    markIntentionalSignOut();
    setSelectedSite(null);
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const roles = profile.data?.roles ?? [];
  const isPlatformAdmin = profile.data?.isPlatformAdmin ?? false;
  const account = profile.data?.account;
  const rankKey = resolveAccountRank({
    roles,
    isPlatformAdmin,
    tier: account?.tier,
    expired: account?.expired,
    never_expires: account?.never_expires,
    trial: account?.trial,
  });
  const primary = rankKey;
  const info = ROLE_INFO[primary] ?? ROLE_INFO.user!;
  const neverExpires = isPlatformAdmin || account?.never_expires === true;
  const webfigKeyRequired = !canLaunchWebfig(roles, isPlatformAdmin);
  const webfigKey = profile.data?.webfig_key;
  const resellerAddKeyRequired = !canManageResellerInventory(roles, isPlatformAdmin);
  const resellerAddKey = profile.data?.reseller_add_key;
  const routerUnlockKeyRequired = !canManageResellerInventory(roles, isPlatformAdmin);
  const routerUnlockKey = profile.data?.router_unlock_key;
  const walletBalance = Number(profile.data?.wallet?.balance ?? 0);

  const expiresAt = profile.data?.expires_at ? new Date(profile.data.expires_at) : null;
  const daysLeft = expiresAt ? Math.ceil((expiresAt.getTime() - Date.now()) / 86_400_000) : null;

  const inputCls =
    "w-full rounded-xl border border-[color:var(--glass-border)] bg-white/5 px-3 py-2 text-sm backdrop-blur-xl outline-none transition focus:border-primary/60 disabled:opacity-50";
  const btnCls =
    "rounded-full border border-[color:var(--glass-border)] bg-white/10 px-4 py-2 text-xs font-medium backdrop-blur-xl transition hover:border-primary/60 hover:text-primary hover:shadow-[0_0_20px_-6px_var(--color-primary)] active:scale-95 disabled:opacity-50";

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">{t.ui("Profile")}</h1>
        <p className="text-sm text-muted-foreground">
          {t.copy("Your account details, security and session.")}
        </p>
      </header>

      <InstallAppCard />

      <Card
        title="Language"
        desc={t.copy(
          "Choose the language used across MikroTik Magic. Navigation, section titles and explanatory text are translated. Action buttons, RouterOS commands and product names stay in English.",
        )}
      >
        <div className="flex flex-wrap gap-2">
          {LANGUAGES.map((l) => {
            const active = lang === l.code;
            return (
              <button
                key={l.code}
                type="button"
                onClick={() => pickLanguage(l.code)}
                disabled={langMut.isPending}
                aria-pressed={active}
                className={`rounded-full border px-4 py-2 text-xs font-medium backdrop-blur-xl transition active:scale-95 disabled:opacity-50 ${
                  active
                    ? "border-primary/60 bg-primary/15 text-primary"
                    : "border-[color:var(--glass-border)] bg-[color:var(--surface-tint)] hover:border-primary/60 hover:text-primary"
                }`}
              >
                {l.native}
                <span className="ml-2 text-[10px] uppercase tracking-wide opacity-60">
                  {l.code}
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      <Card title="Account">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Email</div>
            <div className="mt-1 truncate text-sm">{profile.data?.email ?? "…"}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Role</div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${info.tone}`}
              >
                {info.label}
              </span>
              {isPlatformAdmin ? <DevBadge /> : null}
              {primary === "agent" ? <VerifiedAgentBadge /> : null}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">{info.blurb}</p>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Account expires
            </div>
            {neverExpires ? (
              <div className="mt-1 text-sm text-emerald-300">Never expires</div>
            ) : primary === "expired" ? (
              <div className="mt-1 text-sm text-red-300">
                Expired — open the Services tab to renew with Monthly or Annual.
              </div>
            ) : expiresAt ? (
              <div className="mt-1 text-sm">
                {fmtDateTime(expiresAt)}
                <span
                  className={`ml-2 text-[11px] ${
                    (daysLeft ?? 0) <= 7 ? "text-amber-300" : "text-muted-foreground"
                  }`}
                >
                  {daysLeft} day{daysLeft === 1 ? "" : "s"} left
                </span>
              </div>
            ) : (
              <div className="mt-1 text-sm text-muted-foreground">—</div>
            )}
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Tier</div>
            <div className="mt-1 text-sm capitalize">{profile.data?.account?.tier ?? "trial"}</div>
            <p className="mt-1 break-words text-[11px] text-muted-foreground">
              Device quota: {profile.data?.account?.quota.routers ?? 1} router,{" "}
              {profile.data?.account?.quota.sites ?? 3} sites,{" "}
              {profile.data?.account?.quota.controllers ?? 15} optional AP controller slots.
            </p>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Member since
            </div>
            <div className="mt-1 text-sm">
              {profile.data?.created_at ? fmtDateTime(profile.data.created_at) : "—"}
            </div>
          </div>
        </div>
      </Card>

      <Card
        title="Magic Coin wallet"
        desc="1 Magic Coin = 1,000 MMK. Wallet payments stay pending until the service reviewer approves them."
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <MagicCoinIcon className="h-11 w-11 shrink-0" />
            <div>
              <p className="text-2xl font-semibold text-primary">
                {fmtMagicCoins(Number(profile.data?.wallet?.balance ?? 0))} Magic Coins
              </p>
              <p className="text-xs text-muted-foreground">
                Value: {Number(profile.data?.wallet?.mmk_value ?? 0).toLocaleString()} MMK
              </p>
            </div>
          </div>
          <p className="max-w-sm text-xs text-muted-foreground">
            Earned agent commissions and service payments are recorded permanently. A refunded
            service returns its coins automatically.
          </p>
        </div>
        <div className="mt-5 rounded-2xl border border-amber-300/35 bg-amber-300/5 p-4 shadow-[0_0_32px_-22px_rgba(251,191,36,.75)]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <img
                src="/magic-keys/inv-hub-misc-key.png"
                width={64}
                height={64}
                alt="Inv hub misc key"
                className="h-12 w-12 shrink-0 rounded-lg object-contain"
              />
              <div>
                <p className="text-sm font-semibold">Inv hub misc key</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Key ID 1000 · Unlock the WebFig · 12 hours
                </p>
                <p className="mt-1 text-[11px] font-medium text-amber-200">
                  Account bound · cannot be transferred
                </p>
              </div>
            </div>
            {webfigKeyRequired ? (
              webfigKey?.active ? (
                <div className="text-right text-xs">
                  <p className="font-semibold text-emerald-300">WebFig unlocked</p>
                  <p className="mt-1 text-muted-foreground">
                    Until {webfigKey.expires_at ? fmtDateTime(webfigKey.expires_at) : "—"}
                  </p>
                </div>
              ) : (
                <button
                  type="button"
                  className={btnCls}
                  onClick={() => webfigKeyMut.mutate()}
                  disabled={webfigKeyMut.isPending || walletBalance < 5}
                >
                  {webfigKeyMut.isPending ? "Unlocking…" : "Unlock WebFig · 5 Magic Coins"}
                </button>
              )
            ) : (
              <p className="text-xs font-medium text-emerald-300">
                Included with this account role
              </p>
            )}
          </div>
          {webfigKeyRequired && !webfigKey?.active && walletBalance < 5 && (
            <p className="mt-3 text-xs text-amber-200">
              You need {fmtMagicCoins(5 - walletBalance)} more Magic Coins to purchase this key.
            </p>
          )}
        </div>
        <div className="mt-4 rounded-2xl border border-amber-300/35 bg-amber-300/5 p-4 shadow-[0_0_32px_-22px_rgba(251,191,36,.75)]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <img
                src="/magic-keys/inv-reseller-misc-key.png"
                width={64}
                height={64}
                alt="Inv reseller misc key"
                className="h-12 w-12 shrink-0 rounded-lg object-contain"
              />
              <div>
                <p className="text-sm font-semibold">Inv reseller misc key</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Key ID 1001 · Unlock Add reseller ×1 · 30 days
                </p>
                <p className="mt-1 text-[11px] font-medium text-amber-200">
                  Account bound · cannot be transferred
                </p>
              </div>
            </div>
            {resellerAddKeyRequired ? (
              <div className="flex items-center gap-3">
                {Number(resellerAddKey?.active_count ?? 0) > 0 && (
                  <div className="text-right text-xs">
                    <p className="font-semibold text-emerald-300">
                      {resellerAddKey?.active_count} key
                      {resellerAddKey?.active_count === 1 ? "" : "s"} ready
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      First expires{" "}
                      {resellerAddKey?.expires_at ? fmtDateTime(resellerAddKey.expires_at) : "—"}
                    </p>
                  </div>
                )}
                <button
                  type="button"
                  className={btnCls}
                  onClick={() => resellerAddKeyMut.mutate()}
                  disabled={resellerAddKeyMut.isPending || walletBalance < 5}
                >
                  {resellerAddKeyMut.isPending
                    ? "Purchasing…"
                    : Number(resellerAddKey?.active_count ?? 0) > 0
                      ? "Buy another · 5 Magic Coins"
                      : "Unlock Add reseller · 5 Magic Coins"}
                </button>
              </div>
            ) : (
              <p className="text-xs font-medium text-emerald-300">
                Included with this account role
              </p>
            )}
          </div>
          {resellerAddKeyRequired && walletBalance < 5 && (
            <p className="mt-3 text-xs text-amber-200">
              You need {fmtMagicCoins(5 - walletBalance)} more Magic Coins to purchase this key.
            </p>
          )}
        </div>
        <div className="mt-4 rounded-2xl border border-violet-300/35 bg-violet-300/5 p-4 shadow-[0_0_32px_-22px_rgba(139,92,246,.75)]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <img
                src="/magic-keys/inv-router-misc-key.jpg"
                width={64}
                height={64}
                alt="Inv router misc key"
                className="h-12 w-12 shrink-0 rounded-lg object-contain"
              />
              <div>
                <p className="text-sm font-semibold">Inv router misc key</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Key ID 1003 · Unlock one additional router · 30 days
                </p>
                <p className="mt-1 text-[11px] font-medium text-violet-200">
                  Account bound · non-transferable · consumed only after router creation
                </p>
              </div>
            </div>
            {routerUnlockKeyRequired ? (
              <div className="flex items-center gap-3">
                {Number(routerUnlockKey?.active_count ?? 0) > 0 && (
                  <div className="text-right text-xs">
                    <p className="font-semibold text-emerald-300">Router key ready</p>
                    <p className="mt-1 text-muted-foreground">
                      Expires{" "}
                      {routerUnlockKey?.expires_at ? fmtDateTime(routerUnlockKey.expires_at) : "—"}
                    </p>
                  </div>
                )}
                <button
                  type="button"
                  className={btnCls}
                  onClick={() => routerUnlockKeyMut.mutate()}
                  disabled={
                    routerUnlockKeyMut.isPending ||
                    walletBalance < 30 ||
                    Number(routerUnlockKey?.active_count ?? 0) > 0
                  }
                >
                  {routerUnlockKeyMut.isPending ? "Purchasing…" : "Buy Router key · 30 Magic Coins"}
                </button>
              </div>
            ) : (
              <p className="text-xs font-medium text-emerald-300">
                Included with this account role
              </p>
            )}
          </div>
          {routerUnlockKeyRequired && walletBalance < 30 && (
            <p className="mt-3 text-xs text-amber-200">
              You need {fmtMagicCoins(30 - walletBalance)} more Magic Coins to purchase this key.
            </p>
          )}
        </div>
        {(profile.data?.wallet?.transactions ?? []).length > 0 && (
          <div className="mt-4 overflow-x-auto rounded-xl border border-[color:var(--glass-border)]">
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Activity</th>
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2 text-right">Change</th>
                  <th className="px-3 py-2 text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {(profile.data?.wallet?.transactions ?? []).map((transaction) => (
                  <tr
                    key={`${transaction.created_at}-${transaction.note}`}
                    className="border-t border-border/70"
                  >
                    <td className="max-w-sm px-3 py-2 text-xs">{transaction.note}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                      {fmtDateTime(transaction.created_at)}
                    </td>
                    <td
                      className={`px-3 py-2 text-right text-xs font-semibold ${
                        Number(transaction.delta) < 0 ? "text-red-300" : "text-emerald-300"
                      }`}
                    >
                      {Number(transaction.delta) > 0 ? "+" : ""}
                      {Number(transaction.delta).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right text-xs">
                      {Number(transaction.balance_after).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card
        title="Display name"
        desc={
          nameLocked
            ? "Display name already changed — contact your account holder to change it again."
            : "You can change your display name once. Choose carefully."
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <input
            className={`${inputCls} sm:max-w-xs`}
            value={name}
            disabled={nameLocked || nameMut.isPending}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your display name"
            aria-label="Display name"
          />
          <button
            className={btnCls}
            disabled={
              nameLocked ||
              nameMut.isPending ||
              name.trim().length < 2 ||
              name.trim() === (profile.data?.display_name ?? "")
            }
            onClick={() => nameMut.mutate(name.trim())}
          >
            {nameMut.isPending ? "Saving…" : "Save name"}
          </button>
        </div>
      </Card>

      <Card title="Change password" desc="Enter your current password, then the new one twice.">
        <form
          className="grid max-w-md gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (pw.next !== pw.confirm) {
              toast.error("New password and confirmation do not match.");
              return;
            }
            pwMut.mutate();
          }}
        >
          <input
            className={inputCls}
            type="password"
            autoComplete="current-password"
            placeholder="Current password"
            aria-label="Current password"
            value={pw.current}
            onChange={(e) => setPw({ ...pw, current: e.target.value })}
            required
          />
          <input
            className={inputCls}
            type="password"
            autoComplete="new-password"
            placeholder={PASSWORD_POLICY_MESSAGE}
            aria-label="New password"
            value={pw.next}
            onChange={(e) => setPw({ ...pw, next: e.target.value })}
            minLength={PASSWORD_MIN_LENGTH}
            pattern="(?=.*[A-Za-z])(?=.*[0-9]).{6,}"
            required
          />
          <input
            className={inputCls}
            type="password"
            autoComplete="new-password"
            placeholder="Confirm new password"
            aria-label="Confirm new password"
            value={pw.confirm}
            onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
            minLength={PASSWORD_MIN_LENGTH}
            pattern="(?=.*[A-Za-z])(?=.*[0-9]).{6,}"
            required
          />
          <div>
            <button className={btnCls} type="submit" disabled={pwMut.isPending}>
              {pwMut.isPending ? "Updating…" : "Update password"}
            </button>
          </div>
        </form>
      </Card>

      <Card title="Session" desc="Sign out of MikroTik Magic on this device.">
        <button
          onClick={signOut}
          className="rounded-full border border-red-400/40 bg-red-500/10 px-4 py-2 text-xs font-medium text-red-200 backdrop-blur-xl transition hover:border-red-400/70 hover:shadow-[0_0_20px_-6px_rgba(248,113,113,0.8)] active:scale-95"
        >
          Sign out
        </button>
      </Card>
    </div>
  );
}
