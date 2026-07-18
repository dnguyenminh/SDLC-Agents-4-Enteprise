# Functional Specification Document (FSD)

## KB Evolution Memory — SA4E-36: Temporal Versioning & Outcome Tracking

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-36 |
| Title | KB Evolution Memory — Temporal Versioning & Outcome Tracking |
| Author | BA Agent |
| Version | 1.0 |
| Date | 2026-07-15 |
| Status | Draft |
| Related BRD | documents/SA4E-36/BRD.md |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-15 | BA Agent | Initial FSD — derived from BRD SA4E-36 |

---

## 1. Introduction

### 1.1 Purpose

This FSD specifies the functional behavior of the KB Evolution Memory upgrade —
enhancing Memory Engine search ranking with temporal decay, outcome tracking,
version chains, stagnation detection, confidence decay, epoch boundaries,
and predictive scoring.

### 1.2 Scope

- Module: `backend/src/modules/memory/`
- Target: `engine/core.ts` search() method and new supporting services
- Database: `better-sqlite3` with existing schema extended (additive only)

### 1.3 Definitions & Acronyms

| Term | Definition |
|------|------------|
| Temporal Decay | Exponential weight reduction based on entry age |
| Half-life | Time (days) for weight to reach 50% — default 30 |
| Outcome | Result of using a KB entry: success, fail, partial |
| Supersedes | Relationship where a newer entry replaces an older one |
| Stagnation | Pattern of repeated failed queries indicating knowledge gaps |
| Composite Score | Combined ranking: FTS × temporal × confidence × outcome × predictive |
| Epoch Boundary | Major code change event triggering re-verification |

### 1.4 References

| Document | Location |
|----------|----------|
| BRD | documents/SA4E-36/BRD.md |
| Current Schema | backend/src/modules/memory/schema/tables.ts |
| Current Engine | backend/src/modules/memory/engine/core.ts |
| Models | backend/src/modules/memory/models.ts |

---

## 2. System Overview

### 2.1 System Context Diagram

![System Context](diagrams/system-context.png)

The KB Evolution Memory system operates within the existing Memory Engine module.
External actors:
- **AI Agents** (BA, SA, DEV, QA, DevOps) — invoke mem_search, mem_outcome, mem_verify
- **Background Scheduler** — triggers confidence decay job, stagnation detection
- **Admin/DevOps** — configures decay parameters, triggers epoch boundaries
- **SQLite Database** — stores entries, outcomes, edges, search logs

### 2.2 System Architecture

The enhancement adds three layers to the existing search pipeline:
1. **Scoring Layer** — computes composite score at query time
2. **Feedback Layer** — records outcomes and updates statistics
3. **Maintenance Layer** — background jobs for decay, stagnation, epochs

---

## 3. Functional Requirements

### 3.1 Use Cases Summary

| UC ID | Name | Priority | Actor |
|-------|------|----------|-------|
| UC-01 | Search KB with Temporal Decay | P0 | AI Agent |
| UC-02 | Exclude Expired Entries | P0 | AI Agent |
| UC-03 | Report Outcome | P1 | AI Agent |
| UC-04 | Create Entry with Supersedes Link | P1 | AI Agent |
| UC-05 | Detect Stagnation Patterns | P1 | System (Scheduler) |
| UC-06 | Run Confidence Decay Job | P2 | System (Scheduler) |
| UC-07 | Trigger Epoch Boundary | P2 | Admin / System |
| UC-08 | Calculate Predictive Score | P3 | System |

---

### 3.2 UC-01: Search KB with Temporal Decay (P0)

**Actor:** AI Agent
**Preconditions:** Knowledge entries exist in database; FTS5 index populated
**Postconditions:** Search results returned sorted by composite score (descending)

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Agent calls `mem_search(query, options)` | | Agent initiates search with optional decay params |
| 2 | | Performs FTS5 MATCH | System queries knowledge_fts for matching entries |
| 3 | | Applies expire filter | Excludes entries where `expires_at < datetime('now')` |
| 4 | | Applies archived filter | Excludes entries where `archived = 1` |
| 5 | | Computes temporal_weight per entry | `weight = pinned ? 1.0 : 0.5^(ageDays / halfLifeDays)` |
| 6 | | Computes outcome_factor per entry | `(successes + 1) / (total + 2)` from entry_outcomes |
| 7 | | Computes composite_score | `fts_rank * temporal * confidence * outcome * predictive` |
| 8 | | Sorts by composite_score DESC | Top N results selected |
| 9 | | Returns results with score breakdown | Includes temporal_weight, outcome_factor, confidence in metadata |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-01 | `include_superseded=true` param provided | Skip superseded entry penalty (weight x0.1); include all entries |
| AF-02 | `halfLifeDays` override in options | Use custom half-life instead of system default (30) |
| AF-03 | No FTS matches found | Return empty array immediately |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-01 | Composite scoring calculation fails (e.g., DB error) | Log error; fall back to FTS-only ranking (current behavior) |
| EF-02 | Invalid query syntax after sanitization | Return empty array; log warning |

