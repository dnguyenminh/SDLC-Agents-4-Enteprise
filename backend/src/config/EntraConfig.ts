import { z } from 'zod';
import pino from 'pino';

// ---- SA4E-264: Entra ID SSO configuration (config layer) ----
// P-2 single source: only this module reads SSO_ENABLED / ENTRA_* env vars.

const logger = pino({ name: 'app-config' });

export const authRuntimeOverrides = new Map<string, string>();

const GUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const MULTI_TENANT = ['common', 'organizations', 'consumers'] as const;
const SCOPE_TOKEN_REGEX = /^[A-Za-z0-9._:/-]+$/;
const REDACTED = '***REDACTED***';
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

// P-4: registered secret values never appear in any message/error output.
const secretRegistry = new Set<string>();

export function registerSecretValue(value: string | undefined): void {
  const trimmed = value?.trim();
  if (trimmed) secretRegistry.add(trimmed);
}

export function redactSecrets(text: string): string {
  let out = text;
  for (const secret of secretRegistry) out = out.split(secret).join(REDACTED);
  return out;
}

export class EntraConfigError extends Error {
  readonly issues: ReadonlyArray<{ path: string; message: string }>;

  constructor(message: string, issues: ReadonlyArray<{ path: string; message: string }> = []) {
    super(redactSecrets(message));
    this.name = 'EntraConfigError';
    this.issues = issues.map(i => ({ path: i.path, message: redactSecrets(i.message) }));
  }
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

const ENTRA_KEYS = [
  'ENTRA_TENANT_ID', 'ENTRA_CLIENT_ID', 'ENTRA_CLIENT_SECRET', 'ENTRA_REDIRECT_URI',
  'ENTRA_AUTHORITY', 'ENTRA_ISSUER', 'ENTRA_JWKS_URI', 'ENTRA_SCOPES',
];
const REQUIRED_KEYS = [
  'ENTRA_TENANT_ID', 'ENTRA_CLIENT_ID', 'ENTRA_CLIENT_SECRET', 'ENTRA_REDIRECT_URI',
];

function envBool(env: NodeJS.ProcessEnv, key: string, fallback: boolean): boolean {
  const val = env[key];
  if (val === undefined) return fallback;
  return val === '1' || val.toLowerCase() === 'true';
}

function buildRawFrom(env: NodeJS.ProcessEnv) {
  return {
    tenantId: env.ENTRA_TENANT_ID,
    clientId: env.ENTRA_CLIENT_ID,
    clientSecret: env.ENTRA_CLIENT_SECRET,
    redirectUri: env.ENTRA_REDIRECT_URI,
    authority: env.ENTRA_AUTHORITY,
    issuer: env.ENTRA_ISSUER,
    jwksUri: env.ENTRA_JWKS_URI,
    scopes: env.ENTRA_SCOPES,
  };
}

function toEnvVarName(field: string): string {
  return `ENTRA_${field.replace(/([A-Z])/g, '_$1').toUpperCase()}`;
}

function toEnvVarPath(path: (string | number)[]): string {
  const [first, ...rest] = path;
  const field = toEnvVarName(String(first));
  return rest.length ? `${field}.${rest.join('.')}` : field;
}

function flattenIssues(error: z.ZodError): Array<{ path: string; message: string }> {
  return error.issues.map(i => ({ path: toEnvVarPath(i.path), message: i.message }));
}

function applyDerivedDefaults(cfg: z.infer<typeof EntraConfigSchema>): EntraConfig {
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

function gateOffSurface(env: NodeJS.ProcessEnv): EntraSurface {
  if (ENTRA_KEYS.some(k => env[k]?.trim())) {
    logger.warn('Entra vars partially set but SSO_ENABLED=false — SSO stays disabled');
  }
  return { ssoEnabled: false, config: null };
}

function throwIfMissingRequired(env: NodeJS.ProcessEnv): void {
  const missing = REQUIRED_KEYS.filter(k => !env[k]?.trim());
  if (missing.length > 0) {
    throw new EntraConfigError(
      `SSO_ENABLED=true but missing required Entra config: ${missing.join(', ')}. ` +
      `See backend/.env.example (SA4E-264).`,
    );
  }
}

function parseAndDerive(env: NodeJS.ProcessEnv): EntraConfig {
  const parsed = EntraConfigSchema.safeParse(buildRawFrom(env));
  if (!parsed.success) {
    const issues = flattenIssues(parsed.error);
    const summary = issues.map(i => `${i.path}: ${i.message}`).join('; ');
    throw new EntraConfigError(`Invalid Entra config — ${summary}.`, issues);
  }
  return applyDerivedDefaults(parsed.data);
}

function warnIfScopesMissingRefresh(scopes: string[]): void {
  if (!scopes.includes('offline_access')) {
    logger.warn({ scopes }, 'ENTRA_SCOPES missing offline_access — refresh token flow may not work');
  }
}

export async function loadEntraConfigAsync(env: NodeJS.ProcessEnv = process.env): Promise<EntraSurface> {
  const mergedEnv = { ...env };
  for (const [key, val] of authRuntimeOverrides.entries()) {
    mergedEnv[key] = val;
  }
  try {
    const { getAdminDb } = await import('../admin/admin-db.js');
    const db = getAdminDb();
    const row = await db.getAsync<{ tenant_id: string; client_id: string; client_secret: string; redirect_uri: string; scopes: string }>(
      'SELECT * FROM sso_providers WHERE provider_type = ? AND enabled = 1 ORDER BY updated_at DESC LIMIT 1', ['entra']);
    if (row) {
      // redirect_uri optional in the row: derive the default callback when empty
      // so it always matches the backend /auth/entra/callback endpoint.
      const { resolveRedirectUri } = await import('../server/auth/utils/callback-url.js');
      const cfg = {
        ENTRA_TENANT_ID: row.tenant_id,
        ENTRA_CLIENT_ID: row.client_id,
        ENTRA_CLIENT_SECRET: row.client_secret,
        ENTRA_REDIRECT_URI: resolveRedirectUri('entra', row.redirect_uri),
        ENTRA_SCOPES: row.scopes,
        SSO_ENABLED: 'true'
      };
      Object.assign(mergedEnv, cfg);
    }
  } catch {}
  if (!envBool(mergedEnv, 'SSO_ENABLED', false)) return gateOffSurface(mergedEnv);
  registerSecretValue(mergedEnv.ENTRA_CLIENT_SECRET);
  throwIfMissingRequired(mergedEnv);
  const config = parseAndDerive(mergedEnv);
  warnIfScopesMissingRefresh(config.scopes);
  return { ssoEnabled: true, config };
}

export function loadEntraConfig(env: NodeJS.ProcessEnv): EntraSurface {
  const mergedEnv = { ...env };
  for (const [key, val] of authRuntimeOverrides.entries()) {
    mergedEnv[key] = val;
  }
  if (!envBool(mergedEnv, 'SSO_ENABLED', false)) return gateOffSurface(mergedEnv);
  registerSecretValue(mergedEnv.ENTRA_CLIENT_SECRET);
  throwIfMissingRequired(mergedEnv);
  const config = parseAndDerive(mergedEnv);
  warnIfScopesMissingRefresh(config.scopes);
  return { ssoEnabled: true, config };
}
