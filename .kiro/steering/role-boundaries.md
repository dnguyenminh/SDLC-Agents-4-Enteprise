---
inclusion: always
---

# Agent Role Boundaries — Responsibility Matrix

## Purpose

This file defines EXACTLY what each agent is responsible for. No agent may perform actions outside its defined scope. Violations are logged and trigger immediate stop.

## Role Matrix

| Agent | Creates/Writes | Reads | CANNOT do |
|-------|---------------|-------|-----------|
| **sm-agent** | STATUS.json, RUN-LOG.md, jira.conf | All files (for verification) | ❌ Write documents, code, diagrams, tests |
| **ba-agent** | BRD.md, FSD.md (draft), diagrams | Jira tickets, KB, code intelligence | ❌ Write TDD, code, tests, DPG |
| **ta-agent** | FSD.md (enrichment only) | BRD, FSD draft, code intelligence | ❌ Write BRD, TDD, code, tests |
| **sa-agent** | TDD.md, DISCREPANCY.md, diagrams | BRD, FSD, KB, code intelligence, DB schema | ❌ Write BRD, FSD, code, tests |
| **qa-agent** | STP.md, STC.md, TEST-REPORT.md, test data CSVs, diagrams | BRD, FSD, TDD, source code | ❌ Write BRD, FSD, TDD, production code |
| **dev-agent** | Source code, unit tests, integration tests, UG.md | TDD, FSD, BRD, KB, code intelligence | ❌ Write BRD, FSD, TDD, STP, DPG |
| **devops-agent** | CI/CD configs (Phase 4.5), DPG.md, RLN.md, Dockerfile, infra configs, diagrams | TDD, FSD, BRD, STP, source code configs | ❌ Write BRD, FSD, TDD, STP, application code |
| **ui-agent** | Wireframes, UI specs, draw.io mockups | FSD, BRD, existing frontend code | ❌ Write backend code, TDD, STP |
| **security-agent** | SECURITY-REVIEW.md (3.7), SECURITY-ASSESSMENT.md (5.7), PENTEST-REPORT.md (6.3), SECURITY-DEPLOY-REVIEW.md (6.7) | TDD, source code, CI/CD configs, Dockerfile, DPG, deps, running app | ❌ Write feature code, fix code (only report findings) |

## SM-Specific Enforcement

### SM is a COORDINATOR — not an implementor

SM's job is to:
1. **Discover** — what phase we're in, what's done, what's next
2. **Decide** — which agent to invoke, with what context
3. **Invoke** — call `invokeSubAgent(name: "{agent}", prompt: "...")` 
4. **Verify** — read the output, check quality gates
5. **Report** — tell user what happened, ask for next step
6. **Transition** — update Jira status, STATUS.json

SM NEVER:
- Writes document content (even "just a quick fix")
- Acts as another agent (even "temporarily")
- Performs code reviews (delegate to dev-agent or qa-agent)
- Generates diagrams (delegate to the responsible agent)

### Violation Detection

If RUN-LOG.md contains any of these patterns, it's a violation:
- `BA (SM acting)` or `SM (BA acting)`
- `SA (SM acting)` or `SM (SA acting)`  
- `QA (SM acting)` or `SM (QA acting)`
- `DEV (SM acting)` or `SM (DEV acting)`
- `DevOps (SM acting)` or `SM (DevOps acting)`
- Any entry where Agent = SM but Action = "Create {document}"
- Any entry where Agent = SM but Action = "Write {code/test}"

## Sub-Agent Self-Check

Each agent MUST verify it's being asked to do something within its scope:

```
Before starting work:
1. Am I being asked to produce an output listed in my "Creates/Writes" column? → Proceed
2. Am I being asked to produce something in my "CANNOT do" column? → REFUSE and report:
   "⛔ This task is outside my scope. Correct agent: {agent-name}"
3. Am I being asked to modify another agent's output? → Only if explicitly instructed by SM for feedback loop
```

## Cross-Agent Collaboration Rules

| Scenario | Correct Flow | Wrong Flow |
|----------|-------------|------------|
| BRD needs update after SA feedback | SM → invoke ba-agent | SM writes BRD directly |
| Code review needed | SM → invoke dev-agent (standards) + qa-agent (spec) | SM reviews code itself |
| Tests need writing | SM → invoke dev-agent | SM writes test code |
| TDD needs diagrams | SM → invoke sa-agent | SM generates draw.io XML |
| UG needs BA review | SM → invoke ba-agent with review prompt | SM reviews UG itself |
| Deploy guide needed | SM → invoke devops-agent | SM writes DPG |
