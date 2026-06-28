// ─── NODAL Routing Matrix ────────────────────────────────────────────────────
// The technical moat. Maps [city][category] → exact government department.
// No AI needed here — deterministic, fast, zero API cost.
//
// Sources:
//   Chennai:   https://www.chennaicorporation.gov.in
//   Bengaluru: https://bbmp.gov.in
//   Mumbai:    https://mcgm.gov.in
//   Delhi:     https://mcdonline.nic.in
//
// Open Source Attribution:
//   City boundary detection uses OSM Nominatim (ODbL license)
//   https://nominatim.openstreetmap.org

import {
  SupportedCity,
  IssueCategory,
  DepartmentInfo,
  RouteResult,
} from '@/types';

// ── India Bounding Box (for validation) ──────────────────────────────────────
export const INDIA_BOUNDS = {
  minLat: 8.0,
  maxLat: 37.5,
  minLng: 68.0,
  maxLng: 97.5,
};

// ── City Bounding Boxes ───────────────────────────────────────────────────────
const CITY_BOUNDS: Record<SupportedCity, { minLat: number; maxLat: number; minLng: number; maxLng: number }> = {
  Chennai: { minLat: 12.75, maxLat: 13.25, minLng: 80.05, maxLng: 80.35 },
  Bengaluru: { minLat: 12.75, maxLat: 13.20, minLng: 77.40, maxLng: 77.80 },
  Mumbai: { minLat: 18.85, maxLat: 19.30, minLng: 72.75, maxLng: 73.05 },
  Delhi: { minLat: 28.40, maxLat: 28.90, minLng: 76.80, maxLng: 77.40 },
};

// ── Routing Matrix ────────────────────────────────────────────────────────────
// Structure: routingMatrix[city][category] = DepartmentInfo
type RoutingMatrix = Record<SupportedCity, Record<IssueCategory, DepartmentInfo>>;

