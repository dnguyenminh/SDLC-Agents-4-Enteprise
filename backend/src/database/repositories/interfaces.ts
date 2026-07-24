/**
 * SA4E-50 — Repository interfaces (Interface Segregation Principle).
 * Each interface is small and focused on a single domain area.
 * Implements: UC-05, ISP
 */

import type { GraphNodeCounts, UpsertNodeParams, AuditEntry, PaginatedResult, SymbolDetail } from './types.js';

/**
 * Graph data access — graph_nodes and graph_edges operations.
 * Implements: UC-03, UC-06, BR-04
 */
export interface IGraphRepository {
  /** Get node counts with NULL project_id fallback. [BR-04] */
  getNodeCounts(projectId: string): Promise<GraphNodeCounts>;
  /** Delete all graph_nodes and graph_edges in a transaction. [UC-06] */
  resetGraph(): Promise<void>;
  /** INSERT OR REPLACE a graph node. */
  upsertNode(params: UpsertNodeParams): Promise<void>;
  /** Register/update a project in project_registry. [Source: api-index.ts] */
  registerProject(projectId: string, displayName: string, workspacePath: string, createdBy?: string): Promise<void>;
}

/**
 * User data access — user count and profile operations.
 * Implements: UC-02
 */
export interface IUserRepository {
  /** Total user count. [Source: sse.ts, analytics.ts] */
  getUserCount(): Promise<number>;
  /** User count for a specific access group. [Source: rbac.ts] */
  getUserCountByGroup(accessGroupId: string): number | Promise<number>;
  /** Update user email by userId. [Source: users.ts] */
  updateEmail(userId: string, email: string): void | Promise<void>;
}

/**
 * Symbol data access — code symbol count queries.
 * Implements: UC-02, BR-02
 */
export interface ISymbolRepository {
  /** Count of code symbols matching SYMBOL_KINDS. */
  getSymbolCount(): Promise<number>;
  /** Get detail of a single symbol by ID (for KB Graph node click). */
  getSymbolDetail(symbolId: string): Promise<SymbolDetail | null>;
}

/**
 * Audit data access — audit log recording and retrieval.
 */
export interface IAuditRepository {
  /** Record an audit log entry. */
  recordAudit(
    userId: string,
    username: string,
    action: string,
    resource: string,
    resourceId?: string,
    details?: string,
  ): void;
  /** Get recent audit log entries. */
  getAuditLogs(limit?: number): AuditEntry[];
}

/**
 * Knowledge base data access — entry count and pagination.
 */
export interface IKbRepository {
  /** Get total entry count, optionally filtered. */
  getEntryCount(projectId: string, userId?: string): number;
  /** Get paginated entries with sorting. */
  getEntries(
    page: number,
    pageSize: number,
    sortBy: string,
    sortOrder: string,
    projectId: string,
    userId?: string,
  ): PaginatedResult;
}
