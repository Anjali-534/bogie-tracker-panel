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
  route?: [number, number][]; // [lng, lat][] — GeoJSON LineString
  fitToMarkers?: boolean;
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
  fitToMarkers = false,
  className = "w-full h-80 rounded-2xl overflow-hidden",
  onMapReady,
}: OlaMapProps) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);

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
      map.addSource("route", {
        type: "geojson",
        data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } },
      });
      map.addLayer({
        id: "route-line", type: "line", source: "route",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#FF6B2B", "line-width": 4, "line-opacity": 0.85 },
      });
      onMapReady?.(map);
    });
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const update = () => {
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];
      const bounds = new maplibregl.LngLatBounds();
      let count = 0;
      markers.forEach(m => {
        if (m.lng == null || m.lat == null) return;
        const el = document.createElement("div");
        el.style.cssText = `width:28px;height:28px;border-radius:50%;background:${m.color || "#FF6B2B"};border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;font-size:13px;color:#fff;font-weight:800`;
        if (m.label) el.textContent = m.label;
        const marker = new maplibregl.Marker({ element: el }).setLngLat([m.lng, m.lat]);
        if (m.popup) marker.setPopup(new maplibregl.Popup({ offset: 16 }).setHTML(m.popup));
        marker.addTo(map);
        markersRef.current.push(marker);
        bounds.extend([m.lng, m.lat]);
        count++;
      });
      if (fitToMarkers && count > 0) {
        if (count === 1) map.easeTo({ center: bounds.getCenter(), zoom: 14, duration: 500 });
        else map.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 500 });
      }
    };
    if (map.isStyleLoaded()) update(); else map.once("load", update);
  }, [JSON.stringify(markers), fitToMarkers]);

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
    if (map.isStyleLoaded()) update(); else map.once("load", update);
  }, [JSON.stringify(route)]);

  return <div ref={ref} className={className} />;
}
