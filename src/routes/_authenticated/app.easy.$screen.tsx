import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CircleHelp,
  Database,
  Globe2,
  LoaderCircle,
  MonitorSmartphone,
  Network,
  Printer,
  RefreshCw,
  Router,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Ticket,
  UsersRound,
  Wifi,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import {
  getPortalSettings,
  publishPortalToRouter,
  savePortalSettings,
} from "@/lib/portal.functions";
import { getShieldStatus, setShield } from "@/lib/shield.functions";
import { listRouters } from "@/lib/routers.functions";
import { isVirtualRouter } from "@/lib/test-router";
import { applyHotspotSetupFn, getWifiHotspotProbe } from "@/lib/wifi-hotspot.functions";
import { getSnapshot } from "@/lib/mikrotik.functions";
import { listConnectors } from "@/lib/connectors.functions";
import {
  EasyModeBottomNav as SharedEasyModeBottomNav,
  EasyModeHeader,
} from "@/components/EasyModeBottomNav";
import { useT } from "@/lib/i18n";
import { easyGuestEmptyState, easyRouterState } from "@/lib/easy-mode-ui";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PlansPanel } from "@/components/PlansPanel";
import { VoucherLayoutsPage } from "@/routes/_authenticated/app.voucher-layouts";
import { expectedConfirmation, normalizeConfirmation } from "@/lib/test-router";

export const Route = createFileRoute("/_authenticated/app/easy/$screen")({
  head: () => ({
    meta: [{ title: "Easy Mode — MikroTik Magic" }, { name: "robots", content: "noindex" }],
  }),
  component: EasyScreen,
});

const glass = "easy-card rounded-[1.75rem] border shadow-xl shadow-black/20";

function ConnectRouterLive() {
  const t = useT();
  const fetchRouters = useServerFn(listRouters);
  const fetchConnectors = useServerFn(listConnectors);
  const routers = useQuery({ queryKey: ["easy-connect-routers"], queryFn: () => fetchRouters() });
  const connectors = useQuery({
    queryKey: ["easy-connect-connectors"],
    queryFn: () => fetchConnectors(),
  });
  const router = (routers.data ?? []).find((item) => !isVirtualRouter(item));
  const connector = (connectors.data ?? [])[0];
  return (
    <>
      <section className={`${glass} p-5`}>
        <div className="flex items-center gap-3">
          <Router className="h-10 w-10 text-primary" aria-hidden />
          <div>
            <span className="text-xs text-primary">{t.ui("Recommended · Magic Hub")}</span>
            <h2 className="font-semibold">{t.ui("Connect your hotspot securely")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t.ui("Use the production setup wizard to save credentials and test the connection.")}
            </p>
          </div>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          {t.ui("Router status")}:{" "}
          <span className="text-primary">{router ? router.name : t.ui("Not connected")}</span>
        </p>
        <Link
          to="/app/quick-setup"
          className="mt-5 block w-full rounded-full bg-primary px-4 py-3 text-center font-semibold text-primary-foreground"
        >
          {t.ui("Open Magic Hub setup")}
        </Link>
      </section>
      <Link to="/app/connectors" className={`${glass} flex items-center gap-3 p-4`}>
        <Network className="h-8 w-8 text-primary" aria-hidden />
        <span className="flex-1">
          <b className="block">{t.ui("Use Local Connector")}</b>
          <span className="text-xs text-muted-foreground">
            {connector
              ? t.ui("A connector is available")
              : t.ui("Pair a connector for private networks")}
          </span>
        </span>
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
      <Row
        icon={ShieldCheck}
        title={t.ui("Router password stays protected")}
        detail={t.ui("Credentials are encrypted and never displayed after saving.")}
      />
    </>
  );
}

