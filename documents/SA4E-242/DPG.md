# Deployment Guide (DPG)

## SDLC-Agents-4-Enterprise — SA4E-242: KB Scope Auto-Detection based on VCS presence and branch for Extension ingest

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-242 |
| Title | KB Scope Auto-Detection based on VCS presence and branch for Extension ingest |
| Author | DevOps Agent |
| Version | 1.0 |
| Date | 2026-09-05 |
| Status | Draft |
| Related TDD | TDD-v1-SA4E-242 |

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

Automatic KB scope detection based on VCS presence and current git branch. The Extension will detect scope WORKSPACE for feature branches / no VCS and PROJECT for git main/master branches, ensuring KB entries are stored in correct scope without manual override.

### 1.2 Deployment Scope

| Item | Type | Description |
|------|------|-------------|
| Extension src/services/scope-detector.ts | Modified | New detectKbScope utility with cache TTL 5min |
| BaseNode.kbIngest | Modified | Default scope resolution uses detector |
| PegaSchemaIndexer, AttachmentFetcher, KbEntryBuilder, JiraProjectIndexer | Modified | Replace hard-coded PROJECT with detected scope |
| indexer-http POST /api/v1/kb/ingest | Modified | Accepts scope and detectedScopeReason in payload |
| Backend services | No change | IsolationLayer consumes scope downstream |

### 1.3 Target Environments

**Single environment constraint:** Only localhost production is available.

| Environment | URL | Deploy Order | Approval Required |
|-------------|-----|-------------|-------------------|
| PROD (localhost) | http://localhost:48721 | 1st | PM + Business Sign-off |

*Note: UAT is performed directly on Prod with workspace isolation and feature flag `scope.autoDetect.enabled`. No DEV/SIT/UAT separate environments.*

## 2. Prerequisites

### 2.1 Infrastructure

| Requirement | Status | Notes |
|-------------|--------|-------|
| Extension VS Code runtime | Ready | VS Code ^1.85.0 |
| Backend Node.js >=18.14.1 | Ready | Hono + MCP SDK |
| Network access to indexer-http | Ready | Port 48721 |
| Git CLI available for scope detection | Ready | Used by extension in-process |

### 2.2 Software Dependencies

| Dependency | Version | Status |
|-----------|---------|--------|
| Node.js | >=18.14.1 | Installed |
| TypeScript | 5.4.0 | Installed |
| Backend runtime | 1.40.0 | Available |
| Extension | 1.40.2 | Available |

### 2.3 Access Requirements

| Access | Type | Who Needs It |
|--------|------|-------------|
| SSH to backend server | Key-based | DevOps team |
| npm registry | Service account | CI/CD pipeline |
| VS Code Extension Marketplace | Publish token | DevOps |

### 2.4 Backup Requirements

- [ ] Backup extension package version 1.40.2 artifact
- [ ] Backup backend dist/ from version 1.40.0
- [ ] Database backup completed before deployment
- [ ] Configuration backup for extension settings

---

## 3. Pre-Deployment Checklist

| # | Item | Responsible | Status |
|---|------|-------------|--------|
| 1 | Code merged to release branch | Developer | ☐ |
| 2 | All unit tests passed | Developer | ☐ |
| 3 | All integration tests passed | QA | ☐ |
| 4 | UAT sign-off obtained | QA + BA | ☐ |
| 5 | Database backup completed | DBA | ☐ |
| 6 | Configuration files prepared | DevOps | ☐ |
| 7 | Feature flags configured | Developer | ☐ |
| 8 | Monitoring/alerting configured | DevOps | ☐ |
| 9 | Rollback plan reviewed | Team | ☐ |
| 10 | Deployment window confirmed | PM | ☐ |

---

## 4. Database Migration

### 4.1 Migration Scripts
No schema changes required for SA4E-242. Scope is stored as attribute in existing KB entries. No migration script needed.

