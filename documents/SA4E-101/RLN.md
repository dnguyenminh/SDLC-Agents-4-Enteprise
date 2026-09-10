# Release Notes (RLN)

## SA4E-101 — Persistent multi-tenant index status + auto-reconnect

---

## Release Information

| Field | Value |
|-------|-------|
| Release Version | 1.0 |
| Release Date | 2026-08-30 |
| Jira Ticket | SA4E-101 |
| Environment | DEV / SIT / UAT / PROD |
| Author | dev-agent |
| Status | Ready for release |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-08-30 | dev-agent | Initiate document — feature implements persistent multi-tenant index status + startup auto-reconnect of interrupted operations |

---

## 1. What's New

### 1.1 Feature Summary

Indexing progress now **survives a backend restart** and is correctly scoped per tenant
(user + project). If the backend goes down while an index is running, the next start
automatically flags that run as "interrupted" so the VS Code extension shows a clear
"backend restarted" state instead of a progress bar that spins forever. Old, finished
index records are cleaned up automatically after one hour, and per-tenant file checksums
are persisted so unchanged files are skipped on the next run.

### 1.2 User-Facing Changes

| # | Change | Description | Impact |
|---|--------|-------------|--------|
| 1 | Restart-safe progress | A killed/restarted index is shown as "interrupted", not stuck "running" | Medium |
| 2 | Multi-tenant isolation | Each user/project sees only its own index state | Medium |
| 3 | Faster re-index (checksums) | Unchanged files are skipped using persisted checksums | Low |
| 4 | Cleaner history | Terminal index records auto-expired after 1h | Low |

### 1.3 Screenshots

Not applicable — internal behavior; no new UI surface.

---

## 2. Technical Changes

### 2.1 API Changes

| Type | Endpoint | Method | Description |
|------|----------|--------|-------------|
| (none) | — | — | No new public API; feature is internal to the indexing engine + persistence layer |

### 2.2 Database Changes

| Type | Object | Description |
|------|--------|-------------|
| New Table | `index_operations` | Tracks each index run: id, user_id, project_id, status, phase, current, total, current_file, started_at, updated_at. Partial unique index enforces ≤1 active (running/interrupted) op per tenant |
| New Table | `file_checksums` | Per-tenant SHA-256 checksums: user_id, project_id, file_path, file_checksum, last_indexed_at. Unique index on (user_id, project_id, file_path) |

### 2.3 Configuration Changes

| Property | Change Type | Description |
|----------|-----------|-------------|
| (none) | — | No env var / property changes |

### 2.4 Infrastructure Changes

| Component | Change | Description |
|-----------|--------|-------------|
| Code-Intel backend | Modified | Wires `ensureSa4e101Tables()` → `runStartupInterruptDetection()` → `CleanupScheduler` into `HttpServer.start()` |

---

## 3. Bug Fixes

No bug fixes included in this release (feature delivery).

---

## 4. Known Issues & Limitations

| # | Issue | Impact | Workaround | Target Fix |
|---|-------|--------|------------|------------|
| 1 | If the DB is unreachable at boot, persistence init is skipped (graceful degradation EF-04) — progress will not survive restart until DB recovers | Medium | Restore DB connectivity; restart backend | N/A (by design) |

No other known issues at the time of release.

---

## 5. Dependencies

### 5.1 Pre-requisite Releases

| Release | Version | Status | Required Before |
|---------|---------|--------|-----------------|
| SA4E-78 (index op baseline) | — | Deployed | This release |

### 5.2 External System Changes

| System | Change Required | Status | Contact |
|--------|----------------|--------|---------|
| (none) | — | — | — |

---

## 6. Migration Notes

### 6.1 Data Migration

| Migration | Description | Automated | Estimated Time |
|-----------|-------------|-----------|----------------|
| SA4E-101 schema | `index_operations` + `file_checksums` tables + indexes | Yes (idempotent DDL at boot) | < 1s |

### 6.2 Breaking Changes

No breaking changes in this release. Fully backward compatible.

### 6.3 Backward Compatibility

Fully backward compatible — new tables are additive; existing indexing behavior is unchanged when persistence is unavailable (degrades gracefully).

---

## 7. Testing Summary

Supplemental unit-test coverage added for the six core SA4E-101 classes (this change).

| Test Level | Total | Passed | Failed | Blocked | Pass Rate |
|-----------|-------|--------|--------|---------|-----------|
| Unit Tests (SA4E-101 supplemental) | 46 | 46 | 0 | 0 | 100% |
| Unit Tests (pre-existing suite) | — | pass | — | — | — |
| Integration Tests | (covered by existing suite) | — | — | — | — |
| SIT | (per STP) | — | — | — | — |
| UAT | (per STP) | — | — | — | — |

Test files added (all green):

- `src/database/repositories/__tests__/IndexOperationRepository.test.ts` — 12 tests
- `src/database/repositories/__tests__/FileChecksumRepository.test.ts` — 6 tests
- `src/engine/indexer/__tests__/index-operation-manager.test.ts` — 9 tests
- `src/engine/indexer/__tests__/startup-interrupt-detector.test.ts` — 3 tests
- `src/engine/indexer/__tests__/cleanup-scheduler.test.ts` — 5 tests
- `src/engine/indexer/__tests__/checksum-service.test.ts` — 11 tests (incl. graceful-degradation paths)

### Defect Summary

| Severity | Found | Fixed | Open | Deferred |
|----------|-------|-------|------|----------|
| Critical | 0 | 0 | 0 | 0 |
| Major | 0 | 0 | 0 | 0 |
| Minor | 0 | 0 | 0 | 0 |

---

## 8. Deployment Instructions

Reference the Deployment Guide for detailed steps.

See: [Deployment Guide](DPG.md)

### Quick Reference

| Step | Action | Estimated Time |
|------|--------|---------------|
| 1 | Deploy build + start backend (tables auto-created) | 2 min |
| 2 | Verify logs (`tables ensured`, `cleanup-scheduler started`) | 1 min |
| 3 | Smoke test (restart mid-index → interrupted) | 3 min |
| **Total** | | **~6 min** |

---

## 9. Rollback Plan

Reference the Deployment Guide for detailed rollback steps.

**Rollback Decision Criteria:**
- Critical defect in persistence init blocking startup
- Data-integrity issue with `index_operations`

**Estimated Rollback Time:** ~5 min (revert build + drop 2 tables + restart).

---

## 10. Contacts

| Role | Name | Contact | Responsibility |
|------|------|---------|---------------|
| Release Manager | (TBD) | (TBD) | Release coordination |
| Dev Lead | (TBD) | (TBD) | Technical issues |
| QA Lead | (TBD) | (TBD) | Testing sign-off |
| DevOps | (TBD) | (TBD) | Deployment execution |
| Business Owner | (TBD) | (TBD) | Business sign-off |

---

## 11. Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Dev Lead | | | ☐ Approved |
| QA Lead | | | ☐ Approved |
| Business Owner | | | ☐ Approved |
| Release Manager | | | ☐ Approved |
