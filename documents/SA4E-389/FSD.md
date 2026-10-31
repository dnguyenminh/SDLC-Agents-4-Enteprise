# Functional Specification Document (FSD)
## SA4E-389: Multi LLM Configuration (Profiles) + Chat model/provider switcher

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-389 |
| Title | Multi LLM Configuration (Profiles) + Chat model/provider switcher |
| Author | SA Agent |
| Version | 1.0 |
| Date | 2026-10-30 |
| Status | Draft |

---

## 1. Overview

### 1.1 Problem Summary
The current LLM configuration architecture uses single-config with flat keys in VS Code settings (`sdlcAgents.llm.provider`, `sdlcAgents.llm.model`). This limits the system to a single LLM provider/model at a time. The redesign moves to a multi-profile model that stores multiple `LlmProfile` entries, enabling:

- **Multi-profile**: Settings store a list of LLM configuration profiles. Each profile contains provider, base URL, model, API key (via secret storage), label, and test status.
- **Chat switcher**: The chat window model selector upgrades from a simple dropdown to a grouped picker — grouped by provider, only showing models of connected profiles. Selecting a model switches both the entire profile (provider + base URL + API key) and the model in one operation.
- **No breaking changes**: Automatic migration packages the current flat config into Profile #1. API key migration uses the existing `llmSecretKey(id)` helper; the user does not re-enter the API key.

### 1.2 Goals
- Store multiple `LlmProfile` entries in VS Code settings under `sdlcAgents.llm.profiles`.
- Enable `sdlcAgents.llm.activeProfileId` to track the currently active profile.
- Provide UI for profile management: Add, Edit, Delete, Set Active.
- Enable grouped model picker in chat window.
- Automatic one-time migration from flat config to Profile #1.
- All API key reads/writes go through `llmSecretKey()` helper only.

### 1.3 Scope

**In-Scope:**
- `LlmProfile` interface definition and storage schema.
- Profile management UI: table, add/edit/delete/modal.
- Active profile selection and `activeProfileId` management.
- Migration script: auto-migrate old flat config → Profile #1.
- `readProviderTurnConfig()` SSOT update to resolve from active profile.
- `llmSecretKey(id)` helper enforcement for all secret key operations.
- ProfileId slug validation: `[a-z0-9-]+`.

**Out-of-Scope:**
- Code implementation (Phase 5: DEV agent).
- Test cases (Phase 4: QA agent).
- UI design mockups (beyond grouped picker basic functionality).
- Dynamic model discovery from API endpoints.

### 1.4 References
- BRD.md: `documents/SA4E-389/BRD.md` — Business Requirements Document
- `llmSecretKey(id)`: `extension/src/config/llm-secret-keys.ts`
- `readProviderTurnConfig()`: `extension/src/pi-workflow/pi-provider-config-bridge.ts`
- VS Code Settings API: `sdlcAgents.llm.*` namespace

---

## 2. Data Model

### 2.1 LlmProfile Interface

```typescript
interface LlmProfile {
  id: string;              // slug [a-z0-9-]+ (e.g. "lmstudio-qwen"); used as part of secret key
  label: string;           // "LMStudio - Qwen"
  provider: string;        // lmstudio | openrouter | anthropic | ollama | ...
  baseUrl?: string;        // undefined = use provider default
  model: string;           // model id, or "auto"
  useDefaultUrl: boolean;
  lastTestStatus?: "connected" | "failed" | "untested";
  lastTestedAt?: number;
}
```

### 2.2 Storage Schema

| Setting | Type | Description | Persistence |
|---------|------|-------------|-------------|
| `sdlcAgents.llm.profiles` | `LlmProfile[]` | VS Code settings, Global | Persists list of all profiles |
| `sdlcAgents.llm.activeProfileId` | `string` | VS Code settings, Global | Currently active profile identifier |

### 2.3 Secret Key Convention

- **Format**: `sdlcAgents.<x>ApiKey`
- **For a profile**: secret key = `sdlcAgents.<profileId>ApiKey` (using profileId directly as `<x>`)
- **Must go through helper**: `llmSecretKey(id)` / `readLlmApiKey(secrets, id)` — **DO NOT** call `secrets.store/get` with arbitrary string.
- **NOT allowed**: `llmProfile.<id>.apiKey` or any other namespace — violates single source of truth.
- **Therefore**: `profileId` MUST be safe slug `[a-z0-9-]+` (no dots/exotic uuid chars) to form valid key.

### 2.4 Migration Script (One-Time)

**Trigger**: On activation when `sdlcAgents.llm.profiles` is empty/absent.

**Steps**:
1. Read old flat config:
   - `sdlcAgents.llm.provider` → old provider ID
   - `sdlcAgents.llm.model` → old model
   - `sdlcAgents.llm.<provider>.baseUrl` → old base URL (from `PROVIDER_BASE_URL_KEYS`)
   - `sdlcAgents.<providerId>ApiKey` → old API key (VS Code SecretStorage)
