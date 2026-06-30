// ─── NODAL Places Proximity ───────────────────────────────────────────────────
// Tool 1.5 (optional): given the issue's GPS, find civic-critical facilities
// (hospital/school/bus_station/police/fire_station) within 500m via the Google
// Places API (New) and turn that into (a) a prompt context string and (b) a
// deterministic severity boost. Entirely best-effort: if the key is missing or
// the call fails, callers get `null` and fall back to the un-boosted severity.
//
// Uses Places API (New): POST https://places.googleapis.com/v1/places:searchNearby
// (enable "Places API (New)" for GOOGLE_PLACES_API_KEY).

import { ProximityPlace } from '@/types';

// Facility types we care about, in priority order (a place can match several).
const RELEVANT_TYPES = ['hospital', 'school', 'bus_station', 'police', 'fire_station'] as const;
type RelevantType = (typeof RELEVANT_TYPES)[number];

const TYPE_LABEL: Record<RelevantType, string> = {
  hospital: 'Hospital',
  school: 'School',
  bus_station: 'Bus Station',
  police: 'Police',
  fire_station: 'Fire Station',
};

export interface NearbyContext {
  places: ProximityPlace[];               // nearest facility per matched type, sorted by distance
  contextString: string;                  // "Nearby: Apollo Hospital (180m), Govt School (320m)"
  nearest: Partial<Record<RelevantType, number>>; // type -> nearest distance in metres
}

// Haversine distance in metres between two lat/lng points.
function distanceM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)));
}

interface PlaceV1 {
  displayName?: { text?: string };
  location?: { latitude?: number; longitude?: number };
  types?: string[];
}

export async function getNearbyContext(lat: number, lng: number): Promise<NearbyContext | null> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return null;

  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'places.displayName,places.location,places.types',
      },
      body: JSON.stringify({
        includedTypes: [...RELEVANT_TYPES],
        maxResultCount: 20,
        locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius: 500 } },
      }),
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) {
      console.warn('[places] non-OK response:', res.status);
      return null;
    }

    const data = (await res.json()) as { places?: PlaceV1[] };
    const raw = data.places ?? [];

    // Keep the nearest facility per relevant type.
    const best = new Map<RelevantType, ProximityPlace>();
    for (const p of raw) {
      const pl = p.location;
      if (!pl?.latitude || !pl?.longitude) continue;
      const type = RELEVANT_TYPES.find((t) => p.types?.includes(t));
      if (!type) continue;
      const d = distanceM(lat, lng, pl.latitude, pl.longitude);
      const prev = best.get(type);
      if (!prev || d < prev.distanceM) {
        best.set(type, { name: p.displayName?.text || TYPE_LABEL[type], type, distanceM: d });
      }
    }

    const places = [...best.values()].sort((a, b) => a.distanceM - b.distanceM);
    if (places.length === 0) return null;

    const nearest: Partial<Record<RelevantType, number>> = {};
    for (const pl of places) nearest[pl.type as RelevantType] = pl.distanceM;

    const contextString =
      'Nearby: ' + places.map((p) => `${p.name} (${p.distanceM}m)`).join(', ');

    return { places, contextString, nearest };
  } catch (e) {
    console.warn('[places] lookup failed:', (e as Error)?.message);
    return null;
  }
}

// Deterministic severity boost on NODAL's 1–10 scale. The original spec used a
// 0–100 scale (+20 hospital / +15 school / +10 bus, cap 100); NODAL stores
// severity 1–10 (DB CHECK + UI thresholds), so the boost is scaled ÷10.
// ponytail: emergency services (police/fire) are in the context string but not
// the numeric boost — add a rung here if they should bump severity too.
export function proximityBoost(nearest: NearbyContext['nearest']): {
  boost: number;
  reasons: string[];
} {
  const reasons: string[] = [];
  let boost = 0;
  if (nearest.hospital != null && nearest.hospital <= 300) {
    boost += 1;
    reasons.push(`hospital ${nearest.hospital}m away (+1)`);
  }
  if (nearest.school != null && nearest.school <= 400) {
    boost += 1;
    reasons.push(`school ${nearest.school}m away (+1)`);
  }
  if (nearest.bus_station != null && nearest.bus_station <= 200) {
    boost += 0.5;
    reasons.push(`bus station ${nearest.bus_station}m away (+0.5)`);
  }
  return { boost, reasons };
}
