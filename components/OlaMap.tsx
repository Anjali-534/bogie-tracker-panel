"use client";
import { useEffect, useRef, useState } from "react";
import { Moon, Sun } from "lucide-react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const DARK_MODE_STORAGE_KEY = "gogoo-map-dark";
// Classic "poor-man's dark mode" for raster/vector web maps that don't ship
// their own dark style (confirmed in Phase 0: Ola Maps only offers
// default-light-standard) — invert then hue-rotate back so land/water read
// as dark instead of the garish inverted-color look invert() alone gives.
const DARK_MODE_FILTER = "invert(1) hue-rotate(180deg) brightness(0.9) contrast(0.9)";

const OLA_KEY = process.env.NEXT_PUBLIC_OLA_MAPS_KEY || "";
const STYLE_URL = `https://api.olamaps.io/tiles/vector/v1/styles/default-light-standard/style.json?api_key=${OLA_KEY}`;

export type OlaMarker = {
  lng: number; lat: number; color?: string; label?: string; popup?: string;
  // id marks this marker for smooth lerp/RAF animation between updates
  // (used for the moving driver marker; A/B pins are left unset — they
  // jump instantly, which is correct since they never move mid-trip).
  id?: string;
  icon?: "truck" | "car" | "ambulance" | "pin";
  // Device-reported compass heading (navigator.geolocation coords.heading),
  // in degrees. Optional and device-dependent — when present and finite it
  // overrides the GPS-history bearing computed from consecutive fixes;
  // absent, the history-based bearing is used instead. Only meaningful for
  // vehicle icons (truck/car/ambulance); ignored for pin/plain markers.
  heading?: number;
  // Lets the user reposition this marker by hand (location-picker preview).
  // Only wired up on the static (no id) marker path — animated markers are
  // driven by live position updates, dragging one would fight the RAF lerp.
  draggable?: boolean;
};

const ANIM_MS = 900;
// Below this displacement between consecutive fixes, GPS jitter makes the
// bearing unreliable — keep facing the last known direction instead of
// spinning in place while stationary.
const MIN_BEARING_DISPLACEMENT_M = 3;

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

function toRad(d: number) { return (d * Math.PI) / 180; }
function toDeg(r: number) { return (r * 180) / Math.PI; }

export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Standard compass bearing (0=N, 90=E) from point 1 to point 2.
function bearingDeg(lat1: number, lng1: number, lat2: number, lng2: number) {
  const y = Math.sin(toRad(lng2 - lng1)) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lng2 - lng1));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// Interpolates along the shorter arc between two angles (handles the
// 359deg -> 1deg wraparound instead of spinning the long way around).
function lerpAngle(a: number, b: number, t: number) {
  const diff = ((b - a + 540) % 360) - 180;
  return (a + diff * t + 360) % 360;
}

const VEHICLE_GLYPHS: Record<"truck" | "car" | "ambulance", string> = {
  truck: '<path d="M3 6a1 1 0 00-1 1v9a1 1 0 001 1h1a2.5 2.5 0 004.9 0h6.2a2.5 2.5 0 004.9 0H21a1 1 0 001-1v-4.5a1 1 0 00-.2-.6l-2.7-3.6A1 1 0 0018.3 7H15V7a1 1 0 00-1-1H3zm12 2h3.3l2.4 3.2H15V8zM6 17.75a1 1 0 110-2 1 1 0 010 2zm12 0a1 1 0 110-2 1 1 0 010 2z"/>',
  car: '<path d="M7.1 11h9.8l-1.35-3.5a1 1 0 00-.93-.65H9.38a1 1 0 00-.93.65L7.1 11zM5 11l1.62-4.2A3 3 0 019.38 5h5.24a3 3 0 012.76 1.8L18.9 11H19a2 2 0 012 2v4.5a1 1 0 01-1 1h-1.05a2.5 2.5 0 01-4.9 0H9.95a2.5 2.5 0 01-4.9 0H4a1 1 0 01-1-1V13a2 2 0 012-2z"/>',
  // Simple medical-cross glyph — more recognizable at marker scale than a
  // vehicle silhouette, matches the "ambulance cross" convention.
  ambulance: '<path d="M11 4h2v6h6v2h-6v6h-2v-6H5v-2h6V4z"/>',
};

