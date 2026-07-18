# System Test Cases (STC)

## KB Evolution Memory — SA4E-36: Temporal Versioning & Outcome Tracking

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-36 |
| Title | KB Evolution Memory — System Test Cases |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2025-07-15 |
| Status | Draft |
| Related STP | STP-v1-SA4E-36.docx |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-07-15 | QA Agent | Initial STC — 92 test cases across 6 levels |

---

## 1. PBT — Property-Based Tests

### PBT-01: Temporal weight monotonically decreasing

| Field | Value |
|-------|-------|
| **ID** | PBT-01 |
| **Priority** | P0 |
| **Requirement** | BR-01 |
| **Property** | For any two ages where age_a <= age_b, weight(age_a) >= weight(age_b) |
| **Generator** | age_a: fc.nat(3650), age_b: fc.nat(3650), halfLife: fc.integer(1, 365) |
| **Assertion** | `expect(weight(min(a,b), hl)).toBeGreaterThanOrEqual(weight(max(a,b), hl))` |
| **Runs** | 1000 iterations |
| **Shrink** | Enabled |

```typescript
fc.assert(fc.property(
  fc.nat(3650), fc.nat(3650), fc.integer({min: 1, max: 365}),
  (a, b, halfLife) => {
    const younger = Math.min(a, b);
    const older = Math.max(a, b);
    return calculateTemporalWeight(younger, halfLife) >= calculateTemporalWeight(older, halfLife);
  }
));
```

---

### PBT-02: Temporal weight bounded [0, 1]

| Field | Value |
|-------|-------|
| **ID** | PBT-02 |
| **Priority** | P0 |
| **Requirement** | BR-01 |
| **Property** | Temporal weight always in [0, 1] for any valid inputs |
| **Generator** | age: fc.nat(3650), halfLife: fc.integer(1, 365) |
| **Assertion** | `weight >= 0 && weight <= 1.0` |
| **Runs** | 1000 iterations |

---

### PBT-03: Temporal weight at half-life equals 0.5

| Field | Value |
|-------|-------|
| **ID** | PBT-03 |
| **Priority** | P0 |
| **Requirement** | BR-01 |
| **Property** | When age equals halfLife, weight is approximately 0.5 |
| **Generator** | halfLife: fc.integer(1, 365) |
| **Assertion** | `Math.abs(weight(halfLife, halfLife) - 0.5) < 0.001` |
| **Runs** | 100 iterations |

---

### PBT-04: Temporal weight at age=0 equals 1.0

| Field | Value |
|-------|-------|
| **ID** | PBT-04 |
| **Priority** | P0 |
| **Requirement** | BR-01 |
| **Property** | At age zero, temporal weight is exactly 1.0 |
| **Generator** | halfLife: fc.integer(1, 365) |
| **Assertion** | `weight(0, halfLife) === 1.0` |
| **Runs** | 100 iterations |

---

### PBT-05: Pinned entries always weight=1.0

| Field | Value |
|-------|-------|
| **ID** | PBT-05 |
| **Priority** | P0 |
| **Requirement** | BR-02 |
| **Property** | Pinned entries always have temporal_weight = 1.0 |
| **Generator** | age: fc.nat(3650), halfLife: fc.integer(1, 365) |
| **Assertion** | `calculateTemporalWeight({pinned: 1, age}, halfLife) === 1.0` |
| **Runs** | 500 iterations |

---

### PBT-06: Outcome factor bounded (0, 1)

| Field | Value |
|-------|-------|
| **ID** | PBT-06 |
| **Priority** | P1 |
| **Requirement** | BR-04 |
| **Property** | Bayesian outcome factor strictly between 0 and 1 |
| **Generator** | successes: fc.nat(10000), failures: fc.nat(10000) |
| **Assertion** | `factor > 0 && factor < 1` |
| **Runs** | 1000 iterations |

```typescript
fc.assert(fc.property(
  fc.nat(10000), fc.nat(10000),
  (successes, failures) => {
    const factor = (successes + 1) / (successes + failures + 2);
    return factor > 0 && factor < 1;
  }
));
```

---

### PBT-07: Outcome factor increases with more successes

| Field | Value |
|-------|-------|
| **ID** | PBT-07 |
| **Priority** | P1 |
| **Requirement** | BR-04 |
| **Property** | More successes (same failures) yields higher factor |
| **Generator** | s1: fc.nat(9999), delta: fc.integer(1, 100), failures: fc.nat(10000) |
| **Assertion** | `factor(s1 + delta, f) > factor(s1, f)` |
| **Runs** | 1000 iterations |

---

### PBT-08: Outcome factor with no data equals 0.5

| Field | Value |
|-------|-------|
| **ID** | PBT-08 |
| **Priority** | P1 |
| **Requirement** | BR-04 |
| **Property** | Zero successes and zero failures yields exactly 0.5 |
| **Generator** | None (deterministic) |
| **Assertion** | `(0 + 1) / (0 + 0 + 2) === 0.5` |

---

### PBT-09: Confidence after decay >= floor

| Field | Value |
|-------|-------|
| **ID** | PBT-09 |
| **Priority** | P1 |
| **Requirement** | BR-05 |
| **Property** | After any number of decay cycles, confidence >= 0.1 |
| **Generator** | initial: fc.double({min: 0.1, max: 1.0}), cycles: fc.integer(1, 1000) |
| **Assertion** | `decayedConfidence >= 0.1` |
| **Runs** | 1000 iterations |

```typescript
fc.assert(fc.property(
  fc.double({min: 0.1, max: 1.0, noNaN: true}),
  fc.integer({min: 1, max: 1000}),
  (initial, cycles) => {
    let conf = initial;
    for (let i = 0; i < cycles; i++) {
      conf = Math.max(conf * 0.95, 0.1);
    }
    return conf >= 0.1;
  }
));
```

