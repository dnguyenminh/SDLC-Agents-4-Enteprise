# Release Notes — SA4E-389 (v1.55.11)

## SDLC-Agents-4-Enterprise — Multi LLM Configuration (Profiles) + Chat model/provider switcher

---

### Document Information

| Field | Value |
|-------|-------|
| **Jira Ticket** | SA4E-389 |
| **Title** | Multi LLM Configuration (Profiles) + Chat model/provider switcher |
| **Author** | DevOps Agent |
| **Version** | 1.0 |
| **Date** | 2026-10-31 |
| **Extension Version** | 1.55.11 |
| **Branch** | dnguyenminh/SA4E-389 |

---

### 1. What's New

SA4E-389 extends the SDLC Agents extension from single-config LLM configuration to a **multi-profile** model, allowing users to store and switch between multiple LLM providers/models.

#### New Features

| Feature | Description |
|---------|-------------|
| **Multi-profile settings** | Settings stores a list of `LlmProfile` entries (`sdlcAgents.llm.profiles[]`), each with provider, base URL, model, API key (SecretStorage), label, and test status |
| **Active profile selection** | `sdlcAgents.llm.activeProfileId` selects which profile the chat + workflow engine uses |
| **One-time migration** | Existing flat config (`sdlcAgents.llm.provider`, `sdlcAgents.llm.model`, base URL, SecretStorage key) is automatically migrated to Profile #1 on activation |
| **Chat model/grouped picker** | Chat model selector becomes a grouped picker — models grouped by provider, only connected profiles eligible |
| **Single-operation switch** | Selecting a model in chat switches both active profile and model in one action |
| **Per-profile test connection** | Each profile can be tested independently; `lastTestStatus` / `lastTestedAt` tracked per profile |
| **Profile CRUD** | Add / edit / delete / set-active profiles from Settings Panel |

#### Breaking Changes

| Change | Impact | Migration |
|--------|--------|-----------|
| Flat keys (`sdlcAgents.llm.provider`, `sdlcAgents.llm.model`) no longer read directly | Callers must use `readProviderTurnConfig()` SSOT | Auto-migration to Profile #1 preserves existing config |
| Secret key format `sdlcAgents.<profileId>ApiKey` | Keys resolved via `llmSecretKey(profileId)` helper | Existing `sdlcAgents.<provider>ApiKey` keys preserved as Profile #1 key |

#### Bug Fixes

- None (new feature)

#### Known Issues

| Issue | Severity | Workaround |
|-------|----------|------------|
| Backend LLM config (`backend/src/admin/db/config.ts`) not affected | Low | Independent component, out of scope for this ticket |

#### Upgrade Instructions

1. Install VSIX `SA4E-389-llm-profiles-1.55.11.vsix`
2. On first activation, migration runs automatically: flat config → Profile #1
3. Verify Profile #1 appears in Settings → LLM Provider tab
4. Verify chat model picker shows models from connected profiles
5. Add additional profiles as needed via "+ Add Configuration"

#### Rollback

Uninstall extension and reinstall previous stable VSIX. Legacy flat keys are preserved (migration does not delete old keys — fail-safe).

---

### 2. Artifact Index

| Artifact | Path |
|----------|------|
| Deployment Guide | `documents/SA4E-389/DPG.md` |
| Release Notes | `documents/SA4E-389/RLN.md` |
| Deployment flow diagram | `documents/SA4E-389/diagrams/deployment-flow.{drawio,png}` |
| Rollback flow diagram | `documents/SA4E-389/diagrams/rollback-flow.{drawio,png}` |

---

### 3. Related Tickets

| Ticket | Relation |
|--------|----------|
| SA4E-390 | UI layer (Provider Table, Model Picker UI) built on SA4E-389 data model |
| SA4E-323 | LLM provider settings refactor (prior art) |
| SA4E-370 | Dotted base URL keys for providers |

---

**Last Updated**: 2026-10-31T09:00:00Z  
**Autonomy Level**: L3