---

### 3.3 UC-02: Exclude Expired Entries (P0)

**Actor:** AI Agent
**Preconditions:** Entry has `expires_at` field set (non-NULL)
**Postconditions:** Expired entries never appear in search results

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Agent calls `mem_search` or `findFiltered` | | Any search operation |
| 2 | | Adds WHERE clause: `(expires_at IS NULL OR expires_at >= datetime('now'))` | Filter applied before scoring |
| 3 | | Returns only non-expired entries | Expired entries excluded from results |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-01 | Admin requests expired entries | Separate admin query method bypasses expire filter |
| AF-02 | Entry has `expires_at = NULL` | Entry is always eligible (never expires) |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-01 | Invalid `expires_at` format in DB | Treat as non-expired (safe default); log warning |


---

### 3.4 UC-03: Report Outcome (P1)

**Actor:** AI Agent
**Preconditions:** Agent has used a KB entry and knows the entry_id
**Postconditions:** Outcome recorded in `entry_outcomes` table; outcome_factor updated for future searches

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Agent calls `mem_outcome(entry_id, outcome, context?)` | | Reports success/fail/partial |
| 2 | | Validates entry_id exists | Checks knowledge_entries table |
| 3 | | Validates outcome enum | Must be 'success', 'fail', or 'partial' |
| 4 | | Inserts row into entry_outcomes | Records entry_id, outcome, agent_name, context, timestamp |
| 5 | | If outcome='success': boost confidence +10% (cap 1.0) | Updates knowledge_entries.confidence |
| 6 | | Returns confirmation | `{ recorded: true, new_outcome_factor: 0.75 }` |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-01 | outcome='partial' | Counts as 0.5 success in Bayesian calculation |
| AF-02 | Agent provides context string | Stored for debugging/auditing |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-01 | entry_id does not exist | Return error: `{ error: "ENTRY_NOT_FOUND", entry_id }` |
| EF-02 | Invalid outcome value | Return error: `{ error: "INVALID_OUTCOME", valid: ["success","fail","partial"] }` |
| EF-03 | Database write failure | Return error; log; do not crash (non-blocking) |

---

### 3.5 UC-04: Create Entry with Supersedes Link (P1)

**Actor:** AI Agent
**Preconditions:** Entry being superseded exists in DB
**Postconditions:** New entry created; SUPERSEDES edge in knowledge_graph_edges; old entry deprioritized

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Agent calls `mem_ingest(content, options)` with `supersedes_id` | | Creates new entry replacing old |
| 2 | | Validates supersedes_id exists | Check knowledge_entries |
| 3 | | Checks for circular supersession | Walk chain to detect cycles |
| 4 | | Creates new knowledge_entry | Standard insert |
| 5 | | Creates SUPERSEDES edge | Insert into knowledge_graph_edges: source=new, target=old, relation='SUPERSEDES' |
| 6 | | Returns new entry with version chain | `{ entry, supersedes: old_id, chain_depth }` |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-01 | supersedes_id not provided | Normal entry creation (no version chain) |
| AF-02 | Chain depth > 10 | Log warning; still create but flag for review |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-01 | supersedes_id does not exist | Return error: `{ error: "SUPERSEDE_TARGET_NOT_FOUND" }` |
| EF-02 | Circular supersession detected (A->B->A) | Reject: `{ error: "CIRCULAR_SUPERSESSION", chain: [ids] }` |
| EF-03 | Entry already superseded by another entry | Allow (multiple supersessions of same entry permitted) |


---

### 3.6 UC-05: Detect Stagnation Patterns (P1)

