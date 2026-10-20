/**
 * Env parsing pipeline for Entra ID SSO configuration.
 * Extracted from config/EntraConfig.ts (BR-18) — no behavior change.
 */

import { z } from 'zod';
import pino from 'pino';
import { EntraConfigSchema, applyDerivedDefaults, type EntraConfig } from './schema.js';
import { EntraConfigError, registerSecretValue } from './secret-redaction.js';

const logger = pino({ name: 'app-config' });

export const ENTRA_KEYS = [
  'ENTRA_TENANT_ID', 'ENTRA_CLIENT_ID', 'ENTRA_CLIENT_SECRET', 'ENTRA_REDIRECT_URI',
  'ENTRA_AUTHORITY', 'ENTRA_ISSUER', 'ENTRA_JWKS_URI', 'ENTRA_SCOPES',
];
const REQUIRED_KEYS = [
  'ENTRA_TENANT_ID', 'ENTRA_CLIENT_ID', 'ENTRA_CLIENT_SECRET', 'ENTRA_REDIRECT_URI',
];

export function envBool(env: NodeJS.ProcessEnv, key: string, fallback: boolean): boolean {
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

function gateOffSurface(env: NodeJS.ProcessEnv): EntraSurfaceShape {
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

export interface EntraSurfaceShape {
  ssoEnabled: boolean;
  config: EntraConfig | null;
}

/**
 * Shared gate/parse flow for sync + async loaders.
 * @param env  Pre-merged env (base env + runtime overrides [+ DB row]).
 */
export function parseSurface(env: NodeJS.ProcessEnv): EntraSurfaceShape {
  if (!envBool(env, 'SSO_ENABLED', false)) return gateOffSurface(env);
  registerSecretValue(env.ENTRA_CLIENT_SECRET);
  throwIfMissingRequired(env);
  const config = parseAndDerive(env);
  warnIfScopesMissingRefresh(config.scopes);
  return { ssoEnabled: true, config };
}