2. Create Profile #1:
   - `profileId` = old providerId (e.g. "lmstudio")
   - `label` = `"${provider.charAt(0).toUpperCase() + provider.slice(1)} - default"` (e.g. "LMStudio - default")
   - `provider` = old provider ID
   - `baseUrl` = old base URL (or `undefined` if using default)
   - `model` = old model
   - `useDefaultUrl` = `true` if no base URL override, `false` otherwise
   - `lastTestStatus` = `"untested"`
   - `lastTestedAt` = `undefined`
3. Set `activeProfileId` = profileId of Profile #1 (`"lmstudio"`).
4. Guard with globalState flag similar to existing `settings-migration-runner`; **DO NOT** delete old keys (fail-safe).
5. Old API key remains accessible via `sdlcAgents.<providerId>ApiKey` format; `readLlmApiKey` auto-migrates on first access.

**Migration DDL Concept** (illustrative):
```sql
-- Pseudocode: migration runs once on extension activate
IF NOT EXISTS (SELECT 1 FROM sdcAgents.llm.profiles) THEN
  DECLARE @oldProvider VARCHAR = (SELECT VALUE FROM sdcAgents.llm WHERE key = 'provider');
  DECLARE @oldModel VARCHAR = (SELECT VALUE FROM sdcAgents.llm WHERE key = 'model');
  DECLARE @oldBaseUrl VARCHAR = (SELECT VALUE FROM sdcAgents.llm WHERE key LIKE @oldProvider + '.baseUrl%');
  DECLARE @oldApiKey VARBINARY = (SELECT value FROM SecretStorage WHERE key = @oldProvider + 'ApiKey');

  INSERT INTO sdcAgents.llm.profiles (id, label, provider, baseUrl, model, useDefaultUrl, lastTestStatus, lastTestedAt)
  VALUES (
    @oldProvider,                                   -- id (slug)
    CONCAT(UPPER(LEFT(@oldProvider, 1)), LOWER(SUBSTRING(@oldProvider, 2)), ' - default'), -- label
    @oldProvider,                                   -- provider
    CASE WHEN @oldBaseUrl IS NOT NULL THEN @oldBaseUrl ELSE NULL END, -- baseUrl
    @oldModel,                                      -- model
    CASE WHEN @oldBaseUrl IS NULL THEN 1 ELSE 0 END, -- useDefaultUrl
    'untested',                                     -- lastTestStatus
    NULL                                            -- lastTestedAt
  );

  UPDATE sdcAgents.llm SET activeProfileId = @oldProvider WHERE key = 'activeProfileId';
END IF;
```

### 2.5 Profile ID Slug Validation

- **Pattern**: `[a-z0-9-]+`
- **Examples valid**: `lmstudio-qwen`, `openrouter-anthropic`, `anthropic`, `ollama`
- **Examples invalid**: `my.profile`, `my-profile-v2.1`, `UUID-style`, `with spaces`
- **Validation**: Enforced at interface level and UI input validation; profileId forms part of secret key `sdlcAgents.<profileId>ApiKey`.

---

## 3. Functional Requirements (mapped from AC1-AC10 BRD)

| # | Requirement | Priority | Implementation Notes |
|---|-------------|----------|---------------------|
| **AC1** | **Profile table displays profile list** | MUST HAVE | Settings tab "LLM Provider" displays list of profiles; each row has label, provider, model, status badge, buttons (Edit/Test/Delete/Set-active). |
| **AC2** | **Add profile mới** | MUST HAVE | "+ Add Configuration" creates new profile; persists to `sdlcAgents.llm.profiles`; API key stored via `sdlcAgents.<profileId>ApiKey` using `llmSecretKey()`. |
| **AC3** | **Edit profile** | MUST HAVE | Edit profile opens modal with current data pre-filled; can change provider, model, base URL, API key. |
| **AC4** | **Delete profile** | SHOULD HAVE | Delete profile removes from list; fail-safe guard. If deleting active profile, `activeProfileId` reset to first profile or null. |
| **AC5** | **Set active profile** | MUST HAVE | "Set active" changes `activeProfileId`; chat + workflow engine use `readProviderTurnConfig()` to resolve from active profile. |
| **AC6** | **Model picker grouped by provider** | MUST HAVE | Chat window model selector shows grouped picker — grouped by provider, only listing models of connected profiles; selecting one row switches entire profile + model. |
| **AC7** | **Test profile connection** | SHOULD HAVE | "Test" button on each profile row runs connection test; `lastTestStatus` updated (connected/failed/untested); `lastTestedAt` timestamp updated. |
| **AC8** | **Migration auto-tập đồng** | MUST HAVE | Auto-migrate old flat config to Profile #1 on activation; user does not re-enter API key; `readLlmApiKey` auto-migrates. |
| **AC9** | **Không đọc flat key ngoài layer resolve profile** | MUST HAVE | No caller reads `sdlcAgents.llm.provider`/`sdlcAgents.llm.model` flat keys directly outside profile resolution layer. All reads go through `readProviderTurnConfig()` or equivalent. |
| **AC10** | **profileId là slug [a-z0-9-]+** | MUST HAVE | ProfileId must match slug pattern `[a-z0-9-]+`; enforced at interface level and UI validation. |

### 3.1 Story 1: View and manage multiple LLM profiles

