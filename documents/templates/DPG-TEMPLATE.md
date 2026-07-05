# Deployment Guide (DPG)

## {SYSTEM_NAME} — {TICKET_KEY}: {TICKET_SUMMARY}

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | {TICKET_KEY} |
| Title | {TICKET_SUMMARY} |
| Author | DevOps Agent |
| Version | 1.0 |
| Date | {CURRENT_DATE} |
| Status | Draft |
| Related TDD | TDD-v{VERSION}-{TICKET-KEY}.docx |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | {CURRENT_DATE} | DevOps Agent | Initiate document — auto-generated from TDD and project context |

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

{Brief description of the feature being deployed — from BRD.}

### 1.2 Deployment Scope

| Item | Type | Description |
|------|------|-------------|
| {Service/Component} | {New/Modified} | {What changed} |
| {Database} | {Migration/New Table} | {What changed} |
| {Configuration} | {New/Modified} | {What changed} |

### 1.3 Target Environments

| Environment | URL | Deploy Order | Approval Required |
|-------------|-----|-------------|-------------------|
| DEV | {URL} | 1st | No |
| SIT | {URL} | 2nd | No |
| UAT | {URL} | 3rd | QA Sign-off |
| PROD | {URL} | 4th | PM + Business Sign-off |

---

## 2. Prerequisites

### 2.1 Infrastructure

| Requirement | Status | Notes |
|-------------|--------|-------|
| {Server/Container available} | {Ready/Pending} | {Notes} |
| {Network access configured} | {Ready/Pending} | {Notes} |
| {SSL certificate} | {Ready/Pending} | {Notes} |

### 2.2 Software Dependencies

| Dependency | Version | Status |
|-----------|---------|--------|
| {Runtime — JDK/Node.js} | {version} | {Installed/Pending} |
| {Database} | {version} | {Available/Pending} |

### 2.3 Access Requirements

| Access | Type | Who Needs It |
|--------|------|-------------|
| {SSH to server} | {Key-based} | {DevOps team} |
| {Database admin} | {Credentials} | {DBA} |
| {CI/CD pipeline} | {Service account} | {Automated} |

### 2.4 Backup Requirements

- [ ] Database backup completed before deployment
- [ ] Application backup (previous version artifact saved)
- [ ] Configuration backup

---

## 3. Pre-Deployment Checklist

| # | Item | Responsible | Status |
|---|------|-------------|--------|
| 1 | Code merged to release branch | Developer | ☐ |
| 2 | All unit tests passed | Developer | ☐ |
| 3 | All integration tests passed | QA | ☐ |
| 4 | SIT/UAT sign-off obtained | QA + BA | ☐ |
| 5 | Database backup completed | DBA | ☐ |
| 6 | Configuration files prepared | DevOps | ☐ |
| 7 | Feature flags configured | Developer | ☐ |
| 8 | Monitoring/alerting configured | DevOps | ☐ |
| 9 | Rollback plan reviewed | Team | ☐ |
| 10 | Deployment window confirmed | PM | ☐ |

---

## 4. Database Migration

### 4.1 Migration Scripts

| Order | Script | Description | Estimated Time |
|-------|--------|-------------|----------------|
| 1 | {V1__script_name.sql} | {Description} | {time} |

### 4.2 Execution Steps

```bash
# Step 1: Backup database
{backup command}

# Step 2: Run migration
{migration command}

# Step 3: Verify migration
{verification query}
```

### 4.3 Verification Queries

```sql
-- Verify table created/modified
{SELECT query to verify}

-- Verify data integrity
{COUNT or validation query}
```

### 4.4 Rollback Scripts

```sql
-- Rollback migration
{rollback SQL}
```

---

## 5. Application Deployment

### 5.1 Deployment Flow

![Deployment Flow](diagrams/deployment-flow.png)

### 5.2 Deployment Steps

| Step | Action | Command | Verification |
|------|--------|---------|-------------|
| 1 | {Stop existing service} | `{command}` | {How to verify} |
| 2 | {Deploy new artifact} | `{command}` | {How to verify} |
| 3 | {Update configuration} | `{command}` | {How to verify} |
| 4 | {Start service} | `{command}` | {How to verify} |
| 5 | {Health check} | `{command}` | {Expected response} |