function EasyScreen() {
  const { screen } = useParams({ from: "/_authenticated/app/easy/$screen" });
  const t = useT();
  const page = pages[screen];
  if (!page) {
    return (
      <div className="easy-mode-root min-h-[100dvh] bg-transparent pb-28 text-foreground">
        <EasyModeHeader
          title={t.ui("Page not found")}
          subtitle={t.ui("This Easy Mode page is not available.")}
          back
        />
        <main className="mx-auto max-w-2xl px-4 py-8 text-center sm:px-6">
          <Link
            to="/app/easy"
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 font-semibold text-primary-foreground"
          >
            {t.ui("Back to Easy Mode")}
          </Link>
        </main>
        <SharedEasyModeBottomNav active="Home" />
      </div>
    );
  }
  const PageContent = page.component;
  return (
    <div className="easy-mode-root min-h-[100dvh] bg-transparent pb-28 text-foreground">
      <EasyModeHeader title={t.ui(page.title)} subtitle={t.ui(page.subtitle)} back />
      <main className="mx-auto grid max-w-2xl gap-4 px-4 py-5 sm:px-6 sm:py-7">
        <PageContent />
      </main>
      <SharedEasyModeBottomNav active={page.active} />
    </div>
  );
}

type Page = { title: string; subtitle: string; active: string; component: () => ReactNode };
const easyPath = (screen: string) => `/app/easy/${screen}` as never;
const pages: Record<string, Page> = {
  "voucher-plans": {
    title: "Voucher plans",
    subtitle: "Choose what guests can buy",
    active: "Sell",
    component: VoucherPlans,
  },
  "print-slips": {
    title: "Print slips",
    subtitle: "Choose how your vouchers look on paper",
    active: "Sell",
    component: PrintSlips,
  },
  guests: {
    title: "Guests",
    subtitle: "See who is using your hotspot",
    active: "Guests",
    component: GuestsLive,
  },
  "guest-portal": {
    title: "Guest portal",
    subtitle: "Choose what your guests see",
    active: "Setup",
    component: GuestPortal,
  },
  "protect-hotspot": {
    title: "Protect hotspot",
    subtitle: "Keep unpaid guests out",
    active: "Setup",
    component: ProtectHotspot,
  },
  setup: {
    title: "Setup",
    subtitle: "Get your hotspot ready",
    active: "Setup",
    component: SetupLive,
  },
  "connect-router": {
    title: "Connect your router",
    subtitle: "Bring your hotspot online",
    active: "Setup",
    component: ConnectRouterLive,
  },
};

