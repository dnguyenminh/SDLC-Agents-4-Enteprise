# Release Notes (RLN)

## v1.3.1 — KB Project Isolation Fix

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-26 |
| Version | 1.3.1 |
| Release Date | 2026-07-09 |
| Type | Bug Fix (PATCH) |
| Author | DevOps Agent |
| Related DPG | DPG-v1-SA4E-26.docx |

---

## 1. Release Summary

Fixed a critical data isolation bug in the Knowledge Base (KB) memory system. Previously, PROJECT-scope entries from different workspaces were visible to all users regardless of their active project. This release adds project_id column-based filtering to ensure KB data stays isolated per workspace.

---

## 2. Changes

### 2.1 Bug Fixes

| # | Fix | Impact | Files |
|---|-----|--------|-------|
| 1 | Added project_id column to knowledge_entries table | PROJECT-scope entries now isolated per workspace | schema.ts |
| 2 | Updated buildScopeClause() to filter by project_id | Search results only from current project | MemoryEngine.ts |
| 3 | Pass project_id on ingest/ingestFile operations | New entries tagged with originating project | MemoryToolDispatcher.ts |
| 4 | Added deriveProjectId() from workspace path | Automatic project identification | BackendConfig.ts |
| 5 | Added project_id to insert parameters | Stored in DB on write | MemoryDb.ts |

### 2.2 Schema Migration

```sql
ALTER TABLE knowledge_entries ADD COLUMN project_id TEXT;
CREATE INDEX idx_knowledge_project ON knowledge_entries(project_id);
```

- Migration auto-applies on server start
- Backward-compatible: existing entries get NULL project_id and remain accessible
- No manual SQL required

---

## 3. Scope Truth Table

| Scope | project_id match | project_id NULL | Result |
|-------|-----------------|-----------------|--------|
| USER | (filtered by user_id) | (filtered by user_id) | Visible to owner |
| PROJECT | Required match | Visible (legacy) | Isolated per project |
| SHARED | Ignored | Ignored | Visible to all |

---

## 4. Breaking Changes

None. This release is fully backward-compatible:
- Existing entries (NULL project_id) remain accessible from any project
- SHARED-scope behavior unchanged
- USER-scope behavior unchanged
- All existing API contracts preserved (project_id derived from server config, not from request)

---

## 5. Known Limitations

| # | Limitation | Workaround |
|---|-----------|------------|
| 1 | Legacy entries (pre-v1.3.1) have NULL project_id | They remain visible in all projects. Re-ingest to assign project_id |
| 2 | project_id derived from workspace path basename | Projects with same folder name share KB data |

---

## 6. Testing Summary

| Level | Tests | Result |
|-------|-------|--------|
| Property-Based Testing (PBT) | 4 | PASS |
| Unit Tests (UT) | 14 | PASS |
| Integration Tests (IT) | 12 | PASS |
| Regression (existing) | 41 | PASS |
| Total | 71 | ALL PASS |

---

## 7. Upgrade Instructions

### From v1.3.0 to v1.3.1

```bash
# If using npx (recommended):
npx sdlc-agent-4-enterprise-server@1.3.1

# If using global install:
npm update -g sdlc-agent-4-enterprise-server

# If running from source:
git pull origin main
npm ci
npm start
```

No configuration changes required. Schema migration applies automatically.

---

## 8. Rollback

If issues are encountered:
```bash
# Revert to v1.3.0
npm install -g sdlc-agent-4-enterprise-server@1.3.0
# or: git checkout v1.3.0
```

The project_id column remains in the database but is harmlessly ignored by v1.3.0 code.