---

### PBT-10: Predictive score in [0.5, 1.5]

| Field | Value |
|-------|-------|
| **ID** | PBT-10 |
| **Priority** | P3 |
| **Requirement** | BR-10 |
| **Property** | Predictive score always within bounds |
| **Generator** | recentSuccessRate: fc.double(0,1), priorSuccessRate: fc.double(0,1) |
| **Assertion** | `0.5 <= predictiveScore <= 1.5` |
| **Runs** | 500 iterations |

---

### PBT-11: Composite score non-negative

| Field | Value |
|-------|-------|
| **ID** | PBT-11 |
| **Priority** | P0 |
| **Requirement** | BR-11 |
| **Property** | Composite score is never negative |
| **Generator** | ftsRank: fc.double(0,100), temporal: fc.double(0,1), confidence: fc.double(0.1,1), outcome: fc.double(0,1), predictive: fc.double(0.5,1.5) |
| **Assertion** | `compositeScore >= 0` |
| **Runs** | 1000 iterations |

---

### PBT-12: Composite ordering newer > older (same FTS rank)

| Field | Value |
|-------|-------|
| **ID** | PBT-12 |
| **Priority** | P0 |
| **Requirement** | BR-11 |
| **Property** | Given same FTS rank and same other factors, newer entry scores higher |
| **Generator** | ageA: fc.nat(3650), ageB: fc.nat(3650) where ageA != ageB |
| **Assertion** | `score(min(a,b)) >= score(max(a,b))` |
| **Runs** | 500 iterations |

---

## 2. UT — Unit Tests

### UT-01: Temporal weight - entry updated today

| Field | Value |
|-------|-------|
| **ID** | UT-01 |
| **Priority** | P0 |
| **Requirement** | BR-01 |
| **Service** | CompositeScorer |
| **Precondition** | In-memory SQLite with schema |
| **Steps** | 1. Create entry with updated_at = now. 2. Call calculateTemporalWeight(entry, 30) |
| **Expected** | weight >= 0.99 (approximately 1.0) |

---

### UT-02: Temporal weight - entry 30 days old

| Field | Value |
|-------|-------|
| **ID** | UT-02 |
| **Priority** | P0 |
| **Requirement** | BR-01 |
| **Service** | CompositeScorer |
| **Steps** | 1. Create entry with updated_at = 30 days ago. 2. Call calculateTemporalWeight(entry, 30) |
| **Expected** | weight approximately 0.5 (tolerance 0.01) |

---

### UT-03: Temporal weight - entry 60 days old

| Field | Value |
|-------|-------|
| **ID** | UT-03 |
| **Priority** | P0 |
| **Requirement** | BR-01 |
| **Service** | CompositeScorer |
| **Steps** | 1. Create entry with updated_at = 60 days ago. 2. Call calculateTemporalWeight(entry, 30) |
| **Expected** | weight approximately 0.25 (tolerance 0.01) |

---

### UT-04: Temporal weight - pinned entry bypasses decay

| Field | Value |
|-------|-------|
| **ID** | UT-04 |
| **Priority** | P0 |
| **Requirement** | BR-02 |
| **Service** | CompositeScorer |
| **Steps** | 1. Create entry with pinned=1, updated_at=365 days ago. 2. Call calculateTemporalWeight(entry, 30) |
| **Expected** | weight = 1.0 exactly |

---

### UT-05: Search excludes expired entry

| Field | Value |
|-------|-------|
| **ID** | UT-05 |
| **Priority** | P0 |
| **Requirement** | BR-03 |
| **Service** | MemoryEngine |
| **Precondition** | Entry with expires_at = 2024-01-01 in DB, FTS indexed |
| **Steps** | 1. Call search(query) matching the expired entry |
| **Expected** | Result array does NOT contain the expired entry |

---

### UT-06: Search includes entry with NULL expires_at

| Field | Value |
|-------|-------|
| **ID** | UT-06 |
| **Priority** | P0 |
| **Requirement** | BR-03 |
| **Service** | MemoryEngine |
| **Steps** | 1. Insert entry with expires_at = NULL. 2. Call search(query) |
| **Expected** | Entry appears in results |

---

### UT-07: Search includes entry with future expires_at

| Field | Value |
|-------|-------|
| **ID** | UT-07 |
| **Priority** | P0 |
| **Requirement** | BR-03 |
| **Service** | MemoryEngine |
| **Steps** | 1. Insert entry with expires_at = 60 days from now. 2. Call search(query) |
| **Expected** | Entry appears in results normally |

---

### UT-08: OutcomeService records success outcome

| Field | Value |
|-------|-------|
| **ID** | UT-08 |
| **Priority** | P1 |
| **Requirement** | BR-04 |
| **Service** | OutcomeService |
| **Precondition** | Entry id=42 exists in DB |
| **Steps** | 1. Call record(42, success, dev-agent). 2. Query entry_outcomes table |
| **Expected** | Row exists: entry_id=42, outcome=success, agent_name=dev-agent |

---

### UT-09: Outcome factor 8 success 2 fail = 0.75

| Field | Value |
|-------|-------|
| **ID** | UT-09 |
| **Priority** | P1 |
| **Requirement** | BR-04 |
| **Service** | OutcomeService |
| **Precondition** | 8 success + 2 fail outcomes for entry_id=42 |
| **Steps** | 1. Call getFactorForEntry(42) |
| **Expected** | Returns 0.75 = (8+1)/(10+2) |

---

### UT-10: Outcome factor with 0 outcomes = 0.5

