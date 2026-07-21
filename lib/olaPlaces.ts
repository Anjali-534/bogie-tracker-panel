// Client-direct Ola Places calls, ported from user-app/services/olamaps.ts.
// Autocomplete/place-details use the public map key (same one already
// exposed for map tiles); "use current location" reverse-geocodes through
// the backend proxy instead (see LocationInput.tsx), which is the pattern
// the panels use to keep the server-side Ola key off the frontend for that
// call specifically.
const OLA_KEY = process.env.NEXT_PUBLIC_OLA_MAPS_KEY || '';
const BASE = 'https://api.olamaps.io';

export interface OlaSuggestion {
  description: string;
  place_id: string;
  lat: number | null;
  lng: number | null;
}

export async function olaAutocomplete(input: string, lat?: number, lng?: number): Promise<OlaSuggestion[]> {
  try {
    let url = `${BASE}/places/v1/autocomplete?input=${encodeURIComponent(input)}&api_key=${OLA_KEY}`;
    if (lat != null && lng != null) url += `&location=${lat},${lng}`;
    url += `&components=country:in`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const preds = data?.predictions || [];
    return preds
      .map((p: { description?: string; structured_formatting?: { main_text?: string }; place_id?: string; geometry?: { location?: { lat?: number; lng?: number } } }) => ({
        description: p?.description || p?.structured_formatting?.main_text || '',
        place_id: p?.place_id || '',
        lat: p?.geometry?.location?.lat ?? null,
        lng: p?.geometry?.location?.lng ?? null,
      }))
      .filter((p: OlaSuggestion) => p.description && p.place_id);
  } catch {
    return [];
  }
}

export async function olaPlaceDetails(placeId: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(`${BASE}/places/v1/details?place_id=${placeId}&api_key=${OLA_KEY}`);
    if (!res.ok) return null;
    const data = await res.json();
    const loc = data?.result?.geometry?.location;
    return loc ? { lat: loc.lat, lng: loc.lng } : null;
  } catch {
    return null;
  }
}
