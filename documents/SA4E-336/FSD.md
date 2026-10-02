# Functional Specification Document (FSD)

## SA4E-336 — Upgrade pi-coding-agent 0.80.10 → 0.99.1 + native PowerShell tool

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-336 |
| Title | Upgrade pi-coding-agent 0.80.10 → 0.99.1 + native PowerShell tool |
| Author | BA Agent / TA (enriched) |
| Version | 2.0 |
| Date | 2026-09-30 |
| Status | Draft (TA-enriched) |
| Related BRD | documents/SA4E-336/BRD.md |
| Reference | documents/UPGRADE-pi-0.99-powershell-tool.md |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-30 | BA Agent | Initiate document — auto-generated from Jira ticket SA4E-336 |
| 2.0 | 2026-09-30 | TA Agent | Technical enrichment: API contracts, pseudocode, integration specs, NFR quantification |
| 2.1 | 2026-10-01 | BA Agent | Fix DISC-1: §3.3.4 now references `ToolApprovalClassifier.DANGEROUS_TOOL_PATTERNS` instead of local `DANGEROUS_TOOLS` constant |

---

## 1. Introduction

### 1.1 Purpose

This FSD specifies the functional requirements for upgrading `@earendil-works/pi-coding-agent` from `0.80.10` to `0.99.1` to enable the native `powershell` tool on Windows, replacing the fragile Git-Bash workaround (`shellPath` pin + `normalizeBashCommandPaths` spawnHook). The upgrade ensures path commands (`c:\...`, `c:/...`) execute natively without dialect translation.

### 1.2 Scope

**In Scope:**
- Bump all `@earendil-works/*` packages to `0.99.1` in lockstep
- Wire `createPowerShellTool` on `win32`, keep `createBashTool` on non-Windows
- Remove Git-Bash `shellPath` pin and `normalizeBashCommandPaths` spawnHook for Windows
- Update workflow gates (`READ_ONLY_TOOLS`, `DANGEROUS_TOOLS`) to classify `powershell` like `bash`
- Update system prompt to PowerShell dialect on Windows
- Update session tool loadout and `classifyTool` mapping
- Add/update verification tests

**Out of Scope:**
- Node engine upgrade (unless `0.99.1` requires Node ≥22 — confirm before proceeding)
- Non-Windows platform changes beyond keeping `bash`
- Functional changes to Pi SDK APIs beyond compatibility fixes
- Changes to `backend/` (Hono) or `knowledge/` modules — this is extension-only

### 1.3 Definitions & Acronyms

| Term | Definition |
|------|------------|
| `pi-coding-agent` | Earendil Works coding agent SDK — provides `createBashTool`, `createPowerShellTool`, `createReadTool`, etc. |
| `createPowerShellTool` | SDK factory (0.99.1+) creating native PowerShell tool; auto-resolves `pwsh.exe` → Windows PowerShell fallback |
| `createBashTool` | SDK factory creating Bash tool with `shellPath`/`spawnHook` options |
| Git-Bash workaround | Previous `shellPath` pin + `normalizeBashCommandPaths` spawnHook that translated `c:\` → `/c/` |
| `ToolApprovalGate` | Class controlling tool approval; `getDangerousTools()` returns dangerous tool names |
| `StreamProtocolAdapter` | Class adapting agent events for stream protocol; `classifyTool()` maps tool names to categories |
| `ToolName` | Union type: `"read"|"bash"|"powershell"|"edit"|"write"|"grep"|"find"|"ls"` (0.99.1) |
| pwsh | PowerShell Core (cross-platform); falls back to Windows PowerShell (5.1) if not found |

### 1.4 References

| Document | Location |
|----------|----------|
| BRD | `documents/SA4E-336/BRD.md` |
| Upgrade Guide | `documents/UPGRADE-pi-0.99-powershell-tool.md` |
| Code Intelligence | `.analysis/code-intelligence/project-structure.md` |
| Extension Knowledge | `.analysis/code-intelligence/modules/extension-knowledge.md` |
| FSD Template | `documents/templates/FSD-TEMPLATE.md` |

---

## 2. System Overview

### 2.1 System Context Diagram

```xml
<mxfile>
  <diagram name="Context Diagram">
    <mxGraphModel>
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        <mxCell id="actor" value="Developer (Windows)" style="shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top;html=1;outlineConnect=0;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1">
          <mxGeometry x="80" y="200" width="30" height="40" as="geometry"/>
        </mxCell>
        <mxCell id="ext" value="Extension (VS Code/Kiro)" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="1">
          <mxGeometry x="200" y="180" width="180" height="60" as="geometry"/>
        </mxCell>
        <mxCell id="pi" value="pi-coding-agent 0.99.1&#xa;(createPowerShellTool / createBashTool)" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;" vertex="1" parent="1">
          <mxGeometry x="450" y="160" width="220" height="60" as="geometry"/>
        </mxCell>
        <mxCell id="pwsh" value="pwsh.exe / Windows PowerShell" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;" vertex="1" parent="1">
          <mxGeometry x="740" y="160" width="180" height="60" as="geometry"/>
        </mxCell>
        <mxCell id="e1" value="executes commands" style="edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;" edge="1" source="ext" target="pi" parent="1">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="e2" value="runs PowerShell" style="edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;" edge="1" source="pi" target="pwsh" parent="1">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="e3" value="invokes tool" style="edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;" edge="1" source="actor" target="ext" parent="1">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
