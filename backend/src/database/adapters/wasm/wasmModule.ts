/**
 * wasmModule — lazy singleton loader for the sqlite-wasm runtime.
 *
 * sqlite3InitModule() compiles/instantiates the WASM binary — expensive and
 * only needs to happen once per process. All adapters share one Sqlite3Static.
 */

import type { Sqlite3Static } from './wasmTypes.js';

let initPromise: Promise<Sqlite3Static> | null = null;

/**
 * Load and initialize the sqlite-wasm module (once per process).
 * @returns The shared Sqlite3Static namespace (capi, oo1, wasm, version).
 */
export async function getSqlite3(): Promise<Sqlite3Static> {
  if (!initPromise) {
    initPromise = import('@sqlite.org/sqlite-wasm').then((m) => m.default());
  }
  return initPromise;
}
