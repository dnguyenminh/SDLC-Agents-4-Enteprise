# System Test Plan (STP)

## KB Evolution Memory — SA4E-36: Temporal Versioning & Outcome Tracking

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-36 |
| Title | KB Evolution Memory — System Test Plan |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2025-07-15 |
| Status | Draft |
| Related BRD | BRD-v1-SA4E-36.docx |
| Related FSD | FSD-v1-SA4E-36.docx |
| Related TDD | TDD-v1-SA4E-36.docx |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-07-15 | QA Agent | Initial STP — 6 test levels, RTM, diagrams |

---

## 1. Introduction

### 1.1 Purpose

This System Test Plan defines the testing strategy, scope, levels, and approach for verifying the KB Evolution Memory feature (SA4E-36). It covers temporal decay scoring, outcome tracking, version chains, stagnation detection, confidence decay, epoch boundaries, and predictive scoring.

### 1.2 Scope

| In Scope | Out of Scope |
|----------|--------------|
| CompositeScorer with all strategies | UI/Admin Portal |
| Expire enforcement in search | Vector search / ONNX |
| OutcomeService CRUD + factor calc | EvoMap/evolver GEP protocol |
| DecayService background job | Changes to FTS5 tokenizer |
| StagnationDetector analysis | Database engine migration |
| EpochService flag management | |
| mem_verify / mem_configure_decay tools | |
| Migration 002 schema changes | |
| Graceful degradation on error | |

### 1.3 Test Levels Overview

| Level | ID Prefix | Description | Automation |
|-------|-----------|-------------|------------|
| PBT | PBT-xx | Property-Based Testing — formula mathematical properties | 100% automated |
| UT | UT-xx | Unit Testing — isolated service/class tests with mocks | 100% automated |
| IT | IT-xx | Integration Testing — real SQLite, multi-service interaction | 100% automated |
| E2E-API | E2E-xx | End-to-End API — MCP tool calls via JSON-RPC | 100% automated |
| E2E-UI | — | N/A (no UI component) | — |
| SIT | SIT-xx | System Integration — background jobs + search concurrency | 100% automated |

### 1.4 Test Environment

| Component | Specification |
|-----------|---------------|
| Runtime | Node.js 20+ |
| Database | better-sqlite3 (WAL mode, in-memory for UT/PBT, file for IT/SIT) |
| Test Framework | Vitest |
| PBT Library | fast-check |
| Coverage Tool | c8 (via Vitest) |
| CI/CD | GitHub Actions |

---

## 2. Test Strategy

### 2.1 Risk-Based Prioritization

| Risk | Impact | Likelihood | Priority | Test Coverage |
|------|--------|------------|----------|---------------|
| Expired entries leak into results | Critical | Low | P0 | UT + IT + E2E + SIT |
| Temporal decay formula incorrect | High | Medium | P0 | PBT + UT |
| Search latency degradation >5ms | High | Medium | P0 | IT (benchmark) + SIT |
| Outcome factor calculation error | Medium | Low | P1 | PBT + UT + IT |
| Confidence decay below floor | Medium | Low | P1 | UT + IT |
| Circular supersession allowed | High | Low | P1 | UT + IT |
| Background job blocks search | High | Low | P1 | SIT |
| Graceful fallback fails | Critical | Low | P0 | UT + IT + E2E |
| Stagnation false positives | Low | Medium | P2 | UT + IT |
| Migration corrupts data | Critical | Low | P0 | IT |

### 2.2 Test Approach Per Level

#### Level 1: PBT (Property-Based Testing)

**Purpose:** Verify mathematical properties of scoring formulas hold across random inputs.

**Techniques:**
- fast-check arbitrary generators for age, confidence, outcome counts
- Invariant checking (monotonicity, bounds, idempotency)
- Shrinking to find minimal failing cases

**Coverage targets:**
- Temporal decay: monotonic decrease, boundary values, pinned bypass
- Outcome factor: always in (0,1), Bayesian convergence properties
- Composite score: non-negative, ordering consistency

#### Level 2: UT (Unit Testing)

