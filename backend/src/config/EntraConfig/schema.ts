/**
 * Zod schema + types for Entra ID SSO configuration.
 * Extracted from config/EntraConfig.ts (BR-18) — no behavior change.
 */

import { z } from 'zod';

const GUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const MULTI_TENANT = ['common', 'organizations', 'consumers'] as const;
const SCOPE_TOKEN_REGEX = /^[A-Za-z0-9._:/-]+$/;
const DEFAULT_SCOPES = ['openid', 'profile', 'email', 'offline_access'];

const httpsUrl = z.string().url().refine(
    v => v.startsWith('https://') || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)(\/|$)/.test(v),
    { message: 'must be https://, or http://localhost[:port]' }
  );

export interface EntraConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  authority: string;
  issuer: string;
  jwksUri: string;
  scopes: string[];
}

export interface EntraSurface {
  ssoEnabled: boolean;
  config: EntraConfig | null;
}

export const EntraConfigSchema = z.object({
  tenantId: z.string().trim().min(1)
    .refine(v => GUID_REGEX.test(v) || (MULTI_TENANT as readonly string[]).includes(v),
      { message: 'expected GUID or common|organizations|consumers' }),
  clientId: z.string().trim().regex(GUID_REGEX, 'expected UUID/GUID'),
  clientSecret: z.string().trim().min(8, 'min 8 chars after trim'),
  redirectUri: z.string().url()
    .refine(v => v.startsWith('https://') || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)(\/|$)/.test(v),
      { message: 'must be https:// or http://localhost with port' })
    .refine(v => !v.includes('#'), { message: 'fragment not allowed' }),
  authority: httpsUrl.optional(),
  issuer: httpsUrl.optional(),
  jwksUri: httpsUrl.optional(),
  scopes: z.string()
    .transform(v => v.trim().split(/\s+/).filter(Boolean))
    .pipe(z.array(z.string().regex(SCOPE_TOKEN_REGEX)).min(1))
    .optional(),
}).superRefine((cfg, ctx) => {
  // BR-04: explicit issuer must match the tenant-derived value — no silent overwrite.
  if (cfg.issuer && GUID_REGEX.test(cfg.tenantId)) {
    const derived = `https://login.microsoftonline.com/${cfg.tenantId}/v2.0`;
    if (cfg.issuer !== derived) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['issuer'],
        message: `explicit issuer mismatch with tenant-derived ${derived}`,
      });
    }
  }
});

// Runtime invariant: loadEntraConfig() always applies derived defaults, so a
// non-null `config` satisfies the full EntraConfig interface.
export const EntraSurfaceSchema = z.object({
  ssoEnabled: z.boolean(),
  config: EntraConfigSchema.nullable().default(null),
}) as unknown as z.ZodType<EntraSurface, z.ZodTypeDef, unknown>;

export { GUID_REGEX };

/** Apply tenant-derived defaults (authority/issuer/jwksUri/scopes). */
export function applyDerivedDefaults(cfg: z.infer<typeof EntraConfigSchema>): EntraConfig {
  const authority = cfg.authority ?? `https://login.microsoftonline.com/${cfg.tenantId}`;
  return {
    tenantId: cfg.tenantId,
    clientId: cfg.clientId,
    clientSecret: cfg.clientSecret,
    redirectUri: cfg.redirectUri,
    authority,
    issuer: cfg.issuer ?? `https://login.microsoftonline.com/${cfg.tenantId}/v2.0`,
    jwksUri: cfg.jwksUri ?? `${authority}/discovery/v2.0/keys`,
    scopes: cfg.scopes ?? DEFAULT_SCOPES,
  };
}