### 5.3 Docker Deployment (if applicable)

```bash
# Pull new image
docker pull {registry}/{image}:{tag}

# Stop existing container
docker stop {container_name}

# Start new container
docker run -d --name {container_name} \
  -p {host_port}:{container_port} \
  -e {ENV_VAR}={value} \
  {registry}/{image}:{tag}

# Verify
docker logs {container_name} --tail 50
```

---

## 6. Configuration Changes

### 6.1 New Environment Variables

| Variable | Description | DEV | SIT | UAT | PROD |
|----------|-------------|-----|-----|-----|------|
| {VAR_NAME} | {Description} | {value} | {value} | {value} | {PLACEHOLDER} |

### 6.2 Application Properties Changes

| Property | Old Value | New Value | File |
|----------|-----------|-----------|------|
| {property.name} | {old or N/A} | {new value} | {application.yml} |

### 6.3 Feature Flags

| Flag | DEV | SIT | UAT | PROD |
|------|-----|-----|-----|------|
| {flag.name} | {true} | {true} | {true} | {false — enable after verification} |

---

## 7. Post-Deployment Verification

### 7.1 Health Checks

| Check | Endpoint/Command | Expected Result | Timeout |
|-------|-----------------|-----------------|---------|
| {Application health} | `GET /actuator/health` | 200 OK, status: UP | 30s |
| {Database connectivity} | {query} | {result} | 10s |

### 7.2 Smoke Tests

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| 1 | {Key happy path scenario} | {Brief steps} | {Expected outcome} |
| 2 | {Another key scenario} | {Brief steps} | {Expected outcome} |

### 7.3 Log Verification

| Log Entry | Level | Expected | Location |
|-----------|-------|----------|----------|
| {Application started} | INFO | Within 60s of start | {log file/path} |
| {Feature initialized} | INFO | After startup | {log file/path} |

### 7.4 Monitoring Dashboard

- [ ] Application metrics visible in dashboard
- [ ] Error rate within normal range
- [ ] Response time within SLA
- [ ] No unexpected alerts triggered

---

## 8. Rollback Plan

### 8.1 Rollback Flow

![Rollback Flow](diagrams/rollback-flow.png)

### 8.2 Rollback Decision Criteria

| Condition | Action |
|-----------|--------|
| {Critical defect found in production} | Immediate rollback |
| {Performance degradation > 50%} | Immediate rollback |
| {Data integrity issue} | Immediate rollback + DBA investigation |
| {Minor UI issue} | Hotfix — no rollback |

### 8.3 Rollback Steps

| Step | Action | Command | Verification |
|------|--------|---------|-------------|
| 1 | {Stop new version} | `{command}` | {verify} |
| 2 | {Rollback database} | `{command}` | {verify} |
| 3 | {Deploy previous version} | `{command}` | {verify} |
| 4 | {Restore configuration} | `{command}` | {verify} |
| 5 | {Verify rollback} | `{command}` | {verify} |

### 8.4 Rollback Time Estimate

| Action | Estimated Time |
|--------|---------------|
| Database rollback | {minutes} |
| Application rollback | {minutes} |
| Verification | {minutes} |
| **Total** | **{minutes}** |

---

## 9. Environment-Specific Notes

### 9.1 DEV

{Any DEV-specific deployment notes.}

### 9.2 SIT

{Any SIT-specific deployment notes.}

### 9.3 UAT

{Any UAT-specific deployment notes.}

### 9.4 PROD

- **Deployment Window:** {Day, Time range}
- **Approval Required From:** {Names/Roles}
- **Communication Plan:** {Who to notify before/after deployment}
- **On-Call Contact:** {Name, Phone}

---

## 10. Appendix

### Contacts

| Role | Name | Contact |
|------|------|---------|
| {DevOps Lead} | {Name} | {Email/Phone} |
| {DBA} | {Name} | {Email/Phone} |
| {On-Call Dev} | {Name} | {Email/Phone} |

### Related Tickets

| Ticket | Summary | Relationship |
|--------|---------|-------------|
| {TICKET_KEY} | {Summary} | Main ticket |