export const routingMatrix: RoutingMatrix = {
  Chennai: {
    damaged_road: {
      name: 'GCC Roads & Infrastructure Division',
      email: 'roads@chennaicorporation.gov.in',
      phone: '044-25384520',
      avgResolutionDays: 7,
    },
    broken_footpath: {
      name: 'GCC Footpaths & Walkways Division',
      email: 'footpaths@chennaicorporation.gov.in',
      phone: '044-25384521',
      avgResolutionDays: 10,
    },
    waterlogging: {
      name: 'CMWSSB (Chennai Metro Water Supply & Sewerage Board)',
      email: 'complaints@cmwssb.gov.in',
      phone: '044-28592828',
      avgResolutionDays: 5,
    },
    damaged_streetlight: {
      name: 'TANGEDCO Chennai Distribution Circle',
      email: 'complaints@tangedco.gov.in',
      phone: '044-28521144',
      avgResolutionDays: 3,
    },
    waste_dumping: {
      name: 'GCC Solid Waste Management Wing',
      email: 'solidwaste@chennaicorporation.gov.in',
      phone: '044-25384510',
      avgResolutionDays: 2,
    },
    broken_ramp_accessibility: {
      name: 'GCC Footpaths & Accessibility Division (RPWD Nodal Officer)',
      email: 'accessibility@chennaicorporation.gov.in',
      phone: '044-25384522',
      avgResolutionDays: 14,
    },
    dangerous_excavation: {
      name: 'GCC Roads & Infrastructure Division (Emergency)',
      email: 'emergency.roads@chennaicorporation.gov.in',
      phone: '044-25384519',
      avgResolutionDays: 1,
    },
    other: {
      name: 'GCC Control Room',
      email: 'controlroom@chennaicorporation.gov.in',
      phone: '1913',
      avgResolutionDays: 7,
    },
  },

  Bengaluru: {
    damaged_road: {
      name: 'BBMP Roads & Infrastructure Department',
      email: 'roads@bbmp.gov.in',
      phone: '080-22221188',
      avgResolutionDays: 7,
    },
    broken_footpath: {
      name: 'BBMP Footpaths & Pedestrian Infrastructure',
      email: 'footpaths@bbmp.gov.in',
      phone: '080-22221189',
      avgResolutionDays: 12,
    },
    waterlogging: {
      name: 'BWSSB (Bengaluru Water Supply & Sewerage Board)',
      email: 'complaints@bwssb.gov.in',
      phone: '1916',
      avgResolutionDays: 4,
    },
    damaged_streetlight: {
      name: 'BESCOM (Bangalore Electricity Supply Company)',
      email: 'complaints@bescom.co.in',
      phone: '1912',
      avgResolutionDays: 2,
    },
    waste_dumping: {
      name: 'BBMP Solid Waste Management Department',
      email: 'swm@bbmp.gov.in',
      phone: '080-22221177',
      avgResolutionDays: 2,
    },
    broken_ramp_accessibility: {
      name: 'BBMP Footpaths & Accessibility Wing (RPWD Nodal)',
      email: 'accessibility@bbmp.gov.in',
      phone: '080-22221190',
      avgResolutionDays: 15,
    },
    dangerous_excavation: {
      name: 'BBMP Roads Department (Emergency Cell)',
      email: 'emergency@bbmp.gov.in',
      phone: '080-22221100',
      avgResolutionDays: 1,
    },
    other: {
      name: 'BBMP Control Room',
      email: 'helpline@bbmp.gov.in',
      phone: '1533',
      avgResolutionDays: 7,
    },
  },

  Mumbai: {
    damaged_road: {
      name: 'BMC Roads Department (Ward-level)',
      email: 'roads@mcgm.gov.in',
      phone: '1916',
      avgResolutionDays: 10,
    },
    broken_footpath: {
      name: 'BMC Footpath & Pedestrian Infrastructure Cell',
      email: 'footpath@mcgm.gov.in',
      phone: '022-22620251',
      avgResolutionDays: 14,
    },
    waterlogging: {
      name: 'BMC Storm Water Drain Department',
      email: 'swd@mcgm.gov.in',
      phone: '022-22620252',
      avgResolutionDays: 5,
    },
    damaged_streetlight: {
      name: 'MSEDCL Mumbai Urban Distribution',
      email: 'grievance@mahadiscom.in',
      phone: '1912',
      avgResolutionDays: 2,
    },
    waste_dumping: {
      name: 'BMC Solid Waste Management Department',
      email: 'swm@mcgm.gov.in',
      phone: '1800-228-111',
      avgResolutionDays: 3,
    },
    broken_ramp_accessibility: {
      name: 'BMC Footpath Cell — RPWD Act Nodal Officer',
      email: 'accessibility@mcgm.gov.in',
      phone: '022-22620255',
      avgResolutionDays: 21,
    },
    dangerous_excavation: {
      name: 'BMC Roads Emergency Cell',
      email: 'emergency.roads@mcgm.gov.in',
      phone: '022-22620100',
      avgResolutionDays: 1,
    },
    other: {
      name: 'BMC Citizen Control Room',
      email: 'citizen@mcgm.gov.in',
      phone: '1916',
      avgResolutionDays: 7,
    },
  },

  Delhi: {
    damaged_road: {
      name: 'MCD Roads & Engineering Department',
      email: 'roads@mcdonline.nic.in',
      phone: '011-23222200',
      avgResolutionDays: 8,
    },
    broken_footpath: {
      name: 'MCD Footpath & Civil Works Division',
      email: 'footpath@mcdonline.nic.in',
      phone: '011-23222201',
      avgResolutionDays: 12,
    },
    waterlogging: {
      name: 'DJB (Delhi Jal Board) — Drainage Division',
      email: 'drainage@djb.gov.in',
      phone: '1800-11-0055',
      avgResolutionDays: 4,
    },
    damaged_streetlight: {
      name: 'BSES Yamuna / TPDDL (by zone)',
      email: 'consumercare@bses.in',
      phone: '19123',
      avgResolutionDays: 2,
    },
    waste_dumping: {
      name: 'MCD Sanitation & Solid Waste Department',
      email: 'swm@mcdonline.nic.in',
      phone: '1800-11-5555',
      avgResolutionDays: 2,
    },
    broken_ramp_accessibility: {
      name: 'MCD Accessibility Cell — RPWD Act Nodal Officer',
      email: 'accessibility@mcdonline.nic.in',
      phone: '011-23222210',
      avgResolutionDays: 21,
    },
    dangerous_excavation: {
      name: 'MCD Roads Emergency Wing',
      email: 'emergency@mcdonline.nic.in',
      phone: '011-23222100',
      avgResolutionDays: 1,
    },
    other: {
      name: 'MCD Citizen Helpline',
      email: 'citizen@mcdonline.nic.in',
      phone: '155305',
      avgResolutionDays: 7,
    },
  },
};

// ── City Detection from GPS ───────────────────────────────────────────────────
export function detectCityFromGPS(lat: number, lng: number): SupportedCity | null {
  for (const [city, bounds] of Object.entries(CITY_BOUNDS)) {
    if (
      lat >= bounds.minLat &&
      lat <= bounds.maxLat &&
      lng >= bounds.minLng &&
      lng <= bounds.maxLng
    ) {
      return city as SupportedCity;
    }
  }
  return null;
}

