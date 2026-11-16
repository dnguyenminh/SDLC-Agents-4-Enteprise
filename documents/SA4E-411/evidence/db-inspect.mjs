// db-inspect.mjs — inspect the ISOLATED backend SQLite store.
//
// Usage: node db-inspect.mjs <dbPath>

import { DatabaseSync } from 'node:sqlite';

const dbPath = process.argv[2];
const db = new DatabaseSync(dbPath, { readOnly: true });

const tables = db
  .prepare("select name from sqlite_master where type='table' order by name")
  .all()
  .map((r) => r.name);

console.log('tables containing "symbol" or "file":');
console.log(tables.filter((t) => /symbol|file|graph/i.test(t)).join('\n'));

for (const t of tables.filter((x) => /^(code_symbols|files|symbols|code_symbol|code_index_snapshot|source_file_revision|code_chunk|repository)$/.test(x))) {
  try {
    const n = db.prepare(`select count(*) c from "${t}"`).get().c;
    console.log(`\n--- ${t}: ${n} rows ---`);
    const rows = db.prepare(`select * from "${t}" limit 3`).all();
    for (const r of rows) {
      const s = JSON.stringify(r);
      console.log(s.length > 600 ? s.slice(0, 600) + '…' : s);
    }
  } catch (e) { console.log(`  (${t}: ${e.message})`); }
}
db.close();
