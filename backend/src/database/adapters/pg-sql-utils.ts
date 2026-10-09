/**
 * Pure SQL-string helpers shared by the PostgreSQL adapters — SA4E-335 hardening.
 *
 * Why a separate module: PostgresAdapter sits at its 200-line budget, and both
 * PG adapters shared the same naive `?`→$n replacement, which corrupts `?`
 * inside string literals. Pure functions keep the adapters lean and testable.
 */

export interface InsertTarget {
  /** Stable cache key (as parsed). */
  key: string;
  /** Schema for the information_schema lookup (default: public). */
  schema: string;
  /** Unqualified table name. */
  table: string;
}

/**
 * Convert ? placeholders to $1, $2, ... for the pg driver — skipping any `?`
 * inside single-quoted string literals ('' doubling is the literal escape).
 */
export function translatePlaceholders(sql: string): string {
  let idx = 0;
  let out = '';
  let inString = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (inString) {
      out += ch;
      if (ch === "'") {
        if (sql[i + 1] === "'") { out += "'"; i++; } else { inString = false; }
      }
      continue;
    }
    if (ch === "'") {
      inString = true;
      out += ch;
    } else if (ch === '?') {
      out += `$${++idx}`;
    } else {
      out += ch;
    }
  }
  return out;
}

/**
 * Extract the target table of an INSERT statement (bare or quoted, optional
 * schema). Bare identifiers are lowercased (PG semantics); returns null when
 * the target is unparsable so callers can fall back to plain INSERT.
 */
export function parseInsertTarget(sql: string): InsertTarget | null {
  const m = /^\s*INSERT\s+INTO\s+(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_.$]*))/i.exec(sql);
  if (!m) return null;
  if (m[1] !== undefined) return { key: `"${m[1]}"`, schema: 'public', table: m[1] };
  const name = m[2].toLowerCase();
  const dot = name.lastIndexOf('.');
  if (dot === -1) return { key: name, schema: 'public', table: name };
  return { key: name, schema: name.slice(0, dot), table: name.slice(dot + 1) };
}

/**
 * Validate and quote a table identifier — throws on anything unsafe so a
 * caller-controlled name can never reach SQL as raw interpolation (SQLi guard).
 */
export function quoteIdentifier(name: string): string {
  const t = name.trim();
  if (!t) throw new Error('Empty table identifier');
  return t.split('.').map((seg) => {
    const isQuoted = seg.length >= 2 && seg.startsWith('"') && seg.endsWith('"');
    const bare = isQuoted ? seg.slice(1, -1) : seg;
    if (!/^[A-Za-z_][A-Za-z0-9_$]*$/.test(bare) && !isQuoted) {
      throw new Error(`Unsafe table identifier: ${name}`);
    }
    return `"${bare.replace(/"/g, '""')}"`;
  }).join('.');
}