```

### 2.2 System Architecture

The extension (`extension/src/`) is a VS Code/Kiro extension using LangGraph orchestration. The upgrade affects:

| Component | File | Role |
|-----------|------|------|
| `pi-coding-tools.ts` | `extension/src/pi-workflow/` | `createWorkspaceTools()` — OS-aware shell tool selection |
| `pi-workflow-gate.ts` | `extension/src/pi-workflow/` | `ToolApprovalGate` — read-only vs dangerous classification |
| `turn-budget-guard.ts` | `extension/src/pi-workflow/` | `buildFailureSteerCorrection` — shell-aware error messages |
| `StreamProtocolAdapter.ts` | `extension/src/chat/engine/` | `classifyTool()` — tool name → category mapping |
| `pi-agent-session-host.ts` | `extension/src/pi-workflow/` | Session tool loadout allowlist |
| `pi-provider.ts` | `extension/src/pi-workflow/` | `Agent` ctor, event types, `BeforeToolCallContext` |
| `pi-event-mapper.ts` | `extension/src/pi-workflow/` | `mapAgentEvent`, `ToolEventTracker` |

### 2.3 Upgrade Architecture Diagram

```xml
<mxfile>
  <diagram name="Upgrade Flow">
    <mxGraphModel>
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        <mxCell id="s1" value="1. Bump dependencies" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1">
          <mxGeometry x="200" y="40" width="200" height="40" as="geometry"/>
        </mxCell>
        <mxCell id="s2" value="2. TSC compile audit" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;" vertex="1" parent="1">
          <mxGeometry x="200" y="110" width="200" height="40" as="geometry"/>
        </mxCell>
        <mxCell id="s3" value="3. Wire PowerShell tool" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="1">
          <mxGeometry x="200" y="180" width="200" height="40" as="geometry"/>
        </mxCell>
        <mxCell id="s4" value="4. Update workflow gates" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#e1d5e7;strokeColor=#9673a6;" vertex="1" parent="1">
          <mxGeometry x="200" y="250" width="200" height="40" as="geometry"/>
        </mxCell>
        <mxCell id="s5" value="5. Update system prompt" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;" vertex="1" parent="1">
          <mxGeometry x="200" y="320" width="200" height="40" as="geometry"/>
        </mxCell>
        <mxCell id="s6" value="6. Update session loadout" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1">
          <mxGeometry x="200" y="390" width="200" height="40" as="geometry"/>
        </mxCell>
        <mxCell id="s7" value="7. Update classifyTool" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;" vertex="1" parent="1">
          <mxGeometry x="200" y="460" width="200" height="40" as="geometry"/>
        </mxCell>
        <mxCell id="s8" value="8. Tests + UAT" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="1">
          <mxGeometry x="200" y="530" width="200" height="40" as="geometry"/>
        </mxCell>
        <mxCell id="e1" style="edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;" edge="1" source="s1" target="s2" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>
        <mxCell id="e2" style="edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;" edge="1" source="s2" target="s3" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>
        <mxCell id="e3" style="edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;" edge="1" source="s3" target="s4" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>
        <mxCell id="e4" style="edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;" edge="1" source="s4" target="s5" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>
        <mxCell id="e5" style="edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;" edge="1" source="s5" target="s6" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>
        <mxCell id="e6" style="edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;" edge="1" source="s6" target="s7" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>
        <mxCell id="e7" style="edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;" edge="1" source="s7" target="s8" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
