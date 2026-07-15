# Technical Design Document (TDD)

## KB Evolution Memory — SA4E-36: Temporal Versioning & Outcome Tracking

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-36 |
| Title | KB Evolution Memory — Temporal Versioning & Outcome Tracking |
| Author | SA Agent |
| Version | 1.0 |
| Date | 2025-07-15 |
| Status | Draft |
| Related FSD | FSD-v1-SA4E-36.docx |
| Related BRD | BRD-v1-SA4E-36.docx |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-07-15 | SA Agent | Initial TDD — derived from FSD SA4E-36 |

---

## 1. Architecture Overview

### 1.1 Design Philosophy

The KB Evolution Memory system adds **three layers** on top of the existing FTS5 search pipeline. Each layer is independently deployable and failure-isolated — if any component fails, the system degrades gracefully to FTS-only search.

**Key Design Decisions:**
- **Strategy Pattern** for scoring components — each factor is a pluggable strategy
- **Additive-only schema migration** — no destructive changes to existing data
- **Background jobs modeled after** `promotion/service.ts` pattern (batch + transaction)
- **All new services** injected via constructor (Dependency Inversion)

### 1.2 Layered Architecture

![Architecture Diagram](diagrams/architecture.png)


### 1.3 Integration with Existing System

| Existing Component | Integration Point | Change Type |
|--------------------|-------------------|-------------|
| `engine/core.ts` MemoryEngine.search() | Wrap FTS results with CompositeScorer | Modify (add post-processing) |
| `dispatchers/search.ts` handleSearch() | Pass new params, return score breakdown | Modify (extend output) |
| `dispatchers/dispatcher.ts` | Register new tool handlers (mem_outcome, mem_verify, mem_configure_decay) | Modify (add routes) |
| `models.ts` | Add new interfaces (ScoreBreakdown, OutcomeRecord, DecayConfig) | Extend |
| `schema/tables.ts` | No change — new tables in migration only | Unchanged |
| `MigrationRunner.ts` | Register migration version 3 | Modify (add entry) |
| `promotion/service.ts` | Reference pattern for background jobs | Unchanged |

### 1.4 New Services

| Service | Layer | Responsibility | File |
|---------|-------|----------------|------|
| CompositeScorer | Scoring | Orchestrate scoring strategies at query time | `evolution/CompositeScorer.ts` |
| OutcomeService | Feedback | Record outcomes, compute outcome factors | `evolution/OutcomeService.ts` |
| DecayService | Maintenance | Run confidence decay job, manage config | `evolution/DecayService.ts` |
| StagnationDetector | Maintenance | Analyze search_log for stagnation patterns | `evolution/StagnationDetector.ts` |
| EpochService | Feedback | Trigger epoch boundaries, manage verification flags | `evolution/EpochService.ts` |

---

## 2. API Design

### 2.1 mem_search — Enhanced (Existing Tool)

**Changes:** Add composite scoring pipeline after FTS5 MATCH. Return score breakdown in results.

**New Input Parameters (all optional, backward-compatible):**

| Parameter | Type | Default | Validation |
|-----------|------|---------|------------|
| include_superseded | boolean | false | — |
| halfLifeDays | integer | 30 | 1–365 |
| enable_predictive | boolean | false | — |
| min_confidence | number | 0.0 | 0.0–1.0 |

**Enhanced Output:**

```typescript
interface EnhancedSearchResult {
  entry: KnowledgeEntry;
  score: number;           // composite score (replaces raw FTS rank)
  matchType: 'composite';  // was 'fts'
  breakdown: ScoreBreakdown;
  warnings: string[];      // e.g., ['needs_verification']
}

interface ScoreBreakdown {
  fts_rank: number;
  temporal_weight: number;
  confidence: number;
  outcome_factor: number;
  predictive_score: number;
  is_superseded: boolean;
}
```

**Pipeline Flow:**
1. FTS5 MATCH → raw results with rank
2. Expire filter: `WHERE expires_at IS NULL OR expires_at >= datetime('now')`
3. For each result → CompositeScorer.computeCompositeScore(entry, options)
4. Sort by composite score DESC
5. Return top N with breakdown

