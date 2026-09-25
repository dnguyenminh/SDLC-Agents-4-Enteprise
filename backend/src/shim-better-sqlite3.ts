// @ts-ignore
import initSqlJs from 'sql.js';
let SQL: any = null;

async function getSQL() {
  if (!SQL) {
    SQL = await initSqlJs({ locateFile: (file: string) => `https://sql.js.org/dist/${file}` });
  }
  return SQL;
}

export class Database {
  private db: any;
  private path: string;

  constructor(path: string) {
    this.path = path;
    // Defer init
  }

  async _ensure() {
    if (!this.db) {
      const SQLClass = await getSQL();
      this.db = new SQLClass.Database();
    }
  }

  pragma(sql: string) {
    // no-op
  }

  exec(sql: string) {
    // synchronous? sql.js is sync
    // We'll assume db exists
  }

  prepare(sql: string) {
    return {
      run: (...params: any[]) => ({ changes: 0, lastInsertRowid: 0 }),
      get: (...params: any[]) => undefined,
      all: (...params: any[]) => [],
    };
  }

  close() {}
}