| Field | Value |
|-------|-------|
| **ID** | UT-10 |
| **Priority** | P1 |
| **Requirement** | BR-04 |
| **Service** | OutcomeService |
| **Precondition** | Entry id=42 with no outcomes recorded |
| **Steps** | 1. Call getFactorForEntry(42) |
| **Expected** | Returns 0.5 (neutral prior) |

---

### UT-11: Decay reduces confidence by 5%

| Field | Value |
|-------|-------|
| **ID** | UT-11 |
| **Priority** | P1 |
| **Requirement** | BR-05, BR-08 |
| **Service** | DecayService |
| **Precondition** | Entry confidence=0.8, last_accessed_at=90 days ago, pinned=0 |
| **Steps** | 1. Call runDecayCycle() |
| **Expected** | Entry confidence = 0.76 (0.8 * 0.95) |

---

### UT-12: Decay does not reduce below 0.1 floor

| Field | Value |
|-------|-------|
| **ID** | UT-12 |
| **Priority** | P1 |
| **Requirement** | BR-05 |
| **Service** | DecayService |
| **Precondition** | Entry confidence=0.1, last_accessed_at=90 days ago |
| **Steps** | 1. Call runDecayCycle() |
| **Expected** | Entry confidence remains 0.1 |

---

### UT-13: Superseded entry gets 0.1 penalty

| Field | Value |
|-------|-------|
| **ID** | UT-13 |
| **Priority** | P1 |
| **Requirement** | BR-06 |
| **Service** | CompositeScorer |
| **Precondition** | Entry A superseded by Entry B |
| **Steps** | 1. Call computeCompositeScore(entryA, ftsRank, options) |
| **Expected** | breakdown.is_superseded = true; final score includes x0.1 factor |

---

### UT-14: include_superseded=true no penalty

| Field | Value |
|-------|-------|
| **ID** | UT-14 |
| **Priority** | P1 |
| **Requirement** | BR-06 |
| **Service** | CompositeScorer |
| **Precondition** | Entry A superseded by Entry B |
| **Steps** | 1. Call computeCompositeScore(entryA, ftsRank, {includeSuperseded: true}) |
| **Expected** | No 0.1 penalty applied |

---

### UT-15: Stagnation detected - 3 failed queries

| Field | Value |
|-------|-------|
| **ID** | UT-15 |
| **Priority** | P1 |
| **Requirement** | BR-07 |
| **Service** | StagnationDetector |
| **Precondition** | search_log has 3 entries with result_count=0 for same query in 7 days |
| **Steps** | 1. Call analyze() |
| **Expected** | Returns report with stagnant_queries containing the query |

---

### UT-16: Stagnation NOT detected - 2 failed queries

| Field | Value |
|-------|-------|
| **ID** | UT-16 |
| **Priority** | P1 |
| **Requirement** | BR-07 |
| **Service** | StagnationDetector |
| **Precondition** | search_log has only 2 entries with result_count=0 for same query |
| **Steps** | 1. Call analyze() |
| **Expected** | Returns empty stagnant_queries (below threshold) |

---

### UT-17: Stagnation NOT detected - outside 7-day window

| Field | Value |
|-------|-------|
| **ID** | UT-17 |
| **Priority** | P1 |
| **Requirement** | BR-07 |
| **Service** | StagnationDetector |
| **Precondition** | 3 failed queries but spread across 14 days |
| **Steps** | 1. Call analyze() |
| **Expected** | No stagnation detected (outside window) |

---

### UT-18: Decay targets entries unaccessed >60 days

| Field | Value |
|-------|-------|
| **ID** | UT-18 |
| **Priority** | P2 |
| **Requirement** | BR-08 |
| **Service** | DecayService |
| **Precondition** | Entry A: last_accessed_at=90 days ago; Entry B: last_accessed_at=30 days ago |
| **Steps** | 1. Call runDecayCycle() |
| **Expected** | Entry A decayed; Entry B unchanged |

---

### UT-19: Decay skips recently accessed entries

| Field | Value |
|-------|-------|
| **ID** | UT-19 |
| **Priority** | P2 |
| **Requirement** | BR-08 |
| **Service** | DecayService |
| **Precondition** | Entry last_accessed_at = 5 days ago, confidence=0.8 |
| **Steps** | 1. Call runDecayCycle() |
| **Expected** | Entry confidence remains 0.8 |

---

### UT-20: Success outcome boosts confidence by 10%

| Field | Value |
|-------|-------|
| **ID** | UT-20 |
| **Priority** | P1 |
| **Requirement** | BR-09 |
| **Service** | OutcomeService |
| **Precondition** | Entry confidence = 0.7 |
| **Steps** | 1. Call record(entry_id, success) |
| **Expected** | Entry confidence = 0.77 (0.7 * 1.1); if already 0.95 then caps at 1.0 |

---

### UT-21: PredictiveStrategy declining trajectory

| Field | Value |
|-------|-------|
| **ID** | UT-21 |
| **Priority** | P3 |
| **Requirement** | BR-10 |
| **Service** | PredictiveStrategy |
| **Precondition** | Entry with 5 success last 15d, 3 fail recent 15d |
| **Steps** | 1. Call strategy.apply(entry, breakdown, ctx) |
| **Expected** | breakdown.predictive_score < 1.0 |

---

### UT-22: PredictiveStrategy rising trajectory

| Field | Value |
|-------|-------|
| **ID** | UT-22 |
| **Priority** | P3 |
| **Requirement** | BR-10 |
| **Service** | PredictiveStrategy |
| **Precondition** | Entry with increasing success rate and access frequency |
| **Steps** | 1. Call strategy.apply(entry, breakdown, ctx) |
| **Expected** | breakdown.predictive_score > 1.0 |

---

### UT-23: Full composite calculation

