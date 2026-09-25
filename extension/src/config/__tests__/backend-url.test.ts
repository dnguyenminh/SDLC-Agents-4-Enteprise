import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { validateBackendUrl, isLoopbackHost } from '../backend-url';

describe('validateBackendUrl (SEC-289-03 / Transport Security)', () => {
  it('allows http loopback URLs (localhost, 127.0.0.1, ::1)', () => {
    expect(validateBackendUrl('http://127.0.0.1:48721')).toBe('http://127.0.0.1:48721');
    expect(validateBackendUrl('http://localhost:3000')).toBe('http://localhost:3000');
    expect(validateBackendUrl('http://[::1]:8080')).toBe('http://[::1]:8080');
    expect(isLoopbackHost('127.0.0.1')).toBe(true);
    expect(isLoopbackHost('localhost')).toBe(true);
  });

  it('distinguishes loopback IPs from hostnames sharing a 127 prefix', () => {
    expect(isLoopbackHost('127.5.5.5')).toBe(true);
    expect(isLoopbackHost('127.999.0.1')).toBe(false);
    expect(isLoopbackHost('127.attacker.com')).toBe(false);
    expect(isLoopbackHost('127.0.0.1.evil.test')).toBe(false);
    expect(isLoopbackHost('LOCALHOST')).toBe(true);
    expect(isLoopbackHost('::1')).toBe(true);
    expect(isLoopbackHost('[::1]')).toBe(true);
  });

  it('allows https remote URLs', () => {
    expect(validateBackendUrl('https://api.enterprise.internal/kb')).toBe('https://api.enterprise.internal/kb');
    expect(validateBackendUrl('https://my-backend.corp.com:8443')).toBe('https://my-backend.corp.com:8443');
  });

  it('rejects unencrypted http remote URLs', () => {
    expect(() => validateBackendUrl('http://remote.server.internal:48721')).toThrow(
      /Insecure backend URL rejected: HTTP is only allowed for loopback/
    );
    expect(() => validateBackendUrl('http://192.168.1.100:48721')).toThrow(
      /Insecure backend URL rejected/
    );
  });

  it('rejects invalid schemes', () => {
    expect(() => validateBackendUrl('ftp://localhost:21')).toThrow(/Invalid backend URL protocol/);
  });

  it('rejects malformed URLs (bypass OFF / default)', () => {
    expect(() => validateBackendUrl('not a valid url')).toThrow(/Malformed backend URL/);
    expect(() => validateBackendUrl('http://')).toThrow(/Malformed backend URL/);
  });
});

// SA4E-320 — opt-in bypass of HTTPS enforcement for remote backend URLs
describe('validateBackendUrl allowInsecureRemote bypass (SA4E-320)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('bypass OFF (default/missing option): http remote still rejected', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => validateBackendUrl('http://remote.server.internal:48721')).toThrow(
      /Insecure backend URL rejected/
    );
    expect(() =>
      validateBackendUrl('http://remote.server.internal:48721', { allowInsecureRemote: false })
    ).toThrow(/Insecure backend URL rejected/);
  });

  it('bypass ON: http remote accepted and console.warn still logged', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const url = 'http://remote.server.internal:48721';
    expect(validateBackendUrl(url, { allowInsecureRemote: true })).toBe(url);
    // The logged warning must be the full security warning: bypass flag + explicit
    // "unencrypted HTTP" risk statement (not a generic/empty message).
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(
        /\[Security\] WARNING: Insecure remote backend URL allowed \(allowInsecureRemote=true\).*unencrypted HTTP/
      )
    );
    // SA4E-320 Finding #7: warning must carry explicit credential-interception/MITM
    // wording to match the UI warning copy.
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/Credentials and data can be intercepted \(MITM\)/)
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/Only use on trusted private networks/)
    );
  });

  it('bypass ON: invalid scheme still rejected', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() =>
      validateBackendUrl('ftp://remote.server.internal:21', { allowInsecureRemote: true })
    ).toThrow(/Invalid backend URL protocol/);
    expect(() =>
      validateBackendUrl('ws://remote.server.internal', { allowInsecureRemote: true })
    ).toThrow(/Invalid backend URL protocol/);
  });

  it('bypass ON: loopback http and https remote unaffected (no warning)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(validateBackendUrl('http://127.0.0.1:48721', { allowInsecureRemote: true })).toBe(
      'http://127.0.0.1:48721'
    );
    expect(validateBackendUrl('https://api.enterprise.internal', { allowInsecureRemote: true })).toBe(
      'https://api.enterprise.internal'
    );
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('bypass ON: 127-prefixed hostname requires explicit opt-in and warning', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const url = 'http://127.attacker.com:48721';
    expect(validateBackendUrl(url, { allowInsecureRemote: true })).toBe(url);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/\[Security\] WARNING: Insecure remote backend URL allowed/));
  });

  it('bypass OFF: 127-prefixed hostname is rejected as remote HTTP', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => validateBackendUrl('http://127.attacker.com:48721')).toThrow(
      /Insecure backend URL rejected/
    );
  });

  it('bypass ON: malformed URL still rejected', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() =>
      validateBackendUrl('not a valid url', { allowInsecureRemote: true })
    ).toThrow(/Malformed backend URL/);
  });
});

// SA4E-320 — the bypass must be strictly opt-in: package.json default stays false.
describe('kiroSdlc.backend.allowInsecureRemote setting default (SA4E-320)', () => {
  it('package.json declares the setting as boolean with default false', () => {
    const pkgPath = path.resolve(__dirname, '../../../package.json');
    const manifest = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const prop =
      manifest.contributes.configuration.properties['kiroSdlc.backend.allowInsecureRemote'];
    expect(prop).toBeDefined();
    expect(prop.type).toBe('boolean');
    expect(prop.default).toBe(false);
  });
});