function Row({
  icon: Icon,
  title,
  detail,
  status,
}: {
  icon: LucideIcon;
  title: string;
  detail: string;
  status?: string;
}) {
  const t = useT();
  return (
    <div className={`${glass} flex items-center gap-3 p-4`}>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <b className="block text-sm">{t.ui(title)}</b>
        <span className="block text-xs text-muted-foreground">{t.ui(detail)}</span>
      </span>
      {status && (
        <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
          {t.ui(status)}
        </span>
      )}
    </div>
  );
}
function VoucherPlans() {
  return (
    <>
      <section className={`${glass} p-5`}>
        <div className="flex items-start gap-3">
          <Ticket className="h-7 w-7 text-primary" aria-hidden />
          <div>
            <h2 className="font-semibold">Choose a plan when you sell</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              The Sell screen shows your active time and data plans with the real price and
              allowance before you generate codes.
            </p>
          </div>
        </div>
        <Link
          to="/app/easy/vouchers"
          className="mt-4 flex items-center justify-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground"
        >
          Create voucher codes <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </section>
      <PlansPanel />
      <section className={`${glass} p-4`}>
        <div className="flex items-center gap-3">
          <Database className="h-5 w-5 text-primary" aria-hidden />
          <div>
            <p className="text-sm font-medium">Time and data plans supported</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Guests can buy a duration plan or a data allowance, depending on what you offer.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
function PrintSlips() {
  return (
    <>
      <section className={`${glass} p-5`}>
        <div className="flex items-start gap-3">
          <Printer className="h-7 w-7 text-primary" aria-hidden />
          <div>
            <h2 className="font-semibold">Print a voucher batch</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Use the real batch after generation and choose a layout that matches your printer.
            </p>
          </div>
        </div>
        <Link
          to="/app/easy/vouchers"
          className="mt-4 flex items-center justify-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground"
        >
          Create and print vouchers <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </section>
      <VoucherLayoutsPage embedded />
      <section className={`${glass} flex items-center gap-3 p-4`}>
        <Check className="h-6 w-6 text-primary" aria-hidden />
        <div>
          <p className="text-sm font-medium">Print only the voucher layout</p>
          <p className="mt-1 text-xs text-muted-foreground">
            The selected voucher layout should be sent to the browser printer, not the entire
            dashboard.
          </p>
        </div>
      </section>
    </>
  );
}
function GuestPortal() {
  const qc = useQueryClient();
  const fetchSettings = useServerFn(getPortalSettings);
  const saveSettings = useServerFn(savePortalSettings);
  const publishPortal = useServerFn(publishPortalToRouter);
  const fetchRouters = useServerFn(listRouters);
  const settings = useQuery({ queryKey: ["easy-portal-settings"], queryFn: () => fetchSettings() });
  const routers = useQuery({ queryKey: ["easy-portal-routers"], queryFn: () => fetchRouters() });
  const [businessName, setBusinessName] = useState<string | null>(null);
  const [welcomeText, setWelcomeText] = useState<string | null>(null);
  const [terms, setTerms] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState<{ text: string; tone: "success" | "error" } | null>(null);
  const row = settings.data as Record<string, unknown> | undefined;
  const name = businessName ?? String(row?.business_name ?? "");
  const welcome = welcomeText ?? String(row?.welcome_text ?? "");
  const currentTerms = terms ?? String(row?.terms ?? "");
  const router = (routers.data ?? []).find((item) => !isVirtualRouter(item));
  const expected = router ? expectedConfirmation("deploy", "production", router.name) : "";

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      await saveSettings({
        data: {
          business_name: name.trim() || "Wi-Fi hotspot",
          welcome_text: welcome.trim() || "Enter your voucher code to get online.",
          terms: currentTerms.trim(),
          primary_hex: String(row?.primary_hex ?? "#ffb547"),
          glass_tint_hex: String(row?.glass_tint_hex ?? "#7ad0ff"),
          guest_mode: String(row?.guest_mode ?? "voucher_only") as "voucher_only",
        },
      });
      await qc.invalidateQueries({ queryKey: ["easy-portal-settings"] });
      setMessage({ text: "Guest portal settings saved.", tone: "success" });
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : "Could not save portal settings.",
        tone: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    if (!router?.id || normalizeConfirmation(confirmation) !== normalizeConfirmation(expected))
      return;
    setPublishing(true);
    setMessage(null);
    try {
      const result = await publishPortal({
        data: { routerIds: [router.id], confirmation, forceRepublish: false },
      });
      const target = result.results[0];
      if (!target?.ok) throw new Error(target?.error || "Portal publish failed.");
      setMessage({
        text: target.skipped
          ? "The live portal already matches your saved settings."
          : "Guest portal published successfully.",
        tone: "success",
      });
      setConfirmation("");
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : "Could not publish the guest portal.",
        tone: "error",
      });
    } finally {
      setPublishing(false);
    }
  }

  return (
    <>
      <section className={`${glass} flex items-center gap-4 p-4`}>
        <div className="h-24 w-20 rounded-2xl border border-border bg-[#061a20] p-2 text-center text-xs text-white shadow-inner">
          <Sparkles className="mx-auto h-5 w-5 text-primary" aria-hidden />
          <b className="mt-2 block">Welcome!</b>
          <span className="mt-3 block rounded bg-white/10 p-1">Enter voucher</span>
        </div>
        <div>
          <p className="text-lg font-semibold text-primary">● Portal settings</p>
          <p className="mt-1 text-sm text-muted-foreground">
            These values are saved to your hotspot portal.
          </p>
        </div>
      </section>
      <label className="grid gap-2 text-sm">
        <span>Business name</span>
        <Input
          value={name}
          onChange={(event) => setBusinessName(event.target.value)}
          disabled={settings.isPending || saving}
          className="h-12 rounded-2xl"
        />
      </label>
      <label className="grid gap-2 text-sm">
        <span>Welcome message</span>
        <Textarea
          value={welcome}
          onChange={(event) => setWelcomeText(event.target.value)}
          disabled={settings.isPending || saving}
          className="min-h-24 rounded-2xl"
        />
      </label>
      <label className="grid gap-2 text-sm">
        <span>Guest terms</span>
        <Textarea
          value={currentTerms}
          onChange={(event) => setTerms(event.target.value)}
          disabled={settings.isPending || saving}
          className="min-h-20 rounded-2xl"
        />
      </label>
      <button
        type="button"
        onClick={() => void save()}
        disabled={settings.isPending || saving}
        className="rounded-full bg-primary px-4 py-3 font-semibold text-primary-foreground transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? "Saving portal settings…" : "Save portal settings"}
      </button>
      {message && (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={`rounded-2xl border p-3 text-sm ${message.tone === "error" ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-primary/25 bg-primary/10 text-primary"}`}
        >
          {message.text}
        </p>
      )}
      <section className={`${glass} grid gap-3 p-4`}>
        <div>
          <h2 className="font-semibold">Publish to your hotspot</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {router
              ? `Target: ${router.name}. Type the confirmation below before the router is changed.`
              : "Connect a physical router before publishing the portal."}
          </p>
        </div>
        {router && (
          <label className="grid gap-2 text-sm">
            <span>
              Type <code className="font-semibold text-primary">{expected}</code>
            </span>
            <Input
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              disabled={publishing}
            />
          </label>
        )}
        <button
          type="button"
          onClick={() => void publish()}
          disabled={
            !router ||
            publishing ||
            normalizeConfirmation(confirmation) !== normalizeConfirmation(expected)
          }
          className="rounded-full bg-primary px-4 py-3 font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          {publishing ? "Publishing portal…" : "Publish portal"}
        </button>
      </section>
      <Row
        icon={ShieldCheck}
        title="Voucher-only access"
        detail="Only guests with a valid voucher can connect"
        status="Protected"
      />
    </>
  );
}
function ProtectHotspot() {
  const t = useT();
  const fetchRouters = useServerFn(listRouters);
  const checkShield = useServerFn(getShieldStatus);
  const updateShield = useServerFn(setShield);
  const routers = useQuery({
    queryKey: ["easy-protection-routers"],
    queryFn: () => fetchRouters(),
  });
  const router = (routers.data ?? []).find((item) => !isVirtualRouter(item));
  const routerState = easyRouterState({
    isPending: routers.isPending,
    isError: routers.isError,
    routerName: router?.name,
  });
  const shield = useQuery({
    queryKey: ["easy-shield", router?.id],
    queryFn: () => checkShield({ data: { routerId: router!.id } }),
    enabled: Boolean(router?.id),
  });
  const [message, setMessage] = useState<string | null>(null);
  async function toggle() {
    if (!router?.id) return setMessage("Connect a physical router before changing protection.");
    try {
      const result = await updateShield({
        data: { routerId: router.id, enabled: !shield.data?.enabled },
      });
      await shield.refetch();
      setMessage(
        result.partial
          ? "Protection enabled with a partial warning."
          : `Protection ${result.enabled ? "enabled" : "disabled"}.`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update hotspot protection.");
    }
  }
  const enabled = shield.data?.enabled ?? false;
  return (
    <>
      <section className={`${glass} flex items-center gap-4 p-5`}>
        <ShieldCheck className="h-14 w-14 text-primary" aria-hidden />
        <div>
          <p className="text-lg font-semibold text-primary">
            {enabled ? "Protection is on" : "Protection is off"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Blocks common portal bypass and tunnel methods on your router.
          </p>
        </div>
      </section>
      <h2 className="text-lg font-semibold">Protection checks</h2>
      <Row
        icon={ShieldCheck}
        title="Voucher-only access"
        detail="Only valid guests can connect"
        status={enabled ? "Enabled" : "Not enabled"}
      />
      <Row
        icon={Globe2}
        title="Portal bypass check"
        detail="Unapproved access is blocked"
        status={enabled ? "Protected" : "Not checked"}
      />
      <Row
        icon={ShieldCheck}
        title="Encrypted tunnel ports"
        detail="Common VPN and encrypted DNS escape paths"
        status={enabled ? "Protected" : "Not checked"}
      />
      <section className={`${glass} border-amber-300/30 p-4`}>
        <h2 className="font-semibold text-amber-300">
          {routerState.state === "ready"
            ? `${t.ui("Protect")} ${routerState.label}`
            : t.ui(routerState.label)}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The change is applied only to Magic-managed firewall rules and can be reversed.
        </p>
        <button
          type="button"
          onClick={() => void toggle()}
          disabled={shield.isPending || routerState.state !== "ready"}
          className="mt-4 rounded-full border border-amber-300/40 px-4 py-2 text-sm text-amber-300 disabled:opacity-50"
        >
          {routerState.state === "loading"
            ? t.ui("Checking routers…")
            : enabled
              ? t.ui("Turn protection off")
              : t.ui("Run safety check and protect")}
        </button>
      </section>
      {(message || shield.data?.warning || shield.data?.error) && (
        <p
          role="status"
          className="rounded-2xl border border-primary/25 bg-primary/10 p-3 text-sm text-primary"
        >
          {message ?? shield.data?.warning ?? shield.data?.error}
        </p>
      )}
      <Link
        to="/app/manual"
        className="block rounded-[1.75rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <Row
          icon={CircleHelp}
          title="What does this mean?"
          detail="Learn how hotspot protection works"
          status="Read guide"
        />
      </Link>
    </>
  );
}
function SetupLive() {
  const t = useT();
  const fetchRouters = useServerFn(listRouters);
  const probe = useServerFn(getWifiHotspotProbe);
  const apply = useServerFn(applyHotspotSetupFn);
  const routers = useQuery({ queryKey: ["easy-setup-routers"], queryFn: () => fetchRouters() });
  const router = (routers.data ?? []).find((item) => !isVirtualRouter(item));
  const routerState = easyRouterState({
    isPending: routers.isPending,
    isError: routers.isError,
    routerName: router?.name,
  });
  const probeQuery = useQuery({
    queryKey: ["easy-wifi-probe", router?.id],
    queryFn: () => probe({ data: { routerId: router!.id } }),
    enabled: Boolean(router?.id),
  });
  const [ssid, setSsid] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [externalApConfirmed, setExternalApConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const currentSsid =
    ssid || probeQuery.data?.wifiInterfaces.find((item) => item.ssid)?.ssid || "Magic Wi-Fi";
  const bridge = probeQuery.data?.suggestedBridge ?? probeQuery.data?.bridges[0]?.name;
  // Boards without usable built-in radios must set up guest Wi-Fi through an
  // external access point plugged into LAN port(s).
  const lanPortMode = probeQuery.data?.defaultMode === "lan-port";
  const lanPortNames = (probeQuery.data?.etherPorts ?? []).map((port) => port.name);
  const availableBands = [
    ...new Set(
      (probeQuery.data?.wifiInterfaces ?? [])
        .filter((item) => !item.disabled && !item.masterInterface)
        .map((item) => item.band)
        .filter((band): band is "2.4" | "5" => band === "2.4" || band === "5"),
    ),
  ];
  async function saveWifiName() {
    if (!router?.id || !bridge)
      return setMessage("Connect a router with a usable bridge before changing Wi-Fi.");
    if (lanPortMode && lanPortNames.length === 0)
      return setMessage(
        "This router has no built-in Wi-Fi and no LAN ports were found for an external access point.",
      );
    if (lanPortMode && !externalApConfirmed)
      return setMessage("Confirm your access point is plugged into the LAN port(s) listed above.");
    setSaving(true);
    setMessage(null);
    try {
      const result = await apply({
        data: {
          routerId: router.id,
          mode: probeQuery.data?.defaultMode ?? "builtin-wifi",
          ssid: currentSsid,
          bridge,
          bands: availableBands,
          disableCapMode: false,
          ...(lanPortMode ? { lanPorts: lanPortNames, externalApConfirmed: true } : {}),
        },
      });
      setMessage(result.warnings?.[0] ?? "Wi-Fi name saved and applied.");
      await probeQuery.refetch();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not apply Wi-Fi setup.");
    } finally {
      setSaving(false);
    }
  }
  const ready = Boolean(probeQuery.data?.reachable && !probeQuery.data?.setupBlockedReason);
  const readinessLabel =
    routerState.state === "loading" || (routerState.state === "ready" && probeQuery.isPending)
      ? "Checking"
      : ready
        ? "Ready"
        : "Needs attention";
  const readinessDetail =
    routerState.state === "loading"
      ? "Checking your connected routers…"
      : routerState.state === "error"
        ? "We could not load your routers. Try again or open Advanced Mode."
        : routerState.state === "empty"
          ? "Connect a router before setting the Wi-Fi name."
          : probeQuery.isPending
            ? "Reading the current Hotspot and Wi-Fi setup…"
            : probeQuery.isError
              ? "We could not read this router. Open Connect router to test it."
              : (probeQuery.data?.setupBlockedReason ?? "The router is ready for Easy Mode setup.");
  return (
    <>
      <section className={`${glass} p-4`}>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Hotspot readiness</span>
          <b className="text-primary">{t.ui(readinessLabel)}</b>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
          <div className={`h-full rounded-full bg-primary ${ready ? "w-4/5" : "w-2/5"}`} />
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{t.ui(readinessDetail)}</p>
      </section>
      <h2 className="text-lg font-semibold">Your hotspot setup</h2>
      <section className={`${glass} grid gap-3 p-4`}>
        <label className="grid gap-2 text-sm">
          <span>Wi-Fi name</span>
          <Input
            value={currentSsid}
            onChange={(event) => setSsid(event.target.value)}
            maxLength={32}
            disabled={saving}
            className="h-12 rounded-2xl"
          />
          <span className="text-xs text-muted-foreground">{currentSsid.length}/32 characters</span>
        </label>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {routerState.state === "loading" && (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden />
          )}
          {routerState.state === "error" && (
            <AlertTriangle className="h-3.5 w-3.5 text-amber-300" aria-hidden />
          )}
          {t.ui("Router")}:{" "}
          {routerState.state === "ready" ? routerState.label : t.ui(routerState.label)}
        </p>
        {lanPortMode && lanPortNames.length > 0 && (
          <label className="flex items-start gap-2 rounded-2xl border border-border bg-muted/50 p-3 text-xs text-foreground">
            <input
              type="checkbox"
              checked={externalApConfirmed}
              onChange={(event) => setExternalApConfirmed(event.target.checked)}
              className="mt-0.5 h-4 w-4 accent-primary"
            />
            <span>
              {t.ui("This router has no built-in Wi-Fi.")} {t.ui("My access point is plugged into")}{" "}
              <span className="font-mono">{lanPortNames.join(" · ")}</span>.
            </span>
          </label>
        )}
        <button
          type="button"
          onClick={() => void saveWifiName()}
          disabled={
            saving ||
            routerState.state !== "ready" ||
            probeQuery.isPending ||
            probeQuery.isError ||
            !bridge ||
            (lanPortMode && (!externalApConfirmed || lanPortNames.length === 0))
          }
          className="rounded-full bg-primary px-4 py-3 font-semibold text-primary-foreground disabled:opacity-50"
        >
          {saving
            ? t.ui("Saving Wi-Fi name…")
            : routerState.state === "loading" || probeQuery.isPending
              ? t.ui("Checking router…")
              : t.ui("Save Wi-Fi name")}
        </button>
      </section>
      {message && (
        <p
          role="status"
          className="rounded-2xl border border-primary/25 bg-primary/10 p-3 text-sm text-primary"
        >
          {message}
        </p>
      )}
      <Link to={easyPath("connect-router")}>
        <Row
          icon={Router}
          title="Connect your router"
          detail="Magic Hub connection"
          status={
            routerState.state === "loading"
              ? "Checking"
              : routerState.state === "ready"
                ? "Ready"
                : "Required"
          }
        />
      </Link>
      <Link to={easyPath("guest-portal")}>
        <Row icon={Globe2} title="Guest portal" detail="Finish your welcome screen" status="Open" />
      </Link>
      <Link to={easyPath("protect-hotspot")}>
        <Row
          icon={ShieldCheck}
          title="Protect hotspot"
          detail="Run the bypass protection check"
          status="Open"
        />
      </Link>
      <Link to="/app/quick-setup" className={`${glass} flex items-center gap-3 p-4`}>
        <Settings2 className="h-5 w-5 text-primary" aria-hidden />
        <span className="flex-1">
          <b className="block font-medium">Advanced network settings</b>
          <span className="text-xs text-muted-foreground">For network administrators</span>
        </span>
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </>
  );
}

function GuestsLive() {
  const t = useT();
  const fetchRouters = useServerFn(listRouters);
  const snapshot = useServerFn(getSnapshot);
  const routers = useQuery({ queryKey: ["easy-guest-routers"], queryFn: () => fetchRouters() });
  const router = (routers.data ?? []).find((item) => !isVirtualRouter(item));
  const routerState = easyRouterState({
    isPending: routers.isPending,
    isError: routers.isError,
    routerName: router?.name,
  });
  const live = useQuery({
    queryKey: ["easy-guests", router?.id],
    queryFn: () => snapshot({ data: { routerId: router!.id } }),
    enabled: Boolean(router?.id),
    refetchInterval: 20_000,
  });
  const active = live.data?.active ?? [];
  const hosts = live.data?.hosts ?? [];
  const [search, setSearch] = useState("");
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const visibleGuests = active.filter((guest) => {
    if (!normalizedSearch) return true;
    return [guest.user, guest.name, guest.address, guest["mac-address"]].some((value) =>
      String(value ?? "")
        .toLocaleLowerCase()
        .includes(normalizedSearch),
    );
  });
  const livePending = routerState.state === "ready" && live.isPending;
  const emptyState = easyGuestEmptyState({
    routerState: routerState.state,
    livePending,
    liveError: live.isError,
  });
  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        <div className={`${glass} p-3 text-center`}>
          <UsersRound className="mx-auto h-5 w-5 text-primary" aria-hidden />
          <b className="mt-2 block text-xl">
            {livePending || routerState.state !== "ready" ? "—" : active.length}
          </b>
          <span className="text-xs text-muted-foreground">Online</span>
        </div>
        <div className={`${glass} p-3 text-center`}>
          <MonitorSmartphone className="mx-auto h-5 w-5 text-primary" aria-hidden />
          <b className="mt-2 block text-xl">
            {livePending || routerState.state !== "ready" ? "—" : hosts.length}
          </b>
          <span className="text-xs text-muted-foreground">Devices</span>
        </div>
        <div className={`${glass} p-3 text-center`}>
          <CircleHelp className="mx-auto h-5 w-5 text-amber-300" aria-hidden />
          <b className="mt-2 block text-xl text-amber-300">
            {routers.isError || live.isError ? "!" : "0"}
          </b>
          <span className="text-xs text-muted-foreground">Attention</span>
        </div>
      </div>
      <section className={`${glass} p-4`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">Router</p>
            <p className="mt-1 flex items-center gap-2 font-semibold">
              {routerState.state === "loading" && (
                <LoaderCircle className="h-4 w-4 animate-spin text-primary" aria-hidden />
              )}
              {routerState.state === "error" && (
                <AlertTriangle className="h-4 w-4 text-amber-300" aria-hidden />
              )}
              {routerState.state === "ready" ? routerState.label : t.ui(routerState.label)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void live.refetch()}
            disabled={routerState.state !== "ready" || live.isFetching}
            className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border bg-background/60 px-3 text-xs font-semibold text-muted-foreground transition hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${live.isFetching ? "animate-spin" : ""}`}
              aria-hidden
            />
            {t.ui("Refresh")}
          </button>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {routerState.state === "ready" && !livePending && !live.isError
            ? t.ui("Live data refreshes every 20 seconds.")
            : t.ui(emptyState.message)}
        </p>
      </section>
      {routerState.state === "ready" && !livePending && !live.isError && active.length > 0 && (
        <label className="relative block">
          <span className="sr-only">{t.ui("Search guests")}</span>
          <Search
            className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t.ui("Search name, address, or device")}
            className="h-12 rounded-2xl pl-11"
          />
        </label>
      )}
      {routerState.state === "ready" && !livePending && !live.isError && active.length ? (
        visibleGuests.length ? (
          visibleGuests
            .slice(0, 30)
            .map((guest, index) => (
              <Row
                key={String(guest[".id"] ?? index)}
                icon={Wifi}
                title={String(guest.user ?? guest.name ?? "Connected guest")}
                detail={String(guest.address ?? guest["mac-address"] ?? "Device")}
                status="Online"
              />
            ))
        ) : (
          <section
            className={`${glass} p-5 text-center text-sm text-muted-foreground`}
            aria-live="polite"
          >
            {t.ui("No guests match your search.")}
          </section>
        )
      ) : (
        <section
          className={`${glass} p-5 text-center text-sm text-muted-foreground`}
          aria-live="polite"
        >
          {routerState.state === "loading" || livePending ? (
            <LoaderCircle className="mx-auto mb-2 h-5 w-5 animate-spin text-primary" aria-hidden />
          ) : routerState.state === "error" || live.isError ? (
            <AlertTriangle className="mx-auto mb-2 h-5 w-5 text-amber-300" aria-hidden />
          ) : null}
          <p>{t.ui(emptyState.message)}</p>
          {emptyState.action && (
            <Link
              to={emptyState.action === "connect" ? easyPath("connect-router") : easyPath("setup")}
              className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-primary/40 px-4 font-semibold text-primary"
            >
              {t.ui(emptyState.action === "connect" ? "Connect router" : "Open setup")}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          )}
        </section>
      )}
    </>
  );
}