**Actor:** System (Background Scheduler)
**Preconditions:** `search_log` table has recent entries
**Postconditions:** Stagnation patterns identified and logged

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Scheduler triggers stagnation check | | Runs on configurable interval (default: every 6 hours) |
| 2 | | Queries search_log for failed queries | `result_count = 0` in last 7 days |
| 3 | | Groups by normalized query | Case-insensitive, trimmed |
| 4 | | Filters: count >= 3 within 7 days | Stagnation threshold |
| 5 | | Excludes likely typos | Queries with edit distance < 2 from successful queries |
| 6 | | Logs stagnation warnings | Stores in memory_audit with operation='STAGNATION_DETECTED' |
| 7 | | Returns stagnation report | List of stagnant queries with frequency and suggestions |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-01 | No stagnation detected | Log "no stagnation" and exit cleanly |
| AF-02 | Admin requests manual stagnation check | Run immediately regardless of schedule |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-01 | search_log table empty or missing | Log warning; skip detection; return empty report |
| EF-02 | Job takes > 30 seconds | Abort; log timeout; retry next cycle |

---

### 3.7 UC-06: Run Confidence Decay Job (P2)

**Actor:** System (Background Scheduler)
**Preconditions:** Knowledge entries exist with confidence > 0.1
**Postconditions:** Unaccessed entries have reduced confidence scores

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Scheduler triggers decay job | | Configurable interval (default: daily) |
| 2 | | Selects eligible entries | WHERE pinned=0 AND (last_accessed_at < now-60days OR last_accessed_at IS NULL) AND confidence > 0.1 |
| 3 | | Applies decay: confidence *= 0.95 | 5% reduction per cycle |
| 4 | | Enforces floor: MAX(confidence, 0.1) | Never drops below 0.1 |
| 5 | | Updates entries in batches (100) | Transaction per batch to avoid long locks |
| 6 | | Logs job result | Entries decayed count, duration |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-01 | No eligible entries | Log "no decay needed"; exit |
| AF-02 | Admin configures custom decay rate | Use admin-configured rate instead of 5% |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-01 | Database locked during batch | Retry batch after 100ms delay (max 3 retries) |
| EF-02 | Job exceeds 5 second timeout | Commit current batch; log partial completion; resume next cycle |

---

### 3.8 UC-07: Trigger Epoch Boundary (P2)

**Actor:** Admin / System (Git hook)
**Preconditions:** Major code change detected or admin manually triggers
**Postconditions:** Related entries flagged as needs_verification

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Admin calls `mem_configure_decay(action='epoch', scope, epoch_id)` | | Or system auto-detects via git hook |
| 2 | | Identifies affected entries | Match by source_ref, tags, or module scope |
| 3 | | Sets needs_verification = 1 | Flag entries for re-validation |
| 4 | | Sets epoch_id on affected entries | Links to the triggering event |
| 5 | | Logs epoch event | memory_audit: operation='EPOCH_TRIGGERED' |
| 6 | | Returns affected entry count | `{ epoch_id, affected_count, entries: [ids] }` |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-01 | No entries match scope | Log "no entries affected"; return count=0 |
| AF-02 | scope='all' | Flag ALL non-pinned entries (major version change) |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-01 | Invalid scope parameter | Return error: `{ error: "INVALID_EPOCH_SCOPE" }` |
| EF-02 | epoch_id already exists | Append to existing epoch (idempotent) |


---

### 3.9 UC-08: Calculate Predictive Score (P3)

**Actor:** System (computed at query time or batch)
**Preconditions:** Entry has outcome history and access patterns over 30-day window
**Postconditions:** Predictive score (0.5–1.5) calculated for composite ranking

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Search triggers predictive calculation | | During composite score computation |
| 2 | | Retrieves 30-day outcome window | Last 30 days of outcomes for entry |
| 3 | | Calculates success trend | Compare last-15-day success rate vs prior-15-day |
| 4 | | Calculates access trend | Compare recent access frequency vs historical |
| 5 | | Computes predictive_score | Trending up: >1.0 (max 1.5); Stable: 1.0; Declining: <1.0 (min 0.5) |
| 6 | | Applies to composite score | Multiplied into final score |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-01 | Predictive scoring disabled (default) | predictive_score = 1.0 (neutral) |
| AF-02 | Entry has < 5 outcomes in window | Insufficient data; predictive_score = 1.0 |
| AF-03 | Entry is newly created (< 7 days) | predictive_score = 1.1 (slight boost for new knowledge) |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-01 | Calculation error | Default to 1.0 (neutral); log warning |
| EF-02 | Performance budget exceeded (>2ms per entry) | Skip predictive; use 1.0 |

