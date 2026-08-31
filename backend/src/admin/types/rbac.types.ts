/**
 * RBAC type definitions for the Admin Portal.
 * Implements: TDD §5.1 Core Types
 */

export type UserStatus = 'ACTIVE' | 'DISABLED' | 'PENDING';

export interface User {
  userId: string;
  username: string;
  email: string;
  status: UserStatus;
  accessGroupId: string;
  forcePasswordChange: boolean;
  createdAt: string;
  lastLogin?: string;
}

export interface AccessGroup {
  accessGroupId: string;
  accessGroupName: string;
  isSystemGroup: boolean;
  permissions: GroupPermission[];
  createdAt?: string;
  updatedAt?: string;
}

export interface GroupPermission {
  permissionId: string;
  roleData: Record<string, unknown>;
}

export interface Permission {
  permissionId: string;
  permissionName: string;
  description?: string;
  roleDataSchema: object;
}

export type PermissionId =
  | 'DASHBOARD_VIEW'
  | 'KB_READ'
  | 'KB_WRITE'
  | 'KB_PROMOTE'
  | 'KB_IMPORT_EXPORT'
  | 'MCP_ACCESS'
  | 'MCP_MANAGE'
  | 'USER_MANAGE'
  | 'RBAC_MANAGE'
  | 'CONFIG_EDIT'
  | 'SEARCH_EXPLORE'
  | 'AUDIT_VIEW'
  | 'GRAPH_VIEW'
  | 'ANALYTICS_VIEW';

export interface Session {
  sessionId: string;
  userId: string;
  device?: string;
  ipAddress?: string;
  loginAt: string;
  expiresAt: string;
  isActive: boolean;
}

export interface AuditEntry {
  auditId: string;
  userId: string;
  username: string;
  action: string;
  resource: string;
  resourceId?: string;
  changes?: string;
  timestamp: string;
  ipAddress?: string;
}

export interface ConfigEntry {
  section: string;
  key: string;
  value: string;
  type: 'string' | 'number' | 'boolean' | 'select';
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
  sourceTier: string;
  targetTier: string;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewComment?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
  cooldownUntil?: string;
}
