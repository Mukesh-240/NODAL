// Persistent anonymous session id (used for points / civic_users and for
// reporter-only actions like "Mark as resolved"). Client-only.
import { generateUUID } from '@/lib/utils';

export function getSession(): string {
  if (typeof window === 'undefined') return '';
  let s = localStorage.getItem('nodal_session');
  if (!s) {
    s = generateUUID();
    localStorage.setItem('nodal_session', s);
  }
  return s;
}
