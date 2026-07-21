/**
 * Schema Registry Types — Defines column, index, and table definition structures
 * for multi-engine DDL generation.
 * Implements: SA4E-45
 */

export type DatabaseEngine = 'sqlite' | 'postgresql' | 'mysql';

/** Column definition supporting per-engine type overrides. */
export interface ColumnDef {
  name: string;
  /** Type per engine. If string, same for all engines. If object, per-engine override. */
  type: { sqlite: string; postgresql: string; mysql: string } | string;
  primaryKey?: boolean;
  autoIncrement?: boolean;
  notNull?: boolean;
  /** Default value per engine. If string, same for all engines. */
  default?: { sqlite?: string; postgresql?: string; mysql?: string } | string;
  unique?: boolean;
}

/** Index definition for CREATE INDEX statements. */
export interface IndexDef {
  name: string;
  columns: string[];
  unique?: boolean;
}

/** Table definition used by the registry and DDL generator. */
export interface TableDef {
  name: string;
  columns: ColumnDef[];
  indexes?: IndexDef[];
  /** If true, skip during migration (e.g. FTS virtual tables). */
  skipMigration?: boolean;
}
