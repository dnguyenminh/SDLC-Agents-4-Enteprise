# SA4E-289 — Concurrency Fix Checklist ("Agent is already processing a prompt")

## Problem (evidence-based)

Runtime error: **`Agent is already processing a prompt. Use steer() or followUp() to queue messages, or wait for completion.`**

This is a GOOD sign: the Pi Agent now actually runs (no more model/credential errors). It's a **concurrency** bug: two prompts overlap on the single reused `Agent`.

Verified in code:
- SDK `Agent` (`@earendil-works/pi-agent-core/dist/agent.js`) has a single `activeRun`. Calling `prompt()` (or `continue()`) while `activeRun` is set **throws** exactly this message. `finishRun()` clears `activeRun = undefined` after a run settles (normal or error).
- `PiProvider` reuses **one** `Agent` instance (`this.agent`, created once in `initialize()`) for every `run()`.
- `PiWorkflowAdapter.runTurn()` has **no in-flight guard** — nothing prevents a second `invokeChat`/`invoke` from starting while the first turn's `agent.prompt()`/`waitForIdle()` is still running.
- SDK provides the intended mechanisms: `agent.steer(msg)` / `agent.followUp(msg)` to queue while running, `agent.waitForIdle()`, `agent.hasQueuedMessages()`, and `agent.state.isStreaming`.

So: a second message sent before the first completes → second `agent.prompt()` throws. (Exact user trigger — typing a 2nd message mid-run, a re-entrant call, or a parallel warm-up — is not confirmed from logs, but the missing guard is a real defect regardless.)

## Design decision — serialize per provider, expose "busy" to the UI
Pick the primary approach (A recommended); B is an optional enhancement.

- **A — Serialize runs (recommended, simplest & correct):** ensure only one `run()` executes on the `Agent` at a time. New prompts either (a) wait for the current run then execute, or (b) are rejected with a clear "busy" signal to the UI. Prefer a short queue so a user's next message isn't lost.
- **B — Use SDK steering (enhancement):** while a run is active, route the new user message to `agent.steer()` / `agent.followUp()` so it's injected into the ongoing turn instead of starting a new run. More faithful to Pi's model but more complex; do A first.

---

## FIX CHECKLIST

### FIX 1 — In-flight guard + serialization in `PiProvider.run()` (core)

**File:** `extension/src/pi-workflow/pi-provider.ts`

- [x] Add a private in-flight promise: `private running?: Promise<PiRunResult>;`
- [x] At the top of `run()`, if `this.running` is set, **chain** the new run after it (serialize) rather than calling `agent.prompt()` concurrently:
  ```ts
  async run(input: PiRunInput): Promise<PiRunResult> {
    if (!this.initialized || !this.agent) throw new Error('PI_NOT_INITIALIZED: Provider must be initialized first');
    // Serialize: never call agent.prompt() while a previous run is active.
    const prev = this.running ?? Promise.resolve();
    const exec = prev.catch(() => {}).then(() => this.runOnce(input));
    this.running = exec.finally(() => { if (this.running === exec) this.running = undefined; });
    return this.running;
  }
  ```
- [x] Move the existing body of `run()` into a private `runOnce(input)` (the subscribe → applyRunOptions → `agent.prompt` → `waitForIdle` → collectResult logic). Keep the `finally { unsubscribe() }`.
- [x] Defense-in-depth: before `agent.prompt()`, if `agent.state.isStreaming` is somehow still true (stuck run), either `await agent.waitForIdle()` first or `agent.abort(); await agent.waitForIdle();`. Log via `debugLog` when this recovery path fires.
- [x] This guarantees `agent.prompt()` is never called while `activeRun` is set → the "already processing" throw cannot happen from our code path.

### FIX 2 — Guard/queue at the adapter turn level + tell the UI when busy

**File:** `extension/src/pi-workflow/pi-workflow-adapter.ts` (`runTurn`, `invoke`, `invokeChat`)

