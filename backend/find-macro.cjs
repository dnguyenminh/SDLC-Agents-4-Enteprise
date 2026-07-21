const Database = require('better-sqlite3');

// Scan both DBs for all tables + columns + actual data types
function scanDb(dbPath, label) {
  const db = new Database(dbPath);
  const tables = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE '%_fts%' AND name != 'schema_version'").all();
  
  console.log(`\n=== ${label} (${tables.length} tables) ===\n`);
  
  for (const t of tables) {
    const cols = db.pragma('table_info(' + t.name + ')');
    console.log(`TABLE: ${t.name}`);
    for (const col of cols) {
      // Check for mixed types
      let actualTypes = '';
      try {
        const types = db.prepare(`SELECT DISTINCT typeof("${col.name}") as t FROM "${t.name}" WHERE "${col.name}" IS NOT NULL LIMIT 5`).all();
        actualTypes = types.map(r => r.t).join(',');
      } catch(e) { actualTypes = '?'; }
      const pk = col.pk ? ' PK' : '';
      const nn = col.notnull ? ' NOT NULL' : '';
      const def = col.dflt_value ? ` DEFAULT ${col.dflt_value}` : '';
      console.log(`  ${col.name}: ${col.type}${pk}${nn}${def} [actual: ${actualTypes}]`);
    }
    console.log('');
  }
  db.close();
}

scanDb('.code-intel/index.db', 'UNIFIED DB');
