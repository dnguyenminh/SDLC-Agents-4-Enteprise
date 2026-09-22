# SA4E-289 — Pi Runtime Fix Checklist (for the implementing AI)

## TL;DR

The migration compiles, unit tests pass, and the engine is wired into the chat panel — but **Pi never actually runs at runtime**. A real user message returns a `chat:error`, not a Pi answer. Two independent root causes:

1. **Engine is never initialized** → `PI_NOT_INITIALIZED` on the first message.
2. **`PiProvider` targets an SDK API shape that does not exist** in `@earendil-works/pi-agent-core@0.80.10` → even after fixing #1 it fails closed with `PI_SDK_UNAVAILABLE`.

Both were missed by 4 static review rounds because unit tests **mock the SDK** and no one exercised the real runtime path. The fix requires rewriting `PiProvider` against the SDK's **real** `Agent` class API and adding an `initialize()` call, then proving it with a **non-mocked smoke test**.

Everything below is grounded in the installed SDK's `.d.ts` files under `extension/node_modules/@earendil-works/pi-agent-core/dist/` and `@earendil-works/pi-ai/dist/`.

---

## Evidence: what the real SDK exposes

`@earendil-works/pi-agent-core` `dist/index.d.ts` re-exports (NO flat `createPiAgent`/`stream`/`executeTool`):
- `./agent.ts` → **`class Agent`** + `interface AgentOptions`
- `./agent-loop.ts`
- `./harness/agent-harness.ts` → `class AgentHarness`
- `./harness/session/*`, `./harness/messages.ts`, `./harness/skills.ts`, `./types.ts`, `./proxy.ts`, etc.

### `Agent` (dist/agent.d.ts) — the primitive to use
```ts
class Agent {
  constructor(options?: AgentOptions);
  subscribe(listener: (event: AgentEvent, signal: AbortSignal) => void | Promise<void>): () => void;
  get state(): AgentState;
  prompt(input: string, images?: ImageContent[]): Promise<void>;
  prompt(message: AgentMessage | AgentMessage[]): Promise<void>;
  continue(): Promise<void>;
  abort(): void;
  waitForIdle(): Promise<void>;
  reset(): void;
}
interface AgentOptions {
  initialState?: Partial<...AgentState...>;   // systemPrompt, model, thinkingLevel, tools, messages
  convertToLlm?: (messages: AgentMessage[]) => Message[] | Promise<Message[]>;
  streamFn?: StreamFn;                         // Models.streamSimple satisfies this
  getApiKey?: (provider: string) => Promise<string | undefined> | string | undefined;
  sessionId?: string;
  transport?: Transport;
  toolExecution?: "sequential" | "parallel";
  beforeToolCall?: ...; afterToolCall?: ...;   // tool approval hooks live HERE
}
```

### Streaming = events, not a generator (dist/types.d.ts `AgentEvent`)
There is **no `stream()` generator**. Text arrives through `subscribe()`:
- `{ type: "agent_start" }`
- `{ type: "message_update", message, assistantMessageEvent }` ← incremental streaming tokens
- `{ type: "message_end", message }`
- `{ type: "turn_end", message, toolResults }`
- `{ type: "tool_execution_start" | "tool_execution_update" | "tool_execution_end", ... }`
- `{ type: "agent_end", messages }` ← final

### `StreamFn` + models (from `@earendil-works/pi-ai`)
```ts
type StreamFn = (model: Model<Api>, context: Context, options?: SimpleStreamOptions)
  => AssistantMessageEventStream | Promise<AssistantMessageEventStream>;
```
- pi-ai exposes `createModels(options?)` → `Models` with `getModel(provider, id)` and `streamSimple(...)`.
- `Models.streamSimple` **satisfies `StreamFn`** (stated in types.d.ts docstring).
- Legacy/compat: `@earendil-works/pi-ai/compat` still exposes `getBuiltinModel`/`getModel`, `stream()`, env-api-key injection.

> Import note: source `.d.ts` uses `.ts` specifiers; import from the package roots `@earendil-works/pi-agent-core` and `@earendil-works/pi-ai` (or `/compat`), not deep `dist/*.ts` paths. Verify the exact export names against the installed `.d.ts` while implementing.

---

## Current broken code (what to change)

- `extension/src/pi-workflow/pi-provider.ts` — probes `piSdkModule.createPiAgent/.stream/.executeTool` (none exist) → always fail-closed. **Rewrite.**
- `extension/src/pi-workflow/pi-agent-executor.ts` — calls `provider.createAgent()` then iterates `provider.stream({prompt})`. **Adapt to new provider contract.**
- `extension/src/pi-workflow/pi-workflow.ts` — has `initialize()` (line ~33) but nobody calls it. `executeTurn()` runs without init.
- `extension/src/pi-workflow/pi-workflow-adapter.ts` — `runTurn()` calls `engine.executeTurn()` directly; **never calls `engine.initialize()`**. Also holds a LangGraph `LlmProvider` (`this.llmProvider`) used only for context-window detection — this is the credential source to bridge.
- `extension/src/chat-panel/chat-panel-provider.ts` `getEngine()` (line ~366) — passes `llmProvider: createLlmProvider(this.secrets)` (LangGraph provider) + `checkpointerStore`. `this.secrets` is `vscode.SecretStorage` (set at runtime). API keys already live here via `getSecretKey("anthropic"|...)`.

