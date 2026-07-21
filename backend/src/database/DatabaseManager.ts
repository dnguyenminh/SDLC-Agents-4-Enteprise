/**
 * SA4E-50 — DatabaseManager: single entry point for all repository access.
 * Lazy-instantiates repositories on first access (Facade pattern).
 * Injected into AdminContext as ctx.db.
 * Implements: UC-01, BR-10, BR-11
 */

import type { DatabaseAdapter } from './adapters/DatabaseAdapter.js';
import type {
  IGraphRepository,
  IUserRepository,
  ISymbolRepository,
  IAuditRepository,
  IKbRepository,
} from './repositories/interfaces.js';
import { GraphRepository } from './repositories/GraphRepository.js';
import { UserRepository } from './repositories/UserRepository.js';
import { SymbolRepository } from './repositories/SymbolRepository.js';
import { AuditRepository } from './repositories/AuditRepository.js';
import { KbRepository } from './repositories/KbRepository.js';

/**
 * Facade providing typed repository access via lazy getters.
 * Repositories are created on first access and cached for the server lifetime.
 */
export class DatabaseManager {
  private _graph?: GraphRepository;
  private _user?: UserRepository;
  private _symbol?: SymbolRepository;
  private _audit?: AuditRepository;
  private _kb?: KbRepository;

  constructor(
    private readonly adminAdapter: DatabaseAdapter,
    private readonly indexAdapter: DatabaseAdapter,
  ) {}

  /** Graph node/edge operations (admin.db). */
  get graph(): IGraphRepository {
    if (!this._graph) {
      this._graph = new GraphRepository(this.adminAdapter);
    }
    return this._graph;
  }

  /** User count and profile operations (admin.db). */
  get user(): IUserRepository {
    if (!this._user) {
      this._user = new UserRepository(this.adminAdapter);
    }
    return this._user;
  }

  /** Code symbol count queries (index.db). */
  get symbol(): ISymbolRepository {
    if (!this._symbol) {
      this._symbol = new SymbolRepository(this.indexAdapter);
    }
    return this._symbol;
  }

  /** Audit log recording and retrieval (admin.db). */
  get audit(): IAuditRepository {
    if (!this._audit) {
      this._audit = new AuditRepository(this.adminAdapter);
    }
    return this._audit;
  }

  /** Knowledge base entry queries (index.db / admin.db unified). */
  get kb(): IKbRepository {
    if (!this._kb) {
      this._kb = new KbRepository(this.adminAdapter);
    }
    return this._kb;
  }

  /**
   * Factory using existing global adapter singletons from admin/db/core.
   * SA4E-49: Both adapters may point to the same unified DB file.
   * @param adminAdapter - Pre-resolved admin adapter (from getAdminAdapter())
   * @param indexAdapter - Pre-resolved index adapter (from getIndexAdapter())
   * @returns A DatabaseManager wired to the provided adapters
   */
  static createDefault(
    adminAdapter: DatabaseAdapter,
    indexAdapter: DatabaseAdapter,
  ): DatabaseManager {
    return new DatabaseManager(adminAdapter, indexAdapter);
  }
}
