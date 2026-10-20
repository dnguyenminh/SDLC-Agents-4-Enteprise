/**
 * SA4E-264: Entra ID SSO configuration (config layer).
 * P-2 single source: only this module reads SSO_ENABLED / ENTRA_* env vars.
 *
 * BR-18 facade — schema/types live in ./EntraConfig/schema.ts, secret redaction
 * in ./EntraConfig/secret-redaction.ts, env parsing in ./EntraConfig/env-parse.ts.
 */

import { parseSurface } from './EntraConfig/env-parse.js';
import { authRuntimeOverrides } from './EntraConfig/runtime-overrides.js';
import type { EntraConfig, EntraSurface } from './EntraConfig/schema.js';

export type { EntraConfig, EntraSurface } from './EntraConfig/schema.js';
export { EntraConfigSchema, EntraSurfaceSchema } from './EntraConfig/schema.js';
export { EntraConfigError, redactSecrets, registerSecretValue } from './EntraConfig/secret-redaction.js';
export { authRuntimeOverrides };

/** Async loader: merges DB-backed sso_providers row (if any) before parsing. */
export async function loadEntraConfigAsync(env: NodeJS.ProcessEnv = process.env): Promise<EntraSurface> {
  const mergedEnv: NodeJS.ProcessEnv = { ...env };
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
  return parseSurface(mergedEnv);
}

/** Sync loader: env (+ runtime overrides) only. */
export function loadEntraConfig(env: NodeJS.ProcessEnv): EntraSurface {
  const mergedEnv: NodeJS.ProcessEnv = { ...env };
  for (const [key, val] of authRuntimeOverrides.entries()) {
    mergedEnv[key] = val;
  }
  return parseSurface(mergedEnv);
}
