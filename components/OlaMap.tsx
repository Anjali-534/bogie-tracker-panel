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

function withApiKey(url: string): string {
  return url.includes("api_key") ? url : url + (url.includes("?") ? "&" : "?") + `api_key=${OLA_KEY}`;
}

// Ola's hosted default-light-standard style has shipped layers referencing
// source-layers that don't actually exist in the source's own TileJSON (seen
// live: "3d_model_data" -> source-layer "3d_model" on "vectordata", which
// only declares "hyperchargers"). MapLibre GL JS validates layers against
// the source schema at style-load time and treats a mismatch as fatal — the
// whole style fails to load, so ANY invalid layer here blanks the entire
// map, not just the broken feature. Fetching the style ourselves and
// dropping unresolvable layers keeps everything else rendering even if Ola
// ships another bad layer in the future.
async function fetchSanitizedStyle(): Promise<maplibregl.StyleSpecification> {
  const style = await fetch(STYLE_URL).then(r => r.json());
  const vectorSourceIds = Object.entries(style.sources || {})
    .filter(([, s]: [string, any]) => s?.type === "vector" && typeof s.url === "string")
    .map(([id]) => id);

  const validSourceLayers = new Map<string, Set<string>>();
  await Promise.all(vectorSourceIds.map(async (id) => {
    try {
      const tilejson = await fetch(withApiKey(style.sources[id].url)).then(r => r.json());
      validSourceLayers.set(id, new Set((tilejson.vector_layers || []).map((l: { id: string }) => l.id)));
    } catch (err) {
      // If we can't fetch a source's TileJSON, don't drop its layers on that
      // basis alone — only filter what we can actually disprove.
      console.error(`[OlaMap] couldn't validate source "${id}"`, err);
    }
  }));

  style.layers = (style.layers || []).filter((layer: any) => {
    if (!layer.source || !layer["source-layer"]) return true; // background/raster layers etc.
    const known = validSourceLayers.get(layer.source);
    if (!known) return true; // source wasn't checked — leave it alone
    if (known.has(layer["source-layer"])) return true;
    console.error(`[OlaMap] dropping style layer "${layer.id}" — source-layer "${layer["source-layer"]}" not in source "${layer.source}"`);
    return false;
  });

  return style;
}

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
  // Company logo (tracker shipment orders only) — when set on a "truck"
  // marker, renders a Swiggy-style circular logo bubble with a small
  // rotating direction arrow instead of the generic truck silhouette.
  // Ignored for car/ambulance (Book-a-Ride icons never carry a company
  // logo) and for pin/plain markers.
  logoUrl?: string;
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

// Top-down vehicle silhouettes, all drawn pointing "up" (north) so a plain
// CSS rotate() on the wrapping <svg> lines the nose up with the computed
// heading — same rotor mechanism as before, just a real vehicle body instead
// of a circle badge. Each takes the marker color for the body fill; window/
// light details are fixed tones so they read at marker scale on any color.
const VEHICLE_SHAPES: Record<"truck" | "car" | "ambulance", (color: string) => string> = {
  car: (color) => `
    <path d="M20 3c6.5 0 11 5 11 12v42c0 8-5 13-11 13S9 65 9 57V15C9 8 13.5 3 20 3z" fill="${color}"/>
    <rect x="13" y="14" width="14" height="12" rx="4" fill="rgba(255,255,255,0.6)"/>
    <rect x="13" y="46" width="14" height="10" rx="4" fill="rgba(255,255,255,0.4)"/>
    <circle cx="12.5" cy="17" r="2.3" fill="#FFD54A"/>
    <circle cx="27.5" cy="17" r="2.3" fill="#FFD54A"/>
    <circle cx="12.5" cy="55" r="2" fill="#E53935"/>
    <circle cx="27.5" cy="55" r="2" fill="#E53935"/>`,
  truck: (color) => `
    <rect x="9" y="2" width="22" height="19" rx="6" fill="${color}"/>
    <rect x="13" y="6" width="14" height="9" rx="3" fill="rgba(255,255,255,0.6)"/>
    <circle cx="12.5" cy="16" r="2.2" fill="#FFD54A"/>
    <circle cx="27.5" cy="16" r="2.2" fill="#FFD54A"/>
    <rect x="6" y="22" width="28" height="50" rx="5" fill="${color}"/>
    <line x1="6" y1="37" x2="34" y2="37" stroke="rgba(0,0,0,0.18)" stroke-width="2"/>
    <line x1="6" y1="55" x2="34" y2="55" stroke="rgba(0,0,0,0.18)" stroke-width="2"/>
    <circle cx="12.5" cy="66" r="2" fill="#E53935"/>
    <circle cx="27.5" cy="66" r="2" fill="#E53935"/>`,
  ambulance: (color) => `
    <path d="M12 3h16a6 6 0 016 6v56a6 6 0 01-6 6H12a6 6 0 01-6-6V9a6 6 0 016-6z" fill="${color}"/>
    <rect x="7" y="5" width="26" height="5" rx="2.5" fill="#3B82F6"/>
    <rect x="12" y="15" width="16" height="12" rx="4" fill="rgba(255,255,255,0.6)"/>
    <circle cx="12" cy="18" r="2.2" fill="#FFD54A"/>
    <circle cx="28" cy="18" r="2.2" fill="#FFD54A"/>
    <rect x="14" y="40" width="12" height="4.5" rx="1.2" fill="#fff"/>
    <rect x="17.75" y="36.25" width="4.5" height="12" rx="1.2" fill="#fff"/>`,
};