**Fallback:** If CompositeScorer throws → catch, log, return FTS-only results with `matchType: 'fts'`

### 2.2 mem_outcome — New MCP Tool

**Purpose:** Report outcome after using a KB entry.

**Input:**
```typescript
interface MemOutcomeInput {
  entry_id: number;        // Required, positive integer
  outcome: 'success' | 'fail' | 'partial';  // Required
  context?: string;        // Max 500 chars
  agent_name?: string;     // Reporting agent
}
```

**Output:**
```typescript
interface MemOutcomeOutput {
  recorded: boolean;
  entry_id: number;
  new_outcome_factor: number;
  total_outcomes: number;
}
```

**Error Codes:** ENTRY_NOT_FOUND, INVALID_OUTCOME, OUTCOME_WRITE_FAILED

**Side Effect:** On success outcome → boost confidence by 10% (cap 1.0)

### 2.3 mem_verify — New MCP Tool

**Purpose:** Verify/reject a KB entry after epoch boundary.

**Input:**
```typescript
interface MemVerifyInput {
  entry_id: number;        // Required
  action?: 'verify' | 'reject';  // Default: 'verify'
  comment?: string;        // Max 500 chars
}
```

**Output:**
```typescript
interface MemVerifyOutput {
  verified: boolean;
  entry_id: number;
  confidence: number;      // 1.0 on verify
  needs_verification: number; // 0 on verify
}
```

**Error Codes:** ENTRY_NOT_FOUND, NOT_FLAGGED

**Behavior:**
- `verify` → needs_verification=0, confidence=1.0, audit log
- `reject` → archived=1, needs_verification=0, audit log

### 2.4 mem_configure_decay — Admin Tool

**Purpose:** Configure decay parameters and trigger admin actions.

**Input:**
```typescript
interface MemConfigureDecayInput {
  action: 'get_config' | 'set_config' | 'run_decay' | 'epoch' | 'stagnation_check';
  halfLifeDays?: number;       // 1–365
  decayRate?: number;          // 0.01–0.50
  confidenceFloor?: number;    // 0.01–0.50
  scope?: string;              // For epoch
  epoch_id?: string;           // Max 100 chars, alphanumeric + hyphens
}
```

**Output:** Varies by action (see FSD §5.4)

**Error Codes:** INVALID_ACTION, INVALID_CONFIG, JOB_IN_PROGRESS

### 2.5 Internal APIs (Background Jobs)

| API | Trigger | Caller |
|-----|---------|--------|
| DecayService.runDecayCycle() | Scheduler (every 24h default) | MemoryModule startup / cron |
| StagnationDetector.analyze() | Scheduler (every 6h default) | MemoryModule startup / cron |
| EpochService.trigger(scope, epochId) | Admin tool / git hook | mem_configure_decay handler |

---

## 3. Class/Module Design

### 3.1 Directory Structure

```
backend/src/modules/memory/
├── evolution/                    # NEW — all evolution memory logic
│   ├── models.ts                # Interfaces: ScoreBreakdown, OutcomeRecord, DecayConfig
│   ├── CompositeScorer.ts       # Scoring orchestrator (Strategy pattern)
│   ├── strategies/              # Individual scoring strategies
│   │   ├── TemporalStrategy.ts
│   │   ├── OutcomeStrategy.ts
│   │   ├── ConfidenceStrategy.ts
│   │   ├── PredictiveStrategy.ts
│   │   └── SupersededStrategy.ts
│   ├── OutcomeService.ts        # Outcome CRUD + factor calculation
│   ├── DecayService.ts          # Confidence decay background job
│   ├── StagnationDetector.ts    # Stagnation pattern analysis
│   ├── EpochService.ts          # Epoch boundary management
│   └── index.ts                 # Barrel export
├── dispatchers/
│   └── evolution.ts             # NEW — handlers for mem_outcome, mem_verify, mem_configure_decay
├── migrations/
│   └── 002-add-evolution-columns.ts  # NEW
└── definitions/
    └── evolution.ts             # NEW — MCP tool definitions
```