**Purpose:** Test each service class in isolation with mocked dependencies.

**Techniques:**
- Constructor injection with mock DB (in-memory SQLite)
- Vitest mocking for external dependencies
- Boundary value analysis, equivalence partitioning

**Coverage targets:**
- CompositeScorer: all strategies applied correctly
- OutcomeService: record, getStats, getFactorForEntry
- DecayService: config read/write, decay logic, floor enforcement
- StagnationDetector: query grouping, threshold detection
- EpochService: trigger, verify, reject
- Migration 002: idempotency, all columns/tables/indexes created

#### Level 3: IT (Integration Testing)

**Purpose:** Verify multi-service interaction with real SQLite database.

**Techniques:**
- Real better-sqlite3 database (file-based, temp directory)
- Full service instantiation (no mocks for internal services)
- Pre-seeded test data (10K entries for performance benchmarks)
- Transaction verification

**Coverage targets:**
- Full composite scoring pipeline (FTS → filter → score → sort)
- Expire enforcement across all code paths
- Outcome recording + factor retrieval in same pipeline
- Decay job execution on real data
- Performance: <5ms overhead on 10K entries

#### Level 4: E2E-API (End-to-End API via MCP)

**Purpose:** Test MCP tool calls exactly as agents would invoke them.

**Techniques:**
- JSON-RPC tool invocation (tools/call)
- Black-box testing against running server
- Input validation testing (invalid params, missing required fields)
- Error code verification

**Coverage targets:**
- mem_search with all new parameters
- mem_outcome full lifecycle
- mem_verify (verify + reject actions)
- mem_configure_decay all actions
- Backward compatibility (old mem_search calls still work)

#### Level 5: E2E-UI

**N/A** — No UI component in this feature.

#### Level 6: SIT (System Integration Testing)

**Purpose:** Test background job scheduling + concurrent search operations.

**Techniques:**
- Concurrent read/write scenarios (search during decay job)
- Background job scheduling verification
- Multi-agent outcome reporting concurrency
- Long-running stability tests

**Coverage targets:**
- DecayService running while search in progress (no blocking)
- Multiple concurrent mem_outcome calls
- StagnationDetector + EpochService running in sequence
- WAL mode verification (readers not blocked by writers)

### 2.3 Entry and Exit Criteria

**Entry Criteria:**
- All source code compiled successfully
- Migration 002 runs without error
- Database schema matches TDD section 4
- All dependencies installed (better-sqlite3, fast-check, vitest)

**Exit Criteria:**
- All P0 test cases PASS
- 95% or more P1 test cases PASS (remaining with documented justification)
- Zero Critical defects open
- Performance benchmark meets <5ms requirement
- Code coverage 85% or higher for `evolution/` directory

---

## 3. Requirements Traceability Matrix (RTM)

