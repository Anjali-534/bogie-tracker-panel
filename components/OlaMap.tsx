"use client";
import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const OLA_KEY = process.env.NEXT_PUBLIC_OLA_MAPS_KEY || "";
const STYLE_URL = `https://api.olamaps.io/tiles/vector/v1/styles/default-light-standard/style.json?api_key=${OLA_KEY}`;

export type OlaMarker = { lng: number; lat: number; color?: string; label?: string; popup?: string };

type OlaMapProps = {
  center?: [number, number]; // [lng, lat]
  zoom?: number;
  markers?: OlaMarker[];
  route?: [number, number][]; // [lng, lat][] — GeoJSON LineString (solid orange — actual trail)
  plannedRoute?: [number, number][]; // [lng, lat][] — dashed lighter line under the trail
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

export default function OlaMap({
  center = [77.2090, 28.6139],
  zoom = 12,
  markers = [],
  route,
  plannedRoute,
  fitToMarkers = false,
  fitTrigger = 0,
  className = "w-full h-80 rounded-2xl overflow-hidden",
  onMapReady,
}: OlaMapProps) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const latestMarkersRef = useRef<OlaMarker[]>(markers);
  const latestPlannedRouteRef = useRef<[number, number][] | undefined>(plannedRoute);
  // isStyleLoaded() is unreliable around the load event (can be true before
  // our load handler has added the sources, or transiently false after it),
  // so track readiness ourselves and queue updates that arrive too early.
  const loadedRef = useRef(false);
  const pendingRef = useRef<{ markers?: () => void; route?: () => void; planned?: () => void; fit?: () => void }>({});

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: ref.current,
      style: STYLE_URL,
      center, zoom,
      transformRequest: (url: string) => {
        if (url.includes("api.olamaps.io") && !url.includes("api_key")) {
          return { url: url + (url.includes("?") ? "&" : "?") + `api_key=${OLA_KEY}` };
        }
        return { url };
      },
    });
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.on("load", () => {
      // Planned route goes in first so the actual trail draws on top of it.
      map.addSource("planned-route", {
        type: "geojson",
        data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } },
      });
      map.addLayer({
        id: "planned-route-line", type: "line", source: "planned-route",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#FDBA74", "line-width": 3, "line-opacity": 0.9, "line-dasharray": [2, 2] },
      });
      map.addSource("route", {
        type: "geojson",
        data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } },
      });
      map.addLayer({
        id: "route-line", type: "line", source: "route",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#FF6B2B", "line-width": 4, "line-opacity": 0.85 },
      });
      loadedRef.current = true;
      pendingRef.current.markers?.();
      pendingRef.current.route?.();
      pendingRef.current.planned?.();
      pendingRef.current.fit?.();
      pendingRef.current = {};
      onMapReady?.(map);
    });
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; loadedRef.current = false; pendingRef.current = {}; };
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
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];
      latestMarkersRef.current.forEach(m => {
        if (m.lng == null || m.lat == null) return;
        const el = document.createElement("div");
        el.style.cssText = `width:28px;height:28px;border-radius:50%;background:${m.color || "#FF6B2B"};border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;font-size:13px;color:#fff;font-weight:800`;
        if (m.label) el.textContent = m.label;
        const marker = new maplibregl.Marker({ element: el }).setLngLat([m.lng, m.lat]);
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
