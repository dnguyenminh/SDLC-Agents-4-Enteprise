/**
 * SA4E-50 — UserRepository: encapsulates users table queries.
 * Eliminates raw SQL from sse.ts, analytics.ts, rbac.ts, users.ts.
 * Implements: UC-02
 */

import type { DatabaseAdapter } from '../adapters/DatabaseAdapter.js';
import type { IAuthUserRepository } from './interfaces.js';
import { translateError } from '../errors/index.js';
import { verifyPassword } from '../../admin/db/password.js';
import * as crypto from 'crypto';

/**
 * Repository for user-related database operations.
 * All queries use parameterized values to prevent SQL injection.
 */
export class UserRepository implements IAuthUserRepository {
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

  async findByEmail(email: string): Promise<any | null> {
    try {
      const row = await this.adapter.getAsync<any>(
        'SELECT * FROM users WHERE email = ?', [email],
      );
      return row || null;
    } catch (err) {
      throw translateError(err);
    }
  }

  async findByUsername(username: string): Promise<any | null> {
    try {
      const row = await this.adapter.getAsync<any>(
        'SELECT * FROM users WHERE username = ?', [username],
      );
      return row || null;
    } catch (err) {
      throw translateError(err);
    }
  }

  async findById(userId: string): Promise<any | null> {
    try {
      const row = await this.adapter.getAsync<any>(
        'SELECT * FROM users WHERE user_id = ?', [userId],
      );
      return row || null;
    } catch (err) {
      throw translateError(err);
    }
  }

  async createUser(params: { email: string; username?: string; passwordHash: string; accountType?: string }): Promise<any> {
    try {
      const userId = 'user-' + crypto.randomUUID().slice(0, 8);
      const now = new Date().toISOString();
      const username = params.username || params.email.split('@')[0];
      const accountType = params.accountType || 'LOCAL';
      await this.adapter.runAsync(
        `INSERT INTO users (user_id, username, email, password_hash, status, access_group_id, force_password_change, created_at, account_type)
         VALUES (?, ?, ?, ?, 'ACTIVE', ?, 1, ?, ?)`,
        [userId, username, params.email, params.passwordHash, 'grp-dev', now, accountType],
      );
      const row = await this.adapter.getAsync<any>('SELECT * FROM users WHERE user_id = ?', [userId]);
      return row;
    } catch (err) {
      throw translateError(err);
    }
  }

  async verifyCredentials(identifier: string, password: string): Promise<any | null> {
    try {
      const byEmail = await this.findByEmail(identifier);
      const user = byEmail || await this.findByUsername(identifier);
      if (!user) return null;
      if (user.status !== 'ACTIVE') return null;
      if (!user.password_hash) return null;
      const ok = verifyPassword(password, user.password_hash as string);
      return ok ? user : null;
    } catch (err) {
      throw translateError(err);
    }
  }
}