```

---

## 3. Functional Requirements

### 3.1 Feature: Dependency Upgrade — pi-coding-agent 0.80.10 → 0.99.1

**Source:** BRD Story 1 [Implements: PREQ-SA4E-336-01]

#### 3.1.1 Description

Upgrade all `@earendil-works/*` packages to `0.99.1` in lockstep across `root/package.json` and `extension/package.json`. Ensure single resolved version (no duplicate trees). Verify TypeScript compilation against 0.99.1 `.d.ts`.

#### 3.1.2 Use Case

**Use Case ID:** UC-001
**Actor:** Developer (build system / npm)
**Preconditions:** Workspace on upgrade branch; Node engine verified (see BRD assumption)
**Postconditions:** All `@earendil-works/*` packages at `0.99.1`; `npm ls` shows single version; `tsc --noEmit` passes

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Developer | — | Runs dependency bump script / manually updates `package.json` |
| 2 | npm | — | Resolves all `@earendil-works/*` to `0.99.1` |
| 3 | Build | npm / tsc | `npm install` then `npx tsc --noEmit -p extension/tsconfig.json` |
| 4 | Developer | — | Fixes any type errors against 0.99.1 `.d.ts` (no `as any`) |
| 5 | Build | npm | `npm ls @earendil-works/pi-agent-core` → single version |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-1 | `npm ls` shows duplicate `pi-agent-core` | Run `npm dedupe` or adjust `overrides` in root `package.json`; re-run `npm install`; re-verify single version |
| AF-2 | TSC error: missing type definition | Fetch 0.99.1 `.d.ts` from unpkg; update call site; do NOT use `as any` |
| AF-3 | Node engine incompatibility | Check `engines.node` in 0.99.1 `package.json`; if ≥22 and current is 20, coordinate Node bump (out of scope, escalate) |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-1 | `npm install` fails | Check lockfile consistency; delete `node_modules` + `package-lock.json`; retry; if persistent, check registry access |
| EF-2 | TSC error: breaking API change in 0.99.1 | Review 0.99.1 `.d.ts` for changed signatures; update call site per upgrade guide §2; if API removed, escalate to SA for design change |
| EF-3 | Version mismatch after dedupe | Audit `package.json` declarations in both root and extension; ensure single source of truth |

#### 3.1.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-01 | All `@earendil-works/*` packages must be at the same version (0.99.1) | BRD Story 1 |
| BR-02 | No `as any` shortcuts to suppress type errors | BRD Story 1 |
| BR-03 | Version must be semver compatible with current Node engine | BRD Story 1 |
| BR-04 | Single resolved `pi-agent-core` instance (no duplicates) | BRD Story 1 |

#### 3.1.4 Data Specifications

**Input Data:**

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| packageName | string | Yes | Must match `@earendil-works/*` pattern | NPM package name |
| currentVersion | semver | Yes | `0.80.10` | Installed version |
| targetVersion | semver | Yes | `0.99.1` | Desired version |

**Output Data:**

| Field | Type | Description |
|-------|------|-------------|
| resolvedVersion | string | Single resolved version from `npm ls` |
| tscResult | "pass" \| "fail" | TypeScript compilation result |
| duplicateCount | number | Number of duplicate `pi-agent-core` instances (must be 0) |

---

### 3.2 Feature: Native PowerShell Tool on Windows

**Source:** BRD Story 2 [Implements: PREQ-SA4E-336-02]

#### 3.2.1 Description

Replace `createBashTool` with OS-aware shell selection in `createWorkspaceTools()`. On `win32`, use `createPowerShellTool(workspaceRoot)`. On non-Windows, keep `createBashTool(workspaceRoot)`. Remove Git-Bash `shellPath` pin and `normalizeBashCommandPaths` spawnHook for Windows paths.

#### 3.2.2 Use Case

**Use Case ID:** UC-002
**Actor:** Developer (system)
**Preconditions:** `process.platform === 'win32'`; `pi-coding-agent@0.99.1` installed
**Postconditions:** `createWorkspaceTools()` returns tool named `"powershell"` on Windows; `"bash"` on non-Windows

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | System | `pi-coding-tools.ts` | `createWorkspaceTools()` checks `process.platform` |
| 2 | System | `pi-coding-tools.ts` | On `win32`: `m.createPowerShellTool(workspaceRoot)` |
| 3 | System | `pi-coding-tools.ts` | On non-win32: `m.createBashTool(workspaceRoot)` |
| 4 | System | `pi-coding-tools.ts` | Core tools: read, write, edit, shellTool, grep, find, ls |
| 5 | System | PowerShell | Executes command with `c:\...` or `c:/...` paths natively |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-1 | `pwsh.exe` not found | Fallback to Windows PowerShell (5.1); log warning |
| AF-2 | PowerShell tool creation fails | Fallback to `createBashTool` with Git-Bash workaround; log error; surface to user |
| AF-3 | Non-Windows platform | Use `createBashTool` as before (no change) |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-1 | `createPowerShellTool` throws | Catch error; log with `Pino`; fallback to bash with warning; do not crash |
| EF-2 | PowerShell command fails (exit code ≠ 0) | Return error result to agent loop; agent decides retry or steer |
| EF-3 | Path command with invalid drive letter | PowerShell-native error; surface to user; no translation attempted |

#### 3.2.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-05 | On `win32`, shell tool name must be `"powershell"` | BRD Story 2 |
| BR-06 | On non-win32, shell tool name must be `"bash"` | BRD Story 2 |
| BR-07 | No `shellPath` option passed to `createPowerShellTool` | BRD Story 2 (0.99.1 self-resolves pwsh.exe) |
| BR-08 | PowerShell tool must use `powershellToolSystemPromptContribution` | Upgrade Guide §3a |
| BR-09 | Git-Bash `resolveGitBashPath` and `normalizeBashCommandPaths` retired for Windows | BRD Story 2 |

#### 3.2.4 Pseudocode — OS-Aware Shell Tool Selection

```typescript
// extension/src/pi-workflow/pi-coding-tools.ts — createWorkspaceTools
// [Implements: PREQ-SA4E-336-02]

import * as m from '@earendil-works/pi-coding-agent';

export function createWorkspaceTools(workspaceRoot: string): AgentTool[] {
    const isWin = process.platform === 'win32';

    // OS-aware shell tool selection
    const shellTool: AgentTool | null = isWin
        ? createPowerShellToolSafe(workspaceRoot)
        : m.createBashTool(workspaceRoot);

    const coreTools = [
        m.createReadTool(workspaceRoot),
        m.createWriteTool(workspaceRoot),
        m.createEditTool(workspaceRoot),
        shellTool,
        m.createGrepTool(workspaceRoot),
        m.createFindTool(workspaceRoot),
        m.createLsTool(workspaceRoot),
    ].filter(Boolean) as AgentTool[];

    return coreTools;
}

/**
 * Safely create PowerShell tool with fallback to bash on failure.
 * Handles pwsh.exe not found → Windows PowerShell fallback → bash fallback.
 */