// Wrapping <svg> (not a <div>) is the rotor — CSS transform:rotate() applied
// directly to it, with drop-shadow as an SVG filter so the shadow follows
// the silhouette's actual outline rather than a bounding-box rectangle,
// matching the "lifted off the map" look of real navigation apps.
function vehicleIconHtml(kind: "truck" | "car" | "ambulance", color: string) {
  const width = 34, height = 58;
  return `<svg width="${width}" height="${height}" viewBox="0 0 40 76" style="display:block;filter:drop-shadow(0 3px 4px rgba(0,0,0,0.4))">
    ${VEHICLE_SHAPES[kind](color)}
  </svg>`;
}

// Truck icon + small company-logo decal, used when the order's company has
// uploaded a logo. The truck itself is exactly vehicleIconHtml("truck", ...)
// — same first child, so the existing rotor mechanism (marker-update code
// rotates the marker element's *first* top-level child) keeps rotating the
// truck body exactly as before. The logo is a second, sibling <div>,
// absolutely positioned over the truck's top-right corner — never touched by
// the rotation code, so it stays upright/readable regardless of heading,
// matching how delivery apps decal a badge onto a rotating vehicle icon.
function truckLogoIconHtml(logoUrl: string, color: string) {
  return `${vehicleIconHtml("truck", color)}
  <div style="position:absolute;top:-2px;right:-4px;width:18px;height:18px;border-radius:50%;overflow:hidden;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.4);background:#fff;">
    <img src="${logoUrl}" style="width:100%;height:100%;object-fit:cover;display:block;" />
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
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
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
  // Set when map init throws (e.g. no WebGL context) or MapLibre emits a
  // fatal 'error' (e.g. style/tile fetch failing) — surfaces the failure
  // instead of leaving a silent blank canvas behind the loading skeleton.
  const [mapError, setMapError] = useState<string | null>(null);
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
    let cancelled = false;

    (async () => {
      let style: maplibregl.StyleSpecification;
      try {
        style = await fetchSanitizedStyle();
      } catch (err) {
        console.error("[OlaMap] failed to fetch/sanitize style", err);
        if (!cancelled) setMapError(err instanceof Error ? err.message : "Map style failed to load");
        return;
      }
      // Container may have unmounted (or another instance already claimed
      // it) while the style fetch above was in flight.
      if (cancelled || !ref.current || mapRef.current) return;

      let map: maplibregl.Map;
      try {
        map = new maplibregl.Map({
          container: ref.current,
          style,
          center, zoom,
          attributionControl: false,
          transformRequest: (url: string) => {
            if (url.includes("api.olamaps.io") && !url.includes("api_key")) {
              return { url: withApiKey(url) };
            }
            return { url };
          },
        });
      } catch (err) {
        // Most commonly a WebGL context failure (unsupported device/browser,
        // e.g. some in-app webviews) — MapLibre throws synchronously from the
        // constructor rather than emitting an 'error' event for this case.
        console.error("[OlaMap] failed to construct map (likely no WebGL support)", err);
        setMapError(err instanceof Error ? err.message : "Map failed to initialize");
        return;
      }
      // Fatal style/tile errors (bad key, 401/403, network) emit here instead
      // of throwing — without a listener MapLibre just throws async in a
      // timeout, which is easy to miss in production. Surface it explicitly.
      map.on("error", (e) => {
        console.error("[OlaMap] map error", e.error);
        setMapError(e.error?.message || "Map tiles failed to load");
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
      // Container size can change after construction for reasons MapLibre's
      // own mount-time read can't see — a parent flex/dvh chain still
      // settling, or a fullscreen toggle swapping wrapper classes — and
      // without a nudge the WebGL viewport stays sized to whatever the
      // container measured at construction time (confirmed live: this was
      // the root cause of a permanently blank map on /drive/[token], the
      // only OlaMap consumer that had no manual resize() call anywhere).
      // A ResizeObserver on the container itself is robust to any of these
      // cases without every call site needing its own setTimeout guess.
      if (ref.current) {
        const observer = new ResizeObserver(() => {
          mapRef.current?.resize();
        });
        observer.observe(ref.current);
        resizeObserverRef.current = observer;
      }
    })();

    return () => {
      cancelled = true;
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      mapRef.current?.remove();
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
    const apply = () => {
      const map = mapRef.current;
      if (!map) return;
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
    // mapRef.current is looked up fresh inside update(), not captured here —
    // at initial mount the map is still mid-construction (async style
    // fetch), so a snapshot taken now would always be null. Since markers
    // that never change again after mount (e.g. static A/B pins with no
    // live driver) never re-run this effect, bailing here would mean they
    // never get queued and never appear once the map does load — confirmed
    // live as the reason /drive/[token]'s dispatch pins and planned route
    // never rendered even after the map itself started painting tiles.
    const update = () => {
      const map = mapRef.current;
      if (!map) return;
      const list = latestMarkersRef.current;
      const seenAnimIds = new Set<string>();

      // Animated (id-tagged) markers — reuse the existing Marker instance
      // and lerp its position over ANIM_MS via RAF, instead of removing and
      // recreating it (which is what caused the old jump-per-fix look).
      list.forEach(m => {
        if (!m.id || m.lng == null || m.lat == null) return;
        seenAnimIds.add(m.id);
        const sig = `${m.color || ""}|${m.icon || ""}|${m.label || ""}|${m.logoUrl || ""}`;
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
          if (m.icon === "truck" && m.logoUrl) {
            el.innerHTML = truckLogoIconHtml(m.logoUrl, m.color || "#FF6B2B");
          } else if (m.icon === "truck" || m.icon === "car" || m.icon === "ambulance") {
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
        if (m.icon === "truck" && m.logoUrl) {
          el.innerHTML = truckLogoIconHtml(m.logoUrl, m.color || "#FF6B2B");
        } else if (m.icon === "truck" || m.icon === "car" || m.icon === "ambulance") {
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
    // Same fresh-lookup rule as the markers effect above — map must be read
    // inside the callback, not captured at effect-declaration time.
    const fitVisibleMarkers = () => {
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
    };
    if (loadedRef.current) fitVisibleMarkers(); else pendingRef.current.fit = fitVisibleMarkers;
  }, [fitToMarkers, fitTrigger]);

  useEffect(() => {
    const update = () => {
      const map = mapRef.current;
      if (!map) return;
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
    const update = () => {
      const map = mapRef.current;
      if (!map) return;
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
    const update = () => {
      const map = mapRef.current;
      if (!map || !map.getLayer("planned-route-line")) return;
      map.setPaintProperty("planned-route-line", "line-color", plannedRouteColor);
      // Passing undefined resets to the style default (no dasharray = solid).
      map.setPaintProperty("planned-route-line", "line-dasharray", plannedRouteDashed ? [2, 1.6] : undefined);
    };
    if (loadedRef.current) update(); else pendingRef.current.paint = update;
  }, [plannedRouteColor, plannedRouteDashed]);

  // "h-full" callers (every fullscreen/expand state, and /drive/[token]'s
  // only layout) mean "fill the nearest positioned ancestor" — every one of
  // them already wraps OlaMap in a position:relative element for exactly
  // this reason. Resolving that via CSS height:100% requires the immediate
  // parent to have a *definite* height, which a flex-grow item's used size
  // doesn't reliably count as here — confirmed live: it left /drive/[token]
  // with a permanently zero-height container and a blank map. Absolute
  // inset-0 fills the positioned ancestor directly, sidestepping that
  // requirement entirely. Fixed (h-72, h-40) and viewport-relative
  // (h-[60vh]) callers don't have this problem — those sizes resolve on
  // their own — so they keep normal block flow.
  const fillParent = className.includes("h-full");

  return (
    <div className={fillParent ? "absolute inset-0" : `relative ${className}`}>
      {/* Inline style, not a Tailwind class: MapLibre's own stylesheet ships
          ".maplibregl-map { position: relative }" and applies that class to
          whatever container it's given post-construction — a same-specificity
          class rule that silently wins the cascade over our "absolute" utility
          depending on import order, breaking inset-0 sizing. An inline style
          can't lose to a stylesheet class. */}
      <div ref={ref} style={{ position: "absolute", inset: 0 }} />
      {!loaded && !mapError && (
        <div className="absolute inset-0 z-[5] bg-gray-100 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-orange-500 animate-pulse" />
            <span className="text-xs font-semibold text-gray-400">Loading map…</span>
          </div>
        </div>
      )}
      {mapError && (
        <div className="absolute inset-0 z-[5] bg-gray-100 flex items-center justify-center p-4">
          <p className="text-xs font-semibold text-gray-400 text-center">Map couldn&apos;t load on this device.</p>
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
