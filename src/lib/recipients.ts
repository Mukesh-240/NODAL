// ─── NODAL Recipient Chain ────────────────────────────────────────────────────
// Turns the agent's severity score into a real consequence: each notice goes to
// the routed department and copies the right level of the accountability chain.
//
//   Routine (Low/Medium) → department + ward officer.
//   High-severity hazard → department + ward officer + Municipal Commissioner.
//
// The District Collector is intentionally NOT in the chain — wrong jurisdiction
// for civic infrastructure.
//
// DEMO SAFETY: we do not have verified emails for ward officers / commissioners
// and must never send to guessed government addresses. Ward officer + commissioner
// are display-only roles (intendedEmail = null). In demo mode every send target is
// overridden to DISPATCH_TEST_INBOX; in live mode any role without a verified
// address is simply skipped (never invented).

import { DepartmentInfo, DispatchChain, SupportedCity, getPriority } from '@/types';

// Short corporation code + commissioner role label per city. (Full names live in
// CITY_CORPORATION in @/types.)
export const CITY_DESK: Record<SupportedCity, { corpShort: string; commissionerRole: string }> = {
  Chennai: { corpShort: 'GCC', commissionerRole: 'GCC Commissioner' },
  Bengaluru: { corpShort: 'BBMP', commissionerRole: 'BBMP Commissioner' },
  Mumbai: { corpShort: 'BMC', commissionerRole: 'BMC Commissioner' },
  Delhi: { corpShort: 'MCD', commissionerRole: 'MCD Commissioner' },
};

export function getDispatchMode(): 'demo' | 'live' {
  return process.env.DISPATCH_MODE === 'live' ? 'live' : 'demo';
}

interface BuildChainInput {
  city: SupportedCity;
  ward: string;
  department: DepartmentInfo;
  severity: number;
  // When a systemic pattern is detected in the ward, escalate to the Commissioner
  // even if this single report isn't high-severity.
  patternDetected?: boolean;
}

export function buildDispatchChain({ city, ward, department, severity, patternDetected }: BuildChainInput): DispatchChain {
  const mode = getDispatchMode();
  const sink = process.env.DISPATCH_TEST_INBOX || null;
  const desk = CITY_DESK[city];

  // In demo mode EVERY address is overridden to the test inbox so nothing reaches
  // a guessed government address. In live mode only a verified address is a send
  // target — unknown roles resolve to null and are dropped before sending.
  const sendFor = (intended: string | null): string | null =>
    mode === 'demo' ? sink /* DEMO OVERRIDE */ : intended;

  // to: the routed department (the one address we genuinely know).
  const to = {
    role: department.name,
    intendedEmail: department.email,
    sendTo: sendFor(department.email),
  };

  // cc: ward officer always; commissioner for a genuine high-severity hazard OR a
  // detected systemic pattern in the ward (repeat unresolved reports).
  const cc: DispatchChain['cc'] = [
    { role: `Ward Officer — ${ward}`, intendedEmail: null, sendTo: sendFor(null) },
  ];
  if (getPriority(severity) === 'High' || patternDetected) {
    cc.push({ role: desk.commissionerRole, intendedEmail: null, sendTo: sendFor(null) });
  }

  const chain: DispatchChain = {
    to,
    cc,
    routingLabel: `Ward ${ward} → ${desk.corpShort} → ${department.name}`,
    mode,
  };

  console.log(
    `[recipients] ${mode.toUpperCase()} chain — to:${to.sendTo ?? '(none)'} ` +
    `cc:[${cc.map((c) => c.sendTo ?? '(skipped)').join(', ')}] roles:[${[to.role, ...cc.map((c) => c.role)].join(' | ')}]`
  );

  return chain;
}

// Actual send addresses (deduped, nulls dropped). Demo → { to: sink, cc: [sink] };
// live → { to: deptEmail, cc: [] } since ward/commissioner have no verified address.
export function resolveSendTargets(chain: DispatchChain): { to: string | null; cc: string[] } {
  const cc = [...new Set(chain.cc.map((c) => c.sendTo).filter((e): e is string => !!e))];
  return { to: chain.to.sendTo, cc };
}

// "Copies to:" footer appended to the notice body. Lists the real intended roles
// (not the test inbox) so the escalation chain is always visible.
export function formatCopiesFooter(chain: DispatchChain): string {
  const roles = [chain.to.role, ...chain.cc.map((c) => c.role)].join(', ');
  const demoNote = chain.mode === 'demo'
    ? '\n[Demo: dispatch routed to a test inbox; the addresses above are the real intended roles.]'
    : '';
  return `\n\n— Copies to: ${roles}${demoNote}`;
}
