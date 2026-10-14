/**
 * SA4E-360 — secret redaction + control-character hygiene for skeleton content
 * (SEC-360-01 remediation #1/#4, SEC-360-07; SECURITY-REVIEW §Detailed Findings).
 *
 * Every string that enters system context from code-derived text (signature
 * lines and RAW_HEAD heads) passes through {@link redactSecretLike} BEFORE
 * signature trimming, and through {@link stripControlChars} so invisible
 * payloads (zero-width, RTL overrides, C0 controls) never reach the prompt.
 * Both functions are idempotent and never throw.
 */

/** Literal marker replacing every redacted secret occurrence (STC UT-30). */
export const REDACTED_MARKER = '[REDACTED]';

/**
 * Canonical deny-list (SEC-360-01). Assignment values redact when quoted
 * (any content ≥ 8 chars) or unquoted AND digit-bearing (≥ 8 chars) — the
 * digit guard keeps ordinary signature parameters like `token: string)`
 * parseable while every realistic credential literal still matches.
 */
const SECRET_PATTERNS: readonly RegExp[] = [
  /\bsk-[A-Za-z0-9][A-Za-z0-9-]{15,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /gh[po]_[A-Za-z0-9]{16,}/g,
  /\bxox[bap]-[A-Za-z0-9-]{10,}/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
  /(?i:(password|passwd|secret|token|api[_-]?key))\s*[:=]\s*(?:"[^"]{8,}"|'[^']{8,}'|[^"'\s]*\d[^"'\s]{7,})/g,
  // F-2 (SA4E-360 remediation): high-frequency families missed by the baseline
  // list — bypass hunt, SECURITY-ASSESSMENT §Detailed Findings F-2. The
  // assignment pattern keeps the digit guard for unquoted values (SEC-L).
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g, // JWT (3 segments)
  /[a-z][a-z0-9+.-]*:\/\/[^:\/\s]+:[^@\s\/]{6,}@/g, // URL userinfo credentials (postgres/mysql/mongodb://user:pass@)
  /(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}/g, // Stripe live/test keys
  /github_pat_[A-Za-z0-9_]{20,}/g, // GitHub fine-grained PAT
  /glpat-[A-Za-z0-9_-]{15,}/g, // GitLab PAT
  /npm_[A-Za-z0-9]{20,}/g, // npm token
  /AIza[0-9A-Za-z_-]{35}/g, // Google API key
  /(?:pwd|passphrase|accountkey|aws[_-]?secret[_-]?access[_-]?key)\s*[:=]\s*(?:"[^"]{8,}"|'[^']{8,}'|[^"'\s]*\d[^"'\s]{7,})/gi,
];

/** Control / zero-width characters stripped (SEC-360-07: U+200B, U+202E, \x00-\x08…). */
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g;

/**
 * Replaces every secret-like occurrence with {@link REDACTED_MARKER}.
 * Idempotent: the marker itself matches no deny-list pattern.
 */
export function redactSecretLike(text: string): string {
  if (!text) return text;
  let out = text;
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, REDACTED_MARKER);
  }
  return out;
}

/** Strips control and zero-width characters (SEC-360-07) — safe for normal Unicode. */
export function stripControlChars(text: string): string {
  if (!text) return text;
  return text.replace(CONTROL_CHARS, '');
}

/** Applies both hygiene passes in one call (control-char strip FIRST so secret
 * patterns see clean text, then redaction). */
export function sanitizeCodeText(text: string): string {
  return redactSecretLike(stripControlChars(text));
}

/**
 * True when the file name must NEVER enter the skeleton corpus
 * (SEC-360-01 remediation #2 — separate from EXCLUDED_DIRS so directory
 * exclusion behavior for other callers is unchanged; STC UT-31).
 */
const SECRET_FILE_PATTERNS: readonly RegExp[] = [
  /^\.env(\.|$)/i,
  /\.pem$/i,
  /\.key$/i,
  /^id_rsa/i,
  /^id_ed25519/i,
  /^credentials(\.|$)/i,
  /secret/i,
];

export function isSecretFileName(fileName: string): boolean {
  const base = (fileName ?? '').split(/[\\/]/).pop() ?? '';
  return SECRET_FILE_PATTERNS.some((re) => re.test(base));
}
