// Autocomplete/place-details via the backend's Google Places (New) proxy
// (backend/internal/api/handlers/google_places.go) — swapped in for
// olaPlaces.ts specifically because Ola's autocomplete ranking breaks down
// on plot-number + locality queries. Map tiles/pin display stay on Ola
// (OlaMap.tsx); this only ever returns text + coordinates, which OlaMap
// already consumes as plain numbers regardless of provider.
//
// The backend's response shape is pre-normalized to exactly match
// OlaSuggestion, so this is a near-passthrough with no mapping logic.
import { api } from './api';

export interface OlaSuggestion {
  description: string;
  place_id: string;
  lat: number | null;
  lng: number | null;
}

export async function olaAutocomplete(input: string, lat?: number, lng?: number): Promise<OlaSuggestion[]> {
  try {
    const params: Record<string, string | number> = { input };
    if (lat != null && lng != null) { params.lat = lat; params.lng = lng; }
    const { data } = await api.get('/gogoo/places/autocomplete', { params });
    return data?.predictions || [];
  } catch {
    return [];
  }
}

export async function olaPlaceDetails(placeId: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const { data } = await api.get('/gogoo/places/details', { params: { place_id: placeId } });
    return data?.lat != null && data?.lng != null ? { lat: data.lat, lng: data.lng } : null;
  } catch {
    return null;
  }
}
