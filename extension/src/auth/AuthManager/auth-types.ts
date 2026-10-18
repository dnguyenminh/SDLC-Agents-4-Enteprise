/**
 * AuthManager — shared auth types.
 */

export type AuthState = "UNAUTHENTICATED" | "AUTHENTICATING" | "AUTHENTICATED";

/** Shapes returned by /login and /refresh (accessToken/refreshToken absent on legacy backends). */
export interface TokenResponse {
  token?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  expiresIn?: number;
}
