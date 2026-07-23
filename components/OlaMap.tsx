"use client";
import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const OLA_KEY = process.env.NEXT_PUBLIC_OLA_MAPS_KEY || "";
const STYLE_URL = `https://api.olamaps.io/tiles/vector/v1/styles/default-light-standard/style.json?api_key=${OLA_KEY}`;

export type OlaMarker = {
  lng: number; lat: number; color?: string; label?: string; popup?: string;
  // id marks this marker for smooth lerp/RAF animation between updates
  // (used for the moving driver marker; A/B pins are left unset — they
  // jump instantly, which is correct since they never move mid-trip).
  id?: string;
  icon?: "truck" | "pin";
};

const ANIM_MS = 900;

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

function truckIconHtml(color: string) {
  return `<div style="width:34px;height:34px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center">
    <svg viewBox="0 0 24 24" width="18" height="18" fill="white"><path d="M3 6a1 1 0 00-1 1v9a1 1 0 001 1h1a2.5 2.5 0 004.9 0h6.2a2.5 2.5 0 004.9 0H21a1 1 0 001-1v-4.5a1 1 0 00-.2-.6l-2.7-3.6A1 1 0 0018.3 7H15V7a1 1 0 00-1-1H3zm12 2h3.3l2.4 3.2H15V8zM6 17.75a1 1 0 110-2 1 1 0 010 2zm12 0a1 1 0 110-2 1 1 0 010 2z"/></svg>
  </div>`;
}

// Teardrop location pin, matching user-app's PickupMarker/DropMarker proportions
// (VehicleMarkers.tsx: circle + pointed tip). The tip sits at the bottom edge of
// the SVG's own bounding box, so pairing this with Marker anchor:'bottom' lands
// the tip exactly on the coordinate rather than the pin's visual center.
function pinIconHtml(color: string) {
  return `<svg width="26" height="39" viewBox="0 0 24 36" xmlns="http://www.w3.org/2000/svg" style="display:block;filter:drop-shadow(0 2px 3px rgba(0,0,0,0.35))">
    <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 24 12 24s12-15 12-24C24 5.373 18.627 0 12 0z" fill="${color}"/>
    <circle cx="12" cy="12" r="5" fill="#fff"/>
  </svg>`;
}

type OlaMapProps = {
  center?: [number, number]; // [lng, lat]
  zoom?: number;
  markers?: OlaMarker[];
  route?: [number, number][]; // [lng, lat][] — GeoJSON LineString (thinner/deeper — actual trail)
  plannedRoute?: [number, number][]; // [lng, lat][] — solid orange by default, matches cab-panel's route line
  plannedRouteColor?: string; // defaults to orange (#FF6B2B)
  plannedRouteDashed?: boolean; // dashed pre-pickup leg, matching user-app's tracking screen convention
  fitToMarkers?: boolean;
  fitTrigger?: number;
  className?: string;
  onMapReady?: (map: maplibregl.Map) => void;
};

export function decodePolyline(encoded: string): [number, number][] {
  const coords: [number, number][] = [];
  let i = 0, lat = 0, lng = 0;
  while (i < encoded.length) {
    let s = 0, r = 0, b: number;
    do { b = encoded.charCodeAt(i++) - 63; r |= (b & 0x1f) << s; s += 5; } while (b >= 0x20);
    lat += (r & 1) ? ~(r >> 1) : r >> 1; s = 0; r = 0;
    do { b = encoded.charCodeAt(i++) - 63; r |= (b & 0x1f) << s; s += 5; } while (b >= 0x20);
    lng += (r & 1) ? ~(r >> 1) : r >> 1;
    coords.push([lng / 1e5, lat / 1e5]);
  }
  return coords;
}

