# Deployment Guide (DPG)

## SA4E-26: KB Knowledge Base Project Isolation Fix

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-26 |
| Title | KB Project Isolation — Deployment Guide |
| Author | DevOps Agent |
| Version | 1.0 |
| Date | 2026-07-09 |
| Status | Final |
| Related TDD | TDD-v1-SA4E-26.docx |
| Related RLN | RLN-v1-SA4E-26.docx |

---

## 1. Deployment Overview

### 1.1 Change Summary

| Item | Detail |
|------|--------|
| Type | Bug fix (PATCH) |
| Version | v1.3.0 → v1.3.1 |
| Branch | SA4E-26 |
| Files Changed | 7 files, +57/-11 lines |
| Risk Level | Low |
| Downtime Required | No (zero-downtime) |

### 1.2 Components Affected

| Component | Change Type | Impact |
|-----------|-------------|--------|
| schema.ts | DDL migration (ADD COLUMN) | Low — backward-compatible |
| MemoryEngine.ts | Query filter logic | Low — additive filter |
| MemoryToolDispatcher.ts | Parameter passing | Low — 1 new param |
| BackendConfig.ts | Project ID derivation | Low — new config field |
| models.ts | Type definition | None — type-only |
| MemoryDb.ts | Insert parameter | Low — 1 new column |

### 1.3 Architecture Context

```
IDE Extension (Kiro/VSCode)
    |
    v (HTTP localhost:48721)
Backend Server (Node.js + Hono)
    |
    +-- MemoryToolDispatcher (receives project_id from config)
    |       |
    |       v
    +-- MemoryEngine (buildScopeClause adds project_id filter)
    |       |
    |       v
    +-- SQLite DB (knowledge_entries + project_id column)
```

---

## 2. Pre-Deployment Checklist

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 1 | All tests pass (71/71) | Done | PBT + UT + IT all green |
| 2 | Code review passed (2-axis) | Done | Standards + Spec Compliance |
| 3 | UAT accepted by user | Done | User confirmed |
| 4 | Schema migration tested | Done | Auto-applies on server start |
| 5 | Backward compat verified | Done | NULL project_id entries still accessible |
| 6 | Branch up-to-date with main | Done | 1 commit ahead of main |
| 7 | No merge conflicts | Done | Clean merge path |

---

## 3. Deployment Steps

### Step 1: Merge to Main

```bash
git checkout main
git pull origin main
git merge --no-ff SA4E-26 -m "Merge SA4E-26: KB project isolation fix (project_id column)"
git push origin main
```

### Step 2: Tag Release

```bash
git tag -a v1.3.1 -m "v1.3.1: KB project isolation - project_id filter for PROJECT-scope entries"
git push origin v1.3.1
```

### Step 3: Publish to npm (if applicable)

```bash
npm version patch --no-git-tag-version
npm publish
```

### Step 4: Server Restart (Live Environments)

```bash
# Stop existing server
pm2 stop sdlc-server

# Pull latest
git pull origin main

# Install deps (if changed)
npm ci

# Start server - migration auto-applies
pm2 start sdlc-server
```

Note: Schema migration (ALTER TABLE knowledge_entries ADD COLUMN project_id TEXT) applies automatically on first server start. No manual SQL needed.

---

## 4. Post-Deployment Verification

### 4.1 Sanity Tests

| # | Test | Expected Result | Command |
|---|------|-----------------|---------|
| 1 | Server starts | No errors in log | pm2 logs sdlc-server --lines 20 |
| 2 | Schema migrated | project_id column exists | sqlite3 admin.db ".schema knowledge_entries" |
| 3 | Ingest with project_id | Entry stored with project_id | curl POST localhost:48721/api/memory/ingest |
| 4 | Search isolation | Only same-project entries returned | curl localhost:48721/api/memory/search |
| 5 | Legacy entries accessible | NULL project_id entries still visible | Verify pre-migration entries show |
| 6 | SHARED scope unaffected | SHARED entries visible cross-project | Verify SHARED entries |

### 4.2 Acceptance Criteria Verification

| AC | Description | Method |
|----|-------------|--------|
| AC-1 | PROJECT-scope entries filtered by project_id | Search from workspace A, confirm no workspace B entries |
| AC-2 | New entries get project_id automatically | Ingest entry, check DB |
| AC-3 | Legacy entries (NULL project_id) still accessible | Search returns pre-migration entries |
| AC-4 | SHARED scope unchanged | SHARED entries visible from any project |
| AC-5 | Project ID derived from workspace path | Check BackendConfig.projectId |

---

## 5. Rollback Plan

### 5.1 Rollback Trigger

Rollback if ANY of the following:
- Server fails to start after deploy
- KB search returns 0 results (regression)
- project_id filter incorrectly hides valid entries

### 5.2 Rollback Steps

```bash
# 1. Revert to previous version
git checkout main
git revert HEAD
git push origin main

# 2. Restart server
pm2 restart sdlc-server

# 3. Verify rollback
# The project_id column remains in DB (harmless) but is not used
# buildScopeClause() reverts to previous logic without project_id filter
```

### 5.3 Rollback Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Column left in DB | Certain | None — ignored by old code | No action needed |
| Cached queries use old logic | Low | None — per-process | Server restart clears |
| Users see mixed-project data again | Expected | Low — returns to pre-fix state | Acceptable |

### 5.4 Rollback Time Estimate

| Step | Duration |
|------|----------|
| Git revert + push | 1 min |
| Server restart | 30 sec |
| Verification | 2 min |
| Total | ~4 min |

---

## 6. Risk Assessment

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| 1 | Migration fails on corrupted DB | Very Low | Medium | Try/catch in schema migration |
| 2 | project_id derivation incorrect | Low | Low | Falls back to NULL (accessible to all) |
| 3 | Performance regression on large DBs | Low | Low | INDEX on project_id added |
| 4 | Existing integrations break | Very Low | Low | Backward-compatible, new param optional |

---

## 7. Communication Plan

| When | Who | What |
|------|-----|------|
| Pre-deploy | Dev Team | Deploying SA4E-26: KB project isolation fix |
| Post-deploy | Dev Team | v1.3.1 deployed. KB now filters by project. |
| If rollback | Dev Team + PO | Rolled back v1.3.1 due to {reason}. Investigating. |
