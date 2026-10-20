/**
 * SQLite persistence — shared-DB registry, open/close, host-file import/export.
 * Extracted from SqliteAdapter (BR-18). Root-cause notes preserved.
 */
import * as fs from 'fs';
import * as path from 'path';

/**
 * Root-cause fix for sibling-adapter divergence: sqlite-wasm keeps a
 * private in-memory DB per `new DB()` instance, so N adapters on the same
 * host file each saw a different database (migrations visible on one,
 * `no such table` on the others). File-backed adapters now share a single
 * live DB per resolved path for the process lifetime (refcounted).
 * `:memory:` adapters stay fully isolated (unit tests rely on it).
 */
export interface SqliteSharedEntry { db: any; refs: number; dirty: boolean }
export const sharedDbs = new Map<string, SqliteSharedEntry>();

/** Mark a shared file DB dirty so the last disconnect exports it. */
export function markSharedDirty(key: string): void {
  const entry = sharedDbs.get(key);
  if (entry) entry.dirty = true;
}

/**
 * Open (or attach to) the live DB for a path. Root cause of SQLITE_CANTOPEN on
 * Linux CI: @sqlite.org/sqlite-wasm in Node.js only supports in-memory databases
 * (see its README). Host file paths are NOT visible inside the WASM MEMFS virtual
 * FS, so `new DB(hostPath)` throws CANTOPEN whenever the path contains
 * directories missing from MEMFS (always on POSIX; on Windows the backslashes
 * accidentally collapse into a single flat MEMFS name, so it "works" but the data
 * never reaches the host disk). Open :memory: and import the persisted host file
 * (written by closeSqliteDb via sqlite3_js_db_export) with sqlite3_deserialize.
 */
export async function openSqliteDb(
  dbPath: string,
  sqlite3: any,
): Promise<{ db: any; sharedKey: string | null }> {
  const useFile = dbPath !== ':memory:' && dbPath !== '';
  if (useFile) {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
  // Shared-DB fast path: another adapter already owns the live DB for
  // this file — reuse it so every consumer sees the same tables/rows.
  if (useFile) {
    const existing = sharedDbs.get(dbPath);
    if (existing) {
      existing.refs++;
      return { db: existing.db, sharedKey: dbPath };
    }
  }
  const db = new sqlite3.oo1.DB(':memory:');
  let deserialized = false;
  if (useFile && fs.existsSync(dbPath) && fs.statSync(dbPath).size > 0) {
    importHostFile(db, dbPath, sqlite3);
    deserialized = true;
  }
  if (useFile) {
    sharedDbs.set(dbPath, { db, refs: 1, dirty: false });
  }
  // SA4E-262 fix: WAL is a file-system journal mode. On the WASM in-memory /
  // deserialized DB it attempts to create WAL files inside MEMFS and throws
  // SQLITE_CANTOPEN. Skip it — durability for host-file DBs is provided by
  // the sqlite3_js_db_export in closeSqliteDb().
  if (!deserialized) {
    db.exec("PRAGMA journal_mode = WAL;");
  }
  db.exec("PRAGMA foreign_keys = ON;");
  return { db, sharedKey: useFile ? dbPath : null };
}

/**
 * Load a previously exported host DB file into the live in-memory database.
 * Uses sqlite3_deserialize with FREEONCLOSE so SQLite takes ownership of the
 * WASM buffer (freed automatically on close). On failure the buffer is freed
 * manually and a descriptive error is thrown (fail fast — never boot on a
 * silently empty database).
 */
function importHostFile(db: any, dbPath: string, sqlite3: any): void {
  const data = new Uint8Array(fs.readFileSync(dbPath));
  // SA4E-262 fix: a host file written in WAL mode carries write/read version
  // bytes 18/19 = 2. Deserializing such an image into the WASM in-memory DB
  // makes every statement demand the -wal/-shm files, which do not exist in
  // MEMFS -> SQLITE_CANTOPEN (server crash on first admin/config request).
  // Patch the in-memory copy to legacy mode (1/1) — safe because a WAL image
  // without a sidecar -wal file is self-contained (no pending transactions).
  if (data.length > 19 && data[18] === 2 && data[19] === 2) {
    data[18] = 1;
    data[19] = 1;
  }
  const capi = sqlite3.capi;
  const pData = sqlite3.wasm.allocFromTypedArray(data);
  let owned = false;
  try {
    const rc = capi.sqlite3_deserialize(
      db.pointer,
      'main',
      pData,
      data.length,
      data.length,
      capi.SQLITE_DESERIALIZE_FREEONCLOSE | capi.SQLITE_DESERIALIZE_RESIZEABLE,
    );
    if (rc !== 0) {
      throw new Error(`sqlite3_deserialize failed for ${dbPath} (rc=${rc})`);
    }
    owned = true;
  } finally {
    if (!owned) {
      sqlite3.wasm.dealloc(pData);
    }
  }
}

/**
 * Close the live DB, exporting host-file changes when any holder dirtied it
 * (one export persists everyone's changes). The shared live object is always
 * current, so the export-on-dirty keeps persistence semantics across holders.
 */
export function closeSqliteDb(
  db: any, dbPath: string, sharedKey: string | null, dirty: boolean, sqlite3: any,
): void {
  const entry = sharedKey ? sharedDbs.get(sharedKey) : undefined;
  if (dbPath !== ':memory:' && dbPath !== '' && (dirty || entry?.dirty)) {
    const data = sqlite3.capi.sqlite3_js_db_export(db, 'main');
    fs.writeFileSync(dbPath, Buffer.from(data));
    if (entry) entry.dirty = false;
  }
  if (entry && sharedKey) {
    entry.refs--;
    // Last holder closes the shared DB; a later connect re-imports
    // from the exported host file, preserving persistence semantics.
    if (entry.refs <= 0) {
      db.close();
      sharedDbs.delete(sharedKey);
    }
  } else {
    db.close();
  }
}
