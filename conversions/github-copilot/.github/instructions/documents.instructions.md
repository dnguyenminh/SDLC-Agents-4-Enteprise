---
name: 'Document Standards'
description: 'Rules for SDLC documents (BRD, FSD, TDD, STP, UG, DPG)'
applyTo: 'documents/**/*.md'
---

# Document Standards

## Structure
- All docs at `documents/{TICKET}/`
- Status tracked in `documents/{TICKET}/STATUS.json`
- Diagrams at `documents/{TICKET}/diagrams/` (draw.io only, NO Mermaid)

## SDLC Pipeline
BRD → FSD → TDD → STP/STC → Code → UG → Test → Deploy

## Document Requirements
- BRD: user stories (min 3), acceptance criteria, business-flow + use-case diagrams
- FSD: use cases (UC- IDs), business rules (BR- IDs), sequence + state diagrams
- TDD: architecture, API design, class design, architecture + component diagrams
- STP/STC: 6 test levels, RTM 100% coverage
- UG: quick start, config reference, troubleshooting, error codes
- DPG: deployment steps, rollback plan, deployment-flow diagram

## Diagram Index (MANDATORY)
Every document with diagrams must have a Diagram Index table.

## DOCX Export
Naming: `{DOC}-v{version}-{TICKET}.docx`
