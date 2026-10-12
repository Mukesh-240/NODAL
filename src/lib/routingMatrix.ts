// ─── NODAL VIT-AP Campus Routing Matrix ─────────────────────────────────────
// Real faculty and department directory extracted from VIT-AP administration directory.
// Maps [VIT-AP Campus Zone][Category] → exact Faculty Warden / Department Officer.

import {
  SupportedCity,
  IssueCategory,
  DepartmentInfo,
  RouteResult,
} from '@/types';

// ── VIT-AP Campus Faculty & Office Directory ──────────────────────────────────
export const VIT_AP_DIRECTORY = {
  // Men's Hostels
  chiefWardenMH: {
    name: 'Chief Warden Office — Men (Dr. G D V Santhosh Kumar)',
    email: 'santhosh.gdv@vitap.ac.in',
    phone: '0863-2370444',
    avgResolutionDays: 2,
  },
  wardenFoodMH: {
    name: 'Warden - Food & Mess MH (Dr. Maheshuni Sankush Krishna)',
    email: 'sankushkrishna.m@vitap.ac.in',
    phone: '0863-2370445',
    avgResolutionDays: 1,
  },
  wardenDisciplineMH: {
    name: 'Warden - Discipline MH (Dr. Gokulnath M)',
    email: 'gokulnath@vitap.ac.in',
    phone: '0863-2370446',
    avgResolutionDays: 2,
  },

  // Block-specific Wardens (Men)
  wardenMH01: {
    name: 'Warden MH-01 (Dr. Kranti Kumar Reddy)',
    email: 'santhosh.gdv@vitap.ac.in', // fallback to Chief Warden
    phone: '0863-2370441',
    avgResolutionDays: 2,
  },
  wardenMH02: {
    name: 'Warden MH-02 (Dr. Ramaswamy Kavikumar)',
    email: 'kavikumar.r@vitap.ac.in',
    phone: '0863-2370442',
    avgResolutionDays: 2,
  },
  wardenMH03: {
    name: 'Warden MH-03 (Dr. Prakash S)',
    email: 'prakash.s@vitap.ac.in',
    phone: '0863-2370443',
    avgResolutionDays: 2,
  },
  wardenMH04: {
    name: 'Warden MH-04 (Dr. Mo Faheem)',
    email: 'santhosh.gdv@vitap.ac.in', // fallback
    phone: '0863-2370444',
    avgResolutionDays: 2,
  },
  wardenMH05: {
    name: 'Warden MH-05 (Dr. Siva G)',
    email: 'siva.g@vitap.ac.in',
    phone: '0863-2370445',
    avgResolutionDays: 2,
  },
  wardenMH06: {
    name: 'Warden MH-06 (Dr. Abdul Rafee Naik)',
    email: 'abdulraffie.naik@vitap.ac.in',
    phone: '0863-2370446',
    avgResolutionDays: 2,
  },
  wardenMH07: {
    name: 'Warden MH-07 (Dr. Guru Prakash JayaBalasamy)',
    email: 'guruprakash.j@vitap.ac.in',
    phone: '0863-2370447',
    avgResolutionDays: 2,
  },

  // Ladies Hostels
  chiefWardenLH: {
    name: 'Chief Warden Office — Ladies (Dr. Malavika Ganta)',
    email: 'malavika.g@vitap.ac.in',
    phone: '0863-2370450',
    avgResolutionDays: 2,
  },
  wardenLH01_02: {
    name: 'Warden LH-01 & LH-02 (Dr. Renita R)',
    email: 'renita.r@vitap.ac.in',
    phone: '0863-2370451',
    avgResolutionDays: 2,
  },
  wardenLH03_04: {
    name: 'Warden LH-03 & LH-04 (Dr. Srirupa Poddar)',
    email: 'malavika.g@vitap.ac.in', // fallback to Chief Warden
    phone: '0863-2370452',
    avgResolutionDays: 2,
  },
  wardenFoodLH: {
    name: 'Warden - Food & Mess LH (Dr. Shalini Subramani)',
    email: 'shalini.subramani@vitap.ac.in',
    phone: '0863-2370453',
    avgResolutionDays: 1,
  },
  wardenDisciplineLH: {
    name: 'Warden - Discipline LH (Dr. A Sentamizhselvi)',
    email: 'senthamizhselvi.a@vitap.ac.in',
    phone: '0863-2370454',
    avgResolutionDays: 2,
  },

  // Campus Facilities & Administration
  estatesOffice: {
    name: 'Estates & Infrastructure Office (Asst. Director Estates)',
    email: 'estate.team@vitap.ac.in',
    phone: '0863-2370401',
    avgResolutionDays: 2,
  },
  ctsITServices: {
    name: 'CTS — IT & Campus Wi-Fi Services (Deputy Director CTS)',
    email: 'itservices.team@vitap.ac.in',
    phone: '0863-2370402',
    avgResolutionDays: 1,
  },
  deanAcademic: {
    name: 'Dean Academic Office (Academic Affairs)',
    email: 'acad.secretary@vitap.ac.in',
    phone: '0863-2370403',
    avgResolutionDays: 3,
  },
  studentWelfare: {
    name: 'Student Welfare Office (Deputy Director DSW)',
    email: 'sw.secretary@vitap.ac.in',
    phone: '0863-2370404',
    avgResolutionDays: 2,
  },
  studentServices: {
    name: 'Student Records & Services Office',
    email: 'student.services@vitap.ac.in',
    phone: '0863-2370405',
    avgResolutionDays: 3,
  },
  registrarOffice: {
    name: 'Registrar Office — VIT-AP',
    email: 'registrar.office@vitap.ac.in',
    phone: '0863-2370400',
    avgResolutionDays: 3,
  },
};

