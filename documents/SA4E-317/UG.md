# User Guide — SA4E-317 Configure System Prompt + Skills for SDLC agent behavior

## 1. Installation

Prerequisites:
- Node.js >= 20
- Extension built with `npm run esbuild`
- Pi SDK `@earendil-works/pi-coding-agent` available (optional, mock fallback used in tests)

Build commands:
```bash
cd extension
npm run compile
npm run esbuild
```

## 2. Configuration Reference

### Resource Loader Options

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| cwd | string | Yes | - | Workspace root path |
| agentDir | string | Yes | - | Agent skills directory `~/.pi/agent/skills` |
| agentRole | string | Yes | - | SDLC agent role: SM, BA, SA, DEV, QA, DevOps, UI, Security |
| promptMode | enum | Yes | append | `append` or `replace` |
| skillsOverride | function | No | - | Filter/merge/replace skills discovered from `.pi/skills` |

### Agent Role Prompt Mapping

| Role | Prompt snippet |
|------|----------------|
| SM | SDLC Scrum Master – coordinate agents and enforce quality gates |
| BA | SDLC BA Agent – Business Analyst – create BRD and FSD |
| SA | SDLC SA Agent – Solution Architect – create TDD and design |
| DEV | SDLC DEV Agent – Developer – implement code and tests |
| QA | SDLC QA Agent – Quality Assurance – create STP/STC and test |
| DevOps | SDLC DevOps Agent – Deployment and CI/CD |
| UI | SDLC UI Agent – User Interface design |
| Security | SDLC Security Agent – Security review and assessment |

## 3. Usage

### Initialize DefaultResourceLoader with overrides

```ts
import { buildResourceLoaderOptions } from './src/pi-agent/agent-configurator';
import { createResourceLoader } from './src/pi-agent/resource-loader.factory';

const base = { cwd: '/workspace', agentDir: '/home/user/.pi/agent/skills' };
const opts = buildResourceLoaderOptions(base, 'BA', 'replace');
const loader = createResourceLoader({ cwd: opts.cwd, agentDir: opts.agentDir });
// Pi SDK will receive systemPromptOverride / appendSystemPromptOverride via options
```

### Create Pi Session

```ts
const session = simulateAgentSession(opts, 'BA');
console.log(session.systemPrompt); // contains BA steering
```

### Append mode example

```ts
const optsAppend = buildResourceLoaderOptions(base, 'DEV', 'append');
// optsAppend.appendSystemPromptOverride = ['SDLC DEV Agent …']
```

## 4. Administration

- Skills auto-discover from `<cwd>/.pi/skills` and `~/.pi/agent/skills`.
- Use `skillsOverride` to filter by phase or agent.
- When `promptMode = 'replace'`, `appendSystemPromptOverride` is forced to `[]` to prevent unintended `APPEND_SYSTEM.md` inclusion.
- Reload resources before session creation via `reloadResourceLoader(loader)`.

## 5. Troubleshooting

| Issue | Cause | Resolution |
|-------|-------|------------|
| Validation error "Invalid agentRole" | Role not in allowed list | Use one of SM, BA, SA, DEV, QA, DevOps, UI, Security |
| Validation error "Invalid promptMode" | Mode not append/replace | Set promptMode to `append` or `replace` |
| APPEND_SYSTEM.md still present | Replace mode not applied | Ensure `promptMode = 'replace'` returns empty append list |
| Skills not loaded | Path missing | Verify `.pi/skills` exists; loader falls back gracefully |

Error codes:
- ValidationError: Agent role or prompt mode invalid

## 6. API Reference

### buildResourceLoaderOptions(base, agentRole, promptMode, skillsFilter?)

Returns `ConfiguredResourceLoaderOptions` with `systemPromptOverride`, `appendSystemPromptOverride`, `skillsOverride`.

### validateAgentRole(role)

Throws `ValidationError` if role not allowed.

### validatePromptMode(mode)

Throws `ValidationError` if mode not `append`/`replace`.

### simulateAgentSession(options, agentRole)

Returns `{ systemPrompt, resourceLoaderOptions, agentRole }` for testing.

## 7. FAQ

**Q: How to avoid APPEND_SYSTEM.md when replacing prompt?**
A: Use `promptMode='replace'`. Implementation forces `appendSystemPromptOverride = []`.

**Q: Can I load skills for a specific phase?**
A: Yes, pass `skillsFilter='phase'` to `buildResourceLoaderOptions`. Custom filter logic can be provided via `skillsOverride`.

**Q: Session init performance?**
A: Target <2s. Loader reload is synchronous mock; real Pi SDK latency depends on discovery.

## 8. Related Documents

- BRD: documents/SA4E-317/BRD.md
- FSD: documents/SA4E-317/FSD.md
- TDD: documents/SA4E-317/TDD.md
- STC: documents/SA4E-317/STC.md
