export { getAdminDb, getIndexDbPath, getActiveEngine, getActiveDbConfig, resetAdminDb, getIndexAdapter, getAdminAdapter, hashPassword, verifyPassword, generateToken } from './db/core.js';

export { getUsers, getUserById, getUserByUsername, createUser, updateUserStatus, deleteUser, resetUserPassword, changePassword, updateLastLogin } from './db/users.js';

export { getGroups, getGroupById, createGroup, updateGroup, deleteGroup, getUserPermissions, getGroupPermissionIds } from './db/groups.js';

export { createSession, validateSession, invalidateSession, invalidateUserSessions, refreshSession, getUserSessions } from './db/sessions.js';

export { recordAudit, getAuditLogs, getRecentActivity } from './db/audit.js';

export type { ConfigChange } from './db/config.js';
export { recordConfigChange, getConfigChanges } from './db/config.js';

export { recordQueryLog, getQueryLogs, getQueryLogStats } from './db/query-logs.js';

export { setPromotionCooldown, checkPromotionCooldown } from './db/promotion.js';

export { searchKbEntries } from './db/kb-search.js';

export { getKbEmbeddings } from './db/kb-embeddings.js';

export { getKbEntryById, getKbEntryCount, getKbEntries } from './db/kb-entries.js';

export { getAllKbTags, updateKbEntryTags, renameKbTag, deleteKbTag, mergeKbTags, getKbEntriesByTag } from './db/kb-tags.js';
