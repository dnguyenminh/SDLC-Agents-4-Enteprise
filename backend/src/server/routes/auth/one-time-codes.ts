/**
 * auth/one-time-codes.ts — Single-use, short-lived authorization codes.
 * Login redirects carry one of these instead of a bearer credential, so no
 * token ever lands in a URL (server logs, proxies, browser history, Referer).
 * The client exchanges the code at POST /api/auth/exchange within 60 seconds.
 */

import { randomBytes } from 'crypto';

/** How long a code stays redeemable. */
const CODE_TTL_MS = 60_000;

/** Hard cap so a flood of logins cannot grow the map without bound. */
const MAX_CODES = 500;

interface CodeEntry {
  payload: unknown;
  expires: number;
}

const codes = new Map<string, CodeEntry>();

function purgeExpired(): void {
  const now = Date.now();
  for (const [key, entry] of codes) {
    if (entry.expires <= now) codes.delete(key);
  }
}

/** Mint a single-use code bound to the token payload it carries. */
export function issueAuthCode(payload: unknown): string {
  purgeExpired();
  if (codes.size >= MAX_CODES) codes.clear();
  const code = randomBytes(24).toString('base64url');
  codes.set(code, { payload, expires: Date.now() + CODE_TTL_MS });
  return code;
}

/** Redeem a code exactly once. Returns null for unknown/expired/reused codes. */
export function consumeAuthCode(code: string): unknown | null {
  purgeExpired();
  const entry = codes.get(code);
  if (!entry) return null;
  codes.delete(code);
  return entry.payload;
}