### 3.2 CompositeScorer Class

**File:** `evolution/CompositeScorer.ts` (~120 lines)

```typescript
import type Database from 'better-sqlite3';
import type { KnowledgeEntry, SearchResult } from '../models.js';
import type { ScoringStrategy, ScoringContext } from './models.js';

export class CompositeScorer {
  private readonly db: Database.Database;
  private readonly strategies: ScoringStrategy[];

  constructor(db: Database.Database, strategies?: ScoringStrategy[]) {
    this.db = db;
    this.strategies = strategies ?? this.defaultStrategies();
  }

  /**
   * Calculate temporal decay weight.
   * Formula: pinned ? 1.0 : 0.5^(ageDays / halfLifeDays)
   */
  calculateTemporalWeight(entry: KnowledgeEntry, halfLifeDays: number): number {
    if (entry.pinned === 1) return 1.0;
    const ageDays = (Date.now() - Date.parse(entry.updated_at)) / 86_400_000;
    if (ageDays <= 0) return 1.0;
    return Math.pow(0.5, ageDays / halfLifeDays);
  }

  /**
   * Calculate Bayesian outcome factor.
   * Formula: (successes + 1) / (total + 2) — Laplace smoothing
   */
  calculateOutcomeFactor(entryId: number): number {
    // Delegate to OutcomeStrategy for actual DB query
    const strategy = this.strategies.find(s => s.name === 'outcome');
    if (!strategy) return 0.5;
    return strategy.calculate({ entryId } as any);
  }

  /**
   * Compute full composite score for a single entry.
   * composite = fts_rank * temporal * confidence * outcome * predictive * supersede
   */
  computeCompositeScore(
    entry: KnowledgeEntry,
    ftsRank: number,
    options: ScoringContext
  ): { score: number; breakdown: ScoreBreakdown } {
    const breakdown: ScoreBreakdown = {
      fts_rank: -ftsRank, // FTS5 returns negative
      temporal_weight: 1.0,
      confidence: entry.confidence,
      outcome_factor: 0.5,
      predictive_score: 1.0,
      is_superseded: false,
    };

    for (const strategy of this.strategies) {
      try {
        strategy.apply(entry, breakdown, options);
      } catch {
        // Graceful degradation — skip failed strategy
      }
    }

    const supersedeFactor = breakdown.is_superseded ? 0.1 : 1.0;
    const score = breakdown.fts_rank
      * breakdown.temporal_weight
      * breakdown.confidence
      * breakdown.outcome_factor
      * breakdown.predictive_score
      * supersedeFactor;

    return { score: Math.max(score, 0), breakdown };
  }

  private defaultStrategies(): ScoringStrategy[] { /* ... */ }
}
```

### 3.3 Scoring Strategy Interface

**File:** `evolution/models.ts` (~80 lines)

```typescript
export interface ScoringStrategy {
  name: string;
  apply(entry: KnowledgeEntry, breakdown: ScoreBreakdown, ctx: ScoringContext): void;
  calculate?(ctx: any): number;
}

export interface ScoringContext {
  halfLifeDays: number;
  enablePredictive: boolean;
  includeSuperseded: boolean;
  entryId?: number;
}

export interface ScoreBreakdown {
  fts_rank: number;
  temporal_weight: number;
  confidence: number;
  outcome_factor: number;
  predictive_score: number;
  is_superseded: boolean;
}

export interface OutcomeRecord {
  id: number;
  entry_id: number;
  outcome: 'success' | 'fail' | 'partial';
  agent_name: string | null;
  context: string | null;
  created_at: string;
}

export interface DecayConfigRow {
  key: string;
  value: string;
  updated_at: string;
}

export interface StagnationReport {
  stagnant_queries: Array<{ query: string; count: number; first_seen: string }>;
  count: number;
}
```

### 3.4 OutcomeService Class

