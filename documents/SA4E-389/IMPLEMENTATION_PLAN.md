# Implementation Plan — SA4E-389

## Files to Create

| # | File | Purpose | TDD Section |
|---|------|---------|-------------|
| 1 | `extension/src/shared/types/llm-profile.ts` | LlmProfile interface + validation | 2.1, 4.1 |
| 2 | `extension/src/services/profiles-service.ts` | Profile CRUD + persistence | 3.4, 5 |
| 3 | `extension/src/config/llm-profile-migration.ts` | One-time flat→profile migration | 2.4, 3.3 |
| 4 | `extension/src/services/llm-test-service.ts` | Extend: async test + status persistence | 3.2, 7.4 |
| 5 | `extension/src/webview/chat-model-picker.ts` | Grouped picker (connected only) | 3.4, 4.3 |
| 6 | `extension/src/panels/settings/handlers/ProfileSettingsHandler.ts` | Profile CRUD + test connection handlers | 3.2, 7 |
| 7 | `extension/src/config/llm-secret-keys.ts` | Extend: llmSecretKey(profileId) helper | 2.3, 3.2 |

## Files to Modify

| # | File | Changes |
|---|------|---------|
| 1 | `extension/src/pi-workflow/pi-provider-config-bridge.ts` | `readProviderTurnConfig()` → resolve from active profile |
| 2 | `extension/src/models/LlmProviderConfig.ts` | Add `PROVIDER_BASE_URL_KEYS` for all providers |
| 3 | `extension/src/services/ProviderConfigService.ts` | Read active profile, not flat keys |
| 4 | `extension/src/services/LlmTestService.ts` | Test returns status, persists to profile |
| 5 | `extension/src/panels/settings/SettingsMessageHandler.ts` | Route profile messages |
| 6 | `extension/src/panels/settings/SettingsPanel.ts` | Update HTML for profile table + grouped picker |
| 7 | `extension/src/extension.ts` | Run profile migration on activate |
| 8 | `extension/webview-assets/chat/chat-model.js` | Replace dropdown with grouped picker |

## Implementation Order

1. Types & interfaces (llm-profile.ts)
2. Secret key helpers (llm-secret-keys.ts)
3. Migration script (llm-profile-migration.ts)
4. ProfilesService (profiles-service.ts)
5. Config bridge update (pi-provider-config-bridge.ts)
6. ProviderConfigService update
7. LlmTestService update
8. ProfileSettingsHandler
9. SettingsMessageHandler routing
10. SettingsPanel HTML
11. Chat model picker
12. Extension activation migration call
13. Build verification