function createPowerShellToolSafe(workspaceRoot: string): AgentTool | null {
    try {
        const m = require('@earendil-works/pi-coding-agent');
        if (typeof m.createPowerShellTool !== 'function') {
            logger.warn('createPowerShellTool not available, falling back to bash');
            return m.createBashTool(workspaceRoot);
        }
        // 0.99.1: no shellPath option — self-resolves pwsh.exe → Windows PowerShell
        return m.createPowerShellTool(workspaceRoot);
    } catch (err) {
        logger.error({ err }, 'createPowerShellTool failed, falling back to bash');
        const m = require('@earendil-works/pi-coding-agent');
        return m.createBashTool(workspaceRoot);
    }
}
```

#### 3.2.5 API Contract (Functional View)

**Function:** `createWorkspaceTools(workspaceRoot: string): AgentTool[]`
**Purpose:** Create workspace tools with OS-aware shell tool selection

**Input Parameters:**

| Parameter | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| workspaceRoot | string | Yes | Must be absolute path | Root directory for tool operations |

**Output Data:**

| Field | Type | Description |
|-------|------|-------------|
| tools | AgentTool[] | Array of tools including shell tool (name: "powershell" on win32, "bash" otherwise) |
| shellTool.name | string | `"powershell"` on win32, `"bash"` on non-win32 |

**Business Error Scenarios:**

| Scenario | User Message | Trigger Condition |
|----------|-------------|-------------------|
| PowerShell tool unavailable | "Shell tool unavailable; using Bash fallback" | `createPowerShellTool` throws or undefined |
| Invalid workspace root | "Invalid workspace root" | `workspaceRoot` not absolute or not exist |

---

### 3.3 Feature: Workflow Gate & Classification Update

**Source:** BRD Story 3 [Implements: PREQ-SA4E-336-03]

#### 3.3.1 Description

Update `pi-workflow-gate.ts` `READ_ONLY_TOOLS` to include `powershell` alongside `bash`. Update `ToolApprovalClassifier.ts` `DANGEROUS_TOOL_PATTERNS` to include `powershell` destructive patterns (canonical source — `pi-workflow-gate.ts` imports `requiresApproval` from there). Update `turn-budget-guard.ts` `buildFailureSteerCorrection` to be shell-aware. Update `StreamProtocolAdapter.classifyTool` to map `powershell` → `shell`. Update session tool loadout in `pi-agent-session-host.ts`.

#### 3.3.2 Use Case

**Use Case ID:** UC-003
**Actor:** System (workflow gate / agent loop)
**Preconditions:** `powershell` tool name present in tool loadout
**Postconditions:** `powershell` classified like `bash`: read-only auto-approved, destructive gated

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Agent | `pi-workflow-gate.ts` | Tool call to `powershell` received |
| 2 | System | `pi-workflow-gate.ts` | `READ_ONLY_TOOLS` check: `powershell` in set → auto-approve |
| 3 | System | `pi-workflow-gate.ts` | `DANGEROUS_TOOLS` check: destructive PS command → require approval |
| 4 | System | `StreamProtocolAdapter.ts` | `classifyTool("powershell")` → `"shell"` |
| 5 | System | `turn-budget-guard.ts` | `buildFailureSteerCorrection` — shell-aware message |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-1 | `powershell` not in `READ_ONLY_TOOLS` | Auto-approval bypassed; prompt user for approval even for read-only ops |
| AF-2 | Destructive command not in `DANGEROUS_TOOLS` | Destructive PS command auto-approved — security risk! |
| AF-3 | `classifyTool` returns unknown | Default to `"shell"` category; log warning |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-1 | `ToolApprovalGate` throws | Log error; default to require approval; surface to user |
| EF-2 | `classifyTool` receives unknown tool name | Return `"shell"` as default; log warning with tool name |

#### 3.3.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-10 | `READ_ONLY_TOOLS` must include `powershell` (same as `bash`) | BRD Story 3 |
| BR-11 | `DANGEROUS_TOOLS` must include `powershell` for destructive commands | BRD Story 3 |
| BR-12 | `classifyTool("powershell")` must return `"shell"` | BRD Story 3 |
| BR-13 | `buildFailureSteerCorrection` must be shell-aware (PowerShell vs bash) | BRD Story 3 |
| BR-14 | Session tool loadout must include `powershell` on win32 | BRD Story 3 |

#### 3.3.4 Pseudocode — Workflow Gate Classification

```typescript
// extension/src/pi-workflow/pi-workflow-gate.ts — ToolApprovalGate
// [Implements: PREQ-SA4E-336-03]

// Updated constants
const READ_ONLY_TOOLS: ReadonlySet<string> = new Set(['read', 'grep', 'find', 'ls', 'powershell']);

// NOTE: DANGEROUS_TOOL_PATTERNS is NOT defined locally in pi-workflow-gate.ts.
// It is imported from ToolApprovalClassifier.ts which owns the canonical
// dangerous tool pattern definitions. pi-workflow-gate.ts imports
// `requiresApproval` from ToolApprovalClassifier.
import { requiresApproval, DANGEROUS_TOOL_PATTERNS } from '../chat/engine/ToolApprovalClassifier.js';

/**
 * Classify a tool call for approval.
 * Returns 'auto-approve' | 'require-approval' | 'deny'
 */