### 4.2 Execution Steps
N/A — no DB migration.

### 4.3 Verification Queries
```sql
-- Verify scope column exists in kb_entries
SELECT DISTINCT scope FROM kb_entries WHERE ticket = 'SA4E-242' LIMIT 10;
```

### 4.4 Rollback Scripts
N/A — scope detection is code-only. Rollback via code version.

---

## 5. Application Deployment

### 5.1 Deployment Flow
![Deployment Flow](diagrams/deployment-flow.png)

### 5.2 Environment Setup

#### Production (localhost) — Single Environment
- Backend URL: http://localhost:48721
- Extension version: 1.40.2 with scope-detector
- Config flag: kiroSdlc.backend.url = http://localhost:48721
- Scope cache TTL: 5 min
- Feature flag scope.autoDetect.enabled = true
- Workspace isolation enabled for UAT: UAT performed on Prod with isolated test workspaces
- Approval required before enable

### 5.3 Build Steps

#### Extension Build
```bash
cd extension
npm ci
npm run compile          # tsc -p ./
npm run esbuild-production
npm run copy-resources
vsce package --no-dependencies
```
Artifact: sdlc-agents-4-enterprise-1.40.2.vsix

#### Backend Build
```bash
cd backend
npm ci
npm run build            # tsc + copy viewer
npm run start
```
Verify health: GET http://127.0.0.1:48721/health

### 5.4 Scope-Detector Rollout Steps

| Step | Action | Command | Verification |
|------|--------|---------|-------------|
| 1 | Data freeze snapshot | Backup KB store | Snapshot timestamp recorded |
| 2 | Deploy backend v1.40.0 | npm run build && npm run start | Health check 200 OK |
| 3 | Deploy extension v1.40.2 to PROD localhost | vsce package | VSIX installed locally |
| 4 | Enable scope.autoDetect flag | Update settings.json | Flag = true |
| 5 | Trigger UAT in synthetic test workspace on feature branch | Open synthetic workspace on feature branch | Log shows scope=WORKSPACE, reason=branch=feature/x |
| 6 | Trigger UAT on main branch | Checkout main in test workspace | Log shows scope=PROJECT, reason=branch=main |
| 7 | Verify cache | Second ingest within 5 min | source=cache |
| 8 | Verify BaseNode.kbIngest default | mem_ingest payload contains scope | Payload scope matches detector |
| 9 | Rollback readiness check | Verify flag toggle and previous VSIX available | Rollback can be executed in <17 min |

### 5.5 Config Flags

**Single environment: PROD (localhost)**

| Flag | PROD (localhost) |
|------|------------------|
| scope.autoDetect.enabled | true |
| scope.cache.ttlMs | 300000 |
| scope.override | N/A |

---

## 6. Configuration Changes

### 6.1 New Environment Variables

None. All configuration via extension settings.

### 6.2 Application Properties Changes

| Property | Old Value | New Value | File |
|----------|-----------|-----------|------|
| kiroSdlc.backend.url | http://127.0.0.1:48721 | http://localhost:48721 (PROD) | settings.json |
| scope.autoDetect.enabled | false | true | settings.json |

### 6.3 Feature Flags

| Flag | PROD (localhost) |
|------|------------------|
| scope.autoDetect.enabled | true |

---

## 7. Post-Deployment Verification

### 7.1 Health Checks

| Check | Endpoint/Command | Expected Result | Timeout |
|-------|-----------------|-----------------|---------|
| Backend health | GET /health | 200 OK | 30s |
| Extension activation | VS Code Output | Activated | 60s |
| Scope detector self-test | Log on startup | detector self-test OK | 30s |

### 7.2 Smoke Tests

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| 1 | Feature branch detection | Open workspace on feature branch, trigger ingest | scope=WORKSPACE, reason contains branch name |
| 2 | Main branch detection | Checkout main, trigger ingest | scope=PROJECT, reason=branch=main |
| 3 | No VCS detection | Open workspace without .git, trigger ingest | scope=WORKSPACE, reason=no VCS |
| 4 | Cache hit | Repeat ingest within 5 min | source=cache, latency <5ms |
| 5 | BaseNode default | Call kbIngest without scope | Scope auto-filled |

