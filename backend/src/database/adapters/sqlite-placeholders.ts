/**
 * SQLite placeholder normalization.
 * Some SQLite drivers treat `$1`/`$2` as *named* parameters, so array binding
 * (stmt.run(...params)) throws "Too many parameter values were provided".
 * Cross-engine SQL often uses `$n` (PostgreSQL style). Normalize them to `?`
 * so array binding works on SQLite too.
 */
export function normalizeSqlitePlaceholders(sql: string): string {
  return sql.replace(/\$(\d+)/g, '?');
}