function classifyToolCall(toolName: string, args: Record<string, unknown>): ApprovalDecision {
    // Step 1: Check dangerous patterns in PowerShell commands
    // Uses ToolApprovalClassifier.DANGEROUS_TOOL_PATTERNS (canonical source)
    if (toolName === 'powershell') {
        const command = String(args.command ?? '');
        const isDestructive = DANGEROUS_TOOL_PATTERNS.some(p => p.test(command));
        if (isDestructive) return 'require-approval';
        if (READ_ONLY_TOOLS.has(toolName)) return 'auto-approve';
    }

    // Step 2: Standard read-only check
    if (READ_ONLY_TOOLS.has(toolName)) return 'auto-approve';

    // Step 3: Dangerous tools require approval
    // Delegates to ToolApprovalClassifier.requiresApproval for canonical check
    if (requiresApproval(toolName)) return 'require-approval';

    // Step 4: Default — require approval for unknown tools
    return 'require-approval';
}
```

#### 3.3.5 Pseudocode — Shell-Aware Failure Correction

```typescript
// extension/src/pi-workflow/turn-budget-guard.ts — buildFailureSteerCorrection
// [Implements: PREQ-SA4E-336-03]

function buildFailureSteerCorrection(toolName: string, error: string): string {
    // Step 1: Determine shell dialect
    const isPowerShell = toolName === 'powershell';

    // Step 2: Build shell-appropriate guidance
    if (isPowerShell) {
        return `PowerShell command failed: ${error}
Use PowerShell cmdlets: Get-ChildItem (ls), Get-Content (cat), Test-Path, Invoke-Item.
Paths work as-is: c:\\... or c:/...`;
    }

    // Step 3: Bash guidance (original)
    return `Bash command failed: ${error}
If it is bash: the shell is POSIX Git Bash. Use forward slashes: ls not dir /b.
Paths: /c/... instead of c:\\...`;
}
```

#### 3.3.6 API Contract — classifyTool

**Function:** `classifyTool(name: string): 'shell' | 'file' | 'mcp' | 'search' | 'browser'`
**Purpose:** Map tool name to UI category for icon/label rendering

**Input Parameters:**

| Parameter | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| name | string | Yes | Must be valid tool name | Tool name from agent |

**Output Data:**

| Field | Type | Description |
|-------|------|-------------|
| classification | `'shell' | 'file' | 'mcp' | 'search' | 'browser'` | Tool category |

**Business Error Scenarios:**

| Scenario | User Message | Trigger Condition |
|----------|-------------|-------------------|
| Unknown tool name | Renders as "shell" (default) | `classifyTool` receives unrecognized name |

---

### 3.4 Feature: System Prompt Update

**Source:** BRD Story 2 [Implements: PREQ-SA4E-336-02]

#### 3.4.1 Description

Update `buildWorkspaceSystemPrompt` to use PowerShell dialect on Windows, bash dialect on non-Windows. Remove Git-Bash-specific guidance (forward slashes, `ls` not `dir /b`, backslash-escape warning) for the Windows branch.

#### 3.4.2 Pseudocode — OS-Aware System Prompt

```typescript
// extension/src/pi-workflow/pi-provider.ts — buildWorkspaceSystemPrompt
// [Implements: PREQ-SA4E-336-02]

function buildWorkspaceSystemPrompt(workspaceRoot: string): string {
    const isWin = process.platform === 'win32';

    if (isWin) {
        return `The shell tool is Windows PowerShell (pwsh).
Use PowerShell cmdlets (Get-ChildItem/Get-Content/Test-Path) or their aliases (ls/cat/dir all work).
Windows paths work as-is (c:\\... or c:/...).
Prefer the read/grep/find/ls tools over the shell for file exploration.
Build absolute paths from the workspace root verbatim; never guess the drive letter; execute tools, don't print commands.`;
    }

    // Non-Windows: keep bash guidance
    return `The shell tool is Bash (POSIX Git Bash).
Use forward slashes: ls not dir /b.
Paths: /c/... instead of c:\\...
Prefer the read/grep/find/ls tools over the shell for file exploration.
Build absolute paths from the workspace root verbatim; never guess the drive letter; execute tools, don't print commands.`;
}
```

---

### 3.5 Feature: Session Tool Loadout Update

**Source:** BRD Story 3 [Implements: PREQ-SA4E-336-03]

#### 3.5.1 Description

Update `pi-agent-session-host.ts` session tool loadout to include `powershell` on Windows. The `createAllToolDefinitions(cwd)` in 0.99.1 now includes `powershell`. Decide loadout: include `powershell`, exclude `bash` on Windows (prefer one shell tool to avoid model confusion).

#### 3.5.2 Pseudocode — Session Loadout

```typescript
// extension/src/pi-workflow/pi-agent-session-host.ts — session tool loadout
// [Implements: PREQ-SA4E-336-03]

