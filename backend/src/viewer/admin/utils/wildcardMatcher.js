/**
 * Wildcard matcher supporting * and ? wildcards, case-insensitive.
 * Implements Strategy pattern for filter search.
 */
export function matchesWildcard(text, pattern) {
  if (!pattern) return true;
  if (!text) return false;
  // Escape regex special chars except * and ?
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  const regex = new RegExp('^' + escaped + '$', 'i');
  return regex.test(text);
}

/**
 * Filter an array of items by query using wildcard matching on specified key.
 */
export function filterByWildcard(items, query, key = 'type') {
  if (!query) return items;
  return items.filter(item => matchesWildcard(String(item[key] || ''), query));
}
