# Loop Constraints — Hard Guardrails

## Purpose

SM PHẢI đọc file này trước mỗi pipeline run (Step 0). Vi phạm bất kỳ constraint nào = **hard stop** + report user.

---

## Path Denylist

**KHÔNG ĐƯỢC edit/delete các files sau (bất kể agent nào yêu cầu):**

| Pattern | Reason |
|---------|--------|
| `.env`, `.env.*` | Secrets, credentials |
| `secrets/`, `credentials/`, `auth/` | Security-sensitive directories |
| `*.pem`, `*.key`, `*.p12` | Private keys |
| `production.yml`, `prod.conf` | Production configs |
| `jira.conf` (by sub-agents) | Only SM manages jira.conf |
| `.git/` | Git internals |

**Exceptions:**
- SM can read (not write) `.env` key names for documentation
- DEV agent can create new auth-related files (not modify existing)

---

## Execution Limits

| Limit | Value | On Breach |
|-------|-------|-----------|
| Fix attempts per document | **3** | Escalate to user — "Document X failed 3 times" |
| Feedback loop iterations (BA↔SA) | **5** | Hard stop — mark blocked, report remaining discrepancies |
| Sub-agent retries per phase | **2** | Stop phase — report failure to user |
| Consecutive phase failures | **3** | Circuit breaker OPEN (see circuit-breaker rules) |
| Total agent invocations per session | **30** | Warn at 25, hard stop at 30, report |

---

## Push & Merge Safety

| Rule | Enforcement |
|------|-------------|
| Never auto-merge to main/master | SM CANNOT invoke `git merge` to main without explicit user "merge approved" |
| Always branch per ticket | Branch name = `{TICKET}` key |
| Never push without user confirmation | Exception: L3 mode can push to feature branch (NOT main) |
| Never force push | `git push --force` is NEVER allowed |
| Never delete remote branches | Only user can delete branches |

---

## Data Safety

| Rule | Enforcement |
|------|-------------|
| Never delete STATUS.json without rebuild | If corrupted → rebuild from file scan, don't just delete |
| Never overwrite KB entries without versioning | Always ingest new version, don't delete old |
| Never truncate RUN-LOG.md | Append only — historical record |
| Never modify committed documents without version bump | BRD v1 → v2, not silent overwrite |

---

## Agent Invocation Safety

| Rule | Enforcement |
|------|-------------|
| Never invoke agent without prerequisite check | Quality gates are mandatory |
| Never skip verification after agent completes | Post-phase verification is mandatory |
| Never fabricate agent results | If agent not invoked → report "skipped", never "approved" |
| Never invoke same agent >2 times for same task | After 2 failures → escalate |
| **SM NEVER writes documents or code** | SM only reads (verify) + writes STATUS.json/RUN-LOG.md |
| **SM NEVER acts as another agent** | No "SM acting as BA/SA/QA/DEV/DevOps" — must use invokeSubAgent |
| **Each agent does ONLY its own job** | BA writes BRD/FSD, SA writes TDD, QA writes STP/STC, DEV writes code/UG, DevOps writes DPG/RLN |

---

## Budget Safety (when token tracking enabled)

| Threshold | Action |
|-----------|--------|
| 80% daily cap | Switch to report-only mode, notify user |
| 100% daily cap | Hard stop all agent invocations |
| Single invoke >100k tokens estimated | Warn before invoke |

---

## Violation Response

When a constraint is violated:

```
⛔ CONSTRAINT VIOLATION

Rule: {which rule}
Attempted by: {agent or SM action}
Context: {what was being done}
Action taken: HARD STOP

User: please advise how to proceed.
```

SM MUST NOT continue past a violation without user acknowledgment.