| Field | Value |
|-------|-------|
| **ID** | UT-23 |
| **Priority** | P0 |
| **Requirement** | BR-11 |
| **Service** | CompositeScorer |
| **Precondition** | Entry: 15 days old, confidence=0.9, 8 success/2 fail, not superseded |
| **Steps** | 1. Call computeCompositeScore(entry, -5.0, defaultOptions) |
| **Expected** | score = 5.0 * 0.707 * 0.9 * 0.75 * 1.0 = ~2.39 (verify breakdown matches) |

---

### UT-24: EpochService trigger sets needs_verification

| Field | Value |
|-------|-------|
| **ID** | UT-24 |
| **Priority** | P2 |
| **Requirement** | BR-12 |
| **Service** | EpochService |
| **Precondition** | 5 entries with tags matching scope auth |
| **Steps** | 1. Call trigger(auth, epoch-2025-07) |
| **Expected** | 5 entries have needs_verification=1, epoch_id=epoch-2025-07 |

---

### UT-25: EpochService verify clears flag

| Field | Value |
|-------|-------|
| **ID** | UT-25 |
| **Priority** | P2 |
| **Requirement** | BR-12 |
| **Service** | EpochService |
| **Precondition** | Entry with needs_verification=1, confidence=0.5 |
| **Steps** | 1. Call verify(entry_id) |
| **Expected** | needs_verification=0, confidence=1.0 |

---

### UT-26: EpochService reject archives entry

| Field | Value |
|-------|-------|
| **ID** | UT-26 |
| **Priority** | P2 |
| **Requirement** | BR-12 |
| **Service** | EpochService |
| **Precondition** | Entry with needs_verification=1 |
| **Steps** | 1. Call reject(entry_id) |
| **Expected** | archived=1, needs_verification=0 |

---

### UT-27: Strategy throws - graceful skip

| Field | Value |
|-------|-------|
| **ID** | UT-27 |
| **Priority** | P0 |
| **Requirement** | NFR-04 |
| **Service** | CompositeScorer |
| **Precondition** | One strategy mocked to throw Error |
| **Steps** | 1. Call computeCompositeScore with broken strategy |
| **Expected** | No exception thrown; score computed without that strategy |

---

### UT-28: Scorer throws - fallback to FTS

| Field | Value |
|-------|-------|
| **ID** | UT-28 |
| **Priority** | P0 |
| **Requirement** | NFR-04 |
| **Service** | MemoryEngine |
| **Precondition** | CompositeScorer mocked to throw |
| **Steps** | 1. Call search(query) |
| **Expected** | Results returned with matchType=fts, no crash |

---

### UT-29: Decay cycle idempotent

| Field | Value |
|-------|-------|
| **ID** | UT-29 |
| **Priority** | P2 |
| **Requirement** | NFR-05 |
| **Service** | DecayService |
| **Precondition** | Entry confidence=0.8, unaccessed |
| **Steps** | 1. Call runDecayCycle() twice in succession |
| **Expected** | First call: conf=0.76. Second call: conf=0.722. Both are valid decay results (idempotent formula application) |

---

### UT-30: Migration 002 creates columns and tables

| Field | Value |
|-------|-------|
| **ID** | UT-30 |
| **Priority** | P0 |
| **Requirement** | MIG-01 |
| **Service** | Migration002 |
| **Precondition** | Fresh DB with only base schema (no evolution columns) |
| **Steps** | 1. Run migrate002AddEvolutionColumns(db) |
| **Expected** | Columns: needs_verification, epoch_id, superseded_by. Tables: entry_outcomes, decay_config. Indexes created. Default config rows inserted. |

---

### UT-31: Migration 002 idempotent

| Field | Value |
|-------|-------|
| **ID** | UT-31 |
| **Priority** | P0 |
| **Requirement** | MIG-01 |
| **Service** | Migration002 |
| **Precondition** | DB already has evolution columns |
| **Steps** | 1. Run migrate002AddEvolutionColumns(db) twice |
| **Expected** | No error on second run; schema unchanged |

---

## 3. IT - Integration Tests

### IT-01: Search ranks newer entry higher

| Field | Value |
|-------|-------|
| **ID** | IT-01 |
| **Priority** | P0 |
| **Requirement** | BR-01 |
| **Precondition** | Real SQLite DB. Entry A: content=kotlin patterns, updated 5 days ago. Entry B: same content, updated 60 days ago. Both match query kotlin. |
| **Steps** | 1. Insert both entries with FTS index. 2. Call search(kotlin) |
| **Expected** | Entry A ranked above Entry B (higher composite score) |

---

### IT-02: Search with custom halfLifeDays=60

| Field | Value |
|-------|-------|
| **ID** | IT-02 |
| **Priority** | P0 |
| **Requirement** | BR-01 |
| **Precondition** | Entry updated 30 days ago |
| **Steps** | 1. Call search(query, {halfLifeDays: 60}) |
| **Expected** | temporal_weight approx 0.707 (not 0.5 as with default 30) |

---

### IT-03: Pinned entry always top regardless of age

| Field | Value |
|-------|-------|
| **ID** | IT-03 |
| **Priority** | P0 |
| **Requirement** | BR-02 |
| **Precondition** | Entry A: pinned=1, 365 days old. Entry B: pinned=0, 1 day old. Same FTS match. |
| **Steps** | 1. Call search(query) |
| **Expected** | Entry A ranked first (temporal_weight=1.0 despite age) |

---

### IT-04: Expired entry NEVER in search results

| Field | Value |
|-------|-------|
| **ID** | IT-04 |
| **Priority** | P0 |
| **Requirement** | BR-03 |
| **Precondition** | Entry with expires_at = 30 days ago, content matches query |
| **Steps** | 1. Call search(query) |
| **Expected** | Entry NOT in results. Zero occurrences. |

