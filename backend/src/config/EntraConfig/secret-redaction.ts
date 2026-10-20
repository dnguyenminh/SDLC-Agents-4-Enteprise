/**
 * Secret redaction registry + config error type for Entra ID SSO.
 * Extracted from config/EntraConfig.ts (BR-18) — no behavior change.
 * P-4: registered secret values never appear in any message/error output.
 */

const REDACTED = '***REDACTED***';

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
