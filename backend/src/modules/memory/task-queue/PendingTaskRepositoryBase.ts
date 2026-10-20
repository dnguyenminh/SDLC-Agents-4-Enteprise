/**
 * PendingTaskRepository — SA4E-44 (base)
 * Shared database access for the pending_tasks table via DatabaseAdapter.
 * SA4E-53: async API for PostgreSQL compatibility.
 */

import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';
import { DialectHelper } from '../../../database/dialect/DialectHelper.js';

/** Base class owning the adapter + dialect helpers shared by all query groups. */
export abstract class PendingTaskRepositoryBase {
  protected readonly dialect: DialectHelper;

  constructor(protected readonly db: DatabaseAdapter) {
    this.dialect = new DialectHelper(db.getEngine());
  }
}
