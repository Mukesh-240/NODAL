// Persistent anonymous session id (used for points / civic_users and for
// reporter-only actions like "Mark as resolved"). Client-only.
export function getSession(): string {
  if (typeof window === 'undefined') return '';
  let s = localStorage.getItem('nodal_session');
  if (!s) {
    s = crypto.randomUUID();
    localStorage.setItem('nodal_session', s);
  }
  return s;
}