---

## FIX CHECKLIST

### FIX 1 — Initialize the engine before first turn (fixes PI_NOT_INITIALIZED)

**File:** `extension/src/pi-workflow/pi-workflow-adapter.ts` (and/or `pi-workflow.ts`)

- [ ] Make `PiWorkflowEngine` initialize idempotently. Options:
  - Add a private `initialized` guard in `PiWorkflowEngine`; at the top of `executeTurn()` do `if (!this.initialized) { await this.initialize(); this.initialized = true; }`, **or**
  - In `PiWorkflowAdapter.runTurn()`, `await this.engine.initialize()` once before the first `executeTurn` (guard with a boolean/promise so it runs once).
- [ ] Ensure `initialize()` is safe to call concurrently (cache the init promise) so parallel messages don't double-init.
- [ ] Verify: after this fix alone, the error should change from `PI_NOT_INITIALIZED` to whatever the provider does next (still `PI_SDK_UNAVAILABLE` until FIX 2).

### FIX 2 — Rewrite `PiProvider` against the real `Agent` API (fixes PI_SDK_UNAVAILABLE)

**File:** `extension/src/pi-workflow/pi-provider.ts` — this is the core work.

- [ ] Import the real API: `import { Agent, type AgentOptions, type AgentEvent } from '@earendil-works/pi-agent-core';` and the model/stream pieces from `@earendil-works/pi-ai` (`createModels`, or `getBuiltinModel` + `stream` from `/compat`). Confirm exact names against installed `.d.ts`.
- [ ] In `initialize(config)`:
  - Build a `Models` instance (`createModels(...)`) or resolve a `Model<Api>` via `getModel(provider, id)`. Keep the `import(...)` in a `try/catch`, but since the package IS installed this should succeed; on genuine failure keep the existing fail-closed throw (`PI_SDK_UNAVAILABLE`) outside test mode.
  - Store `streamFn = models.streamSimple` (bound) and the resolved default `model`.
  - Remove the dead `typeof piSdkModule.stream === 'function'` style probes.
- [ ] Replace `createAgent()` + `stream()` with an `Agent`-based execution. Recommended provider contract (choose one and update `IPiProvider` + `pi-agent-executor.ts` accordingly):

  **Recommended: a single `run` method that streams via events.**
  ```ts
  // new IPiProvider surface (illustrative)
  interface IPiProvider {
    readonly providerName: 'PiProvider';
    initialize(config: PiProviderConfig): Promise<void>;
    run(input: {
      prompt: string;
      systemPrompt?: string;
      sessionId?: string;
      tools?: AgentTool[];
      onEvent: (chunk: PiStreamChunk) => void;   // map AgentEvent -> PiStreamChunk
    }): Promise<{ finalText: string; toolCalls: NormalizedToolCall[] }>;
  }
  ```
  - Inside `run`: construct `new Agent({ streamFn, getApiKey, sessionId, initialState: { systemPrompt, model, tools }, convertToLlm, beforeToolCall, afterToolCall })`.
  - `const unsub = agent.subscribe((event) => { /* map event -> PiStreamChunk, call onEvent */ });`
  - `await agent.prompt(input.prompt);` then `await agent.waitForIdle();` then `unsub();`
  - Map events → existing `PiStreamChunk`:
    - `message_update` → `{ type: 'text', content: <delta from assistantMessageEvent> }`
    - `tool_execution_start` → `{ type: 'tool_call', toolCall: {...} }`
    - `agent_end`/`message_end` → `{ type: 'done' }`
    - errors (`state.errorMessage`, or a failed turn) → `{ type: 'error', error }`
  - Collect final assistant text (from `agent.state.messages` / `agent_end.messages`) and any tool calls to return.
- [ ] `getApiKey`: bridge to the extension's existing credentials. Pass a `getApiKey(provider)` into the provider from the adapter/chat-panel that reads `vscode.SecretStorage` via the same `getSecretKey(type)` used by `createLlmProvider` (`extension/src/langgraph/providers/index.ts`). Do **not** invent a new secret store.
- [ ] Keep fail-closed behavior for the genuinely-unavailable case (SDK import throws, or no model/key resolvable) — throw `PI_SDK_UNAVAILABLE` outside test mode; keep `allowStub` test-only.
- [ ] Keep `sdkAvailable` getter meaningful (true once a real `Models`/model resolved).

### FIX 3 — Update `PiAgentExecutor` to the new provider contract

**File:** `extension/src/pi-workflow/pi-agent-executor.ts`

