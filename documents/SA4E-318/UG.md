# User Guide — SA4E-318: Add Prompt Templates + configure Settings/Models/Credentials

## 1. Installation

Prerequisites:
- Node.js 20+
- Pi SDK `@earendil-works/pi-agent-core` installed
- VS Code Extension installed

Build:
```bash
npm install
npm run compile
```

## 2. Configuration Reference

### Prompt Templates
- Location: `<cwd>/.pi/prompts` và `~/.pi/agent/prompts`
- File format: Markdown `.md` or `.txt`
- Naming rule: lowercase, numbers, hyphen only (`^[a-z0-9-]+$`)
- Discover via: `PromptTemplateService.discover()`
- Slash command: `/templateName`

### Session Config
| Property | Type | Default | Description |
|----------|------|---------|-------------|
| model | string | gpt-4o-mini | Model name, must be supported |
| thinkingLevel | string | medium | low / medium / high |
| scopedModels | array | [] | Scope model list |
| modelRuntime | string | - | Runtime identifier |
| settingsManager | SettingsManager | - | File-backed or in-memory |
| credentials | CredentialRef | - | Key reference, no secret |

### Settings Manager
- Source: `file` or `memory`
- File format: JSON or YAML
- Example JSON: `{"model":"gpt-4o-mini","thinkingLevel":"medium"}`

### Credentials Manager
- Reference only: `env:VAR_NAME` or `ref:NAME`
- Do NOT hardcode secrets
- Error if credential key missing: `Credential key '{key}' not found`

## 3. Usage

### Discover prompt templates
```ts
import { PromptTemplateService } from './prompt-template.service';
const svc = new PromptTemplateService(process.cwd());
svc.discover();
const prompts = svc.getPrompts();
```

### Create session with config
```ts
import { SessionConfigurator } from './session-configurator';
const session = SessionConfigurator.createAgentSession(sdk, cwd, {
  model: 'gpt-4o-mini',
  thinkingLevel: 'medium',
  scopedModels: ['gpt-4o-mini','claude-3'],
});
```

### Settings file-backed
```ts
import { SettingsManager } from './settings-manager';
const mgr = new SettingsManager({ source: 'file', filePath: './settings.json' });
```

### Credentials reference
```ts
import { CredentialsManager } from './credentials-manager';
const credMgr = new CredentialsManager({ openai_api_key: 'env:OPENAI_KEY' });
credMgr.resolve({ credentialKey: 'openai_api_key', credentialValueRef: 'env:OPENAI_KEY' });
```

## 4. Administration

- Add new template: create file in `.pi/prompts/<name>.md`
- Reload loader: call `reloadResourceLoader(loader)`
- Hot-reload: file watcher triggers `discover()`

## 5. Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| Template not found | Name invalid or file missing | Validate name `^[a-z0-9-]+$`, ensure path exists |
| Invalid model | Model not in supported list | Use gpt-4o-mini, gpt-4o, claude-3 |
| Missing credential | Key not in store | Set credential in manager, ensure env var exists |
| Settings parse error | Invalid JSON/YAML | Validate file, fallback to defaults used |

Error codes:
- `Template '{name}' không tồn tại`
- `Credential key '{key}' not found`
- `Invalid model` → fallback to default

## 6. API Reference

- `PromptTemplateService.discover(promptsOverride?)`
- `PromptTemplateService.getPrompts()`
- `PromptTemplateService.getPrompt(name)`
- `SettingsManager` constructor `{source, filePath, initial}`
- `CredentialsManager.resolve(cred)`
- `SessionConfigurator.buildSessionConfig(params)`
- `SessionConfigurator.createAgentSession(sdk, cwd, params)`

## 7. FAQ

Q: How to add custom template?
A: Create `.pi/prompts/my-template.md`, run `discover()`

Q: Can credentials contain secret?
A: No. Only reference strings allowed.

Q: Performance?
A: Discovery <500ms for <100 templates.
