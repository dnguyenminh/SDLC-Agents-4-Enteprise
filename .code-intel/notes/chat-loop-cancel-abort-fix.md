# Chatbox infinite-loop + cancel-does-not-abort — root cause & fix (2026-10-26)

> Pending `mem_ingest` — code-intel memory backend was down at fix time
> (`tools/call mem_ingest` → internal "fetch failed"). Re-ingest this note
> as `LESSON_LEARNED` when the server is healthy.

## Reproduction evidence
Chat export `chat-hay-review-ticket-sa4e-38-20261026-042648.md`: qwen-text,
autopilot. 10 identical oversized `write` attempts, ~11 min apart, from
02:33 to 04:23 (~2h). User pressed Cancel — UI showed "Cancelled by user"
but LLM requests kept firing in the background.

## Root causes (2 stacked bugs)
1. **No cap on the truncation retry loop.** `pi-agent-core`
   `failToolCallsFromTruncatedMessage` (agent-loop.js:342) fails an
   output-limit-truncated tool call with
   *"…was not executed… Re-issue the tool call with complete arguments."*
   and CONTINUES the agent loop. A model in a repetition spiral (nested
   PowerShell backtick-escaping) re-issues the same oversized call forever —
   each iteration is one full LLM request streamed to the token limit.
2. **Cancel only painted the UI.** `PiWorkflowAdapter.cancel()`
   (adapter-core.ts) flipped `pipelineStatus='CANCELLED'` and never called
   the SDK's existing `AgentSession.abort()` (agent-session.d.ts:592
   "Abort current operation and wait for agent to become idle"). The
   in-flight `session.prompt()` kept running → zombie turn → more LLM
   requests. The single-flight `inFlight` chain in turn-executor also
   chained the tab's NEXT message behind the zombie forever.

## Fix (root cause, in extension/src/pi-workflow)
- `session-host/types.ts`: `SessionHost.abort(): Promise<void>`
- `session-host/create-host.ts`: `abort` → `session.abort()` (defensive)
- `session-host/registry.ts`: `abortSessionHost(workspaceRoot, tabId)`
  (cached host, no-throw, no-op when absent/idle)
- `pi-agent-session-host.ts`: export `abortSessionHost`
- `pi-workflow-adapter/adapter-core.ts`: `cancel()` now ALSO aborts the
  active tab's host
- `pi-workflow-adapter/adapter-session-turns.ts`: `PI_SESSION_TIMEOUT`
  path now aborts too (timeout had the same zombie problem)
- NEW `session-host/turn-guards.ts`: `TruncationGuard` — counts
  output-limit-truncated tool results per `session.prompt()`; trips at
  3 consecutive / 6 total → `session.abort()` + red `circuit-breaker`
  tool block in the UI. Aborting (never throwing) is deliberate: a throw
  would fall the turn back to the legacy engine and re-run it (double
  LLM execution).
- `session-host/turn-executor.ts`: guard wired first inside the
  per-turn `subscribe` listener.

## Why abort is safe here
`Agent.abort()` aborts the run's AbortController; pi-agent-core settles
the run with `stopReason: "aborted"` (agent.js:372) — `session.prompt()`
RESOLVES, so `promptTurn` resolves: no legacy fallback, no double run.

## Verification
- `turn-guards.test.ts` (7) + `pi-agent-session-host.test.ts` (12):
  19/19 pass.
- `npx tsc -p .` (extension): 0 errors.
- Regression sweep `src/pi-workflow/__tests__ + src/__tests__/peer`:
  509 pass / 8 fail — the 8 failures reproduce on a clean tree
  (git-stash baseline), i.e. pre-existing in adapter-wiring-gate /
  adapter-wiring-session / pi-session-routing, unrelated to this fix.
