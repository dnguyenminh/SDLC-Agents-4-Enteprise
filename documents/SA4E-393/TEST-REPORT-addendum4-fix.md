# TEST REPORT — SA4E-393 Addendum 4 bug fix "vscode is not defined"

Agent: qa-agent | Scope: working tree (uncommitted) | Independent run, dev report not trusted.

## Verdict: PARTIAL
Code-level verification PASS. E2E on a real VSIX via `execute_dynamic_tool` is PENDING (running MCP instance on port 9183 is the old build and still returns "vscode is not defined"; waiting for user reload).

## 1. Real command results (extension/)
| Command | Result |
|---|---|
| `npx tsc --noEmit` | exit 0, no errors |
| `npx eslint src/tools/design-gate src/__tests__/design-gate-*.test.ts` | exit 0, 0 errors, 1 warning: `design-gate-tools.test.ts` 300 lines (> max-lines 200) |
| vitest: no-vscode + tools + security-fix | 3 files / 21 tests passed |
| full `npx vitest run` | 435 files passed, 1 skipped; 3422 tests passed, 6 skipped; 0 failed (233 s) |

## 2. Mutation checks (restored byte-exact)
Hashes (first 12 hex) before == after: `design-gate-tool.ts` D3F91B3E0E0B, `design-gate-resolve.ts` 312682F91A11. `git status` unchanged (14 entries).
| Mutation | Expected | Observed |
|---|---|---|
| M1: append `declare const vscode: any;` + `vscode.workspace.workspaceFolders` use to design-gate-tool.ts | guard RED | RED: `regression guard — no bare declare const vscode in shipped source` failed (1 failed / 20 passed). Other tests stay green because the mutated function is never called; the static guard is the detector. |
| M2: replace realpath containment check in design-gate-resolve.ts with `&& false` | junction test RED | RED: `SEC-F02 ... rejects a junction pointing outside the workspace` failed (expected true to be false); 15 others passed |

Note: an earlier attempt overlapped with a parallel read, which briefly showed the mutated hash; the final state was re-verified clean.

## 3. STC / TDD Addendum 4 (D5/D6) evidence
Note: STC.md has no Addendum 4 section; criteria taken from TDD D5/D6.
| Criterion | Status | Evidence |
|---|---|---|
| D5 unit 1-8 (report shape, path outside, threshold, mode enum, findings_limit, list_rules 30, C6 error, rendered fetchStatus) | Evidenced | design-gate-tools.test.ts (passes); not individually remapped line by line |
| D5 unit 9 / D6 v size guard | PARTIAL | Files all ≤200 lines (max 111). Function limit violated: `mapReportToPayload` in design-gate-payload.ts is 42 lines of body. Pre-existing (42 lines at HEAD, not introduced by this fix). Test file design-gate-tools.test.ts is 300 lines (eslint warning). |
| Fix-specific: works without global vscode | Evidenced | design-gate-no-vscode.test.ts + M1 |
| SEC-F01/F02 path hygiene, junction escape | Evidenced | design-gate-security-fix.test.ts + M2 |
| D6 i: invocable via `execute_dynamic_tool` in real session, visible in tools/list | NOT evidenced | Pending reload; port 9183 old build still errors |
| D6 ii: report JSON matches D1 on real session | NOT evidenced (unit only) | |
| D6 iii: honest PASS/FAIL on fixtures via real session (Integration 2-5) | NOT evidenced e2e | |
| D6 iv: no absolute paths | Unit only | e2e pending |
| D6 v: lint + suite pass | Met for lint/suite; size rule PARTIAL (above) | |
| D6 vi: VSIX contains the tools | Partial | `sdlc-agents-4-enterprise-1.55.18.vsix` (21:39) `extension/out/extension.js` contains `design_gate_run`, no `declare const vscode` string. Not proven the VSIX is built from the final working tree. |
| D6 vii: AGENTS.md Key Rule 8 | Evidenced | AGENTS.md and .kiro/steering/ui-design-gate.md reference design_gate_run |
| Agent-loop demo (FR-AG2 transcripts) | NOT evidenced | needs live instance |

## 4. Pending to reach PASS
1. User reloads window / installs the rebuilt VSIX so the MCP instance runs the fixed build.
2. Run D5 Integration 1-6 and the agent-loop demo through `execute_dynamic_tool`; confirm no "vscode is not defined".
3. Confirm VSIX was built after the final change (rebuild if unsure).
4. Decide on pre-existing `mapReportToPayload` (>20 lines) and the 300-line test file: refactor or accept with justification.

No source files were modified (mutations reverted); nothing committed.
