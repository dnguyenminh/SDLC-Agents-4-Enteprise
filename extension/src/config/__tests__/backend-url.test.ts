import { describe, it, expect } from 'vitest';
import { validateBackendUrl, isLoopbackHost } from '../backend-url';

describe('validateBackendUrl (SEC-289-03 / Transport Security)', () => {
  it('allows http loopback URLs (localhost, 127.0.0.1, ::1)', () => {
    expect(validateBackendUrl('http://127.0.0.1:48721')).toBe('http://127.0.0.1:48721');
    expect(validateBackendUrl('http://localhost:3000')).toBe('http://localhost:3000');
    expect(validateBackendUrl('http://[::1]:8080')).toBe('http://[::1]:8080');
    expect(isLoopbackHost('127.0.0.1')).toBe(true);
    expect(isLoopbackHost('localhost')).toBe(true);
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
});
