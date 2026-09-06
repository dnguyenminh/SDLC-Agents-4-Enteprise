/**
 * Safely converts wildcard pattern (* and ?) to RegExp
 * Security: caps length, escapes regex meta, limits complexity
 */
export function safeWildcardToRegExp(pattern: string): RegExp | null {
  if (!pattern || pattern.length > 128) return null;
  // Escape regex meta characters except * and ?
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const regexSource = '^' + escaped.replace(/\*/g, '.*').replace(/\?/g, '.') + '$';
  try {
    return new RegExp(regexSource, 'i');
  } catch {
    return null;
  }
}

export function matchesWildcard(text: string, pattern: string): boolean {
  if (!pattern) return true;
  const re = safeWildcardToRegExp(pattern);
  if (!re) return false;
  return re.test(text);
}