| Req ID | Source | Description | PBT | UT | IT | E2E | SIT |
|--------|--------|-------------|-----|----|----|-----|-----|
| BR-01 | BRD S2 | Temporal decay formula: `0.5^(age/30)` | PBT-01~04 | UT-01~03 | IT-01,02 | E2E-01 | — |
| BR-02 | BRD S2 | Pinned entries bypass decay (weight=1.0) | PBT-05 | UT-04 | IT-03 | E2E-02 | — |
| BR-03 | BRD S1 | Expire enforcement (exclude expired) | — | UT-05~07 | IT-04,05 | E2E-03,04 | SIT-01 |
| BR-04 | BRD S3 | Bayesian outcome factor | PBT-06~08 | UT-08~10 | IT-06,07 | E2E-05~07 | — |
| BR-05 | BRD S6 | Confidence floor = 0.1 | PBT-09 | UT-11,12 | IT-08 | E2E-08 | SIT-02 |
| BR-06 | BRD S4 | Superseded penalty x0.1 | — | UT-13,14 | IT-09,10 | E2E-09 | — |
| BR-07 | BRD S5 | Stagnation threshold (3 fails/7 days) | — | UT-15~17 | IT-11 | E2E-10 | SIT-03 |
| BR-08 | BRD S6 | Confidence decay rate 5%/cycle | — | UT-18,19 | IT-12 | E2E-11 | SIT-04 |
| BR-09 | BRD S6 | Success confidence boost +10% | — | UT-20 | IT-13 | E2E-12 | — |
| BR-10 | BRD S8 | Predictive score range 0.5-1.5 | PBT-10 | UT-21,22 | IT-14 | E2E-13 | — |
| BR-11 | BRD Appendix | Composite score formula correctness | PBT-11,12 | UT-23 | IT-15 | E2E-14 | — |
| BR-12 | BRD S7 | Epoch verification flag (warning) | — | UT-24~26 | IT-16 | E2E-15,16 | — |
| NFR-01 | BRD NFR | Search latency overhead <5ms / 10K entries | — | — | IT-17 | — | SIT-05 |
| NFR-02 | BRD NFR | Decay job <5s / 10K entries | — | — | IT-18 | — | SIT-06 |
| NFR-03 | BRD NFR | Outcome recording <1ms | — | — | IT-19 | — | — |
| NFR-04 | BRD NFR | Graceful degradation on scoring error | — | UT-27,28 | IT-20 | E2E-17 | SIT-07 |
| NFR-05 | BRD NFR | Background jobs idempotent | — | UT-29 | IT-21 | — | SIT-08 |
| NFR-06 | BRD NFR | Backward compatibility (old API) | — | — | IT-22 | E2E-18 | — |
| MIG-01 | TDD 3.8 | Migration 002 idempotent + additive | — | UT-30,31 | IT-23 | — | — |

---

## 4. Test Case Summary by Level

### 4.1 PBT — Property-Based Tests (12 cases)

| ID | Property | Generator | Assertion |
|----|----------|-----------|-----------|
| PBT-01 | Temporal weight monotonically decreasing | age in [0, 3650] | weight(age_a) >= weight(age_b) when age_a <= age_b |
| PBT-02 | Temporal weight bounded [0, 1] | age in [0, 3650], halfLife in [1, 365] | 0 <= weight <= 1.0 |
| PBT-03 | Temporal weight at half-life = 0.5 | halfLife in [1, 365] | weight(halfLife) approx 0.5 (tolerance 0.001) |
| PBT-04 | Temporal weight at age=0 = 1.0 | halfLife in [1, 365] | weight(0) = 1.0 |
| PBT-05 | Pinned entries always weight=1.0 | age in [0, 3650] | if pinned then weight = 1.0 |
| PBT-06 | Outcome factor bounded (0, 1) | successes in [0, 10000], failures in [0, 10000] | 0 < factor < 1 |
| PBT-07 | Outcome factor increases with successes | s2 > s1, same failures | factor(s2) > factor(s1) |
| PBT-08 | Outcome factor with no data = 0.5 | — | factor(0, 0) = 0.5 |
| PBT-09 | Confidence after decay >= floor | confidence in [0.1, 1.0], cycles in [1, 1000] | decayed >= 0.1 |
| PBT-10 | Predictive score in [0.5, 1.5] | random trajectory data | 0.5 <= score <= 1.5 |
| PBT-11 | Composite score non-negative | random valid inputs | score >= 0 |
| PBT-12 | Composite ordering: newer > older (same FTS) | two entries, same FTS rank | newer.score >= older.score |

### 4.2 UT — Unit Tests (31 cases)

