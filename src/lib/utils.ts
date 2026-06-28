// ─── Shared utilities ─────────────────────────────────────────────────────────

// crypto.randomUUID() is only defined in secure contexts (HTTPS or localhost).
// On a plain-HTTP LAN origin (e.g. http://192.168.x.x:3000 for a phone demo) it
// is undefined and would throw — so fall back to a Math.random-based v4 UUID.
// ponytail: Math.random is NOT cryptographically secure; it's fine for session/
// issue ids (collision-resistant enough), not for tokens/secrets.
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