---

### IT-05: Expire filter with findFiltered

| Field | Value |
|-------|-------|
| **ID** | IT-05 |
| **Priority** | P0 |
| **Requirement** | BR-03 |
| **Precondition** | Expired entry exists matching filter criteria |
| **Steps** | 1. Call findFiltered with matching type/tier |
| **Expected** | Expired entry excluded from filtered results |

---

### IT-06: Outcome factor reflected in search ranking

| Field | Value |
|-------|-------|
| **ID** | IT-06 |
| **Priority** | P1 |
| **Requirement** | BR-04 |
| **Precondition** | Entry A: 10 successes. Entry B: 10 failures. Same age, same FTS rank. |
| **Steps** | 1. Call search(query) |
| **Expected** | Entry A ranked above Entry B |

---

### IT-07: Full outcome lifecycle

| Field | Value |
|-------|-------|
| **ID** | IT-07 |
| **Priority** | P1 |
| **Requirement** | BR-04 |
| **Precondition** | Entry exists with 0 outcomes |
| **Steps** | 1. Record 5 success outcomes. 2. Call search(query). 3. Verify breakdown shows outcome_factor |
| **Expected** | outcome_factor = (5+1)/(5+2) = 0.857 in breakdown |

---

### IT-08: Confidence decay stops at floor

| Field | Value |
|-------|-------|
| **ID** | IT-08 |
| **Priority** | P1 |
| **Requirement** | BR-05 |
| **Precondition** | Entry confidence=0.15, unaccessed 90 days |
| **Steps** | 1. Run decayCycle 10 times |
| **Expected** | Final confidence = 0.1 (floor), never below |

---

### IT-09: Superseded entry deprioritized

| Field | Value |
|-------|-------|
| **ID** | IT-09 |
| **Priority** | P1 |
| **Requirement** | BR-06 |
| **Precondition** | Entry A superseded by Entry B. Both match query. |
| **Steps** | 1. Call search(query) |
| **Expected** | Entry A score includes x0.1 penalty; Entry B ranked higher |

---

### IT-10: Circular supersession rejected

| Field | Value |
|-------|-------|
| **ID** | IT-10 |
| **Priority** | P1 |
| **Requirement** | BR-06 |
| **Precondition** | Entry A exists. Entry B supersedes A. |
| **Steps** | 1. Attempt to create Entry C superseding B with link back to A creating cycle |
| **Expected** | Error: CIRCULAR_SUPERSESSION returned |

---

### IT-11: Stagnation detected after 3 failed queries

| Field | Value |
|-------|-------|
| **ID** | IT-11 |
| **Priority** | P1 |
| **Requirement** | BR-07 |
| **Precondition** | Insert 3 search_log entries: same query, result_count=0, within 7 days |
| **Steps** | 1. Call stagnationDetector.analyze() |
| **Expected** | Report contains the stagnant query with count=3 |

---

### IT-12: Decay job processes 10K entries in batches

| Field | Value |
|-------|-------|
| **ID** | IT-12 |
| **Priority** | P2 |
| **Requirement** | BR-08 |
| **Precondition** | 10,000 entries, all unaccessed 90 days, confidence=0.8 |
| **Steps** | 1. Run runDecayCycle() |
| **Expected** | All 10K entries decayed to 0.76. Processed in batches of 100. |

---

### IT-13: Success outcome boosts confidence

| Field | Value |
|-------|-------|
| **ID** | IT-13 |
| **Priority** | P1 |
| **Requirement** | BR-09 |
| **Precondition** | Entry confidence=0.7 |
| **Steps** | 1. Call outcomeService.record(entry_id, success) |
| **Expected** | Entry confidence = 0.77 after boost |

---

### IT-14: Predictive scoring when enabled

| Field | Value |
|-------|-------|
| **ID** | IT-14 |
| **Priority** | P3 |
| **Requirement** | BR-10 |
| **Precondition** | Entry with outcome history. predictiveEnabled=true in config. |
| **Steps** | 1. Call search(query, {enable_predictive: true}) |
| **Expected** | breakdown.predictive_score != 1.0 (either >1 or <1 based on trend) |

---

### IT-15: Full composite score formula verified

| Field | Value |
|-------|-------|
| **ID** | IT-15 |
| **Priority** | P0 |
| **Requirement** | BR-11 |
| **Precondition** | Entry: 15 days old, confidence=0.9, 8s/2f outcomes, not superseded, predictive disabled |
| **Steps** | 1. Call search(query). 2. Manually calculate expected: fts_rank * 0.707 * 0.9 * 0.75 * 1.0 |
| **Expected** | System score matches manual calculation within 1% tolerance |

---

### IT-16: Epoch trigger + search shows warning

| Field | Value |
|-------|-------|
| **ID** | IT-16 |
| **Priority** | P2 |
| **Requirement** | BR-12 |
| **Precondition** | Entry with tags=auth |
| **Steps** | 1. Call epochService.trigger(auth, epoch-001). 2. Call search(query) matching that entry |
| **Expected** | Result includes warnings: [needs_verification] |

---

### IT-17: PERF - Search latency overhead less than 5ms

| Field | Value |
|-------|-------|
| **ID** | IT-17 |
| **Priority** | P0 |
| **Requirement** | NFR-01 |
| **Precondition** | 10,000 entries in DB with FTS index |
| **Steps** | 1. Measure FTS-only search time (100 runs avg). 2. Measure composite search time (100 runs avg). 3. Calculate difference. |
| **Expected** | Composite overhead <= 5ms |

---

### IT-18: PERF - Decay job less than 5s on 10K entries

