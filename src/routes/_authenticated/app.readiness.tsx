import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useT } from "@/lib/i18n";
import { listManagedDevices } from "@/lib/inventory.functions";
import {
  ACTION_LABEL,
  CATEGORY_LABEL,
  DEVICE_ACTIONS,
  DEVICE_CATEGORIES,
  DEVICE_VENDORS,
  VENDOR_LABEL,
  capability,
} from "@/lib/devices/vendors";

export const Route = createFileRoute("/_authenticated/app/readiness")({
  head: () => ({
    meta: [
      { title: "Production readiness — MikroTik Magic" },
      {
        name: "description",
        content:
          "What is configured, what is still missing, which vendors are supported and which actions this app can perform on each of them.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReadinessPage,
});

function ReadinessPage() {
  const t = useT();
  const fetchDevices = useServerFn(listManagedDevices);

  const devices = useQuery({ queryKey: ["managed-devices"], queryFn: () => fetchDevices() });

  const usedVendors = new Set(
    ((devices.data ?? []) as unknown as Array<{ vendor: string }>).map((d) => d.vendor),
  );

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold">{t.label("Production readiness")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          {t.copy(
            "An honest picture before you go live: what is set up, what is not, and exactly which hardware this app can control.",
          )}
        </p>
      </header>

      <section className="panel p-5">
        <h2 className="text-lg font-semibold">{t.label("Prerequisites")}</h2>
        <ul className="mt-3 grid list-disc gap-1.5 pl-5 text-sm text-muted-foreground">
          <li>
            {t.copy(
              "A MikroTik gateway running RouterOS 7 with the REST service reachable — directly, through a paired local connector, or via Magic Hub.",
            )}
          </li>
          <li>
            {t.copy(
              "A dedicated API user on the router. Never reuse the admin account you log into WebFig with.",
            )}
          </li>
          <li>
            {t.copy(
              "Bank details entered for manual transfer, since no live payment provider is enabled.",
            )}
          </li>
          <li>
            {t.copy(
              "At least one alert rule turned on, so an outage reaches you before your guests do.",
            )}
          </li>
        </ul>
      </section>

      <section className="panel p-5">
        <h2 className="text-lg font-semibold">{t.label("Supported hardware")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {t.copy(
            "A crossed-out action means this app cannot perform it on that hardware — use the vendor's own tool instead.",
          )}
        </p>
        <div className="mt-4 grid gap-4">
          {DEVICE_VENDORS.map((vendor) => (
            <div key={vendor} className="rounded-xl border border-[color:var(--glass-border)] p-3">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold">{VENDOR_LABEL[vendor]}</h3>
                {usedVendors.has(vendor) && (
                  <span className="rounded-full border border-emerald-500/40 px-2 py-0.5 text-[11px] text-emerald-300">
                    {t.label("In your inventory")}
                  </span>
                )}
              </div>
              <div className="table-scroll mt-3">
                <table className="w-full min-w-[740px] table-fixed text-left text-[11px]">
                  <colgroup>
                    <col className="w-40" />
                    {DEVICE_ACTIONS.map((a) => (
                      <col key={a} className="w-24" />
                    ))}
                  </colgroup>
                  <thead className="text-muted-foreground">
                    <tr>
                      <th className="whitespace-nowrap py-1 pr-3 font-medium">{t.label("Type")}</th>
                      {DEVICE_ACTIONS.map((a) => (
                        <th key={a} className="whitespace-nowrap py-1 pr-2 font-medium">
                          {ACTION_LABEL[a]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {DEVICE_CATEGORIES.map((category) => {
                      const row = DEVICE_ACTIONS.map((action) =>
                        capability({ vendor, category, transport: "direct" }, action),
                      );
                      if (row.every((c) => !c.supported)) return null;
                      return (
                        <tr key={category} className="border-t border-[color:var(--glass-border)]">
                          <td className="whitespace-nowrap py-1.5 pr-3">
                            {CATEGORY_LABEL[category]}
                          </td>
                          {row.map((c, i) => (
                            <td key={DEVICE_ACTIONS[i]} className="whitespace-nowrap py-1.5 pr-2">
                              {c.supported ? (
                                <span className="text-emerald-300">Yes</span>
                              ) : (
                                <span
                                  title={c.reason}
                                  className="text-muted-foreground line-through"
                                >
                                  No
                                </span>
                              )}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="panel p-5">
        <h2 className="text-lg font-semibold">{t.label("Not enabled in this deployment")}</h2>
        <ul className="mt-3 grid list-disc gap-1.5 pl-5 text-sm text-muted-foreground">
          <li>
            {t.copy(
              "Live card or wallet payment providers — checkout uses bank transfer with manual receipt review.",
            )}
          </li>
          <li>
            {t.copy(
              "Live port reads for Ruijie, Cisco, TP-Link and UniFi switches — inventory and capabilities only.",
            )}
          </li>
          <li>
            {t.copy(
              "Automatic remediation. Every configuration change needs a person to confirm it.",
            )}
          </li>
        </ul>
      </section>
    </div>
  );
}
