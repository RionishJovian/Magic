import { createFileRoute } from "@tanstack/react-router";
import { Suspense, lazy, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { asCoord, hasCoords, roundCoord } from "@/lib/sites-coords";
import type { MapSite } from "@/components/SitesMap";

const SitesMap = lazy(() => import("@/components/SitesMap"));

/**
 * DEV-only SitesMap harness: exercise click-to-pin + PostgREST-string coords
 * without a Supabase login.
 */
export const Route = createFileRoute("/dev/sites-map")({
  head: () => ({
    meta: [{ title: "Sites map harness — MikroTik Magic" }, { name: "robots", content: "noindex" }],
  }),
  component: SitesMapHarness,
});

const STRING_COORDS_SITE: MapSite = {
  id: "string-coords",
  name: "PostgREST string café",
  location: "Yangon",
  // Simulate numeric columns returned as strings (the production bug).
  latitude: "16.8409" as unknown as number,
  longitude: "96.1735" as unknown as number,
  routers: 1,
  online: 1,
};

function SitesMapHarness() {
  const isDevelopment = import.meta.env.DEV;
  const [draft, setDraft] = useState<{ latitude: number; longitude: number } | null>(null);
  const [saved, setSaved] = useState<MapSite[]>([]);

  if (!isDevelopment) {
    return (
      <div className="grid min-h-[100dvh] place-items-center p-6 text-sm text-muted-foreground">
        This preview is only available in local development.
      </div>
    );
  }

  const sites: MapSite[] = [
    {
      ...STRING_COORDS_SITE,
      latitude: asCoord(STRING_COORDS_SITE.latitude),
      longitude: asCoord(STRING_COORDS_SITE.longitude),
    },
    ...saved,
  ];

  return (
    <div className="container-page space-y-4 py-6">
      <header>
        <h1 className="text-xl font-semibold">Sites map harness</h1>
        <p className="text-sm text-muted-foreground">
          Click the map to drop a draft pin. The green pin uses string lat/lng (PostgREST shape) to
          prove markers still render after coercion.
        </p>
      </header>

      <ClientOnly fallback={<div className="h-[420px] rounded-2xl bg-surface/40" />}>
        <Suspense fallback={<div className="h-[420px] rounded-2xl bg-surface/40" />}>
          <SitesMap
            height={420}
            sites={sites}
            draftPin={draft}
            onPick={(lat, lng) =>
              setDraft({ latitude: roundCoord(lat), longitude: roundCoord(lng) })
            }
          />
        </Suspense>
      </ClientOnly>

      <div className="space-y-2 text-sm">
        <p data-testid="draft-coords">
          {draft
            ? `Draft pin: ${draft.latitude}, ${draft.longitude}`
            : "No draft pin yet — click the map."}
        </p>
        <p data-testid="string-coords-ok">
          String-coord site placeable: {hasCoords(STRING_COORDS_SITE) ? "yes" : "no"}
        </p>
        <button
          type="button"
          disabled={!draft}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          onClick={() => {
            if (!draft) return;
            setSaved((prev) => [
              ...prev,
              {
                id: `saved-${prev.length + 1}`,
                name: `Draft site ${prev.length + 1}`,
                location: null,
                latitude: draft.latitude,
                longitude: draft.longitude,
                routers: 0,
                online: 0,
              },
            ]);
            setDraft(null);
          }}
        >
          Save draft as site
        </button>
      </div>
    </div>
  );
}
