/**
 * Entra ID (Azure AD) SSO route — dedicated login/callback handlers.
 *
 * Kept as a bespoke route (separate from the generic createSsoProviderRoutes)
 * because Entra config is loaded from env via loadEntraConfig rather than the
 * sso_providers table. Shared HTTP concerns (state store, rate limit, redirect
 * resolution, session cookie) come from sso-http-helpers.ts (DRY).
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import pino from 'pino';
import { loadEntraConfigAsync } from '../../../config/EntraConfig.js';
import { getDbAdapter } from '../../../admin/db/core.js';
import { JitProvisioningService } from '../../services/JitProvisioningService.js';
import { ssoStrategyRegistry } from '../../auth/strategies/index.js';
import {
  PKCE_TTL_MS,
  SsoStateStore,
  CallbackRateLimiter,
  getClientIp,
  resolveRedirectTarget,
  issueSessionCookie,
  buildPostLoginRedirect,
  isLoopbackRedirect,
} from './sso-http-helpers.js';

// Re-export so existing imports of isLoopbackRedirect from this module keep working
// (e.g. tests/unit/entra-loopback-redirect.test.ts import it from entra.js).
export { isLoopbackRedirect } from './sso-http-helpers.js';

const logger = pino({ name: 'entra-auth-route' });
const store = new SsoStateStore();
const rateLimiter = new CallbackRateLimiter();
const callbackQuery = z.object({ code: z.string(), state: z.string().optional() });

setInterval(() => { store.sweep(); rateLimiter.sweep(); }, 60_000);

export function createEntraAuthRoutes() {
  const app = new Hono();

  app.get('/auth/entra/login', async (c) => {
    const { config } = await loadEntraConfigAsync(process.env);
    if (!config) return c.json({ error: 'SSO not enabled' }, 400);
    const strategy = ssoStrategyRegistry.get('entra');
    if (!strategy) return c.json({ error: 'Strategy not registered' }, 500);

    const url = new URL(c.req.url);
    const redirectTo = resolveRedirectTarget(url.searchParams.get('redirect_to') || undefined);
    const clientState = url.searchParams.get('state') || undefined;

    const authResult = await strategy.buildAuthorizeUrl({ redirectTo, state: clientState });

    store.set(authResult.state, {
      codeVerifier: authResult.codeVerifier,
      nonce: authResult.nonce,
      exp: Date.now() + PKCE_TTL_MS,
      redirectTo,
      provider: 'entra',
    });
    return c.redirect(authResult.url);
  });

  app.get('/auth/entra/callback', async (c) => {
    const ip = getClientIp(c);
    const retryAfter = rateLimiter.check(ip);
    if (retryAfter > 0) return c.json({ error: 'Too many requests', retryAfter }, 429);

    const { config } = await loadEntraConfigAsync(process.env);
    if (!config) return c.json({ error: 'SSO not enabled' }, 400);
    const parsed = callbackQuery.safeParse(Object.fromEntries(new URL(c.req.url).searchParams.entries()));
    if (!parsed.success || !parsed.data.state) return c.json({ error: 'invalid_request' }, 400);
    const { code, state } = parsed.data;

    const entry = store.take(state);
    if (!entry) return c.json({ error: 'invalid_state' }, 400);

    const strategy = ssoStrategyRegistry.get('entra');
    if (!strategy) return c.json({ error: 'Strategy not registered' }, 500);

    return handleEntraCallback(c, strategy, { code, state, entry, ip });
  });

  return app;
}

/** Exchange the code via the Entra strategy, provision, and issue a session. */
async function handleEntraCallback(
  c: any,
  strategy: { handleCallback: (p: any) => Promise<any> },
  ctx: { code: string; state: string; entry: any; ip: string },
) {
  const { code, state, entry, ip } = ctx;
  try {
    const profile = await strategy.handleCallback({ code, state, storedState: entry, codeVerifier: entry.codeVerifier, nonce: entry.nonce });
    const db = getDbAdapter();
    const { user } = await new JitProvisioningService(db).provision(profile);

    await db.runAsync(
      `INSERT INTO audit_log (audit_id, user_id, username, action, resource, resource_id, changes, timestamp, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [randomUUID(), user.user_id, user.username || '', 'SSO_LOGIN_ENTRA', 'auth', '', JSON.stringify({ email: profile.email, oid: profile.externalSubjectId }), new Date().toISOString(), ip]
    );
    await db.runAsync(`UPDATE sessions SET is_active = 0 WHERE user_id = ?`, [user.user_id]);

    // Loopback (native-client) flow hands the token to the extension, which has a
    // different User-Agent than this browser request — don't UA-bind it or later
    // /me calls from the extension would 401. Web flow keeps UA binding.
    const isLoopback = isLoopbackRedirect(entry.redirectTo);
    const session = await issueSessionCookie(c, user.user_id, ip, !isLoopback);
    return c.redirect(buildPostLoginRedirect(entry.redirectTo, state, session));
  } catch (e: any) {
    return entraError(c, e);
  }
}

/** JIT provisioning rejections are business errors (403), not server faults.
 * Surface a clear reason so the login page can tell the user what went wrong
 * instead of a generic internal_error. */
function isProvisioningReject(msg: string | undefined): boolean {
  if (!msg) return false;
  return /not verified|linking rejected|already linked|not allowed|Missing required|HYBRID/i.test(msg);
}

/** Map Entra strategy errors onto the exact HTTP responses the tests expect. */
function entraError(c: any, e: any) {
  if (e.message === 'invalid_nonce') return c.json({ error: 'invalid_nonce' }, 401);
  if (e.status === 401) return c.json({ error: e.message }, 401);
  // JIT provisioning refused this identity (e.g. email not verified / no auto-link).
  // Return 403 with the reason so it isn't misdiagnosed as a server fault.
  if (isProvisioningReject(e.message)) {
    logger.warn({ message: e.message }, 'Entra JIT provisioning rejected');
    return c.json({ error: 'provisioning_rejected', message: e.message }, 403);
  }
  // SEC-05: log upstream token-exchange detail server-side only; return generic.
  if (e.detail) {
    logger.error({ status: e.status, detail: e.detail }, 'Entra token exchange failed');
    return c.json({ error: 'token_exchange_failed' }, (e.status || 400) as any);
  }
  if (e.message === 'verifier_unavailable') return c.json({ error: 'verifier_unavailable' }, 500);
  logger.error({ status: e.status, message: e.message }, 'Entra callback internal error');
  const status = (e.status && typeof e.status === 'number' && e.status >= 400 && e.status < 600) ? e.status : 500;
  return c.json({ error: 'internal_error' }, status as any);
}