| Field | Value |
|-------|-------|
| **ID** | IT-18 |
| **Priority** | P1 |
| **Requirement** | NFR-02 |
| **Precondition** | 10,000 eligible entries |
| **Steps** | 1. Time runDecayCycle() execution |
| **Expected** | Duration < 5000ms |

---

### IT-19: PERF - Outcome recording less than 1ms

| Field | Value |
|-------|-------|
| **ID** | IT-19 |
| **Priority** | P1 |
| **Requirement** | NFR-03 |
| **Precondition** | Entry exists |
| **Steps** | 1. Time outcomeService.record() (100 runs avg) |
| **Expected** | Average < 1ms |

---

### IT-20: Graceful fallback on scoring error

| Field | Value |
|-------|-------|
| **ID** | IT-20 |
| **Priority** | P0 |
| **Requirement** | NFR-04 |
| **Precondition** | Real DB. CompositeScorer configured with a strategy that throws. |
| **Steps** | 1. Call search(query) |
| **Expected** | Results returned (FTS-only). matchType=fts. No exception propagated. |

---

### IT-21: Decay job idempotent with real data

| Field | Value |
|-------|-------|
| **ID** | IT-21 |
| **Priority** | P2 |
| **Requirement** | NFR-05 |
| **Precondition** | Entries with various confidence values |
| **Steps** | 1. Run decay. 2. Record state. 3. Run decay again. 4. Compare. |
| **Expected** | Second run applies same formula consistently (conf * 0.95 each time) |

---

### IT-22: Backward compatibility - old params

| Field | Value |
|-------|-------|
| **ID** | IT-22 |
| **Priority** | P0 |
| **Requirement** | NFR-06 |
| **Precondition** | Entries in DB |
| **Steps** | 1. Call search(query) with NO new params (no halfLifeDays, no enable_predictive, etc.) |
| **Expected** | Returns results with matchType=composite using default values. No errors. |

---

### IT-23: Migration 002 on existing DB with data

| Field | Value |
|-------|-------|
| **ID** | IT-23 |
| **Priority** | P0 |
| **Requirement** | MIG-01 |
| **Precondition** | DB with 100 existing entries (pre-migration) |
| **Steps** | 1. Run migration. 2. Verify all existing data intact. 3. Verify new columns have defaults. |
| **Expected** | All entries preserved. needs_verification=0, epoch_id=NULL, superseded_by=NULL for existing. |

---

## 4. E2E-API - MCP Tool Tests

### E2E-01: mem_search with temporal decay breakdown

| Field | Value |
|-------|-------|
| **ID** | E2E-01 |
| **Priority** | P0 |
| **Requirement** | BR-01 |
| **Tool** | mem_search |
| **Precondition** | Server running. Entries with varying ages seeded. |
| **Steps** | 1. Call tools/call: mem_search({query: test, limit: 5}) |
| **Expected** | Response contains results[].breakdown with temporal_weight field. matchType=composite. |

---

### E2E-02: mem_search pinned entry temporal_weight=1.0

| Field | Value |
|-------|-------|
| **ID** | E2E-02 |
| **Priority** | P0 |
| **Requirement** | BR-02 |
| **Tool** | mem_search |
| **Precondition** | Pinned entry (365 days old) matching query |
| **Steps** | 1. Call mem_search matching pinned entry |
| **Expected** | breakdown.temporal_weight = 1.0 for pinned entry |

---

### E2E-03: mem_search expired entry excluded

| Field | Value |
|-------|-------|
| **ID** | E2E-03 |
| **Priority** | P0 |
| **Requirement** | BR-03 |
| **Tool** | mem_search |
| **Precondition** | Expired entry matching query exists in DB |
| **Steps** | 1. Call mem_search with query matching expired entry |
| **Expected** | Expired entry NOT in results array |

---

### E2E-04: mem_search future expires_at included

| Field | Value |
|-------|-------|
| **ID** | E2E-04 |
| **Priority** | P0 |
| **Requirement** | BR-03 |
| **Tool** | mem_search |
| **Precondition** | Entry with expires_at = 60 days future |
| **Steps** | 1. Call mem_search matching entry |
| **Expected** | Entry present in results |

---

### E2E-05: mem_outcome record success

| Field | Value |
|-------|-------|
| **ID** | E2E-05 |
| **Priority** | P1 |
| **Requirement** | BR-04 |
| **Tool** | mem_outcome |
| **Precondition** | Entry id=42 exists |
| **Steps** | 1. Call tools/call: mem_outcome({entry_id: 42, outcome: success}) |
| **Expected** | Response: {recorded: true, new_outcome_factor: N, total_outcomes: 1} |

---

### E2E-06: mem_outcome non-existent entry

| Field | Value |
|-------|-------|
| **ID** | E2E-06 |
| **Priority** | P1 |
| **Requirement** | BR-04 |
| **Tool** | mem_outcome |
| **Steps** | 1. Call mem_outcome({entry_id: 99999, outcome: success}) |
| **Expected** | Error response: ENTRY_NOT_FOUND |

---

### E2E-07: mem_outcome invalid outcome value

| Field | Value |
|-------|-------|
| **ID** | E2E-07 |
| **Priority** | P1 |
| **Requirement** | BR-04 |
| **Tool** | mem_outcome |
| **Steps** | 1. Call mem_outcome({entry_id: 42, outcome: invalid_value}) |
| **Expected** | Error response: INVALID_OUTCOME with valid options listed |

---

### E2E-08: mem_configure_decay run_decay respects floor

| Field | Value |
|-------|-------|
| **ID** | E2E-08 |
| **Priority** | P2 |
| **Requirement** | BR-05 |
| **Tool** | mem_configure_decay |
| **Precondition** | Entries near floor confidence |
| **Steps** | 1. Call mem_configure_decay({action: run_decay}) |
| **Expected** | Response shows decayed_count. No entry below floor. |

