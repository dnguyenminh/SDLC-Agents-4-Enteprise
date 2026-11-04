---
name: adversarial-review
description: "GAN-style adversarial review where Generator produces artifacts and Critic attacks them iteratively. Use during Phase 3 (TDD), Phase 6 (Code Review), or Security Review."
---

# adversarial-review

Generator produces artifact → Critic attacks → Generator improves → iterate until 0 Critical/High issues (max 3 iterations).

## When to Use

| Phase | Generator | Critic |
|-------|-----------|--------|
| Phase 3 (TDD) | sa-agent | qa-agent or security-agent |
| Phase 6 (Code) | dev-agent | dev-agent (fresh context) |
| Security | dev-agent | security-agent |

## Iteration Protocol

```
for iteration in 1..3:
  findings = Critic attacks artifact
  if findings.critical == 0 AND findings.high == 0: PASS, break
  Generator fixes all Critical/High issues

if max reached + still has Critical: ESCALATE to user
```

## Critic Prompt Template (Code)

```
ADVERSARIAL CODE REVIEW — Critic. Iteration {N}/3.
Attack this implementation. Find bugs, vulnerabilities, design flaws.
CHECK: input validation, error paths, resource leaks, race conditions, OWASP Top 10, logic errors, N+1 queries.
OUTPUT: | # | File:Line | Issue | Severity | PoC |
```

## Scoring

| Iterations Needed | Rating |
|-------------------|--------|
| 0 (nothing found) | ⭐⭐⭐⭐⭐ |
| 1 | ⭐⭐⭐⭐ |
| 2 | ⭐⭐⭐ |
| 3 (max) | ⭐⭐ |
| 3 + still issues | ⭐ (escalate) |

## Constraints

- Max 3 iterations (prevent infinite loops)
- Critic CANNOT modify artifact — only reports
- Generator MUST address ALL Critical findings
- Token budget check before each iteration
