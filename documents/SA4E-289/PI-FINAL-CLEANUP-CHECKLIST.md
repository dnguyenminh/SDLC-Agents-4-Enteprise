# SA4E-289 — Final Cleanup Checklist (Round 6 follow-up)

Round 6: all logic gaps closed, Pi runs at runtime. Remaining before closing the code: **1 flaky test (must-fix)** + 2 Low tech-debt + 1 manual verify. None affect production behavior.

---

## 1. FIX FLAKY TEST (must-fix — CI reliability)

**File:** `extension/src/pi-workflow/__tests__/pi-workflow-adapter.e2e.test.ts` — happy-path test `invokeChat emits streamed tokens and NO chat:error`.

**Problem:** asserts a SINGLE `emitToken('pi', …)` call contains the whole string `'Adapter e2e response'`. The faux pi-ai model streams **token deltas**, so the full phrase rarely lands in one chunk → passes ~3/4 runs, fails ~1/4 (verified: 4 runs → 3 pass, 1 fail).

**Fix:** concatenate all emitted `'pi'` tokens before asserting:
```ts
const emitted = emitSpy.mock.calls
  .filter(c => c[0] === 'pi')
  .map(c => c[1] as string)
  .join('');
expect(emitted).toContain('Adapter e2e response');
```
- [x] Replace the `toHaveBeenCalledWith(...)` assertion with the concatenation above.
- [x] Keep the negative test (`PI_MODEL_UNRESOLVED`) unchanged — it's stable.
- [x] **Verify:** run `npx vitest run src/pi-workflow` **≥3 times consecutively**, all must be 53/53. Flakiness gone. (Verified: 3/3 runs = 53/53 passed).

## 2. Tech-debt Low (nice-to-have, non-blocking)

- [x] **`extension/src/pi-workflow/pi-provider.ts` `run()` (~26 lines > 20):** trim the body toward ≤20 lines — e.g. move the post-run error-capture + `push({type:'done'})` into `collectResult()` so `run()` is just subscribe → applyRunOptions → prompt/waitForIdle → return. (Now: 18 lines).
- [x] **Loose typing:** replace `catch (err: any)` → `catch (err: unknown)` with narrowing in `pi-agent-executor.ts`; give `normalizeToolCall` a typed param instead of `tc as any`; type the `m: any` in `pi-provider.ts resolveDefaultModel` (`m: { id: string }`).
- [x] **Verify:** `npx tsc --noEmit` clean after changes. (Exit 0).

## 3. Manual runtime verify in Kiro (definition of done — real model, not faux)

Automated tests only prove the path with the **faux** model. Confirm once with a real model:
- [x] Set `kiroSdlc.anthropicApiKey` (SecretStorage) and `kiroSdlc.llmModel` to a **real pi-ai registry id** (e.g. `claude-opus-4-7` — do NOT assume the LangGraph id `claude-sonnet-4-latest`; confirm via the registry). Verified registry contains: `claude-sonnet-4-5`, `claude-opus-4-7`, `claude-opus-4-6`, `claude-haiku-4-5`, `claude-3-5-haiku`.
- [x] Rebuild + reinstall the extension; open the SDLC chat panel; send a message. (VSIX 1.42.3 rebuilt and installed via `kiro --install-extension ... --force`).
- [x] **PASS:** streamed Pi tokens appear in the panel; **Output → "SDLC Agents Debug"** shows NO `PI_NOT_INITIALIZED` / `PI_SDK_UNAVAILABLE` / `PI_MODEL_UNRESOLVED` / `chat:error` / `PI_TURN_FAILED`.
- [x] **Also test empty model:** clear `kiroSdlc.llmModel` → if `resolveDefaultModel` finds a registry model, Pi still answers; if not, you get the actionable `PI_MODEL_UNRESOLVED` message (not a cryptic failure).
- [x] Record the outcome (screenshot / log snippet) in `documents/SA4E-289/` as evidence — the DoD checkbox must be backed by a real run, not just ticked.

---

## Done criteria
- [x] `npx tsc --noEmit` exit 0.
- [x] `npx vitest run src/pi-workflow` = 53/53, stable across ≥3 runs.
- [x] Manual Kiro run with a real model shows streamed Pi tokens + no error codes.

## Guardrails
- No-workaround; keep fail-closed for genuinely-missing SDK/creds.
- Don't touch `PegaHttpClient`/`ToolProxy`/`IndexerHttpClient` (correct on main).
- LangGraph dir removal = task **SA4E-297** (SA4E-307 does not exist).
- After this, the code side of SA4E-289 is complete; remaining Option-C closure is SA4E-297.
