/**
 * SA4E-335 follow-up (closes SA4E-336 SEC-06) — bash command-content security.
 *
 * `ps-command-patterns.ts` gates the PowerShell tool; `bash` had no equivalent,
 * so a destructive command auto-approved under Autopilot. This is the bash
 * counterpart: matched against the NORMALIZED command, a match forces a PEND
 * first, mode-independent.
 *
 * Scope (deliberate, unlike the PowerShell allowlist-of-safe posture): bash
 * keeps its existing mode-scoped behavior for NON-destructive commands
 * (TDD §7.2 / TC-15 / TC-16 stay valid) — only genuinely destructive commands
 * are promoted to mode-independent pends. That is exactly the SEC-06 closure.
 *
 * KEEP IN SYNC with the docker/SA4E-335 subset of `DEFAULT_PATTERNS` in
 * backend/src/modules/security/gateguard/GateGuardService.ts so the MCP
 * advisory tool and this enforcement gate agree on what "destructive" means.
 */

/** Result of normalizing a raw bash/pwsh command before pattern matching. */
export interface NormalizedBashCommand {
  /** lower-cased, whitespace-collapsed, de-obfuscated command text */
  text: string;
}

/**
 * Undo cheap obfuscation before matching: backtick removal (bash escape /
 * PS escape) and backslash-escaped letters (`d\ocker` → `docker`), then
 * collapse whitespace and lower-case. Pure + defensive — never throws.
 * @param raw raw command string from the approval request `input.command`
 */
export function normalizeBashCommand(raw: unknown): NormalizedBashCommand {
  const input = String(raw ?? '');
  const deobfuscated = input
    .replace(/`/g, '')
    .replace(/\\([a-zA-Z])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return { text: deobfuscated };
}

/**
 * Destructive bash command patterns (SEC-06 closure, NFR8 / BR-11).
 * Matched against the NORMALIZED command; a match forces a PEND first,
 * mode-independent. Also used for audit attribution (SEC-05).
 */
export const DESTRUCTIVE_BASH_PATTERNS: ReadonlyArray<RegExp> = [
  // --- Docker volume / stack data destruction (SA4E-335 incident) ---
  /docker\s+compose\b.*\sdown\b.*\s(-v|--volumes)\b/i,
  /docker\s+volume\s+(rm|prune)\b/i,
  /docker\s+system\s+prune\b/i,
  /docker\s+rm\s+-f\b/i,
  // --- Filesystem destruction ---
  // Anchored on whitespace/start (NOT \b) so `docker run --rm nginx` — where
  // `--rm` still yields a word boundary — is NOT mis-classified as a delete.
  /(?:^|\s)rm\s+\S/i,
  /(?:^|\s)unlink\s+\S/i,
  /\bmkfs(\.\w+)?\b/i,
  /\bdd\b[^\n]*\bof=\/dev\//i,
  /\bshred\b/i,
  /:\s*\(\s*\)\s*\{/, // fork bomb
  // --- Git state destruction ---
  /\bgit\s+push\b[^\n]*(--force|-f\b)/i,
  /\bgit\s+reset\b/i, // soft / mixed / hard — all rewrite HEAD
  /\bgit\s+clean\b/i, // removes untracked files (destructive even without -f)
  /\bgit\s+checkout\s+(-{1,2}[a-z]*f\b|--\s)/i,
  /\bgit\s+checkout\s+\.(?!\S)/i, // discard the working tree: `git checkout .`
  // --- SQL data destruction ---
  /\b(drop|truncate)\s+(table|database|schema)\b/i,
  /\bdelete\s+from\s+\w+/i,
  // --- Disk / partition ---
  /\bdiskpart\b/i,
  /\bformat-volume\b/i,
  /\bformat-\w+:?\b/i,
  /\bclear-disk\b/i,
];

/**
 * Return the matched destructive category id for audit logging (SEC-05), or
 * null when no destructive pattern matches. Category = first matching regex
 * source, sanitized and prefixed `DESTRUCTIVE_BASH_`.
 * @param normalizedText normalized command text
 */
export function matchedDestructiveBashCategory(normalizedText: string): string | null {
  if (!normalizedText) return null;
  for (const p of DESTRUCTIVE_BASH_PATTERNS) {
    if (p.test(normalizedText)) {
      const token = p.source
        .replace(/\\b|\\s\+|\.\*|\\S\*|[\\^$()]/g, '')
        .replace(/[^a-z0-9-]+/gi, '_');
      return `DESTRUCTIVE_BASH_${token.replace(/^_+|_+$/g, '').toUpperCase()}`;
    }
  }
  return null;
}
