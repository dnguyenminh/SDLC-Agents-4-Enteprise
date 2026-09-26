# SA4E-289 — Gateway Model Fix Checklist (honor the user's real model / gateway catalog)

## Problem (evidence-based)

User's Settings: provider OpenAI, base URL gateway `http://localhost:20128/v1`, API key saved, **Model = `auto`** (a REAL model the gateway serves; the gateway routes it to a backend). Chat fails with `401 No active credentials for provider: codex`.

Root cause — the Pi run path does NOT honor the user's model selection or the gateway's real model list:

1. **Gateway provider uses the STATIC pi-ai catalog, not the gateway's `/v1/models`.** `extension/src/pi-workflow/pi-gateway-provider.ts` `createGatewayProvider()` builds the provider from `OPENAI_MODELS` (static pi-ai catalog) and only remaps each model's `baseUrl`. It never calls `GET {baseUrl}/v1/models`. → the gateway's real models (including `auto`) are NOT in the registry.
2. **`"auto"` is discarded as a sentinel.** `pi-provider-config-bridge.ts` / `pi-workflow.ts configureProvider` treat `"auto"` (and empty) as "resolve a default", calling `PiProvider.resolveDefaultModel('openai')`, which picks a `gpt-*` id from the static catalog via `/gpt-4o|gpt-4\.1|gpt-5/i`. So the user's chosen `auto` is thrown away and a static `gpt-*` id is sent instead.
3. Consequence: Pi sends a static-catalog `gpt-*` id the gateway may route to a different backend (`codex`) → 401. (The exact routing to `codex` is gateway-side; not fully confirmed. What IS confirmed: `auto` is never sent, and the model list is static, not the gateway's.)

**Contrast:** the Settings dropdown DOES fetch the gateway's real models via `fetchGatewayModels()` (see below). The Pi run path just doesn't reuse it. The LangGraph `OpenAIProvider` also auto-detects the gateway's first real model. Only the Pi path is stuck on the static catalog.

## Existing code to REUSE (do not reinvent)
- `extension/src/chat-panel/chat-models.ts` → **`fetchGatewayModels(baseUrl): Promise<ChatModelEntry[] | null>`** (line ~118). Calls `GET {baseUrl}/v1/models` (handles both `.../v1` and non-`/v1` bases), parses `{ data: [{ id, display_name|name, ... }] }`, returns `null` on any failure (so caller falls back to static). Already used by `ProviderConfigService.getModels` (line ~82) and `ChatModelManager.sendModels`.
- `ChatModelEntry` type in the same file.

---

## FIX CHECKLIST

### FIX 1 — Gateway provider must use the gateway's REAL models

**File:** `extension/src/pi-workflow/pi-gateway-provider.ts` (`createGatewayProvider`).

- [x] Before falling back to the static `OPENAI_MODELS`/`ANTHROPIC_MODELS` catalog, call `fetchGatewayModels(baseUrl)` (import from `../chat-panel/chat-models`). If it returns a non-empty list, build the provider's `models` from THAT list (each entry mapped to a pi-ai `Model` shape with `provider: providerId`, `baseUrl`, and the correct `api` — `openai-responses` / `anthropic-messages`).
  - Map each `ChatModelEntry` → pi-ai model object. Use a sensible default `contextWindow`/`maxTokens` if the gateway doesn't report them (or copy from a static catalog entry when the id matches). Keep `provider: providerId` so auth lookup matches the seeded credential.
- [x] Only fall back to the static catalog (current behavior) when `fetchGatewayModels` returns `null`/empty (gateway unreachable or no `/models`). Log which path was taken via `debugLog`.
- [x] `createGatewayProvider` is already `async` — good; the fetch fits. Confirm the auth for the gateway request: `fetchGatewayModels` currently does an unauthenticated GET. The user's gateway returns **401 on `/v1/models` without a key** (verified). So pass the API key: either extend `fetchGatewayModels` to accept an optional `Authorization` header, or add a small authed variant for the Pi path. Without the key, the fetch will 401 and you'll silently fall back to the static catalog — which reintroduces the bug. **This is important: fetch the gateway models WITH the API key.**

### FIX 2 — Honor the user's selected model, including `auto`, when it exists on the gateway

**Files:** `extension/src/pi-workflow/pi-provider-config-bridge.ts`, `extension/src/pi-workflow/pi-workflow.ts` (`configureProvider`), `extension/src/pi-workflow/pi-provider.ts` (`setModel`/`resolveDefaultModel`).

- [x] Stop treating `"auto"` as an unconditional "discard + resolve default" sentinel. New rule:
  1. If the configured model id (e.g. `auto`, or any explicit id) **exists in the gateway-backed registry** (`this.models.getModel(providerId, id)` succeeds) → **use it as-is**. This is the fix for the user: `auto` is a real gateway model, so send `auto`.
  2. Only if the configured id is empty OR not found in the registry → fall back to `resolveDefaultModel(providerId)`.
- [x] `resolveDefaultModel` should prefer the gateway's real models (now in the registry from FIX 1). Keep the static-catalog preference only as a last-resort fallback.
- [x] Remove/relax the hard `modelId.toLowerCase() === 'auto'` → "needsDefault" branch in `bridgeProviderConfig`. Let the engine's `configureProvider` decide after the registry (with gateway models) is populated — i.e. resolution must happen AFTER `registerGateway`, checking the real registry first (this also aligns with the ordering fix in `PI-MODEL-ORDERING-FIX-CHECKLIST.md`).

### FIX 3 — Correct `PI_MODEL_UNRESOLVED` semantics
- [x] `PI_MODEL_UNRESOLVED` should only fire when NO model can be resolved at all (empty gateway list AND no static fallback AND no explicit id). A valid gateway `auto` must NOT trigger it.

### FIX 4 — Tests (prove `auto` + gateway models flow)
- [x] Unit test `createGatewayProvider`: mock `fetchGatewayModels` to return `[{ id: 'auto' }, { id: 'gpt-4o' }]` → provider registry contains `auto` with `provider: providerId` and gateway `baseUrl`.
- [x] Unit test: `fetchGatewayModels` returns `null` (unreachable) → falls back to static catalog (no crash).
- [x] `configureProvider` test: `configuredModelId = 'auto'` + gateway registry has `auto` → `setModel(providerId, 'auto')` succeeds, `modelUnresolved === false`, resolved id === `auto` (NOT a static `gpt-*`).
- [x] `configureProvider` test: `configuredModelId = ''` + gateway list `['auto','gpt-4o']` → resolves a gateway model (not a static-only id).
- [x] Adapter e2e (`pi-workflow-adapter.e2e.test.ts`): mock config `llmProvider=openai, llmModel=auto`, gateway baseUrl set, `fetchGatewayModels` mocked → `invokeChat` sends model `auto`, no `PI_MODEL_UNRESOLVED`, no fallback to `gpt-*`.

---

## Definition of done
- [x] With the user's config (OpenAI, gateway `localhost:20128/v1`, key saved, model `auto`): Pi sends `model: "auto"` to the gateway (verify via debug log / request), NOT a static `gpt-*` id.
- [x] Gateway `/v1/models` is fetched WITH the API key so its real catalog (incl. `auto`) populates the registry.
- [x] `cd extension; npx tsc --noEmit` clean; `npx vitest run src/pi-workflow` green, stable ≥3 runs, including the new gateway/auto tests.
- [x] Manual in Kiro: send a message → streamed tokens, no `401 codex`, no `PI_MODEL_UNRESOLVED`. Save log/screenshot to `documents/SA4E-289/`.

## Evidence vs unverified (be honest in the PR)
- **Verified (code):** gateway provider uses static `OPENAI_MODELS` (pi-gateway-provider.ts:33-39); `auto` is discarded via the sentinel branch; `resolveDefaultModel` picks `gpt-*` from static catalog; `fetchGatewayModels` exists and is used by Settings but NOT by the Pi path; gateway `/v1/models` returns 401 without a key.
- **NOT yet verified (needs the user's runtime log):** exactly which `gpt-*` id was sent, and precisely how the gateway maps it to `codex`. The fix does not depend on this — sending the user's actual `auto` selection is correct regardless.

## Guardrails
- No-workaround: honor the user's Settings selection + gateway's real model list; don't hardcode a model or keep silently substituting from the static catalog.
- Fetch gateway `/v1/models` WITH the API key (gateway requires auth — verified 401 without key). Reuse `fetchGatewayModels` (extend it to accept an auth header rather than duplicating).
- Keep static catalog ONLY as a fallback when the gateway list is unavailable.
- Engine/provider stay UI-agnostic: the adapter reads vscode config + secret and passes baseUrl/model/key down.
- Depends on / aligns with `PI-MODEL-ORDERING-FIX-CHECKLIST.md` (resolve model AFTER init + gateway registration).
- Out of scope: LangGraph removal = SA4E-297; chat layout = SA4E-305; packages = SA4E-306.

## Files to touch
| File | Change |
|------|--------|
| `extension/src/pi-workflow/pi-gateway-provider.ts` | Fetch gateway `/v1/models` (with API key) via `fetchGatewayModels`; build provider models from real list; static catalog only as fallback |
| `extension/src/chat-panel/chat-models.ts` | Extend `fetchGatewayModels(baseUrl, authHeader?)` to send Authorization (gateway requires it) |
| `extension/src/pi-workflow/pi-provider-config-bridge.ts` | Stop discarding `"auto"`; pass raw configured id through |
| `extension/src/pi-workflow/pi-workflow.ts` (`configureProvider`) | After registerGateway: if configured id exists in registry → use it; else resolveDefaultModel; set modelUnresolved only when truly nothing resolves |
| `extension/src/pi-workflow/pi-provider.ts` | `resolveDefaultModel` prefers gateway registry models; static preference last |
| `extension/src/pi-workflow/__tests__/*` | Gateway-models + `auto` + fallback tests |