**File:** `evolution/OutcomeService.ts` (~100 lines)

```typescript
export class OutcomeService {
  private readonly db: Database.Database;

  constructor(db: Database.Database) { this.db = db; }

  /** Record an outcome for an entry. */
  record(entryId: number, outcome: string, agentName?: string, context?: string): {
    recorded: boolean; new_outcome_factor: number; total_outcomes: number;
  } {
    // 1. Validate entry exists
    // 2. Insert into entry_outcomes
    // 3. If outcome === 'success' → boost confidence
    // 4. Return new factor
  }

  /** Get aggregated outcome stats for an entry. */
  getStats(entryId: number): { successes: number; failures: number; total: number } {
    // SELECT outcome, COUNT(*) FROM entry_outcomes WHERE entry_id=? GROUP BY outcome
    // partial counts as 0.5 success
  }

  /** Compute Bayesian outcome factor: (successes + 1) / (total + 2) */
  getFactorForEntry(entryId: number): number {
    const stats = this.getStats(entryId);
    if (stats.total === 0) return 0.5;
    return (stats.successes + 1) / (stats.total + 2);
  }
}
```

### 3.5 DecayService Class

**File:** `evolution/DecayService.ts` (~120 lines)

```typescript
export class DecayService {
  private readonly db: Database.Database;
  private readonly logger: Logger;
  private running = false;

  constructor(db: Database.Database, logger: Logger) {
    this.db = db;
    this.logger = logger.child({ service: 'decay' });
  }

  /** Execute one decay cycle. Processes entries in batches of 100. */
  runDecayCycle(): { decayed_count: number; duration_ms: number; skipped_pinned: number } {
    if (this.running) throw new Error('JOB_IN_PROGRESS');
    this.running = true;
    try {
      const config = this.getConfig();
      const threshold = new Date(Date.now() - config.accessThresholdDays * 86_400_000).toISOString();
      // SELECT WHERE pinned=0 AND confidence > floor AND (last_accessed_at < threshold OR NULL)
      // Batch 100 per transaction
      // confidence = MAX(confidence * (1 - decayRate), confidenceFloor)
    } finally {
      this.running = false;
    }
  }

  /** Read all config from decay_config table. */
  getConfig(): ResolvedDecayConfig { /* ... */ }

  /** Update config values. */
  setConfig(updates: Partial<DecayConfigInput>): void { /* ... */ }
}
```

### 3.6 StagnationDetector Class

**File:** `evolution/StagnationDetector.ts` (~90 lines)

```typescript
export class StagnationDetector {
  private readonly db: Database.Database;

  constructor(db: Database.Database) { this.db = db; }

  /** Analyze search_log for stagnation patterns. */
  analyze(): StagnationReport {
    // Query: failed queries (result_count=0) in last 7 days, grouped, HAVING count >= threshold
    // Normalize: lowercase, trim
    // Filter typos (optional — skip if expensive)
    // Log to memory_audit
  }

  /** Get latest stagnation report from audit log. */
  getReport(): StagnationReport { /* ... */ }
}
```

### 3.7 EpochService Class

**File:** `evolution/EpochService.ts` (~100 lines)

```typescript
export class EpochService {
  private readonly db: Database.Database;

  constructor(db: Database.Database) { this.db = db; }

  /** Trigger epoch boundary — flag affected entries. */
  trigger(scope: string, epochId: string): { epoch_id: string; affected_count: number; entry_ids: number[] } {
    // Match entries by source_ref, tags, or module scope
    // SET needs_verification = 1, epoch_id = ?
    // Log to memory_audit
  }

  /** Verify a single entry (clear needs_verification). */
  verify(entryId: number, comment?: string): boolean {
    // SET needs_verification = 0, confidence = 1.0
  }

  /** Reject entry (archive it). */
  reject(entryId: number, comment?: string): boolean {
    // SET archived = 1, needs_verification = 0
  }

  /** Get epoch status. */
  getStatus(epochId?: string): { pending_count: number; verified_count: number } { /* ... */ }
}
```

