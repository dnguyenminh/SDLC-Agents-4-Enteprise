# SA4E-289 — Provider Registration + Model/BaseURL Fix Checklist

## TL;DR

Runtime bug: chat shows **"Unknown provider: unknown"** even though Settings → LLM Provider shows OpenAI, "Key saved", Model=`auto`, and "Test LLM = Success".

Two real defects, both hidden because every automated test used the **faux** provider (which is manually registered in the test):

1. **`PiProvider` never registers any real provider into the pi-ai `Models` registry.** `createModels()` returns an **empty** registry (`providers = new Map()`). Built-ins (`openai`, `anthropic`, …) are NOT auto-registered — the app must call `models.setProvider(openaiProvider())` (or `builtinProviders()`), or use `createProvider({...})` for a custom/gateway endpoint. So in production `models.getModel("openai", <anything>)` returns `undefined` → Agent keeps pi-agent-core `DEFAULT_MODEL{ provider:"unknown" }` → pi-ai `requireProvider()` throws `Unknown provider: unknown` at stream time.
2. **Model value `"auto"` is never translated to a real registry id.** The bridge only resolves a default when the model is empty; `"auto"` is truthy so it's passed through as-is, and `getModel("openai","auto")` returns `undefined`.

Bonus: the user's config uses an **OpenAI-compatible gateway** `http://localhost:20128/v1` — the base URL must be threaded into the provider (the built-in `openaiProvider()` defaults to `https://api.openai.com/v1`), otherwise it hits the wrong endpoint.

**Why "Test LLM" is green but chat fails:** Test LLM uses the OLD LangGraph `OpenAIProvider.isAvailable()` (a connectivity ping) — it never resolves a pi-ai registry model. Pi chat MUST resolve a concrete model, and there is neither a registered provider nor a valid model id.

Evidence verified in `extension/node_modules/@earendil-works/pi-ai/dist/`:
- `models.js`: `ModelsImpl` ctor sets `providers = new Map()` (empty); `createModels(options)` options are only `{credentials, modelsStore, authContext}` — no providers.
- `providers/all.d.ts`: `openaiProvider()`, `anthropicProvider()`, `builtinProviders()`, `getBuiltinModel(...)`, `createProvider(...)`.
- `providers/openai.js`: default `baseUrl: "https://api.openai.com/v1"`; model ids are `gpt-4o`, `gpt-4.1`, `gpt-4o-mini`, … (NOT `auto`).
- `models.js`: auth resolves via `Models.credentials` store + `provider.auth.apiKey` (not solely the `Agent.getApiKey` callback).

---

## FIX CHECKLIST

### FIX 1 — Register a real provider into the Models registry (core defect #1)

**File:** `extension/src/pi-workflow/pi-provider.ts` (`initialize()` / `setModel()`), plus wiring from the adapter.