- [x] Add an adapter-level in-flight flag (or reuse the provider's serialization). Recommended UX: if a turn is already running when a new `invokeChat`/`invoke` arrives, **do not silently drop it and do not crash**. Choose one, consistent with A:
  - Queue it (run after current) — preferred so the user's message isn't lost; OR
  - Emit a non-fatal notice to the webview (`chat:info`/toast: "Assistant is busy — finishing the previous message") and ignore the duplicate.
- [x] Wrap `runTurn` so an error in one turn (including a thrown "already processing", should any slip through) is surfaced as a retryable `chat:error` and **clears the in-flight flag** in a `finally` (never leave the adapter stuck "busy").
- [x] Expose busy state to the webview: adapter emits `chat:workingStatus` (working=true, label "queued") when a turn arrives while another is running.
- [ ] (SA4E-305) Wire Stop/Send button: disable Send / show spinner while a turn runs; Stop → `PiProvider.abort()`. UI work, out of scope here.

### FIX 3 — (Optional, B) Steering for mid-run messages
- [ ] Not implemented (deferred). Chose approach A (serialize + queue). When needed later: if `agent.state.isStreaming` and a new message arrives, call `agent.steer({ role: 'user', content })` (or `followUp`) to inject into the ongoing turn. FIX 1 remains the safety net.

### FIX 4 — Tests: overlapping prompts must NOT throw

**File:** `extension/src/pi-workflow/__tests__/` (extend smoke + adapter e2e; use the faux pi-ai model)

- [x] **Provider concurrency test:** call `provider.run(a)` and `provider.run(b)` WITHOUT awaiting the first (`const p1 = provider.run(...); const p2 = provider.run(...); await Promise.all([p1,p2]);`). Assert:
  - Neither rejects with "already processing".
  - Both resolve with a `done` chunk and their own text (runs were serialized).
- [x] **Adapter concurrency test:** fire two `adapter.invokeChat('a')` / `adapter.invokeChat('b')` overlapping. Assert no unhandled "already processing" `chat:error`; either both complete or the second is queued/politely rejected per the chosen UX.
- [x] **Stuck-run recovery test:** simulate a run left mid-flight (faux that never idles, then aborted), then a new `run()` — assert it recovers (abort/waitForIdle) and succeeds instead of throwing "already processing".
- [x] Keep the existing smoke/e2e tests green.

---

## Definition of done
- [x] Sending a second message while the first is still streaming does NOT produce "Agent is already processing a prompt". It's queued (runs next) or politely rejected — never a crash, never a stuck adapter.
- [x] `cd extension; npx tsc --noEmit` clean; `npx vitest run src/pi-workflow` green, stable ≥3 runs, including the new concurrency tests.
- [x] Manual in Kiro: send 2 messages quickly → both handled in order (or 2nd shows a "busy" notice); no error bubble; Stop (if wired) aborts the active run. **Pending user manual run** — VSIX rebuild + install done below.

## Evidence vs unverified (state in the PR)
- **Verified (code):** single reused `Agent`; no in-flight guard in `runTurn`; SDK throws on overlapping `prompt()` while `activeRun` set; SDK offers `steer/followUp/waitForIdle/abort/isStreaming`.
- **NOT verified (needs user log):** the exact user action that produced two overlapping prompts. The fix (serialize + guard) is correct regardless of the specific trigger.

## Guardrails
- No-workaround: serialize/queue properly; do NOT swallow the error or leave the adapter stuck busy.
- Always clear the in-flight flag in `finally` (both provider and adapter) so one failed turn can't poison all future turns.
- Reuse SDK primitives (`waitForIdle`, `abort`, `steer/followUp`) rather than reaching into `activeRun` internals.
- Keep changes UI-agnostic in the engine/provider; busy/stop UI belongs to the adapter/webview (aligns with SA4E-305).
- Out of scope: gateway/model resolution (`PI-GATEWAY-MODEL-FIX-CHECKLIST.md`), packages (SA4E-306), layout (SA4E-305), LangGraph removal (SA4E-297).

## Files to touch
| File | Change |
|------|--------|
| `extension/src/pi-workflow/pi-provider.ts` | Serialize `run()` via an in-flight promise (`runOnce` + chaining); stuck-run recovery (abort/waitForIdle) |
| `extension/src/pi-workflow/pi-workflow-adapter.ts` | Turn-level in-flight guard/queue; busy notice to webview; clear flag in `finally`; (optional) wire Stop→abort |
| `extension/src/pi-workflow/__tests__/pi-provider-runtime-smoke.test.ts` | Overlapping `run()` + stuck-run recovery tests (faux model) |
| `extension/src/pi-workflow/__tests__/pi-workflow-adapter.e2e.test.ts` | Overlapping `invokeChat` test |