function getSessionToolLoadout(workspaceRoot: string): ToolDefinition[] {
    const isWin = process.platform === 'win32';
    const allTools = createAllToolDefinitions(workspaceRoot);

    if (isWin) {
        // Include powershell, exclude bash on Windows to avoid model confusion
        return allTools.filter(t => t.name !== 'bash');
    }

    // Non-Windows: include bash, exclude powershell
    return allTools.filter(t => t.name !== 'powershell');
}
```

---

## 4. Data Model

> **Note:** This FSD does not introduce new data entities. The upgrade modifies existing tool classification and session configuration in-memory. No database schema changes required.

### 4.1 Logical Entities

#### Entity: ToolConfiguration (in-memory)

| Attribute | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| toolName | string | Yes | Must be `"powershell"` or `"bash"` | Shell tool name per platform |
| platform | string | Yes | `"win32"` or non-win32 | Target platform |
| toolPath | string | No | Absolute path to executable | pwsh.exe path (self-resolved by SDK) |
| isActive | boolean | Yes | Must be `true` for current platform | Whether this tool is active |

#### Entity: SessionLoadout (in-memory)

| Attribute | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| sessionId | string | Yes | UUID v4 | Session identifier |
| tools | ToolDefinition[] | Yes | Must include shell tool for current platform | Available tools for this session |
| platform | string | Yes | `"win32"` or non-win32 | Platform this loadout targets |

**Relationships:**

| From Entity | To Entity | Cardinality | Description |
|-------------|-----------|-------------|-------------|
| SessionLoadout | ToolConfiguration | 1:N | One session has many tools |

---

## 5. Integration Specifications

### 5.1 External System: pi-coding-agent SDK 0.99.1

| Attribute | Value |
|-----------|-------|
| Purpose | Provides `createPowerShellTool`, `createBashTool`, updated `Agent` types, `PowerShellToolCallEvent` |
| Direction | Outbound (extension → SDK) |
| Data Format | TypeScript types / `.d.ts` |
| Frequency | On-demand (tool creation at workspace init) |

**Data Exchange:**

| Our Data | SDK Data | Direction | Business Rule |
|----------|----------|-----------|---------------|
| `workspaceRoot` (string) | `cwd` parameter | Send to SDK | Must be absolute path |
| `process.platform` | — | Internal | `"win32"` → PowerShell; else → Bash |
| Tool call result | `PowerShellToolCallEvent` | Receive from SDK | Handle success/failure per event |

### 5.2 Integration: Pi Agent Session Host

| Attribute | Value |
|-----------|-------|
| Purpose | Session creation with platform-appropriate tool loadout |
| Direction | Outbound (extension → SDK) |
| Data Format | `CreateAgentSessionOptions` / `CreateAgentSessionResult` |
| Frequency | On session init |

**Data Exchange:**

| Our Data | SDK Data | Direction | Business Rule |
|----------|----------|-----------|---------------|
| `customTools` | ToolDefinition[] | Send to SDK | Filtered per platform (no dual shell) |
| `cwd` | workspaceRoot | Send to SDK | Absolute path |
| `modelRuntime` | ModelRuntime | Send to SDK | From `ModelRuntime.create` |

### 5.3 Retry / Circuit Breaker

| Integration | Retry Policy | Circuit Breaker | Dead Letter |
|-------------|-------------|-----------------|-------------|
| `createPowerShellTool` | 1 retry on failure | Open after 3 consecutive failures | Fallback to `createBashTool` |
| `npm install` | N/A (build-time) | N/A | Log error; abort build |
| `tsc --noEmit` | N/A (build-time) | N/A | Report type errors; block deploy |

---

## 6. Processing Logic

### 6.1 Dependency Bump Process

**Trigger:** Developer initiates upgrade (manual or automated script)
**Input:** `package.json` (root + extension) with `@earendil-works/*` at `0.80.10`
**Output:** Updated `package.json` with `0.99.1`; `package-lock.json`; single resolved version

**Processing Steps:**

| Step | Description | Error Handling |
|------|-------------|----------------|
| 1 | Update version in `root/package.json` and `extension/package.json` | If file not found → abort with error |
| 2 | Update pinned version comments in code (`0.80.10` → `0.99.1`) | If comment not found → log warning, continue |
| 3 | `npm install` | If fails → check registry, lockfile, retry once |
| 4 | `npm ls @earendil-works/pi-agent-core` → verify single version | If duplicates → `npm dedupe`, re-verify |
| 5 | `npx tsc --noEmit -p extension/tsconfig.json` → 0 errors | If errors → fix per §3.1, no `as any` |

### 6.2 PowerShell Tool Wiring Process

**Trigger:** `createWorkspaceTools(workspaceRoot)` called
**Input:** `workspaceRoot` (absolute path), `process.platform`
**Output:** `AgentTool[]` with platform-appropriate shell tool

**Processing Steps:**

| Step | Description | Error Handling |
|------|-------------|----------------|
| 1 | Check `process.platform === 'win32'` | — |
| 2 | On win32: call `createPowerShellTool(workspaceRoot)` | If throws → fallback to `createBashTool`; log warning |
| 3 | On non-win32: call `createBashTool(workspaceRoot)` | If throws → return empty tools array; log error |
| 4 | Build core tools array (read, write, edit, shellTool, grep, find, ls) | Filter null/undefined |
| 5 | Return `AgentTool[]` | — |

### 6.3 Workflow Gate Update Process

**Trigger:** Agent tool call (any tool)
**Input:** `toolName`, `args`
**Output:** Approval decision (`auto-approve` | `require-approval` | `deny`)

**Processing Steps:**

| Step | Description | Error Handling |
|------|-------------|----------------|
| 1 | `classifyToolCall(toolName, args)` | If throws → default to `require-approval` |
| 2 | Check `DANGEROUS_TOOLS` for destructive PowerShell patterns | Regex match on `args.command` |
| 3 | Check `READ_ONLY_TOOLS` for auto-approve | — |
| 4 | Return decision | — |

---

## 7. Security Requirements

### 7.1 Authentication & Authorization

| Role | Permissions | Screens/Features |
|------|-------------|-------------------|
| Developer | Read/Write | Extension configuration, tool execution |
| Product Owner | Read | Workflow gate classification review |
| QA Engineer | Read/Test | Verification tests, UAT |

### 7.2 Data Sensitivity Classification

| Data Type | Classification | Business Requirement |
|-----------|---------------|---------------------|
| Workspace path | Internal | Must not leak to external services |
| PowerShell command output | Internal | Contains file system data; treat as internal |
| Tool call arguments | Internal | May contain sensitive paths/commands |
| Agent events | Internal | Telemetry data; no PII |

### 7.3 Audit Trail

| Event | Logged Fields | Retention | Business Reason |
|-------|--------------|-----------|-----------------|
| Tool execution | toolName, command (truncated), exitCode, duration | 30 days | Debugging, compliance |
| Approval decision | toolName, decision, timestamp | 90 days | Security audit |
| PowerShell fallback | reason, timestamp, platform | 30 days | Reliability tracking |

> **TA Note:** The Knowledge Service (`backend/src/knowledge/`) already implements audit logging via `KnowledgeDb.appendMessage` with `INSERT OR IGNORE` and event sourcing. This FSD's audit trail aligns with that pattern. No new audit infrastructure needed.

---

## 8. Non-Functional Specifications

| Category | Business Requirement | Acceptance Criteria |
|----------|---------------------|---------------------|
| Performance | No regression in tool startup time | PowerShell tool init < 500ms (measured UAT) |
| Performance | Command execution latency | PowerShell command execution < 2s for typical commands |
| Reliability | Tool availability | `createWorkspaceTools` succeeds ≥ 99.9% of calls |
| Security | Approval gate coverage | All destructive PowerShell commands require approval (same as bash) |
| Compatibility | Node engine | Must verify `engines.node` in 0.99.1 before bump; if ≥22, coordinate Node upgrade (separate ticket) |
| Compatibility | TypeScript compilation | `npx tsc --noEmit` passes with 0 errors |
| Compatibility | No duplicate peers | `npm ls @earendil-works/pi-agent-core` shows exactly one version |
| Usability | UI tool rendering | Webview renders `TOOL powershell` correctly (no hardcoded bash filter) |

> **TA Note:** All NFR targets are quantified. The "Measure UAT" target in BRD §6 is now specified as `< 500ms init` and `< 2s execution` based on the upgrade guide's UAT criteria (§7 step 6).

---

## 9. Error Handling & Logging

### 9.1 Error Scenarios

| Scenario | Severity | User Message | Expected Behavior |
|----------|----------|-------------|-------------------|
| `createPowerShellTool` throws | Warning | "Shell tool unavailable; using Bash fallback" | Fallback to bash; log warning; continue |
| `pwsh.exe` not found | Info | "PowerShell not found; using Windows PowerShell" | Auto-fallback to PW 5.1; log info |
| `npm install` fails | Critical | "Dependency installation failed" | Abort; report error; suggest retry |
| TSC compilation errors | Critical | "TypeScript compilation failed" | Block deploy; report errors; fix per `.d.ts` |
| Duplicate `pi-agent-core` | Warning | "Duplicate dependency detected" | Run `npm dedupe`; re-verify |
| PowerShell command exit ≠ 0 | Warning | Command error output | Agent decides retry or steer |
| `classifyTool` unknown tool | Info | (internal) | Default to "shell"; log warning |

### 9.2 Logging Format

| Event | Log Level | Logger | Format |
|-------|-----------|--------|--------|
| PowerShell tool creation | INFO | Pino | `{ event: "powershell_tool_created", platform, workspaceRoot }` |
| PowerShell fallback to bash | WARN | Pino | `{ event: "powershell_fallback", reason, platform }` |
| `classifyTool` unknown | WARN | Pino | `{ event: "classify_tool_unknown", toolName }` |
| Dependency bump | INFO | Pino | `{ event: "dependency_bump", package, from, to }` |
| TSC error | ERROR | Pino | `{ event: "tsc_error", file, message }` |

> **TA Note:** The project uses Pino logging (per code intelligence). All log events should follow the structured JSON format above. The Knowledge Service already uses Pino with `localhostOnly` + `jwtAuth` middleware — same pattern applies here.

---

## 10. Testing Considerations

### 10.1 Functional Test Scenarios

| ID | Scenario | Input | Expected Output | Priority |
|----|----------|-------|-----------------|----------|
| TC-01 | `createWorkspaceTools` on win32 | `process.platform === 'win32'` | Tool named `"powershell"` in returned array | High |
| TC-02 | `createWorkspaceTools` on non-win32 | `process.platform !== 'win32'` | Tool named `"bash"` in returned array | High |
| TC-03 | PowerShell tool creation failure | `createPowerShellTool` throws | Falls back to `createBashTool`; logs warning | High |
| TC-04 | `READ_ONLY_TOOLS` includes powershell | `classifyToolCall("powershell", {command: "Get-ChildItem"})` | Returns `auto-approve` | High |
| TC-05 | `DANGEROUS_TOOLS` — destructive PS | `classifyToolCall("powershell", {command: "Remove-Item -Recurse"})` | Returns `require-approval` | High |
| TC-06 | `classifyTool("powershell")` | `"powershell"` | Returns `"shell"` | Medium |
| TC-07 | `buildFailureSteerCorrection` PowerShell | `toolName="powershell"`, error="..." | Returns PowerShell-dialect guidance | Medium |
| TC-08 | `buildFailureSteerCorrection` bash | `toolName="bash"`, error="..." | Returns bash-dialect guidance | Medium |
| TC-09 | Session loadout excludes bash on win32 | `getSessionToolLoadout()` on win32 | No tool with name `"bash"` | High |
| TC-10 | Session loadout excludes powershell on non-win32 | `getSessionToolLoadout()` on Linux | No tool with name `"powershell"` | High |
| TC-11 | Dependency version consistency | `npm ls @earendil-works/pi-agent-core` | Exactly one version 0.99.1 | High |
| TC-12 | TSC compilation | `npx tsc --noEmit -p extension/tsconfig.json` | 0 errors | High |
| TC-13 | `npm install` success | Valid `package.json` | Installs without errors | Medium |
| TC-14 | No `as any` in type fixes | Code review | Zero `as any` occurrences | Medium |
| TC-15 | Git-Bash workaround removed on Windows | Code review | `resolveGitBashPath`/`normalizeBashCommandPaths` not called on win32 | Medium |

### 10.2 Integration Test Scenarios

| ID | Scenario | Steps | Expected Result | Priority |
|----|----------|-------|-----------------|----------|
| IT-01 | End-to-end PowerShell execution | 1. Create workspace tools on win32<br>2. Execute PowerShell command<br>3. Verify output | Command executes with `c:\...` paths; no translation errors | High |
| IT-02 | Approval gate with PowerShell | 1. Auto-approve read-only PS<br>2. Require approval for destructive PS | Gate behaves identically to bash | High |
| IT-03 | Stream protocol with PowerShell | 1. Agent calls powershell tool<br>2. `StreamProtocolAdapter.classifyTool("powershell")`<br>3. Verify UI renders | UI shows `TOOL powershell` | Medium |
| IT-04 | Full upgrade verification | 1. Bump deps<br>2. Run tsc<br>3. Run vitest<br>4. Package VSIX<br>5. Install & UAT | All steps pass; UAT completes | High |

### 10.3 Performance Test Targets

| Metric | Target | Method |
|--------|--------|--------|
| PowerShell tool init time | < 500ms | Measure `createPowerShellTool()` call |
| Command execution latency | < 2s | Measure typical PS command |
| `npm install` duration | < 120s | Measure full install |
| `tsc --noEmit` duration | < 60s | Measure compilation |

---

## 11. Appendix

### Diagrams

| Diagram | File |
|---------|------|
| Context Diagram | [context-diagram.drawio](diagrams/use-case.drawio) |
| Upgrade Flow | [upgrade-flow.drawio](diagrams/business-flow.drawio) |
| Use Case Diagram | [use-case.png](diagrams/use-case.png) |
| Business Flow | [business-flow.png](diagrams/business-flow.png) |

### Change Log from BRD

| # | BRD Statement | FSD Clarification | Reason |
|---|---------------|-------------------|--------|
| 1 | "Upgrade @earendil-works/pi-coding-agent to 0.99.1" | Added explicit list of 7 packages to bump in lockstep | Upgrade Guide §1 specifies the full dependency cluster |
| 2 | "Remove Git-Bash shellPath pin and normalizeBashCommandPaths spawnHook for Windows" | Clarified: keep bash for non-Windows; only remove Windows workaround | BRD §1.2 out of scope for non-Windows |
| 3 | "Update workflow gate READ_ONLY_TOOLS and DANGEROUS_TOOLS to include powershell" | Added `classifyToolCall` pseudocode with destructive pattern matching | TA enrichment — implementation detail |
| 4 | "No specific non-functional requirements identified" | Quantified all NFR targets (init < 500ms, exec < 2s, tsc 0 errors, etc.) | TA enrichment — measurable targets |

### Open Issues

| # | Issue | Owner | Target Date | Status |
|---|-------|-------|-------------|--------|
| OI-1 | Node engine compatibility: does 0.99.1 require Node ≥22? | DEV | Before dependency bump | Open |
| OI-2 | `chord`, `pi-mcp`, `pi-codemode` are NEW transitive deps in 0.99.1 — verify no conflicts | DEV | During `npm install` | Open |
| OI-3 | `BeforeToolCallContext`, `BeforeToolCallResult`, `AgentEvent` type changes in 0.99.1 — verify backward compat | DEV | During TSC audit | Open |
| OI-4 | `discoverAndLoadExtensions` signature change in 0.99.1 — verify args | DEV | During TSC audit | Open |
| OI-5 | `ToolDefinition` field changes (name/label/description/parameters/execute) — verify shape | DEV | During TSC audit | Open |
| OI-6 | Webview tool rendering: confirm `powershell` icon/label renders correctly | UI | During UAT | Open |
| OI-7 | Rollback plan: if 0.99.1 breaks, restore 0.80.10 via git checkout | DEV | Before packaging | Open |

> **TA Note:** All open issues are pre-existing from the BRD risks section. No new technical decisions were made during TA enrichment. Each issue has an owner and target date for tracking.

### Data Migration

Not applicable — no database or persistent data changes.

---

*FSD v2.0 — TA-enriched. All sections completed per FSD-TEMPLATE.md. Developer can implement from this document without asking clarifying questions.*