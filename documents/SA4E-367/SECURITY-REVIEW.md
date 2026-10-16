# 🔒 Security Design Review — SA4E-367 (Hotfix, L3)

## Document Information
| Field | Value |
|-------|-------|
| Project | SDLC-Agents-4-Enterprise — VS Code/Kiro Extension (SDLC CHAT) |
| Ticket | SA4E-367 — Chatbox dynamic tool exposure (missing export buildMcpBridgeAgentTools + first-class find_tools/execute_dynamic_tool gated pair) |
| Scope | TDD v1.0 + DISCREPANCY.md design review — 5 focus areas (hotfix, static review only) |
| Date | 2026-10-16 |
| Reviewer | Security Agent |
| Verdict | **APPROVED-WITH-CONDITIONS** (see § Conditions) |

## Executive Summary

The TDD ports the proven SA4E-364 implementation (branch + commit `180b150` verified in-tree) and extends the single-tool gate to a **discovery pair gate** (`isDiscoveryTool` covers `find_tools` + `execute_dynamic_tool`, strict `=== true` opt-in, wiring passes no options). Default behavior is **byte-identical to today** (4 concrete tools; pair absent; `discoveryTools: []`). Code verification confirms **SEC-324-03 (deny-by-default) and SEC-332-09 (fail-closed) are preserved**, the static 4-target chained allowlist is unchanged, and Req-5 tools stay dynamic-only (effectively **unreachable** until a separate allowlist review — the secure outcome). No Critical or High findings. Three Mediums (one pre-existing approval gap, one future-only shell-interpolation risk, one bounded role-bypass) gate the CONDITIONS, not the hotfix.

**Overall Risk Rating:** Medium (default path: Low — pair ships inert without opt-in)

| Severity | Count |
|----------|-------|
| 🔴 Critical | 0 |
| 🟠 High | 0 |
| 🟡 Medium | 3 (M-1 pre-existing; M-2 bounded; M-3 future-only precondition) |
| 🔵 Low | 3 |
| ℹ️ Informational | 2 |

## Focus-Area Verdicts

### 1. First-class find_tools + execute_dynamic_tool with opt-in allowDynamicChaining — SEC-324-03 kept? ✅ YES
- Pair gate `isDiscoveryTool(name) && options?.allowDynamicChaining !== true → skip` (TDD §3.2) is a strict extension of the current single-tool guard (`mcp-bridge-extension.ts:104,171`, verified). Wiring passes **no options** in both paths (adapter `:497`, host `:338`) → pair absent by default. **Deny-by-default holds.**
- Approval + audit (`bridgeRequiresApproval`, `checkApproval`, `defaultAuditLog` — argKeys only, never values) reused untouched. `find_tools` = read-only discovery, `approval=false` is appropriate; `execute_dynamic_tool` keeps `approval=true` flag.
- ⚠️ BUT see **M-1**: with no `approvalHook` wired (OI-04, TDD OQ-1), `checkApproval` (`:87`) auto-approves — approval is **audit-only** in production. Pre-existing, not introduced here; must be closed by the OQ-1 follow-up.

### 2. Static TOOL_ALLOWLIST (4 tools) + gated pair — injection/chaining risk? ✅ ACCEPTABLE
- Build-time emission is NOT allowlist-filtered (TOOLS passthrough, schema identity) — the allowlist governs **chained targets only** (`validateChainedTarget`, `:69-78`). Keeping it at 4 concrete tools is correct and unchanged (TDD §7 S-6).
- `validateParams` enforces required fields + 4000-char/string caps on every call incl. `find_tools` (prompt-injection hygiene). `find_tools` result poisoning (malicious tool descriptions) cannot escalate: execution still passes pair gate + target allowlist + approval + audit (TDD §7(d) acknowledged).
- Server side (`WrapperServer.routeToolCall :264-285`) has **no chained-target allowlist** — the bridge handler is the sole enforcement point. Acceptable while the bridge is the only caller path, but any future direct backend exposure must re-add the check (noted as condition).

### 3. buildMcpBridgeAgentTools port from SA4E-364 — fail-closed (SEC-332-09, IServerManager, no hardcoded URL)? ✅ YES
- Port source verified: branch `SA4E-364` + commit `180b150` exist in-tree. Delta is the documented one-line pair-gate extension — minimal, reviewable.
- Builder is **pure/sync/O(6)/0-network**: takes an existing `McpBridge` instance, creates no transport, contains no URL. Fail-closed entry point (`:158-160`, throws without `serverManager`) untouched. Session host narrows via `instanceof McpBridge` → `[]` degraded (W-1); legacy path keeps skip-if-exists merge (BR-06). **No hardcoded-URL fallback introduced.**

