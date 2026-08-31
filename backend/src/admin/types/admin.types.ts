// KSA-286: Admin Portal Type Definitions

export type PermissionId =
  | 'DASHBOARD_VIEW' | 'KB_READ' | 'KB_WRITE' | 'KB_PROMOTE'
  | 'KB_IMPORT_EXPORT' | 'MCP_ACCESS' | 'MCP_MANAGE' | 'USER_MANAGE'
  | 'RBAC_MANAGE' | 'CONFIG_EDIT' | 'SEARCH_EXPLORE' | 'AUDIT_VIEW'
  | 'GRAPH_VIEW' | 'ANALYTICS_VIEW';

export type UserStatus = 'ACTIVE' | 'DISABLED' | 'PENDING';
export type KBTier = 'USER' | 'PROJECT' | 'SHARED';
export type PromotionStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type MCPServerStatus = 'RUNNING' | 'STOPPED' | 'ERROR' | 'STARTING';
export type ConfigValueType = 'string' | 'number' | 'boolean' | 'select';

export interface AdminUser {
  userId: string;
  username: string;
  email: string;
  status: UserStatus;
  accessGroupId: string;
  forcePasswordChange: boolean;
  createdAt: string;
  lastLogin?: string;
}

export interface AdminUserWithPassword extends AdminUser {
  passwordHash: string;
}

export interface Session {
  sessionId: string;
  userId: string;
  device?: string;
  ipAddress?: string;
  loginAt: string;
  expiresAt: string;
  isActive: boolean;
}

export interface AccessGroup {
  accessGroupId: string;
  accessGroupName: string;
  isSystemGroup: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AccessGroupWithPermissions extends AccessGroup {
  permissions: GroupPermission[];
  userCount?: number;
}

export interface Permission {
  permissionId: PermissionId;
  permissionName: string;
  description?: string;
  roleDataSchema: Record<string, any>;
}

export interface GroupPermission {
  permissionId: PermissionId;
  roleData: Record<string, any>;
}

export type AuditAction =
  | 'USER_CREATED' | 'USER_UPDATED' | 'USER_DISABLED' | 'USER_DELETED' | 'USER_FORCE_LOGOUT'
  | 'GROUP_CREATED' | 'GROUP_UPDATED' | 'GROUP_DELETED'
  | 'PERMISSION_ASSIGNED' | 'PERMISSION_REVOKED'
  | 'KB_ENTRY_PROMOTED' | 'KB_ENTRY_REJECTED' | 'KB_BULK_DELETE' | 'KB_IMPORTED' | 'KB_EXPORTED'
  | 'KB_LINKED' | 'KB_UNLINKED' | 'KB_TAGS_UPDATED'
  | 'SERVER_RESTARTED' | 'TOOL_ENABLED' | 'TOOL_DISABLED'
  | 'CONFIG_UPDATED' | 'CONFIG_RESET'
  | 'LOGIN_SUCCESS' | 'LOGIN_FAILED' | 'TOKEN_REVOKED';

export interface AuditEntry {
  auditId: string;
  userId: string;
  username: string;
  action: AuditAction;
  resource: string;
  resourceId?: string;
  changes?: { before?: Record<string, any>; after?: Record<string, any> };
  timestamp: string;
  ipAddress?: string;
}

export interface ConfigEntry {
  section: string;
  key: string;
  value: string;
  type: ConfigValueType;
  defaultValue: string;
  requiresRestart: boolean;
  lastModified?: string;
  modifiedBy?: string;
}

export interface ConfigHistoryEntry {
  historyId: string;
  section: string;
  key: string;
  oldValue: string;
  newValue: string;
  changedAt: string;
  changedBy: string;
}

export interface KBPromotionEntry {
  promotionId: string;
  entryId: string;
  sourceTier: KBTier;
  targetTier: KBTier;
  reason: string;
  status: PromotionStatus;
  reviewComment?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
  cooldownUntil?: string;
}

export interface MCPServerInfo {
  serverId: string;
  serverName: string;
  status: MCPServerStatus;
  tools: Array<{ name: string; enabled: boolean; lastCall?: string }>;
  lastHeartbeat?: string;
  uptimeSeconds: number;
  restartCount: number;
}

export interface DashboardHealth {
  uptime: number;
  memoryUsageMB: number;
  cpuPercent: number;
  sqliteFileSizeMB: number;
  mcpServers: { online: number; total: number };
  kbEntryCount: { user: number; project: number; shared: number };
  activeUsers: number;
  alerts: Array<{ severity: 'info' | 'warning' | 'critical'; message: string; since: string }>;
}

export interface PaginationParams { page: number; size: number; }

export interface PaginatedResult<T> {
  items: T[];
  pagination: { page: number; size: number; total: number; totalPages: number; hasNext: boolean; hasPrev: boolean };
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string; details?: Record<string, any> };
  meta: { requestId: string; timestamp: string };
}

export enum AdminErrorCode {
  UNAUTHORIZED = 'UNAUTHORIZED',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  ROLE_DATA_DENIED = 'ROLE_DATA_DENIED',
  USER_DISABLED = 'USER_DISABLED',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  DUPLICATE_USERNAME = 'DUPLICATE_USERNAME',
  DUPLICATE_EMAIL = 'DUPLICATE_EMAIL',
  WEAK_PASSWORD = 'WEAK_PASSWORD',
  INVALID_ROLE_DATA = 'INVALID_ROLE_DATA',
  LAST_SYSTEM_OWNER = 'LAST_SYSTEM_OWNER',
  CIRCULAR_LINK = 'CIRCULAR_LINK',
  ENTRY_NOT_FOUND = 'ENTRY_NOT_FOUND',
  GROUP_HAS_USERS = 'GROUP_HAS_USERS',
  PERMISSION_IN_USE = 'PERMISSION_IN_USE',
  IMPORT_TOO_LARGE = 'IMPORT_TOO_LARGE',
  CONCURRENT_EDIT = 'CONCURRENT_EDIT',
  PROMOTION_NOT_PENDING = 'PROMOTION_NOT_PENDING',
  COMMENT_TOO_SHORT = 'COMMENT_TOO_SHORT',
  SERVER_UNRESPONSIVE = 'SERVER_UNRESPONSIVE',
  RESTART_FAILED = 'RESTART_FAILED',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}


export interface ConfigUpdateResult { applied: boolean; requiresRestart: boolean; }

