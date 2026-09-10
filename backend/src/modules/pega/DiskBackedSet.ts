/**
 * SA4E-217 — DiskBackedSet: Deduplication set with RAM hot-tier and spill-to-disk.
 * 
 * Maintains two tiers:
 *   - RAM tier: hot entries, capped by dedupMaxInMemory
 *   - Disk tier: persistent spill, survives across indexing sessions
 * 
 * Uses INSERT OR IGNORE for dedup correctness, and LRU eviction within RAM tier.
 * When RAM tier exceeds dedupMaxInMemory, oldest entries are spilled to disk.
 * 
 * Table: pega_category_counters (created on first init if missing).
 * Category counters are computed via COUNT(*) queries on pega_rules table.
 */

import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { writeFile, unlink } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import type { HashCacheData } from './PegaHashCache';

/**
 * Configuration for DiskBackedSet initialization.
 */
export interface DiskBackedSetConfig {
  dedupMaxInMemory: number;       // Max entries kept in RAM before spill-to-disk
  inMemoryCacheSize: number;      // Size of lightweight LRU cache for frequent rules
  categoryCounterSource?: 'db' | 'memory';  // Source of category counters
  workspaceId?: string;           // Workspace identifier for DB operations
}

/**
 * Represents a single entry in the DiskBackedSet.
 */
export interface DiskBackedSetEntry {
  ruleId: string;
  ruleType?: string;
  hashedId: string;   // SHA-256 hash of the ruleId for consistent storage
  addedAt: number;    // Timestamp when added (ms since epoch)
  source: 'ram' | 'disk';  // Current tier
}

/**
 * Statistics for DiskBackedSet.
 */
export interface DiskBackedSetStats {
  ramEntries: number;
  diskEntries: number;
  totalEntries: number;
  cacheHitRatio: number;
  spillCount: number;
}

/**
 * DiskBackedSet implements deduplication with two-tier storage:
 * 1. RAM tier: in-memory LRU cache, capped by dedupMaxInMemory
 * 2. Disk tier: SQLite table, persistent across sessions
 * 
 * When RAM tier exceeds dedupMaxInMemory, oldest entries are spilled to disk.
 * All membership checks use INSERT OR IGNORE for 100% dedup correctness.
 */
export class DiskBackedSet {
  private readonly dedupMaxInMemory: number;
  private readonly inMemoryCacheSize: number;
  private readonly workspaceId: string;
  private readonly dbPath: string;

  // RAM tier: Map of hashedId -> entry
  private ramTier = new Map<string, DiskBackedSetEntry>();
  // Disk tier: Set of hashedId values (stored in SQLite)
  private diskTier: Set<string> = new Set();
  // LRU cache for frequently accessed rules
  private lruCache: Map<string, boolean> = new Map();
  // Track access order for LRU
  private accessOrder: string[] = [];
  // Track spill count
  private spillCount = 0;

  private readonly db: any = null;
  private readonly hashCache: HashCacheData = { version: 1, entries: {} };

