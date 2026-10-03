/**
 * SA4E-336 — PowerShell command-content security patterns + normalization.
 *
 * Separated from ToolApprovalClassifier.ts to keep each file within the
 * 200-line standard and to isolate the security "model" (regex catalogs +
 * normalized-command type) from classification logic (SRP, code-standards).
 *
 * Implements TDD v1.2 §7.3:
 *  - §7.3.1 normalizePsCommand — decode -EncodedCommand/-enc/-e/-ec, strip
 *    backtick/caret escapes, resolve trivial concat, collapse ws, lower-case;
 *    `decoded=false` when the command cannot be statically understood (SEC-03).
 *  - §7.3.2 DESTRUCTIVE_PS_PATTERNS — full destructive catalog (SEC-01, BR-11).
 *  - §7.3.3 READONLY_PS_PATTERNS — safe allowlist, the AUTHORITY for powershell
 *    auto-approval (SEC-02 allowlist-of-safe posture).
 */

/**
 * Result of normalizing a raw PowerShell command before pattern matching.
 * @property text   normalized command (decoded, de-escaped, collapsed, lower-cased)
 * @property decoded false when the command cannot be statically understood
 *                   (undecodable encoded payload / dynamic eval / opaque input)
 */
export interface NormalizedCommand {
  text: string;
  decoded: boolean;
}

/**
 * Flags that carry a base64-encoded PowerShell payload. Captures the next
 * whitespace-delimited token (whatever it is) so a NON-base64 payload is still
 * recognized as "an encoded-command flag we cannot decode" → decoded=false,
 * rather than being silently ignored (which would leave decoded=true).
 */
const ENCODED_FLAG_RE = /-(?:encodedcommand|enc|ec|e)\b\s+(\S+)/i;
/** A clean base64 token (the only payload shape we can attempt to decode). */
const BASE64_TOKEN_RE = /^[a-z0-9+/]+={0,2}$/i;

/** Decode a single base64 PowerShell payload (UTF-16LE, PowerShell's encoding). */
function decodeBase64Payload(b64: string): string | null {
  try {
    const buf = Buffer.from(b64, 'base64');
    // PowerShell -EncodedCommand is UTF-16LE; try that first, then UTF-8.
    const utf16 = buf.toString('utf16le');
    if (utf16 && !utf16.includes('\uFFFD')) return utf16;
    const utf8 = buf.toString('utf8');
    if (utf8 && !utf8.includes('\uFFFD')) return utf8;
    return null; // contains replacement chars → not a clean decode
  } catch {
    return null;
  }
}

