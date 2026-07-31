'use client';
import { useEffect, useRef, useState } from 'react';
import { LocateFixed, MapPin, Maximize2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { olaAutocomplete, olaPlaceDetails, type OlaSuggestion } from '@/lib/olaPlaces';
import OlaMap from '@/components/OlaMap';

const DEBOUNCE_MS = 300;
const MIN_CHARS = 2;
// Delhi NCR — tracker companies are predominantly NCR-based, so this is a
// reasonable proximity-bias fallback when geolocation isn't granted.
const DEFAULT_BIAS = { lat: 28.6139, lng: 77.2090 };

interface Props {
  label: string;
  value: string;
  lat: number | null;
  lng: number | null;
  onChange: (address: string, lat: number | null, lng: number | null) => void;
  placeholder?: string;
  className: string;
  labelClassName: string;
}

// Ported from user-app's location-picker pattern: Ola Places autocomplete
// (client-direct, public key), debounced search-as-you-type, a suggestion
// resolves to {address, lat, lng} via place-details when the autocomplete
// result didn't already embed coordinates. Unlike the mobile app, manual
// free-text typing without ever picking a suggestion is fully valid here —
// it just means lat/lng stay null, which the backend accepts.
//
// lat/lng are controlled by the parent (same state it sends on submit) so
// that once coordinates exist — from a suggestion, "use current location",
// the forward-geocode blur fallback below, or a manual pin drag — a small
// map preview appears with a draggable pin. Ola's India address data can't
// always pinpoint granular addresses (khasra numbers, specific plots), so
// the pin lets the user correct the resolved point by hand; the dragged
// position becomes the new lat/lng, same as picking a suggestion would.
export default function LocationInput({ label, value, lat, lng, onChange, placeholder, className, labelClassName }: Props) {
  const [suggestions, setSuggestions] = useState<OlaSuggestion[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [locating, setLocating] = useState(false);
  const [fitTrigger, setFitTrigger] = useState(0);
  const [mapExpanded, setMapExpanded] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // OlaMap has its own ResizeObserver on the map container, so no manual
  // resize() nudge is needed here anymore — it reacts to the fullscreen
  // class swap on its own.
  useEffect(() => {
    document.body.style.overflow = mapExpanded ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mapExpanded]);
  // Biases autocomplete toward the user's rough location; falls back to
  // Delhi NCR if geolocation is unavailable or denied.
  const biasRef = useRef(DEFAULT_BIAS);

  // Recenters the preview map whenever the resolved point changes — a new
  // suggestion, the blur fallback resolving, or current-location. Also fires
  // on a pin drag, which is a no-op recenter onto the spot it's already at.
  useEffect(() => {
    if (lat != null && lng != null) setFitTrigger(t => t + 1);
  }, [lat, lng]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => { biasRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude }; },
      () => {},
      { enableHighAccuracy: false, timeout: 8000 },
    );
  }, []);

  function handleTextChange(text: string) {
    // Typing invalidates any previously picked coordinates — the address no
    // longer necessarily matches them. Free text with no coords is still a
    // fully valid, submittable address.
    onChange(text, null, null);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length < MIN_CHARS) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const { lat, lng } = biasRef.current;
      const results = await olaAutocomplete(text, lat, lng);
      setSuggestions(results);
      setShowDropdown(results.length > 0);
    }, DEBOUNCE_MS);
  }

  async function selectSuggestion(s: OlaSuggestion) {
    setShowDropdown(false);
    setSuggestions([]);
    let sLat = s.lat;
    let sLng = s.lng;
    if (sLat == null || sLng == null) {
      const details = await olaPlaceDetails(s.place_id);
      if (details) { sLat = details.lat; sLng = details.lng; }
    }
    onChange(s.description, sLat, sLng);
  }

  // Free-text addresses that were typed but never picked from the dropdown
  // (or the dropdown had no match at all — the same khasra/plot-number gap
  // that motivated this fallback) still deserve a preview pin so the user
  // can drag it into place. Only fires once the field is left and only if
  // a suggestion pick or drag hasn't already supplied coordinates.
  async function handleBlur() {
    const text = value.trim();
    if (lat != null && lng != null) return;
    if (text.length < MIN_CHARS) return;
    try {
      const { data } = await api.get('/gogoo/geocode/forward', { params: { address: text } });
      if (data.lat != null && data.lng != null) onChange(value, data.lat, data.lng);
    } catch {
      // Silent — this is a best-effort preview aid, not a required step.
    }
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      toast.error('Geolocation not supported on this device');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          const { data } = await api.get('/gogoo/geocode/reverse', { params: { lat: latitude, lng: longitude } });
          onChange(data.address || `${latitude}, ${longitude}`, latitude, longitude);
        } catch {
          onChange(`${latitude}, ${longitude}`, latitude, longitude);
        } finally {
          setLocating(false);
        }
      },
      (err) => {
        setLocating(false);
        toast.error(err.code === err.PERMISSION_DENIED ? 'Location permission denied' : 'Could not get current location');
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <label className={labelClassName}>{label}</label>
      <div className="flex gap-2">
        <input
          value={value}
          onChange={e => handleTextChange(e.target.value)}
          onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
          onBlur={handleBlur}
          className={className}
          placeholder={placeholder}
          autoComplete="off"
        />
        <button
          type="button"
          onClick={useCurrentLocation}
          disabled={locating}
          title="Use current location"
          className="flex-shrink-0 px-3 border border-gray-200 rounded-xl text-gray-500 hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          <LocateFixed size={16} className={locating ? 'animate-pulse' : ''} />
        </button>
      </div>
      {showDropdown && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          {suggestions.map(s => (
            <button
              key={s.place_id}
              type="button"
              // Keeps focus on the input through the click so `onBlur`'s
              // forward-geocode fallback can't race selectSuggestion's more
              // precise place-details lookup and clobber it.
              onMouseDown={e => e.preventDefault()}
              onClick={() => selectSuggestion(s)}
              className="flex items-start gap-2 w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <MapPin size={14} className="flex-shrink-0 mt-0.5 text-gray-400" />
              {s.description}
            </button>
          ))}
        </div>
      )}
      {lat != null && lng != null && (
        <div
          className={mapExpanded
            ? 'fixed inset-0 z-50 bg-white flex flex-col sheet-expand'
            : 'mt-2 space-y-1'}
        >
          {mapExpanded && (
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <span className="text-sm font-bold text-gray-900">{label}</span>
              <button
                type="button"
                onClick={() => setMapExpanded(false)}
                aria-label="Collapse map"
                className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
              >
                <X size={18} className="text-gray-600" />
              </button>
            </div>
          )}
          <div className={mapExpanded ? 'relative flex-1 min-h-0' : 'relative'}>
            <OlaMap
              center={[lng, lat]}
              zoom={15}
              markers={[{ lng, lat, icon: 'pin', color: '#FF6B2B', draggable: true }]}
              fitToMarkers
              fitTrigger={fitTrigger}
              onMarkerDragEnd={ll => onChange(value, ll.lat, ll.lng)}
              className={mapExpanded ? 'w-full h-full' : 'w-full h-40 rounded-xl overflow-hidden border border-gray-200'}
            />
            {!mapExpanded && (
              <button
                type="button"
                onClick={() => setMapExpanded(true)}
                aria-label="Expand map"
                className="absolute top-2 left-2 w-9 h-9 flex items-center justify-center bg-white rounded-lg border border-gray-200 shadow-md"
              >
                <Maximize2 size={16} className="text-gray-700" />
              </button>
            )}
          </div>
          {!mapExpanded && (
            <p className="text-[11px] text-gray-400">Drag the pin to your exact location if needed</p>
          )}
        </div>
      )}
    </div>
  );
}
