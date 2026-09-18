import Database from 'better-sqlite3';
const db = new Database('C:\\projects\\kiro\\SDLC-Agents-4-Enterprise\\backend\\.code-intel\\index.db');
const res = db.prepare('UPDATE sessions SET is_active = 0 WHERE is_active = 1').run();
console.log('Invalidated rows:', res.changes);
db.close();