| ID | Service | Test Case | Priority |
|----|---------|-----------|----------|
| UT-01 | CompositeScorer | calculateTemporalWeight — entry updated today, weight approx 1.0 | P0 |
| UT-02 | CompositeScorer | calculateTemporalWeight — entry 30 days old, weight approx 0.5 | P0 |
| UT-03 | CompositeScorer | calculateTemporalWeight — entry 60 days old, weight approx 0.25 | P0 |
| UT-04 | CompositeScorer | calculateTemporalWeight — pinned=1, weight=1.0 regardless of age | P0 |
| UT-05 | MemoryEngine | search excludes entry with expires_at in the past | P0 |
| UT-06 | MemoryEngine | search includes entry with expires_at = NULL | P0 |
| UT-07 | MemoryEngine | search includes entry with expires_at in the future | P0 |
| UT-08 | OutcomeService | record success outcome stored in DB | P1 |
| UT-09 | OutcomeService | getFactorForEntry with 8 success, 2 fail returns 0.75 | P1 |
| UT-10 | OutcomeService | getFactorForEntry with 0 outcomes returns 0.5 | P1 |
| UT-11 | DecayService | decay reduces confidence by 5% | P1 |
| UT-12 | DecayService | decay does not reduce below 0.1 floor | P1 |
| UT-13 | CompositeScorer | superseded entry gets 0.1 penalty applied | P1 |
| UT-14 | CompositeScorer | include_superseded=true, no penalty | P1 |
| UT-15 | StagnationDetector | 3 failed queries same pattern, stagnation detected | P1 |
| UT-16 | StagnationDetector | 2 failed queries, NOT stagnation | P1 |
| UT-17 | StagnationDetector | failed queries outside 7-day window, NOT stagnation | P1 |
| UT-18 | DecayService | entries unaccessed >60 days eligible for decay | P2 |
| UT-19 | DecayService | entries accessed recently NOT decayed | P2 |
| UT-20 | OutcomeService | success outcome boosts confidence by 10% (cap 1.0) | P1 |
| UT-21 | PredictiveStrategy | declining trajectory, score < 1.0 | P3 |
| UT-22 | PredictiveStrategy | rising trajectory, score > 1.0 | P3 |
| UT-23 | CompositeScorer | full composite calculation with all factors | P0 |
| UT-24 | EpochService | trigger sets needs_verification=1 on matching entries | P2 |
| UT-25 | EpochService | verify clears flag, resets confidence to 1.0 | P2 |
| UT-26 | EpochService | reject archives entry | P2 |
| UT-27 | CompositeScorer | strategy throws, graceful skip, continue | P0 |
| UT-28 | MemoryEngine | composite scorer throws, fallback to FTS-only | P0 |
| UT-29 | DecayService | runDecayCycle idempotent (run twice = same result) | P2 |
| UT-30 | Migration002 | creates new columns and tables | P0 |
| UT-31 | Migration002 | idempotent — running twice does not error | P0 |

### 4.3 IT — Integration Tests (23 cases)

| ID | Scenario | Validation | Priority |
|----|----------|------------|----------|
| IT-01 | Search ranks newer entry higher (same FTS match) | entry A (5d) ranked above entry B (60d) | P0 |
| IT-02 | Search with custom halfLifeDays=60 | temporal weights recalculated with 60-day half-life | P0 |
| IT-03 | Pinned entry always top regardless of age | pinned entry at 365d still ranks above 1d non-pinned | P0 |
| IT-04 | Expired entry NEVER in search results | insert expired entry, search, not found | P0 |
| IT-05 | Expire filter with findFiltered | filtered search also excludes expired | P0 |
| IT-06 | Outcome factor reflected in search ranking | entry with high success rate ranked higher | P1 |
| IT-07 | Full outcome lifecycle: record then search, verify factor | factor updates reflected in next search | P1 |
| IT-08 | Confidence decay stops at floor 0.1 | run decay 100 cycles, confidence never < 0.1 | P1 |
| IT-09 | Superseded entry deprioritized in search | superseded entry score x0.1 | P1 |
| IT-10 | Circular supersession rejected | attempt A->B->A, error returned | P1 |
| IT-11 | Stagnation detected after 3 failed queries | log 3 zero-result queries, detection fires | P1 |
| IT-12 | Decay job processes 10K entries in batches | verify batch processing, all entries decayed | P2 |
| IT-13 | Success outcome boosts confidence | record success, confidence increases | P1 |
| IT-14 | Predictive scoring applied when enabled | enable_predictive=true, score includes multiplier | P3 |
| IT-15 | Full composite score formula verified | manual calculation matches system output | P0 |
| IT-16 | Epoch trigger flags entries, search shows warning | trigger epoch, search returns needs_verification warning | P2 |
| IT-17 | PERF: Search latency overhead <5ms on 10K entries | benchmark: composite vs FTS-only <=5ms difference | P0 |
| IT-18 | PERF: Decay job <5s on 10K entries | time decay cycle execution | P1 |
| IT-19 | PERF: Outcome recording <1ms | time single outcome insert | P1 |
| IT-20 | Graceful fallback on scoring error | inject DB error during scoring, FTS results returned | P0 |
| IT-21 | Decay job idempotent with real data | run twice, same final confidence values | P2 |
| IT-22 | Backward compatibility: old mem_search params | call without new params, works as before | P0 |
| IT-23 | Migration 002 on existing DB with data | migrate, data preserved, new columns present | P0 |