**Requirement Details**:
1. Settings tab "LLM Provider" displays list of profiles; each row has label, provider, model, status badge, buttons (Edit/Test/Delete/Set-active).
2. "+ Add Configuration" creates new profile; persists to `sdlcAgents.llm.profiles`; API key stored via `sdlcAgents.<profileId>ApiKey` using `llmSecretKey()`.
3. Edit profile opens modal with current data pre-filled; can change provider, model, base URL, API key.
4. Delete profile removes from list; fail-safe guard.
5. "Set active" changes `activeProfileId`; chat + workflow engine use `readProviderTurnConfig()` to resolve from active profile.

**Data Fields** (from BRD):

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| profileId | String (slug) | Yes | Internal identifier [a-z0-9-]+ | lmstudio-qwen, openrouter-anthropic |
| label | String | Yes | Display name | "LMStudio - Qwen" |
| provider | Enum | Yes | Provider name | lmstudio, openrouter, anthropic, ollama |
| baseUrl | String | No | Override base URL (undefined = default) | https://api.lmstudio.ai |
| model | String | Yes | Model ID or "auto" | claude-3-sonnet, auto |
| useDefaultUrl | Boolean | Yes | Whether to use provider default URL | true/false |
| lastTestStatus | Enum | No | Last test result | connected, failed, untested |
| lastTestedAt | Number | No | Timestamp of last test | 1730294400000 |

**Acceptance Criteria**:
1. Settings tab "LLM Provider" displays profile list; each row has label, provider, model, status badge, buttons.
2. "+ Add Configuration" creates profile; persists to `sdlcAgents.llm.profiles`; API key stored via `sdlcAgents.<profileId>ApiKey` using `llmSecretKey()`.
3. "Set active" changes `activeProfileId`; chat + workflow engine resolve correctly via `readProviderTurnConfig()`.
4. Migration from old flat config to Profile #1 is automatic; user does not re-enter API key.
5. No caller reads flat `llm.provider`/`llm.model` directly outside profile resolution layer (verified by grep).
6. ProfileId is safe slug `[a-z0-9-]+`; secret key format `sdlcAgents.<profileId>ApiKey` valid.

**UI Specifications**:

| No. | Name | Type | Required | Description | Note |
|-----|------|------|----------|-------------|------|
| 1 | Profile Table | Table | Yes | List of LlmProfile rows | Columns: label, provider, model, status, actions |
| 2 | Profile Label | Label | Yes | Display name of profile | |
| 3 | Provider | Dropdown/Label | Yes | Provider name | lmstudio, openrouter, etc. |
| 4 | Model | Text | Yes | Model ID or "auto" | |
| 5 | Status Badge | Badge | Yes | connected (green), failed (red), untested (gray) | |
| 6 | Actions | Button group | Yes | Edit, Test, Delete, Set-active | |
| 7 | Add Provider Button | Button | Yes | Add new profile | |

**Validation Rules**:
- Profile label not empty when adding new.
- Model ID not empty.
- Provider must be from recognized list.
- ProfileId must match slug pattern `[a-z0-9-]+`.

**Error Handling**:
- If fail to load profiles: show error message, empty table.
- If test profile fails: update `lastTestStatus` badge, show error detail.
- If save fails: show error message, do not navigate away.

### 3.2 Story 2: Add new LLM profile

**Requirement Details**:
1. "Add Profile" button in Settings Panel (tab LLM Provider).
2. Clicking opens modal Edit Profile allowing input of new provider info.
3. User selects provider from list (anthropic, openai, lmstudio, openrouter, ollama), enters API key, base URL, model.
4. "Test Connection" button checks connectivity before saving.
5. After saving, new profile appears in Profile Table.

**Data Fields**:

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| providerId | Enum (select) | Yes | Provider from list | anthropic, openai |
| apiKey | String (password) | Yes (cloud) | API key | sk-ant-... |
| baseUrl | String | No | Base URL override | https://api.custom.com |
| model | String | Yes | Model ID | claude-3-opus |

**Acceptance Criteria**:
1. "Add Profile" button clearly visible in Settings Panel.
2. Modal Edit Provider opens when clicking "Add Profile".
3. User can select provider and enter full configuration.
4. "Test Connection" checks connectivity and shows result.
5. New profile added to Profile Table after save.
6. API key stored via `sdlcAgents.<profileId>ApiKey` using `llmSecretKey()`.

**UI Specifications**:

| No. | Name | Type | Required | Description | Note |
|-----|------|------|----------|-------------|------|
| 1 | Add Profile Button | Button | Yes | Add new profile | |
| 2 | Edit Provider Modal | Modal | Yes | Detailed provider config | Contains API key, base URL, model, test connection |
| 3 | Provider Select | Dropdown | Yes | Select from list | anthropic, openai, lmstudio, openrouter, ollama |
| 4 | API Key Input | Password | Yes (cloud) | Enter API key | Masked |
| 5 | Base URL Input | Text | No | Enter base URL | |
| 6 | Model Input | Text | Yes | Enter model ID | |
| 7 | Test Connection Button | Button | Yes | Check connectivity | Shows result |
| 8 | Save Button | Button | Yes | Save provider | |

