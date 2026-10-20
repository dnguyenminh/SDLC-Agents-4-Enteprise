# Deployment Guide (DPG)

## ide_launch Extension — SA4E-373: Fix ide_launch DevToolsActivePort timeout for Kiro

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-373 |
| Title | Fix ide_launch DevToolsActivePort timeout for Kiro |
| Author | DevOps Agent |
| Version | 1.0 |
| Date | 2026-10-19 |
| Status | Draft |
| Related TDD | TDD-v1.0-SA4E-373.docx |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-19 | DevOps Agent | Initiate document — auto-generated from TDD and project context |

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

Fix ide_launch DevToolsActivePort timeout for Kiro IDE when launched with custom userDataDir. The change adds explicit --remote-debugging-port forwarding and configurable timeout with improved polling in extension/src/mcp/ide-launch-helpers.ts and ide-session-manager.ts. This unblocks manual UAT for SA4E-370.

### 1.2 Deployment Scope

| Item | Type | Description |
|------|------|-------------|
| extension/src/mcp/ide-launch-helpers.ts | Modified | waitForDevtoolsPort enhancements, validation, polling |
| extension/src/mcp/ide-session-manager.ts | Modified | launch parameter propagation for remoteDebuggingPort and timeout |
| CI/CD pipeline | Modified | Add build/test stage for ide_launch changes, enforce Node 20.x |
| Environment config | New/Modified | DEFAULT_TIMEOUT, POLL_INTERVAL, remote debugging port range |

### 1.3 Target Environments

| Environment | URL | Deploy Order | Approval Required |
|-------------|-----|-------------|-------------------|
| DEV | local workstation | 1st | No |
| SIT | internal test workspace | 2nd | No |
| UAT | manual UAT environment | 3rd | QA Sign-off |
| PROD | developer extensions release | 4th | PM + Business Sign-off |

---

## 2. Prerequisites

### 2.1 Infrastructure

| Requirement | Status | Notes |
|-------------|--------|-------|
| Developer workstation with Node 20.x | Ready/Pending | Required for extension host |
| Kiro IDE installed | Ready/Pending | Latest version |
| Filesystem access to custom userDataDir | Ready/Pending | Test directories C:\temp\kiro-uat |

### 2.2 Software Dependencies

| Dependency | Version | Status |
|-----------|---------|--------|
| Node.js | 20.x | Installed/Pending |
| TypeScript | 5.x | Installed/Pending |
| npm | 9.x | Installed/Pending |

### 2.3 Access Requirements

| Access | Type | Who Needs It |
|--------|------|-------------|
| Git repository | Read/Write | DevOps team |
| CI/CD pipeline | Service account | Automated |
| Extension registry | Publish | DevOps Lead |

### 2.4 Backup Requirements

- [ ] Git branch backup before merge
- [ ] Previous extension version artifact saved
- [ ] Configuration backup

---

## 3. Pre-Deployment Checklist

| # | Item | Responsible | Status |
|---|------|-------------|--------|
| 1 | Code merged to release branch | Developer | ☐ |
| 2 | All unit tests passed | Developer | ☐ |
| 3 | All integration tests passed | QA | ☐ |
| 4 | SIT/UAT sign-off obtained | QA + BA | ☐ |
| 5 | Configuration files prepared | DevOps | ☐ |
| 6 | Feature flags configured | Developer | ☐ |
| 7 | Monitoring/alerting configured | DevOps | ☐ |
| 8 | Rollback plan reviewed | Team | ☐ |
| 9 | Deployment window confirmed | PM | ☐ |

---

## 4. Database Migration

### 4.1 Migration Scripts

No persistent data store introduced. N/A

### 4.2 Execution Steps

N/A

### 4.3 Verification Queries

N/A

### 4.4 Rollback Scripts

N/A

---

## 5. Application Deployment

### 5.1 Deployment Flow

![Deployment Flow](diagrams/deployment-flow.png)

### 5.2 Deployment Steps

| Step | Action | Command | Verification |
|------|--------|---------|-------------|
| 1 | Stop existing extension host processes | `npm run stop` | No Node processes listening on debugging ports |
| 2 | Build extension | `npm ci && npm run build` | dist/ folder updated with new helpers |
| 3 | Run unit tests | `npm run test:unit` | All tests pass |
| 4 | Package extension | `npm run package` | .vsix artifact created |
| 5 | Deploy to DEV | Copy .vsix to dev workstations | ide_launch launches with new params |
| 6 | Health check | `ide_launch --ide kiro --help` | Shows --remoteDebuggingPort option |

### 5.3 Docker Deployment (if applicable)

Not applicable — extension runs in host process.

---

## 6. Configuration Changes

### 6.1 New Environment Variables

