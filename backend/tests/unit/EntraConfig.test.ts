// SA4E-264 S1 — unit tests per TDD §6.2 matrix (T-01..T-10)
import { describe, it, expect } from 'vitest';
import {
  loadEntraConfig,
  EntraConfigError,
  EntraConfigSchema,
  registerSecretValue,
  redactSecrets,
} from '../../src/config/EntraConfig.js';

const TENANT = '11111111-2222-3333-4444-555555555555';
const CLIENT = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const SECRET = 'super-secret-value-123';
const REDIRECT_HTTPS = 'https://app.example.com/auth/entra/callback';

function validEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    SSO_ENABLED: 'true',
    ENTRA_TENANT_ID: TENANT,
    ENTRA_CLIENT_ID: CLIENT,
    ENTRA_CLIENT_SECRET: SECRET,
    ENTRA_REDIRECT_URI: REDIRECT_HTTPS,
    ...overrides,
  };
}

function catchError(fn: () => unknown): EntraConfigError {
  try {
    fn();
  } catch (err) {
    return err as EntraConfigError;
  }
  throw new Error('expected EntraConfigError to be thrown');
}

describe('EntraConfig (SA4E-264 — SSO gate + validation)', () => {
  // T-01 — Valid: full config
  it('T-01: valid full config parses with all 8 typed fields', () => {
    const surface = loadEntraConfig(validEnv({
      ENTRA_AUTHORITY: `https://login.microsoftonline.com/${TENANT}`,
      ENTRA_ISSUER: `https://login.microsoftonline.com/${TENANT}/v2.0`,
      ENTRA_JWKS_URI: `https://login.microsoftonline.com/${TENANT}/discovery/v2.0/keys`,
      ENTRA_SCOPES: 'openid profile email offline_access',
    }));
    expect(surface.ssoEnabled).toBe(true);
    const cfg = surface.config;
    expect(cfg).not.toBeNull();
    expect(cfg?.tenantId).toBe(TENANT);
    expect(cfg?.clientId).toBe(CLIENT);
    expect(cfg?.clientSecret).toBe(SECRET);
    expect(cfg?.redirectUri).toBe(REDIRECT_HTTPS);
    expect(cfg?.authority).toBe(`https://login.microsoftonline.com/${TENANT}`);
    expect(cfg?.issuer).toBe(`https://login.microsoftonline.com/${TENANT}/v2.0`);
    expect(cfg?.jwksUri).toBe(`https://login.microsoftonline.com/${TENANT}/discovery/v2.0/keys`);
    expect(cfg?.scopes).toEqual(['openid', 'profile', 'email', 'offline_access']);
  });

  // T-02 — Valid: derived defaults
  it('T-02: derived defaults applied when optional vars absent', () => {
    const cfg = loadEntraConfig(validEnv()).config;
    expect(cfg?.authority).toBe(`https://login.microsoftonline.com/${TENANT}`);
    expect(cfg?.issuer).toBe(`https://login.microsoftonline.com/${TENANT}/v2.0`);
    expect(cfg?.jwksUri).toBe(`https://login.microsoftonline.com/${TENANT}/discovery/v2.0/keys`);
    expect(cfg?.scopes).toEqual(['openid', 'profile', 'email', 'offline_access']);
  });

  // T-03 — Missing: ERR-01 full list + .env.example hint
  it('T-03: missing required vars when SSO on throws with full field list', () => {
    const err = catchError(() => loadEntraConfig({ SSO_ENABLED: 'true', ENTRA_TENANT_ID: TENANT }));
    expect(err.name).toBe('EntraConfigError');
    expect(err.message).toContain('SSO_ENABLED=true but missing required Entra config');
    expect(err.message).toContain('ENTRA_CLIENT_ID, ENTRA_CLIENT_SECRET, ENTRA_REDIRECT_URI');
    expect(err.message).toContain('See backend/.env.example (SA4E-264)');
  });

  // T-04 — Invalid GUID: ERR-02 field-level
  it('T-04: invalid GUID rejected with field-level message', () => {
    const tenantErr = catchError(() => loadEntraConfig(validEnv({ ENTRA_TENANT_ID: 'not-a-guid' })));
    expect(tenantErr.message).toContain('expected GUID or common|organizations|consumers');
    expect(tenantErr.issues.some(i => i.path === 'ENTRA_TENANT_ID')).toBe(true);
    const clientErr = catchError(() => loadEntraConfig(validEnv({ ENTRA_CLIENT_ID: 'nope' })));
    expect(clientErr.message).toContain('expected UUID/GUID');
    expect(clientErr.issues.some(i => i.path === 'ENTRA_CLIENT_ID')).toBe(true);
  });

  // T-05 — Non-HTTPS / bad redirect scheme: ERR-03
  it('T-05: non-HTTPS URL and invalid redirect scheme rejected', () => {
    const authErr = catchError(() =>
      loadEntraConfig(validEnv({ ENTRA_AUTHORITY: 'http://login.example.com' })));
    expect(authErr.issues.some(i => i.path === 'ENTRA_AUTHORITY')).toBe(true);
    expect(authErr.message).toContain('must be https://, or http://localhost[:port]');
    const redirErr = catchError(() =>
      loadEntraConfig(validEnv({ ENTRA_REDIRECT_URI: 'http://evil.com/cb' })));
    expect(redirErr.message).toContain('must be https:// or http://localhost with port');
    expect(redirErr.issues.some(i => i.path === 'ENTRA_REDIRECT_URI')).toBe(true);
    const fragErr = catchError(() =>
      loadEntraConfig(validEnv({ ENTRA_REDIRECT_URI: `${REDIRECT_HTTPS}#frag` })));
    expect(fragErr.message).toContain('fragment not allowed');
  });

  // T-06 — Issuer mismatch (BR-04, no silent overwrite)
  it('T-06: explicit issuer mismatch with tenant-derived fails', () => {
    const err = catchError(() => loadEntraConfig(validEnv({
      ENTRA_ISSUER: 'https://login.microsoftonline.com/99999999-8888-7777-6666-555555555555/v2.0',
    })));
    expect(err.message).toContain('explicit issuer mismatch with tenant-derived');
    expect(err.issues.some(i => i.path === 'ENTRA_ISSUER')).toBe(true);
  });

  // T-07 — Secret redaction on every error path (P-4)
  it('T-07: secret redacted on every error path', () => {
    const thrown = catchError(() => loadEntraConfig(validEnv({ ENTRA_CLIENT_ID: 'bad' })));
    const dump = JSON.stringify({ message: thrown.message, issues: thrown.issues });
    expect(dump).not.toContain(SECRET);
    registerSecretValue(SECRET);
    expect(redactSecrets(`value is ${SECRET}`)).toBe('value is ***REDACTED***');
    const err = new EntraConfigError(`leak ${SECRET}`, [
      { path: 'ENTRA_CLIENT_SECRET', message: `got ${SECRET}` },
    ]);
    expect(err.message).not.toContain(SECRET);
    expect(err.message).toContain('***REDACTED***');
    expect(err.issues[0]?.message).toBe('got ***REDACTED***');
  });

  // T-08 — Gate off: no validation, local-only boot
  it('T-08: gate off skips validation — null config, no throw', () => {
    const partial = loadEntraConfig({ SSO_ENABLED: 'false', ENTRA_TENANT_ID: TENANT });
    expect(partial.ssoEnabled).toBe(false);
    expect(partial.config).toBeNull();
    expect(loadEntraConfig({
      SSO_ENABLED: 'false', ENTRA_TENANT_ID: 'garbage', ENTRA_CLIENT_ID: 'x',
    }).config).toBeNull();
    expect(() => loadEntraConfig(validEnv({ SSO_ENABLED: 'false' }))).not.toThrow();
    expect(loadEntraConfig(validEnv({ SSO_ENABLED: 'false' })).config).toBeNull();
  });

  // T-08b — Gate semantics: true/1 case-insensitive on; other values off
  it('T-08b: gate accepts true/1 case-insensitive, other values are off', () => {
    expect(() => loadEntraConfig({ SSO_ENABLED: 'TRUE', ENTRA_TENANT_ID: TENANT }))
      .toThrow(EntraConfigError);
    expect(() => loadEntraConfig({ SSO_ENABLED: '1', ENTRA_TENANT_ID: TENANT }))
      .toThrow(EntraConfigError);
    expect(loadEntraConfig({ SSO_ENABLED: 'yes', ENTRA_TENANT_ID: TENANT }).config).toBeNull();
  });

  // T-09 — Multi-tenant tenant values accepted
  it('T-09: multi-tenant tenant values accepted', () => {
    const surface = loadEntraConfig(validEnv({ ENTRA_TENANT_ID: 'common' }));
    expect(surface.config?.tenantId).toBe('common');
    expect(surface.config?.authority).toBe('https://login.microsoftonline.com/common');
    expect(surface.config?.issuer).toBe('https://login.microsoftonline.com/common/v2.0');
    const raw = {
      tenantId: 'organizations', clientId: CLIENT, clientSecret: SECRET, redirectUri: REDIRECT_HTTPS,
    };
    expect(EntraConfigSchema.safeParse(raw).success).toBe(true);
    expect(EntraConfigSchema.safeParse({ ...raw, tenantId: 'consumers' }).success).toBe(true);
  });

  // T-10 — Scopes: missing offline_access warns (parse OK); invalid token fails ERR-04
  it('T-10: scopes parsed; missing offline_access warns; invalid token fails', () => {
    const warnCase = loadEntraConfig(validEnv({ ENTRA_SCOPES: 'openid profile email' }));
    expect(warnCase.config?.scopes).toEqual(['openid', 'profile', 'email']);
    const badToken = catchError(() => loadEntraConfig(validEnv({ ENTRA_SCOPES: 'openid em@il' })));
    expect(badToken.issues.some(i => i.path.startsWith('ENTRA_SCOPES'))).toBe(true);
    expect(badToken.message).toContain('ENTRA_SCOPES');
    const empty = catchError(() => loadEntraConfig(validEnv({ ENTRA_SCOPES: '   ' })));
    expect(empty.issues.some(i => i.path === 'ENTRA_SCOPES')).toBe(true);
  });
});