### 4. discoveryTools vs mcpTools routing — privilege escalation? ⚠️ BOUNDED BYPASS (M-2, Low impact)
- `mcpTools` pass through `filterByRole` (prefix match); `discoveryTools` are **never dropped** by design (`tool-loadout.ts:95-106`), and `find_`/`execute_` match no role prefix — routing the pair via `discoveryTools` is the only way the capability survives for non-SM roles. Design-correct, but it means an opted-in restricted role (e.g. BA) can reach `code_search` **via chaining** even though the role filter would drop it from `mcpTools`.
- Impact is Low: all 4 chained targets are read-only except `mem_ingest` (KB write — already in every role's default pool via `mem_` prefix, so no new privilege). No cross-boundary escalation (workspace containment stays server-side). Recommend a role-aware `validateChainedTarget` follow-up (see Conditions).

### 5. Req-5 tools dynamic-only (orchestration_status, get_curated_context, stream_write_file, drawio_*, embed_image) — future risk assessment ✅ CORRECT DECISION
- Effective today: Req-5 names are **denied** as chained targets (∉ TOOL_ALLOWLIST) at the bridge, so the pair does **not** actually enable them yet despite TDD §3.5 wording (clarity note L-3). Fail-closed outcome — good.
- If a future ticket extends the allowlist, preconditions per tool (see M-3 / Appendix R):

| Tool | Risk if allowlisted | Precondition |
|------|--------------------|--------------|
| `stream_write_file` | **High** — arbitrary workspace write → persistence / config-driven code exec | Keep PathResolver + symlink guard + 10 MB cap; require approvalHook (human gate); consider write-scope scoping |
| `get_curated_context` | **Medium** — bulk KB+code exfiltration; prompt-injection via curated content | Output size cap + approval; treat results as untrusted input downstream |
| `drawio_*` | **Medium** — `exportWithCli` builds shell string via interpolation (`backend/src/engine/tools/drawio-renderers.ts:48-52`, `execSync`) → command injection on crafted paths | **Must switch to `execFileSync(argv)`** + path validation BEFORE any allowlist extension |
| `embed_image` | **Medium** — arbitrary read + write + base64 blowup | Approval + output-size cap; containment already enforced (verified) |
| `orchestration_status` | **Low** — topology disclosure (server names/states) | None blocking; audit-only |

## Detailed Findings

### M-1: Approval is audit-only — no approvalHook wired (PRE-EXISTING, OI-04)
| Attribute | Value |
|-----------|-------|
| Severity | Medium (default path: Low — pair inert; opted-in path: Medium) |
| OWASP | A01:2021 — Broken Access Control |
| CWE | CWE-862: Missing Authorization (human-gate absent) |
| Location | `extension/src/pi-agent/extensions/mcp-bridge-extension.ts:87` + TDD OQ-1 |
| Status | Open (follow-up ticket) |

**Description:** `checkApproval` returns `auto-approved` when `approvalHook` is absent. Wiring passes no options, so `mem_ingest` and (when opted in) `execute_dynamic_tool` execute without human consent; only the audit line records the decision. TDD §3.3 table ("needs approval") is aspirational until OQ-1 ships.
**Impact:** Opted-in LLM can write KB (`mem_ingest`) and chain tools with no human gate — KB-poisoning / unintended-action risk.
**Remediation:** Ship OQ-1 follow-up: new `sdlcAgents.allowDynamicChaining` setting + approval UX hook passed as `BridgeOptions.approvalHook`. Until then, document audit-only mode in release notes.
```typescript
// Follow-up wiring (session host / adapter):
const bridgeTools = buildMcpBridgeAgentTools(bridge, {
  allowDynamicChaining: settings.get('sdlcAgents.allowDynamicChaining') === true,
  approvalHook: vscodeApprovalHook, // human-in-the-loop; absent = audit-only (current)
  auditLog: defaultAuditSink,
});
```

### M-2: Role-filter bypass — opted-in restricted roles regain dropped tools via chaining (BOUNDED)
| Attribute | Value |
|-----------|-------|
| Severity | Medium → **Low** (downgraded: targets are read-only/broadly available) |
| OWASP | A01:2021 — Broken Access Control |
| CWE | CWE-639: Authorization Bypass Through User-Controlled Key |
| Location | `extension/src/pi-workflow/pi-agent-session-host.ts:341-348` (TDD §3.7) × `tool-loadout.ts:97,109-113` |
| Status | Open (accepted for hotfix; follow-up recommended) |

**Description:** Pair routed via `discoveryTools` (never dropped) bypasses `filterByRole`. E.g. role BA drops `code_search` from `mcpTools` but regains it via `execute_dynamic_tool({tool_name:'code_search'})`.
**Impact:** Role-tool-group separation is advisory for the 4 chained tools. No sensitive new privilege (all reads + already-universal `mem_ingest`).
**Remediation (follow-up, NOT hotfix):** role-aware chained-target check:
```typescript
function validateChainedTarget(params: Record<string, unknown>, role?: string): boolean {
  const inner = params.tool_name;
  if (typeof inner !== 'string' || !TOOL_ALLOWLIST.has(inner)) return false;
  const allowed = ROLE_TOOL_PREFIXES[(role ?? '').trim()];
  if (!allowed || allowed.includes('*')) return true;
  return allowed.some((p) => (inner as string).startsWith(p));
}
```

### M-3 (FUTURE): drawio exportWithCli shell-string interpolation — command injection precondition
| Attribute | Value |
|-----------|-------|
| Severity | Medium (future-only — NOT reachable in this hotfix: chained target denied) |
| OWASP | A03:2021 — Injection |
| CWE | CWE-78: OS Command Injection |
| Location | `backend/src/engine/tools/drawio-renderers.ts:48-52` |
| Status | Open (precondition for any future drawio_* allowlisting) |

**Description:** `const cmd = `"${cli}" ... "${outputPath}" "${inputPath}"`; execSync(cmd)` — shell interpretation; a crafted path containing `"` / `$()` / `;` executes. Extension-side proxy + PathResolver mitigate but were not verified to reject quotes.
**Impact (if allowlisted later):** LLM-influenced path → host command execution.
**Remediation (before any drawio allowlist extension):**
```typescript
import { execFileSync } from 'child_process';
export async function exportWithCli(inputPath: string, outputPath: string): Promise<void> {
  if (!_cachedDrawioCliPath) throw new Error('draw.io CLI path not cached');
  execFileSync(_cachedDrawioCliPath, ['--export', '--format', 'png', '--border', '10', '--output', outputPath, inputPath], { timeout: 30000, stdio: 'pipe', shell: false });
}
```

### L-1: validateParams — no type checking, no __proto__ stripping (Low)
-location `tool-definitions.ts:86-106`. Extra/optional fields pass through; `__proto__` keys survive validation and ride into `bridge.callTool`. No prototype-pollution sink verified on the path (JSON-RPC serialization, not object-merge), so Low. Harden opportunistically: reject non-object `arguments` shapes, strip `__proto__`/`constructor`/`prototype` keys.
### L-2: find_tools auto-approved + description poisoning (Low)
Read-only discovery needs no gate; capped strings + downstream execution gates (S-1/S-6) contain it. Acknowledged in TDD §7(d). No action.
### L-3: TDD wording — §3.5 "reachable via pair" vs §7 S-6 "needs separate review" (Low, clarity)
Code-verified truth: Req-5 chained targets are **denied today** (∉ allowlist). Recommend DEV add an explicit EC-9 deny test asserting `execute_dynamic_tool({tool_name:'stream_write_file'})` → `chaining_denied` so the secure default is locked (TDD checklist #9 already covers EC-9 — just ensure a Req-5 name is in the case).

### ℹ️ INFO-1: Strengths confirmed (positive)
Deny-by-default pair gate; fail-closed transport (no URL fallback); audit logs argKeys only (no PII/secret values in logs); fail-safe degraded paths (W-1/BR-08); PathResolver single validation point + symlink guard + 10 MB cap on local writes; no settings-schema/DB/backend change in hotfix.
### ℹ️ INFO-2: Scope limitations
Static design review only — no dynamic testing, no dependency CVE scan (no new dependencies), no infra/network review, no prompt-injection red-teaming of the live pair. Post-merge UAT (§11.5) + full suite gate still required.

## Remediation Priority
| Priority | Finding | Effort | Impact |
|----------|---------|--------|--------|
| 1 (pre-merge) | Lock EC-9 deny test with a Req-5 name (L-3) | Low | Locks fail-closed default |
| 2 (follow-up) | OQ-1: approvalHook + setting for allowDynamicChaining (M-1) | Medium | Restores human gate |
| 3 (follow-up) | Role-aware validateChainedTarget (M-2) | Low | Closes advisory bypass |
| 4 (precondition, future) | execFileSync fix before any drawio allowlisting (M-3) | Low | Removes command-injection class |

## Conditions (APPROVED-WITH-CONDITIONS)
1. **TOOL_ALLOWLIST stays at 4** in this hotfix — any Req-5 extension requires a separate security review (TDD §7 S-6 honored).
2. **EC-9 deny test with a Req-5 name** must be in the merge (locks L-3).
3. **OQ-1 follow-up ticket is mandatory**, not optional: approval UX + `sdlcAgents.allowDynamicChaining` setting (M-1).
4. **Pre-merge gates**: `tsc -p ./` + production esbuild + full vitest suite green (SIT-02; vitest alone insufficient per SA4E-365 F-1).
5. **No direct backend exposure** of find_tools/execute_dynamic_tool bypassing the bridge handler unless the chained-target allowlist is re-enforced server-side.

## Appendix
### A. Methodology — static code review (5 focus areas), OWASP Top 10 2021 mapping, verified file:line references; no code executed, no exploits attempted.
### B. Files verified — `extension/src/pi-agent/extensions/tool-definitions.ts` (129 lines), `mcp-bridge-extension.ts` (:1-196), `pi-agent/tool-loadout.ts` (:1-160), `pi-workflow/pi-agent-session-host.ts` (:300-445), `pi-workflow-adapter.ts` (:480-530), `services/WrapperServer.ts` (:264-343), `backend-local-tools.ts` (PathResolver/symlink-guard/10 MB cap), `chat/engine/ToolApprovalClassifier.ts`, `mcp/mcp-bridge.ts`, `backend/src/engine/tools/drawio-renderers.ts` (:48-52); port source branch `SA4E-364` @ `180b150`.