### 3.8 Migration: 002-add-evolution-columns.ts

**File:** `migrations/002-add-evolution-columns.ts` (~50 lines)

```typescript
import type Database from 'better-sqlite3';

export function migrate002AddEvolutionColumns(db: Database.Database): void {
  const columns = db.pragma('table_info(knowledge_entries)') as Array<{ name: string }>;
  const hasNeedsVerification = columns.some(c => c.name === 'needs_verification');
  if (hasNeedsVerification) return;

  db.exec(`
    ALTER TABLE knowledge_entries ADD COLUMN needs_verification INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE knowledge_entries ADD COLUMN epoch_id TEXT DEFAULT NULL;
    ALTER TABLE knowledge_entries ADD COLUMN superseded_by INTEGER DEFAULT NULL;
  `);

  // New tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS entry_outcomes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_id INTEGER NOT NULL,
      outcome TEXT NOT NULL CHECK(outcome IN ('success', 'fail', 'partial')),
      agent_name TEXT DEFAULT NULL,
      context TEXT DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (entry_id) REFERENCES knowledge_entries(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS decay_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_entry_outcomes_entry_id ON entry_outcomes(entry_id);
    CREATE INDEX IF NOT EXISTS idx_entry_outcomes_created_at ON entry_outcomes(created_at);
    CREATE INDEX IF NOT EXISTS idx_ke_expires_at ON knowledge_entries(expires_at) WHERE expires_at IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_ke_updated_at ON knowledge_entries(updated_at);
    CREATE INDEX IF NOT EXISTS idx_ke_needs_verification ON knowledge_entries(needs_verification) WHERE needs_verification = 1;
    CREATE INDEX IF NOT EXISTS idx_search_log_failed ON search_log(result_count, created_at) WHERE result_count = 0;
  `);

  // Default config
  const insert = db.prepare('INSERT OR IGNORE INTO decay_config (key, value) VALUES (?, ?)');
  const defaults = [
    ['halfLifeDays', '30'], ['decayRate', '0.05'], ['confidenceFloor', '0.1'],
    ['predictiveEnabled', 'false'], ['stagnationThreshold', '3'],
    ['stagnationWindowDays', '7'], ['decayIntervalHours', '24'], ['accessThresholdDays', '60'],
  ];
  for (const [k, v] of defaults) insert.run(k, v);
}
```

---

## 4. Database Design

### 4.1 Schema Changes to knowledge_entries (Additive Only)

| Column | Type | Default | NULL | Description |
|--------|------|---------|------|-------------|
| needs_verification | INTEGER | 0 | NOT NULL | Flag: 1 = entry needs re-verification after epoch |
| epoch_id | TEXT | NULL | NULL | ID of epoch event that flagged this entry |
| superseded_by | INTEGER | NULL | NULL | FK to entry that supersedes this one (denormalized) |

**Rationale for `superseded_by` denormalization:** Avoids JOIN on `knowledge_graph_edges` during every search query. Updated when SUPERSEDES edge is created.

### 4.2 New Table: entry_outcomes

```sql
CREATE TABLE IF NOT EXISTS entry_outcomes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id INTEGER NOT NULL,
  outcome TEXT NOT NULL CHECK(outcome IN ('success', 'fail', 'partial')),
  agent_name TEXT DEFAULT NULL,
  context TEXT DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (entry_id) REFERENCES knowledge_entries(id) ON DELETE CASCADE
);
```

### 4.3 New Table: decay_config

```sql
CREATE TABLE IF NOT EXISTS decay_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Default Rows:**

| key | value | Description |
|-----|-------|-------------|
| halfLifeDays | 30 | Days for temporal weight to reach 50% |
| decayRate | 0.05 | Confidence reduction per cycle (5%) |
| confidenceFloor | 0.1 | Minimum confidence value |
| predictiveEnabled | false | Enable predictive scoring |
| stagnationThreshold | 3 | Min failed query count for stagnation |
| stagnationWindowDays | 7 | Window for stagnation detection |
| decayIntervalHours | 24 | Decay job frequency |
| accessThresholdDays | 60 | Days without access before decay applies |

