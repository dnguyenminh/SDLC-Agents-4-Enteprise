/**
 * SA4E-50 — Shared database constants (single source of truth).
 * Centralizes values previously duplicated across route files.
 * Implements: BR-02, UC-04
 */

/** Canonical code symbol types used in graph_nodes queries (uppercase). */
export const CODE_TYPES = [
  'FUNCTION', 'METHOD', 'CLASS', 'INTERFACE',
  'TYPE', 'CONSTRUCTOR', 'ENUM', 'CONSTANT', 'VARIABLE',
] as const;

/** Pre-computed SQL IN clause string for CODE_TYPES. */
export const CODE_TYPES_SQL = CODE_TYPES.map(t => `'${t}'`).join(',');

/** Symbol kinds used in index.db symbols table queries (lowercase). */
export const SYMBOL_KINDS = [
  'function', 'class', 'interface', 'method',
  'type', 'enum', 'constructor',
] as const;

/** Pre-computed SQL IN clause string for SYMBOL_KINDS. */
export const SYMBOL_KINDS_SQL = SYMBOL_KINDS.map(k => `'${k}'`).join(',');

/** Type alias for code type values. */
export type CodeType = typeof CODE_TYPES[number];

/** Type alias for symbol kind values. */
export type SymbolKind = typeof SYMBOL_KINDS[number];
