# Software Test Cases (STC)

## SDLC-Agents-4-Enterprise — SA4E-390: LLM Configuration UI Redesign + Chat Model Picker

---

### Document Information

| Field | Value |
|-------|-------|
| **Jira Ticket** | SA4E-390 |
| **Title** | LLM Configuration UI Redesign + Chat Model Picker |
| **Author** | QA Agent |
| **Version** | 1.0 |
| **Date** | 2026-10-30 |
| **Status** | Draft — pending BA review (Review Gate) |
| **Related STP** | STP.md v1.0 — `documents/SA4E-390/STP.md` |
| **Related FSD** | FSD.md v1.0 — `documents/SA4E-390/FSD.md` |
| **Related TDD** | TDD.md v1.0 — `documents/SA4E-390/TDD.md` |

---

### Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-30 | QA Agent | Initiate document — Phase 4 Test Planning; 33 test cases covering AC1–AC10 + NFRs |

---

### Test Case Summary

| Category | ID Range | Count | Priority |
|----------|----------|-------|----------|
| Functional — Happy Path | TC-390-001 … TC-390-008 | 8 | P1 |
| Functional — Alternative Flows | TC-390-100 … TC-390-107 | 8 | P1–P2 |
| Functional — Exception/Error Flows | TC-390-200 … TC-390-205 | 6 | P1–P3 |
| Business Rule Validation | TC-390-300 … TC-390-302 | 3 | P1–P2 |
| Boundary & Negative Testing | TC-390-400, TC-390-401 | 2 | P1–P2 |
| UI/UX Testing | TC-390-500, TC-390-501, TC-390-510 | 3 | P1–P2 |
| Static Checks (incl. masked-key grep) | TC-390-403, TC-390-404, TC-390-601, TC-390-602 | 4 | P1–P2 |
| Non-Functional — Performance | TC-390-601, TC-390-602 | 2 | P3 |
| **Total** | | **33** | P1×19, P2×10, P3×4 |

Type distribution: unit ×8, integration ×7, e2e ×14, manual ×2, static ×4. All test data files live in `documents/SA4E-390/test-data/`.

---

## 1. Functional Test Cases — Happy Path

### TC-390-001: Provider table displays all 6 columns with correct data

| Field | Value |
|-------|-------|
| **ID** | TC-390-001 |
| **Priority** | P1 |
| **Type** | e2e |
| **AC Mapping** | AC1 |
| **Preconditions** | Extension dev host running SA4E-390 build; `sdlcAgents.llm.profiles` seeded with 3 fixtures from `test-data/providers-list.csv` rows R01–R03 (anthropic, openai, lmstudio) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open Settings Panel → tab "LLM Provider" | Tab renders with provider table |
| 2 | Inspect table header | Exactly 6 columns: Name, Status, API Key, Base URL, Model, Actions |
| 3 | Inspect table rows | Exactly 3 rows matching seeded providers in persisted order |
| 4 | Inspect row columns | Each row shows provider name, status badge, masked API key, base URL, model name, action buttons (Edit/Test/Delete) |

**Test Data:** `test-data/providers-list.csv` #R01–R03  
**Postconditions:** No state change — read-only verification.

---

### TC-390-002: Add Provider button opens Edit Provider modal

| Field | Value |
|-------|-------|
| **ID** | TC-390-002 |
| **Priority** | P1 |
| **Type** | e2e |
| **AC Mapping** | AC2 |
| **Preconditions** | Dev host running; table currently holds the 3 seeded fixtures |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click "+ Add Provider" button | Edit Provider modal opens (empty, provider dropdown present with 5 options) |
| 2 | Verify modal fields | Fields: Provider (dropdown), API Key (masked input), Base URL (text), Model (text), Test Connection button, Save button |
| 3 | Inspect provider dropdown | Contains: anthropic, openai, lmstudio, openrouter, ollama |
| 4 | Click Cancel | Modal closes; table unchanged |

**Test Data:** N/A  
**Postconditions:** No state change.

---

### TC-390-003: Add new provider happy path

