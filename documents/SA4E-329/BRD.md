# Business Requirements Document (BRD)

## System — SA4E-329: Pi Model Routing and Fallback small to large

Ticket SA4E-329

Scope: Small model first, low confidence -> escalate to large. Map thinkingLevel to maxTokens + retry. Log routing decision.

User Stories: Model routing, Fallback escalation, Routing diagnostics.

Acceptance Criteria: phi-3 fail escalates to gpt-4o-mini with log, easy questions stay small.

Diagrams: use-case.png, business-flow.png
