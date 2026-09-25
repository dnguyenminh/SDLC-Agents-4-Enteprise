export { getAdminDb, getIndexDbPath, hashPassword, verifyPassword, generateToken, logger } from './core.js';

export { getUsers, getUserById, getUserByUsername, createUser, updateUserStatus, deleteUser, resetUserPassword, changePassword, updateLastLogin } from './users.js';

export { getGroups, getGroupById, createGroup, updateGroup, deleteGroup, getUserPermissions, getGroupPermissionIds } from './groups.js';

export { createSession, validateSession, invalidateSession, invalidateUserSessions, refreshSession, getUserSessions } from './sessions.js';

export { recordAudit, getAuditLogs, getRecentActivity } from './audit.js';

export type { ConfigChange } from './config.js';
export { recordConfigChange, getConfigChanges, getLatestConfigValue, loadPersistedLLMConfig } from './config.js';

export { recordQueryLog, getQueryLogs, getQueryLogStats } from './query-logs.js';

export { setPromotionCooldown, checkPromotionCooldown } from './promotion.js';

export { searchKbEntries } from './kb-search.js';

export { getKbEmbeddings } from './kb-embeddings.js';

export { getKbEntryById, getKbEntryCount, getKbEntries } from './kb-entries.js';

export { getAllKbTags, updateKbEntryTags, renameKbTag, deleteKbTag, mergeKbTags, getKbEntriesByTag } from './kb-tags.js';