### 4.4 E2E-API — MCP Tool Tests (18 cases)

| ID | Tool | Test Case | Priority |
|----|------|-----------|----------|
| E2E-01 | mem_search | Search with temporal decay returns breakdown | P0 |
| E2E-02 | mem_search | Pinned entry has temporal_weight=1.0 in breakdown | P0 |
| E2E-03 | mem_search | Expired entry not in results | P0 |
| E2E-04 | mem_search | Entry with future expires_at appears normally | P0 |
| E2E-05 | mem_outcome | Record success, returns new_outcome_factor | P1 |
| E2E-06 | mem_outcome | Record for non-existent entry, ENTRY_NOT_FOUND | P1 |
| E2E-07 | mem_outcome | Invalid outcome value, INVALID_OUTCOME error | P1 |
| E2E-08 | mem_configure_decay | run_decay respects confidence floor | P2 |
| E2E-09 | mem_search | Superseded entry score has is_superseded=true | P1 |
| E2E-10 | mem_configure_decay | stagnation_check returns report | P2 |
| E2E-11 | mem_configure_decay | get_config returns all config values | P2 |
| E2E-12 | mem_outcome | success outcome, confidence boosted | P1 |
| E2E-13 | mem_search | enable_predictive=true, predictive_score in breakdown | P3 |
| E2E-14 | mem_search | Full composite score matches expected formula | P0 |
| E2E-15 | mem_verify | verify action clears flag, confidence=1.0 | P2 |
| E2E-16 | mem_verify | reject action archives entry | P2 |
| E2E-17 | mem_search | Graceful fallback, matchType='fts' on error | P0 |
| E2E-18 | mem_search | Old params (no new fields), backward compatible | P0 |

### 4.5 SIT — System Integration Tests (8 cases)

| ID | Scenario | Validation | Priority |
|----|----------|------------|----------|
| SIT-01 | Concurrent search during expire cleanup | expired entries never leaked during concurrent reads | P0 |
| SIT-02 | Decay job runs while search executes | search not blocked; results consistent | P1 |
| SIT-03 | Stagnation detection after concurrent failed searches | 10 agents searching same failing query, detection triggers | P1 |
| SIT-04 | Decay job + outcome recording concurrent | no deadlocks; both operations succeed | P1 |
| SIT-05 | PERF: 100 concurrent searches on 10K entries | p95 latency <50ms; no timeout | P0 |
| SIT-06 | PERF: Decay job on 10K entries with concurrent reads | job completes <5s; reads not blocked | P1 |
| SIT-07 | Scorer error under concurrent load, fallback | all concurrent requests get results (FTS fallback) | P1 |
| SIT-08 | Multiple decay cycles produce consistent results | run 3 cycles, results deterministic | P2 |

---

## 5. Test Data Requirements

### 5.1 Data Sets

| Dataset | Size | Purpose | File |
|---------|------|---------|------|
| base_entries.csv | 100 entries | Basic CRUD and scoring tests | test-data/base_entries.csv |
| expired_entries.csv | 20 entries | Expire enforcement testing | test-data/expired_entries.csv |
| outcomes.csv | 200 records | Outcome factor calculations | test-data/outcomes.csv |
| perf_entries.csv | 10,000 entries | Performance benchmark | test-data/perf_entries.csv |
| stagnation_logs.csv | 50 records | Stagnation detection patterns | test-data/stagnation_logs.csv |
| supersession_chains.csv | 15 entries | Version chain and circular detection | test-data/supersession_chains.csv |