**Validation Rules**:
- Provider ID must be from list.
- API key required for cloud providers (anthropic, openai, openrouter).
- Model ID not empty.

**Error Handling**:
- If provider ID invalid: show "Unknown provider" error.
- If test connection error: show detailed error, does not block save (or blocks per design).

### 3.3 Story 3: Edit existing profile

**Requirement Details**:
1. "Edit" button appears on each profile row in Provider Table.
2. Clicking opens modal Edit Profile with current data pre-filled (API key masked).
3. User can change API key, base URL, model.
4. "Test Connection" checks connectivity after changes.
5. Changes saved and Profile Table updated.

**Data Fields**:

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| apiKey | String (password) | No | New API key (if changing) | sk-... |
| baseUrl | String | No | New base URL | https://api.custom.com |
| model | String | Yes | New model ID | gpt-4o |

**Acceptance Criteria**:
1. "Edit" button on each profile row.
2. Modal opens with current data pre-filled.
3. User can edit API key, base URL, model.
4. "Test Connection" checks connectivity after changes.
5. Changes saved and displayed in Provider Table.
6. API key stored via `sdlcAgents.<profileId>ApiKey` using `llmSecretKey()`.

**UI Specifications**:

| No. | Name | Type | Required | Description | Note |
|-----|------|------|----------|-------------|------|
| 1 | Edit Button | Button | Yes | On each profile row | Opens modal Edit Provider |
| 2 | Edit Provider Modal | Modal | Yes | Detailed provider config | API key, base URL, model, test connection |
| 3 | API Key Field | Password | No | API key (masked) | |
| 4 | Base URL Field | Text | No | Base URL | |
| 5 | Model Field | Text | Yes | Model ID | |
| 6 | Test Connection Button | Button | Yes | Check connectivity | |
| 7 | Save Button | Button | Yes | Save changes | |

**Validation Rules**:
- Model ID not empty when saving.
- Base URL must be valid URL if provided.

**Error Handling**:
- If save fails: show error message.
- If test connection fails: show error detail and status disconnected.

### 3.4 Story 4: Delete profile

**Requirement Details**:
1. "Delete" button appears on each profile row in Provider Table.
2. Clicking prompts confirmation dialog.
3. After confirmation, profile removed from list.
4. If deleting active profile, `activeProfileId` reset to first profile or null.

**Acceptance Criteria**:
1. "Delete" button on each profile row.
2. Confirmation dialog before deletion.
3. Profile removed from list after confirmation.
4. If was active profile, `activeProfileId` reset appropriately.

**UI Specifications**:

| No. | Name | Type | Required | Description | Note |
|-----|------|------|----------|-------------|------|
| 1 | Delete Button | Button | Yes | On each profile row | Triggers confirmation |
| 2 | Confirmation Dialog | Modal | Yes | "Are you sure?" | Cancel keeps profile |

**Error Handling**:
- If deletion fails: show error message.

### 3.5 Story 5: Set active profile

**Requirement Details**:
1. "Set active" button on each profile row, or click profile label to toggle active.
2. When set active, `activeProfileId` updated in VS Code settings.
3. Chat window and workflow engine use `readProviderTurnConfig()` to resolve provider/model/baseUrl from active profile.
4. Subsequent turns use the new active profile.

**Acceptance Criteria**:
1. "Set active" button changes visual state (highlighted).
2. `activeProfileId` updated in VS Code global settings.
3. `readProviderTurnConfig()` resolves from active profile, NOT flat keys.
4. Chat turn after change uses new provider/baseURL/model.

**UI Specifications**:

| No. | Name | Type | Required | Description | Note |
|-----|------|------|----------|-------------|------|
| 1 | Active Indicator | Badge/Style | Yes | Visual mark showing active profile | Different color/style |
| 2 | Profile Label Click | Action | Yes | Click to toggle active | |

**Error Handling**:
- If no profiles exist: disabled or message "No profiles configured".

### 3.6 Story 6: Model picker grouped by provider

**Requirement Details**:
1. Chat window model selector replaces simple dropdown with grouped picker.
2. Picker shows groups by provider (only profiles with `lastTestStatus` = "connected").
3. Within each group, models listed with name, provider badge "Free" if free.
4. Selecting a model sets both `activeProfileId` + model in one operation.

**Acceptance Criteria**:
1. Model picker is grouped by provider.
2. Only connected profiles' models shown (untested/profiles without test disabled/grayed).
3. Model item shows name, provider, Free badge.
4. Selecting model applies both profile + model.

**UI Specifications**:

| No. | Name | Type | Required | Description | Note |
|-----|------|------|----------|-------------|------|
| 1 | Model Picker Popup | Popup | Yes | Grouped by provider | Appears when clicking model selector |
| 2 | Provider Group | Section | Yes | Group of models from same provider | |
| 3 | Model Item | List item | Yes | Individual model | Name + provider + Free badge |
| 4 | Free Badge | Badge | No (conditional) | "Free" if free model | Green color |

**Error Handling**:
- If no connected profiles: show "No models available" message.

