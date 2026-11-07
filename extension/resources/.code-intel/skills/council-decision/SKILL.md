---
name: council-decision
description: "Multi-voice decision pattern with 4 personas (Pragmatist, Purist, Security-minded, User-advocate) debating architecture decisions. Produces ADR. Use when SA faces multiple valid options."
---

# council-decision

4 personas debate ambiguous decisions from different perspectives. Each votes. Output = ADR.

## Personas

| Persona | Lens | Asks |
|---------|------|------|
| Pragmatist 🚀 | Ship fast, MVP | "Can we ship this week?" |
| Purist 🏛️ | Clean architecture, SOLID | "Will this scale to 10x?" |
| Security-minded 🔒 | Risk-averse, threats | "What can an attacker exploit?" |
| User-advocate 👤 | UX, usability | "Will the user understand this?" |

## When to Trigger

- SA faces multiple valid architecture options in TDD
- DEV has multiple implementation approaches
- Technology selection (library A vs B)
- API design trade-offs (sync vs async, REST vs GraphQL)

## Vote Scale

| Vote | Score |
|------|-------|
| Prefer | +2 |
| Acceptable | 0 |
| Reject | -2 |

Tie-breaking: Security-minded decides. If still tied → escalate to user.

## ADR Output Template

```markdown
# ADR-{N}: {Title}

## Context
{Why does a decision need to be made?}

## Options
### Option A: {name} — Pros: {list} | Cons: {list}
### Option B: {name} — Pros: {list} | Cons: {list}

## Decision
Option {X} — because {council reasoning}.

## Council Votes
| Persona | Vote | Key Concern |
|---------|------|-------------|

## Consequences
Positive: {list} | Negative (accepted): {list} | Mitigations: {list}
```

## SM Integration

Invoke during Phase 3 when TDD lists alternatives:
```
invokeSubAgent(name: "sa-agent", prompt: "COUNCIL DECISION for {TICKET}. Options: {A, B, C}. Run 4-persona debate. Output ADR.")
```

## Constraints

- Always 4 personas — no add/remove
- Each persona MUST vote ALL options
- Max 4 options per debate
- ADR immutable once accepted (supersede with new ADR)