---

## 4. Business Rules

| Rule ID | Rule Description | Formula / Condition | Source |
|---------|-----------------|---------------------|--------|
| BR-01 | Temporal decay formula | `weight = 0.5^(ageDays / halfLifeDays)` where ageDays = (now - updated_at) / 86400000, halfLifeDays default 30 | BRD Story 2 |
| BR-02 | Pinned entries bypass decay | If `pinned = 1` then `temporal_weight = 1.0` always | BRD Story 2 |
| BR-03 | Expire enforcement | If `expires_at IS NOT NULL AND expires_at < datetime('now')` then exclude from all search results | BRD Story 1 |
| BR-04 | Outcome factor (Bayesian) | `outcome_factor = (successes + 1) / (total + 2)` — Laplace smoothing; partial counts as 0.5 success | BRD Story 3 |
| BR-05 | Confidence floor | `confidence >= 0.1` — decay job never reduces below this value | BRD Story 6 |
| BR-06 | Superseded entry penalty | Superseded entries: `composite_score *= 0.1` | BRD Story 4 |
| BR-07 | Stagnation threshold | Same failed query (result_count=0) appearing >= 3 times within 7 days triggers stagnation alert | BRD Story 5 |
| BR-08 | Confidence decay rate | 5% reduction per cycle for entries unaccessed > 60 days | BRD Story 6 |
| BR-09 | Success confidence boost | On outcome='success': `confidence = MIN(confidence * 1.1, 1.0)` | BRD Story 6 |
| BR-10 | Predictive score range | 0.5 (declining) to 1.0 (neutral) to 1.5 (rising) | BRD Story 8 |
| BR-11 | Composite score formula | `normalize(fts_rank) * temporal_weight * confidence * outcome_factor * predictive_score` | BRD §8 |
| BR-12 | Epoch verification flag | `needs_verification` entries still appear in search but with warning metadata | BRD Story 7 |


---

## 5. API Specifications

### 5.1 mem_search — Enhanced (Existing Tool)

**Purpose:** Search KB entries with composite scoring including temporal decay.

**Input Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| query | string | Yes | — | FTS5 search query |
| limit | integer | No | 10 | Maximum results to return |
| tier | string | No | — | Filter by tier (WORKING/REFERENCE/ARCHIVE) |
| type | string | No | — | Filter by entry type |
| include_superseded | boolean | No | false | If true, include superseded entries without penalty |
| halfLifeDays | integer | No | 30 | Custom half-life override for this query |
| enable_predictive | boolean | No | false | Enable predictive scoring multiplier |
| min_confidence | number | No | 0.0 | Minimum confidence threshold |

**Output Data:**

| Field | Type | Description |
|-------|------|-------------|
| results | SearchResult[] | Array of matching entries |
| results[].entry | KnowledgeEntry | The KB entry |
| results[].score | number | Composite score |
| results[].matchType | string | Always 'composite' (was 'fts') |
| results[].breakdown | ScoreBreakdown | Score component details |
| results[].breakdown.fts_rank | number | Raw FTS5 rank (normalized) |
| results[].breakdown.temporal_weight | number | Temporal decay weight (0-1) |
| results[].breakdown.confidence | number | Current confidence score |
| results[].breakdown.outcome_factor | number | Bayesian outcome factor |
| results[].breakdown.predictive_score | number | Predictive multiplier (0.5-1.5) |
| results[].breakdown.is_superseded | boolean | Whether entry is superseded |
| results[].warnings | string[] | E.g., ["needs_verification"] |

**Business Error Scenarios:**

| Scenario | Response | Trigger |
|----------|----------|---------|
| Composite scoring fails | Fallback to FTS-only results (no breakdown) | DB error during scoring |
| Empty query after sanitization | `{ results: [] }` | Query contains only special chars |

**Backward Compatibility:** Existing calls without new params work exactly as before but now return composite-scored results. The `matchType` changes from 'fts' to 'composite'.


---

### 5.2 mem_outcome — New Tool

**Purpose:** Report outcome (success/fail/partial) after using a KB entry.

**Input Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| entry_id | integer | Yes | ID of the KB entry that was used |
| outcome | string | Yes | One of: 'success', 'fail', 'partial' |
| context | string | No | Description of what the entry was used for |
| agent_name | string | No | Reporting agent identifier |

**Output Data:**