---

### E2E-09: mem_search superseded entry flagged

| Field | Value |
|-------|-------|
| **ID** | E2E-09 |
| **Priority** | P1 |
| **Requirement** | BR-06 |
| **Tool** | mem_search |
| **Precondition** | Entry A superseded by B. Both match query. |
| **Steps** | 1. Call mem_search(query) |
| **Expected** | Entry A breakdown.is_superseded = true. Score includes x0.1 penalty. |

---

### E2E-10: mem_configure_decay stagnation_check

| Field | Value |
|-------|-------|
| **ID** | E2E-10 |
| **Priority** | P2 |
| **Requirement** | BR-07 |
| **Tool** | mem_configure_decay |
| **Precondition** | Stagnation patterns in search_log |
| **Steps** | 1. Call mem_configure_decay({action: stagnation_check}) |
| **Expected** | Response contains stagnant_queries array with detected patterns |

---

### E2E-11: mem_configure_decay get_config

| Field | Value |
|-------|-------|
| **ID** | E2E-11 |
| **Priority** | P2 |
| **Requirement** | BR-08 |
| **Tool** | mem_configure_decay |
| **Steps** | 1. Call mem_configure_decay({action: get_config}) |
| **Expected** | Returns all config keys: halfLifeDays, decayRate, confidenceFloor, predictiveEnabled, stagnationThreshold, stagnationWindowDays, decayIntervalHours, accessThresholdDays |

---

### E2E-12: mem_outcome success boosts confidence

| Field | Value |
|-------|-------|
| **ID** | E2E-12 |
| **Priority** | P1 |
| **Requirement** | BR-09 |
| **Tool** | mem_outcome |
| **Precondition** | Entry confidence = 0.7 |
| **Steps** | 1. Call mem_outcome({entry_id: X, outcome: success}). 2. Check entry confidence. |
| **Expected** | Confidence increased to 0.77 |

---

### E2E-13: mem_search enable_predictive

| Field | Value |
|-------|-------|
| **ID** | E2E-13 |
| **Priority** | P3 |
| **Requirement** | BR-10 |
| **Tool** | mem_search |
| **Steps** | 1. Call mem_search({query: test, enable_predictive: true}) |
| **Expected** | breakdown.predictive_score reflects entry trajectory (not always 1.0) |

---

### E2E-14: mem_search full composite score

| Field | Value |
|-------|-------|
| **ID** | E2E-14 |
| **Priority** | P0 |
| **Requirement** | BR-11 |
| **Tool** | mem_search |
| **Precondition** | Known entry with known age, confidence, outcomes |
| **Steps** | 1. Call mem_search. 2. Manually verify score = fts * temporal * confidence * outcome * predictive |
| **Expected** | Returned score matches formula calculation |

---

### E2E-15: mem_verify verify action

| Field | Value |
|-------|-------|
| **ID** | E2E-15 |
| **Priority** | P2 |
| **Requirement** | BR-12 |
| **Tool** | mem_verify |
| **Precondition** | Entry with needs_verification=1 |
| **Steps** | 1. Call mem_verify({entry_id: X, action: verify}) |
| **Expected** | Response: verified=true, confidence=1.0, needs_verification=0 |

---

### E2E-16: mem_verify reject action

| Field | Value |
|-------|-------|
| **ID** | E2E-16 |
| **Priority** | P2 |
| **Requirement** | BR-12 |
| **Tool** | mem_verify |
| **Precondition** | Entry with needs_verification=1 |
| **Steps** | 1. Call mem_verify({entry_id: X, action: reject}) |
| **Expected** | Entry archived=1, no longer in search results |

---

### E2E-17: mem_search graceful fallback

| Field | Value |
|-------|-------|
| **ID** | E2E-17 |
| **Priority** | P0 |
| **Requirement** | NFR-04 |
| **Tool** | mem_search |
| **Precondition** | Scoring pipeline configured to fail (e.g., corrupt decay_config) |
| **Steps** | 1. Call mem_search(query) |
| **Expected** | Results returned with matchType=fts. No 500 error. |

---

### E2E-18: mem_search backward compatibility

| Field | Value |
|-------|-------|
| **ID** | E2E-18 |
| **Priority** | P0 |
| **Requirement** | NFR-06 |
| **Tool** | mem_search |
| **Steps** | 1. Call mem_search({query: kotlin}) with NO new params |
| **Expected** | Valid response. matchType=composite. Default scoring applied. No errors. |

---

## 5. E2E-UI

**N/A** - No UI component in this feature. All interactions are via MCP tool calls.

---

## 6. SIT - System Integration Tests

### SIT-01: Concurrent search during expire window

| Field | Value |
|-------|-------|
| **ID** | SIT-01 |
| **Priority** | P0 |
| **Requirement** | BR-03 |
| **Precondition** | Entry with expires_at = now (borderline). 50 concurrent search requests. |
| **Steps** | 1. Set entry expires_at to current timestamp. 2. Launch 50 concurrent search requests over 100ms window. |
| **Expected** | No request returns the expired entry. Zero leakage across all concurrent reads. |

---

### SIT-02: Decay job concurrent with search

| Field | Value |
|-------|-------|
| **ID** | SIT-02 |
| **Priority** | P1 |
| **Requirement** | BR-05, NFR-04 |
| **Precondition** | 10K entries. Decay job running. |
| **Steps** | 1. Start decay job in background. 2. Simultaneously run 20 search queries. |
| **Expected** | All searches complete without timeout. Results are consistent (no partial decay visible within single query). WAL mode prevents blocking. |

---

