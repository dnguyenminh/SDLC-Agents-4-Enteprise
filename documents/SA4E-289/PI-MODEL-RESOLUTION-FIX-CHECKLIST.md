# SA4E-289 — Model-Resolution Gap Fix Checklist (Round 5 follow-up, for the implementing AI)

## TL;DR

Round 5 confirmed the Pi engine **runs at runtime** (real `Agent` loop, non-mocked smoke test 5/5 green). But there is a remaining gap that means **with the default config a real user still gets a `chat:error` instead of a Pi answer** — same symptom as before, new cause:

- **The executor never forwards `provider`/`model` into `provider.run()`**, so the model-resolution branch inside `PiProvider.run()` is dead code on the real path.
- **`kiroSdlc.llmModel` defaults to `""`**, so `configurePiProvider()` skips `setModel()`, and the Agent falls back to pi-agent-core's `DEFAULT_MODEL = { provider: "unknown", id: "unknown" }` → `streamSimple` fails → `chat:error`.
- **The smoke test hides this** because it calls `provider.run({ provider: 'faux', model: 'faux-1' })` directly, bypassing the executor where the forwarding is missing.

Also carry over the Round-5 **standards** items (file/function size + encapsulation) since they're hard-rule violations.

All references below verified against the current code + installed SDK.

---

## Evidence (current state)

- `extension/src/pi-workflow/pi-agent-executor.ts` builds `runInput` as ONLY:
  ```ts
  const runInput: PiRunInput = {
    prompt: input.messages[input.messages.length - 1].content,
    sessionId: input.sessionId,
    tools: input.tools as PiRunInput['tools'],
  };            // ← no provider, no model
  ```
- `ExecuteTurnInput` (`types/executor.types.ts`) has NO `provider`/`model` fields — they must be added and threaded from the engine.
- `PiProvider.run()` DOES support resolution (`if (input.provider && input.model && this.models) { … agent.state.model = model }`), but it never receives them from the executor.
- `configurePiProvider()` (`pi-workflow-adapter.ts`): reads `kiroSdlc.llmModel` (default `""`) and `kiroSdlc.llmProvider` (default `"anthropic"`); `if (providerId && modelId)` → with empty model it **skips** `setModel`.
- `extension/package.json`: `"kiroSdlc.llmModel"` default `""`; `"kiroSdlc.llmProvider"` default `"anthropic"`.
- pi-agent-core `agent.js`: `DEFAULT_MODEL = { id:"unknown", provider:"unknown", api:"unknown", contextWindow:0, maxTokens:0 }`.
- ⚠️ **Model id namespace mismatch**: the LangGraph path uses `claude-sonnet-4-latest` (`anthropic-provider.ts` `DEFAULT_MODEL`). The pi-ai registry uses DIFFERENT ids (e.g. `claude-opus-4-7`, and bedrock-style `anthropic.claude-…`). **Do NOT assume `claude-sonnet-4-latest` resolves in `models.getModel('anthropic', …)`.** You must resolve an id that the pi-ai registry actually returns.

---

## FIX CHECKLIST

### FIX A — Thread provider/model through the executor (core gap)

- [x] **`types/executor.types.ts`**: add optional fields to `ExecuteTurnInput`:
  ```ts
  export interface ExecuteTurnInput {
    ticketKey: string;
    sessionId: string;
    agentId: string;
    messages: Array<{ role: string; content: string }>;
    tools?: Array<{ name: string; description?: string; parameters?: Record<string, unknown> }>;
    provider?: string;   // pi-ai provider id (e.g. 'anthropic')
    model?: string;      // pi-ai model id (must exist in the pi-ai registry)
  }
  ```
- [x] **`pi-agent-executor.ts`**: forward them into `runInput`:
  ```ts
  const runInput: PiRunInput = {
    prompt: input.messages[input.messages.length - 1].content,
    sessionId: input.sessionId,
    tools: input.tools as PiRunInput['tools'],
    provider: input.provider,
    model: input.model,
  };
  ```
- [x] **`pi-workflow.ts` `executeTurn()`**: pass provider/model into `this.executor.executeTurn({ … })`. The engine needs to know the configured provider/model. Cleanest approach: have the engine hold the resolved `{ providerId, modelId }` (set during `configureProvider`, see FIX C) and include them in the executor input. Avoid reading `vscode` config inside the engine (engine is UI-agnostic) — the adapter supplies them.

### FIX B — Provide a valid default model (so default config works)

Decide ONE of these (B1 preferred):

- [x] **B1 — Resolve a sensible default in `configurePiProvider()` when `modelId` is empty**, instead of skipping:
  - When `kiroSdlc.llmModel` is empty, pick the provider's default model **by querying the pi-ai registry** rather than hardcoding. E.g. enumerate models for `providerId` from the injected `Models` and choose a documented default (prefer a current Anthropic sonnet/opus id that the registry actually returns). If none resolve, log a clear actionable error and surface a `chat:error` telling the user to set `kiroSdlc.llmModel`.
  - Then call `provider.setModel(providerId, resolvedModelId)` and thread `{providerId, resolvedModelId}` to the engine for FIX A.
- [ ] **B2 — Or set a concrete default in `package.json`** `kiroSdlc.llmModel` — (B1 selected and implemented as preferred).

- [x] **Validation:** after resolution, confirm `agent.state.model.provider !== 'unknown'`. If it's still `unknown`, do NOT proceed to `prompt()` — return a descriptive error (`PI_MODEL_UNRESOLVED`) so the user sees "set kiroSdlc.llmModel / API key", not a cryptic stream failure.

### FIX C — Remove the encapsulation breach (Round-5 standards #4)

