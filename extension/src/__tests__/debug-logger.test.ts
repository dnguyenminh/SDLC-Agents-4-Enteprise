import { describe, it, expect } from 'vitest';
import { redactSensitive } from '../debug-logger';

describe('redactSensitive (SEC-289-10 / Log Redaction)', () => {
  it('redacts Bearer tokens', () => {
    const raw = 'Request header: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xyz';
    const redacted = redactSensitive(raw);
    expect(redacted).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xyz');
    expect(redacted).toContain('Bearer "***REDACTED***"');
  });

  it('redacts secret credentials', () => {
    const raw = 'Config: {"apiKey": "sk-1234567890abcdef", "password": "super-secret-pass"}';
    const redacted = redactSensitive(raw);
    expect(redacted).not.toContain('sk-1234567890abcdef');
    expect(redacted).not.toContain('super-secret-pass');
  });

  it('redacts raw chat messages or prompt contents', () => {
    const raw = 'Payload: {"chatHistory": [{"role": "user", "content": "secret customer data"}]}';
    const redacted = redactSensitive(raw);
    expect(redacted).not.toContain('secret customer data');
  });
});
