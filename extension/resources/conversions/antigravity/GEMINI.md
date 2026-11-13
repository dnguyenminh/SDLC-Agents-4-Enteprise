# GEMINI.md — SDLC-Agents-4-Enterprise (Antigravity)

> Antigravity-native configuration. AGENTS.md (always-on, cross-tool) takes priority over this file.

## Subagent Architecture
This project uses 9 custom subagents defined in .agents/agents/<name>/agent.md.
The Scrum Master (sm-agent) is the **single entry point**: when a Jira ticket key
([A-Z]+-\d+) or an implement/review/test request arrives, delegate to sm-agent via the
invoke_subagent tool. SM then fans out to the other subagents — it NEVER writes documents
or code itself.

| Subagent | Role |
|----------|------|
| sm-agent | Pipeline coordinator / entry point |
| ba-agent | Business Analyst (BRD, FSD draft) |
| ta-agent | Technical Architect (FSD enrichment) |
| sa-agent | Solution Architect (TDD) |
| qa-agent | QA Engineer (STP, STC, TEST-REPORT) |
| dev-agent | Developer (code, tests, UG) |
| devops-agent | DevOps (DPG, RLN, CI/CD) |
| ui-agent | UI/UX Designer (wireframes, mockups) |
| security-agent | Security reviewer (assessments only) |

## Model & Execution
- Subagents inherit the session model (model: inherit).
- commandExecutionPolicy: sandbox — shell commands run sandboxed; user approval for sensitive ops.
- Skills live in skills/<name>/SKILL.md and are auto-discovered. Invoke a skill when its topic matches.

## Hooks
Lifecycle hooks are defined in .agents/hooks.json (PreToolUse, PostToolUse,
PreInvocation, PostInvocation, Stop) — they enforce drawio validation, KB-first search,
RUN-LOG maintenance, and version-sync checks.

## Communication
Respond to the user in **Vietnamese**; code, identifiers, and commit messages in **English**.

## UI Design Gate
Agents editing design artifacts (.html/.htm/.css/.scss/.sass/.less/.vue/.svelte/.tsx/.jsx) MUST run the design quality gate BEFORE reporting done — invoke `design_gate_run` via the extension's local tools (`find_tools("design gate")` → `execute_dynamic_tool(toolName: "design_gate_run", arguments: {...})`; arguments is an object, never a JSON string). Include gate evidence (tool, runId, score, pass/fail) in completion reports; FAIL → fix in the same change or justify (follow-up ticket SA4E-438); never mask findings. SM blocks Phase 5/6 completion without gate evidence — applies to dev-agent and ui-agent (self-check), qa-agent (Phase 6 verification), sm-agent (blocker). Full rule: AGENTS.md Key Rule 8; `.kiro/steering/ui-design-gate.md`.
