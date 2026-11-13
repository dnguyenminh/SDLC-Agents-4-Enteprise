# UI Design Gate — Agent Self-Check (MUST)

## Purpose

The extension ships a native design quality gate (30 rules derived from Impeccable, runs in the extension host — no npx/external binary). Its purpose: AI agents ensure UI/design code is designed correctly. Running the gate is part of every agent's definition of done for design artifacts.

## Trigger — Who and When

| Agent | Obligation |
|-------|-----------|
| Any agent creating or editing design artifacts | Run the gate BEFORE reporting done |

Design artifact extensions (trigger scope): `.html` `.htm` `.css` `.scss` `.sass` `.less` `.vue` `.svelte` `.tsx` `.jsx`

Obligation is **MUST** (USER-approved, SA4E-393 scope extension). Missing gate evidence = SM blocks Phase 5 (Implementation) / Phase 6 (Testing) completion.

## How to Invoke

```
find_tools("design gate")
execute_dynamic_tool(
  toolName: "design_gate_run",
  arguments: { "mode": "both", "source_path": "<workspace-relative path, or omit = whole workspace>" }
)
```

⛔ CRITICAL — `arguments` MUST be an OBJECT, never a JSON string (same rule as `tool-usage-dynamic.md`).

Also available: `execute_dynamic_tool(toolName: "design_gate_list_rules", arguments: {})` — rule catalog (30 rules).

Notes:
- No new MCP server needed — tools come from the extension's `LOCAL_TOOL_REGISTRY` (same transport as `jira_get_issue`).
- Gate runs locally in the extension host; no npx/binary dependency.

## Reading the Report

| Field | Meaning |
|-------|---------|
| runId | Required in your gate evidence |
| score | 0–1 (normalized) |
| pass | score ≥ threshold (default 0.8) |

Severity handling: HIGH/MEDIUM findings fail the file → MUST fix; LOW = triage only.

## FAIL Handling — Fix or Justify (no silent acceptance)

| Option | Requirement | Where recorded |
|--------|-------------|----------------|
| (a) Fix | Fix findings in the same commit; re-run the gate until PASS | Commit |
| (b) Justify | Written justification for remaining HIGH/MEDIUM findings + follow-up ticket in the shared backlog (**SA4E-438**) | RUN-LOG / phase report |

⛔ A FAIL is reported truthfully — never mask, filter, or force-pass findings. All finding paths are workspace-relative (constraint C5) — copy as-is into commits/tickets.

## Evidence Required in Your Completion Report

| Evidence | Source |
|----------|--------|
| tool | "design_gate_run" |
| runId | report JSON |
| score | report JSON |
| pass/fail | report JSON |

## Blocker Rule (SM-enforced)

SM blocks Phase 5 and Phase 6 completion when the phase report lacks gate evidence (tool name, runId, score, pass/fail).

Full policy: `.opencode/rules/sdlc/ui-design-gate.md` (source of truth).
