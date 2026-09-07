// Browser-only Leaflet map for the Sites page. Loaded lazily behind
// <ClientOnly> so Leaflet never runs during SSR.
// Leaflet's stylesheet is imported here (not globally) so only this route pays for it.
import "leaflet/dist/leaflet.css";
import "./SitesMap.css";
import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { asCoord, hasCoords } from "@/lib/sites-coords";

export type MapSite = {
  id: string;
  name: string;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  routers: number;
  online: number;
};

export type DraftPin = {
  latitude: number;
  longitude: number;
};

function pin(online: boolean, dim: boolean, draft = false) {
  const color = draft ? "#60a5fa" : dim ? "#94a3b8" : online ? "#34d399" : "#f87171";
  return L.divIcon({
    className: "mm-site-pin",
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    html: `<span style="display:block;width:18px;height:18px;border-radius:9999px;background:${color};box-shadow:0 0 0 4px ${color}33, 0 0 14px ${color}aa;border:2px solid rgba(255,255,255,.85)"></span>`,
  });
}

function ClickCatcher({ onPick }: { onPick?: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      const target = e.originalEvent?.target;
      if (
        target instanceof Element &&
        target.closest(".leaflet-marker-icon, .leaflet-popup, .leaflet-control")
      ) {
        return;
      }
      onPick?.(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function MapChrome({ lat, lng }: { lat: number | null; lng: number | null }) {
  const map = useMap();
  useEffect(() => {
    const id = window.requestAnimationFrame(() => map.invalidateSize());
    return () => window.cancelAnimationFrame(id);
  }, [map]);
  useEffect(() => {
    if (lat == null || lng == null) return;
    map.flyTo([lat, lng], Math.max(map.getZoom(), 12), { duration: 0.55 });
  }, [lat, lng, map]);
  return null;
}

export default function SitesMap({
  sites,
  onPick,
  draftPin = null,
  height = 320,
}: {
  sites: MapSite[];
  onPick?: (lat: number, lng: number) => void;
  draftPin?: DraftPin | null;
  height?: number;
}) {
  const placed = sites.filter(hasCoords).map((s) => ({
    ...s,
    latitude: asCoord(s.latitude) as number,
    longitude: asCoord(s.longitude) as number,
  }));
  const center: [number, number] = draftPin
    ? [draftPin.latitude, draftPin.longitude]
    : placed[0]
      ? [placed[0].latitude, placed[0].longitude]
      : [16.8409, 96.1735]; // Yangon fallback

  return (
    <div className="overflow-hidden rounded-2xl border border-[color:var(--glass-border)]">
      <MapContainer
        center={center}
        zoom={draftPin || placed.length ? 11 : 5}
        scrollWheelZoom={false}
        style={{ height, width: "100%", background: "#0b1220" }}
      >
        <TileLayer
          attribution="© OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapChrome lat={draftPin?.latitude ?? null} lng={draftPin?.longitude ?? null} />
        <ClickCatcher {...(onPick ? { onPick } : {})} />
        {placed.map((s) => (
          <Marker
            key={s.id}
            position={[s.latitude, s.longitude]}
            icon={pin(s.online > 0, s.routers === 0)}
          >
            <Popup>
              <div style={{ fontWeight: 600 }}>{s.name}</div>
              {s.location && <div>{s.location}</div>}
              <div>
                {s.routers === 0
                  ? "No devices linked"
                  : `${s.online}/${s.routers} device${s.routers === 1 ? "" : "s"} online`}
              </div>
            </Popup>
          </Marker>
        ))}
        {draftPin && (
          <Marker
            key="draft-pin"
            position={[draftPin.latitude, draftPin.longitude]}
            icon={pin(false, false, true)}
          >
            <Popup>
              <div style={{ fontWeight: 600 }}>New site</div>
              <div>Click Add site below to save this pin.</div>
            </Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
}
