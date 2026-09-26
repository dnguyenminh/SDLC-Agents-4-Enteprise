/**
 * SA4E-308/309 — Shared HTTP helpers for SSO provider routes.
 *
 * Extracted from entra.ts so the Entra route and the generic multi-provider
 * route (createSsoProviderRoutes) reuse ONE implementation of: the TTL state
 * store, per-IP callback rate limiting, client-IP resolution, redirect
 * resolution (loopback + allowlist), and session cookie issuance (DRY).
 */
import type { Context } from 'hono';
import type { StoredSsoState } from '../../auth/strategies/SsoProviderStrategy.js';
import { SessionService } from '../../services/SessionService.js';

export const PKCE_TTL_MS = 5 * 60 * 1000;
const PKCE_MAX_ENTRIES = 1000;
const CALLBACK_RATE_LIMIT_WINDOW_MS = 60_000;
const CALLBACK_RATE_LIMIT_MAX = 5;

/** In-memory TTL store for pending SSO states, keyed by the OAuth `state`. */
export class SsoStateStore {
  private readonly store = new Map<string, StoredSsoState>();

  set(state: string, value: StoredSsoState): void {
    this.store.set(state, value);
  }

  /** Read + delete (single-use) a state entry; null when missing or expired. */
  take(state: string): StoredSsoState | null {
    const entry = this.store.get(state);
    if (!entry || entry.exp < Date.now()) {
      this.store.delete(state);
      return null;
    }
    this.store.delete(state);
    return entry;
  }

  /** Evict expired entries and cap total size (memory bound). */
  sweep(): void {
    const now = Date.now();
    for (const [k, v] of this.store.entries()) {
      if (v.exp < now) this.store.delete(k);
    }
    if (this.store.size > PKCE_MAX_ENTRIES) {
      const keys = Array.from(this.store.keys()).slice(0, this.store.size - PKCE_MAX_ENTRIES);
      for (const k of keys) this.store.delete(k);
    }
  }
}

/** Per-IP sliding-window rate limiter for SSO callbacks (brute-force defense). */
export class CallbackRateLimiter {
  private readonly hits = new Map<string, number[]>();

  /** @returns retryAfter seconds when blocked, or 0 when the request is allowed. */
  check(ip: string): number {
    const now = Date.now();
    const recent = (this.hits.get(ip) ?? []).filter(t => t > now - CALLBACK_RATE_LIMIT_WINDOW_MS);
    if (recent.length >= CALLBACK_RATE_LIMIT_MAX) {
      return Math.ceil((recent[0] + CALLBACK_RATE_LIMIT_WINDOW_MS - now) / 1000);
    }
    recent.push(now);
    this.hits.set(ip, recent);
    return 0;
  }

  sweep(): void {
    const now = Date.now();
    for (const [ip, timestamps] of this.hits.entries()) {
      const recent = timestamps.filter(t => t > now - CALLBACK_RATE_LIMIT_WINDOW_MS);
      if (recent.length === 0) this.hits.delete(ip);
      else this.hits.set(ip, recent);
    }
  }
}

/**
 * Resolve the caller IP.
 *
 * SEC-03: X-Forwarded-For / X-Real-IP are client-controllable and must only be
 * trusted when a known reverse proxy sets them (TRUST_PROXY==='true'). Otherwise
 * they are ignored to prevent IP spoofing (which would defeat per-IP rate limits
 * and poison audit logs). Without a trusted proxy we fall back to the socket
 * remote address, or 127.0.0.1 when unavailable.
 */
export function getClientIp(c: Context): string {
  const trustProxy = process.env.TRUST_PROXY === 'true';
  if (trustProxy) {
    const xff = c.req.header('x-forwarded-for');
    const xri = c.req.header('x-real-ip');
    return xff?.split(',')[0]?.trim() || xri || socketRemoteAddress(c);
  }
  return socketRemoteAddress(c);
}

/** Best-effort socket remote address from the Hono request env, else loopback. */
function socketRemoteAddress(c: Context): string {
  const conn = (c.env as any)?.incoming?.socket?.remoteAddress
    ?? (c.env as any)?.remoteAddr
    ?? (c.env as any)?.server?.requestIP?.(c.req.raw)?.address;
  return (typeof conn === 'string' && conn) || '127.0.0.1';
}