### 4.4 SUPERSEDES Edge Type

Uses existing `knowledge_graph_edges` table:
- `source_id` = new entry (superseding)
- `target_id` = old entry (being superseded)
- `relation` = 'SUPERSEDES'
- `weight` = 1.0
- `metadata` = JSON: `{ "epoch_id": "...", "reason": "..." }`

**Constraint:** No cycles. On insert, walk chain from target_id upward to verify source_id is not reachable.

### 4.5 Indexes for Performance

```sql
-- Expire filter (partial index — only non-null expires_at)
CREATE INDEX IF NOT EXISTS idx_ke_expires_at ON knowledge_entries(expires_at)
  WHERE expires_at IS NOT NULL;

-- Temporal weight calculation (sort by updated_at)
CREATE INDEX IF NOT EXISTS idx_ke_updated_at ON knowledge_entries(updated_at);

-- Epoch verification queries
CREATE INDEX IF NOT EXISTS idx_ke_needs_verification ON knowledge_entries(needs_verification)
  WHERE needs_verification = 1;

-- Outcome lookups (per entry)
CREATE INDEX IF NOT EXISTS idx_entry_outcomes_entry_id ON entry_outcomes(entry_id);
CREATE INDEX IF NOT EXISTS idx_entry_outcomes_created_at ON entry_outcomes(created_at);

-- Stagnation detection (failed queries)
CREATE INDEX IF NOT EXISTS idx_search_log_failed ON search_log(result_count, created_at)
  WHERE result_count = 0;
```

### 4.6 Migration Strategy

1. **Version 3** in `MigrationRunner.ts` REGISTERED_MIGRATIONS array
2. All changes are **additive** — no DROP, no ALTER existing columns, no data modification
3. Existing `search_log` and `knowledge_graph_edges` tables remain unchanged
4. Migration is **idempotent** — checks column existence before ALTER
5. Default config rows use INSERT OR IGNORE — safe to re-run

---

## 5. Implementation Checklist

### Phase 1: Foundation (P0 — Days 1–2)

| # | Task | Dependencies | Output |
|---|------|--------------|--------|
| 1.1 | Create `evolution/models.ts` — interfaces + types | None | ScoreBreakdown, ScoringStrategy, etc. |
| 1.2 | Create migration `002-add-evolution-columns.ts` | None | Schema ready |
| 1.3 | Register migration v3 in `MigrationRunner.ts` | 1.2 | Auto-applies on startup |
| 1.4 | Create `evolution/strategies/TemporalStrategy.ts` | 1.1 | Temporal decay calculation |
| 1.5 | Create `evolution/strategies/ConfidenceStrategy.ts` | 1.1 | Pass-through from DB field |
| 1.6 | Create `evolution/strategies/SupersededStrategy.ts` | 1.1, 1.2 | Check superseded_by column |
| 1.7 | Create `evolution/CompositeScorer.ts` | 1.4, 1.5, 1.6 | Scoring orchestrator |
| 1.8 | Modify `engine/core.ts` search() — add expire filter + composite scoring | 1.7 | Enhanced search |
| 1.9 | Modify `dispatchers/search.ts` — pass new params, return breakdown | 1.8 | API contract fulfilled |
| 1.10 | Add tool definition for enhanced mem_search params | 1.9 | MCP schema |

### Phase 2: Feedback (P1 — Days 3–4)

| # | Task | Dependencies | Output |
|---|------|--------------|--------|
| 2.1 | Create `evolution/OutcomeService.ts` | 1.2 | Outcome CRUD |
| 2.2 | Create `evolution/strategies/OutcomeStrategy.ts` | 2.1, 1.1 | Bayesian factor in scoring |
| 2.3 | Update CompositeScorer to include OutcomeStrategy | 2.2 | Full scoring pipeline |
| 2.4 | Create `dispatchers/evolution.ts` — mem_outcome handler | 2.1 | MCP tool handler |
| 2.5 | Create `definitions/evolution.ts` — tool schemas | 2.4 | MCP tool definitions |
| 2.6 | Register evolution dispatcher in main dispatcher | 2.4 | Tool routing |
| 2.7 | Add supersedes_id support to mem_ingest | 1.2 | Version chain on ingest |
| 2.8 | Add circular supersession detection | 2.7 | Cycle prevention |

