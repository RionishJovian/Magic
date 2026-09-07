import { createFileRoute } from "@tanstack/react-router";
import {
  Ban,
  Clock3,
  DatabaseBackup,
  EarthLock,
  LockKeyhole,
  Scale,
  Settings2,
  Timer,
  Wifi,
  type LucideProps,
} from "lucide-react";
import type { ComponentType } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";

/**
 * DEV-only preview of Quick Config / Hotspot panel Lucide glyphs (no router auth).
 */
const ROWS: { label: string; Icon: ComponentType<LucideProps> }[] = [
  { label: "Hotspot Wi-Fi (SSID)", Icon: Wifi },
  { label: "Quick Config", Icon: Settings2 },
  { label: "NTP Time Sync", Icon: Clock3 },
  { label: "Client Isolation", Icon: LockKeyhole },
  { label: "WAN Input Guard", Icon: EarthLock },
  { label: "Login Flood Guard", Icon: Ban },
  { label: "Fair Share QoS", Icon: Scale },
  { label: "Trial Guest Access", Icon: Timer },
  { label: "Auto Daily Backup", Icon: DatabaseBackup },
];

export const Route = createFileRoute("/dev/quick-config-icons")({
  head: () => ({
    meta: [{ title: "Quick Config icons — preview" }, { name: "robots", content: "noindex" }],
  }),
  component: QuickConfigIconsPreview,
});

function QuickConfigIconsPreview() {
  if (!import.meta.env.DEV) {
    return (
      <div className="grid min-h-[100dvh] place-items-center p-6 text-sm text-muted-foreground">
        This preview is only available in local development.
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background p-4 text-foreground">
      <div className="mx-auto max-w-md space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-sm font-semibold">Quick Config icons</h1>
            <p className="text-[11px] text-muted-foreground">
              Lucide line glyphs (replaces emoji thumbs)
            </p>
          </div>
          <ThemeToggle />
        </div>
        <div className="space-y-1.5">
          {ROWS.map(({ label, Icon }) => (
            <div
              key={label}
              className="flex items-center gap-2.5 rounded-lg border border-border bg-surface px-3 py-2.5"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border/50 bg-muted/20 text-foreground/70">
                <Icon className="h-4 w-4" strokeWidth={1.5} />
              </span>
              <span className="text-xs font-medium">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
