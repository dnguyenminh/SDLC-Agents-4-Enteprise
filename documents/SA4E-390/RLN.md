# Release Notes — SA4E-390 (v1.55.11)

## SDLC-Agents-4-Enterprise — LLM Configuration UI Redesign + Chat Model Picker

---

### Document Information

| Field | Value |
|-------|-------|
| **Jira Ticket** | SA4E-390 |
| **Title** | LLM Configuration UI Redesign + Chat Model Picker |
| **Author** | DevOps Agent |
| **Version** | 1.0 |
| **Date** | 2026-10-31 |
| **Extension Version** | 1.55.11 |
| **Branch** | dnguyenminh/SA4E-389 |

---

### 1. What's New

SA4E-390 redesigns the LLM Configuration user interface and the chat model selection experience, shipping together with the SA4E-389 multi-profile data layer in extension v1.55.11.

#### New Features

| Feature | Description |
|---------|-------------|
| **Provider Table** | Replaces single "Choose provider" dropdown with 6-column table: Provider name, Status (connected/disconnected/unknown badge), masked API Key, Base URL, Model, Actions (Edit/Test/Delete) |
| **Add Provider** | Button opens Edit Provider modal for adding a new provider configuration |
| **Save All** | Atomically persists all provider configurations to workspace config + SecretStorage |
| **Edit Provider modal** | Provider dropdown (anthropic/openai/lmstudio/openrouter/ollama), masked API key input, base URL input, model input, Test Connection button, Save button |
| **Connection status** | Per-provider status badge: connected / disconnected / unknown |
| **Model Picker popup** | Replaces plain model dropdown; search field, Recent section, model list (name + provider + Free badge) |
| **Keyboard shortcuts** | Esc (close picker), Ctrl+A (connect integration), Ctrl+F (focus search) — scoped to Model Picker context |
| **API key masking** | Keys shown as 20 bullets; never in clear text in DOM |

#### Bug Fixes

- None (new UI)

#### Known Issues

| Issue | Severity | Workaround |
|-------|----------|------------|
| Backend LLM config (`backend/src/admin/db/config.ts`) not affected | Low | Independent component, out of scope |

#### Upgrade Instructions

1. Install VSIX `SA4E-390-llm-ui-redesign-1.55.11.vsix` (ships with SA4E-389 data layer)
2. Open Settings → LLM Provider tab; verify Provider Table with 6 columns
3. Open Chat panel; verify Model Picker popup (not plain dropdown)
4. Verify API keys are masked (20 bullets) in table and modal
5. Test keyboard shortcuts: Esc / Ctrl+A / Ctrl+F in picker context

#### Rollback

Uninstall extension and reinstall previous stable VSIX.

---

### 2. Artifact Index

| Artifact | Path |
|----------|------|
| Deployment Guide | `documents/SA4E-390/DPG.md` |
| Release Notes | `documents/SA4E-390/RLN.md` |
| Deployment flow diagram | `documents/SA4E-390/diagrams/deployment-flow.{drawio,png}` |
| Rollback flow diagram | `documents/SA4E-390/diagrams/rollback-flow.{drawio,png}` |

---

### 3. Related Tickets

| Ticket | Relation |
|--------|----------|
| SA4E-389 | Data layer (multi-profile) — SA4E-390 UI builds on top |
| SA4E-323 | LLM provider settings refactor (prior art) |
| SA4E-370 | Dotted base URL keys for providers |
| KSA-237 | Model dropdown rendering with rate badge |

---

**Last Updated**: 2026-10-31T09:00:00Z  
**Autonomy Level**: L3