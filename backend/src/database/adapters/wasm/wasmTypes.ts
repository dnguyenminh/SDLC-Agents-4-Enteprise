/**
 * wasmTypes — re-exports the subset of @sqlite.org/sqlite-wasm types used by
 * the SQLite wasm adapter. Centralizing here keeps import paths stable and
 * documents exactly which parts of the (large) wasm API surface we depend on.
 */

export type { Sqlite3Static, Database, PreparedStatement, BindingSpec, SqlValue } from '@sqlite.org/sqlite-wasm';

/** Signature of the module's default export: the async initializer. */
export type Sqlite3InitModule = () => Promise<import('@sqlite.org/sqlite-wasm').Sqlite3Static>;
