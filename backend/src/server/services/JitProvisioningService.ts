import { randomUUID } from 'crypto';
import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import { recordAudit } from '../../admin/db/audit.js';
import type { NormalizedProfile } from '../auth/models/NormalizedProfile.js';
import pino from 'pino';

const logger = pino({ name: 'jit-provisioning' });

export type { NormalizedProfile };

export interface EntraClaims {
  provider?: string;
  email?: string;
  email_verified?: boolean;
  emailVerified?: boolean;
  oid?: string;
  sub?: string;
  externalSubjectId?: string;
  name?: string;
  groups?: string[];
}

export interface JitProvisionResult {
  user: any;
  created: boolean;
  linked: boolean;
}

export class JitProvisioningService {
  private readonly defaultGroup = 'grp-viewer';
  private readonly groupMapping: Record<string, string>;

  constructor(private readonly db: DatabaseAdapter) {
    this.groupMapping = this.loadGroupMapping();
  }

  private loadGroupMapping(): Record<string, string> {
    const raw = process.env.ENTRA_GROUP_MAPPING;
    if (!raw) return { Admin: 'grp-admin', Dev: 'grp-dev' };
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed as Record<string, string>;
    } catch (e) {
      logger.warn({ e, raw }, 'Failed to parse ENTRA_GROUP_MAPPING, using empty mapping');
    }
    return {};
  }

  async provision(claims: NormalizedProfile | EntraClaims, defaultGroup?: string): Promise<JitProvisionResult> {
    const provider = (('provider' in claims && claims.provider) ? claims.provider : 'entra').toLowerCase();
    const providerName = provider === 'entra' ? 'Entra ID' : provider;
    const email = (claims.email || '').trim().toLowerCase();
    const emailVerified = ('emailVerified' in claims && claims.emailVerified !== undefined)
      ? Boolean(claims.emailVerified)
      : Boolean((claims as any).email_verified);
    const oid = (('externalSubjectId' in claims && claims.externalSubjectId)
      ? claims.externalSubjectId
      : ((claims as any).oid || (claims as any).sub || '')).trim();
    const name = (claims.name || '').trim();
    const groups = Array.isArray(claims.groups) ? claims.groups : [];

    if (!email || !oid) {
      await this.auditReject(null, 'SSO_PROVISION_REJECTED_MISSING_CLAIMS', { email, oid, provider });
      throw new Error(`Missing required ${providerName} claims: email and oid/sub`);
    }

    const accessGroup = provider === 'entra'
      ? this.mapGroup(groups, defaultGroup || this.defaultGroup)
      : (defaultGroup || this.defaultGroup);

    // 1. Existing external identity
    let user = await this.db.getAsync<any>(
      'SELECT * FROM users WHERE external_provider = ? AND external_subject_id = ?',
      [provider, oid]
    );

    if (user) {
      await this.updateLastLogin(user.user_id, accessGroup);
      return { user, created: false, linked: false };
    }

    // 2. Email match
    user = await this.db.getAsync<any>('SELECT * FROM users WHERE LOWER(email) = ?', [email]);

    if (user) {
      if (!emailVerified) {
        await this.auditReject(user.user_id, 'SSO_LINK_REJECTED_EMAIL_NOT_VERIFIED', {
          email, oid, provider, existingAccountType: user.account_type,
        });
        throw new Error(`Email not verified by ${providerName}; linking rejected`);
      }

      if (user.account_type && !['LOCAL', 'SSO'].includes(user.account_type)) {
        await this.auditReject(user.user_id, 'SSO_LINK_REJECTED_HYBRID_ACCOUNT', { account_type: user.account_type });
        throw new Error(`Invalid account_type ${user.account_type} - HYBRID not allowed`);
      }

      const isAlreadyLinked = Boolean(user.external_provider && user.external_subject_id);
      if (isAlreadyLinked) {
        await this.auditReject(user.user_id, 'SSO_LINK_REJECTED_DUPLICATE_EMAIL', {
          email, existingProvider: user.external_provider, existingSubject: user.external_subject_id, incomingOid: oid, incomingProvider: provider,
        });
        throw new Error('Email already linked to another SSO identity');
      }

      // SEC-01: Prevent account takeover. Never auto-link an SSO identity onto an
      // existing LOCAL (password) account — a fresh SSO login must not silently
      // seize a local account by email match. Linking a local account to SSO is
      // only permitted explicitly from account settings, not via JIT.
      if (user.account_type === 'LOCAL') {
        await this.auditReject(user.user_id, 'SSO_LINK_REJECTED_LOCAL_NO_AUTOLINK', { email, provider });
        throw new Error('Auto-linking SSO to an existing local account is not allowed; link from account settings.');
      }

      await this.db.runAsync(
        `UPDATE users SET external_provider = ?, external_subject_id = ?, access_group_id = ?, last_login = ?, account_type = ? WHERE user_id = ?`,
        [provider, oid, accessGroup, new Date().toISOString(), 'SSO', user.user_id]
      );

      user = await this.db.getAsync<any>('SELECT * FROM users WHERE user_id = ?', [user.user_id]);
      await this.auditLink(user.user_id, email, oid, provider);
      return { user, created: false, linked: true };
    }

    // 3. JIT create new SSO user
    if (!emailVerified) {
      await this.auditReject(null, 'SSO_JIT_REJECTED_EMAIL_NOT_VERIFIED', { email, oid, provider });
      throw new Error(`Email not verified by ${providerName}; JIT provisioning rejected`);
    }

    const userId = 'user-' + randomUUID().slice(0, 8);
    const username = this.generateUsername(email, name);
    const now = new Date().toISOString();

    await this.db.runAsync(
      `INSERT INTO users (
        user_id, username, email, password_hash, status, access_group_id,
        force_password_change, created_at, last_login, account_type,
        external_provider, external_subject_id
      ) VALUES (?, ?, ?, ?, 'ACTIVE', ?, 0, ?, ?, 'SSO', ?, ?)`,
      [userId, username, email, null, accessGroup, now, now, provider, oid]
    );

    user = await this.db.getAsync<any>('SELECT * FROM users WHERE user_id = ?', [userId]);
    await this.auditProvision(user.user_id, email, oid, provider);
    return { user, created: true, linked: false };
  }

  private mapGroup(groups: string[], fallback: string): string {
    if (!groups.length) return fallback;
    for (const g of groups) {
      for (const [key, internalId] of Object.entries(this.groupMapping)) {
        if (g.includes(key)) return internalId;
      }
    }
    return fallback;
  }

  private generateUsername(email: string, name: string): string {
    const base = email.split('@')[0] || name.split(' ')[0] || 'user';
    return base.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  private async updateLastLogin(userId: string, accessGroup: string) {
    await this.db.runAsync(
      `UPDATE users SET access_group_id = ?, last_login = ? WHERE user_id = ?`,
      [accessGroup, new Date().toISOString(), userId]
    );
  }

  private async auditProvision(userId: string, email: string, oid: string, provider: string) {
    try {
      await recordAudit(userId, email, 'SSO_JIT_PROVISION', 'users', userId, JSON.stringify({ email, oid, provider, account_type: 'SSO' }));
    } catch (e) {
      logger.warn({ e, userId }, 'auditProvision failed');
    }
  }

  private async auditLink(userId: string, email: string, oid: string, provider: string) {
    try {
      await recordAudit(userId, email, 'SSO_LINKED', 'users', userId, JSON.stringify({ email, oid, provider, action: 'link_local_to_sso' }));
    } catch (e) {
      logger.warn({ e, userId }, 'auditLink failed');
    }
  }

  private async auditReject(userId: string | null, action: string, details: any) {
    try {
      await recordAudit(userId || 'system', 'system', action, 'users', '', JSON.stringify(details));
    } catch (e) {
      logger.warn({ e, action }, 'auditReject failed');
    }
  }
}
