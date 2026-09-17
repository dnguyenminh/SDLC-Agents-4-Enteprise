# User Guide — SA4E-290 Setup Pi SDK & Pi Provider

## 1. Overview
This guide describes how to configure and use Pi Provider for the SDLC Agents 4 Enterprise extension after installing `@earendil-works/pi-agent-core`.

## 2. Installation
### Prerequisites
- Node.js 22.x
- Extension workspace cloned
- npm registry access

### Steps
1. Add dependency to `extension/package.json`:
```json
"@earendil-works/pi-agent-core": "^1.0.0"
```
2. Install:
```bash
cd extension
npm install
```
3. Verify:
```bash
ls node_modules/@earendil-works/pi-agent-core
```

## 3. Configuration
Pi Provider is initialized via `PiProviderConfig`:
```typescript
{
  transportType: 'WebSocket' | 'HTTP',
  sessionId?: string,
  baseUrl?: string
}
```

Configuration is stored in extension settings under `kiroSdlc.pi` namespace (to be added in future step). Secrets must not be stored in code; use environment configuration.

## 4. Usage
```typescript
import { createPiProvider } from './src/pi-workflow/pi-provider';

const provider = createPiProvider();
await provider.initialize({ transportType: 'WebSocket' });

const agent = await provider.createAgent('sdlc-agent');
for await (const chunk of provider.stream({ agentId: 'sdlc-agent', messages })) {
  console.log(chunk);
}
```

## 5. Error Codes
- `ConfigurationError` — Missing or invalid config
- `PiInitError` — SDK initialization failure, fallback to LangGraph provider

## 6. Troubleshooting
| Issue | Cause | Fix |
|-------|-------|-----|
| SDK not found | npm install failed | Retry npm install with exponential backoff |
| Invalid transport | transportType not WebSocket/HTTP | Use valid value |
| Init timeout | Network issue | Check backend URL and proxy settings |

## 7. References
- BRD: documents/SA4E-290/BRD.md
- FSD: documents/SA4E-290/FSD.md
- Migration Plan: documents/pi-migration-plan.md