### Phase 3: Maintenance (P2 — Days 5–6)

| # | Task | Dependencies | Output |
|---|------|--------------|--------|
| 3.1 | Create `evolution/DecayService.ts` | 1.2 | Confidence decay job |
| 3.2 | Create `evolution/StagnationDetector.ts` | 1.2 | Stagnation analysis |
| 3.3 | Create `evolution/EpochService.ts` | 1.2 | Epoch management |
| 3.4 | Add mem_verify handler to evolution dispatcher | 3.3 | MCP tool |
| 3.5 | Add mem_configure_decay handler | 3.1, 3.2, 3.3 | Admin tool |
| 3.6 | Schedule background jobs in MemoryModule startup | 3.1, 3.2 | Auto-run jobs |

### Phase 4: Advanced (P3 — Days 7–8)

| # | Task | Dependencies | Output |
|---|------|--------------|--------|
| 4.1 | Create `evolution/strategies/PredictiveStrategy.ts` | 2.1 | Trend analysis |
| 4.2 | Update CompositeScorer — predictive strategy (opt-in) | 4.1 | Full formula |
| 4.3 | Add enable_predictive param to search | 4.2 | User control |

### Phase 5: Testing & Polish (Days 9–10)

| # | Task | Dependencies | Output |
|---|------|--------------|--------|
| 5.1 | Unit tests for CompositeScorer | 1.7 | Scoring correctness |
| 5.2 | Unit tests for OutcomeService | 2.1 | Outcome CRUD |
| 5.3 | Unit tests for DecayService | 3.1 | Batch processing |
| 5.4 | Integration test: full search pipeline | All Phase 1–2 | End-to-end |
| 5.5 | Integration test: graceful degradation | 1.8 | Fallback behavior |
| 5.6 | Performance test: 10K entries composite search < 5ms overhead | All | NFR validation |

---

## 6. Error Handling

### 6.1 Graceful Degradation Strategy

**Core Principle:** Each scoring component is optional. If ANY fails → use neutral fallback. If ALL fail → return FTS-only results.

| Component | Fallback Value | Log Level | User Impact |
|-----------|---------------|-----------|-------------|
| Temporal decay | weight = 1.0 | WARN | No decay applied |
| Outcome factor | factor = 0.5 | WARN | Neutral outcome |
| Confidence | Use DB value as-is | — | No change |
| Predictive score | score = 1.0 | WARN | No prediction |
| Superseded check | No penalty | WARN | Superseded entries ranked normally |
| Expire filter | Include all | ERROR (critical) | Expired may show |
| ALL scoring fails | FTS-only results, matchType='fts' | ERROR | Full fallback |

### 6.2 Error Handling Per Component

**CompositeScorer:**
```typescript
try {
  strategy.apply(entry, breakdown, options);
} catch (err) {
  logger.warn({ strategy: strategy.name, entryId: entry.id, err }, 'Strategy failed, using fallback');
  // breakdown field remains at neutral default
}
```

**DecayService (background job):**
- Batch processing: 100 entries per transaction
- On batch failure: commit previous batches, skip failed batch, log, continue
- On DB locked: retry 3x with 100ms backoff
- On timeout (>5s): commit progress, log partial completion, resume next cycle

**OutcomeService:**
- Non-blocking: if DB write fails → return error response but don't crash
- Validation first: check entry exists before insert

**StagnationDetector:**
- Timeout: 30s max → abort, retry next cycle
- Empty search_log: return empty report (not an error)

### 6.3 Transaction Safety

