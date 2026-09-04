/**
 * Input sanitization & validation helpers for the Admin Portal.
 * Root-cause defense against stored XSS (CWE-79) in KB tags and import fields.
 */

// Tags: only alphanumeric, hyphen, underscore, space. Reject anything else.
const TAG_PATTERN = /^[a-zA-Z0-9_\- ]{1,64}$/;

// Detects HTML/script injection vectors.
const HTML_PATTERN = /<[^>]*>|javascript:|on\w+\s*=/i;

/**
 * Returns true if the tag is safe (no HTML/script, within length limits).
 */
export function isValidTag(tag: unknown): boolean {
  return typeof tag === 'string' && TAG_PATTERN.test(tag);
}

/**
 * Validate a tags array. Returns the first invalid tag, or null if all valid.
 */
export function findInvalidTag(tags: unknown[]): string | null {
  for (const t of tags) {
    if (!isValidTag(t)) return typeof t === 'string' ? t : String(t);
  }
  return null;
}

/**
 * Returns true if the value contains HTML tags or script injection vectors.
 */
export function containsHtml(value: unknown): boolean {
  return typeof value === 'string' && HTML_PATTERN.test(value);
}

/**
 * Escape HTML special characters so the value renders as literal text.
 * Used for free-text fields (source, content) that must never contain markup.
 */
export function escapeHtml(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * Sanitize a KB entry: escape HTML in text fields and drop unsafe tags.
 * Returns a new object; does not mutate the input.
 */
export function sanitizeKbEntry(entry: Record<string, unknown>): Record<string, unknown> {
  const clean = { ...entry };
  for (const field of ['source', 'content', 'summary', 'label', 'title']) {
    if (typeof clean[field] === 'string') {
      clean[field] = escapeHtml(clean[field]);
    }
  }
  if (Array.isArray(clean.tags)) {
    clean.tags = (clean.tags as unknown[]).filter(isValidTag);
  }
  return clean;
}
