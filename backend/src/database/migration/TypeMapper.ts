/**
 * TypeMapper — Generic data type mapping between SQLite, PostgreSQL, MySQL.
 * Scans actual column data to determine real types before mapping,
 * solving SQLite's dynamic typing problem (INTEGER columns may contain text).
 * Implements: SA4E-45
 */

import type { DatabaseAdapter, DatabaseEngine } from '../adapters/DatabaseAdapter.js';

/** Column metadata from PRAGMA table_info */
export interface ColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

/** Resolved column definition ready for DDL generation */
export interface ResolvedColumn {
  name: string;
  resolvedType: string;
  isPrimaryKey: boolean;
  isAutoIncrement: boolean;
  notNull: boolean;
  defaultValue: string | null;
}

/** ISO 8601 date pattern for optional TIMESTAMP promotion */
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/;

/**
 * TypeMapper scans source data to determine actual column types,
 * then maps them to the correct target engine type.
 */
export class TypeMapper {
  constructor(private source: DatabaseAdapter) {}

  /**
   * Resolve the target type for a column by scanning actual data.
   * If mixed types found (e.g., integer + text), defaults to TEXT (safest).
   * @param table - Source table name
   * @param column - Column name to resolve
   * @param declaredType - SQLite declared type (from PRAGMA table_info)
   * @param engine - Target database engine
   * @param isPk - Whether column is primary key with AUTOINCREMENT
   */
  resolveColumnType(
    table: string, column: string, declaredType: string,
    engine: DatabaseEngine, isPk: boolean
  ): string {
    const upperType = declaredType.toUpperCase().trim();

    // PK AUTOINCREMENT has engine-specific handling
    if (isPk && upperType.includes('INT')) {
      return engine === 'postgresql' ? 'SERIAL' : 'INT AUTO_INCREMENT';
    }

    // Query actual runtime types in the column
    const actualTypes = this.scanColumnTypes(table, column);

    // BLOB — direct mapping, no ambiguity
    if (upperType === 'BLOB') {
      return engine === 'postgresql' ? 'BYTEA' : 'LONGBLOB';
    }

    // NUMERIC — direct mapping
    if (upperType === 'NUMERIC') {
      return engine === 'postgresql' ? 'NUMERIC' : 'DECIMAL';
    }

    // INTEGER column — check for mixed types
    if (upperType.includes('INT')) {
      if (actualTypes.includes('text')) return 'TEXT';
      return engine === 'postgresql' ? 'INTEGER' : 'INT';
    }

    // REAL column — check for mixed types
    if (upperType === 'REAL' || upperType === 'DOUBLE') {
      if (actualTypes.includes('text')) return 'TEXT';
      return engine === 'postgresql' ? 'DOUBLE PRECISION' : 'DOUBLE';
    }

    // TEXT column — optionally promote to TIMESTAMP if all ISO dates
    if (upperType === 'TEXT' || upperType === '') {
      if (this.isDateTimeColumn(table, column, declaredType)) {
        return engine === 'postgresql' ? 'TIMESTAMP' : 'DATETIME';
      }
      return 'TEXT';
    }

    // Fallback for unknown declared types
    return 'TEXT';
  }

  /**
   * Generate CREATE TABLE DDL for a target engine from source table metadata.
   * Builds DDL from scanned column info, NOT by parsing SQLite DDL.
   * @param table - Table name
   * @param targetEngine - Target database engine
   */
  generateCreateTable(table: string, targetEngine: DatabaseEngine): string {
    const columns = this.source.all<ColumnInfo>(`PRAGMA table_info("${table}")`);
    const resolved = columns.map(c => this.resolveColumn(c, table, targetEngine));
    const colDefs = resolved.map(c => this.formatColumnDef(c, targetEngine));
    return `CREATE TABLE IF NOT EXISTS "${table}" (\n  ${colDefs.join(',\n  ')}\n)`;
  }

  /** Resolve a single column: determine target type, PK, defaults. */
  private resolveColumn(
    col: ColumnInfo, table: string, engine: DatabaseEngine
  ): ResolvedColumn {
    const isAuto = col.pk === 1 && this.isAutoIncrement(table);
    const resolvedType = this.resolveColumnType(
      table, col.name, col.type, engine, isAuto
    );
    return {
      name: col.name,
      resolvedType,
      isPrimaryKey: col.pk === 1,
      isAutoIncrement: isAuto,
      notNull: col.notnull === 1,
      defaultValue: col.dflt_value,
    };
  }

  /** Format a resolved column into DDL fragment for the target engine. */
  private formatColumnDef(col: ResolvedColumn, engine: DatabaseEngine): string {
    const parts: string[] = [`"${col.name}"`, col.resolvedType];

    if (col.isPrimaryKey) parts.push('PRIMARY KEY');
    if (col.notNull && !col.isPrimaryKey) parts.push('NOT NULL');

    if (col.defaultValue !== null && !col.isAutoIncrement) {
      parts.push(`DEFAULT ${this.translateDefault(col.defaultValue, engine)}`);
    }
    return parts.join(' ');
  }

  /**
   * Query source DB to discover distinct runtime types in a column.
   * @returns e.g. ['integer'], ['integer', 'text'], ['real']
   */
  private scanColumnTypes(table: string, column: string): string[] {
    try {
      const rows = this.source.all<{ t: string }>(
        `SELECT DISTINCT typeof("${column}") as t ` +
        `FROM "${table}" WHERE "${column}" IS NOT NULL LIMIT 100`
      );
      return rows.map(r => r.t.toLowerCase());
    } catch {
      return [];
    }
  }

  /**
   * Check if a TEXT column contains ISO datetime values.
   * Triggers when default includes datetime('now') or all sampled values match ISO.
   */
  private isDateTimeColumn(
    table: string, column: string, declaredType: string
  ): boolean {
    // Check default from PRAGMA (use single quotes for table name)
    try {
      const colInfo = this.source.get<ColumnInfo>(
        `SELECT * FROM pragma_table_info('${table}') WHERE name = ?`,
        [column]
      );
      const dflt = colInfo?.dflt_value ?? '';
      if (dflt.includes("datetime('now')")) return true;
    } catch { /* pragma_table_info may not work on all adapters */ }

    if (declaredType.toUpperCase() !== 'TEXT') return false;
    try {
      const samples = this.source.all<{ v: string }>(
        `SELECT "${column}" as v FROM "${table}" ` +
        `WHERE "${column}" IS NOT NULL LIMIT 20`
      );
      if (samples.length === 0) return false;
      return samples.every(s => ISO_DATE_PATTERN.test(s.v));
    } catch {
      return false;
    }
  }

  /** Detect if table's PK uses AUTOINCREMENT in original SQLite DDL. */
  private isAutoIncrement(table: string): boolean {
    try {
      const row = this.source.get<{ sql: string }>(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name=?",
        [table]
      );
      return row?.sql?.toUpperCase().includes('AUTOINCREMENT') ?? false;
    } catch {
      return false;
    }
  }

  /**
   * Translate SQLite DEFAULT values to target engine equivalents.
   * Handles: datetime('now'), NULL, integers, strings, JSON defaults.
   */
  private translateDefault(value: string, engine: DatabaseEngine): string {
    const upper = value.toUpperCase().trim();
    if (upper.includes("DATETIME('NOW')")) {
      return engine === 'postgresql' ? 'NOW()' : 'CURRENT_TIMESTAMP';
    }
    if (upper === 'NULL') return 'NULL';
    // Pass through: '0', '1', '', '{}', '[]', quoted strings
    return value;
  }
}
