# SA4E-289 — Model-Resolution Ordering Fix Checklist (for the implementing AI)

## TL;DR

Symptom: chat shows **`PI_MODEL_UNRESOLVED` — "No usable Pi model resolved. Set kiroSdlc.llmModel and the provider API key…"** even though Settings has OpenAI + saved API key + model `auto` + gateway `http://localhost:20128/v1`, and "Test LLM = Success".

Root cause is **NOT** missing provider registration (that is now fixed — `PiProvider.initialize()` uses `builtinModels()` which registers openai/anthropic/…). The bug is **ordering**: the default model for `"auto"` is resolved **before** the provider is initialized and **before** the gateway is registered, so the registry is still empty at resolve time → returns `undefined` → `modelUnresolved = true`.

This is a real, precisely-located ordering bug. No new SDK work needed — just move the resolve step to after init + gateway registration.

## Evidence (verified in current code)

Flow in `PiWorkflowAdapter.configurePiProvider()` (`extension/src/pi-workflow/pi-workflow-adapter.ts`):
```ts
const bridge = bridgeProviderConfig({
  ...,
  configuredModelId: config.get('llmModel',''),          // = "auto"
  resolveDefaultModel: (pid) => this.engine.getProvider()?.resolveDefaultModel?.(pid),
});                                                        // ← (1) resolveDefaultModel CALLED HERE
await this.engine.configureProvider({ ..., modelId: bridge.modelId, baseUrl }); // ← (2) init happens HERE
return { modelUnresolved: bridge.modelUnresolved };
```
- `bridgeProviderConfig` (`pi-provider-config-bridge.ts`) treats `"auto"`/empty as "needs default" and immediately calls `resolveDefaultModel('openai')`.
- `PiProvider.resolveDefaultModel()` reads `this.models` — but `this.models` is only populated inside `PiProvider.initialize()`.
- `initialize()` runs only via `engine.configureProvider() → ensureInitialized()`, which happens at step (2), **after** step (1).
- Therefore at step (1) `this.models` is `undefined` → `resolveDefaultModel` returns `undefined` → `bridge.modelUnresolved = true` → `PI_MODEL_UNRESOLVED`.

Secondary issue: `PiWorkflowEngine.ensureInitialized()` calls `initialize('HTTP')` which does NOT pass `baseUrl`. The gateway (`http://localhost:20128/v1`) is only registered later inside `configureProvider()` via `registerGateway('openai', baseUrl)`. So even after fixing ordering, the default model must be resolved AFTER the gateway is registered (so gateway models are in the registry). Also `registerGateway` hardcodes `'openai'` instead of the actual `providerId`.

## FIX CHECKLIST

### FIX A — Move default-model resolution INTO `configureProvider` (after init) — core fix

**Files:** `extension/src/pi-workflow/pi-workflow.ts` (`configureProvider`), `extension/src/pi-workflow/pi-provider-config-bridge.ts`, `extension/src/pi-workflow/pi-workflow-adapter.ts`.

- [x] **`ConfigureProviderOptions`**: replaced `modelId?: string` semantics with the RAW configured value — now `configuredModelId?: string` (the raw `kiroSdlc.llmModel`, may be `""`/`"auto"`), plus `providerId`, `credentialResolver`, `baseUrl`.
- [x] **`bridgeProviderConfig`** (`pi-provider-config-bridge.ts`): STOPPED calling `resolveDefaultModel` here. Removed the `resolveDefaultModel` input and the `needsDefault` block. It is now `buildCredentialResolver()` only (back-compat alias kept).
- [x] **`PiWorkflowEngine.configureProvider(opts)`** — resolution happens here, in the exact order: `ensureInitialized()` → `setCredentialResolver` → `seedCredentials` → `registerGateway(providerId, baseUrl)` → resolve default (`""`/`"auto"` → `resolveDefaultModel`) → `setModel` → return `{ resolvedModelId, modelUnresolved, credentialsPresent }`.
- [x] **`PiWorkflowAdapter.configurePiProvider()`**: passes the RAW config down (`configuredModelId`/`baseUrl`/`credentialResolver`) and reads `modelUnresolved` from the engine result.

### FIX B — Register the gateway under the real providerId (before resolve)

- [x] `PiProvider.registerGateway(providerId, baseUrl)` — uses the passed `providerId` (the hardcode `'openai'` in configureProvider is gone; it now calls `p.registerGateway(opts.providerId, opts.baseUrl)` BEFORE resolving).
- [x] Gateway provider's registry id === `providerId`, so `resolveDefaultModel(providerId)` / `getModels(providerId)` find its models.
- [x] Provider-aware gateway: anthropic → `ANTHROPIC_MODELS` + `anthropicMessagesApi`; others (openai/lmstudio/openrouter/custom) → `OPENAI_MODELS` + `openai-responses`. Model catalog reused with the custom endpoint.