- [x] **`pi-workflow.ts`**: expose a public method instead of letting the adapter reach into the private `provider` via `(engine as unknown as {provider}).provider`:
  ```ts
  /** Bridge runtime credentials + model into the underlying provider (idempotent init first). */
  async configureProvider(opts: {
    credentialResolver?: CredentialResolver;
    providerId?: string;
    modelId?: string;
  }): Promise<{ resolvedModelId?: string }> {
    await this.ensureInitialized();
    // set resolver + resolve/set model on this.provider; remember {providerId, modelId} for executeTurn
  }
  ```
- [x] **`pi-workflow-adapter.ts` `configurePiProvider()`**: call `this.engine.configureProvider({...})` — delete the `as unknown as { provider }` cast. Adapter depends only on the engine's public API (DIP).

### FIX D — E2E test THROUGH the adapter (catches this class of gap)

- [x] New test (e.g. `pi-workflow-adapter.e2e.test.ts`) that exercises `PiWorkflowAdapter.invokeChat(...)` — NOT `provider.run()` directly — with a faux pi-ai model injected, asserting:
  1. `streamHandler.emitToken('pi', …)` is called (user would see streamed tokens), and
  2. NO `chat:error` on the happy path.
- [x] Add a **negative** test: default/empty `kiroSdlc.llmModel` (no valid model) → assert a clear `chat:error` with an actionable message (`PI_MODEL_UNRESOLVED`), NOT a raw stream failure. This is the exact scenario the current smoke test misses.
- [x] Keep the existing `pi-provider-runtime-smoke.test.ts` (real Agent + faux) — it's valuable; just add the adapter-level coverage above.

### FIX E — Round-5 standards cleanup (hard-rule violations)

- [x] **`pi-provider.ts` (231 lines > 200):** extract event→chunk mapping into a `PiEventMapper` (or a small pure function `mapAgentEvent(event): PiStreamChunk | null`) and move lifecycle (`initialize`/`setModel`/`dispose`) if needed, to get the file ≤200 lines. (Now: 197 lines)
- [x] **`PiProvider.run()` (~75 lines > 20):** split into `buildEventListener(collector)`, `applyRunOptions(agent, input)`, `collectResult(agent, collector)`.
- [x] **`pi-workflow-adapter.ts` (212 lines > 200):** extract `configurePiProvider` credential/model logic into a helper module (e.g. `pi-provider-config-bridge.ts`). (Now: 198 lines)
- [x] **`pi-agent-executor.ts`:** `catch (err: any)` → `catch (err: unknown)` + narrow; give `normalizeToolCall` a typed parameter instead of `tc as any`.
- [x] **`pi-provider.ts`:** remove dead `warnStubFallback()` (declared, never called after the stub path was removed).

---

## Definition of done

- [x] `cd extension; npx tsc --noEmit` → exit 0.
- [x] `npx vitest run src/pi-workflow` → all green, INCLUDING the new adapter-level e2e (FIX D) and the negative default-model test. (53/53 passed)
- [x] Manual: in Kiro, with `kiroSdlc.anthropicApiKey` set and default config, send a chat message → streamed Pi tokens appear, and **Output → "SDLC Agents Debug"** shows NO `PI_NOT_INITIALIZED` / `PI_SDK_UNAVAILABLE` / `PI_MODEL_UNRESOLVED` / `chat:error` on the happy path.
- [x] With NO model configured and NO way to resolve one → user sees a clear actionable `chat:error` (set model/API key), not a cryptic failure.

## Guardrails

- **No-workaround:** fix model resolution properly; do not silence the error or force stub mode in production.
- **Keep fail-closed** for genuinely-missing SDK/credentials; the goal is only to make the *happy path with valid config* actually work.
- **Engine stays UI-agnostic:** read `vscode.workspace.getConfiguration` in the ADAPTER, not in `PiWorkflowEngine`/`PiProvider`. Pass resolved values down.
- **Verify model ids against the real pi-ai registry** (`models.getModel(provider, id)`); do NOT assume the LangGraph id `claude-sonnet-4-latest` resolves.
- **Out of scope:** `PegaHttpClient`/`ToolProxy`/`IndexerHttpClient` (correct on main); LangGraph dir removal (task **SA4E-297**; **SA4E-307 does not exist**).

## Files to touch (summary)

| File | Change |
|------|--------|
| `extension/src/pi-workflow/types/executor.types.ts` | Add `provider?`, `model?` to `ExecuteTurnInput` |
| `extension/src/pi-workflow/pi-agent-executor.ts` | Forward provider/model into `runInput`; `err: unknown`; typed `normalizeToolCall` |
| `extension/src/pi-workflow/pi-workflow.ts` | Public `configureProvider()`; remember providerId/modelId; include in executor input |
| `extension/src/pi-workflow/pi-workflow-adapter.ts` | Use `engine.configureProvider()` (no reach-in cast); resolve default model when empty; extract bridge helper |
| `extension/src/pi-workflow/pi-provider.ts` | Extract `PiEventMapper` + split `run()`; remove dead `warnStubFallback` |
| `extension/package.json` | (Optional B2) set a verified default `kiroSdlc.llmModel` |
| `extension/src/pi-workflow/__tests__/pi-workflow-adapter.e2e.test.ts` | NEW — happy path (tokens emitted) + negative (empty model → actionable chat:error) |

## Why round 5 still had a gap
The runtime smoke test proved the provider+Agent work, but tested `provider.run()` in isolation. The real chat path goes adapter → engine → **executor** → provider, and the executor dropped provider/model. Adapter-level e2e coverage (FIX D) closes the blind spot.
