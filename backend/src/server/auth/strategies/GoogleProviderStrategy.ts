/**
 * SA4E-308 — Google SSO provider strategy (OIDC + PKCE).
 * buildAuthorizeUrl: builds the Google authorize URL with PKCE S256 + state + nonce.
 * handleCallback: exchanges the code (with code_verifier), verifies the id_token via
 * Google JWKS (issuer/aud/exp) + nonce match, then normalizes to NormalizedProfile.
 * Config comes exclusively from the sso_providers table (provider_type='google').
 */

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
import { loadGoogleConfig, type GoogleConfig } from './GoogleProviderConfig.js';
import {
  GoogleTokenResponseSchema,
  isEmailVerified,
  GOOGLE_AUTHORIZE_URL,
  GOOGLE_TOKEN_URL,
} from '../models/GoogleClaims.js';
import { GoogleIdTokenVerifier } from '../../middleware/verifiers/GoogleIdTokenVerifier.js';

/** Builds a verifier for a given audience — overridable in tests. */
export type GoogleVerifierFactory = (audience: string) => {
  verify(token: string): Promise<{ sub: string; email?: string; email_verified?: boolean | string; name?: string }>;
};

const defaultVerifierFactory: GoogleVerifierFactory = (audience) => new GoogleIdTokenVerifier({ audience });

export class GoogleProviderStrategy implements SsoProviderStrategy {
  readonly providerType = 'google';

  constructor(private readonly verifierFactory: GoogleVerifierFactory = defaultVerifierFactory) {}

  /** Build the Google authorize URL with PKCE S256, state and nonce. */
  async buildAuthorizeUrl(options?: AuthorizeOptions): Promise<AuthorizeResult> {
    const config = await loadGoogleConfig();
    const clientState = options?.state;
    const state = clientState && clientState.length > 0 ? clientState : generateState();
    const verifier = generateVerifier();
    const nonce = generateNonce();

    const params = new URLSearchParams({
      client_id: config.clientId,
      response_type: 'code',
      redirect_uri: config.redirectUri,
      scope: config.scopes.join(' '),
      code_challenge: codeChallenge(verifier),
      code_challenge_method: 'S256',
      state,
      nonce,
    });

    return { url: `${GOOGLE_AUTHORIZE_URL}?${params.toString()}`, state, nonce, codeVerifier: verifier };
  }

  /** Exchange code → id_token, verify signature/claims/nonce, normalize profile. */
  async handleCallback(params: CallbackParams): Promise<NormalizedProfile> {
    const config = await loadGoogleConfig();
    const codeVerifier = params.codeVerifier || params.storedState?.codeVerifier;
    const expectedNonce = params.nonce || params.storedState?.nonce;

    const idToken = await this.exchangeCode(config, params.code, codeVerifier);
    const verifier = this.verifierFactory(config.clientId);
    const claims = await verifier.verify(idToken);

    this.assertNonce(idToken, expectedNonce);
    return this.normalize(claims);
  }

  /** POST the authorization code to Google's token endpoint and return the id_token. */
  private async exchangeCode(
    config: GoogleConfig,
    code: string,
    codeVerifier: string | undefined,
  ): Promise<string> {
    const body = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: config.redirectUri,
      grant_type: 'authorization_code',
      code_verifier: codeVerifier || '',
    });

    const resp = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    return this.readIdToken(resp);
  }

  /** Validate the token response with zod safeParse; surface a clear error otherwise. */
  private async readIdToken(resp: Response): Promise<string> {
    if (!resp.ok) {
      const txt = await resp.text();
      const err = new Error(`token_exchange_failed: ${txt}`);
      (err as { status?: number }).status = resp.status;
      throw err;
    }
    const parsed = GoogleTokenResponseSchema.safeParse(await resp.json());
    if (!parsed.success) {
      const err = new Error('token_exchange_failed: malformed token response');
      (err as { status?: number }).status = 502;
      throw err;
    }
    return parsed.data.id_token;
  }

  /** Nonce binding: the id_token nonce must equal the one issued at authorize time. */
  private assertNonce(idToken: string, expectedNonce: string | undefined): void {
    const payload = decodeJwtPayload(idToken);
    const tokenNonce = typeof payload?.nonce === 'string' ? payload.nonce : undefined;
    if (!expectedNonce || tokenNonce !== expectedNonce) {
      const err = new Error('invalid_nonce');
      (err as { status?: number }).status = 401;
      throw err;
    }
  }

  /** Map verified Google claims to the provider-agnostic NormalizedProfile. */
  private normalize(claims: {
    sub: string;
    email?: string;
    email_verified?: boolean | string;
    name?: string;
  }): NormalizedProfile {
    return {
      provider: 'google',
      externalSubjectId: claims.sub || '',
      email: claims.email || '',
      emailVerified: isEmailVerified(claims.email_verified),
      name: claims.name || '',
      groups: [],
    };
  }
}