| Field | Type | Description |
|-------|------|-------------|
| recorded | boolean | Whether outcome was saved |
| entry_id | integer | Confirmed entry ID |
| new_outcome_factor | number | Updated Bayesian outcome factor |
| total_outcomes | integer | Total outcomes recorded for this entry |

**Business Error Scenarios:**

| Scenario | Error Code | Trigger |
|----------|-----------|---------|
| Entry not found | ENTRY_NOT_FOUND | entry_id doesn't exist in knowledge_entries |
| Invalid outcome value | INVALID_OUTCOME | outcome not in ['success','fail','partial'] |
| DB write error | OUTCOME_WRITE_FAILED | SQLite write failure (non-blocking, logged) |

---

### 5.3 mem_verify — New Tool

**Purpose:** Verify a KB entry after epoch boundary, clearing needs_verification flag.

**Input Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| entry_id | integer | Yes | ID of the entry to verify |
| action | string | No | 'verify' (default) or 'reject' |
| comment | string | No | Verification note |

**Output Data:**

| Field | Type | Description |
|-------|------|-------------|
| verified | boolean | Whether verification succeeded |
| entry_id | integer | Confirmed entry ID |
| confidence | number | Reset confidence (1.0 on verify) |
| needs_verification | integer | New flag value (0 on verify) |

**Business Error Scenarios:**

| Scenario | Error Code | Trigger |
|----------|-----------|---------|
| Entry not found | ENTRY_NOT_FOUND | entry_id doesn't exist |
| Entry not flagged | NOT_FLAGGED | Entry doesn't have needs_verification=1 |
| Reject action | N/A | Sets archived=1 instead of clearing flag |

---

### 5.4 mem_configure_decay — Admin Tool

**Purpose:** Configure decay parameters and trigger administrative actions.

**Input Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| action | string | Yes | 'get_config', 'set_config', 'run_decay', 'epoch', 'stagnation_check' |
| halfLifeDays | integer | No | Set new half-life (for 'set_config') |
| decayRate | number | No | Set decay rate, e.g., 0.05 (for 'set_config') |
| confidenceFloor | number | No | Set floor, e.g., 0.1 (for 'set_config') |
| scope | string | No | For 'epoch': tag/module scope to match entries |
| epoch_id | string | No | For 'epoch': identifier for the epoch event |

**Output Data (varies by action):**

| Action | Output |
|--------|--------|
| get_config | `{ halfLifeDays, decayRate, confidenceFloor, predictiveEnabled, stagnationThreshold }` |
| set_config | `{ updated: true, config: {...} }` |
| run_decay | `{ decayed_count, duration_ms, skipped_pinned }` |
| epoch | `{ epoch_id, affected_count, entry_ids: [...] }` |
| stagnation_check | `{ stagnant_queries: [...], count }` |

**Business Error Scenarios:**

| Scenario | Error Code | Trigger |
|----------|-----------|---------|
| Invalid action | INVALID_ACTION | action not in valid set |
| Invalid config value | INVALID_CONFIG | e.g., halfLifeDays < 1, confidenceFloor > 1.0 |
| Decay job already running | JOB_IN_PROGRESS | Concurrent execution attempt |


---

## 6. Data Model

### 6.1 Schema Changes to knowledge_entries

**New columns (additive — no destructive migration):**

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| needs_verification | INTEGER | 0 | Flag: 1 = entry needs re-verification after epoch |
| epoch_id | TEXT | NULL | ID of epoch event that flagged this entry |
| superseded_by | INTEGER | NULL | FK to entry that supersedes this one (denormalized for quick filter) |

### 6.2 New Table: entry_outcomes

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

CREATE INDEX IF NOT EXISTS idx_entry_outcomes_entry_id ON entry_outcomes(entry_id);
CREATE INDEX IF NOT EXISTS idx_entry_outcomes_created_at ON entry_outcomes(created_at);
```

### 6.3 New Edge Type: SUPERSEDES

Uses existing `knowledge_graph_edges` table with `relation = 'SUPERSEDES'`:
- `source_id` = new entry (superseding)
- `target_id` = old entry (being superseded)
- `weight` = 1.0
- `metadata` = JSON with epoch_id, reason

**Constraint:** No cycles allowed. On insert, system walks the chain from target_id to verify source_id is not reachable.

### 6.4 New Table: decay_config

```sql
CREATE TABLE IF NOT EXISTS decay_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Default rows:
| key | value |
|-----|-------|
| halfLifeDays | 30 |
| decayRate | 0.05 |
| confidenceFloor | 0.1 |
| predictiveEnabled | false |
| stagnationThreshold | 3 |
| stagnationWindowDays | 7 |
| decayIntervalHours | 24 |
| accessThresholdDays | 60 |