### 5.2 Key Test Data Scenarios

| Scenario | Data Characteristics |
|----------|---------------------|
| Fresh entry | updated_at = now, confidence = 1.0 |
| Old entry | updated_at = 90 days ago, confidence = 0.85 |
| Expired entry | expires_at = 30 days ago |
| Future-expire entry | expires_at = 60 days from now |
| Pinned entry | pinned = 1, updated_at = 365 days ago |
| High-success entry | 20 success, 2 fail outcomes |
| High-fail entry | 2 success, 15 fail outcomes |
| No-outcome entry | zero outcomes recorded |
| Superseded entry | superseded_by = newer_entry_id |
| Needs-verification entry | needs_verification = 1, epoch_id set |
| Never-accessed entry | last_accessed_at = NULL |

---

## 6. Tools and Infrastructure

| Tool | Purpose | Version |
|------|---------|---------|
| Vitest | Test runner, assertions, mocking | ^3.x |
| fast-check | Property-based testing | ^3.x |
| better-sqlite3 | Test database (real implementation) | ^11.x |
| c8 | Code coverage | via Vitest |
| tsx | TypeScript execution | ^4.x |
| GitHub Actions | CI execution | N/A |

---

## 7. Schedule and Milestones

| Phase | Duration | Activities |
|-------|----------|------------|
| Test Design | 1 day | Write test cases (STC), prepare test data |
| Environment Setup | 0.5 days | Configure vitest, fast-check, test DB |
| PBT + UT Execution | 1 day | Implement and run PBT + unit tests |
| IT Execution | 1 day | Integration tests with real DB |
| E2E-API Execution | 0.5 days | MCP tool invocation tests |
| SIT Execution | 0.5 days | Concurrency and performance tests |
| Bug Fix Verification | 1 day | Re-test failed cases after fixes |
| Final Report | 0.5 days | Generate TEST-REPORT.md |

---

## 8. Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Performance test environment differs from production | Use same SQLite config (WAL mode, same page size) |
| Flaky concurrent tests | Use deterministic scheduling; retry with seed |
| fast-check finds edge case | Enable shrinking; log seed for reproduction |
| Test data drift from real data | Generate perf_entries.csv with realistic distributions |
| Background job timing sensitivity | Use fake timers for UT/IT; real timers only in SIT |

---

## 9. Test Coverage Diagram

![Test Coverage](diagrams/test-coverage.png)

---

## 10. Test Execution Flow

![Test Execution Flow](diagrams/test-execution-flow.png)

---

## 11. Acceptance Criteria Mapping

| AC (from BRD) | Test Case(s) | Pass Criteria |
|---------------|-------------|---------------|
| Search latency overhead <5ms on 10K entries | IT-17, SIT-05 | Measured overhead <= 5ms |
| Expired entries NEVER appear in results | UT-05~07, IT-04~05, E2E-03~04, SIT-01 | Zero expired entries in any search |
| Pinned entries always temporal_weight=1.0 | PBT-05, UT-04, IT-03, E2E-02 | Weight exactly 1.0 |
| Graceful fallback on scoring error | UT-27~28, IT-20, E2E-17, SIT-07 | FTS results returned; no crash |
| Confidence floor=0.1 maintained | PBT-09, UT-11~12, IT-08, E2E-08, SIT-02 | confidence never < 0.1 |
| Decay job <5s on 10K entries | IT-18, SIT-06 | Duration < 5000ms |
| Backward compatibility (old API) | IT-22, E2E-18 | Old calls return valid results |

---

## Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Test Coverage | [test-coverage.png](diagrams/test-coverage.png) | [test-coverage.drawio](diagrams/test-coverage.drawio) |
| 2 | Test Execution Flow | [test-execution-flow.png](diagrams/test-execution-flow.png) | [test-execution-flow.drawio](diagrams/test-execution-flow.drawio) |
