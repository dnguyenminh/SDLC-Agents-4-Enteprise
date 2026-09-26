# Deployment Guide (DPG)

## Backend Admin UI — SA4E-244: Admin Project Scope dropdown shows IDs instead of workspace/project names

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-244 |
| Title | Admin Project Scope dropdown shows IDs instead of workspace/project names |
| Author | DevOps Agent |
| Version | 1.0 |
| Date | 2026-09-05 |
| Status | Draft |
| Related TDD | TDD-v1.0-SA4E-244.md |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-05 | DevOps Agent | Initiate document — auto-generated from TDD and project context |

---

## Sign-Off

| Name | Role | Signature and date |
|------|------|--------------------|
| | Dev Lead | ☐ Approved for deployment |
| | QA Lead | ☐ Testing completed |
| | Ops Lead | ☐ Infrastructure ready |

---

## 1. Overview

### 1.1 Feature Summary

Improve admin usability on `localhost:48721/admin` by displaying workspace/project human-readable names as primary labels in the Project Scope dropdown instead of raw IDs. Identifier remains available via tooltip. No database schema changes required.

### 1.2 Deployment Scope

| Item | Type | Description |
|------|------|-------------|
| Admin UI `WorkspaceSelector` | Modified | Label rendering logic in `backend/src/viewer/admin/index.html` — display_name priority with fallback |
| Backend Admin API `GET /api/admin/projects` | Unchanged | Returns project_id, display_name, workspace_path, last_seen |
| Database `project_registry` | No change | Existing table reused, no migration |

### 1.3 Target Environments

| Environment | URL | Deploy Order | Approval Required |
|-------------|-----|-------------|-------------------|
| DEV | http://localhost:48721/admin | 1st | No |
| SIT | http://localhost:48721/admin | 2nd | QA Sign-off |
| UAT | http://localhost:48721/admin | 3rd | QA Sign-off |
| PROD | http://localhost:48721/admin | 4th | PM + Business Sign-off |

---

## 2. Prerequisites

### 2.1 Infrastructure

| Requirement | Status | Notes |
|-------------|--------|-------|
| Backend dev server running on port 48721 | Ready | `npm run dev` in backend/ |
| Admin UI accessible | Ready | localhost:48721/admin |
| Network access | Ready | Localhost |

### 2.2 Software Dependencies

| Dependency | Version | Status |
|-----------|---------|--------|
| Node.js | >=18.14.1 | Installed |
| TypeScript | ES2022 | Installed |
| Hono | latest | Installed |
| SQLite better-sqlite3 | latest | Available |

### 2.3 Access Requirements

| Access | Type | Who Needs It |
|--------|------|-------------|
| Backend code repo | Read/Write | DevOps team |
| Admin UI local access | Browser | QA / Admin users |
| JWT admin token | Existing | For testing |

### 2.4 Backup Requirements

- [ ] Application backup (previous version artifact saved) — git commit tag
- [x] Database backup completed before deployment — no DB changes, optional
- [ ] Configuration backup

---

## 3. Pre-Deployment Checklist

| # | Item | Responsible | Status |
|---|------|-------------|--------|
| 1 | Code merged to release branch | Developer | ☐ |
| 2 | All unit tests passed | Developer | ☐ |
| 3 | All integration tests passed | QA | ☐ |
| 4 | SIT/UAT sign-off obtained | QA + BA | ☐ |
| 5 | Database backup completed | DBA | ☐ N/A |
| 6 | Configuration files prepared | DevOps | ☐ |
| 7 | Feature flags configured | Developer | ☐ ADMIN_PROJECT_SCOPE_SHOW_ID default false |
| 8 | Monitoring/alerting configured | DevOps | ☐ |
| 9 | Rollback plan reviewed | Team | ☐ |
| 10 | Deployment window confirmed | PM | ☐ |

---

## 4. Database Migration

### 4.1 Migration Scripts

No migration required. `project_registry` table already contains `display_name`.

### 4.2 Execution Steps

No execution required.

### 4.3 Verification Queries

```sql
-- Verify display_name populated
SELECT project_id, display_name, workspace_path FROM project_registry LIMIT 10;
```

### 4.4 Rollback Scripts

None. No schema changes.

---

## 5. Application Deployment

### 5.1 Deployment Flow

