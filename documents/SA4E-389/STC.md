# Software Test Cases (STC)

## SDLC-Agents-4-Enterprise — SA4E-389: Multi LLM Configuration (Profiles) + Chat model/provider switcher

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-389 |
| Title | Multi LLM Configuration (Profiles) + Chat model/provider switcher |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-10-30 |
| Status | Draft — pending BA review (Review Gate) |
| Related STP | STP.md v1.0 — `documents/SA4E-389/STP.md` |
| Related FSD | FSD.md v1.0 — `documents/SA4E-389/FSD.md` |
| Related TDD | TDD.md v1.0 — `documents/SA4E-389/TDD.md` |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-30 | QA Agent | Initiate document — 35 test cases covering AC1–AC10 (Phase 4 Test Planning) |

---

## Test Case Summary

| Category | ID Range | Count | Priority |
|----------|----------|-------|----------|
| Functional — Happy Path | TC-389-001 … TC-389-008 | 8 | P1 |
| Functional — Alternative Flows | TC-389-100 … TC-389-107 | 8 | P1–P2 |
| Functional — Exception/Error Flows | TC-389-200 … TC-389-205 | 6 | P1–P3 |
| Business Rule Validation | TC-389-300 … TC-389-302 | 3 | P1–P2 |
| Boundary & Negative Testing | TC-389-400, TC-389-401 | 2 | P1–P2 |
| UI/UX Testing | TC-389-500, TC-389-501, TC-389-510 | 3 | P1–P2 |
| Static Checks (incl. ≤200-line constraint) | TC-389-403, TC-389-404, TC-389-603 | 3 | P1–P2 |
| Non-Functional — Performance | TC-389-601, TC-389-602 | 2 | P3 |
| **Total** | | **35** | P1×19, P2×12, P3×4 |

Type distribution: unit ×8, integration ×7, e2e ×16, manual ×1, static ×3 (see STP §2.5). All test data files live in `documents/SA4E-389/test-data/`.

---

## 1. Functional Test Cases — Happy Path

### TC-389-001: Profile table displays all LlmProfile entries

| Field | Value |
|-------|-------|
| **ID** | TC-389-001 |
| **Priority** | P1 |
| **Type** | e2e |
| **AC Mapping** | AC1 |
| **Preconditions** | Extension dev host running SA4E-389 build; `sdlcAgents.llm.profiles` seeded with 3 fixtures from `test-data/profiles-valid.csv` rows P01–P03 (`lmstudio-qwen`, `openrouter-anthropic`, `ollama-local`) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open Settings Panel → tab "LLM Provider" | Tab renders with profile table |
| 2 | Inspect table rows | Exactly 3 rows in persisted order: `LMStudio - Qwen`, `OpenRouter - Anthropic`, `Ollama - Local` |
| 3 | Inspect row columns | Each row shows label, provider, model, status badge (gray "untested"), and action buttons Edit / Test / Delete / Set-active |
| 4 | Compare against settings store | Table order and values match `sdlcAgents.llm.profiles` exactly |

**Test Data:** `test-data/profiles-valid.csv` #P01–P03
**Postconditions:** No state change — read-only verification.

---

### TC-389-002: Add new profile happy path

| Field | Value |
|-------|-------|
| **ID** | TC-389-002 |
| **Priority** | P1 |
| **Type** | e2e |
| **AC Mapping** | AC2, AC10 |
| **Preconditions** | Dev host running; table currently holds the 3 seeded fixtures |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click "+ Add Configuration" | Edit Provider modal opens (empty, provider dropdown present) |
| 2 | Select provider `openai`; fill profile ID `openai-gpt`, label `OpenAI - GPT`, model `gpt-4o`, API key `sk-test-openai-001` | Inputs accepted; API key field masked |
| 3 | Click Save | Modal closes; new row `OpenAI - GPT | openai | gpt-4o | untested` appears in table |
| 4 | Inspect persisted settings | `sdlcAgents.llm.profiles` now contains 4 entries; new entry matches inputs verbatim |
| 5 | Inspect secret storage via helper | Key exists at `llmSecretKey("openai-gpt")` = `sdlcAgents.openai-gptApiKey`; NO key named `llmProfile.openai-gpt.apiKey` |

**Test Data:** `test-data/profiles-valid.csv` #P04 (`openai-gpt`, key `sk-test-openai-001`)
**Postconditions:** 4 profiles stored. Subsequent cases assume this fixture set (3–4 rows).

---

### TC-389-003: Edit profile — modal pre-filled

| Field | Value |
|-------|-------|
| **ID** | TC-389-003 |
| **Priority** | P1 |
| **Type** | e2e |
| **AC Mapping** | AC3 |
| **Preconditions** | Profile `lmstudio-qwen` exists (from seed) with model `qwen2-7b-instruct`, base URL `http://127.0.0.1:1234/v1` |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click "Edit" on row `LMStudio - Qwen` | Modal opens with ALL fields pre-filled: label, provider `lmstudio`, model, base URL; API key field shows masked placeholder (never raw key) |
| 2 | Change model to `qwen2-14b-instruct`; leave other fields | Inputs accepted |
| 3 | Click Save | Modal closes; table row shows `qwen2-14b-instruct`; settings store updated |
| 4 | Reopen Edit | Pre-filled model is `qwen2-14b-instruct` (persistence confirmed) |

