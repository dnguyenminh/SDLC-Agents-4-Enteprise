/**
 * SA4E-50 — AuditRepository: encapsulates audit_logs table operations.
 * Provides structured audit trail recording and retrieval.
 */

import type { DatabaseAdapter } from '../adapters/DatabaseAdapter.js';
import type { IAuditRepository } from './interfaces.js';
import type { AuditEntry } from './types.js';
import { translateError } from '../errors/index.js';

/** Default number of audit entries to retrieve. */
const DEFAULT_AUDIT_LIMIT = 100;

/**
 * Repository for audit log recording and querying.
 * Inserts use parameterized queries; retrieval is ordered by recency.
 */
export class AuditRepository implements IAuditRepository {
  constructor(private readonly adapter: DatabaseAdapter) {}

  /**
   * Record a new audit log entry.
   * @param userId - User who performed the action
   * @param username - Display name of the user
   * @param action - Action type (e.g., 'CREATE', 'DELETE')
   * @param resource - Resource type affected
   * @param resourceId - Optional specific resource identifier
   * @param details - Optional additional context
   * @throws RepositoryError on database failure
   */
  async recordAudit(
    userId: string,
    username: string,
    action: string,
    resource: string,
    resourceId?: string,
    details?: string,
  ): Promise<void> {
    try {
      await this.adapter.runAsync(
        `INSERT INTO audit_logs (user_id, username, action, resource, resource_id, details)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [userId, username, action, resource, resourceId ?? null, details ?? null],
      );
    } catch (err) {
      throw translateError(err);
    }
  }

  /**
   * Get recent audit log entries ordered by most recent first.
   * @param limit - Maximum entries to return (default: 100)
   * @returns Array of audit entries
   * @throws RepositoryError on database failure
   */
  getAuditLogs(limit?: number): AuditEntry[] {
    try {
      const cap = limit ?? DEFAULT_AUDIT_LIMIT;
      return this.adapter.all<AuditEntry>(
        `SELECT id, user_id as userId, username, action, resource,
                resource_id as resourceId, details, timestamp
         FROM audit_logs ORDER BY id DESC LIMIT ?`,
        [cap],
      );
    } catch (err) {
      throw translateError(err);
    }
  }
}