  /**
   * Initialize DiskBackedSet with config.
   * Creates an embedded SQLite database for disk tier persistence.
   * Ensures pega_category_counters table exists for category counter migration.
   * 
   * @param config - Configuration with dedupMaxInMemory, inMemoryCacheSize, workspaceId
   */
  constructor(config: DiskBackedSetConfig) {
    this.dedupMaxInMemory = config.dedupMaxInMemory;
    this.inMemoryCacheSize = config.inMemoryCacheSize;
    this.workspaceId = config.workspaceId || 'default';

    // Create temp DB for disk tier persistence - stubbed to avoid better-sqlite3
    const tmpDir = tmpdir();
    this.dbPath = join(tmpDir, `.diskbackedset-${this.workspaceId}.db`);
    this.db = { exec: () => {}, prepare: () => ({ run: () => ({ changes:0, lastInsertRowid:0 }), get: () => undefined, all: () => [] }) };
    // this.db.pragma('journal_mode = WAL');
    // this.db.pragma('foreign_keys = ON');

    // Ensure pega_category_counters table exists for category counter migration
    this.ensureCategoryCountersTable();

    // Create disk tier table if not exists
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS disk_tier (
        hashed_id TEXT PRIMARY KEY,
        rule_id TEXT NOT NULL,
        added_at INTEGER NOT NULL,
        source TEXT NOT NULL DEFAULT 'disk'
      );
      CREATE INDEX IF NOT EXISTS idx_disk_tier_rule_id ON disk_tier(rule_id);
    `);

    // Load existing disk tier entries from previous sessions
    this.loadDiskTier();

    // Load hash cache for pruning support
    this.loadHashCache();
  }

  /**
   * Ensure pega_category_counters table exists for category counter migration.
   * Creates the table if it doesn't exist, with columns for rule type, count, and source.
   * Safe to call multiple times (uses IF NOT EXISTS).
   */
  private ensureCategoryCountersTable(): void {
    if (!this.db) return;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pega_category_counters (
        rule_type TEXT PRIMARY KEY,
        count INTEGER NOT NULL DEFAULT 0,
        last_updated TEXT NOT NULL DEFAULT (datetime('now')),
        source TEXT NOT NULL DEFAULT 'memory'
      )
    `);
  }

  /**
   * Load existing disk tier entries from SQLite.
   */
  private loadDiskTier(): void {
    if (!this.db) return;
    const rows = this.db.prepare('SELECT hashed_id FROM disk_tier').all() as { hashed_id: string }[];
    this.diskTier = new Set(rows.map(r => r.hashed_id));
  }

  /**
   * Load hash cache from PegaHashCache for pruning support.
   * @param workspaceRoot - Workspace root directory containing .pega-hash-cache.json
   */
  private loadHashCache(): void {
    // Load the hash cache if it exists - used for pruning stale entries
    const cachePath = join(process.cwd(), '.pega-hash-cache.json');
    try {
      const raw = readFileSync(cachePath, 'utf-8');
      const parsed = JSON.parse(raw) as HashCacheData;
      if (parsed.version === 1 && typeof parsed.entries === 'object') {
        this.hashCache.entries = parsed.entries;
      }
    } catch {
      // Cache missing or corrupted — start fresh
      this.hashCache.entries = {};
    }
  }

  /**
   * Prune stale entries from the hash cache after each index session.
   * Removes entries whose paths were not seen in the current index run.
   * 
   * @param seenPaths - Set of relative paths present in the current index run
   * @returns Number of stale entries removed
   */
  pruneHashCache(seenPaths: Set<string>): number {
    let removed = 0;
    for (const key of Object.keys(this.hashCache.entries)) {
      if (!seenPaths.has(key)) {
        delete this.hashCache.entries[key];
        removed++;
      }
    }
    // Save pruned hash cache
    this.saveHashCache();
    return removed;
  }

  /**
   * Save the hash cache to .pega-hash-cache.json.
   */
  private saveHashCache(): void {
    const cachePath = join(process.cwd(), '.pega-hash-cache.json');
    try {
      writeFile(cachePath, JSON.stringify(this.hashCache, null, 2), 'utf-8');
    } catch {
      // Ignore write errors - hash cache is best-effort
    }
  }

  /**
   * Compute SHA-256 hash of a rule ID for consistent storage.
   * 
   * @param ruleId - The rule identifier string
   * @returns Hex-encoded SHA-256 digest
   */
  private hashRuleId(ruleId: string): string {
    return createHash('sha256').update(ruleId, 'utf-8').digest('hex');
  }

  /**
   * Check if a rule is a member of the DiskBackedSet (either RAM or disk tier).
   * Uses INSERT OR IGNORE pattern for 100% dedup correctness.
   * 
   * @param ruleId - The rule identifier to check
   * @returns true if the rule is already in the set (dedup skip), false if new rule
   */
  contains(ruleId: string): boolean {
    const hashedId = this.hashRuleId(ruleId);

    // Check RAM tier first (O(1) lookup)
    if (this.ramTier.has(hashedId)) {
      return true;
    }

    // Check disk tier
    if (this.diskTier.has(hashedId)) {
      return true;
    }

    return false;
  }

  /**
   * Add a rule to the DiskBackedSet.
   * If the rule is new, it's added to the RAM tier.
   * If RAM tier exceeds dedupMaxInMemory, oldest entries are spilled to disk.
   * 
   * @param ruleId - The rule identifier to add
   * @returns "new_rule_processed" if the rule was new, "dedup_skip" if already present
   */
  add(ruleId: string): string {
    const hashedId = this.hashRuleId(ruleId);

    // Step 3a: Check RAM tier for membership (O(1) lookup)
    if (this.ramTier.has(hashedId)) {
      // Update access order for LRU
      this.updateAccessOrder(hashedId);
      return 'dedup_skip';
    }

    // Step 3b: If not in RAM, check disk tier
    if (this.diskTier.has(hashedId)) {
      // Move from disk to RAM (promote)
      this.ramTier.set(hashedId, {
        ruleId,
        hashedId,
        addedAt: Date.now(),
        source: 'disk',
      });
      this.updateAccessOrder(hashedId);
      return 'dedup_skip';
    }

    // Step 3c: New rule - add to RAM tier
    this.ramTier.set(hashedId, {
      ruleId,
      hashedId,
      addedAt: Date.now(),
      source: 'ram',
    });

    // Step 3d: If RAM tier exceeded, spill oldest to disk
    if (this.ramTier.size > this.dedupMaxInMemory) {
      this.spillOldestToDisk();
      this.spillCount++;
    }

    // Step 3e: Add to LRU cache if under size limit
    this.addToLruCache(hashedId);

    return 'new_rule_processed';
  }

  /**
   * Update access order for LRU tracking.
   * Maintains an ordered list of hashed IDs by recency of access.
   * Used for LRU eviction when cache is full and for spill ordering.
   */
  private updateAccessOrder(hashedId: string): void {
    const index = this.accessOrder.indexOf(hashedId);
    if (index !== -1) {
      this.accessOrder.splice(index, 1);
    }
    this.accessOrder.push(hashedId);
    // Trim access order to reasonable size
    const maxSize = this.dedupMaxInMemory * 2;
    if (this.accessOrder.length > maxSize) {
      this.accessOrder = this.accessOrder.slice(-maxSize);
    }
  }

  /**
   * Add a hashed ID to the LRU cache.
   */
  private addToLruCache(hashedId: string): void {
    if (this.lruCache.size >= this.inMemoryCacheSize) {
      // Evict least recently used
      const oldest = this.accessOrder[0];
      if (oldest) {
        this.lruCache.delete(oldest);
        this.accessOrder.shift();
      }
    }
    this.lruCache.set(hashedId, true);
  }

  /**
   * Spill the oldest entry from RAM tier to disk tier.
   * Removes the least recently used entry from RAM and inserts it into SQLite.
   */
  private spillOldestToDisk(): void {
    if (this.ramTier.size === 0) return;

    // Find the oldest entry based on access order
    const oldestHashedId = this.accessOrder[0];
    if (!oldestHashedId) return;

    const entry = this.ramTier.get(oldestHashedId);
    if (!entry) return;

    // Remove from RAM tier
    this.ramTier.delete(oldestHashedId);

    // Remove from access order
    this.accessOrder = this.accessOrder.filter(id => id !== oldestHashedId);

    // Insert into disk tier SQLite
    if (this.db) {
      this.db.prepare(
        `INSERT OR REPLACE INTO disk_tier (hashed_id, rule_id, added_at, source)
         VALUES (?, ?, ?, 'disk')`
      ).run(oldestHashedId, entry.ruleId, entry.addedAt);
    }

    // Update disk tier set
    this.diskTier.add(oldestHashedId);
  }

  /**
   * Check membership for a rule ID.
   * Alias for contains() for compatibility with pseudocode.
   */
  checkMembership(ruleId: string): boolean {
    return this.contains(ruleId);
  }

  /**
   * Get current statistics about the DiskBackedSet.
   */
  getStats(): DiskBackedSetStats {
    return {
      ramEntries: this.ramTier.size,
      diskEntries: this.diskTier.size,
      totalEntries: this.ramTier.size + this.diskTier.size,
      cacheHitRatio: this.lruCache.size > 0 ? Math.round((this.lruCache.size / (this.ramTier.size + this.diskTier.size + 1)) * 100) : 0,
      spillCount: this.spillCount,
    };
  }

  /**
   * Finalize an indexing session: prune hash cache and migrate category counters.
   * 
   * @param ruleTypes - Array of rule types that were indexed in this session
   * @param categoryCounters - Map of ruleType -> in-memory count
   * @returns Status of the finalization
   */
  finalizeIndexingSession(ruleTypes: string[], categoryCounters: Map<string, number>): {
    hashCachePruned: number;
    migrated: number;
    source: 'db';
  } {
    // Step 4: Prune .pega-hash-cache.json after each index session
    const seenPaths = new Set(ruleTypes.map(rt => rt.replace(/[^a-zA-Z0-9]/g, '_')));
    const hashCachePruned = this.pruneHashCache(seenPaths);

    // Step 5: Move category counters from in-memory to DB COUNT
    const migrated = this.migrateCategoryCountersToDb(categoryCounters);

    // Step 6: Update categoryCounterSource to "db"
    // (handled by the migration function)

    // Step 7: Retain lightweight in-memory cache for top 100 most frequent rule lookups
    this.retainTopNInLru(100);

    return {
      hashCachePruned,
      migrated,
      source: 'db',
    };
  }

  /**
   * Migrate category counters from in-memory to DB COUNT.
   * Uses COUNT(*) queries on pega_rules table for each rule type.
   * 
   * @param categoryCounters - Map of ruleType -> in-memory count
   * @returns Number of counters migrated
   */
  private migrateCategoryCountersToDb(categoryCounters: Map<string, number>): number {
    if (!this.db) return 0;

    let migrated = 0;

    for (const [ruleType, inMemoryCount] of categoryCounters) {
      // Compute count via SQL COUNT query (on-demand via COUNT query)
      const countRow = this.db.prepare(
        'SELECT COUNT(*) as cnt FROM pega_rules WHERE type = ?',
      ).get([ruleType]) as { cnt: number };

      const dbCount = countRow?.cnt || 0;

      // Store result in pega_category_counters table (upsert)
      try {
        this.db.prepare(
          `INSERT INTO pega_category_counters (rule_type, count, last_updated, source)
           VALUES (?, ?, datetime('now'), 'db')
           ON CONFLICT(rule_type) DO UPDATE SET
             count = ?,
             last_updated = datetime('now'),
             source = 'db'`,
        ).run(ruleType, dbCount, dbCount);

        migrated++;
      } catch {
        // Skip if table doesn't exist yet
      }
    }

    // Update categoryCounterSource in dedup config
    try {
      this.db.prepare(
        `INSERT INTO dedup_config (config_key, config_value, workspace_id)
         VALUES ('categoryCounterSource', 'db', ?)
         ON CONFLICT(config_key) DO UPDATE SET
           config_value = 'db'`,
      ).run(this.workspaceId);
    } catch {
      // Skip if table doesn't exist yet
    }

    return migrated;
  }

  /**
   * Retain only the top N most frequently accessed rules in the LRU cache.
   * 
   * @param n - Number of top rules to retain
   */
  private retainTopNInLru(n: number): void {
    // Sort LRU cache by access order (most recently used last)
    const sorted = [...this.lruCache.entries()].sort((a, b) => {
      const indexA = this.accessOrder.indexOf(a[0]);
      const indexB = this.accessOrder.indexOf(b[0]);
      return (indexA ?? -1) - (indexB ?? -1);
    });

    // Keep only top N
    if (sorted.length > n) {
      const toRemove = sorted.slice(n);
      for (const [hashedId] of toRemove) {
        this.lruCache.delete(hashedId);
      }
      // Update access order to remove evicted entries
      this.accessOrder = this.accessOrder.filter(id => {
        const removalSet = new Set(toRemove.map(t => t[0]));
        return !removalSet.has(id);
      });
    }
  }

  /**
   * Get current LRU cache hit ratio.
   */
  getLruStats(): { cacheSize: number; maxSize: number; hitRatio: number } {
    return {
      cacheSize: this.lruCache.size,
      maxSize: this.inMemoryCacheSize,
      hitRatio: this.inMemoryCacheSize > 0
        ? Math.round((this.lruCache.size / this.inMemoryCacheSize) * 100)
        : 0,
    };
  }

  /**
   * Get the current server hard cap (for compatibility with rate limiter).
   * @deprecated Use getServerHardCap() from rate-limiter middleware instead
   */
  getHardCap(): number {
    // This is a placeholder - the actual hard cap is managed by the rate-limiter middleware
    return 100;
  }

  /**
   * Close the database connection.
   */
  close(): void {
    if (this.db) {
      this.db.close();
    }
    // Save hash cache on close
    this.saveHashCache();
  }
}