### FIX C — Distinguish "no model" from "no API key"

- [x] If model resolves but credentials are missing → `PI_CREDENTIALS_MISSING` actionable error ("Set kiroSdlc.<provider>ApiKey") — distinct from model-unresolved. No resolver (no SecretStorage) = nothing to verify → don't block.
- [x] `PI_MODEL_UNRESOLVED` kept ONLY for the true case: provider registry has no model for `providerId` (e.g. unknown provider id) — message no longer blames the API key.

### FIX D — Tests that exercise the REAL registry ordering (not faux)

- [x] Test `configureProvider({ providerId:'openai', configuredModelId:'auto', baseUrl:'http://localhost:20128/v1' })` with the REAL `builtinModels()` registry: `modelUnresolved === false`, `resolvedModelId` matches `/gpt-4o|gpt-4\.1|gpt-5/`. (`pi-model-ordering.test.ts`)
- [x] Test `configuredModelId:''` → resolves default too.
- [x] Test gateway: `baseUrl` + `providerId:'openai'` → provider registered under `openai`, default model resolves.
- [x] Test truly unknown provider id → `modelUnresolved === true` (the only PI_MODEL_UNRESOLVED case).
- [x] Test missing credentials → `credentialsPresent === false`, model still resolves (FIX C).
- [x] Adapter-level e2e (extended `pi-workflow-adapter.e2e.test.ts`): with mocked vscode config `llmProvider='openai', llmModel='auto'` and the REAL builtin registry → `invokeChat` does NOT emit `PI_MODEL_UNRESOLVED`.

## Definition of done

- [x] `cd extension; npx tsc --noEmit` exit 0.
- [x] `npx vitest run src/pi-workflow` green, stable ≥3 runs (3/3 runs = 62/62 passed, 13 files), including the new ordering/auto/gateway tests.
- [ ] Manual in Kiro with the user's config (OpenAI, model `auto`, gateway `http://localhost:20128/v1`, key saved): send a message → streamed tokens, NO `PI_MODEL_UNRESOLVED`. Save screenshot/log to `documents/SA4E-289/`. (VSIX 1.42.3 rebuilt + installed via `kiro --install-extension --force` — manual run pending user.)
- [ ] If key is cleared → a distinct credentials error (not model-unresolved). (Covered by automated test: `credentialsPresent=false` + `PI_CREDENTIALS_MISSING` path.)

## Guardrails

- No-workaround: fix ordering; do NOT silence the error or force a hardcoded model id. Model ids must come from the pi-ai registry (`getModels(providerId)`).
- Engine/provider stay UI-agnostic: read vscode config (provider/model/baseUrl/secrets) in the ADAPTER; pass raw values into `configureProvider`.
- Keep fail-closed for genuinely-unavailable SDK/credentials.
- Verify provider factory + model ids against installed pi-ai `.d.ts` (`providers/all.d.ts`, `providers/openai.models.d.ts`); do NOT assume ids.
- Out of scope: PegaHttpClient/ToolProxy/IndexerHttpClient; LangGraph removal = SA4E-297 (SA4E-307 does not exist); the chat LAYOUT work (separate spec).

## Files to touch (summary)

| File | Change |
|------|--------|
| `extension/src/pi-workflow/pi-workflow.ts` | `configureProvider`: init → seed creds → register gateway (real providerId) → resolve default model → setModel; return modelUnresolved. `ConfigureProviderOptions.configuredModelId` |
| `extension/src/pi-workflow/pi-provider-config-bridge.ts` | Remove `resolveDefaultModel` call/`needsDefault`; only build credential resolver + pass raw configuredModelId |
| `extension/src/pi-workflow/pi-workflow-adapter.ts` | `configurePiProvider`: pass raw `configuredModelId`+`baseUrl`+`credentialResolver` to engine; use returned `modelUnresolved` |
| `extension/src/pi-workflow/pi-provider.ts` | `registerGateway(providerId, baseUrl)` uses real providerId; align gateway registry id |
| `extension/src/pi-workflow/__tests__/*` | Real-registry ordering/auto/gateway tests (no faux) |

## Why this was missed
Every prior test injected a faux registry AND set the model explicitly, so resolution timing vs initialization was never exercised. FIX D (real `builtinModels()` registry + `"auto"`) closes that gap.
