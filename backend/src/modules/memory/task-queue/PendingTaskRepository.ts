/**
 * PendingTaskRepository — SA4E-44 (facade)
 * CRUD operations for the pending_tasks table via DatabaseAdapter.
 * SA4E-53: converted to async API for PostgreSQL compatibility.
 *
 * Implementation submodules (same directory):
 * - PendingTaskRepositoryBase.ts   — shared adapter + dialect access
 * - PendingTaskRepositoryWrites.ts — create/claim/lifecycle/retry/purge
 * - PendingTaskRepositoryReads.ts  — stats, listings, lookups
 */

import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';
import { PendingTaskRepositoryReads } from './PendingTaskRepositoryReads.js';

/**
 * Facade preserving the original single-class public API.
 * Inherits all write (create/claim/retry/purge) and read (stats/list) methods.
 */
export class PendingTaskRepository extends PendingTaskRepositoryReads {
  constructor(db: DatabaseAdapter) { super(db); }
}
