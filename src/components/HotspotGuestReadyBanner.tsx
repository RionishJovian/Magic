/**
 * Shared Hotspot readiness banner for Vouchers + Portal.
 * Probes the chosen router and tells the operator if guests can join a SSID.
 */
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getWifiHotspotProbe } from "@/lib/wifi-hotspot.functions";
import { assessHotspotGuestReady } from "@/lib/wifi-hotspot.server";

export function HotspotGuestReadyBanner({
  routerId,
  routerName,
  context,
}: {
  routerId: string;
  routerName?: string;
  /** Where the banner is shown — tweaks the CTA wording. */
  context: "vouchers" | "portal";
}) {
  const fetchProbe = useServerFn(getWifiHotspotProbe);
  const probe = useQuery({
    queryKey: ["wifi-hotspot-probe", routerId],
    queryFn: () => fetchProbe({ data: { routerId } }),
    enabled: Boolean(routerId),
    staleTime: 20_000,
  });

  if (!routerId) return null;
  if (probe.isLoading) {
    return (
      <div className="rounded-xl border border-border/60 bg-black/20 px-4 py-3 text-xs text-muted-foreground">
        Checking guest Wi‑Fi on {routerName ?? "router"}…
      </div>
    );
  }
  if (probe.isError) {
    return (
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
        <p className="font-medium">Could not probe Hotspot Wi‑Fi</p>
        <p className="mt-1 text-xs text-amber-100/80">
          {(probe.error as Error)?.message || "Router probe failed."} Open Routers and Test the
          board.
        </p>
        <Link
          to="/app/routers"
          className="mt-2 inline-block text-xs font-semibold text-primary hover:underline"
        >
          Open Routers →
        </Link>
      </div>
    );
  }

  const ready = assessHotspotGuestReady(probe.data!);
  if (ready.foundationReady && !ready.accessPathReady && ready.guestSsids.length === 0) {
    return (
      <div
        className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
        role="status"
      >
        <p className="font-medium">Hotspot foundation ready · external AP unverified</p>
        <p className="mt-1 text-xs text-amber-100/90">{ready.summary}</p>
        <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-semibold">
          <span className="rounded-full border border-emerald-500/40 px-2 py-0.5 text-emerald-200">
            Foundation ready
          </span>
          <span className="rounded-full border border-amber-500/40 px-2 py-0.5">
            AP / SSID not verified
          </span>
          <span className="rounded-full border border-border px-2 py-0.5 text-muted-foreground">
            Portal deployment separate
          </span>
          <span className="rounded-full border border-border px-2 py-0.5 text-muted-foreground">
            Guest login test required
          </span>
        </div>
        <p className="mt-2 text-xs font-medium">
          {context === "vouchers"
            ? "You may prepare plans, but do not sell vouchers until a phone reaches the captive portal and a test code logs in."
            : "Publish the portal only after confirming the AP path; then test the deployed login from a guest phone."}
        </p>
        <Link
          to="/app/routers"
          className="mt-2 inline-block text-xs font-semibold text-primary hover:underline"
        >
          Verify Hotspot Wi-Fi on Routers →
        </Link>
      </div>
    );
  }
  if (ready.level === "ok") {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
        <p className="font-medium">
          Guest SSID{ready.guestSsids.length > 1 ? "s" : ""}:{" "}
          <span className="tracking-wide">{ready.guestSsids.join(" · ")}</span>
        </p>
        <p className="mt-1 text-xs text-emerald-100/80">
          {context === "vouchers"
            ? "Phones should see this network. Generate codes, then deploy Portal if the login page is still stock."
            : "Phones should see this network. Publish the portal so the captive login matches your branding."}
        </p>
      </div>
    );
  }

  const tone =
    ready.level === "block"
      ? "border-red-500/40 bg-red-500/10 text-red-100"
      : "border-amber-500/40 bg-amber-500/10 text-amber-100";

  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${tone}`} role="status">
      <p className="font-medium">
        {ready.level === "block" ? "Guests cannot join yet" : "Guest Wi‑Fi incomplete"}
        {routerName ? ` · ${routerName}` : ""}
      </p>
      <p className="mt-1 text-xs opacity-90">{ready.summary}</p>
      {ready.guestSsids.length > 0 && (
        <p className="mt-1 text-xs opacity-80">Seen on board: {ready.guestSsids.join(" · ")}</p>
      )}
      <div className="mt-2 flex flex-wrap gap-3 text-xs font-semibold">
        <Link to="/app/routers" className="text-primary hover:underline">
          Hotspot Wi‑Fi on Routers →
        </Link>
        {context === "vouchers" && ready.foundationReady && (
          <Link to="/app/portal" className="text-primary hover:underline">
            Portal deploy →
          </Link>
        )}
      </div>
    </div>
  );
}