### 7.3 Log Verification

| Log Entry | Level | Expected | Location |
|-----------|-------|----------|----------|
| Scope detector initialized | INFO | Within 60s of start | extension output |
| detectKbScope executed | INFO | Per ingest | backend logs |
| scope decision logged | INFO | {ticket, detectedScope, reason} | backend logs |

### 7.4 Monitoring Dashboard

- [ ] Detector latency <50ms p95
- [ ] Cache hit ratio >70%
- [ ] Git error rate <1%
- [ ] No unexpected alerts

---

## 8. Rollback Plan

### 8.1 Rollback Flow
![Rollback Flow](diagrams/rollback-flow.png)

### 8.2 Rollback Decision Criteria

| Condition | Action |
|-----------|--------|
| Scope detection returns wrong scope >5% of requests | Immediate rollback |
| Git detection timeout rate >10% | Immediate rollback |
| Performance degradation >50ms p95 | Rollback |
| Error rate increase | Rollback |

### 8.3 Rollback Steps

| Step | Action | Command | Verification |
|------|--------|---------|-------------|
| 1 | Stop extension update rollout | Pause VSIX distribution | Distribution stopped |
| 2 | Revert extension to 1.40.1 | vsce package previous version | VSIX published |
| 3 | Disable scope.autoDetect flag | Set scope.autoDetect.enabled = false | Flag off |
| 4 | Restart backend | npm run start | Health OK |
| 5 | Verify rollback | Trigger ingest, scope defaults to previous behavior | Logs show old behavior |

### 8.4 Rollback Time Estimate

| Action | Estimated Time |
|--------|---------------|
| Disable flag | 2 min |
| Redeploy extension | 10 min |
| Verification | 5 min |
| **Total** | **17 min** |

### 8.5 Risk Mitigation for Single-Environment UAT

| Risk | Mitigation |
|------|------------|
| Production data exposure during UAT | **Data freeze snapshot**: Take snapshot of KB store before UAT; restore point available |
| Unintended scope change impact | **Feature flag**: `scope.autoDetect.enabled` can be toggled off instantly without redeploy |
| Contamination of production KB entries | **Synthetic test workspace**: UAT executed in isolated test workspaces with `workspace-*` prefixes; workspace isolation enforced |
| Faulty detection affecting users | **Rollback plan**: Immediate flag disable + extension rollback to 1.40.1; verified rollback steps in Section 8.3 |
| Cache staleness after branch switch | Force scope recalculation via cache TTL 5min + manual refresh button in extension |

---



## 9. Environment-Specific Notes

### 9.1 PROD (localhost) — Single Environment
- **Constraint:** Only one environment localhost which is production
- UAT performed directly on Prod with workspace isolation and feature flag `scope.autoDetect.enabled`
- Deployment Window: Weekday 10:00-12:00 UTC (coordinated UAT window)
- Approval Required From: PM + Business Owner + QA Lead
- Communication Plan: Notify DevOps Slack #releases 24h before
- On-Call Contact: DevOps Lead
- Scope cache TTL 5 min
- Synthetic test workspace used for UAT to avoid production data impact
- Data freeze snapshot required before UAT

---

## 10. Appendix

### Contacts

| Role | Name | Contact |
|------|------|---------|
| DevOps Lead | | |
| Dev Lead | | |
| QA Lead | | |

### Related Tickets

| Ticket | Summary | Relationship |
|--------|---------|-------------|
| SA4E-242 | KB Scope Auto-Detection | Main ticket |
| SA4E-30 | Scope hierarchy | Dependency |
| SA4E-31 | Cross-workspace isolation | Dependency |