### 6.5 Indexes for Performance

```sql
CREATE INDEX IF NOT EXISTS idx_ke_expires_at ON knowledge_entries(expires_at)
  WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ke_updated_at ON knowledge_entries(updated_at);
CREATE INDEX IF NOT EXISTS idx_ke_pinned ON knowledge_entries(pinned)
  WHERE pinned = 1;
CREATE INDEX IF NOT EXISTS idx_ke_needs_verification ON knowledge_entries(needs_verification)
  WHERE needs_verification = 1;
CREATE INDEX IF NOT EXISTS idx_search_log_created ON search_log(created_at);
CREATE INDEX IF NOT EXISTS idx_search_log_failed ON search_log(result_count, created_at)
  WHERE result_count = 0;
```

### 6.6 Entity Relationships

| From | To | Cardinality | Relation |
|------|----|-------------|----------|
| knowledge_entries | entry_outcomes | 1:N | Entry has many outcomes |
| knowledge_entries | knowledge_graph_edges (SUPERSEDES) | 1:N | Entry can supersede many / be superseded by one |
| knowledge_entries | decay_config | N/A | Config is global, not per-entry |
| search_log | stagnation detection | N/A | search_log analyzed by stagnation job |


---

## 7. Processing Logic

### 7.1 Composite Score Calculation

**Trigger:** Every `mem_search` call
**Input:** FTS5 matched entries
**Output:** Sorted results with composite scores

**Processing Steps:**

| Step | Description | Error Handling |
|------|-------------|----------------|
| 1 | Normalize FTS rank: `norm_rank = -fts_rank` (FTS5 returns negative) | If NaN, use 0 |
| 2 | Calculate age: `ageDays = (Date.now() - Date.parse(updated_at)) / 86400000` | If parse fails, ageDays = 0 |
| 3 | Calculate temporal: `pinned ? 1.0 : Math.pow(0.5, ageDays / halfLifeDays)` | — |
| 4 | Get confidence from DB field | Already clamped 0.1-1.0 |
| 5 | Calculate outcome_factor from entry_outcomes aggregation | If no outcomes: 0.5 |
| 6 | Calculate predictive (if enabled) | If disabled: 1.0 |
| 7 | Check superseded status | If superseded: multiply by 0.1 |
| 8 | Composite = norm_rank * temporal * confidence * outcome * predictive * supersede_factor | — |
| 9 | Sort DESC by composite | — |

### 7.2 Confidence Decay Job

**Trigger:** Scheduler (configurable interval, default daily)
**Schedule:** Every `decayIntervalHours` (default 24)

**Processing Steps:**

