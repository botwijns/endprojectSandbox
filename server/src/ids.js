import { randomBytes } from 'node:crypto';

// 24 random bytes -> 192 bits of entropy -> 32-char base64url string.
// Unguessable: knowing a session id is the only way to write to that session.
export function generateSessionId() {
  return randomBytes(24).toString('base64url');
}

const SESSION_ID_RE = /^[A-Za-z0-9_-]{32}$/;

export function isValidSessionId(value) {
  return typeof value === 'string' && SESSION_ID_RE.test(value);
}
