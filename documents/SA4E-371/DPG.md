# Deployment Guide (DPG)

## SDLC Agents 4 Enterprise — SA4E-371: Upgrade system prompts anti-hallucination

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-371 |
| Title | Upgrade system prompts anti-hallucination |
| Author | DevOps Agent |
| Version | 1.0 |
| Date | 2026-10-18 |
| Status | Draft |
| Related TDD | TDD-v1.53.11-SA4E-371.docx |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-18 | DevOps Agent | Initiate document — auto-generated from TDD and project context |

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

Upgrade system prompts for all agents to enforce KB-first search, reduce hallucination, and improve response accuracy. No functional change to features, only prompt hardening.

### 1.2 Deployment Scope

| Item | Type | Description |
|------|------|-------------|
| VS Code Extension | Modified | Version bump 1.53.10 → 1.53.11, system prompts updated |
| CHANGELOG.md | Modified | Added entry SA4E-371 |
| package.json | Modified | Version bump |
| VSIX artifact | New | sdlc-agents-4-enterprise-1.53.11.vsix |

### 1.3 Target Environments

| Environment | URL | Deploy Order | Approval Required |
|-------------|-----|-------------|-------------------|
| DEV | Local Kiro | 1st | No |
| SIT | Local Kiro | 2nd | No |
| UAT | Local Kiro | 3rd | QA Sign-off |
| PROD | Kiro Marketplace / Internal | 4th | PM + Business Sign-off |

---

## 2. Prerequisites

### 2.1 Infrastructure

| Requirement | Status | Notes |
|-------------|--------|-------|
| Kiro IDE access | Ready | Developer workstation |
| VSIX installation capability | Ready | Kiro extensions panel |
| Git repository access | Ready | Main branch |

### 2.2 Software Dependencies

| Dependency | Version | Status |
|-----------|---------|--------|
| Node.js | >=18 | Installed |
| vsce | 2.24.0 | Available via npx |

### 2.3 Access Requirements

| Access | Type | Who Needs It |
|--------|------|-------------|
| Git push | SSH/Token | DevOps |
| Kiro extension install | User | Dev team |

### 2.4 Backup Requirements

- [x] Git commit history preserved
- [x] Previous VSIX artifact saved: sdlc-agents-4-enterprise-1.53.10.vsix

---

## 3. Pre-Deployment Checklist

| # | Item | Responsible | Status |
|---|------|-------------|--------|
| 1 | Code merged to release branch | Developer | ☐ |
| 2 | Unit tests passed | Developer | ☐ |
| 3 | Integration tests passed | QA | ☐ |
| 4 | CHANGELOG updated | DevOps | ☑ |
| 5 | Version bumped to 1.53.11 | DevOps | ☑ |
| 6 | VSIX built successfully | DevOps | ☑ |
| 7 | Rollback plan reviewed | Team | ☐ |

---

## 4. Database Migration

### 4.1 Migration Scripts

N/A — No database changes.

### 4.2 Execution Steps

No DB migration required.

---

## 5. Application Deployment

### 5.1 Deployment Flow

![Deployment Flow](diagrams/deployment-flow.png)

### 5.2 Deployment Steps

| Step | Action | Command | Verification |
|------|--------|---------|-------------|
| 1 | Bump version | edit extension/package.json version to 1.53.11 | package.json shows 1.53.11 |
| 2 | Update CHANGELOG | prepend entry SA4E-371 | CHANGELOG.md contains entry |
| 3 | Build VSIX | `cd extension && npx vsce package` | file sdlc-agents-4-enterprise-1.53.11.vsix exists |
| 4 | Install in Kiro | Extensions → Install from VSIX | Extension version shows 1.53.11 in Kiro |
| 5 | Health check | Open Command Palette → SDLC Agents: Show Status | Status shows v1.53.11 |

### 5.3 Docker Deployment

N/A

---

## 6. Configuration Changes

### 6.1 New Environment Variables

None.

### 6.2 Application Properties Changes

None.

### 6.3 Feature Flags

None.

---

## 7. Post-Deployment Verification

### 7.1 Health Checks

| Check | Endpoint/Command | Expected Result | Timeout |
|-------|-----------------|-----------------|---------|
| Extension version | `SDLC Agents: Show Status` | 1.53.11 | 30s |
| Agent prompt loading | Open chat, issue prompt | No hallucination, KB-first search executed | 60s |

### 7.2 Smoke Tests

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| 1 | Agent responds with KB search | Ask agent about SA4E-371 | Response references KB and system prompt upgrade |
| 2 | Extension loads | Restart Kiro | No errors in Output → SDLC Agents |

### 7.3 Log Verification

| Log Entry | Level | Expected | Location |
|-----------|-------|----------|----------|
| Extension activated | INFO | Within 60s | Output > SDLC Agents |
| Version 1.53.11 loaded | INFO | On startup | Output > SDLC Agents |

### 7.4 Monitoring Dashboard

- [ ] No errors in Kiro Output channel
- [ ] Extension version visible

---

## 8. Rollback Plan

### 8.1 Rollback Flow

![Rollback Flow](diagrams/rollback-flow.png)

### 8.2 Rollback Decision Criteria

| Condition | Action |
|-----------|--------|
| Agent hallucinates or fails to search KB | Immediate rollback |
| Extension fails to load | Immediate rollback |
| Minor prompt wording issue | Hotfix |

### 8.3 Rollback Steps

| Step | Action | Command | Verification |
|------|--------|---------|-------------|
| 1 | Uninstall current VSIX | Extensions → Uninstall sdlc-agents-4-enterprise | Extension removed |
| 2 | Install previous VSIX | Install sdlc-agents-4-enterprise-1.53.10.vsix | Version shows 1.53.10 |
| 3 | Verify | Show Status | 1.53.10 active |

### 8.4 Rollback Time Estimate

| Action | Estimated Time |
|--------|---------------|
| Uninstall/install VSIX | 2 min |
| Verification | 2 min |
| **Total** | **4 min** |

---

## 9. Environment-Specific Notes

### 9.1 DEV

Local install via VSIX.

### 9.2 SIT/UAT/PROD

Manual VSIX distribution or marketplace update.

---

## 10. Appendix

### Contacts

| Role | Name | Contact |
|------|------|---------|
| DevOps Lead | DevOps Agent | - |
| Dev Lead | - | - |

### Related Tickets

| Ticket | Summary | Relationship |
|--------|---------|-------------|
| SA4E-371 | Upgrade system prompts anti-hallucination | Main ticket |