### 3.7 Story 7: Test profile connection

**Requirement Details**:
1. "Test" button on each profile row in Provider Table.
2. Clicking runs connection test for that profile.
3. `lastTestStatus` updated (connected/failed/untested).
4. `lastTestedAt` timestamp updated.
5. Badge status updated in table.

**Acceptance Criteria**:
1. "Test" button on each profile row.
2. `lastTestStatus` updated after test.
3. `lastTestedAt` timestamp updated.
4. Badge status updated in table.

**UI Specifications**:

| No. | Name | Type | Required | Description | Note |
|-----|------|------|----------|-------------|------|
| 1 | Test Button | Button | Yes | On each profile row | Triggers test |
| 2 | Status Badge | Badge | Yes | connected (green), failed (red), untested (gray) | |
| 3 | Tested At Timestamp | Text | No | When last tested | |

**Error Handling**:
- If test timeout: show error, set status to "failed" after timeout.
- If network error: show error detail, set status to "failed".

### 3.8 Story 8: No direct flat key reading

**Requirement Details**:
1. All callers of provider/model must go through `readProviderTurnConfig()` or `resolveLlmProfile()` helper.
2. No new code may read `sdlcAgents.llm.provider` or `sdlcAgents.llm.model` flat keys directly.
3. Code review (Phase 5) verifies compliance.

**Acceptance Criteria**:
1. Grep confirms no direct reads of `sdlcAgents.llm.provider` or `sdlcAgents.llm.model` outside resolution layer.
2. All profile reads go through `readProviderTurnConfig()` or equivalent.
3. Phase 5 code review passes.

**Error Handling**:
- If found: block merge, require refactor to use profile resolution layer.

### 3.9 Story 9: profileId slug validation

(Combined with AC10 - covered in section 3 overview)

### 3.10 Summary of Functional Coverage

| Story | AC1 | AC2 | AC3 | AC4 | AC5 | AC6 | AC7 | AC8 | AC9 | AC10 |
|-------|-----|-----|-----|-----|-----|-----|-----|-----|-----|------|
| 1: View/manage | ✓ | | | | ✓ | | | | | |
| 2: Add profile | | ✓ | | | | | | ✓ | | ✓ |
| 3: Edit profile | | | ✓ | | | | ✓ | | | ✓ |
| 4: Delete profile | | | | ✓ | ✓ | | | | | |
| 5: Set active | | | | | ✓ | | | | | |
| 6: Model picker | | | | | ✓ | ✓ | | | | |
| 7: Test connection | | | | | | | ✓ | | | |
| 8: No flat key | | | | | | | | | ✓ | |
| 9: Slug validation | | | | | | | | | | ✓ |

---

## 4. Non-Functional Requirements

| Category | Requirement | Details |
|----------|-------------|---------|
| **Performance** | Profile table render fast | Table with ≤ 10 profiles renders < 500ms |
| **Performance** | Model picker opens fast | Popup opens < 300ms after click |
| **Security** | API key encrypted | Stored in VS Code SecretStorage, not displayed raw in table |
| **Security** | Test connection timeout | Each test has timeout (e.g. 5s like testOllama) to avoid UI hang |
| **Security** | Helper enforcement | All secret key reads/writes MUST go through `llmSecretKey()` only |
| **Scalability** | Support many profiles | Profile table can show many profiles (virtual scroll if needed) |
| **Usability** | Intuitive profile management | Add/Edit/Del/Set-active obvious; confirm actions |
| **Usability** | Clear status badges | connected (green), failed (red), untested (gray) |
| **Availability** | UI not hang during test | Test runs async, does not block UI thread |
| **Maintainability** | Code standards | File ≤ 200 lines, function ≤ 20 lines, SOLID |

---

## 5. API Contracts

### 5.1 `readProviderTurnConfig()`

**Purpose**: Single Source of Truth — resolves provider/model/baseUrl from active profile.

**Endpoint/Function**: 
- Function: `readProviderTurnConfig()` in `extension/src/pi-workflow/pi-provider-config-bridge.ts`
- Returns: `{ provider: string, model: string, baseUrl?: string }` resolved from `activeProfileId`

**Behavior**:
- Reads from `sdlcAgents.llm.activeProfileId` to identify the active profile.
- Uses the active profile's `provider`, `model`, `baseUrl` fields.
- **NOT** reading flat `sdlcAgents.llm.provider`/`sdlcAgents.llm.model` directly.
- All chat and workflow engine calls go through this function.

**Example**:
```typescript
// Before (flat keys — to be replaced)
const config = {
  provider: sdcAgents.llm.provider,     // direct flat read — VIOLATE
  model: sdcAgents.llm.model,
  baseUrl: sdcAgents.llm.lmstudio.baseUrl
};

// After (profile resolution — CORRECT)
const config = readProviderTurnConfig(); // reads from active profile
```

### 5.2 `llmSecretKey(id)`

**Purpose**: Read/write API secret key for a profile.

**Function Signature**: 
```typescript
// Read
readLlmApiKey(secrets: any, id: string): string | undefined;

// Write (via helper)
llmSecretKey(id: string): void; // internally stores to sdcAgents.<id>ApiKey
```