- [x] After `this.models = config.models ?? createModels()`, **register the selected provider** into the registry. Two cases:
  - **Built-in default endpoint** (no custom base URL): use `builtinModels({ credentials })` from `@earendil-works/pi-ai/providers/all` — registers ALL built-in providers (openai, anthropic, + 33 more).
  - **Custom / OpenAI-compatible gateway** (user's case, `http://localhost:20128/v1`): `createGatewayProvider()` (`pi-gateway-provider.ts`) builds via `createProvider({ id, baseUrl, auth, models, api })` — **models are remapped with the custom baseUrl too** (verified: model baseUrl overrides provider default).
- [x] Do NOT register in the constructor of tests-only paths — keep faux injection working: if `config.models` is injected (tests), do NOT overwrite it; only auto-register built-ins when the adapter didn't inject a registry. (Tests call `models.setProvider(faux.provider)` themselves.)
- [x] After registration, `models.getModels('openai')` must be non-empty. Added a debug log of the count + fail-closed throw if the registry is empty (`PI_SDK_UNAVAILABLE`).

### FIX 2 — Feed credentials (API key) into pi-ai auth, not just Agent.getApiKey

pi-ai resolves auth through `Models.credentials` + `provider.auth.apiKey`. The `Agent.getApiKey` callback alone may not be enough for `streamSimple`.

- [x] When registering the provider, ensure the API key from SecretStorage reaches pi-ai auth. Implemented: `InMemoryCredentialStore` passed into `builtinModels({ credentials })`; `PiProvider.seedCredentials(providerId, key)` writes via `credentialStore.modify(providerId, () => ({ type: 'api_key', key }))` (verified against installed pi-ai).
- [x] The existing `credentialResolver` (reads `kiroSdlc.openaiApiKey`) is correct as the SOURCE of the key — now consumed by the pi-ai auth path via `engine.configureProvider()` → `seedCredentials()`, not only by `Agent.getApiKey`.
- [x] Kept the secret-key mapping already in `pi-provider-config-bridge.ts` (openai → `kiroSdlc.openaiApiKey`).

### FIX 3 — Treat `"auto"` (and empty) as "resolve a default model" (defect #2)

**File:** `extension/src/pi-workflow/pi-provider-config-bridge.ts`

- [x] Changed the resolution guard so `"auto"` is treated like empty:
  ```ts
  const needsDefault = !modelId || modelId.trim().toLowerCase() === 'auto';
  if (needsDefault && input.resolveDefaultModel) { ... }
  ```
- [x] `PiProvider.resolveDefaultModel()` queries the registry (`getModels(providerId)`) with a **provider-aware preference**: anthropic → sonnet/opus; openai → `gpt-4o`/`gpt-4.1`/`gpt-5`; else first entry. Registry-backed — no hardcoded id.
- [x] If after resolution the model still doesn't resolve → kept the existing `PI_MODEL_UNRESOLVED` actionable error path.

### FIX 4 — Thread the Base URL from Settings into the provider

**Files:** `pi-provider-config.ts`, `pi-provider-config-bridge.ts`, `pi-workflow-adapter.ts`, `pi-provider.ts`

- [x] Read the per-provider base URL the Settings panel writes — via `PROVIDER_BASE_URL_KEYS` (`kiroSdlc.anthropicBaseUrl` / `openaiBaseUrl` / `lmstudioBaseUrl` / `openrouterBaseUrl`). The adapter (UI layer) reads vscode config; `baseUrl` passed down through `configureProvider` → `PiProvider.registerGateway()`.
- [x] When a base URL is set (esp. the user's `http://localhost:20128/v1`), registered the provider via `createProvider({ id, baseUrl, auth, models, api })` with that base URL, instead of the built-in default. Built-in kept when no override.
- [x] Respected the Settings "Use default URL for this provider" checkbox: empty custom URL → `baseUrl: undefined` → built-in default used.

### FIX 5 — Tests (catch this class — provider registration + auto + gateway)

**Files:** `pi-provider-registration.test.ts` (NEW)

- [x] Test with NO injected `config.models` (production path): `PiProvider.initialize()` registers real providers and `setModel('openai', 'gpt-4o')` resolves (registry non-empty). No network.
- [x] Test `llmModel = "auto"` → resolves to a real registry id (openai → gpt-*/o*, anthropic → claude*), never passed through as `"auto"`.
- [x] Test base URL override: provider initialized with `baseUrl: 'http://localhost:20128/v1'` registers the gateway and models resolve.
- [x] Faux-based tests kept; the new built-in-registration assertion means "empty registry" can never regress silently.

---

## Definition of done

- [x] `cd extension; npx tsc --noEmit` exit 0.
- [x] `npx vitest run src/pi-workflow` green, stable across ≥3 runs (3/3 runs = 56/56 passed), INCLUDING the new registration/auto/base-url tests.
- [ ] Manual in Kiro with the user's config (OpenAI, gateway `http://localhost:20128/v1`, key saved, model `auto`): send a chat message → streamed tokens, and **NO** "Unknown provider: unknown" / `PI_MODEL_UNRESOLVED` / `chat:error`. Save a screenshot/log to `documents/SA4E-289/` as evidence. (VSIX 1.42.3 rebuilt + installed via `kiro --install-extension --force` — manual run pending user.)

## Guardrails

- No-workaround: register a real provider + resolve a real model; do NOT silence the error or force stub in production.
- Keep fail-closed for genuinely-missing SDK/credentials.
- Engine/provider stay UI-agnostic: read vscode config (provider/model/baseUrl/secrets) in the ADAPTER; pass values down.
- Verify all model ids + provider factory names against the installed pi-ai `.d.ts` (`providers/all.d.ts`, `providers/openai.models.d.ts`) — do NOT assume ids.
- Out of scope: PegaHttpClient/ToolProxy/IndexerHttpClient; LangGraph dir removal = SA4E-297 (SA4E-307 does not exist).

## Files to touch (summary)

| File | Change |
|------|--------|
| `extension/src/pi-workflow/pi-provider.ts` | Register real/built-in provider into registry; wire baseUrl via `createProvider`; feed credentials to pi-ai auth |
| `extension/src/pi-workflow/pi-provider-config.ts` | Add `baseUrl?` (and any auth/credentials plumbing) |
| `extension/src/pi-workflow/pi-provider-config-bridge.ts` | Treat `"auto"` as empty → resolve default; pass baseUrl through |
| `extension/src/pi-workflow/pi-workflow.ts` | `configureProvider` forwards baseUrl to provider |
| `extension/src/pi-workflow/pi-workflow-adapter.ts` | Read `kiroSdlc.<provider>BaseUrl` + "use default URL" flag; pass down |
| `extension/src/pi-workflow/__tests__/*` | Registration + `"auto"` + base-url tests |

## Why prior rounds missed it
All Pi tests injected the faux provider AND manually called `models.setProvider(faux.provider)`, so the empty-registry defect and the `"auto"` passthrough were never exercised on the real path. FIX 5's built-in-registration test closes that blind spot.