// Mirrors user-app's services/olamaps.ts olaDirections() — same Ola Maps
// directions endpoint, called directly from the client (no backend route
// endpoint exists). Returned coords are already [lng, lat][], matching
// OlaMap's plannedRoute prop directly.
export async function fetchOlaRoute(
  origin: { lat: number; lng: number },
  dest: { lat: number; lng: number },
): Promise<{ coords: [number, number][]; distanceKm: number; durationMins: number } | null> {
  try {
    const res = await fetch(
      `https://api.olamaps.io/routing/v1/directions?origin=${origin.lat},${origin.lng}&destination=${dest.lat},${dest.lng}&api_key=${OLA_KEY}`,
      { method: "POST" },
    );
    if (!res.ok) {
      console.error(`[fetchOlaRoute] HTTP ${res.status} ${res.statusText}: ${await res.text().catch(() => "")}`);
      return null;
    }
    const data = await res.json();
    const route = data?.routes?.[0];
    if (!route?.overview_polyline) {
      console.error("[fetchOlaRoute] no overview_polyline in response", data?.status, data);
      return null;
    }
    return {
      coords: decodePolyline(route.overview_polyline),
      distanceKm: (route?.legs?.[0]?.distance ?? 0) / 1000,
      durationMins: Math.round((route?.legs?.[0]?.duration ?? 0) / 60),
    };
  } catch (err) {
    console.error("[fetchOlaRoute] request failed", err);
    return null;
  }
}