| Field | Value |
|-------|-------|
| **ID** | TC-390-003 |
| **Priority** | P1 |
| **Type** | e2e |
| **AC Mapping** | AC2, AC3 |
| **Preconditions** | Dev host running; table currently holds the 3 seeded fixtures |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click "+ Add Provider" | Edit Provider modal opens |
| 2 | Select provider `openrouter`; fill API key `sk-test-openrouter-001`, base URL `https://openrouter.ai/api/v1`, model `openrouter-mixtral` | Inputs accepted; API key field masked |
| 3 | Click Save | Modal closes; new row `OpenRouter | connected | ●●●●●●●● | https://openrouter.ai/api/v1 | openrouter-mixtral | Edit/Test/Delete` appears |
| 4 | Inspect persisted settings | `sdlcAgents.llm.profiles` now contains 4 entries; new entry matches inputs verbatim |
| 5 | Inspect secret storage | Key exists at `llmSecretKey("openrouter-mixtral")` = `sdlcAgents.openrouter-mixtralApiKey` |

**Test Data:** `test-data/providers-list.csv` #R04 (openrouter)  
**Postconditions:** 4 providers stored. Subsequent cases assume this fixture set.

---

### TC-390-004: Edit provider — modal pre-filled with current values

| Field | Value |
|-------|-------|
| **ID** | TC-390-004 |
| **Priority** | P1 |
| **Type** | e2e |
| **AC Mapping** | AC3 |
| **Preconditions** | Dev host running; table has 4 providers (3 seeded + openrouter from TC-390-003) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click Edit button on `OpenRouter` row | Edit Provider modal opens pre-filled with current values |
| 2 | Verify pre-filled fields | Provider=openrouter, API Key=●●●●●●●● (masked), Base URL=https://openrouter.ai/api/v1, Model=openrouter-mixtral |
| 3 | Change model to `openrouter-claude-3-5-sonnet` | Input accepted |
| 4 | Click Save | Modal closes; row updates to new model; persisted settings reflect change |

**Test Data:** Fixture from TC-390-003  
**Postconditions:** Provider updated; 4 providers remain.

---

### TC-390-005: Delete provider with confirmation

| Field | Value |
|-------|-------|
| **ID** | TC-390-005 |
| **Priority** | P1 |
| **Type** | e2e |
| **AC Mapping** | AC4 (partial), AC1 |
| **Preconditions** | Dev host running; table has 4 providers |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click Delete button on `OpenRouter` row | Confirmation dialog appears |
| 2 | Click Confirm | Row removed from table; table now shows 3 providers |
| 3 | Inspect persisted settings | `sdlcAgents.llm.profiles` now contains 3 entries; OpenRouter entry removed |
| 4 | Inspect secret storage | Key `sdlcAgents.openrouter-mixtralApiKey` no longer exists |

**Test Data:** Fixture from TC-390-003  
**Postconditions:** 3 providers remain; secret cleaned up.

---

### TC-390-006: Status badges render correctly for all three states

