import { randomBytes } from 'node:crypto';

const ID_BYTES = 24;

// 24 random bytes -> 192 bits of entropy -> 32-char base64url string.
// Unguessable: knowing a session id is the only way to write to that session.
export function generateSessionId() {
  return randomBytes(ID_BYTES).toString('base64url');
}

const SESSION_ID_RE = /^[A-Za-z0-9_-]{32}$/;

export function isValidSessionId(value) {
  return typeof value === 'string' && SESSION_ID_RE.test(value);
}

// ── Natural-number form ──────────────────────────────────────────────────────
// 32 base64url chars carry exactly 192 bits (no padding, no slack bits), so the
// id's bytes read as a big-endian integer give a bijection between valid ids
// and the natural numbers 0 … 2^192 − 1. The number is passed around as a
// decimal string because it does not fit in a JSON / JS Number.

export const SESSION_NUMBER_MAX = (1n << BigInt(ID_BYTES * 8)) - 1n;

// Leading zeros are tolerated on input (see resolveSessionRef); output never has them.
const SESSION_NUMBER_RE = /^[0-9]{1,80}$/;

export function sessionIdToNumber(id) {
  if (!isValidSessionId(id)) throw new TypeError('Malformed session id.');
  const hex = Buffer.from(id, 'base64url').toString('hex');
  return BigInt('0x' + hex);
}

export function isValidSessionNumber(value) {
  if (typeof value === 'bigint') return value >= 0n && value <= SESSION_NUMBER_MAX;
  if (typeof value !== 'string' || !SESSION_NUMBER_RE.test(value)) return false;
  return BigInt(value) <= SESSION_NUMBER_MAX;
}

export function numberToSessionId(value) {
  if (!isValidSessionNumber(value)) throw new RangeError('Session number out of range.');
  const hex = BigInt(value).toString(16).padStart(ID_BYTES * 2, '0');
  return Buffer.from(hex, 'hex').toString('base64url');
}

// Accepts either form a client may send and returns the canonical id, or null.
// A 32-char value is always read as an id (all-digit ids are valid base64url);
// a number whose decimal form happens to be 32 digits long can be sent with a
// leading zero to disambiguate.
export function resolveSessionRef(value) {
  if (isValidSessionId(value)) return value;
  if (isValidSessionNumber(value)) return numberToSessionId(value);
  return null;
}
