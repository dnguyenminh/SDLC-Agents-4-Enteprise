/**
 * SA4E-50 — UserRepository: encapsulates users table queries.
 * Eliminates raw SQL from sse.ts, analytics.ts, rbac.ts, users.ts.
 * Implements: UC-02
 */

import type { DatabaseAdapter } from '../adapters/DatabaseAdapter.js';
import type { IUserRepository } from './interfaces.js';
import { translateError } from '../errors/index.js';

/**
 * Repository for user-related database operations.
 * All queries use parameterized values to prevent SQL injection.
 */
export class UserRepository implements IUserRepository {
  constructor(private readonly adapter: DatabaseAdapter) {}

  /**
   * Get total user count across all groups.
   * @returns Number of users in the database
   * @throws RepositoryError on database failure
   */
  async getUserCount(): Promise<number> {
    try {
      const row = await this.adapter.getAsync<{ cnt: number }>(
        'SELECT COUNT(*) as cnt FROM users',
      );
      return row?.cnt ?? 0;
    } catch (err) {
      throw translateError(err);
    }
  }

  /**
   * Get user count for a specific access group.
   * @param accessGroupId - The access group identifier
   * @returns Number of users in the specified group
   * @throws RepositoryError on database failure
   */
  async getUserCountByGroup(accessGroupId: string): Promise<number> {
    try {
      const row = await this.adapter.getAsync<{ cnt: number }>(
        'SELECT COUNT(*) as cnt FROM users WHERE access_group_id = ?',
        [accessGroupId],
      );
      return row?.cnt ?? 0;
    } catch (err) {
      throw translateError(err);
    }
  }

  /**
   * Update a user's email address.
   * @param userId - The user identifier
   * @param email - The new email address
   * @throws RepositoryError on database failure
   */
  async updateEmail(userId: string, email: string): Promise<void> {
    try {
      await this.adapter.runAsync(
        'UPDATE users SET email = ? WHERE user_id = ?',
        [email, userId],
      );
    } catch (err) {
      throw translateError(err);
    }
  }
}