### SIT-03: Stagnation detection with concurrent failed searches

| Field | Value |
|-------|-------|
| **ID** | SIT-03 |
| **Priority** | P1 |
| **Requirement** | BR-07 |
| **Precondition** | 10 simulated agents searching same non-existent topic |
| **Steps** | 1. Run 10 concurrent searches for nonexistent_topic (all return 0 results). 2. Wait for stagnation detection cycle. |
| **Expected** | Stagnation correctly detected. Count = 10 (all logged). |

---

### SIT-04: Decay job + outcome recording concurrent

| Field | Value |
|-------|-------|
| **ID** | SIT-04 |
| **Priority** | P1 |
| **Requirement** | BR-08, BR-09 |
| **Precondition** | Decay job running on entries. Same entries receiving outcome reports. |
| **Steps** | 1. Start decay cycle. 2. Simultaneously record 20 success outcomes on entries being decayed. |
| **Expected** | No deadlocks. Both operations complete. Final confidence reflects both decay and boost. |

---

### SIT-05: PERF - 100 concurrent searches on 10K entries

| Field | Value |
|-------|-------|
| **ID** | SIT-05 |
| **Priority** | P0 |
| **Requirement** | NFR-01 |
| **Precondition** | 10K entries in DB with FTS and composite scoring active |
| **Steps** | 1. Launch 100 concurrent search requests with varied queries. 2. Measure response times. |
| **Expected** | p95 latency < 50ms. No timeouts. All return valid results. |

---

### SIT-06: PERF - Decay job with concurrent readers

| Field | Value |
|-------|-------|
| **ID** | SIT-06 |
| **Priority** | P1 |
| **Requirement** | NFR-02 |
| **Precondition** | 10K entries. Continuous read traffic (10 searches/second). |
| **Steps** | 1. Start continuous read traffic. 2. Trigger decay job. 3. Measure both. |
| **Expected** | Decay completes < 5s. Read traffic unaffected (no increased latency during decay). |

---

### SIT-07: Scorer error under concurrent load

| Field | Value |
|-------|-------|
| **ID** | SIT-07 |
| **Priority** | P1 |
| **Requirement** | NFR-04 |
| **Precondition** | Scoring configured to fail intermittently (50% chance) |
| **Steps** | 1. Run 50 concurrent searches. |
| **Expected** | All 50 return results (some composite, some FTS fallback). Zero unhandled errors. |

---

### SIT-08: Multiple decay cycles deterministic

| Field | Value |
|-------|-------|
| **ID** | SIT-08 |
| **Priority** | P2 |
| **Requirement** | NFR-05 |
| **Precondition** | Known initial state: 100 entries, confidence=0.8 |
| **Steps** | 1. Run 3 decay cycles sequentially. 2. Record final state. 3. Reset DB. 4. Run 3 decay cycles again. |
| **Expected** | Identical final confidence values in both runs (deterministic) |

---

## 7. Test Data Files

### test-data/base_entries.csv

```csv
id,content,type,tier,scope,tags,confidence,pinned,archived,expires_at,updated_at,last_accessed_at,needs_verification,epoch_id,superseded_by
1,Kotlin coroutines best practices,SOLUTION,WORKING,PROJECT,kotlin;coroutines,1.0,0,0,,2025-07-15T00:00:00Z,2025-07-10T00:00:00Z,0,,
2,React hooks patterns,SOLUTION,WORKING,PROJECT,react;hooks,0.9,0,0,,2025-06-15T00:00:00Z,2025-07-01T00:00:00Z,0,,
3,Docker compose networking guide,CONTEXT,REFERENCE,PROJECT,docker;networking,0.8,1,0,,2024-07-15T00:00:00Z,,0,,
4,Deprecated auth flow,SOLUTION,ARCHIVE,PROJECT,auth;deprecated,0.5,0,0,,2024-01-15T00:00:00Z,,0,,5
5,New auth flow with JWT,SOLUTION,WORKING,PROJECT,auth;jwt,1.0,0,0,,2025-07-01T00:00:00Z,2025-07-10T00:00:00Z,0,,
```

### test-data/expired_entries.csv

```csv
id,content,expires_at,updated_at
101,Old deployment guide,2025-01-01T00:00:00Z,2024-06-01T00:00:00Z
102,Deprecated API docs,2025-03-01T00:00:00Z,2024-09-01T00:00:00Z
103,Future valid entry,2026-12-31T00:00:00Z,2025-07-01T00:00:00Z
104,NULL expires entry,,2025-01-01T00:00:00Z
```

### test-data/outcomes.csv

```csv
entry_id,outcome,agent_name,created_at
1,success,dev-agent,2025-07-10T00:00:00Z
1,success,ba-agent,2025-07-11T00:00:00Z
1,success,qa-agent,2025-07-12T00:00:00Z
1,fail,dev-agent,2025-07-13T00:00:00Z
2,fail,dev-agent,2025-07-01T00:00:00Z
2,fail,ba-agent,2025-07-02T00:00:00Z
2,partial,dev-agent,2025-07-03T00:00:00Z
5,success,dev-agent,2025-07-05T00:00:00Z
5,success,dev-agent,2025-07-06T00:00:00Z
5,success,dev-agent,2025-07-07T00:00:00Z
```

### test-data/stagnation_logs.csv

```csv
query,result_count,created_at
deploy kubernetes pod,0,2025-07-10T00:00:00Z
deploy kubernetes pod,0,2025-07-11T00:00:00Z
deploy kubernetes pod,0,2025-07-13T00:00:00Z
graphql subscriptions,0,2025-07-08T00:00:00Z
graphql subscriptions,0,2025-07-14T00:00:00Z
working query kotlin,5,2025-07-12T00:00:00Z
```
