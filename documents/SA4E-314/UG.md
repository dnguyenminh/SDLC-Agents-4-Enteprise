# User Guide — SA4E-314 Wire up DefaultResourceLoader

## 1. Overview
This feature wires up Pi SDK `DefaultResourceLoader` with explicit `cwd` and `agentDir` for deterministic resource discovery in SDLC Agents 4 Enterprise.

## 2. Installation
Prerequisites:
- Node.js >=18
- VS Code extension installed
- Pi SDK `@earendil-works/pi-coding-agent` installed
- Workspace with `.pi/skills`, `.pi/extensions`, `.pi/prompts` structure

No additional installation required. The orchestrator is bundled in extension.

## 3. Configuration Reference

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| cwd | string | workspace root | Workspace root path resolved from VS Code workspaceFolders |
| agentDir | string | `~/.pi/agent` | Agent directory for Pi resources |
| resourceLoader | DefaultResourceLoader | instantiated | Loader instance used for session |

Validation:
- cwd must exist and be a directory
- agentDir must be resolvable; warning if missing

## 4. Usage

### Create Agent Session
```ts
import { SessionOrchestrator } from './src/pi-agent/session-orchestrator';
import { WorkspaceRootResolver } from './src/pi-agent/workspace-root-resolver';
import { DefaultAgentDirResolver } from './src/pi-agent/agent-dir-resolver';

const workspaceResolver = new WorkspaceRootResolver();
const agentDirResolver = new DefaultAgentDirResolver();
const orchestrator = new SessionOrchestrator({ workspaceResolver, agentDirResolver });

const result = await orchestrator.createSession(sdk);
// result.session, result.resourceLoader, result.diagnostics
```

The orchestrator:
1. Resolves cwd
2. Gets agentDir
3. Instantiates DefaultResourceLoader({cwd, agentDir})
4. Calls loader.reload()
5. Logs diagnostics
6. Creates session with explicit resourceLoader

## 5. Administration
- Monitor logs for `ResourceLoader diagnostic` warnings
- Ensure workspace root is correct via SA4E-313
- AgentDir can be overridden via `DefaultAgentDirResolver` constructor

## 6. Troubleshooting

| Issue | Cause | Resolution |
|-------|-------|------------|
| Workspace root not found | cwd invalid | Verify VS Code workspaceFolders; fallback to process.cwd() |
| Resource discovery failed | loader.reload() error | Check .pi/* structure and agentDir permissions |
| AgentDir missing warning | agentDir not exist | Create `~/.pi/agent` or configure custom path |

Error codes:
- `Resource discovery failed` — abort session creation
- `Workspace root not found` — warning, fallback used

## 7. API Reference

### SessionOrchestrator.createSession(sdk)
Creates Pi session with explicit resource loader.

**Returns:** `{ session, resourceLoader, diagnostics }`

### DefaultAgentDirResolver.getAgentDir()
Returns resolved agent directory path.

### createResourceLoader(options)
Factory returns IResourceLoader instance.

## 8. FAQ
**Q: Can I override cwd?**  
A: Yes, provide custom WorkspaceRootResolver with fallbackCwd.

**Q: Is reload synchronous?**  
A: Reload is awaited before session creation.

**Q: Where are diagnostics logged?**  
A: Via extension logger (console.info/warn).
