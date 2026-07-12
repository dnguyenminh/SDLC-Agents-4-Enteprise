import Database from 'better-sqlite3';
const db = new Database('.code-intel/index.db');
const row = db.prepare("SELECT * FROM mcp_tools WHERE name='drawio_export_png'").get();
console.log(JSON.stringify(row, null, 2));