/** Strip backtick (`) and caret (^) escape obfuscation. */
function stripEscapes(cmd: string): string {
  return cmd.replace(/[`^]/g, '');
}

/** Resolve trivially-concatenated string literals: ('Remov'+'e-Item') → Remove-Item. */
function resolveTrivialConcat(cmd: string): string {
  return cmd.replace(/'([^']*)'\s*\+\s*'([^']*)'/g, (_m, a: string, b: string) => `'${a}${b}'`);
}

/** Collapse runs of whitespace to one space and trim. */
function collapse(cmd: string): string {
  return cmd.replace(/\s+/g, ' ').trim();
}

/** Markers of dynamic evaluation that defeat static analysis → decoded=false. */
const DYNAMIC_EVAL_RE = /\b(?:iex|invoke-expression)\b/i;
/** A $variable used as the eval target (runtime-constructed command). */
const DYNAMIC_VAR_RE = /(?:iex|invoke-expression)\s+\$|\$\w+\s*\|\s*(?:iex|invoke-expression)/i;

/**
 * Normalize a raw PowerShell command for security matching (TDD §7.3.1).
 * Runs BEFORE any pattern match. Pure + defensive — never throws.
 * @param raw raw command string from the approval request `input.command`
 * @returns normalized text + `decoded` understandability flag
 */
export function normalizePsCommand(raw: string): NormalizedCommand {
  const input = String(raw ?? '');
  let working = input;
  let decoded = true;

  // 1. Decode -EncodedCommand/-enc/-e/-ec payloads (recursively, best-effort).
  for (let i = 0; i < 3; i++) {
    const m = ENCODED_FLAG_RE.exec(working);
    if (!m) break;
    const token = m[1];
    // A payload that is not even a clean base64 token, or that does not decode
    // to a valid UTF command, cannot be understood statically → fail-secure.
    const plain = BASE64_TOKEN_RE.test(token) ? decodeBase64Payload(token) : null;
    if (plain === null) {
      decoded = false;
      break;
    }
    working = working.replace(m[0], ` ${plain} `);
  }

  // 2. Strip escape obfuscation, resolve trivial concat.
  working = resolveTrivialConcat(stripEscapes(working));

  // 3. Collapse whitespace + lower-case.
  const text = collapse(working).toLowerCase();

  // 4. Dynamic eval of a runtime-constructed string cannot be verified safe.
  if (DYNAMIC_VAR_RE.test(text) || (DYNAMIC_EVAL_RE.test(text) && /\$\w+/.test(text))) {
    decoded = false;
  }

  return { text, decoded };
}

/**
 * Destructive PowerShell command patterns (TDD §7.3.2, SEC-01, BR-11).
 * Matched against the NORMALIZED command. A match forces a pend FIRST,
 * mode-independent. Also used for audit attribution (SEC-05).
 */
export const DESTRUCTIVE_PS_PATTERNS: ReadonlyArray<RegExp> = [
  // --- File/dir delete ---
  /\bremove-item\b/i, /\brm\b/i, /\bdel\b/i, /\berase\b/i, /\brd\b/i, /\brmdir\b/i,
  /\bremove-itemproperty\b/i, /\bclear-content\b/i, /\bclear-item\b/i,
  // --- File overwrite ---
  /\bset-content\b/i, /\bout-file\b/i, /\bnew-item\b.*-force\b/i,
  />>?/,
  /\bcopy-item\b.*-force\b/i, /\bmove-item\b/i, /\brename-item\b/i,
  // --- Process / service ---
  /\bstop-process\b/i, /\bkill\b/i, /\btaskkill\b/i, /\bstop-service\b/i,
  /\bset-service\b/i, /\brestart-service\b/i, /\brestart-computer\b/i, /\bshutdown\b/i,
  // --- Format / disk ---
  /\bformat-volume\b/i, /\bformat-\w+\b/i, /\bclear-disk\b/i, /\binitialize-disk\b/i, /\bdiskpart\b/i,
  // --- Docker / container data destruction (SA4E-335, closes SEC-06 parity) ---
  /\bdocker\s+volume\s+(rm|prune)\b/i,
  /\bdocker\s+compose\b.*\sdown\b.*\s(-v|--volumes)\b/i,
  /\bdocker\s+system\s+prune\b/i,
  // --- Policy / security ---
  /\bset-executionpolicy\b/i, /\bset-itemproperty\b/i, /\breg\s+delete\b/i,
  /\breg\s+add\b/i, /\bset-acl\b/i,
  // --- Accounts ---
  /\bnet\s+user\b/i, /\bnet\s+localgroup\b/i, /\bnew-localuser\b/i,
  /\bremove-localuser\b/i, /\badd-localgroupmember\b/i,
  // --- Scheduled tasks / persistence ---
  /\bschtasks\b/i, /\bregister-scheduledtask\b/i, /\bnew-service\b/i,
  // --- Code execution / obfuscation (MUST pend) ---
  /\binvoke-expression\b/i, /\biex\b/i, /-encodedcommand\b/i, /-enc\b/i, /-e\b/i,
  /&\s*[('"]/,
  /\bstart-process\b/i, /\bcmd\b/i, /\binvoke-command\b/i,
  // --- Download (RCE path) ---
  /\binvoke-webrequest\b/i, /\biwr\b/i, /\binvoke-restmethod\b/i, /\birm\b/i,
  /\bcurl\b/i, /\bwget\b/i, /\bstart-bitstransfer\b/i, /\bcertutil\b.*-urlcache\b/i,
  // --- Git destructive ---
  /\bgit\s+push\b/i, /\bgit\s+commit\b/i,
  /\bgit\s+reset\b.*--hard\b/i, /\bgit\s+clean\b/i, /\bgit\s+checkout\b/i,
];

/**
 * Read-only PowerShell allowlist (TDD §7.3.3, SEC-02).
 * THE authority for powershell auto-approval: a normalized command auto-approves
 * ONLY if it matches here, did NOT match DESTRUCTIVE_PS_PATTERNS, and is decoded.
 * Anchored to the whole command intent to prevent substring smuggling.
 */
export const READONLY_PS_PATTERNS: ReadonlyArray<RegExp> = [
  /^get-childitem\b/i, /^get-content\b/i, /^test-path\b/i, /^get-item\b/i,
  /^get-itemproperty\b/i, /^get-location\b/i, /^get-process\b/i, /^get-service\b/i,
  /^select-string\b/i, /^measure-object\b/i, /^resolve-path\b/i, /^get-date\b/i,
  /^ls\b/i, /^cat\b/i, /^dir\b/i, /^pwd\b/i, /^gci\b/i, /^gc\b/i, /^type\b/i, /^where\b/i,
];

/** Compound-statement separators — a command with these must have EVERY segment safe. */
const COMPOUND_SPLIT_RE = /\s*(?:;|\|\||&&|&)\s*/;

/**
 * True when the normalized command is a positively-recognized safe read-only
 * command. Rejects compound statements unless every segment is independently
 * safe (prevents "get-content a; remove-item ." smuggling — TDD §7.3.3).
 * @param normalizedText normalized command text (already lower-cased)
 */
export function isReadonlyPsCommand(normalizedText: string): boolean {
  if (!normalizedText) return false;
  const segments = normalizedText.split(COMPOUND_SPLIT_RE).map((s) => s.trim()).filter(Boolean);
  if (segments.length === 0) return false;
  return segments.every((seg) => READONLY_PS_PATTERNS.some((p) => p.test(seg)));
}

/**
 * Return the matched destructive category id for audit logging (SEC-05), or
 * null when no destructive pattern matches. Category = first matching regex
 * source, uppercased + sanitized, prefixed `DESTRUCTIVE_`.
 * @param normalizedText normalized command text
 */
export function matchedDestructiveCategory(normalizedText: string): string | null {
  for (const p of DESTRUCTIVE_PS_PATTERNS) {
    if (p.test(normalizedText)) {
      const token = p.source.replace(/\\b|\\s\+|\.\*|[\\^$()]/g, '').replace(/[^a-z0-9-]+/gi, '_');
      return `DESTRUCTIVE_${token.replace(/^_+|_+$/g, '').toUpperCase()}`;
    }
  }
  return null;
}