/** Loopback (native-client) redirect target: http://127.0.0.1/callback only. */
export function isLoopbackRedirect(raw: string | undefined): boolean {
  if (!raw) return false;
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' && u.hostname === '127.0.0.1' && u.pathname === '/callback';
  } catch {
    return false;
  }
}

function allowedRedirects(): string[] {
  return (process.env.SSO_ALLOWED_REDIRECTS || '/admin?page=dashboard').split(',').map(s => s.trim());
}

/** Clamp an inbound redirect_to to the allowlist (or loopback), else default. */
export function resolveRedirectTarget(raw: string | undefined): string {
  const allowed = allowedRedirects();
  if (raw && (isLoopbackRedirect(raw) || allowed.includes(raw))) return raw;
  return allowed[0];
}

/** Resolve a web redirect against the allowlist by normalized path+search. */
export function resolveWebRedirect(targetRaw: string): string {
  const allowed = allowedRedirects();
  const normalize = (u: string) => {
    try { return new URL(u, 'http://localhost').pathname + new URL(u, 'http://localhost').search; }
    catch { return u; }
  };
  const normTarget = normalize(targetRaw);
  const idx = allowed.map(normalize).findIndex(a => a === normTarget || normTarget.startsWith(a.replace(/\?.*$/, '')));
  return idx >= 0 ? targetRaw : allowed[0];
}

/**
 * Issue a rotated session and set the HttpOnly session cookie on the response.
 *
 * @param bindUserAgent Bind the session to the caller's User-Agent (session-fixation
 *   defense). MUST be false for the loopback (native-client) SSO flow: there the
 *   token is minted in the BROWSER but consumed by the EXTENSION, so the two
 *   User-Agents differ — binding would make every subsequent extension call
 *   (e.g. /api/admin/auth/me) fail validation. Web flow keeps binding (true).
 */
export async function issueSessionCookie(c: Context, userId: string, ip: string, bindUserAgent = true): Promise<{ token: string; expiresAt: string }> {
  const sessionService = new SessionService();
  const userAgent = bindUserAgent ? (c.req.header('user-agent') || '') : '';
  const session = await sessionService.issue(userId, '', ip, userAgent);
  const maxAge = Math.max(0, Math.floor((new Date(session.expiresAt).getTime() - Date.now()) / 1000));
  // SEC-04: fail-secure — always mark the session cookie Secure unless an operator
  // explicitly opts out (ALLOW_INSECURE_COOKIES==='true') for local HTTP dev. This
  // avoids leaking the session token over plain HTTP if NODE_ENV is misconfigured.
  const secureFlag = process.env.ALLOW_INSECURE_COOKIES === 'true' ? '' : '; Secure';
  c.header('Set-Cookie', `session_token=${session.token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secureFlag}`);
  return { token: session.token, expiresAt: session.expiresAt };
}

/** Build the final redirect (loopback with token params, or web allowlist). */
export function buildPostLoginRedirect(redirectToRaw: string | undefined, state: string, session: { token: string; expiresAt: string }): string {
  const redirectUrlRaw = redirectToRaw || '/admin?page=dashboard';
  if (isLoopbackRedirect(redirectUrlRaw)) {
    const loopbackUrl = new URL(redirectUrlRaw);
    loopbackUrl.searchParams.set('state', state);
    loopbackUrl.searchParams.set('token', session.token);
    loopbackUrl.searchParams.set('expiresAt', session.expiresAt);
    return loopbackUrl.toString();
  }
  // Web (browser) flow: the admin SPA authenticates via a Bearer token kept in
  // localStorage, NOT the HttpOnly cookie. So we must hand the token to the SPA
  // on the redirect URL (same-origin, allow-listed target) — otherwise the SPA
  // lands on an authenticated route with no token and bounces back to login.
  const webTarget = resolveWebRedirect(redirectUrlRaw);
  const sep = webTarget.includes('?') ? '&' : '?';
  return `${webTarget}${sep}sso_token=${encodeURIComponent(session.token)}&sso_expires=${encodeURIComponent(session.expiresAt)}`;
}
