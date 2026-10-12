// ─── NODAL VIT-AP Campus Recipient Chain ────────────────────────────────────
// Escalates severity to real authority roles at VIT-AP University:
//
//   Routine (Low/Medium) → Assigned Warden / Department Lead
//   High-severity hazard → Assigned Warden + Chief Warden / Dean / DSW

import { DepartmentInfo, DispatchChain, SupportedCity, getPriority } from '@/types';

// Zone code + Chief Escalation Role per VIT-AP campus zone.
export const ZONE_DESK: Record<SupportedCity, { zoneShort: string; commissionerRole: string }> = {
  "Men's Hostels (MH)": {
    zoneShort: 'MH',
    commissionerRole: 'Chief Warden (Dr. G D V Santhosh Kumar) & Student Welfare Office',
  },
  "Ladies Hostels (LH)": {
    zoneShort: 'LH',
    commissionerRole: 'Chief Warden (Dr. Malavika Ganta) & Student Welfare Office',
  },
  'Academic Blocks': {
    zoneShort: 'ACAD',
    commissionerRole: 'Dean Academic Office & Estates Directorate',
  },
  'Campus Grounds': {
    zoneShort: 'CAMPUS',
    commissionerRole: 'Estates Directorate & Registrar Office',
  },
};

export const CITY_DESK = ZONE_DESK;

export function getDispatchMode(): 'demo' | 'live' {
  return process.env.DISPATCH_MODE === 'live' ? 'live' : 'demo';
}

interface BuildChainInput {
  city: SupportedCity;
  ward: string;
  department: DepartmentInfo;
  severity: number;
  patternDetected?: boolean;
}

export function buildDispatchChain({ city, ward, department, severity, patternDetected }: BuildChainInput): DispatchChain {
  const mode = getDispatchMode();
  const sink = process.env.DISPATCH_TEST_INBOX || null;
  const desk = ZONE_DESK[city] || ZONE_DESK['Academic Blocks'];

  // In demo mode EVERY address is overridden to DISPATCH_TEST_INBOX to protect live faculty inboxes during demo testing.
  const sendFor = (intended: string | null): string | null =>
    mode === 'demo' ? sink : intended;

  // to: the routed VIT-AP department or specific block warden
  const to = {
    role: department.name,
    intendedEmail: department.email,
    sendTo: sendFor(department.email),
  };

  // cc: Block/Floor in-charge always; Chief Warden/Dean for high severity or repeat pattern
  const cc: DispatchChain['cc'] = [
    { role: `${ward} In-Charge`, intendedEmail: null, sendTo: sendFor(null) },
  ];
  if (getPriority(severity) === 'High' || patternDetected) {
    cc.push({ role: desk.commissionerRole, intendedEmail: null, sendTo: sendFor(null) });
  }

  const chain: DispatchChain = {
    to,
    cc,
    routingLabel: `${ward} → ${desk.zoneShort} → ${department.name}`,
    mode,
  };

  console.log(
    `[recipients] ${mode.toUpperCase()} VIT-AP chain — to:${to.sendTo ?? '(none)'} ` +
    `cc:[${cc.map((c) => c.sendTo ?? '(skipped)').join(', ')}] roles:[${[to.role, ...cc.map((c) => c.role)].join(' | ')}]`
  );

  return chain;
}

export function resolveSendTargets(chain: DispatchChain): { to: string | null; cc: string[] } {
  const cc = [...new Set(chain.cc.map((c) => c.sendTo).filter((e): e is string => !!e))];
  return { to: chain.to.sendTo, cc };
}

export function formatCopiesFooter(chain: DispatchChain): string {
  const roles = [chain.to.role, ...chain.cc.map((c) => c.role)].join(', ');
  const demoNote = chain.mode === 'demo'
    ? '\n[Demo: dispatch routed to test inbox; the roles above represent the actual VIT-AP authority escalation chain.]'
    : '';
  return `\n\n— Copies to: ${roles}${demoNote}`;
}
