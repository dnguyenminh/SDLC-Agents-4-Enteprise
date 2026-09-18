// Invalidate all active sessions for consistency after UA hash refactor
import { db } from './backend/src/admin/db/core.js';
await db.runAsync('UPDATE sessions SET is_active = 0 WHERE is_active = 1');
console.log('Sessions invalidated');