- [ ] Replace the `createAgent()` + `for await (chunk of provider.stream(...))` loop with a single `await provider.run({ prompt, systemPrompt, sessionId, tools, onEvent })`.
- [ ] Preserve existing behavior: accumulate `streamChunks`, collect `toolCalls` (normalized), push assistant message into `updatedMessages`, keep `validateInput()`/`buildErrorResult()` and error-code mapping.
- [ ] Pipe streamed text out so `PiWorkflowAdapter.runTurn()` still calls `streamHandler.emitToken('pi', content, null)` for each delta (so the webview shows streaming tokens).

### FIX 4 — Provide the model/credentials from the wiring layer

**Files:** `extension/src/pi-workflow/pi-workflow-adapter.ts`, `extension/src/chat-panel/chat-panel-provider.ts`

- [ ] Decide the default model (e.g. the same provider/model the LangGraph path used, from settings `kiroSdlc.*` / `getSecretKey`). Pass provider id + model id + `getApiKey` down into `PiWorkflowEngine` → `PiProvider.initialize()`.
- [ ] Extend `PiProviderConfig` (`pi-provider-config.ts`) with what `initialize` now needs (e.g. `modelProvider?: string; modelId?: string; getApiKey?: (p: string) => Promise<string|undefined>`), keeping `transportType` for compatibility.
- [ ] The adapter already receives a LangGraph `llmProvider`; reuse its credential source rather than adding a parallel one. If model selection lives in settings, read it once and thread it through.

### FIX 5 — Smoke test with the REAL SDK (no mocks) — this is what catches these bugs

**File:** new `extension/src/pi-workflow/__tests__/pi-provider.smoke.test.ts` (or an integration test)

- [ ] Do **not** mock `@earendil-works/pi-agent-core`. Construct the real `PiProvider`, `initialize()` it.
- [ ] Use a **faux/registered test model** so no network/API key is needed: pi-ai exposes a faux provider (`export * from "./providers/faux.ts"` and `registerFauxProvider(...)` in pi-ai). Register the faux provider and use its model id, so `streamFn` returns a scripted `AssistantMessageEventStream`.
- [ ] Assert: sending a prompt yields at least one `text` chunk and a final `done` (i.e. the event→chunk mapping works end to end), and that NO `PI_NOT_INITIALIZED` / `PI_SDK_UNAVAILABLE` is thrown on the happy path.
- [ ] Add one adapter-level test: `PiWorkflowAdapter.invokeChat("hi")` produces `streamHandler.emitToken` calls (prove the UI would receive tokens).

### FIX 6 — Manual runtime verification in Kiro (definition of done)

- [ ] Rebuild + reinstall the extension.
- [ ] Open the SDLC chat panel, send a message.
- [ ] Open **Output → "SDLC Agents Debug"** channel. Success = streamed assistant tokens in the panel and **no** `PI_NOT_INITIALIZED` / `PI_SDK_UNAVAILABLE` / `PI_TURN_FAILED` lines. Failure = any of those error codes or a `chat:error` bubble.

---

## Guardrails / constraints

- **No workaround-rule:** do not "fix" this by forcing stub mode on in production or by swallowing the errors. The fix is to call the real `Agent` API correctly.
- **Keep fail-closed** for the genuinely-unavailable case (SDK truly missing / no credentials) — just make the happy path actually reachable.
- **Do not touch** `PegaHttpClient` / `ToolProxy` / `IndexerHttpClient` (out of scope; already correct on `main`).
- **LangGraph removal** stays under **SA4E-297** (not this fix; and SA4E-307 does NOT exist).
- Reconfirm all exact export names against the installed `.d.ts` while coding — versions can shift the surface.
- Verify after changes: `cd extension; npm run build` (or `npx tsc --noEmit`) clean, `npx vitest run src/pi-workflow` green (including the new non-mocked smoke test).

## Files to touch (summary)

| File | Change |
|------|--------|
| `extension/src/pi-workflow/pi-provider.ts` | Rewrite against real `Agent` + `Models.streamSimple`; event→chunk mapping; `getApiKey` bridge |
| `extension/src/pi-workflow/pi-provider-config.ts` | Add model/provider/getApiKey fields |
| `extension/src/pi-workflow/pi-agent-executor.ts` | Use new `provider.run()` contract; keep validation + error mapping |
| `extension/src/pi-workflow/pi-workflow.ts` | Idempotent init (or expose for adapter) |
| `extension/src/pi-workflow/pi-workflow-adapter.ts` | Call `engine.initialize()` once; thread model/credentials; keep `emitToken` streaming |
| `extension/src/chat-panel/chat-panel-provider.ts` | Provide model id + `getApiKey` (from SecretStorage) into the engine |
| `extension/src/pi-workflow/__tests__/pi-provider.smoke.test.ts` | NEW non-mocked smoke test using pi-ai faux provider |

## Why the reviews missed this
Unit tests inject a mock `IPiProvider`/SDK, so `executeTurn` "worked" in tests while the real provider path (init + real SDK shape) was never exercised. Add the non-mocked smoke test (FIX 5) so regressions of this class are caught.