**Test Data:** `test-data/profiles-valid.csv` #P01→edit values
**Postconditions:** `lmstudio-qwen` model = `qwen2-14b-instruct` persisted.

---

### TC-389-004: Delete profile with confirmation

| Field | Value |
|-------|-------|
| **ID** | TC-389-004 |
| **Priority** | P1 |
| **Type** | e2e |
| **AC Mapping** | AC4 |
| **Preconditions** | Profile `openrouter-anthropic` exists; it is NOT the active profile |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click "Delete" on row `OpenRouter - Anthropic` | Confirmation dialog "Are you sure?" appears |
| 2 | Confirm deletion | Dialog closes; row removed from table |
| 3 | Inspect settings | `sdlcAgents.llm.profiles` no longer contains `openrouter-anthropic` |
| 4 | Inspect `activeProfileId` | Unchanged (deleted profile was not active) |

**Test Data:** `test-data/profiles-valid.csv` #P02 (delete target)
**Postconditions:** 3 profiles remain.

---

### TC-389-005: Set active profile

| Field | Value |
|-------|-------|
| **ID** | TC-389-005 |
| **Priority** | P1 |
| **Type** | e2e |
| **AC Mapping** | AC5, AC1 |
| **Preconditions** | ≥ 2 profiles exist; current active = `lmstudio-qwen` |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click "Set active" on row `OpenAI - GPT` | Visual active indicator (highlight/badge) moves to that row |
| 2 | Inspect settings | `sdlcAgents.llm.activeProfileId` = `openai-gpt` |
| 3 | Open a chat turn | Outbound turn resolves provider/model/baseUrl from `openai-gpt` profile via `readProviderTurnConfig()` (stub logs show `openai` endpoint + `gpt-4o`) |

**Test Data:** `test-data/profiles-valid.csv` #P04 as activation target
**Postconditions:** Active profile = `openai-gpt`.

---

### TC-389-006: Grouped model picker shows only connected profiles

| Field | Value |
|-------|-------|
| **ID** | TC-389-006 |
| **Priority** | P1 |
| **Type** | e2e |
| **AC Mapping** | AC6 |
| **Preconditions** | Fixtures: `lmstudio-qwen` lastTestStatus=connected, `openai-gpt` lastTestStatus=connected, `openrouter-anthropic` lastTestStatus=untested |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open Chat Window → click model selector | Grouped picker popup opens |
| 2 | Inspect groups | Groups separated by provider: `lmstudio` group and `openai` group (one group per provider, not per model) |
| 3 | Look for `openrouter-anthropic`'s model | Not offered — untested profile is absent/disabled/grayed (never selectable) |
| 4 | Check model items | Each item shows model name + provider; both visible groups contain 1–2 models |

**Test Data:** `test-data/profiles-valid.csv` P01(c)/P04(c) connected, P02(u) untested; `test-data/model-picker-cases.csv` #G01
**Postconditions:** None (read-only).

---

### TC-389-007: Test connection — success

| Field | Value |
|-------|-------|
| **ID** | TC-389-007 |
| **Priority** | P1 |
| **Type** | integration |
| **AC Mapping** | AC7 |
| **Preconditions** | Mock LLM endpoint stub healthy (HTTP 200, `/v1/models` success) bound to `127.0.0.1:<mockPort>`; profile `ollama-local` baseUrl points to it |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Trigger connection test for profile `ollama-local` (service call as in Settings "Test" action) | Test executes against stub; completes < 5 s |
| 2 | Inspect persisted profile | `lastTestStatus` = `connected`; `lastTestedAt` > 0 (fresh epoch ms) |
| 3 | Inspect UI badge | Badge turns green "connected" |

**Test Data:** `test-data/connection-test-cases.csv` #C01
**Postconditions:** Profile status = connected.

---

### TC-389-008: Migration — fresh flat config → Profile #1