// ── VIT-AP Amaravati Campus Location Coordinates ─────────────────────────────
// VIT-AP University, Inavolu, Beside AP Secretariat, Amaravati, Andhra Pradesh
export const VIT_AP_CAMPUS = {
  lat: 16.4941,
  lng: 80.4982,
};

export const INDIA_BOUNDS = {
  minLat: 6.0,
  maxLat: 37.5,
  minLng: 68.0,
  maxLng: 97.5,
};

export function cityCenter(_zone: SupportedCity): { lat: number; lng: number } {
  return VIT_AP_CAMPUS;
}

// ── Routing Matrix Structure ──────────────────────────────────────────────────
type RoutingMatrix = Record<SupportedCity, Record<IssueCategory, DepartmentInfo>>;

export const routingMatrix: RoutingMatrix = {
  "Men's Hostels (MH)": {
    hostel_maintenance: VIT_AP_DIRECTORY.chiefWardenMH,
    classroom_lab: VIT_AP_DIRECTORY.deanAcademic,
    electrical_ac: VIT_AP_DIRECTORY.estatesOffice,
    sanitation_washroom: VIT_AP_DIRECTORY.estatesOffice,
    wifi_it_infra: VIT_AP_DIRECTORY.ctsITServices,
    mess_canteen: VIT_AP_DIRECTORY.wardenFoodMH,
    campus_safety_roads: VIT_AP_DIRECTORY.estatesOffice,
    other: VIT_AP_DIRECTORY.studentWelfare,
  },
  "Ladies Hostels (LH)": {
    hostel_maintenance: VIT_AP_DIRECTORY.chiefWardenLH,
    classroom_lab: VIT_AP_DIRECTORY.deanAcademic,
    electrical_ac: VIT_AP_DIRECTORY.estatesOffice,
    sanitation_washroom: VIT_AP_DIRECTORY.estatesOffice,
    wifi_it_infra: VIT_AP_DIRECTORY.ctsITServices,
    mess_canteen: VIT_AP_DIRECTORY.wardenFoodLH,
    campus_safety_roads: VIT_AP_DIRECTORY.estatesOffice,
    other: VIT_AP_DIRECTORY.studentWelfare,
  },
  'Academic Blocks': {
    hostel_maintenance: VIT_AP_DIRECTORY.chiefWardenMH,
    classroom_lab: VIT_AP_DIRECTORY.deanAcademic,
    electrical_ac: VIT_AP_DIRECTORY.estatesOffice,
    sanitation_washroom: VIT_AP_DIRECTORY.estatesOffice,
    wifi_it_infra: VIT_AP_DIRECTORY.ctsITServices,
    mess_canteen: VIT_AP_DIRECTORY.studentWelfare,
    campus_safety_roads: VIT_AP_DIRECTORY.estatesOffice,
    other: VIT_AP_DIRECTORY.studentServices,
  },
  'Campus Grounds': {
    hostel_maintenance: VIT_AP_DIRECTORY.chiefWardenMH,
    classroom_lab: VIT_AP_DIRECTORY.deanAcademic,
    electrical_ac: VIT_AP_DIRECTORY.estatesOffice,
    sanitation_washroom: VIT_AP_DIRECTORY.estatesOffice,
    wifi_it_infra: VIT_AP_DIRECTORY.ctsITServices,
    mess_canteen: VIT_AP_DIRECTORY.studentWelfare,
    campus_safety_roads: VIT_AP_DIRECTORY.estatesOffice,
    other: VIT_AP_DIRECTORY.registrarOffice,
  },
};

