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
    const payload = decodeJwtPayload(data.id_token);
    const tokenNonce = typeof payload?.nonce === 'string' ? payload.nonce : undefined;

    if (typeof tokenNonce !== 'string' || tokenNonce !== expectedNonce) {
      const err = new Error('invalid_nonce');
      (err as any).status = 401;
      throw err;
    }

    return {
      provider: 'entra',
      externalSubjectId: (claims as any).oid || (claims as any).sub || '',
      email: (claims as any).email || '',
      // SEC-09: email_verified may arrive as boolean or the string "true"/"false".
      // Boolean("false") === true would wrongly trust an unverified email, so use
      // the shared normalizer that only treats true / "true" as verified.
      emailVerified: isEmailVerified((claims as any).email_verified),
      name: (claims as any).name || '',
      groups: (claims as any).groups || [],
    };
  }
}
