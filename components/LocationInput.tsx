'use client';
import { useEffect, useRef, useState } from 'react';
import { LocateFixed, MapPin } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { olaAutocomplete, olaPlaceDetails, type OlaSuggestion } from '@/lib/olaPlaces';

const DEBOUNCE_MS = 300;
const MIN_CHARS = 2;

interface Props {
  label: string;
  value: string;
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
export default function LocationInput({ label, value, onChange, placeholder, className, labelClassName }: Props) {
  const [suggestions, setSuggestions] = useState<OlaSuggestion[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [locating, setLocating] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
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
      const results = await olaAutocomplete(text);
      setSuggestions(results);
      setShowDropdown(results.length > 0);
    }, DEBOUNCE_MS);
  }

  async function selectSuggestion(s: OlaSuggestion) {
    setShowDropdown(false);
    setSuggestions([]);
    let lat = s.lat;
    let lng = s.lng;
    if (lat == null || lng == null) {
      const details = await olaPlaceDetails(s.place_id);
      if (details) { lat = details.lat; lng = details.lng; }
    }
    onChange(s.description, lat, lng);
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
              onClick={() => selectSuggestion(s)}
              className="flex items-start gap-2 w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <MapPin size={14} className="flex-shrink-0 mt-0.5 text-gray-400" />
              {s.description}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
