import type { NormalizedProfile } from '../models/NormalizedProfile.js';

export interface AuthorizeOptions {
  redirectTo?: string;
  state?: string;
  [key: string]: unknown;
}

export interface AuthorizeResult {
  url: string;
  state: string;
  nonce?: string;
  codeVerifier?: string;
}

export interface StoredSsoState {
  codeVerifier?: string;
  nonce?: string;
  exp: number;
  redirectTo?: string;
  provider?: string;
  // SA4E-309: the issued state value, so non-OIDC strategies (GitHub) can perform
  // a defensive CSRF check inside handleCallback in addition to the route-level
  // store lookup. Optional to preserve the Entra contract unchanged.
  state?: string;
}

export interface CallbackParams {
  code: string;
  state?: string;
  storedState?: StoredSsoState;
  codeVerifier?: string;
  nonce?: string;
  [key: string]: unknown;
}

export interface SsoProviderStrategy {
  readonly providerType: string;
  buildAuthorizeUrl(options?: AuthorizeOptions): Promise<AuthorizeResult> | AuthorizeResult;
  handleCallback(params: CallbackParams): Promise<NormalizedProfile>;
}
