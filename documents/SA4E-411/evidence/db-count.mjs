// db-count.mjs — print every non-empty table in the isolated backend SQLite store.
//
// Usage: node db-count.mjs <dbPath>

import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync(process.argv[2], { readOnly: true });
const tables = db
  .prepare("select name from sqlite_master where type='table'")
  .all()
  .map((r) => r.name);

for (const t of tables) {
  try {
    const n = db.prepare(`select count(*) as c from "${t}"`).get().c;
    if (n > 0) console.log(String(n).padStart(8), t);
  } catch { /* table with unusual name — skip */ }
}
db.close();