**Behavior**:
- **Read**: `readLlmApiKey(secrets, profileId)` — reads from VS Code SecretStorage key `sdlcAgents.<profileId>ApiKey`.
- **Write**: All API key operations go through this helper — never directly call `secrets.store` or `secrets.get` with arbitrary strings.
- **Format**: `sdlcAgents.<profileId>ApiKey` where `profileId` is the slug `[a-z0-9-]+`.

**Example**:
```typescript
// READ — correct way
const apiKey = readLlmApiKey(secrets, 'lmstudio-qwen'); // reads sdcAgents.lmstudio-qwenApiKey

// WRITE — correct way (via helper)
llmSecretKey('lmstudio-qwen'); // stores to sdcAgents.lmstudio-qwenApiKey via SecretStorage

// ❌ VIOLATION — direct flat key
const key = secrets.get('sdlcAgents.lmstudioApiKey'); // wrong namespace
```

### 5.3 Migration Script Endpoints

**Purpose**: One-time migration from flat config to multi-profile.

**Script Location**: `extension/src/config/settings-migration-runner.ts` (existing pattern) or new migration script.

**Migration Steps** (as defined in Data Model section 2.4):
1. Check if `sdlcAgents.llm.profiles` is empty/absent.
2. If empty, read old flat config keys: `llm.provider`, `llm.model`, `llm.<provider>.baseUrl`, `sdlcAgents.<providerId>ApiKey`.
3. Create Profile #1 with auto-derived `profileId` = old providerId.
4. Set `activeProfileId` = profileId of Profile #1.
5. Guard with globalState flag; DO NOT delete old keys.

**Migration Trigger**: On extension first activate after FSD deployment.

**Example Migration Script** (pseudocode):
```typescript
async function migrateOldConfig(): Promise<void> {
  const profiles = await vscode.getSettings().get<LlmProfile[]>('sdlcAgents.llm.profiles');
  
  if (profiles && profiles.length > 0) {
    return; // already migrated
  }
  
  // Read old flat config
  const oldProvider = await vscode.getSettings().get<string>('sdlcAgents.llm.provider');
  const oldModel = await vscode.getSettings().get<string>('sdlcAgents.llm.model');
  const oldBaseUrl = await vscode.getSettings().get<string>('sdlcAgents.' + oldProvider + '.baseUrl');
  const oldApiKey = await readLlmApiKey(secrets, oldProvider); // via helper
  
  // Create Profile #1
  const newProfile: LlmProfile = {
    id: oldProvider, // slug-safe since provider IDs are already slugs (anthropic, openai, etc.)
    label: `${oldProvider.charAt(0).toUpperCase() + oldProvider.slice(1)} - default`,
    provider: oldProvider,
    baseUrl: oldBaseUrl,
    model: oldModel,
    useDefaultUrl: oldBaseUrl === undefined,
    lastTestStatus: 'untested',
    lastTestedAt: undefined
  };
  
  // Save to settings
  const settings = await vscode.getSettings();
  let currentProfiles: LlmProfile[] = settings.get<LlmProfile[]>('sdlcAgents.llm.profiles') || [];
  currentProfiles.push(newProfile);
  settings.update('sdlcAgents.llm.profiles', currentProfiles);
  
  // Set active profile
  settings.update('sdlcAgents.llm.activeProfileId', oldProvider);
  
  // Persist
  await settings.save();
}
```

---

## 6. Dependencies

| # | Dependency | Type | Related Ticket | Description |
|---|------------|------|----------------|-------------|
| 1 | `LlmProfile` interface | Data model | SA4E-389 | New interface for multi-profile; defines all profile fields and slug validation |
| 2 | `sdlcAgents.llm.profiles` | Storage | VS Code settings | Persists the list of LlmProfile entries; Global scope |
| 3 | `sdlcAgents.llm.activeProfileId` | Storage | VS Code settings | Currently active profile identifier; Global scope |
| 4 | `llmSecretKey(id)` | Helper | `extension/src/config/llm-secret-keys.ts` | Read/write secret key; ALL profile API key operations must use this helper |
| 5 | `readProviderTurnConfig()` | SSOT | `extension/src/pi-workflow/pi-provider-config-bridge.ts` | Resolves provider/model/baseUrl from active profile; SSOT for all consumers |
| 6 | Migration script | Script | SA4E-389 | Auto-migrate old flat config → Profile #1; one-time on activation |
| 7 | VS Code Settings API | Infrastructure | VS Code platform | Persists Global settings; handles SecretStorage for API keys |
| 8 | Existing provider list | Existing | SA4E-323, SA4E-370 | Provider names: anthropic, openai, lmstudio, openrouter, ollama (kept, only storage changes) |

---

## 7. Risks and Assumptions

