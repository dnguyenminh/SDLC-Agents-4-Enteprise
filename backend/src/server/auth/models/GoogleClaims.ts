/**
 * SA4E-308 — Google OIDC data models (zod schemas).
 * All external payloads (token endpoint response, id_token claims) are validated
 * with safeParse before use so malformed/forged data fails closed.
 */

import { z } from 'zod';

/**
 * Response body from Google's token endpoint (https://oauth2.googleapis.com/token).
 * Only `id_token` is required for OIDC identity; the rest are optional metadata.
 */
export const GoogleTokenResponseSchema = z.object({
  id_token: z.string().min(1, 'id_token missing'),
  access_token: z.string().optional(),
  token_type: z.string().optional(),
  expires_in: z.number().optional(),
  scope: z.string().optional(),
  refresh_token: z.string().optional(),
});

export type GoogleTokenResponse = z.infer<typeof GoogleTokenResponseSchema>;

/**
 * Claims carried in a Google id_token. `sub`, `iss`, `aud`, `exp` are mandatory
 * for verification; `email_verified` may arrive as a boolean or a "true"/"false"
 * string depending on the encoding, so it is coerced below.
 */
export const GoogleIdTokenClaimsSchema = z.object({
  iss: z.string(),
  aud: z.union([z.string(), z.array(z.string())]),
  sub: z.string().min(1),
  exp: z.number(),
  nonce: z.string().optional(),
  email: z.string().optional(),
  email_verified: z.union([z.boolean(), z.string()]).optional(),
  name: z.string().optional(),
});

export type GoogleIdTokenClaims = z.infer<typeof GoogleIdTokenClaimsSchema>;

/** Accepted Google issuer values (with and without the https scheme). */
export const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'] as const;
export const GOOGLE_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GOOGLE_JWKS_URI = 'https://www.googleapis.com/oauth2/v3/certs';
export const GOOGLE_DEFAULT_SCOPES = ['openid', 'email', 'profile'];

/** email_verified can be a real boolean or the string "true" — normalize both. */
export function isEmailVerified(value: boolean | string | undefined): boolean {
  return value === true || value === 'true';
}
