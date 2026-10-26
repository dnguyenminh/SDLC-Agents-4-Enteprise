# Chat Loop & Cancel Abort — Investigation Report

## Summary
- Infinite chat loop and Cancel not stopping LLM requests were fixed by wiring `SessionHost.abort()` through `abortSessionHost` registry and adding `TruncationGuard`.
- Eight pre-existing test failures (`pi-session-routing`, `adapter-wiring-gate`, `adapter-wiring-session`) were **not caused by a commit**. HEAD is green.
- Failures were reproduced only when the working tree contained the uncommitted loop-fix changes **with a vitest mock incompatibility**.

## Root Cause of the 8 Tests
Vitest 4 strict mock namespace raises:
```
[vitest] No "abortSessionHost" export is defined on the "../pi-agent-session-host.js" mock
```
The change `const { ensureSessionHost, abortSessionHost } = await import('../pi-agent-session-host.js')` attempted to destructure an export that the shared test mock (`bridge-wiring-session-mocks.ts`) does not provide. The access throws during `trySessionTurn`, the catch returns `false`, and the turn falls back to legacy path → `PI_MODEL_UNRESOLVED` instead of the expected session path.

Affected tests:
1. `pi-session-routing.test.ts` → `lmstudio routes to SESSION path`
2. `pi-session-routing.test.ts` → `llama routes to SESSION path`
3. `pi-session-routing.test.ts` → `model starts with no current agent`
4. `adapter-wiring-session.test.ts` → `passes role + phase + nCtxDetected into ensureSessionHost`
5. `adapter-wiring-session.test.ts` → `session returns text → emitComplete + history`
6. `adapter-wiring-gate.test.ts` → `gate REJECT → actionable chat:error`
7. `adapter-wiring-gate.test.ts` → (duplicate test variant)
8. `adapter-wiring-gate.test.ts` → (duplicate test variant)

All 8 pass on clean HEAD:
```
Test Files  3 passed (3)
Tests  8 passed (8)
```

## Bisect Findings
- Worktree control with clean HEAD: 8/8 PASS.
- Worktree with loop-fix patch: 8/8 FAIL.
- Reverting `adapter-session-turns.ts` alone restores PASS.
- The early “stash-baseline” proof was invalid: `git stash push` was killed mid-execution by `Select-Object -First 2` pipeline stop, leaving changes in the tree.
- No commit between `6785f61` and `HEAD` introduces the failures.

## Fix Applied
- Keep `abortSessionHost` on the facade for public API, but **do not destructure it from the mocked facade**.
- `adapter-session-turns.ts`: `await import('../pi-agent-session-host.js')` now destructures only `ensureSessionHost`.
- Timeout abort and `AdapterCore.cancel()` now use dynamic import of `../session-host/registry.js` with `.catch(() => {})`:
  ```ts
  void import('../session-host/registry.js')
    .then(m => m.abortSessionHost(this.workspaceRoot, tabId))
    .catch(() => {});
  ```
- Static import of `abortSessionHost` removed from `adapter-core.ts` to avoid partial-mock breakage in `session-gateway-context.test.ts` / `selectAgent.test.ts`.
- `SessionHost.abort()`, `TruncationGuard`, `abortSessionHost` registry wiring kept.

## Verification
- `pi-session-routing.test.ts`, `adapter-wiring-gate.test.ts`, `adapter-wiring-session.test.ts`: 8/8 PASS
- `turn-guards.test.ts` + `pi-agent-session-host.test.ts`: 19/19 PASS
- `session-gateway-context.test.ts`, `selectAgent.test.ts`: 10/10 PASS
- `tsc` for changed files: no errors

## Files Changed / Added
- `extension/src/pi-workflow/session-host/turn-guards.ts` (new)
- `extension/src/pi-workflow/__tests__/turn-guards.test.ts` (new)
- `extension/src/pi-workflow/pi-agent-session-host.ts`
- `extension/src/pi-workflow/pi-workflow-adapter/adapter-core.ts`
- `extension/src/pi-workflow/pi-workflow-adapter/adapter-session-turns.ts`
- `extension/src/pi-workflow/session-host/create-host.ts`
- `extension/src/pi-workflow/session-host/registry.ts`
- `extension/src/pi-workflow/session-host/turn-executor.ts`
- `extension/src/pi-workflow/session-host/types.ts`
- `extension/src/pi-workflow/__tests__/pi-agent-session-host.test.ts`

Commit: `aa8c2b9` (local main)

## Notes
- The loop-fix itself is correct; the test breakage was an artifact of vitest strict mock access.
- `.code-intel` churn files are auto-generated and were not committed.