### 7.1 Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| **API key exposed if secret key format violated** | High | Medium | Strict enforcement via `llmSecretKey()` helper only; code review guard (Phase 5); grep search before any flat key access. |
| **Migration loses user config** | High | Low | Fail-safe: old keys not deleted; globalState flag; backup VS Code settings before migration; documented rollback. |
| **Model picker too complex UI** | Medium | Medium | Start with basic grouped picker; iterate per feedback; use draw.io for mockup first; keep simple fallback dropdown. |
| **Existing callers break when flat keys removed** | High | High | Phase 5 code review mandatory; grep search before removal; deprecation period: keep flat keys read-only during transition; update all callers before removal. |
| **profileId not safe slug causes secret key invalid** | Medium | Low | Enforce `[a-z0-9-]+` pattern at interface level; unit test for slug validation; UI validation on Add/Edit modals. |
| **Test connection hangs UI** | Medium | Medium | Each test has timeout (e.g. 5s like `testOllama`); runs async, does not block UI thread; show cancellation option. |
| **Performance degrades with many profiles** | Low | Medium | Virtual scroll if > 20 profiles; table render < 500ms for ≤ 10 profiles (perf requirement). |

### 7.2 Assumptions

- VS Code settings API persists Global settings correctly (no data loss on migration).
- `readProviderTurnConfig()` currently reads from flat keys; will be updated to read from active profile in Phase 5.
- Existing provider list (anthropic, openai, lmstudio, openrouter, ollama) kept, only storage changes.
- API key continues in VS Code SecretStorage, base URL/model in workspace config.
- No auto-check connection; user initiates test connection (per BRD).
- Model data comes from saved config (not dynamic API call) in this phase.
- Provider IDs in VS Code settings are already slug-safe (anthropic, openai, lmstudio, openrouter, ollama all match `[a-z0-9-]+`).

---

## 8. Related Tickets

| Ticket Key | Summary | Status | Type | Relationship |
|------------|---------|--------|------|--------------|
| SA4E-389 | Multi LLM Configuration (Profiles) + Chat model/provider switcher | In Progress | Story | Main ticket |
| SA4E-323 | LLM provider settings refactor (LlmSettingsHandler) | Resolved | Task | Related (current handler — will be replaced by profile model) |
| SA4E-370 | Dotted base URL keys for providers | Resolved | Task | Related (BASE_URL_KEYS mapping — will be updated for profile baseUrl) |
| SA4E-390 | Làm lại màn hình cấu hình LLM và chọn model LLM ở cửa sổ chat SDLC CHAT | In Progress | Task | Related (UI implementation, AC3 cross-reference; profile table + model picker) |

---

## 9. Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-30 | SA Agent | Initial specification — from BRD.md SA4E-389 |

---

## 10. Diagrams

> Project rule: Draw.io only — no Mermaid in documentation. Every diagram below has a `.drawio` source in
> `documents/SA4E-389/diagrams/` next to its exported `.png`.

### 10.1 Data Flow Diagram

![Data flow — users, extension webviews, VS Code settings, SecretStorage and LLM providers](diagrams/system-context.png)

*[Edit in draw.io](diagrams/system-context.drawio)*

### 10.2 Migration Flow (One-Time: Flat Config → Profile #1)

