---
inclusion: manual
description: Jira workflow protocol for SDLC transitions. Activate when working with Jira tickets, transitions, or SDLC pipeline.
---

# Mandatory Jira Workflow Protocol

To ensure 100% compliance with the project's SDLC process, all agents MUST follow this protocol when interacting with Jira issues.

## 1. Source of Truth
- **Primary Workflow Reference:** `documents/workflows/MTO-workflows.md`
- You MUST read this file before performing any transition to understand the allowed paths, triggers, and responsible roles.

## 2. Dynamic Transition Resolution (NO HARDCODING)
- **NEVER** hardcode transition IDs (e.g., "11", "21").
- **ALWAYS** fetch available transitions using `mcp_atlassian_jira_get_transitions(issue_key: "{TICKET}")`.
- **RESOLVE** the transition ID by matching the name from `MTO-workflows.md` (e.g., "Review Docs", "implement", "Adjust Info").
- If the name doesn't match exactly, use fuzzy matching or ask the user for clarification.

## 3. Pre-Transition Checklist
Before executing any transition, you MUST:
1. **Verify Current Status:** Use `mcp_atlassian_jira_get_issue` to confirm the ticket is in the expected starting status.
2. **Verify Path:** Confirm the transition exists in `MTO-workflows.md` from the current status to the target status.
3. **Verify Prerequisites:** Ensure all artifacts required for the next status (e.g., BRD for Review Docs) are created and ingested into the Knowledge Base.

## 4. Role-Based Responsibility
- **SM Agent:** Orchestrates pipeline-level transitions (e.g., To Do → In Progress, In Review → QA Test, UAT → Ready for Prod).
- **BA/SA Agents:** Can transition to `DOCS REVIEW` or trigger `Adjust Info` / `Document Invalid` if requirements are found lacking.
- **DEV Agent:** Transitions to `IN PROGRESS` when starting code and `IN REVIEW` when submitting PR.
- **QA Agent:** Transitions to `UAT` when SIT passes.

## 5. Commenting Protocol
- Every transition MUST be accompanied by a Jira comment explaining:
  - What action was taken (e.g., "Phase 1: BRD completed").
  - References to generated artifacts (e.g., `file:///documents/MTO-5/BRD.md`).
  - Next steps or responsible agent.