| Step | Description | Error Handling |
|------|-------------|----------------|
| 1 | Read decay_config for current parameters | Use defaults if config missing |
| 2 | Select entries: `pinned=0 AND confidence > floor AND (last_accessed_at < threshold OR NULL)` | — |
| 3 | Batch 100 entries per transaction | — |
| 4 | For each: `confidence = MAX(confidence * (1 - decayRate), confidenceFloor)` | Skip entry on error |
| 5 | Update updated_at (NO — don't change updated_at for decay; only for content changes) | — |
| 6 | Log: entries processed, time taken | — |

### 7.3 Stagnation Detection

**Trigger:** Scheduler (default every 6 hours)

**Processing Steps:**

| Step | Description | Error Handling |
|------|-------------|----------------|
| 1 | Query search_log: `SELECT query, COUNT(*) as cnt FROM search_log WHERE result_count = 0 AND created_at > datetime('now', '-7 days') GROUP BY query HAVING cnt >= 3` | If table empty, return |
| 2 | Normalize queries (lowercase, trim) | — |
| 3 | Filter typos: exclude if Levenshtein distance < 2 from a successful query | Skip filter if too expensive |
| 4 | For each stagnant query: insert audit log | — |
| 5 | Return stagnation report | — |

---

## 8. Sequence Diagrams

### 8.1 Search with Composite Scoring

![Search Sequence](diagrams/sequence-search.png)

### 8.2 Outcome Reporting

![Outcome Sequence](diagrams/sequence-outcome.png)

### 8.3 Confidence Decay Job

![Decay Sequence](diagrams/sequence-decay.png)

---

## 9. State Diagram

### 9.1 Entry Lifecycle States

![Entry State Diagram](diagrams/state-entry-lifecycle.png)

An entry moves through these states:
- **Active** — normal state, appears in search
- **Decaying** — confidence being reduced by background job
- **Superseded** — newer entry exists; score penalized ×0.1
- **Needs Verification** — epoch boundary triggered; appears with warning
- **Expired** — expires_at passed; excluded from search
- **Archived** — manually archived; excluded from everything


---

## 10. Error Handling

### 10.1 Error Scenarios

| Scenario | Severity | Behavior | Recovery |
|----------|----------|----------|----------|
| Composite scoring DB error | Warning | Fall back to FTS-only ranking | Log error; return results without breakdown |
| Invalid outcome value | Info | Reject with INVALID_OUTCOME | Agent retries with valid value |
| Circular supersession detected | Warning | Reject insert | Return error with cycle chain for debugging |
| Confidence decay job timeout | Warning | Commit partial progress | Resume next cycle from where stopped |
| Stagnation detection timeout | Info | Skip cycle | Retry next scheduled run |
| entry_outcomes table missing (pre-migration) | Critical | Skip outcome factor in scoring | Use default 0.5; log migration needed |
| Expired entry with invalid date format | Info | Treat as non-expired | Log warning for data cleanup |
| Predictive calculation overflow | Info | Default to 1.0 | Log warning |

### 10.2 Graceful Degradation Strategy

The system MUST degrade gracefully — each scoring component is optional:

| Component | Fallback if Unavailable |
|-----------|------------------------|
| Temporal decay | weight = 1.0 (no decay applied) |
| Outcome factor | factor = 0.5 (neutral) |
| Confidence | Use value from DB as-is |
| Predictive score | score = 1.0 (neutral) |
| Superseded check | No penalty applied |
| Expire filter | Skip (include all) — LOG AS CRITICAL |

**If ALL scoring fails:** Return FTS-only results (current behavior) with `matchType: 'fts'`.

---

## 11. Security Requirements

### 11.1 Authentication & Authorization

| Role | Permissions |
|------|-------------|
| AI Agent (authenticated) | mem_search, mem_outcome, mem_verify |
| Admin | mem_configure_decay (all actions) |
| System/Scheduler | Run background jobs (confidence decay, stagnation) |

### 11.2 Data Validation

| Input | Validation |
|-------|-----------|
| entry_id (all tools) | Must be positive integer; must exist in DB |
| outcome | Must be in ['success', 'fail', 'partial'] |
| halfLifeDays | Must be integer >= 1, <= 365 |
| confidenceFloor | Must be number >= 0.01, <= 0.5 |
| decayRate | Must be number > 0, <= 0.5 |
| epoch_id | String, max 100 chars, alphanumeric + hyphens |
| context (outcome) | String, max 500 chars |

### 11.3 Rate Limiting

| Tool | Limit | Window |
|------|-------|--------|
| mem_outcome | 100 calls | per minute per agent |
| mem_configure_decay | 10 calls | per minute |
| mem_verify | 50 calls | per minute |

---

## 12. Non-Functional Requirements

| Category | Requirement | Acceptance Criteria |
|----------|-------------|---------------------|
| Performance | Search latency overhead | < 5ms additional over current FTS-only (on 10K entries) |
| Performance | Outcome recording | < 1ms (non-blocking insert) |
| Performance | Confidence decay job | < 5 seconds for 10K entries |
| Performance | Stagnation detection | < 3 seconds for 100K search_log rows |
| Scalability | Max entries supported | 100,000 knowledge entries |
| Reliability | Background job idempotency | Re-running decay job produces same result |
| Reliability | Graceful degradation | If scoring fails, fall back to FTS-only |
| Data Integrity | No data loss on migration | Schema changes are additive only |
| Configuration | All params configurable | Via decay_config table + mem_configure_decay |
| Backward Compat | Existing API unchanged | Old mem_search calls work; new params optional |
| Observability | Score breakdown in results | Each result includes component scores |


---

## 13. Testing Considerations

### 13.1 Key Test Scenarios

| ID | Scenario | Input | Expected Output | Priority |
|----|----------|-------|-----------------|----------|
| TC-01 | Temporal decay: newer entry ranked higher | 2 entries, same FTS rank, ages 5d vs 60d | Entry 5d has higher composite score | P0 |
| TC-02 | Expired entry excluded | Entry with expires_at in past | Not in search results | P0 |
| TC-03 | Pinned entry bypasses decay | Pinned entry aged 90 days | temporal_weight = 1.0 | P0 |
| TC-04 | Outcome factor calculation | 8 success, 2 fail | outcome_factor = 0.75 | P1 |
| TC-05 | No outcomes = neutral | New entry, no outcomes | outcome_factor = 0.5 | P1 |
| TC-06 | Superseded entry penalized | Entry with superseded_by set | score *= 0.1 | P1 |
| TC-07 | Circular supersession rejected | A supersedes B, B tries to supersede A | Error: CIRCULAR_SUPERSESSION | P1 |
| TC-08 | Confidence decay respects floor | Entry at confidence 0.1 | Stays at 0.1 after decay | P2 |
| TC-09 | Stagnation detection threshold | Same query fails 3x in 7 days | Stagnation alert logged | P1 |
| TC-10 | Graceful fallback on scoring error | Force DB error during scoring | FTS-only results returned | P0 |
| TC-11 | Epoch flags entries | Trigger epoch for 'auth' scope | Related entries get needs_verification=1 | P2 |
| TC-12 | mem_verify clears flag | Call mem_verify on flagged entry | needs_verification=0, confidence=1.0 | P2 |
| TC-13 | Predictive trending down | Entry with increasing fail rate | predictive_score < 1.0 | P3 |
| TC-14 | Backward compat | Old mem_search call (no new params) | Works as before, returns composite results | P0 |

---

## 14. Appendix

### 14.1 Composite Score Formula (Reference)

```
composite_score = normalize(fts_rank)
                × temporal_weight
                × confidence
                × outcome_factor
                × predictive_score
                × supersede_factor

Where:
  temporal_weight = pinned ? 1.0 : 0.5^(ageDays / halfLifeDays)
  ageDays = (Date.now() - Date.parse(entry.updated_at)) / 86400000
  confidence = entry.confidence (DB field, range 0.1–1.0)
  outcome_factor = (successes + 1) / (successes + failures + 2)
    partial counts as 0.5 success
  predictive_score = trend multiplier (0.5–1.5), default 1.0 if disabled
  supersede_factor = entry.superseded_by ? 0.1 : 1.0
```

### 14.2 Migration Strategy

1. Add columns to knowledge_entries: `needs_verification`, `epoch_id`, `superseded_by`
2. Create `entry_outcomes` table
3. Create `decay_config` table with default values
4. Create indexes
5. All changes are additive — no existing data modified

### 14.3 Configuration Defaults

| Parameter | Default | Min | Max | Unit |
|-----------|---------|-----|-----|------|
| halfLifeDays | 30 | 1 | 365 | days |
| decayRate | 0.05 | 0.01 | 0.50 | ratio |
| confidenceFloor | 0.1 | 0.01 | 0.50 | score |
| predictiveEnabled | false | — | — | boolean |
| stagnationThreshold | 3 | 2 | 10 | count |
| stagnationWindowDays | 7 | 1 | 30 | days |
| decayIntervalHours | 24 | 1 | 168 | hours |
| accessThresholdDays | 60 | 7 | 365 | days |


### 14.4 Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | System Context | [system-context.png](diagrams/system-context.png) | [system-context.drawio](diagrams/system-context.drawio) |
| 2 | Search Sequence | [sequence-search.png](diagrams/sequence-search.png) | [sequence-search.drawio](diagrams/sequence-search.drawio) |
| 3 | Outcome Sequence | [sequence-outcome.png](diagrams/sequence-outcome.png) | [sequence-outcome.drawio](diagrams/sequence-outcome.drawio) |
| 4 | Decay Sequence | [sequence-decay.png](diagrams/sequence-decay.png) | [sequence-decay.drawio](diagrams/sequence-decay.drawio) |
| 5 | Entry State Lifecycle | [state-entry-lifecycle.png](diagrams/state-entry-lifecycle.png) | [state-entry-lifecycle.drawio](diagrams/state-entry-lifecycle.drawio) |

### 14.5 Change Log from BRD

- No deviations from BRD requirements
- Added `superseded_by` denormalized column for performance (avoids JOIN on every search)
- Added `decay_config` table for runtime configuration (BRD mentioned "configurable" but didn't specify storage)
- Clarified `partial` outcome counting as 0.5 success in Bayesian formula
- Added rate limiting specifications (not in BRD but required for security)