![Migration sequence — extension activation, flat-key read, Profile #1 creation, idempotent globalState flag](diagrams/sequence-migration.png)

*[Edit in draw.io](diagrams/sequence-migration.drawio)*

### 10.3 Profile Management Flow (CRUD + Set Active)

![Profile CRUD sequence — Settings Panel → LlmSettingsHandler → ProfilesService → SecretStorage → table refresh](diagrams/sequence-profile-crud.png)

*[Edit in draw.io](diagrams/sequence-profile-crud.drawio)*

### 10.4 Secret Key Flow (llmSecretKey helper → SecretStorage)

![Secret key flow — LlmSecretKeys helper and SecretStorage adapter in the component view](diagrams/component.png)

*[Edit in draw.io](diagrams/component.drawio)*

### 10.5 Profile Lifecycle

![Profile lifecycle state machine — Untested → Testing → Connected / Failed → Active → Deleted](diagrams/state-profile.png)

*[Edit in draw.io](diagrams/state-profile.drawio)*

### 10.6 Diagram Files

| File | Type | Purpose |
|------|------|---------|
| `diagrams/system-context.png` | System context | Users ↔ extension webviews ↔ config layer (`sdlcAgents.llm.*`) ↔ SecretStorage ↔ LLM providers |
| `diagrams/architecture.png` | Layered architecture | UI / message-handler / service / storage layers; dependency direction downward only |
| `diagrams/component.png` | Component diagram | ProfilesService, SettingsMigrationRunner, LlmSecretKeys, ProviderConfigBridge, ChatModelPicker, SecretStorage adapter |
| `diagrams/class-llm-profile.png` | UML class | `LlmProfile`, `LlmTestStatus`, `ProfilesService`, `SecretKeyHelper`, `SettingsMigrationRunner`, `ProviderConfigBridge` |
| `diagrams/state-profile.png` | State machine | Profile lifecycle with `lastTestStatus` and active-profile transitions |
| `diagrams/sequence-profile-crud.png` | UML sequence | Profile CRUD + Set Active: slug validation → persist → SecretStorage → table refresh |
| `diagrams/sequence-migration.png` | UML sequence | One-time flat-config migration to Profile #1 (idempotent, fail-safe) |
| `diagrams/use-case.png` | Use case diagram | Business use cases UC1–UC8 (from BRD) |

---

## 11. E2E Test Architecture (Optional — for DEV reference)

*This section documents the existing E2E test structure so DEV can implement tests correctly. It is not test cases to implement.*

### 11.1 Framework & Language
- **Framework**: vitest (E2E-API) + Playwright (E2E-UI)
- **Language**: TypeScript (match project's main language)
- **API test client**: fetch / Hono `app.request()` against running server
- **Note**: Tests live in `backend/tests/`. All test code MUST use TypeScript to share types and utilities.

### 11.2 Test Structure
- Unit tests: `backend/src/**/*.test.ts`
- Integration tests: `backend/tests/integration/*.it.test.ts`
- E2E-API tests: `backend/tests/e2e/*.e2e.test.ts`
- E2E-UI tests: `backend/tests/e2e/*.ui.e2e.test.ts` (Playwright)

### 11.3 Reusable Components
- **e2e setup**: Shared setup — server start, DB seed, auth token generation
- **Helpers**: Login, navigate, click, wait, assert utilities
- **Fixtures**: Test data fixtures used across tests

### 11.4 E2E-API Test Design for LLM Profiles
- **File**: `llm-profiles.e2e.test.ts`
- **Test cases**:
  1. Load profile list — GET `/api/v1/llm/profiles` → returns LlmProfile[]
  2. Add profile — POST `/api/v1/llm/profiles` → 201, profile created
  3. Edit profile — PUT `/api/v1/llm/profiles/{id}` → 200, profile updated
  4. Delete profile — DELETE `/api/v1/llm/profiles/{id}` → 204
  5. Set active profile — PATCH `/api/v1/llm/active` → 200, activeProfileId updated
  6. Test profile connection — POST `/api/v1/llm/profiles/{id}/test` → 200, status updated
  7. Read provider turn config — GET `/api/v1/llm/config` → resolves from active profile
- **Auth setup**: Admin JWT for tests (generated via `/api/v1/auth/login`)
- **Data cleanup**: Clean up test profiles after each test (database reset or deletion)

### 11.5 E2E-UI Test Design for Model Picker
- **File**: `llm-model-picker.ui.e2e.test.ts`
- **New helpers needed**: 
  - `selectModelByProvider(provider, modelName)` — clicks provider group, selects model
  - `getConnectedProfiles()` — returns profiles with lastTestStatus = "connected"
- **Reused helpers from shared setup**: login, navigate to settings, open chat
- **CSS selectors**: 
  - Provider groups: `.model-picker .provider-group`
  - Model items: `.model-picker .model-item`
  - Free badge: `.model-picker .free-badge`
- **Test flow**: 
  1. Login as user
  2. Ensure at least 2 connected profiles with different providers
  3. Open chat model picker
  4. Verify groups are separated by provider
  5. Select model from a group
  6. Verify active profile and model are updated
  7. Send a message — uses new provider/model

---

## Appendices

### A. LlmProfile Interface — TypeScript Definition

```typescript
// Location: extension/src/models/LlmProviderConfig.ts (to be created)
// Or: extension/src/types/llm-profiles.ts

export interface LlmProfile {
  id: string;              // slug [a-z0-9-]+ (e.g. "lmstudio-qwen")
  label: string;           // display name (e.g. "LMStudio - Qwen")
  provider: string;        // provider name (e.g. "lmstudio", "openrouter")
  baseUrl?: string;        // undefined = use provider default
  model: string;           // model ID or "auto"
  useDefaultUrl: boolean;  // whether to use provider default URL
  lastTestStatus?: "connected" | "failed" | "untested"; // last test result
  lastTestedAt?: number;   // timestamp of last test (epoch ms)
}
```

### B. Provider ID List (Existing, Kept)

| Provider ID | Example Label |
|-------------|---------------|
| `anthropic` | "Anthropic - Claude" |
| `openai` | "OpenAI - GPT" |
| `lmstudio` | "LMStudio - Local" |
| `openrouter` | "OpenRouter - Mixed" |
| `ollama` | "Ollama - Local" |

### C. Secret Key Format Reference

| profileId | Secret Key Format | Example |
|-----------|-------------------|---------|
| `lmstudio` | `sdlcAgents.lmstudioApiKey` | VS Code SecretStorage |
| `lmstudio-qwen` | `sdlcAgents.lmstudio-qwenApiKey` | VS Code SecretStorage |
| `openrouter-anthropic` | `sdlcAgents.openrouter-anthropicApiKey` | VS Code SecretStorage |

### D. readProviderTurnConfig() — Current vs Updated

| Aspect | Current (Flat) | Updated (Profile) |
|--------|----------------|-------------------|
| **Source** | `sdlcAgents.llm.provider` / `sdlcAgents.llm.model` | `sdlcAgents.llm.activeProfileId` |
| **Resolution** | Direct flat key read | Read active profile, then use its fields |
| **All Callers** | Workflow engine, chat | All — must migrate to profile resolution |
| **Migration Plan** | Deprecation period → remove after Phase 5 | Update all callers in Phase 5; remove flat keys |

---