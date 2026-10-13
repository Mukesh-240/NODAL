// ─── Notify-me tracking (client-only, honest by design) ─────────────────────
// A student can "track" any report — theirs or someone else's. We store the
// tracking code + the status last seen in localStorage. When a tracked issue's
// status advances past what was seen (open → in_progress → resolved), the UI
// shows a "Resolved since you last looked" badge.
//
// Deliberately no push/email infra: this is a passive, pull-based affordance.
// The track and community pages read this store and surface the badge. If a
// student clears site data, tracking is forgotten — documented in the UI copy.

const KEY = 'nodal_tracked';

export type TrackedStatus = 'open' | 'in_progress' | 'resolved';

export interface TrackedIssue {
  code: string;
  seen: TrackedStatus;
  trackedAt: string;
}

function read(): TrackedIssue[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((t) => t && typeof t.code === 'string') : [];
  } catch {
    return [];
  }
}

function write(list: TrackedIssue[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Storage full or blocked — tracking degrades to untracked, silently.
  }
}

export function isTracked(code: string): boolean {
  return read().some((t) => t.code === code);
}

export function trackIssue(code: string, seen: TrackedStatus) {
  const list = read().filter((t) => t.code !== code);
  list.unshift({ code, seen, trackedAt: new Date().toISOString() });
  write(list.slice(0, 50)); // cap: a student meaningfully follows a handful
}

export function untrackIssue(code: string) {
  write(read().filter((t) => t.code !== code));
}

/** Record the status actually observed. Returns true if it advanced. */
export function markSeen(code: string, seen: TrackedStatus): boolean {
  const order: TrackedStatus[] = ['open', 'in_progress', 'resolved'];
  const list = read();
  const entry = list.find((t) => t.code === code);
  if (!entry) return false;
  const advanced = order.indexOf(seen) > order.indexOf(entry.seen);
  entry.seen = seen;
  write(list);
  return advanced;
}

/** True when the live status is ahead of what the student last saw. */
export function isAdvanced(code: string, live: TrackedStatus): boolean {
  const order: TrackedStatus[] = ['open', 'in_progress', 'resolved'];
  const entry = read().find((t) => t.code === code);
  if (!entry) return false;
  return order.indexOf(live) > order.indexOf(entry.seen);
}

export function getTracked(): TrackedIssue[] {
  return read();
}