| Field | Value |
|-------|-------|
| **ID** | TC-390-006 |
| **Priority** | P1 |
| **Type** | e2e |
| **AC Mapping** | AC4 |
| **Preconditions** | Dev host running; table has 3 seeded providers with known lastTestStatus: anthropic=connected, openai=failed, lmstudio=untested |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open Settings Panel → tab "LLM Provider" | Table renders with 3 rows |
| 2 | Inspect status badges | Anthropic row: green "Connected"; OpenAI row: red "Failed"; LMStudio row: gray "Untested" |
| 3 | Verify badge styling | Connected=green (#28a745), Failed=red (#dc3545), Untested=gray (#6c757d) |

**Test Data:** `test-data/providers-list.csv` #R01–R03 with mocked status  
**Postconditions:** No state change.

---

### TC-390-007: Save All persists workspace config and SecretStorage

| Field | Value |
|-------|-------|
| **ID** | TC-390-007 |
| **Priority** | P1 |
| **Type** | e2e |
| **AC Mapping** | AC5 |
| **Preconditions** | Dev host running; table has 3 seeded providers with modified API keys and base URLs |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Modify API key for `anthropic` to `sk-new-anthropic-001` via Edit modal | Modal saves; row updates |
| 2 | Modify base URL for `openai` to `https://custom.openai.com/v1` via Edit modal | Modal saves; row updates |
| 3 | Click "Save All" button | All changes persisted atomically |
| 4 | Inspect workspace config | `sdlcAgents.llm.profiles` contains all 3 providers with updated values |
| 5 | Inspect SecretStorage | Keys exist at `llmSecretKey("anthropic-claude-3-haiku")`, `llmSecretKey("openai-gpt-4o")`, `llmSecretKey("lmstudio-qwen2-7b")` with updated values |

**Test Data:** Modified fixtures from seeded data  
**Postconditions:** 3 providers with updated config persisted.

---

### TC-390-008: Model Picker popup opens and replaces plain dropdown

| Field | Value |
|-------|-------|
| **ID** | TC-390-008 |
| **Priority** | P1 |
| **Type** | e2e |
| **AC Mapping** | AC6 |
| **Preconditions** | Dev host running; Chat panel open; at least 2 providers with `connected` status |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click model selector in Chat panel | Model Picker popup opens (not a plain dropdown) |
| 2 | Verify popup structure | Contains: search field, "Recent" section, model list grouped by provider |
| 3 | Verify no plain dropdown | No `<select>` element for model selection present |
| 4 | Close popup (click outside or Esc) | Popup closes; Chat panel unchanged |

**Test Data:** `test-data/providers-list.csv` #R01–R02 (connected providers)  
**Postconditions:** No state change.

---

## 2. Functional Test Cases — Alternative Flows

### TC-390-100: Model Picker selection switches model in ONE operation

| Field | Value |
|-------|-------|
| **ID** | TC-390-100 |
| **Priority** | P1 |
| **Type** | e2e |
| **AC Mapping** | AC6, AC9 |
| **Preconditions** | Dev host running; Chat panel open; Model Picker popup open with multiple models visible |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click model `gpt-4o` (OpenAI, paid badge) in picker | Model selected; popup closes; Chat panel shows `gpt-4o` as current model |
| 2 | Verify persistence | `llm.model` in `model-config.ts` updated to `gpt-4o` |
| 3 | Send a chat message | Request uses `gpt-4o` model |

**Test Data:** `test-data/model-names.csv` #gpt4o  
**Postconditions:** Active model changed to gpt-4o.

---

### TC-390-101: Search filter in Model Picker works in real-time

| Field | Value |
|-------|-------|
| **ID** | TC-390-101 |
| **Priority** | P1 |
| **Type** | e2e |
| **AC Mapping** | AC7 |
| **Preconditions** | Dev host running; Chat panel open; Model Picker popup open with 5+ models |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Type "gpt" in search field | List filters to show only models containing "gpt" (e.g., gpt-4o) |
| 2 | Clear search field | All models reappear |
| 3 | Type "haiku" | Only `claude-3-haiku` (Anthropic, Free badge) appears |
| 4 | Type "nonexistentmodel" | Empty state: "No models found" message shown |

**Test Data:** `test-data/shortcut-scenarios.csv` #R03 (filter-by-prefix), #R02 (empty-search-no-results)  
**Postconditions:** Search field cleared on close.

---

### TC-390-102: Recent section shows recently used models

| Field | Value |
|-------|-------|
| **ID** | TC-390-102 |
| **Priority** | P2 |
| **Type** | e2e |
| **AC Mapping** | AC8 |
| **Preconditions** | Dev host running; user previously selected `gpt-4o` and `claude-3-haiku` in prior sessions |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open Model Picker popup | "Recent" section appears at top with 2 models: `gpt-4o` (OpenAI) and `claude-3-haiku` (Anthropic) |
| 2 | Click `claude-3-haiku` from Recent | Model selected; popup closes; Chat uses `claude-3-haiku` |
| 3 | Reopen picker | Recent section now shows `claude-3-haiku` first, then `gpt-4o` |

**Test Data:** `test-data/shortcut-scenarios.csv` #R01 (recent-shows-used)  
**Postconditions:** Recent order updated.

---

### TC-390-103: Model row displays name, provider, and Free badge correctly

| Field | Value |
|-------|-------|
| **ID** | TC-390-103 |
| **Priority** | P1 |
| **Type** | e2e |
| **AC Mapping** | AC9 |
| **Preconditions** | Dev host running; Model Picker popup open with all 5 providers' models |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Inspect `claude-3-haiku` row | Shows: Name="Claude 3 Haiku", Provider="Anthropic", Badge="Free" (green) |
| 2 | Inspect `gpt-4o` row | Shows: Name="OpenAI GPT-4o", Provider="OpenAI", Badge="Paid" (no Free badge) |
| 3 | Inspect `qwen2-7b-instruct` row | Shows: Name="LMStudio Qwen2-7B", Provider="LMStudio", Badge="Paid" |
| 4 | Verify badge logic | Only `haiku` (freeBadge=true in CSV) shows Free badge |

**Test Data:** `test-data/model-names.csv` (free/paid mix)  
**Postconditions:** No state change.

---

### TC-390-104: Keyboard shortcut Esc closes Model Picker

| Field | Value |
|-------|-------|
| **ID** | TC-390-104 |
| **Priority** | P1 |
| **Type** | e2e |
| **AC Mapping** | AC10 |
| **Preconditions** | Dev host running; Chat panel open; Model Picker popup open |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Press `Esc` key | Popup closes immediately |
| 2 | Verify no side effects | Chat panel unchanged; no model selection occurred |
| 3 | Reopen picker with mouse | Picker opens normally |

**Test Data:** N/A  
**Postconditions:** Picker closed.

---

### TC-390-105: Keyboard shortcut Ctrl+F focuses search field in picker

| Field | Value |
|-------|-------|
| **ID** | TC-390-105 |
| **Priority** | P1 |
| **Type** | e2e |
| **AC Mapping** | AC10 |
| **Preconditions** | Dev host running; Chat panel open; Model Picker popup open |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Press `Ctrl+F` | Search field receives focus; cursor blinking in search input |
| 2 | Type "test" | Text appears in search field; list filters accordingly |
| 3 | Press `Esc` | Search field loses focus; popup remains open |

**Test Data:** N/A  
**Postconditions:** Picker open with search field focused.

---

### TC-390-106: Keyboard shortcut Ctrl+A selects all text in search field

| Field | Value |
|-------|-------|
| **ID** | TC-390-106 |
| **Priority** | P2 |
| **Type** | e2e |
| **AC Mapping** | AC10 |
| **Preconditions** | Dev host running; Chat panel open; Model Picker popup open; search field contains "test" |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Press `Ctrl+A` while search field focused | All text "test" selected |
| 2 | Type "new" | "test" replaced with "new"; list filters to "new" |
| 3 | Press `Esc` | Search field loses focus; popup remains open |

**Test Data:** N/A  
**Postconditions:** Picker open with search field updated.

---

### TC-390-107: Shortcut keys do not conflict with editor/OS defaults

| Field | Value |
|-------|-------|
| **ID** | TC-390-107 |
| **Priority** | P2 |
| **Type** | manual |
| **AC Mapping** | AC10 |
| **Preconditions** | Dev host running on fresh VS Code profile (`--user-data-dir`); Chat panel open; Model Picker popup open |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Press `Ctrl+A` with picker open | Search field selects all (not editor "Select All") |
| 2 | Press `Ctrl+F` with picker open | Search field focuses (not editor "Find") |
| 3 | Press `Esc` with picker open | Picker closes (not editor "Close panel") |
| 4 | Close picker; press `Ctrl+A` in editor | Editor "Select All" works normally |
| 5 | Close picker; press `Ctrl+F` in editor | Editor "Find" works normally |

**Test Data:** N/A  
**Postconditions:** No global shortcut conflicts.

---

## 3. Functional Test Cases — Exception/Error Flows

### TC-390-200: Test connection — failure (HTTP error)

| Field | Value |
|-------|-------|
| **ID** | TC-390-200 |
| **Priority** | P1 |
| **Type** | e2e |
| **AC Mapping** | AC4, AC7 (partial) |
| **Preconditions** | Dev host running; table has 1 provider with invalid API key |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click "Test" button on provider row | Status badge changes to "Testing..." (spinner) |
| 2 | Wait for mock endpoint to return 401 | Status badge updates to red "Failed"; no UI freeze |
| 3 | Verify async behavior | Other rows remain interactive during test |

**Test Data:** Mock endpoint returning 401 Unauthorized  
**Postconditions:** Provider status = Failed.

---

### TC-390-201: Test connection — timeout after 5 seconds

| Field | Value |
|-------|-------|
| **ID** | TC-390-201 |
| **Priority** | P1 |
| **Type** | e2e |
| **AC Mapping** | AC4, NFR3 |
| **Preconditions** | Dev host running; table has 1 provider pointing to blocked port |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click "Test" button on provider row | Status badge changes to "Testing..." |
| 2 | Wait 5 seconds (mock timeout) | Status badge updates to red "Failed"; no UI freeze |
| 3 | Verify UI responsiveness | Other rows and buttons remain clickable during timeout |

**Test Data:** Mock endpoint on blocked port (127.0.0.1:59999)  
**Postconditions:** Provider status = Failed.

---

### TC-390-202: Add Provider modal validation — empty required fields

| Field | Value |
|-------|-------|
| **ID** | TC-390-202 |
| **Priority** | P2 |
| **Type** | e2e |
| **AC Mapping** | AC3 |
| **Preconditions** | Dev host running; table has 3 seeded providers |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click "+ Add Provider" | Modal opens |
| 2 | Leave Provider dropdown at default (no selection) | Save button disabled or shows validation error |
| 3 | Select provider but leave API key empty | Save button disabled or shows validation error |
| 4 | Fill all required fields; click Save | Modal closes; provider added successfully |

**Test Data:** N/A  
**Postconditions:** Valid provider added only when all required fields filled.

---

### TC-390-203: Save All with invalid data shows error, no navigation

| Field | Value |
|-------|-------|
| **ID** | TC-390-203 |
| **Priority** | P2 |
| **Type** | e2e |
| **AC Mapping** | AC5 |
| **Preconditions** | Dev host running; one provider row has invalid base URL format |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Edit provider: set Base URL to "not-a-url" | Modal accepts input |
| 2 | Click "Save All" | Error toast: "Invalid base URL format"; table remains on screen |
| 3 | Fix Base URL to valid format; click Save All | Success; config persisted |

**Test Data:** Invalid URL fixture  
**Postconditions:** Config saved only after fix.

---

### TC-390-204: No connected providers — picker shows "No models available"

| Field | Value |
|-------|-------|
| **ID** | TC-390-204 |
| **Priority** | P2 |
| **Type** | e2e |
| **AC Mapping** | AC6, AC4 |
| **Preconditions** | Dev host running; all providers have status `untested` or `failed` |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open Chat panel | Model selector present |
| 2 | Click model selector | Model Picker popup opens with message "No models available — configure a provider first" |
| 3 | Verify no model list | No model rows, no Recent section |

**Test Data:** All providers `untested`/`failed`  
**Postconditions:** Picker shows empty state.

---

### TC-390-205: Providers load failure — error message + empty table

| Field | Value |
|-------|-------|
| **ID** | TC-390-205 |
| **Priority** | P1 |
| **Type** | e2e |
| **AC Mapping** | AC1, AC5 |
| **Preconditions** | Dev host running; workspace config corrupted or inaccessible |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open Settings Panel → tab "LLM Provider" | Error toast: "Failed to load providers" |
| 2 | Inspect table | Empty table with message "No providers configured" |
| 3 | Click "+ Add Provider" | Modal still opens; can add first provider |

**Test Data:** Corrupted config scenario  
**Postconditions:** User can recover by adding provider.

---

## 4. Business Rule Validation

### TC-390-300: API key is masked in Edit modal (never plaintext)

| Field | Value |
|-------|-------|
| **ID** | TC-390-300 |
| **Priority** | P1 |
| **Type** | integration |
| **AC Mapping** | NFR4, AC3 |
| **Preconditions** | Dev host running; provider with known API key in SecretStorage |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click Edit on provider row | Modal opens with API key field showing `●●●●●●●●●●●●●●●●●●●●` (20 bullets) |
| 2 | Inspect DOM | No plaintext API key in any element's textContent or value |
| 3 | Click "Show" toggle (if present) | Key still masked; only copy-to-clipboard available |

**Test Data:** Provider with secret `sk-test-anthropic-001`  
**Postconditions:** No key leakage.

---

### TC-390-301: Secret-key isolation via `llmSecretKey(id)` / `readLlmApiKey()`

| Field | Value |
|-------|-------|
| **ID** | TC-390-301 |
| **Priority** | P1 |
| **Type** | integration |
| **AC Mapping** | NFR4, AC5 |
| **Preconditions** | Dev host running; two providers with different API keys |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `llmSecretKey("anthropic-claude-3-haiku")` | Returns `sdlcAgents.anthropic-claude-3-haikuApiKey` |
| 2 | Call `llmSecretKey("openai-gpt-4o")` | Returns `sdlcAgents.openai-gpt-4oApiKey` |
| 3 | Verify keys are independent | Updating one does not affect the other |
| 4 | Call `readLlmApiKey("anthropic-claude-3-haiku")` | Returns the secret value for anthropic only |

**Test Data:** Two providers with distinct secrets  
**Postconditions:** Key isolation verified.

---

### TC-390-302: `readLlmApiKey` auto-migrates legacy key on read (SA4E-389 cross-layer)

| Field | Value |
|-------|-------|
| **ID** | TC-390-302 |
| **Priority** | P2 |
| **Type** | integration |
| **AC Mapping** | NFR4, AC5 |
| **Preconditions** | Dev host running; legacy flat key `sdlcAgents.llm.apiKey` exists in SecretStorage; no profile exists yet |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `readLlmApiKey("openai-gpt-4o")` | Legacy key read; new profile `openai-gpt-4o` created in `sdlcAgents.llm.profiles` |
| 2 | Verify migration | Profile #1 created with provider=openai, model=gpt-4o; secret moved to `sdlcAgents.openai-gpt-4oApiKey` |
| 3 | Subsequent reads | Return same value from new profile key |

**Test Data:** SA4E-389 migration fixture M01 pattern  
**Postconditions:** Legacy key migrated; profile created.

---

## 5. Boundary & Negative Testing

### TC-390-400: Invalid provider name rejected in Add modal

| Field | Value |
|-------|-------|
| **ID** | TC-390-400 |
| **Priority** | P1 |
| **Type** | e2e |
| **AC Mapping** | AC2, AC3 |
| **Preconditions** | Dev host running; table has 3 seeded providers |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click "+ Add Provider" | Modal opens |
| 2 | Attempt to inject invalid provider via DOM manipulation | Save fails with "Invalid provider" error |
| 3 | Select valid provider from dropdown | Save succeeds |

**Test Data:** Invalid provider injection attempt  
**Postconditions:** Only valid providers accepted.

---

### TC-390-401: Model Picker handles 50+ models without performance degradation

| Field | Value |
|-------|-------|
| **ID** | TC-390-401 |
| **Priority** | P2 |
| **Type** | e2e |
| **AC Mapping** | NFR1, NFR2 |
| **Preconditions** | Dev host running; mock ProviderConfigService returns 50+ models across 5 providers |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open Model Picker popup | Opens < 300ms (measured) |
| 2 | Scroll through list | Smooth scrolling; virtual scroll if implemented |
| 3 | Search "model" | Filters in < 100ms |
| 4 | Close and reopen | No memory leak; consistent performance |

**Test Data:** Extended `model-names.csv` with 50+ entries  
**Postconditions:** Performance within thresholds.

---

## 6. UI/UX Testing

### TC-390-500: Provider table row actions & status badges interactive

| Field | Value |
|-------|-------|
| **ID** | TC-390-500 |
| **Priority** | P1 |
| **Type** | e2e |
| **AC Mapping** | AC1, AC4 |
| **Preconditions** | Dev host running; table has 3 providers with mixed statuses |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Hover Edit button | Tooltip "Edit provider" appears |
| 2 | Hover Test button | Tooltip "Test connection" appears |
| 3 | Hover Delete button | Tooltip "Delete provider" appears |
| 4 | Click Test on `failed` provider | Status transitions: Failed → Testing → Connected/Failed |
| 5 | Verify badge updates without page reload | Badge color/text changes in place |

**Test Data:** Mixed status fixtures  
**Postconditions:** Interactive elements functional.

---

### TC-390-501: API key is masked in table (never plaintext in DOM)

| Field | Value |
|-------|-------|
| **ID** | TC-390-501 |
| **Priority** | P1 |
| **Type** | e2e |
| **AC Mapping** | NFR4, AC1 |
| **Preconditions** | Dev host running; provider with API key in SecretStorage |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open Settings Panel → tab "LLM Provider" | Table renders |
| 2 | Inspect API Key column for any provider | Shows `●●●●●●●●●●●●●●●●●●●●` (20 bullets) |
| 3 | Run grep: `grep -r "sk-" extension/src --include="*.ts"` | Zero matches for plaintext secrets |
| 4 | Run DOM scan: `document.body.textContent.includes("sk-")` | Returns false |

**Test Data:** Provider with secret `sk-test-openai-001`  
**Postconditions:** Zero plaintext secrets in UI or code.

---

### TC-390-510: Manual exploratory user journey (config → test → save → chat)

| Field | Value |
|-------|-------|
| **ID** | TC-390-510 |
| **Priority** | P2 |
| **Type** | manual |
| **AC Mapping** | AC1–AC10 (end-to-end) |
| **Preconditions** | Fresh dev host profile (`--user-data-dir`); no prior config |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open Settings → LLM Provider tab | Empty table; "+ Add Provider" visible |
| 2 | Add anthropic provider with valid key | Row appears; status "Untested" |
| 3 | Click Test → status becomes "Connected" | Green badge |
| 4 | Add openai provider with valid key | Row appears; test → "Connected" |
| 5 | Click Save All | Config persisted |
| 6 | Open Chat panel | Model Picker shows both providers' models grouped |
| 7 | Select `claude-3-haiku` (Free) | Chat uses Anthropic |
| 8 | Send message → response received | End-to-end flow works |

**Test Data:** Fresh profile; valid API keys for anthropic & openai  
**Postconditions:** Complete user journey verified.

---

## 7. Static Checks (incl. masked-key grep)

### TC-390-403: Masked-key gate — grep for direct secret reads in UI code

| Field | Value |
|-------|-------|
| **ID** | TC-390-403 |
| **Priority** | P1 |
| **Type** | static |
| **AC Mapping** | NFR4, AC5 |
| **Preconditions** | Repo root accessible; extension source in `extension/src/**` |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run: `grep -r "secrets\.get.*llm" extension/src --include="*.ts"` | Zero matches (all secret access via `llmSecretKey()` helper) |
| 2 | Run: `grep -r "SecretStorage.*get" extension/src --include="*.ts"` | Zero direct calls outside helper module |
| 3 | Run: `grep -r "sdlcAgents\..*ApiKey" extension/src --include="*.ts"` | Zero hardcoded key names |

**Test Data:** `test-data/static-checks.csv` patterns S01–S03  
**Postconditions:** No secret bypass patterns.

---

### TC-390-404: Flat-key absence gate — grep for direct `llm.provider` / `llm.model` reads

| Field | Value |
|-------|-------|
| **ID** | TC-390-404 |
| **Priority** | P1 |
| **Type** | static |
| **AC Mapping** | AC9 (cross-ticket), NFR4 |
| **Preconditions** | Repo root accessible; extension source in `extension/src/**` |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run: `grep -r "llm\.provider" extension/src --include="*.ts"` | Zero matches (all via `readProviderTurnConfig()`) |
| 2 | Run: `grep -r "llm\.model" extension/src --include="*.ts"` | Zero matches (all via `readProviderTurnConfig()` or `model-config.ts`) |
| 3 | Run: `grep -r "llm\.baseUrl" extension/src --include="*.ts"` | Zero matches (all via SSOT) |

**Test Data:** `test-data/static-checks.csv` patterns S01–S02  
**Postconditions:** No flat-key reads outside SSOT layer.

---

### TC-390-601: Code standards static check — files ≤ 200 lines / functions ≤ 20 lines

| Field | Value |
|-------|-------|
| **ID** | TC-390-601 |
| **Priority** | P2 |
| **Type** | static |
| **AC Mapping** | Code standards (project rule) |
| **Preconditions** | Repo root accessible; extension source in `extension/src/**` |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run line-count script on `extension/src/**/*.ts` | Zero files > 200 lines |
| 2 | Run function-size script on `extension/src/**/*.ts` | Zero functions > 20 lines |
| 3 | Violations reported with file:line | Any violation → P2 defect |

**Test Data:** `test-data/static-checks.csv` S04  
**Postconditions:** Code standards enforced.

---

### TC-390-602: Provider table render < 500 ms with 10 providers

| Field | Value |
|-------|-------|
| **ID** | TC-390-602 |
| **Priority** | P3 |
| **Type** | e2e |
| **AC Mapping** | NFR1 |
| **Preconditions** | Dev host running; table seeded with 10 providers from extended `providers-list.csv` |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open Settings Panel → tab "LLM Provider" | Measure `console.time("table-render")` to table visible |
| 2 | Record render time | ≤ 500 ms on reference workstation |
| 3 | Repeat 5 times | All runs ≤ 500 ms (no regression > 20%) |

**Test Data:** Extended providers list (10 entries)  
**Postconditions:** Performance within threshold.

---

### TC-390-603: Model picker opens < 300 ms

| Field | Value |
|-------|-------|
| **ID** | TC-390-603 |
| **Priority** | P3 |
| **Type** | e2e |
| **AC Mapping** | NFR2 |
| **Preconditions** | Dev host running; Chat panel open; 5 providers with models loaded |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click model selector | Measure `console.time("picker-open")` to popup fully rendered |
| 2 | Record open time | ≤ 300 ms on reference workstation |
| 3 | Repeat 5 times | All runs ≤ 300 ms |

**Test Data:** `test-data/providers-list.csv` + `model-names.csv` (5 providers)  
**Postconditions:** Performance within threshold.

---

---

### 10. Appendix

#### 10.1 Test Data Setup

| File | Seed Produces | Loading Notes |
|------|---------------|---------------|
| `test-data/providers-list.csv` | 5 provider fixtures (anthropic, openai, lmstudio, openrouter, ollama) with model names and Free badge flags | E2E seed script reads CSV → applies via settings writer before panel opens |
| `test-data/model-names.csv` | 5 model fixtures with free/paid mix: haiku (free), gpt-4o (paid), qwen2-7b (paid), mixtral (paid), llama3 (paid) | Used by ProviderConfigService mock for picker model list |
| `test-data/shortcut-scenarios.csv` | 5 shortcut scenarios: recent-shows-used, empty-search-no-results, filter-by-prefix, filter-full-model-name, clear-picker-reset | Referenced by TC-390-101, 102, 104–107 |

Key seeded values: provider IDs `anthropic`, `openai`, `lmstudio`, `openrouter`, `ollama`; model names `anthropic-claude-3-haiku`, `openai-gpt-4o`, `qwen2-7b-instruct`, `openrouter-mixtral`, `ollama-llama3-8b`; Free badge only on `haiku`; dummy API keys `sk-test-<provider>-001`; custom base URL `https://custom.openai.com/v1`.

#### 10.2 Environment Configuration

- Extension Development Host launched from SA4E-390 worktree with isolated `--user-data-dir` so Global settings and SecretStorage don't pollute the dev machine profile.
- Mock provider stub started before IT suite (`tests/integration` setup hook) and killed after; port recorded into env for fixtures.
- Grep/line-count scripts run from repo root, restricted to `extension/src/**` (prod code) — tests and docs excluded from static gates except where noted.
- Performance runs: close background-heavy apps; record CPU count in evidence notes.

#### 10.3 Execution Notes (for Phase 6)

- Re-run failing `TC-390-1xx` e2e cases max 2 retries before classifying flaky vs defect.
- Every FAIL must record: case ID, step number, actual vs expected, evidence path, defect key.
- Automation source tree follows TDD §11 (vitest + Playwright, TypeScript, files under the repo test directories, file naming `*.e2e.test.ts` / `*.ui.e2e.test.ts`).

---

**Last Updated**: 2026-10-30T16:15:00Z  
**Autonomy Level**: L3