import { loadEntraConfigAsync } from '../../../config/EntraConfig.js';
import { getEntraVerifierAsync } from '../../middleware/verifiers/entra-auth.js';
import { isEmailVerified } from '../models/GoogleClaims.js';
import type { NormalizedProfile } from '../models/NormalizedProfile.js';
import type {
  SsoProviderStrategy,
  AuthorizeOptions,
  AuthorizeResult,
  CallbackParams,
} from './SsoProviderStrategy.js';
import {
  generateVerifier,
  codeChallenge,
  generateState,
  generateNonce,
  decodeJwtPayload,
} from '../utils/pkce-helper.js';

export class EntraProviderStrategy implements SsoProviderStrategy {
  readonly providerType = 'entra';

  async buildAuthorizeUrl(options?: AuthorizeOptions): Promise<AuthorizeResult> {
    // Hướng A (single source of truth): loadEntraConfigAsync đọc từ bảng
    // sso_providers (provider_type='entra') trước, fallback env — nên Entra được
    // cấu hình cùng chỗ với Google/GitHub qua trang SSO Providers.
    const { config } = await loadEntraConfigAsync(process.env);
    if (!config) {
      throw new Error('SSO not enabled');
    }

    const clientState = options?.state;
    const state = clientState && clientState.length > 0 ? clientState : generateState();
    const verifier = generateVerifier();
    const challenge = codeChallenge(verifier);
    const nonce = generateNonce();

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

    const url = `${config.authority}/oauth2/v2.0/authorize?${params.toString()}`;
    return { url, state, nonce, codeVerifier: verifier };
  }

  async handleCallback(params: CallbackParams): Promise<NormalizedProfile> {
    const { config } = await loadEntraConfigAsync(process.env);
    if (!config) {
      throw new Error('SSO not enabled');
    }

    const codeVerifier = params.codeVerifier || params.storedState?.codeVerifier;
    const expectedNonce = params.nonce || params.storedState?.nonce;

    const body = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code: params.code,
      redirect_uri: config.redirectUri,
      grant_type: 'authorization_code',
      code_verifier: codeVerifier || '',
    });

    const resp = await fetch(`${config.authority}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!resp.ok) {
      const txt = await resp.text();
      const err = new Error(`token_exchange_failed: ${txt}`);
      (err as any).status = resp.status;
      (err as any).detail = txt;
      throw err;
    }

    const data = await resp.json() as { id_token: string; access_token: string };
    const verifier = await getEntraVerifierAsync();
    if (!verifier) {
      const err = new Error('verifier_unavailable');
      (err as any).status = 500;
      throw err;
    }

    const claims = await verifier.verify(data.id_token);
    // verifier.verify() returns a trimmed claim set (sub/oid/email/…). Extra
    // Entra-specific claims (xms_edov, preferred_username, upn, groups) survive
    // only on the full decoded payload, so read those from `payload`.
    const payload = decodeJwtPayload(data.id_token);
    const tokenNonce = typeof payload?.nonce === 'string' ? payload.nonce : undefined;

    if (typeof tokenNonce !== 'string' || tokenNonce !== expectedNonce) {
      const err = new Error('invalid_nonce');
      (err as any).status = 401;
      throw err;
    }

    // Entra puts the address in `email`, but for some account types it only
    // appears in `preferred_username`/`upn`. Prefer the verified `email` claim,
    // then fall back so JIT still has an address.
    const email = (claims as any).email
      || (typeof payload?.preferred_username === 'string' ? payload.preferred_username : '')
      || (typeof payload?.upn === 'string' ? payload.upn : '');

    return {
      provider: 'entra',
      externalSubjectId: (claims as any).oid || (claims as any).sub || '',
      email: email || '',
      // Entra ID does NOT emit the standard `email_verified` claim. Microsoft's
      // documented equivalent is `xms_edov` (email domain owner verified): the
      // email belongs to the user's tenant and the tenant admin verified the
      // domain (MSA/Google/OTP-backed). Trust that as the verification signal,
      // still honoring a standard `email_verified` if a flow ever provides it.
      // SEC-09: normalize boolean-or-"true"/"false" string; never Boolean("false").
      emailVerified: isEntraEmailVerified(payload),
      name: (claims as any).name || (typeof payload?.name === 'string' ? payload.name : '') || '',
      groups: Array.isArray(payload?.groups) ? (payload!.groups as string[]) : [],
    };
  }
}

/**
 * Decide whether an Entra id_token's email is verified. Entra omits the standard
 * `email_verified` claim, so the authoritative signal is `xms_edov` (email domain
 * owner verified). Accepts either as boolean or "true"/"false" string.
 * @param payload Full decoded id_token payload (may be null)
 */
function isEntraEmailVerified(payload: Record<string, unknown> | null): boolean {
  const edov = payload?.['xms_edov'];
  const std = payload?.['email_verified'];
  return isEmailVerified(edov as boolean | string | undefined)
    || isEmailVerified(std as boolean | string | undefined);
}