// Circular badge + a small triangular "beak" pointing outward from the top —
// the whole element is what gets CSS-rotated to face the vehicle's direction
// of travel, so the beak reads as a heading indicator. Sized larger than the
// old 34px badge (spec: "clearly visible, not tiny").
function vehicleIconHtml(kind: "truck" | "car" | "ambulance", color: string) {
  const size = 44;
  return `<div style="position:relative;width:${size}px;height:${size}px">
    <div style="position:absolute;top:-7px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-bottom:10px solid ${color};filter:drop-shadow(0 1px 1px rgba(0,0,0,0.25))"></div>
    <div style="width:100%;height:100%;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="white">${VEHICLE_GLYPHS[kind]}</svg>
    </div>
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
  // Fires when a draggable marker is dropped, with its new position.
  onMarkerDragEnd?: (lngLat: { lng: number; lat: number }) => void;
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
  onMarkerDragEnd,
}: OlaMapProps) {
  const ref = useRef<HTMLDivElement>(null);
  // Ref so the marker-creation effect (keyed on JSON.stringify(markers)) can
  // always call the latest callback without needing it in its own deps.
  const onMarkerDragEndRef = useRef(onMarkerDragEnd);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  // Animated (id-tagged) markers, keyed by id — kept alive across updates so
  // position changes can lerp instead of jumping, mirroring cab-panel's
  // MapComponent RAF pattern but driving marker.setLngLat() per-frame since
  // OlaMap renders DOM Markers, not a GeoJSON source.
  const animatedMarkersRef = useRef<Record<string, { marker: maplibregl.Marker; sig: string; bearing: number }>>({});
  const animFrameRef = useRef<Record<string, number>>({});
  const latestMarkersRef = useRef<OlaMarker[]>(markers);
  const latestPlannedRouteRef = useRef<[number, number][] | undefined>(plannedRoute);
  // isStyleLoaded() is unreliable around the load event (can be true before
  // our load handler has added the sources, or transiently false after it),
  // so track readiness ourselves and queue updates that arrive too early.
  const loadedRef = useRef(false);
  const pendingRef = useRef<{ markers?: () => void; route?: () => void; planned?: () => void; paint?: () => void; fit?: () => void; dark?: () => void }>({});
  // Drives the branded skeleton overlay until the first 'load' fires.
  const [loaded, setLoaded] = useState(false);
  // CSS-filter dark mode (Ola only ships a light vector style — see Phase 0
  // investigation). Persisted per-browser so toggling on one map instance
  // carries across the panel's other maps.
  const [darkMode, setDarkMode] = useState(false);
  useEffect(() => {
    try {
      setDarkMode(localStorage.getItem(DARK_MODE_STORAGE_KEY) === "1");
    } catch {
      // Private browsing / storage disabled — default to light, not fatal.
    }
  }, []);
  function toggleDarkMode() {
    setDarkMode(prev => {
      const next = !prev;
      try { localStorage.setItem(DARK_MODE_STORAGE_KEY, next ? "1" : "0"); } catch {}
      return next;
    });
  }

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
      setLoaded(true);
      pendingRef.current.markers?.();
      pendingRef.current.route?.();
      pendingRef.current.planned?.();
      pendingRef.current.paint?.();
      pendingRef.current.fit?.();
      pendingRef.current.dark?.();
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
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      map.getCanvas().style.filter = darkMode ? DARK_MODE_FILTER : "";
    };
    if (loadedRef.current) apply(); else pendingRef.current.dark = apply;
  }, [darkMode]);

  useEffect(() => {
    latestMarkersRef.current = markers;
    latestPlannedRouteRef.current = plannedRoute;
  }, [markers, plannedRoute]);

  useEffect(() => {
    onMarkerDragEndRef.current = onMarkerDragEnd;
  }, [onMarkerDragEnd]);

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

        const isDirectional = m.icon === "truck" || m.icon === "car" || m.icon === "ambulance";

        if (existing && existing.sig === sig) {
          if (animFrameRef.current[m.id]) cancelAnimationFrame(animFrameRef.current[m.id]);
          const from = existing.marker.getLngLat();
          const fromLng = from.lng, fromLat = from.lat;
          const toLng = m.lng, toLat = m.lat;

          // Bearing: device heading wins when present; otherwise derive it
          // from the displacement between the last fix and this one (kept
          // steady, not recomputed, when that displacement is too small to
          // trust — see MIN_BEARING_DISPLACEMENT_M).
          const startBearing = existing.bearing;
          let targetBearing = startBearing;
          if (isDirectional) {
            if (m.heading != null && Number.isFinite(m.heading)) {
              targetBearing = m.heading;
            } else if (distanceMeters(fromLat, fromLng, toLat, toLng) > MIN_BEARING_DISPLACEMENT_M) {
              targetBearing = bearingDeg(fromLat, fromLng, toLat, toLng);
            }
          }
          existing.bearing = targetBearing;

          const start = performance.now();
          const id = m.id;
          const step = (now: number) => {
            const t = Math.min(1, (now - start) / ANIM_MS);
            existing.marker.setLngLat([lerp(fromLng, toLng, t), lerp(fromLat, toLat, t)]);
            if (isDirectional) {
              const rotor = existing.marker.getElement().firstElementChild as HTMLElement | null;
              if (rotor) rotor.style.transform = `rotate(${lerpAngle(startBearing, targetBearing, t)}deg)`;
            }
            if (t < 1) animFrameRef.current[id] = requestAnimationFrame(step);
            else delete animFrameRef.current[id];
          };
          animFrameRef.current[id] = requestAnimationFrame(step);
          if (m.popup) existing.marker.setPopup(new maplibregl.Popup({ offset: 16 }).setHTML(m.popup));
        } else {
          if (existing) existing.marker.remove();
          if (animFrameRef.current[m.id]) { cancelAnimationFrame(animFrameRef.current[m.id]); delete animFrameRef.current[m.id]; }
          const el = document.createElement("div");
          if (m.icon === "truck" || m.icon === "car" || m.icon === "ambulance") {
            el.innerHTML = vehicleIconHtml(m.icon, m.color || "#FF6B2B");
          } else if (m.icon === "pin") {
            el.innerHTML = pinIconHtml(m.color || "#FF6B2B");
          } else {
            el.style.cssText = `width:28px;height:28px;border-radius:50%;background:${m.color || "#FF6B2B"};border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;font-size:13px;color:#fff;font-weight:800`;
            if (m.label) el.textContent = m.label;
          }
          const initialBearing = isDirectional && m.heading != null && Number.isFinite(m.heading) ? m.heading : 0;
          if (isDirectional) {
            const rotor = el.firstElementChild as HTMLElement | null;
            if (rotor) rotor.style.transform = `rotate(${initialBearing}deg)`;
          }
          const marker = new maplibregl.Marker({ element: el, anchor: m.icon === "pin" ? "bottom" : "center" }).setLngLat([m.lng, m.lat]);
          if (m.popup) marker.setPopup(new maplibregl.Popup({ offset: 16 }).setHTML(m.popup));
          marker.addTo(map);
          animatedMarkersRef.current[m.id] = { marker, sig, bearing: initialBearing };
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
        if (m.icon === "truck" || m.icon === "car" || m.icon === "ambulance") {
          el.innerHTML = vehicleIconHtml(m.icon, m.color || "#FF6B2B");
        } else if (m.icon === "pin") {
          el.innerHTML = pinIconHtml(m.color || "#FF6B2B");
        } else {
          el.style.cssText = `width:28px;height:28px;border-radius:50%;background:${m.color || "#FF6B2B"};border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;font-size:13px;color:#fff;font-weight:800`;
          if (m.label) el.textContent = m.label;
        }
        const marker = new maplibregl.Marker({ element: el, anchor: m.icon === "pin" ? "bottom" : "center", draggable: !!m.draggable }).setLngLat([m.lng, m.lat]);
        if (m.popup) marker.setPopup(new maplibregl.Popup({ offset: 16 }).setHTML(m.popup));
        if (m.draggable) {
          marker.on("dragend", () => {
            const ll = marker.getLngLat();
            onMarkerDragEndRef.current?.({ lng: ll.lng, lat: ll.lat });
          });
        }
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
      {!loaded && (
        <div className={`${className} absolute inset-0 z-[5] bg-gray-100 flex items-center justify-center`}>
          <div className="flex flex-col items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-orange-500 animate-pulse" />
            <span className="text-xs font-semibold text-gray-400">Loading map…</span>
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={toggleDarkMode}
        aria-label={darkMode ? "Switch to light map" : "Switch to dark map"}
        className="absolute right-2 top-12 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white/95 shadow-sm backdrop-blur"
      >
        {darkMode ? <Sun size={16} className="text-gray-700" /> : <Moon size={16} className="text-gray-700" />}
      </button>
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