// Map specific hostel blocks directly to their assigned block wardens
export function resolveBlockWarden(block: string): DepartmentInfo | null {
  const b = block.toUpperCase();
  if (b.includes('MH-01') || b.includes('MH 01') || b.includes('MH1')) return VIT_AP_DIRECTORY.wardenMH01;
  if (b.includes('MH-02') || b.includes('MH 02') || b.includes('MH2')) return VIT_AP_DIRECTORY.wardenMH02;
  if (b.includes('MH-03') || b.includes('MH 03') || b.includes('MH3')) return VIT_AP_DIRECTORY.wardenMH03;
  if (b.includes('MH-04') || b.includes('MH 04') || b.includes('MH4')) return VIT_AP_DIRECTORY.wardenMH04;
  if (b.includes('MH-05') || b.includes('MH 05') || b.includes('MH5')) return VIT_AP_DIRECTORY.wardenMH05;
  if (b.includes('MH-06') || b.includes('MH 06') || b.includes('MH6')) return VIT_AP_DIRECTORY.wardenMH06;
  if (b.includes('MH-07') || b.includes('MH 07') || b.includes('MH7')) return VIT_AP_DIRECTORY.wardenMH07;
  if (b.includes('LH-01') || b.includes('LH 01') || b.includes('LH-02') || b.includes('LH 02')) return VIT_AP_DIRECTORY.wardenLH01_02;
  if (b.includes('LH-03') || b.includes('LH 03') || b.includes('LH-04') || b.includes('LH 04')) return VIT_AP_DIRECTORY.wardenLH03_04;
  return null;
}

export function detectCityFromGPS(lat: number, lng: number): SupportedCity | null {
  if (isInIndia(lat, lng)) {
    return 'Academic Blocks';
  }
  return null;
}

export function isInIndia(lat: number, lng: number): boolean {
  return (
    lat >= INDIA_BOUNDS.minLat &&
    lat <= INDIA_BOUNDS.maxLat &&
    lng >= INDIA_BOUNDS.minLng &&
    lng <= INDIA_BOUNDS.maxLng
  );
}

// ── Route an Issue ────────────────────────────────────────────────────────────
export async function routeIssue(
  _lat: number,
  _lng: number,
  category: IssueCategory,
  overrides?: { city?: SupportedCity; ward?: string }
): Promise<RouteResult> {
  const city: SupportedCity = overrides?.city || 'Academic Blocks';
  const ward = overrides?.ward || 'Central Campus';

  // If reporting a hostel maintenance issue for a specific block, route to that block's warden
  if (category === 'hostel_maintenance' && ward) {
    const specificWarden = resolveBlockWarden(ward);
    if (specificWarden) {
      return { city, ward, department: specificWarden };
    }
  }

  // Otherwise use the zone's standard category mapping
  const department = routingMatrix[city]?.[category] || VIT_AP_DIRECTORY.estatesOffice;
  return { city, ward, department };
}

// ── Generate Tracking Code ────────────────────────────────────────────────────
// Format: NDL-MH-0427-XXXX, NDL-LH-0427-XXXX, NDL-ACAD-0427-XXXX
export function generateTrackingCode(zone: SupportedCity): string {
  const zoneCode: Record<SupportedCity, string> = {
    "Men's Hostels (MH)": 'MH',
    "Ladies Hostels (LH)": 'LH',
    'Academic Blocks': 'ACAD',
    'Campus Grounds': 'CAMP',
  };
  const now = new Date();
  const mmdd = `${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 4; i++) suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  const prefix = zoneCode[zone] || 'VIT';
  return `NDL-${prefix}-${mmdd}-${suffix}`;
}