| Operation | Transaction Scope | On Failure |
|-----------|-------------------|------------|
| Record outcome | Single INSERT + UPDATE confidence | Rollback both |
| Decay cycle batch | 100 UPDATE statements | Rollback batch only |
| Epoch trigger | Multiple UPDATEs + audit INSERT | Rollback all |
| Supersession insert | INSERT edge + UPDATE superseded_by + cycle check | Rollback all |

---

## 7. Security Design

### 7.1 Authentication & Authorization

| Tool | Required Role | Validation |
|------|---------------|------------|
| mem_search (enhanced) | AI Agent (authenticated) | Existing auth flow unchanged |
| mem_outcome | AI Agent (authenticated) | entry_id must be accessible to agent's scope |
| mem_verify | AI Agent (authenticated) | Only flagged entries can be verified |
| mem_configure_decay | Admin | Restrict to admin role check |

**No breaking changes to existing auth flow.** New tools use the same `ScopeContext` mechanism.

### 7.2 Input Validation

| Input | Validation Rule | Rejection |
|-------|-----------------|-----------|
| entry_id | Positive integer, exists in DB | ENTRY_NOT_FOUND |
| outcome | Enum: 'success', 'fail', 'partial' | INVALID_OUTCOME |
| halfLifeDays | Integer, 1–365 | INVALID_CONFIG |
| decayRate | Number, 0.01–0.50 | INVALID_CONFIG |
| confidenceFloor | Number, 0.01–0.50 | INVALID_CONFIG |
| epoch_id | String, max 100 chars, /^[a-zA-Z0-9-]+$/ | INVALID_CONFIG |
| context | String, max 500 chars | Truncate silently |
| action (configure) | Enum: known actions | INVALID_ACTION |

### 7.3 Rate Limiting

| Tool | Limit | Window | Enforcement |
|------|-------|--------|-------------|
| mem_outcome | 100 calls | per minute per agent | In-memory counter |
| mem_configure_decay | 10 calls | per minute | In-memory counter |
| mem_verify | 50 calls | per minute | In-memory counter |

**Implementation:** Simple sliding window counter in dispatcher layer. On breach → return 429-equivalent error with retry-after hint.

### 7.4 Data Safety

- **No destructive migrations** — additive schema changes only
- **Outcome spam protection** — rate limiting prevents abuse
- **Circular supersession prevention** — chain walk before insert
- **Confidence floor** — decay never reduces below 0.1
- **Concurrent job protection** — `running` flag prevents parallel decay cycles

---

## 8. Component Diagram

![Component Diagram](diagrams/component.png)

---

## 9. Appendix

### 9.1 Composite Score Formula (Reference)

```
composite_score = normalize(fts_rank)
                × temporal_weight
                × confidence
                × outcome_factor
                × predictive_score
                × supersede_factor

Where:
  normalize(fts_rank) = -fts_rank  (FTS5 returns negative; negate for positive)
  temporal_weight = pinned ? 1.0 : 0.5^(ageDays / halfLifeDays)
  ageDays = (Date.now() - Date.parse(entry.updated_at)) / 86_400_000
  confidence = entry.confidence (DB field, 0.1–1.0)
  outcome_factor = (successes + 1) / (total + 2)  [Laplace smoothing]
    partial counts as 0.5 success
  predictive_score = trend multiplier (0.5–1.5), default 1.0 if disabled
  supersede_factor = entry.superseded_by ? 0.1 : 1.0
```

### 9.2 Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Architecture | [architecture.png](diagrams/architecture.png) | [architecture.drawio](diagrams/architecture.drawio) |
| 2 | Component | [component.png](diagrams/component.png) | [component.drawio](diagrams/component.drawio) |

### 9.3 Related Documents

| Document | Location |
|----------|----------|
| BRD | BRD-v1-SA4E-36.docx |
| FSD | FSD-v1-SA4E-36.docx |
| Current Schema | backend/src/modules/memory/schema/tables.ts |
| Current Engine | backend/src/modules/memory/engine/core.ts |
| Promotion Service (pattern ref) | backend/src/modules/memory/promotion/service.ts |
| MigrationRunner | backend/src/modules/memory/MigrationRunner.ts |
