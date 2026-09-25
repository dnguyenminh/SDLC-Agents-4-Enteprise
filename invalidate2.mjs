import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('C:\\projects\\kiro\\SDLC-Agents-4-Enterprise\\backend\\.code-intel\\index.db');
const result = db.exec('UPDATE sessions SET is_active = 0 WHERE is_active = 1');
console.log('done');
db.close();
