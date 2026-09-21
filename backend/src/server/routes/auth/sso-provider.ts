/**
 * SA4E-308/309 — Generic multi-provider SSO route.
 *
 * Serves GET /auth/:provider/login and GET /auth/:provider/callback for EVERY
 * strategy registered in ssoStrategyRegistry (Google, GitHub, ...), replacing
 * the need for a bespoke route per provider. Entra keeps its dedicated route
 * (createEntraAuthRoutes) untouched, so this route explicitly skips 'entra'.
 * Login/callback delegate to the strategy; identity is provisioned via
 * JitProvisioningService and a rotated session cookie is issued (SessionService).
 */
import { Hono } from 'hono';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import pino from 'pino';
import { getDbAdapter } from '../../../admin/db/core.js';
import { JitProvisioningService } from '../../services/JitProvisioningService.js';
import { ssoStrategyRegistry } from '../../auth/strategies/index.js';
import type { SsoProviderStrategy } from '../../auth/strategies/SsoProviderStrategy.js';
import {
  PKCE_TTL_MS,
  SsoStateStore,
  CallbackRateLimiter,
  getClientIp,
  resolveRedirectTarget,
  issueSessionCookie,
  buildPostLoginRedirect,
} from './sso-http-helpers.js';

const logger = pino({ name: 'sso-provider-route' });

// Entra owns its dedicated route; this generic route must not shadow it.
const RESERVED_PROVIDERS = new Set(['entra']);
const store = new SsoStateStore();
const rateLimiter = new CallbackRateLimiter();
const callbackQuery = z.object({ code: z.string(), state: z.string().optional() });

setInterval(() => { store.sweep(); rateLimiter.sweep(); }, 60_000);

/** Resolve a usable, non-reserved strategy for the route param, or null. */
function resolveStrategy(providerParam: string): SsoProviderStrategy | null {
  const provider = providerParam.toLowerCase();
  if (RESERVED_PROVIDERS.has(provider)) return null;
  return ssoStrategyRegistry.get(provider) ?? null;
}

/** Map strategy callback errors onto stable HTTP responses (no swallow). */
function callbackError(c: any, e: any) {
  if (e.message === 'invalid_nonce' || e.message === 'invalid_state') return c.json({ error: e.message }, 401);
  if (e.status === 401 || e.status === 403) return c.json({ error: e.message }, e.status);
  // SEC-05: never reflect the upstream OAuth error body to the client (may leak
  // provider internals / tokens). Log the detail server-side, return generic.
  if (e.detail) {
    logger.error({ status: e.status, detail: e.detail }, 'SSO token exchange failed');
    return c.json({ error: 'token_exchange_failed' }, (e.status || 400) as any);
  }
  logger.error({ status: e.status, message: e.message }, 'SSO callback internal error');
  const status = (typeof e.status === 'number' && e.status >= 400 && e.status < 600) ? e.status : 500;
  return c.json({ error: 'internal_error' }, status as any);
}

export function createSsoProviderRoutes() {
  const app = new Hono();

  app.get('/auth/:provider/login', async (c) => {
    const providerParam = c.req.param('provider');
    const strategy = resolveStrategy(providerParam);
    if (!strategy) return c.json({ error: 'Strategy not registered', provider: providerParam.toLowerCase() }, 404);

    const url = new URL(c.req.url);
    const redirectTo = resolveRedirectTarget(url.searchParams.get('redirect_to') || undefined);
    const clientState = url.searchParams.get('state') || undefined;

    const authResult = await strategy.buildAuthorizeUrl({ redirectTo, state: clientState });
    store.set(authResult.state, {
      codeVerifier: authResult.codeVerifier,
      nonce: authResult.nonce,
      exp: Date.now() + PKCE_TTL_MS,
      redirectTo,
      provider: strategy.providerType,
      state: authResult.state,
    });
    return c.redirect(authResult.url);
  });

  app.get('/auth/:provider/callback', async (c) => {
    const providerParam = c.req.param('provider');
    const strategy = resolveStrategy(providerParam);
    if (!strategy) return c.json({ error: 'Strategy not registered', provider: providerParam.toLowerCase() }, 404);

    const ip = getClientIp(c);
    const retryAfter = rateLimiter.check(ip);
    if (retryAfter > 0) return c.json({ error: 'Too many requests', retryAfter }, 429);

    const parsed = callbackQuery.safeParse(Object.fromEntries(new URL(c.req.url).searchParams.entries()));
    if (!parsed.success || !parsed.data.state) return c.json({ error: 'invalid_request' }, 400);
    const { code, state } = parsed.data;

    const entry = store.take(state);
    if (!entry) return c.json({ error: 'invalid_state' }, 400);

    return handleCallback(c, strategy, { code, state, entry, ip });
  });

  return app;
}

/** Exchange the code via the strategy, provision the user, issue a session. */
async function handleCallback(
  c: any,
  strategy: SsoProviderStrategy,
  ctx: { code: string; state: string; entry: any; ip: string },
) {
  const { code, state, entry, ip } = ctx;
  try {
    const profile = await strategy.handleCallback({
      code, state, storedState: entry, codeVerifier: entry.codeVerifier, nonce: entry.nonce,
    });
    const db = getDbAdapter();
    const { user } = await new JitProvisioningService(db).provision(profile);
    await auditAndRotate(db, user, profile, ip);
    const session = await issueSessionCookie(c, user.user_id, ip);
    return c.redirect(buildPostLoginRedirect(entry.redirectTo, state, session));
  } catch (e: any) {
    return callbackError(c, e);
  }
}

/** Audit the SSO login and rotate (invalidate) prior sessions (fixation defense). */
async function auditAndRotate(db: any, user: any, profile: any, ip: string): Promise<void> {
  await db.runAsync(
    `INSERT INTO audit_log (audit_id, user_id, username, action, resource, resource_id, changes, timestamp, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [randomUUID(), user.user_id, user.username || '', `SSO_LOGIN_${profile.provider.toUpperCase()}`, 'auth', '',
     JSON.stringify({ email: profile.email, oid: profile.externalSubjectId, provider: profile.provider }), new Date().toISOString(), ip],
  );
  await db.runAsync(`UPDATE sessions SET is_active = 0 WHERE user_id = ?`, [user.user_id]);
}