Deployment Flow: Code merge → Frontend HTML update → Backend restart → Health check → Smoke test

### 5.2 Deployment Steps

| Step | Action | Command | Verification |
|------|--------|---------|-------------|
| 1 | Pull latest code | `git pull origin main` | Files updated |
| 2 | Verify HTML change | `grep -n "display_name" backend/src/viewer/admin/index.html` | Label logic present |
| 3 | Restart backend dev server | `npm run dev` in backend/ | Server starts on 48721 |
| 4 | Health check | `curl -I http://localhost:48721/admin` | HTTP 200 |
| 5 | Verify API | `curl -H "Authorization: Bearer <token>" http://localhost:48721/api/admin/projects` | Returns projects with display_name |

### 5.3 Docker Deployment

Not applicable — local development server.

---

## 6. Configuration Changes

### 6.1 New Environment Variables

None.

### 6.2 Application Properties Changes

| Property | Old Value | New Value | File |
|----------|-----------|-----------|------|
| N/A | N/A | N/A | N/A |

### 6.3 Feature Flags

| Flag | DEV | SIT | UAT | PROD |
|------|-----|-----|-----|------|
| ADMIN_PROJECT_SCOPE_SHOW_ID | false | false | false | false |

---

## 7. Post-Deployment Verification

### 7.1 Health Checks

| Check | Endpoint/Command | Expected Result | Timeout |
|-------|-----------------|-----------------|---------|
| Admin UI loads | GET http://localhost:48721/admin | 200 OK | 5s |
| API projects | GET /api/admin/projects | 200 OK with projects array | 5s |

### 7.2 Smoke Tests

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| 1 | Dropdown displays names | Open admin → Project Scope dropdown | Options show display_name, fallback to workspace basename or ID |
| 2 | Tooltip shows ID | Hover option | title contains project_id and workspace_path |
| 3 | Selection unchanged | Select option | Filter applies using project_id value |
| 4 | All (Shared) preserved | Check first option | Value '' label 'All (Shared)' present |

### 7.3 Log Verification

| Log Entry | Level | Expected | Location |
|-----------|-------|----------|----------|
| Server started | INFO | Within 30s | backend console |
| API request logged | INFO | Projects fetched | backend console |

### 7.4 Monitoring Dashboard

- [ ] No ERROR logs on startup
- [ ] API latency <200ms p95
- [ ] No unexpected alerts

---

## 8. Rollback Plan

### 8.1 Rollback Flow

Immediate revert of frontend label logic to ID-only rendering.

### 8.2 Rollback Decision Criteria

| Condition | Action |
|-----------|--------|
| Critical defect found in production | Immediate rollback |
| Performance degradation > 50% | Immediate rollback |
| Dropdown blank or errors | Immediate rollback |
| Minor UI issue | Hotfix — no rollback |

### 8.3 Rollback Steps

| Step | Action | Command | Verification |
|------|--------|---------|-------------|
| 1 | Stop backend server | Ctrl+C | Process terminated |
| 2 | Revert HTML file | `git checkout HEAD~1 -- backend/src/viewer/admin/index.html` | File restored |
| 3 | Restart backend | `npm run dev` | Server starts |
| 4 | Verify dropdown | Open admin UI | Options show IDs as before |

### 8.4 Rollback Time Estimate

| Action | Estimated Time |
|--------|---------------|
| Application rollback | 2 minutes |
| Verification | 2 minutes |
| **Total** | **4 minutes** |

---

## 9. Environment-Specific Notes

### 9.1 DEV

Deploy directly after code merge. No approval required.

### 9.2 SIT

Run smoke tests per TEST-REPORT.md TC-001 to TC-005.

### 9.3 UAT

Verify with business users that names are readable.

### 9.4 PROD

- **Deployment Window:** Maintenance window
- **Approval Required From:** PM + Business Owner
- **Communication Plan:** Notify admin users before/after
- **On-Call Contact:** DevOps Lead

---

## 10. Appendix

### Contacts

| Role | Name | Contact |
|------|------|---------|
| DevOps Lead | DevOps Agent | — |
| QA Lead | QA Agent | — |
| Business Owner | BA Agent | — |

### Related Tickets

| Ticket | Summary | Relationship |
|--------|---------|-------------|
| SA4E-244 | Admin Project Scope dropdown shows IDs instead of workspace/project names | Main ticket |
