/**
 * SA4E-309 — GitHub OAuth2 (non-OIDC) response models.
 *
 * GitHub is NOT an OIDC provider: there is no id_token, JWKS or nonce. Identity
 * is verified by calling the GitHub REST API with the opaque access_token. These
 * zod schemas validate the three responses we consume so malformed payloads are
 * rejected via safeParse instead of causing runtime errors downstream.
 */
import { z } from 'zod';

/** Response of POST https://github.com/login/oauth/access_token (Accept: application/json). */
export const GitHubTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().optional(),
  scope: z.string().optional(),
});
export type GitHubTokenResponse = z.infer<typeof GitHubTokenResponseSchema>;

/**
 * Response of GET https://api.github.com/user.
 * `email`/`name` may be null (private profile) — that is why /user/emails exists.
 */
export const GitHubUserSchema = z.object({
  id: z.number(),
  login: z.string().min(1),
  name: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
});
export type GitHubUser = z.infer<typeof GitHubUserSchema>;

/** A single entry of GET https://api.github.com/user/emails. */
export const GitHubEmailSchema = z.object({
  email: z.string(),
  primary: z.boolean(),
  verified: z.boolean(),
});
export type GitHubEmail = z.infer<typeof GitHubEmailSchema>;

/** GET https://api.github.com/user/emails returns an array of email entries. */
export const GitHubEmailListSchema = z.array(GitHubEmailSchema);
export type GitHubEmailList = z.infer<typeof GitHubEmailListSchema>;