export default function OlaMap({
  center = [77.2090, 28.6139],
  zoom = 12,
  markers = [],
  route,
  plannedRoute,
  plannedRouteColor = "#FF6B2B",
  plannedRouteDashed = false,
  fitToMarkers = false,
  fitTrigger = 0,
  className = "w-full h-80 rounded-2xl overflow-hidden",
  onMapReady,
}: OlaMapProps) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  // Animated (id-tagged) markers, keyed by id — kept alive across updates so
  // position changes can lerp instead of jumping, mirroring cab-panel's
  // MapComponent RAF pattern but driving marker.setLngLat() per-frame since
  // OlaMap renders DOM Markers, not a GeoJSON source.
  const animatedMarkersRef = useRef<Record<string, { marker: maplibregl.Marker; sig: string }>>({});
  const animFrameRef = useRef<Record<string, number>>({});
  const latestMarkersRef = useRef<OlaMarker[]>(markers);
  const latestPlannedRouteRef = useRef<[number, number][] | undefined>(plannedRoute);
  // isStyleLoaded() is unreliable around the load event (can be true before
  // our load handler has added the sources, or transiently false after it),
  // so track readiness ourselves and queue updates that arrive too early.
  const loadedRef = useRef(false);
  const pendingRef = useRef<{ markers?: () => void; route?: () => void; planned?: () => void; paint?: () => void; fit?: () => void }>({});

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: ref.current,
      style: STYLE_URL,
      center, zoom,
      attributionControl: false,
      transformRequest: (url: string) => {
        if (url.includes("api.olamaps.io") && !url.includes("api_key")) {
          return { url: url + (url.includes("?") ? "&" : "?") + `api_key=${OLA_KEY}` };
        }
        return { url };
      },
    });
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    // Ola's own tile responses ship an empty attribution string, so without this
    // MapLibre GL JS falls back to its library-default placeholder ("MapLibre"
    // linking to maplibre.org) instead of real, ToS-required credit. Ola Maps'
    // Platform Terms (Section 16) require attribution to "Ola Maps" linking to
    // openstreetmap.org/copyright (data is ODbL/OpenStreetMap-derived).
    map.addControl(new maplibregl.AttributionControl({
      compact: true,
      customAttribution: '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">Ola Maps</a>',
    }));
    map.on("load", () => {
      // Planned route goes in first so the actual trail draws on top of it.
      // Solid orange, matching cab-panel's route-line paint values exactly —
      // this is the primary line the user sees.
      map.addSource("planned-route", {
        type: "geojson",
        data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } },
      });
      map.addLayer({
        id: "planned-route-line", type: "line", source: "planned-route",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#FF6B2B", "line-width": 4, "line-opacity": 0.85 },
      });
      // Actual trail — same orange, thinner and at 60% opacity so it reads as
      // a distinct layer when it diverges from the planned route (and simply
      // blends into it when the driver is on-route, which is fine).
      map.addSource("route", {
        type: "geojson",
        data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } },
      });
      map.addLayer({
        id: "route-line", type: "line", source: "route",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#FF6B2B", "line-width": 2.5, "line-opacity": 0.6 },
      });
      loadedRef.current = true;
      pendingRef.current.markers?.();
      pendingRef.current.route?.();
      pendingRef.current.planned?.();
      pendingRef.current.paint?.();
      pendingRef.current.fit?.();
      pendingRef.current = {};
      onMapReady?.(map);
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      loadedRef.current = false;
      pendingRef.current = {};
      Object.values(animFrameRef.current).forEach(id => cancelAnimationFrame(id));
      animFrameRef.current = {};
      animatedMarkersRef.current = {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    latestMarkersRef.current = markers;
    latestPlannedRouteRef.current = plannedRoute;
  }, [markers, plannedRoute]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const update = () => {
      const list = latestMarkersRef.current;
      const seenAnimIds = new Set<string>();

      // Animated (id-tagged) markers — reuse the existing Marker instance
      // and lerp its position over ANIM_MS via RAF, instead of removing and
      // recreating it (which is what caused the old jump-per-fix look).
      list.forEach(m => {
        if (!m.id || m.lng == null || m.lat == null) return;
        seenAnimIds.add(m.id);
        const sig = `${m.color || ""}|${m.icon || ""}|${m.label || ""}`;
        const existing = animatedMarkersRef.current[m.id];

        if (existing && existing.sig === sig) {
          if (animFrameRef.current[m.id]) cancelAnimationFrame(animFrameRef.current[m.id]);
          const from = existing.marker.getLngLat();
          const fromLng = from.lng, fromLat = from.lat;
          const toLng = m.lng, toLat = m.lat;
          const start = performance.now();
          const id = m.id;
          const step = (now: number) => {
            const t = Math.min(1, (now - start) / ANIM_MS);
            existing.marker.setLngLat([lerp(fromLng, toLng, t), lerp(fromLat, toLat, t)]);
            if (t < 1) animFrameRef.current[id] = requestAnimationFrame(step);
            else delete animFrameRef.current[id];
          };
          animFrameRef.current[id] = requestAnimationFrame(step);
          if (m.popup) existing.marker.setPopup(new maplibregl.Popup({ offset: 16 }).setHTML(m.popup));
        } else {
          if (existing) existing.marker.remove();
          if (animFrameRef.current[m.id]) { cancelAnimationFrame(animFrameRef.current[m.id]); delete animFrameRef.current[m.id]; }
          const el = document.createElement("div");
          if (m.icon === "truck") {
            el.innerHTML = truckIconHtml(m.color || "#FF6B2B");
          } else if (m.icon === "pin") {
            el.innerHTML = pinIconHtml(m.color || "#FF6B2B");
          } else {
            el.style.cssText = `width:28px;height:28px;border-radius:50%;background:${m.color || "#FF6B2B"};border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;font-size:13px;color:#fff;font-weight:800`;
            if (m.label) el.textContent = m.label;
          }
          const marker = new maplibregl.Marker({ element: el, anchor: m.icon === "pin" ? "bottom" : "center" }).setLngLat([m.lng, m.lat]);
          if (m.popup) marker.setPopup(new maplibregl.Popup({ offset: 16 }).setHTML(m.popup));
          marker.addTo(map);
          animatedMarkersRef.current[m.id] = { marker, sig };
        }
      });

      Object.keys(animatedMarkersRef.current).forEach(id => {
        if (seenAnimIds.has(id)) return;
        animatedMarkersRef.current[id].marker.remove();
        if (animFrameRef.current[id]) { cancelAnimationFrame(animFrameRef.current[id]); delete animFrameRef.current[id]; }
        delete animatedMarkersRef.current[id];
      });

      // Static (no id) markers — A/B dispatch pins etc.
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];
      list.forEach(m => {
        if (m.id || m.lng == null || m.lat == null) return;
        const el = document.createElement("div");
        if (m.icon === "pin") {
          el.innerHTML = pinIconHtml(m.color || "#FF6B2B");
        } else {
          el.style.cssText = `width:28px;height:28px;border-radius:50%;background:${m.color || "#FF6B2B"};border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;font-size:13px;color:#fff;font-weight:800`;
          if (m.label) el.textContent = m.label;
        }
        const marker = new maplibregl.Marker({ element: el, anchor: m.icon === "pin" ? "bottom" : "center" }).setLngLat([m.lng, m.lat]);
        if (m.popup) marker.setPopup(new maplibregl.Popup({ offset: 16 }).setHTML(m.popup));
        marker.addTo(map);
        markersRef.current.push(marker);
      });
    };
    if (loadedRef.current) update(); else pendingRef.current.markers = update;
  }, [JSON.stringify(markers)]);

  useEffect(() => {
    if (!fitToMarkers) return;
    const map = mapRef.current;
    const fitVisibleMarkers = () => {
      if (!map) return;
      const bounds = new maplibregl.LngLatBounds();
      let count = 0;
      latestMarkersRef.current.forEach(m => {
        if (m.lng == null || m.lat == null) return;
        bounds.extend([m.lng, m.lat]);
        count++;
      });
      if (latestPlannedRouteRef.current && latestPlannedRouteRef.current.length >= 2) {
        latestPlannedRouteRef.current.forEach(p => bounds.extend(p));
        count += latestPlannedRouteRef.current.length;
      }
      if (count === 0) return;
      if (count === 1) map.easeTo({ center: bounds.getCenter(), zoom: 14, duration: 500 });
      else map.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 500 });
    };
    if (loadedRef.current) fitVisibleMarkers(); else pendingRef.current.fit = fitVisibleMarkers;
  }, [fitToMarkers, fitTrigger]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const update = () => {
      const source = map.getSource("route") as maplibregl.GeoJSONSource | undefined;
      if (!source) return;
      source.setData({
        type: "Feature", properties: {},
        geometry: { type: "LineString", coordinates: route && route.length >= 2 ? route : [] },
      });
    };
    if (loadedRef.current) update(); else pendingRef.current.route = update;
  }, [JSON.stringify(route)]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const update = () => {
      const source = map.getSource("planned-route") as maplibregl.GeoJSONSource | undefined;
      if (!source) return;
      source.setData({
        type: "Feature", properties: {},
        geometry: { type: "LineString", coordinates: plannedRoute && plannedRoute.length >= 2 ? plannedRoute : [] },
      });
    };
    if (loadedRef.current) update(); else pendingRef.current.planned = update;
  }, [JSON.stringify(plannedRoute)]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const update = () => {
      if (!map.getLayer("planned-route-line")) return;
      map.setPaintProperty("planned-route-line", "line-color", plannedRouteColor);
      // Passing undefined resets to the style default (no dasharray = solid).
      map.setPaintProperty("planned-route-line", "line-dasharray", plannedRouteDashed ? [2, 1.6] : undefined);
    };
    if (loadedRef.current) update(); else pendingRef.current.paint = update;
  }, [plannedRouteColor, plannedRouteDashed]);

  return (
    <div className="relative">
      <div ref={ref} className={className} />
      <button
        type="button"
        onClick={() => {
          const map = mapRef.current;
          if (!map) return;
          const bounds = new maplibregl.LngLatBounds();
          let count = 0;
          latestMarkersRef.current.forEach(m => {
            if (m.lng == null || m.lat == null) return;
            bounds.extend([m.lng, m.lat]);
            count++;
          });
          if (latestPlannedRouteRef.current && latestPlannedRouteRef.current.length >= 2) {
            latestPlannedRouteRef.current.forEach(p => bounds.extend(p));
            count += latestPlannedRouteRef.current.length;
          }
          if (count === 0) return;
          if (count === 1) map.easeTo({ center: bounds.getCenter(), zoom: 14, duration: 500 });
          else map.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 500 });
        }}
        aria-label="Recenter map"
        className="absolute right-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white/95 shadow-sm backdrop-blur"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4 text-gray-700" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="6" />
          <path d="M12 2v3" />
          <path d="M12 19v3" />
          <path d="M2 12h3" />
          <path d="M19 12h3" />
        </svg>
      </button>
    </div>
  );
}