| Variable | Description | DEV | SIT | UAT | PROD |
|----------|-------------|-----|-----|-----|------|
| DEFAULT_TIMEOUT | Default DevTools detection timeout seconds | 60 | 60 | 60 | 60 |
| POLL_INTERVAL | File polling interval ms | 500 | 500 | 500 | 500 |
| REMOTE_DEBUGGING_PORT_RANGE | Allowed port range | 1024-65535 | 1024-65535 | 1024-65535 | 1024-65535 |

### 6.2 Application Properties Changes

| Property | Old Value | New Value | File |
|----------|-----------|-----------|------|
| ide-launch.timeoutSeconds.default | 30 | 60 | extension/src/mcp/ide-launch-helpers.ts |
| ide-launch.pollInterval | 500ms | 500ms | extension/src/mcp/ide-launch-helpers.ts |
| ide-launch.remoteDebuggingPort.supported | false | true | extension/src/mcp/ide-session-manager.ts |

### 6.3 Feature Flags

| Flag | DEV | SIT | UAT | PROD |
|------|-----|-----|-----|------|
| remoteDebuggingPort.enabled | true | true | true | false — enable after verification |

---

## 7. Post-Deployment Verification

### 7.1 Health Checks

| Check | Endpoint/Command | Expected Result | Timeout |
|-------|-----------------|-----------------|---------|
| CLI help | `ide_launch --ide kiro --help` | Shows --remoteDebuggingPort | 5s |
| Launch with custom userDataDir | `ide_launch --ide kiro --userDataDir C:\temp\kiro-uat` | launchSuccess=true | 60s |
| Launch with explicit port | `ide_launch --ide kiro --remoteDebuggingPort 9222` | devToolsPort=9222 | 30s |

### 7.2 Smoke Tests

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| 1 | Launch Kiro with custom userDataDir | Run ide_launch with --userDataDir | Success without timeout |
| 2 | Launch with explicit port | Run ide_launch with --remoteDebuggingPort 9222 | Port forwarded, launch succeeds |
| 3 | Backward compatibility | Run ide_launch --ide kiro | Works unchanged |

### 7.3 Log Verification

| Log Entry | Level | Expected | Location |
|-----------|-------|----------|----------|
| Launch start | INFO | Within 5s of invocation | stdout |
| Port detected | INFO | After startup | stdout |
| Validation failure | ERROR | On invalid input | stderr |

### 7.4 Monitoring Dashboard

- [ ] Launch duration metrics visible
- [ ] Error rate within normal range
- [ ] No unexpected alerts triggered

---

## 8. Rollback Plan

### 8.1 Rollback Flow

![Rollback Flow](diagrams/rollback-flow.png)

### 8.2 Rollback Decision Criteria

| Condition | Action |
|-----------|--------|
| Critical defect found in production | Immediate rollback |
| Launch success rate <95% | Immediate rollback |
| Port exposure issue | Immediate rollback |
| Minor UI issue | Hotfix — no rollback |

### 8.3 Rollback Steps

| Step | Action | Command | Verification |
|------|--------|---------|-------------|
| 1 | Stop extension host | `npm run stop` | Processes stopped |
| 2 | Revert code changes | `git revert <commit>` | Files restored to previous version |
| 3 | Rebuild extension | `npm ci && npm run build` | Build succeeds |
| 4 | Deploy previous .vsix | Copy previous artifact | Version matches prior |
| 5 | Verify rollback | `ide_launch --ide kiro --help` | Old options only |

### 8.4 Rollback Time Estimate

| Action | Estimated Time |
|--------|---------------|
| Application rollback | 10 minutes |
| Verification | 5 minutes |
| **Total** | **15 minutes** |

---

## 9. Environment-Specific Notes

### 9.1 DEV

Local workstation testing. Use C:\temp\kiro-dev.

### 9.2 SIT

System Integration Testing. Ensure Kiro installed and ports 9222-9225 free.

### 9.3 UAT

Manual UAT for SA4E-370. Configurable timeout up to 300s allowed.

### 9.4 PROD

- **Deployment Window:** Business work hours
- **Approval Required From:** PM + Business Sign-off
- **Communication Plan:** Notify QA team before/after deployment
- **On-Call Contact:** DevOps Lead

---

## 10. Appendix

### Contacts

| Role | Name | Contact |
|------|------|---------|
| DevOps Lead | | Email/Phone |
| QA Lead | | Email/Phone |
| On-Call Dev | | Email/Phone |

### Related Tickets

| Ticket | Summary | Relationship |
|--------|---------|-------------|
| SA4E-373 | Fix ide_launch DevToolsActivePort timeout for Kiro | Main ticket |
| SA4E-370 | Manual UAT requirement | Blocked by SA4E-373 |
