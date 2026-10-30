// Google Places API (New) Text Search — the only automated discovery source (A4 source 3).
// Official API, server-side key, only the fields we need (billing is per field mask).

type FetchFn = typeof fetch;

export interface PlaceResult {
  placeId: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  types: string[];
  phone: string | null;
  rating: number | null;
  ratingCount: number | null;
  mapsUrl: string | null;
}

export interface PlacesClient {
  searchText(
    query: string,
    opts?: { pageToken?: string },
  ): Promise<{ places: PlaceResult[]; nextPageToken: string | null }>;
  details(placeId: string): Promise<PlaceResult | null>;
}

export class PlacesError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const FIELDS = [
  'id',
  'displayName',
  'formattedAddress',
  'location',
  'types',
  'nationalPhoneNumber',
  'internationalPhoneNumber',
  'rating',
  'userRatingCount',
  'googleMapsUri',
];

// Surxondaryo viloyati (A4 default region).
const SURXONDARYO = { low: { latitude: 37.1, longitude: 66.5 }, high: { latitude: 38.9, longitude: 68.6 } };

interface RawPlace {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  types?: string[];
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
}

export function mapPlace(p: RawPlace): PlaceResult | null {
  if (!p.id || !p.displayName?.text) return null;
  return {
    placeId: p.id,
    name: p.displayName.text,
    address: p.formattedAddress ?? null,
    lat: p.location?.latitude ?? null,
    lng: p.location?.longitude ?? null,
    types: p.types ?? [],
    phone: p.internationalPhoneNumber ?? p.nationalPhoneNumber ?? null,
    rating: p.rating ?? null,
    ratingCount: p.userRatingCount ?? null,
    mapsUrl: p.googleMapsUri ?? null,
  };
}

export function placesClient(apiKey: string, fetchFn: FetchFn = fetch): PlacesClient {
  const call = async (url: string, init: RequestInit, mask: string) => {
    let res: Response;
    try {
      res = await fetchFn(url, {
        ...init,
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey, 'x-goog-fieldmask': mask },
        signal: AbortSignal.timeout(20_000),
      });
    } catch (e) {
      throw new PlacesError(`Google Places unreachable: ${(e as Error).message}`, 0);
    }
    if (res.status === 404) return null;
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      throw new PlacesError(`Google Places HTTP ${res.status}: ${body?.error?.message ?? 'error'}`, res.status);
    }
    return res.json();
  };
  return {
    async searchText(query, opts = {}) {
      const body = (await call(
        'https://places.googleapis.com/v1/places:searchText',
        {
          method: 'POST',
          body: JSON.stringify({
            textQuery: query,
            languageCode: 'uz',
            regionCode: 'UZ',
            pageSize: 20,
            locationRestriction: { rectangle: SURXONDARYO },
            ...(opts.pageToken ? { pageToken: opts.pageToken } : {}),
          }),
        },
        [...FIELDS.map((f) => `places.${f}`), 'nextPageToken'].join(','),
      )) as { places?: RawPlace[]; nextPageToken?: string } | null;
      return {
        places: (body?.places ?? []).map(mapPlace).filter((p): p is PlaceResult => p !== null),
        nextPageToken: body?.nextPageToken ?? null,
      };
    },
    async details(placeId) {
      const body = (await call(
        `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
        { method: 'GET' },
        FIELDS.join(','),
      )) as RawPlace | null;
      return body ? mapPlace(body) : null;
    },
  };
}