// ── Validate GPS is in India ──────────────────────────────────────────────────
export function isInIndia(lat: number, lng: number): boolean {
  return (
    lat >= INDIA_BOUNDS.minLat &&
    lat <= INDIA_BOUNDS.maxLat &&
    lng >= INDIA_BOUNDS.minLng &&
    lng <= INDIA_BOUNDS.maxLng
  );
}

// In-memory geocoding cache. Keys are coordinates rounded to 3 decimal places (~110m accuracy).
const geocodeCache = new Map<string, { city: SupportedCity; ward: string }>();

// ── Route an Issue ────────────────────────────────────────────────────────────
export async function routeIssue(
  lat: number,
  lng: number,
  category: IssueCategory,
  overrides?: { city?: SupportedCity; ward?: string }
): Promise<RouteResult> {
  // Citizen-confirmed routing (item 3): if the user corrected the city/ward on
  // the confirmation card, trust it and skip geocoding entirely.
  if (overrides?.city) {
    return {
      city: overrides.city,
      ward: overrides.ward || 'Central Area',
      department: routingMatrix[overrides.city][category],
    };
  }

  const cacheKey = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  const cached = geocodeCache.get(cacheKey);

  if (cached) {
    console.log(`[route_issue] Cache hit for ${cacheKey} -> ${cached.ward}, ${cached.city}`);
    return {
      city: cached.city,
      ward: cached.ward,
      department: routingMatrix[cached.city][category],
    };
  }

  // Step 1: Detect city from GPS bounding box (instant, no API)
  let city = detectCityFromGPS(lat, lng);
  let ward = 'Unknown Ward';

  // Step 2: Try Nominatim for ward-level detail
  // Attribution: Nominatim by OpenStreetMap — https://nominatim.org
  // Usage Policy: https://operations.osmfoundation.org/policies/nominatim/
  try {
    const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14&addressdetails=1`;
    const response = await fetch(nominatimUrl, {
      headers: { 'User-Agent': 'NODAL Civic App (hackathon) / nodal-civic@example.com' },
      signal: AbortSignal.timeout(5000), // 5-second timeout
    });

    if (response.ok) {
      const data = await response.json();
      const addr = data.address;

      // Extract ward / area name
      ward = addr.suburb || addr.neighbourhood || addr.quarter || addr.city_district || 'Central Area';

      // Nominatim city detection as fallback / verification
      if (!city) {
        const nominatimCity = addr.city || addr.town || addr.county || '';
        if (nominatimCity.includes('Chennai')) city = 'Chennai';
        else if (nominatimCity.includes('Bangalore') || nominatimCity.includes('Bengaluru')) city = 'Bengaluru';
        else if (nominatimCity.includes('Mumbai') || nominatimCity.includes('Bombay')) city = 'Mumbai';
        else if (nominatimCity.includes('Delhi') || nominatimCity.includes('New Delhi')) city = 'Delhi';
      }

      // Cache the result
      const finalCity = city || 'Chennai';
      geocodeCache.set(cacheKey, { city: finalCity, ward });
    }
  } catch {
    // Nominatim failed — fall back to bounding box city detection (already done above)
    console.warn('[route_issue] Nominatim unavailable, using bounding box fallback');
  }

  // Step 3: Default to Chennai if city still unknown (demo fallback)
  if (!city) city = 'Chennai';

  // Step 4: Look up exact department from routing matrix
  const department = routingMatrix[city][category];

  return { city, ward, department };
}

// ── Generate Tracking Code ────────────────────────────────────────────────────
// Human-readable, honest NODAL ref: NDL-<CITY>-<MMDD>-<4 uppercase alnum>,
// e.g. NDL-CHN-0427-1A2B. Not a government number — labelled "NODAL Tracking Ref"
// in the UI/email. ponytail: the DB's UNIQUE(tracking_code) is the collision
// backstop (4 chars over a single day = vanishingly small clash risk).
export function generateTrackingCode(city: SupportedCity): string {
  const cityCode: Record<SupportedCity, string> = {
    Chennai: 'CHN',
    Bengaluru: 'BLR',
    Mumbai: 'MUM',
    Delhi: 'DEL',
  };
  const now = new Date();
  const mmdd = `${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O/1/I
  let suffix = '';
  for (let i = 0; i < 4; i++) suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `NDL-${cityCode[city]}-${mmdd}-${suffix}`;
}