| Field | Value |
|-------|-------|
| **ID** | TC-389-008 |
| **Priority** | P1 |
| **Type** | integration |
| **AC Mapping** | AC8 |
| **Preconditions** | Clean scratch VS Code profile; legacy flat keys seeded: `sdlcAgents.llm.provider=lmstudio`, `sdlcAgents.llm.model=qwen2-7b-instruct`, `sdlcAgents.llm.lmstudio.baseUrl=http://127.0.0.1:1234/v1`, SecretStorage `sdlcAgents.lmstudioApiKey=sk-legacy-901`; `sdlcAgents.llm.profiles` absent |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Activate extension | Migration runs automatically on activation |
| 2 | Inspect created profile | Profile #1: `id=lmstudio`, `label=LMStudio - default`, `provider=lmstudio`, `baseUrl=http://127.0.0.1:1234/v1`, `model=qwen2-7b-instruct`, `useDefaultUrl=false`, `lastTestStatus=untested`, `lastTestedAt` undefined |
| 3 | Inspect `activeProfileId` | = `lmstudio` |
| 4 | Inspect legacy keys | Old flat keys STILL PRESENT (fail-safe — data not deleted) |
| 5 | Resolve API key via `readLlmApiKey(secrets, "lmstudio")` | Returns `sk-legacy-901` WITHOUT user re-entry (auto-migration on read) |
| 6 | Open Settings → LLM Provider | Table shows exactly 1 row (the migrated Profile #1) |

**Test Data:** `test-data/migration-legacy-config.csv` #M01
**Postconditions:** Legacy state packaged as Profile #1; old keys intact.

---

## 2. Functional Test Cases — Alternative Flows

### TC-389-100: Model picker selection switches profile + model in ONE operation

| Field | Value |
|-------|-------|
| **ID** | TC-389-100 |
| **Priority** | P1 |
| **Type** | e2e |
| **AC Mapping** | AC6, AC5 |
| **Preconditions** | 2 connected profiles on different providers (`lmstudio-qwen` connected, `openai-gpt` connected); current active = `lmstudio-qwen` |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open chat model picker | Groups show per provider |
| 2 | Select item `gpt-4o` under the `openai` group | One click applies BOTH `activeProfileId=openai-gpt` AND model `gpt-4o` |
| 3 | Inspect settings after single selection | `activeProfileId=openai-gpt`; profile `openai-gpt`.model=`gpt-4o`; intermediate states (profile switched, model stale) never occur |
| 4 | Send a chat turn | Turn uses `openai` provider/baseUrl/model `gpt-4o` (stub outbound log) |

**Test Data:** `test-data/model-picker-cases.csv` #G02
**Postconditions:** Active = `openai-gpt` with model `gpt-4o`.

---

### TC-389-101: Deleting the ACTIVE profile resets `activeProfileId`

| Field | Value |
|-------|-------|
| **ID** | TC-389-101 |
| **Priority** | P1 |
| **Type** | e2e |
| **AC Mapping** | AC4, AC5 |
| **Preconditions** | ≥ 2 profiles; active = `openai-gpt` (per TC-389-100 postcondition) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click Delete on active row `OpenAI - GPT`; confirm | Confirmation shown; on confirm the row is removed |
| 2 | Inspect settings | `activeProfileId` reset to the FIRST remaining profile id (`lmstudio-qwen`) or `null` if none remain — never left pointing at a deleted id |
| 3 | Next chat turn | Resolves from fallback profile (or shows clear no-active state); no dangling-provider error |

**Test Data:** `test-data/profiles-valid.csv` #P04 (delete target)
**Postconditions:** Consistent active-pointer state; no dangling reference.

---

### TC-389-102: Add profile using provider-default URL

| Field | Value |
|-------|-------|
| **ID** | TC-389-102 |
| **Priority** | P2 |
| **Type** | unit |
| **AC Mapping** | AC2 |
| **Preconditions** | Service under test = add-profile use case (validation + persistence), vitest with mocked settings writer |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call add-profile with `provider=ollama`, `useDefaultUrl=true`, `baseUrl=undefined`, `model=llama3-8b` | Validation passes |
| 2 | Inspect persisted profile | Stored WITHOUT `baseUrl` key (undefined, not `""`), `useDefaultUrl=true` |
| 3 | Resolve via config bridge | Effective base URL = provider default mapping (`PROVIDER_BASE_URL_KEYS`), not empty string |

**Test Data:** `test-data/profiles-valid.csv` #P03 default-URL semantics
**Postconditions:** — (unit scope).

---

### TC-389-103: Model item shows Free badge

| Field | Value |
|-------|-------|
| **ID** | TC-389-103 |
| **Priority** | P2 |
| **Type** | e2e |
| **AC Mapping** | AC6 |
| **Preconditions** | Picker contains free model `Qwen 7B` (lmstudio group) and paid model `GPT-4o` (openai group) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open chat model picker | Popup opens < 300 ms (also prepares TC-389-602) |
| 2 | Inspect item `Qwen 7B` | Renders green "Free" badge |
| 3 | Inspect item `GPT-4o` | No Free badge |

**Test Data:** `test-data/model-picker-cases.csv` #G03
**Postconditions:** None.

---

### TC-389-104: Migration field mapping with base-URL override

| Field | Value |
|-------|-------|
| **ID** | TC-389-104 |
| **Priority** | P2 |
| **Type** | unit |
| **AC Mapping** | AC8 |
| **Preconditions** | Migration mapping function under test with legacy input row loaded in-memory |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Feed mapping: provider `openai`, model `gpt-4o-mini`, `openai.baseUrl=https://api.custom.com/v1` | Output profile: `id=openai`, `label=OpenAI - default`, `baseUrl=https://api.custom.com/v1`, `useDefaultUrl=false` |
| 2 | Feed mapping with `useDefaultUrl=true` (no override) | Output: `baseUrl=undefined`, `useDefaultUrl=true` |
| 3 | Feed mapping with empty model | Output: `model=auto` fallback (never empty string persisted) |

**Test Data:** `test-data/migration-legacy-config.csv` #M02 (+fallback row)
**Postconditions:** — mapping is pure.

---

### TC-389-105: Migration already-migrated — idempotent re-run

| Field | Value |
|-------|-------|
| **ID** | TC-389-105 |
| **Priority** | P1 |
| **Type** | integration |
| **AC Mapping** | AC8 |
| **Preconditions** | Migration previously completed (globalState flag set to `sdlcAgents.configMigration.v1_55_0.completed=true`); profiles list has 1 entry |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Deactivate + re-activate extension | Second activation completes quickly |
| 2 | Inspect profiles | STILL 1 profile — no duplicate Profile #1 created |
| 3 | Inspect logs | No migration executed (metric `llm.migration.run` stays ≤ 1); no error/warn spam |

**Test Data:** `test-data/migration-legacy-config.csv` #M04
**Postconditions:** State unchanged after re-activation.

---

### TC-389-106: Migration with dirty/legacy config

| Field | Value |
|-------|-------|
| **ID** | TC-389-106 |
| **Priority** | P2 |
| **Type** | integration |
| **AC Mapping** | AC8 |
| **Preconditions** | Legacy state: provider `lmstudio` present; `sdlcAgents.llm.model` MISSING; legacy secret ONLY under old vendor prefix key `kiroSdlc.lmstudioApiKey=sk-legacy-404` (vs new `sdlcAgents.lmstudioApiKey`) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Activate extension | Migration does NOT crash; tolerates missing flat key |
| 2 | Inspect Profile #1 | Created with `model=auto` fallback; `lastTestStatus=untested` |
| 3 | Call `readLlmApiKey(secrets, "lmstudio")` | Returns `sk-legacy-404` — legacy-prefixed secret migrated silently on read (deprecation path), key now visible under `sdlcAgents.lmstudioApiKey` |

**Test Data:** `test-data/migration-legacy-config.csv` #M03
**Postconditions:** Recovered state; no data loss.

---

### TC-389-107: Concurrent double activation — migration race

| Field | Value |
|-------|-------|
| **ID** | TC-389-107 |
| **Priority** | P2 |
| **Type** | integration |
| **AC Mapping** | AC8 |
| **Preconditions** | Fresh legacy state (as TC-389-008); harness fires two `migrateOldConfig()`/dual activation paths concurrently |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Launch both activation paths nearly simultaneously | Both complete; no unhandled rejection |
| 2 | Inspect profiles | Exactly ONE Profile #1 (`lmstudio`) — no duplicates, no corrupted array |
| 3 | Inspect flag | globalState migration flag set exactly once |

**Test Data:** `test-data/migration-legacy-config.csv` #M05
**Postconditions:** Single migrated profile.

---

## 3. Functional Test Cases — Exception/Error Flows

### TC-389-200: Test connection — failure (HTTP error)

| Field | Value |
|-------|-------|
| **ID** | TC-389-200 |
| **Priority** | P1 |
| **Type** | integration |
| **AC Mapping** | AC7 |
| **Preconditions** | Mock endpoint returns HTTP 401 for profile `lmstudio-qwen` (second run uses 500) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Trigger connection test | Request errors promptly (< 5 s) |
| 2 | Inspect profile | `lastTestStatus=failed`; `lastTestedAt` updated |
| 3 | Inspect UI | Red "failed" badge; detailed error message shown (status/cause), UI remains responsive |

**Test Data:** `test-data/connection-test-cases.csv` #C02
**Postconditions:** Status persisted as failed.

---

### TC-389-201: Test connection — timeout after 5 s

| Field | Value |
|-------|-------|
| **ID** | TC-389-201 |
| **Priority** | P1 |
| **Type** | integration |
| **AC Mapping** | AC7 |
| **Preconditions** | Profile `ollama-local` baseUrl points to a black-hole port (no response); timeout threshold = 5000 ms (per `testOllama` convention) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Trigger connection test | No response arrives; test aborts at ~5 s |
| 2 | Assert timing | Elapsed time ≤ 5 s + small grace (≤ 6 s); status set to `failed` after timeout |
| 3 | Inspect UI | Error detail mentions timeout; UI thread NOT blocked (other interactions still responsive) |

**Test Data:** `test-data/connection-test-cases.csv` #C03
**Postconditions:** Status = failed; no hang.

---

### TC-389-202: Delete confirmation cancelled

| Field | Value |
|-------|-------|
| **ID** | TC-389-202 |
| **Priority** | P2 |
| **Type** | e2e |
| **AC Mapping** | AC4 |
| **Preconditions** | Profile `lmstudio-qwen` exists |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click Delete on `LMStudio - Qwen` | Confirmation dialog appears |
| 2 | Click Cancel | Dialog closes WITHOUT deletion |
| 3 | Verify state | Row still present; `sdlcAgents.llm.profiles` unchanged |

**Test Data:** `test-data/profiles-valid.csv` #P01 (cancel target)
**Postconditions:** No deletion.

---

### TC-389-203: Save with invalid data — error shown, no navigation

| Field | Value |
|-------|-------|
| **ID** | TC-389-203 |
| **Priority** | P2 |
| **Type** | e2e |
| **AC Mapping** | AC2, AC3 |
| **Preconditions** | Add/Edit modal open |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Attempt save with provider `madeup-ai` (unknown, via injected payload) | Error "Unknown provider" shown; modal stays open; NO profile persisted |
| 2 | Attempt save with empty label | Validation error — profile label must not be empty; nothing saved |
| 3 | Attempt save with empty model | Validation error — model required; nothing saved |
| 4 | Attempt save with invalid base URL `not-a-url` (baseUrl provided) | Validation error — base URL must be a valid URL; nothing saved |

**Test Data:** `test-data/profiles-invalid-slug.csv` rows D02 (unknown provider), D04 (empty label), D05 (empty model), D06 (bad URL)
**Postconditions:** Settings unchanged; modal state preserved.

---

### TC-389-204: No connected profiles — "No models available"

| Field | Value |
|-------|-------|
| **ID** | TC-389-204 |
| **Priority** | P3 |
| **Type** | e2e |
| **AC Mapping** | AC6 |
| **Preconditions** | All profiles `lastTestStatus ∈ {untested, failed}` |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open chat model picker | Picker opens with zero selectable items |
| 2 | Inspect message | Friendly message "No models available" (per FSD Story 6 error handling) |
| 3 | Confirm no crash | Chat default/legacy selection intact; no empty-popup stacking error |

**Test Data:** `test-data/model-picker-cases.csv` #G04
**Postconditions:** None.

---

### TC-389-205: Profiles load failure — error message + empty table

| Field | Value |
|-------|-------|
| **ID** | TC-389-205 |
| **Priority** | P3 |
| **Type** | unit |
| **AC Mapping** | AC1 |
| **Preconditions** | Settings reader mocked to THROW when getting `sdlcAgents.llm.profiles` |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Load profile list (table data provider) with throwing reader | Error handled — component survives |
| 2 | Assert table state | Empty table rendered + error message surfaced (per FSD Story 1 error handling) |
| 3 | Assert no crash loop | No unhandled rejection propagating to activation flow |

**Test Data:** `test-data/profiles-valid.csv` (reference shape only)
**Postconditions:** Graceful degradation.

---

## 4. Business Rule Validation

### TC-389-300: `readProviderTurnConfig()` resolves from active profile, NOT flat keys

| Field | Value |
|-------|-------|
| **ID** | TC-389-300 |
| **Priority** | P1 |
| **Type** | unit |
| **AC Mapping** | AC5, AC9 |
| **Preconditions** | Config bridge under test; seeded: `activeProfileId=lmstudio-qwen`; profile values provider=`lmstudio`, model=`qwen2-14b-instruct`; STALE flat keys still present: `sdlcAgents.llm.provider=anthropic`, `sdlcAgents.llm.model=claude-3-sonnet` |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `readProviderTurnConfig()` | Returns `{provider: "lmstudio", model: "qwen2-14b-instruct", …}` resolved from ACTIVE PROFILE |
| 2 | Assert flat values ignored | Stale flat values (`anthropic` / `claude-3-sonnet`) are NOT returned — proves no direct flat-key read |
| 3 | Swap active profile to `openai-gpt` | Returns `openai`/`gpt-4o` after change — resolution follows the pointer |

**Test Data:** `test-data/profiles-valid.csv` #P01/#P04 + stale flat keys
**Postconditions:** — unit assertions only.

---

### TC-389-301: Secret-key isolation via `llmSecretKey(id)` / `readLlmApiKey()`

| Field | Value |
|-------|-------|
| **ID** | TC-389-301 |
| **Priority** | P1 |
| **Type** | unit |
| **AC Mapping** | AC2, AC10 (secret-key convention) |
| **Preconditions** | Secret-key helper module under test with an in-memory/fake SecretStorage adapter |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Compute `llmSecretKey("lmstudio-qwen")` | Returns `sdlcAgents.lmstudio-qwenApiKey` (exact format `sdlcAgents.<id>ApiKey`) |
| 2 | Write key for profile A (`sk-A-111`), then READ key of profile B | B returns undefined — no cross-profile leakage |
| 3 | Write via helper, then scan fake store | Only `sdlcAgents.<id>ApiKey` keys exist; NO namespace `llmProfile.<id>.apiKey` or arbitrary string keys created |
| 4 | Call `readLlmApiKey(secrets, missingId)` | Returns undefined — helper NEVER throws |

**Test Data:** `test-data/static-checks.csv` #S04 (helper contract row); fake storage pairs
**Postconditions:** Isolation proven at helper level.

---

### TC-389-302: `readLlmApiKey` auto-migrates legacy key on read

| Field | Value |
|-------|-------|
| **ID** | TC-389-302 |
| **Priority** | P2 |
| **Type** | unit |
| **AC Mapping** | AC8 (legacy secret path) |
| **Preconditions** | Fake SecretStorage with ONLY legacy key `kiroSdlc.openrouterApiKey=sk-legacy-777` present |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `readLlmApiKey(secrets, "openrouter")` | Returns `sk-legacy-777` (legacy read path) |
| 2 | Inspect fake store after read | Value mirrored under `sdlcAgents.openrouterApiKey` (migration-on-read), legacy entry left in place (fail-safe) |

**Test Data:** `test-data/migration-legacy-config.csv` #M03 secret columns
**Postconditions:** Legacy key promoted on first read.

---

## 5. Boundary & Negative Testing

### TC-389-400: Invalid slug rejected — `"My Profile!"` and friends

| Field | Value |
|-------|-------|
| **ID** | TC-389-400 |
| **Priority** | P1 |
| **Type** | unit |
| **AC Mapping** | AC10 |
| **Preconditions** | Slug validator + add-profile validation under test |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Validate `My Profile!` (spaces, uppercase, `!`) | REJECTED — error "Profile ID must be a valid slug [a-z0-9-]+" |
| 2 | Validate each row of `profiles-invalid-slug.csv` | ALL rejected (`my.profile`, `WITH-UPPER`, leading space, empty string, unicode `prófile`, duplicate id already in store) |
| 3 | Verify persistence guard for UI path | Invalid profileId produces an invalid secret key — profile MUST NOT be saved |

**Test Data:** `test-data/profiles-invalid-slug.csv` #D01–D03, D07 (all invalid rows)
**Postconditions:** Nothing persisted.

---

### TC-389-401: Slug boundary matrix (valid limits)

| Field | Value |
|-------|-------|
| **ID** | TC-389-401 |
| **Priority** | P2 |
| **Type** | unit |
| **AC Mapping** | AC10 |
| **Preconditions** | Slug validator under test |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Validate minimal slug `"a"` | ACCEPTED |
| 2 | Validate max-length 64-char lowercase slug (digits + hyphens) | ACCEPTED |
| 3 | Validate known dimension slugs `lmstudio-qwen`, `openrouter-anthropic` | ACCEPTED |
| 4 | Validate hyphen-leading/trailing forms per regex | Behavior documented & consistent with `[a-z0-9-]+` (any hyphen-only string matches regex — feature accepted, no crash; secret key `sdlcAgents.-ApiKey` remains well-formed) |
| 5 | Validate 65-char over-limit string | Decision point: rejected by UI maxlength OR accepted-by-regex — MUST be consistently enforced in BOTH validator and UI input cap |

**Test Data:** `test-data/profiles-invalid-slug.csv` #B01–B03 (valid bounds) + inline 65-char case
**Postconditions:** — validator contract pinned.

---

## 6. UI/UX Testing

### TC-389-500: Profile row actions & status badges

| Field | Value |
|-------|-------|
| **ID** | TC-389-500 |
| **Priority** | P2 |
| **Type** | e2e |
| **AC Mapping** | AC1, AC7 |
| **Preconditions** | Settings table open with one row in each status: connected / failed / untested |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Inspect action buttons per row | Edit, Test, Delete, Set-active — all present, all clickable |
| 2 | Inspect badges | connected = green, failed = red, untested = gray (exact palette per FSD §3.1 UI spec #5) |
| 3 | Click "Set active" on the connected row | Highlight state toggles visibly (indicator distinct from badge) |

**Test Data:** `test-data/profiles-valid.csv` status variants
**Postconditions:** None.

---

### TC-389-501: API key is masked in Edit modal (never plaintext)

| Field | Value |
|-------|-------|
| **ID** | TC-389-501 |
| **Priority** | P1 |
| **Type** | e2e |
| **AC Mapping** | AC3 + Security |
| **Preconditions** | Profile with stored API key exists |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open Edit modal on profile with key `sk-test-anthropic-001` | API key field rendered as password/masked input (dots) |
| 2 | Scan DOM + page text for plaintext | Raw key NEVER appears in DOM text, tooltip, or title attribute |
| 3 | Close without saving; check logs | No key value printed to console/output panel |

**Test Data:** `test-data/profiles-valid.csv` #P02 key value
**Postconditions:** Unchanged.

---

### TC-389-510: Manual exploratory user journey (migration → CRUD → test → set-active → picker → chat turn)

| Field | Value |
|-------|-------|
| **ID** | TC-389-510 |
| **Priority** | P2 |
| **Type** | manual |
| **AC Mapping** | AC1–AC8 (journey) |
| **Preconditions** | Dev host on SA4E-389 build with legacy flat config present (journey starts from pre-release state); evidence dir writable |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Reload/host extension and open Settings → LLM Provider | Profile #1 auto-created from legacy config; table shows it (screenshots attach to evidence) |
| 2 | Add second profile; Edit it; Set active | Each action visibly reflected in table + settings |
| 3 | Click Test on Univ/Critical row then on working local profile | failed badge for unreachable; connected for reachable |
| 4 | Open Chat model picker; select a model | Grouped by provider; selection switches profile + model in one op |
| 5 | Send a chat turn; confirm turn completes | Turn used the selected profile's provider/model |
| 6 | Delete the active profile | activeProfileId reset; picker/chat degrade gracefully |
| 7 | Record UX notes | Intuitiveness, confirmation dialogs, any layout nits → defects if Major+ |

**Test Data:** `test-data/migration-legacy-config.csv` #M01 seed then manual actions
**Postconditions:** Evidence screenshots under `documents/SA4E-389/evidence/`; UX observations logged.

---

## 7. Static Checks (labeled as static — merge gates)

### TC-389-403: Flat-key absence gate — grep for direct `llm.provider` / `llm.model` reads

| Field | Value |
|-------|-------|
| **ID** | TC-389-403 |
| **Priority** | P1 |
| **Type** | static (scripted grep) |
| **AC Mapping** | AC9 (negative test) |
| **Preconditions** | Full extension source on SA4E-389 branch; whitelist from `test-data/static-checks.csv` applied |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run grep over `extension/src/` for flat-key reads of `sdlcAgents.llm\.provider` / `sdlcAgents.llm\.model` (incl. config `.get(` accessor patterns) | ZERO hits outside ALLOWED files: `pi-provider-config-bridge.ts` (resolution layer) and `llm-profile-migration.ts` (legacy reader) |
| 2 | Verify each allowed occurrence is the profile-resolution rewrite or legacy migration read | No business-logic consumer reads flat keys directly |
| 3 | Classify result | Any unpermitted hit = FAIL → block merge, require refactor to `readProviderTurnConfig()` (per FSD §3.8) |

**Test Data:** `test-data/static-checks.csv` #S01 patterns & whitelist
**Postconditions:** AC9 invariant satisfied.

---

### TC-389-404: Secret-bypass gate — grep for direct `secrets.get/store` on LLM keys

| Field | Value |
|-------|-------|
| **ID** | TC-389-404 |
| **Priority** | P1 |
| **Type** | static (scripted grep) |
| **AC Mapping** | AC9 + Security (no-workaround rule) |
| **Preconditions** | Same source tree; whitelist from `test-data/static-checks.csv` |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Grep `extension/src/` for `secrets.(get|store)(` + literal `ApiKey` strings | Hits allowed ONLY inside `llm-secret-keys.ts` (and test fixtures under tests/) |
| 2 | Grep for forbidden namespaces (`llmProfile.` as secret source, `llm.apiKey`-style storage) | ZERO hits |
| 3 | Classify result | Any bypass = FAIL → block merge (TDD §5.2/§7.2) |

**Test Data:** `test-data/static-checks.csv` #S02 patterns & whitelist
**Postconditions:** Single source of truth preserved.

---

### TC-389-603: Code standards static check — files ≤ 200 lines / functions ≤ 20 lines

| Field | Value |
|-------|-------|
| **ID** | TC-389-603 |
| **Priority** | P2 |
| **Type** | static (line-count + lint script) |
| **AC Mapping** | TDD §5.1 Code Standards (constraint from ticket scope — file ≤ 200 lines) |
| **Preconditions** | All new/changed files from SA4E-389 known (LlmProviderConfig / llm-profile-migration / profiles service / picker UI changes) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run line-count script over new/changed `.ts` files | Every file ≤ 200 lines |
| 2 | Run function-level lint (or AST script) for new functions | Every function ≤ 20 lines |
| 3 | Wave/flag exceptions | Any violation documented as defect (P2) or pre-approved waiver with justification in TEST-REPORT |

**Test Data:** `test-data/static-checks.csv` #S03 thresholds
**Postconditions:** Standards gate documented.

---

## 8. Non-Functional Testing — Performance

### TC-389-601: Profile table render < 500 ms with 10 profiles

| Field | Value |
|-------|-------|
| **ID** | TC-389-601 |
| **Priority** | P3 |
| **Type** | e2e (timed assertion) |
| **AC Mapping** | AC1 + NFR (FSD §4: table with ≤ 10 profiles renders < 500 ms) |
| **Preconditions** | 10 profile fixtures seeded; fresh settings panel instance |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to LLM Provider tab (cold open), measure table render completion | Render time ≤ 500 ms (median of 3 runs) |
| 2 | Re-navigate (warm) 2× | Both ≤ 500 ms; no re-render thrash |
| 3 | Record hardware note | Documented in TEST-REPORT for waivability |

**Test Data:** `test-data/profiles-valid.csv` × 10 (duplicated fixtures)
**Postconditions:** — timing only.

---

### TC-389-602: Model picker opens < 300 ms

| Field | Value |
|-------|-------|
| **ID** | TC-389-602 |
| **Priority** | P3 |
| **Type** | e2e (timed assertion) |
| **AC Mapping** | AC6 + NFR (FSD §4: popup opens < 300 ms) |
| **Preconditions** | ≥ 2 connected profiles; chat window open |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click model selector; measure popup visibility latency | ≤ 300 ms (median of 3 runs) |
| 2 | Repeat after switching active profile once | Grouping cached/rebuilt within same bound |

**Test Data:** `test-data/model-picker-cases.csv` #G05
**Postconditions:** — timing only.

---

## 9. Requirements Traceability Matrix (RTM)

| Requirement | Source | Test Cases | Status |
|-------------|--------|------------|--------|
| AC1 — Profile table displays all LlmProfile entries | BRD §2.2 / FSD §3.1 | TC-389-001, TC-389-205, TC-389-500, TC-389-510, TC-389-601 | Covered |
| AC2 — Add profile + secret key via `llmSecretKey()` | BRD / FSD §3.2 | TC-389-002, TC-389-102, TC-389-203, TC-389-301, TC-389-510 | Covered |
| AC3 — Edit profile (pre-filled modal, masked key) | BRD / FSD §3.3 | TC-389-003, TC-389-203, TC-389-501, TC-389-510 | Covered |
| AC4 — Delete profile (confirm + active reset) | BRD / FSD §3.4 | TC-389-004, TC-389-101, TC-389-202, TC-389-510 | Covered |
| AC5 — Set active profile; SSOT resolution | BRD / FSD §3.5 | TC-389-005, TC-389-100, TC-389-101, TC-389-300, TC-389-510 | Covered |
| AC6 — Model picker grouped by provider (connected-only, Free badge) | BRD / FSD §3.6 | TC-389-006, TC-389-100, TC-389-103, TC-389-204, TC-389-510, TC-389-602 | Covered |
| AC7 — Test connection (connected/failed/timeout, badge, timestamp) | BRD / FSD §3.7 | TC-389-007, TC-389-200, TC-389-201, TC-389-500 | Covered |
| AC8 — One-time migration → Profile #1 (idempotent, backward compatible, key auto-migrated) | BRD / FSD §2.4 | TC-389-008, TC-389-104, TC-389-105, TC-389-106, TC-389-107, TC-389-302, TC-389-510 | Covered |
| AC9 — No flat-key reads outside active-profile resolution layer (`readProviderTurnConfig` SSOT) | BRD / FSD §3.8 | TC-389-300, TC-389-403, TC-389-404 | Covered |
| AC10 — profileId slug validation `[a-z0-9-]+`; secret key only via `llmSecretKey(id)/readLlmApiKey()` | BRD / FSD §2.5, §3.2 | TC-389-400, TC-389-401, TC-389-301 | Covered |

**Coverage Summary:**

| Category | Total | Covered | Coverage % |
|----------|-------|---------|------------|
| Acceptance Criteria (AC1–AC10) | 10 | 10 | 100% |
| FSD Stories (1–9) | 9 | 9 | 100% |
| Validation Rule Groups (slug/label/model/provider/URL) | 5 | 5 | 100% |
| Error Handling Patterns (Story 1/2/4/6/7) | 5 | 5 | 100% |
| **Overall** | **10 ACs** | **10** | **100%** |

---

## 10. Appendix

### 10.1 Test Data Setup

| File | Seed Produces | Loading Notes |
|------|---------------|---------------|
| `test-data/profiles-valid.csv` | Fixtures P01–P04 written into `sdlcAgents.llm.profiles` (+ masked keys into fake SecretStorage for UT) | E2E seed script reads CSV → applies via settings writer before panel opens |
| `test-data/profiles-invalid-slug.csv` | Invalid-slug & invalid-field matrix (D01–D07) | Runs against validator/API only — never persisted |
| `test-data/migration-legacy-config.csv` | Legacy flat keys + legacy secrets per scenario (M01–M05) | Written to scratch VS Code profile (settings.json + fake secrets) before activation |
| `test-data/connection-test-cases.csv` | Mock endpoint behaviors (C01–C03) | Stub server binds per row; dead-port row needs no listener |
| `test-data/model-picker-cases.csv` | Picker visibility/badge fixtures (G01–G05) | Combination of profile statuses from profiles-valid.csv |
| `test-data/static-checks.csv` | Grep patterns, file whitelists, thresholds (S01–S04) | Consumed by check scripts; results logged as text evidence |

Key seeded values (concrete): profile ids `lmstudio-qwen`, `openrouter-anthropic`, `ollama-local`, `openai-gpt`; dummy keys `sk-test-anthropic-001`, `sk-test-openai-001`, `sk-legacy-901`, `sk-legacy-404`, `sk-legacy-777`; legacy model `qwen2-7b-instruct`; override base URL `https://api.custom.com/v1`; mock success endpoint `127.0.0.1:<mockPort>/v1/models`; timeout port `127.0.0.1:59999` (nothing bound).

### 10.2 Environment Configuration

- Extension Development Host launched from SA4E-389 worktree with isolated `--user-data-dir` so Global settings and SecretStorage don't pollute the dev machine profile.
- Mock provider stub started before IT suite (`tests/integration` setup hook) and killed after; port recorded into env for fixtures.
- Grep/line-count scripts run from repo root, restricted to `extension/src/**` (prod code) — tests and docs excluded from static gates except where noted.
- Performance runs: close background-heavy apps; record CPU count in evidence notes.

### 10.3 Execution Notes (for Phase 6)

- Re-run failing `TC-389-1xx` e2e cases max 2 retries before classifying flaky vs defect.
- Every FAIL must record: case ID, step number, actual vs expected, evidence path, defect key.
- Automation source tree follows TDD §11 (vitest + Playwright, TypeScript, files under the repo test directories, file naming `*.e2e.test.ts` / `*.ui.e2e.test.ts`).
