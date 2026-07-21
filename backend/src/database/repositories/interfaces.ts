/**
 * SA4E-50 — Repository interfaces (Interface Segregation Principle).
 * Each interface is small and focused on a single domain area.
 * Implements: UC-05, ISP
 */

import type { GraphNodeCounts, UpsertNodeParams, AuditEntry, PaginatedResult } from './types.js';

/**
 * Graph data access — graph_nodes and graph_edges operations.
 * Implements: UC-03, UC-06, BR-04
 */
export interface IGraphRepository {
  /** Get node counts with NULL project_id fallback. [BR-04] */
  getNodeCounts(projectId: string): GraphNodeCounts;
  /** Delete all graph_nodes and graph_edges in a transaction. [UC-06] */
  resetGraph(): void;
  /** INSERT OR REPLACE a graph node. */
  upsertNode(params: UpsertNodeParams): void;
}

/**
 * User data access — user count and profile operations.
 * Implements: UC-02
 */
export interface IUserRepository {
  /** Total user count. [Source: sse.ts, analytics.ts] */
  getUserCount(): number;
  /** User count for a specific access group. [Source: rbac.ts] */
  getUserCountByGroup(accessGroupId: string): number;
  /** Update user email by userId. [Source: users.ts] */
  updateEmail(userId: string, email: string): void;
}

/**
 * Symbol data access — code symbol count queries.
 * Implements: UC-02, BR-02
 */
export interface ISymbolRepository {
  /** Count of code symbols matching SYMBOL_KINDS. */
  getSymbolCount(): number;
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
