# UI Design Gate — Agent Self-Check (MUST)

## Purpose

The extension ships a native design quality gate (30 rules derived from Impeccable, running in the extension host — no npx/external binary). Its purpose: AI agents ensure UI/design code is designed correctly, not just that it compiles. This rule makes running the gate part of every agent's definition of done for design artifacts.

## Trigger — Who and When

| Agent | Obligation |
|-------|-----------|
| Any agent creating or editing design artifacts | Run the gate BEFORE reporting done |

Design artifact extensions (trigger scope):

| Extensions |
|------------|
| .html · .htm · .css · .scss · .sass · .less · .vue · .svelte · .tsx · .jsx |

The obligation is **MUST** (USER-approved, SA4E-393 scope extension). Gate evidence is part of your completion report. Missing evidence = SM blocks Phase 5 (Implementation) / Phase 6 (Testing) completion.

## How to Invoke

Step 1 — discover (recommended, standard transport):

```
find_tools("design gate")
```

Step 2 — run the gate:

```
execute_dynamic_tool(
  toolName: "design_gate_run",
  arguments: { "mode": "both", "source_path": "<workspace-relative path, or omit = whole workspace>" }
)
```

⛔ CRITICAL — `arguments` MUST be an OBJECT, never a JSON string (same rule as `tool-usage-dynamic.md`).

Also available:

```
execute_dynamic_tool(toolName: "design_gate_list_rules", arguments: {}) // rule catalog (30 rules)
```

Notes:
- No new MCP server is needed — the tools are served from the extension's `LOCAL_TOOL_REGISTRY` (same transport as `jira_get_issue`).
- The gate runs locally in the extension host; no npx/binary dependency.

## Reading the Report

| Field | Meaning |
|-------|---------|
| runId | Required in your gate evidence |
| score | 0–1 (normalized) |
| pass | score ≥ threshold (default 0.8) |

| Result | Meaning | Action |
|--------|---------|--------|
| PASS (score ≥ 0.8) | Gate satisfied | Attach evidence to your completion report |
| FAIL | Findings found | Read findings (file:line, severity, message) |

Severity handling:

| Severity | Meaning | Action |
|----------|---------|--------|
| HIGH | Fails the file | MUST fix |
| MEDIUM | Fails the file | MUST fix |
| LOW | Triage only | Note and triage |

## FAIL Handling — Fix or Justify (no silent acceptance)

| Option | Requirement | Where recorded |
|--------|-------------|----------------|
| (a) Fix | Fix findings in the same commit; re-run the gate until PASS | Commit |
| (b) Justify | Written justification (lý do chấp nhận) for remaining HIGH/MEDIUM findings + follow-up ticket in the shared backlog (**SA4E-438**) | RUN-LOG / phase report |

⛔ A FAIL is reported truthfully — never mask, filter, or force-pass findings. Design debt must stay visible (file:line) so it can be fixed or consciously accepted.

All finding paths are workspace-relative (constraint C5) — copy them as-is into commits/tickets. Never rewrite to absolute paths.

## Evidence Required in Your Completion Report

| Evidence | Source |
|----------|--------|
| tool | "design_gate_run" |
| runId | report JSON |
| score | report JSON |
| pass/fail | report JSON |

## Blocker Rule (SM-enforced)

SM blocks Phase 5 (Implementation) and Phase 6 (Testing) completion when the phase report lacks gate evidence (tool name, runId, score, pass/fail). Phase reports must include the evidence table above whenever design artifacts were touched.

## Traceability

- Ticket: SA4E-393 (scope extension, USER-approved — RUN-LOG #43)
- FSD: documents/SA4E-393/FSD.md → Addendum 4 (FR-AG1, FR-AG2, BR-AG1…BR-AG10)
- Shared backlog for deferred fixes: SA4E-438
