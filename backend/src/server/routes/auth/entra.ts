import { Hono } from 'hono';
import { z } from 'zod';
import { randomBytes, createHash } from 'crypto';
import { loadEntraConfig } from '../../../config/EntraConfig.js';
import { getEntraVerifier } from '../../middleware/verifiers/entra-auth.js';
import { getDbAdapter } from '../../../admin/db/core.js';
import { JitProvisioningService } from '../../services/JitProvisioningService.js';

const PKCE_TTL_MS = 5 * 60 * 1000;
const PKCE_MAX_ENTRIES = 1000;
const store = new Map<string, { codeVerifier: string; nonce: string; exp: number; redirectTo?: string }>();

// Rate limiting for callback to prevent brute force
const CALLBACK_RATE_LIMIT_WINDOW_MS = 60_000;
const CALLBACK_RATE_LIMIT_MAX = 5;
const callbackRateStore = new Map<string, number[]>();

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of store.entries()) {
    if (v.exp < now) store.delete(k);
  }
  // Prevent long-term accumulation
  if (store.size > PKCE_MAX_ENTRIES) {
    const keys = Array.from(store.keys()).slice(0, store.size - PKCE_MAX_ENTRIES);
    for (const k of keys) store.delete(k);
  }
  // Cleanup callback rate limit store
  for (const [ip, timestamps] of callbackRateStore.entries()) {
    const recent = timestamps.filter(t => t > now - CALLBACK_RATE_LIMIT_WINDOW_MS);
    if (recent.length === 0) callbackRateStore.delete(ip);
    else callbackRateStore.set(ip, recent);
  }
}, 60_000);

function base64url(buf: Buffer) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function generateVerifier() {
  return base64url(randomBytes(32));
}

function codeChallenge(verifier: string) {
  return base64url(createHash('sha256').update(verifier).digest());
}

function getClientIp(c: any): string {
  const trustProxy = process.env.TRUST_PROXY === 'true';
  if (trustProxy) {
    return c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip') || '127.0.0.1';
  }
  return '127.0.0.1';
}

const callbackQuery = z.object({ code: z.string(), state: z.string().optional() });

export function createEntraAuthRoutes() {
  const app = new Hono();

  app.get('/auth/entra/login', (c) => {
    const { config } = loadEntraConfig(process.env);
    if (!config) return c.json({ error: 'SSO not enabled' }, 400);
    const url = new URL(c.req.url);
    const redirectTo = url.searchParams.get('redirect_to') || undefined;
    const stateParam = url.searchParams.get('state');
    const state = stateParam && stateParam.length > 0 ? stateParam : base64url(randomBytes(16));
    const verifier = generateVerifier();
    const challenge = codeChallenge(verifier);
    const nonce = base64url(randomBytes(16));
    store.set(state, { codeVerifier: verifier, nonce, exp: Date.now() + PKCE_TTL_MS, redirectTo });
    const params = new URLSearchParams({
      client_id: config.clientId,
      response_type: 'code',
      redirect_uri: config.redirectUri,
      scope: config.scopes.join(' '),
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state,
      nonce,
    });
    const authUrl = `${config.authority}/oauth2/v2.0/authorize?${params.toString()}`;
    return c.redirect(authUrl);
  });

  app.get('/auth/entra/callback', async (c) => {
    // Rate limiting per IP
    const ip = getClientIp(c);
    const now = Date.now();
    const timestamps = callbackRateStore.get(ip) ?? [];
    const windowStart = now - CALLBACK_RATE_LIMIT_WINDOW_MS;
    const recent = timestamps.filter(t => t > windowStart);
    if (recent.length >= CALLBACK_RATE_LIMIT_MAX) {
      return c.json({ error: 'Too many requests', retryAfter: Math.ceil((recent[0] + CALLBACK_RATE_LIMIT_WINDOW_MS - now) / 1000) }, 429);
    }
    recent.push(now);
    callbackRateStore.set(ip, recent);

    const { config } = loadEntraConfig(process.env);
    if (!config) return c.json({ error: 'SSO not enabled' }, 400);
    const parsed = callbackQuery.safeParse(Object.fromEntries(new URL(c.req.url).searchParams.entries()));
    if (!parsed.success) return c.json({ error: 'invalid_request' }, 400);
    const { code, state } = parsed.data;
    if (!state) return c.json({ error: 'invalid_request' }, 400);
    const entry = store.get(state);
    if (!entry || entry.exp < Date.now()) {
      store.delete(state);
      return c.json({ error: 'invalid_state' }, 400);
    }
    store.delete(state);
    try {
      const body = new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: config.redirectUri,
        grant_type: 'authorization_code',
        code_verifier: entry.codeVerifier,
      });
      const resp = await fetch(`${config.authority}/oauth2/v2.0/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      if (!resp.ok) {
        const txt = await resp.text();
        return c.json({ error: 'token_exchange_failed', detail: txt }, resp.status as any);
      }
      const data = await resp.json() as { id_token: string; access_token: string };
      const verifier = getEntraVerifier();
      if (!verifier) return c.json({ error: 'verifier_unavailable' }, 500);
      const claims = await verifier.verify(data.id_token);
      const raw = claims as any;
      if (typeof raw.nonce === 'string' && raw.nonce !== entry.nonce) {
        return c.json({ error: 'invalid_nonce' }, 401);
      }
      const db = getDbAdapter();
      const { randomUUID } = await import('crypto');
      const jitService = new JitProvisioningService(db);
      const claimsPayload = {
        email: (claims as any).email as string,
        email_verified: (claims as any).email_verified as boolean | undefined,
        oid: (claims as any).oid as string,
        sub: (claims as any).sub as string,
        name: (claims as any).name as string,
        groups: (claims as any).groups as string[] || [],
      };
      const { user } = await jitService.provision(claimsPayload);
      await db.runAsync(
        `INSERT INTO audit_log (id, timestamp, user_id, action, details, status) VALUES (?, ?, ?, ?, ?, ?)`,
        [randomUUID(), new Date().toISOString(), user.user_id, 'SSO_LOGIN_ENTRA', JSON.stringify({ email: claimsPayload.email, oid: claimsPayload.oid || claimsPayload.sub }), 'SUCCESS']
      );
      await db.runAsync(`DELETE FROM sessions WHERE user_id = ?`, [user.user_id]);
      const sessionToken = randomUUID();
      const expiresAt = new Date(Date.now() + 3600_000).toISOString();
      await db.runAsync(`INSERT INTO sessions (id, user_id, token, expires_at, created_at) VALUES (?, ?, ?, ?, ?)`, [randomUUID(), user.user_id, sessionToken, expiresAt, new Date().toISOString()]);
      if (entry.redirectTo) {
        const redirectUrl = new URL(entry.redirectTo);
        redirectUrl.searchParams.set('token', sessionToken);
        redirectUrl.searchParams.set('expiresAt', expiresAt);
        return c.redirect(redirectUrl.toString());
      }
      return c.redirect(`/admin?token=${sessionToken}&page=dashboard`);
    } catch (e: any) {
      return c.json({ error: 'internal_error', message: e.message }, 500);
    }
  });

  return app;
}
