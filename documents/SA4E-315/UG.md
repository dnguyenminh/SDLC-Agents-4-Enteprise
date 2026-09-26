# User Guide (UG)

## SDLC Agents 4 Enterprise — SA4E-315: Wire up DefaultResourceLoader (cwd + agentDir) for resource discovery

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-315 |
| Title | Wire up DefaultResourceLoader (cwd + agentDir) for resource discovery |
| Author | DEV Agent |
| Reviewer | BA Agent |
| Version | 1.0 |
| Date | 2026-09-25 |
| Status | Draft |
| Related BRD | documents/SA4E-315/BRD.md |
| Related FSD | documents/SA4E-315/FSD.md |
| Related TDD | documents/SA4E-315/TDD.md |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-25 | DEV Agent | Initial document |

---

## 1. Introduction

### 1.1 Purpose

This guide describes how the DefaultResourceLoader is explicitly wired with `cwd` and `agentDir` for Pi SDK sessions in SDLC Agents 4 Enterprise. It enables deterministic resource discovery for skills, extensions, prompt templates and AGENTS.md context files.

### 1.2 Audience

| Audience | What They Need |
|----------|---------------|
| Developer | How to configure SessionOrchestrator with explicit ResourceLoader |
| System Administrator | Workspace root detection and agent directory setup |
| DevOps | Logging diagnostics and troubleshooting discovery failures |

### 1.3 Prerequisites

| Prerequisite | Version | Required |
|-------------|---------|----------|
| Node.js | >=18 | Yes |
| @earendil-works/pi-coding-agent | latest | Yes |
| VS Code Workspace | - | Yes for cwd detection |

---

## 2. Getting Started

### 2.1 Quick Start

```bash
# 1. Ensure workspace root is detected by VS Code
# Workspace folder must be open

# 2. Verify agent directory exists
# Default: ~/.pi/agent

# 3. Create Pi session with explicit loader
# Code example in section 4.1
```

### 2.2 System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| Node.js | 18 | 20 |
| Memory | 512 MB | 1 GB |
| Disk | 100 MB for .pi | 500 MB |
| OS | Windows / macOS / Linux | - |

### 2.3 Configuration Methods

| Method | Priority | Best For |
|--------|----------|----------|
| VS Code workspaceFolders | 1 | `cwd` auto detection |
| DefaultAgentDirResolver | 2 | `agentDir` default `~/.pi/agent` |

---

## 3. Configuration

### 3.1 Configuration Reference

#### Resource Loader Options

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| cwd | string | process.cwd() | Workspace root directory from VS Code |
| agentDir | string | ~/.pi/agent | Agent directory for global skills |

#### WorkspaceRootResolver

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| fallbackCwd | string | process.cwd() | Fallback when workspace not detected |

#### DefaultAgentDirResolver

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| defaultAgentDir | string | ~/.pi/agent | Path to agent directory |

### 3.2 Environment Variables

None required. Paths are resolved via VS Code API and OS homedir.

---

## 4. Usage

### 4.1 Create Agent Session with Explicit Resource Loader

**Description:** Initialize DefaultResourceLoader with cwd and agentDir, reload resources, create Pi session.

**How to use:**

```ts
import { SessionOrchestrator } from './pi-agent/session-orchestrator';
import { WorkspaceRootResolver } from './pi-agent/workspace-root-resolver';
import { DefaultAgentDirResolver } from './pi-agent/agent-dir-resolver';

const workspaceResolver = new WorkspaceRootResolver();
const agentDirResolver = new DefaultAgentDirResolver();

const orchestrator = new SessionOrchestrator({
  workspaceResolver,
  agentDirResolver,
});

const sessionInfo = await orchestrator.createSession(piSdk);
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| workspaceResolver | IWorkspaceRootResolver | Yes | Resolves cwd |
| agentDirResolver | IAgentDirResolver | Yes | Resolves agentDir |
| sdk | PiSdk | Yes | Pi SDK instance |

**Expected Output:**

```json
{
  "session": { "id": "s1", "cfg": { ... } },
  "resourceLoader": { "reload": "function", ... },
  "diagnostics": []
}
```

### 4.2 Resource Reload

```ts
import { createResourceLoader, reloadResourceLoader, logDiagnostics } from './pi-agent/resource-loader.factory';

const loader = createResourceLoader({ cwd, agentDir });
await reloadResourceLoader(loader);
logDiagnostics(loader);
```

---

## 5. Administration

### 5.1 Monitoring Health

Check logs for:
- `DefaultResourceLoader instantiated` with cwd/agentDir
- `ResourceLoader reload completed`
- `Pi session created with explicit ResourceLoader`

### 5.2 Hot-Reload Configuration

Resource discovery is on-demand. Call `loader.reload()` after adding new `.pi/skills` or `.pi/prompts`.

---

## 6. Troubleshooting

### 6.1 Common Issues

| # | Symptom | Cause | Solution |
|---|---------|-------|----------|
| 1 | `Workspace root not found` | VS Code folder not open | Open workspace folder or set fallbackCwd |
| 2 | `agentDir does not exist` | `~/.pi/agent` missing | Create directory or provide custom path |
| 3 | `Resource discovery failed` | Loader reload error | Check filesystem permissions |

### 6.2 Error Codes

| Code | Message | Description | Action |
|------|---------|-------------|--------|
| WORKSPACE_NOT_FOUND | Workspace not detected | VS Code API returns empty | Open folder |
| INVALID_PATH | Invalid workspace path | Path not absolute | Verify resolver |
| Resource discovery failed | Reload exception | Filesystem error | Check logs |

### 6.3 Logs

| Log Location | Content | Useful For |
|-------------|---------|------------|
| stdout/stderr | Pino logger output | Diagnostics |

---

## 7. API Reference

### 7.1 SessionOrchestrator

| Attribute | Value |
|-----------|-------|
| Name | SessionOrchestrator |
| Description | Orchestrates Pi session creation with explicit ResourceLoader |

**Input:**
```ts
{
  workspaceResolver: IWorkspaceRootResolver,
  agentDirResolver: IAgentDirResolver
}
```

**Output:**
```ts
{
  session: unknown,
  resourceLoader: IResourceLoader,
  diagnostics: string[]
}
```

### 7.2 createResourceLoader

Creates DefaultResourceLoader or mock fallback.

**Input:**
```ts
{ cwd: string, agentDir: string }
```

**Output:** `IResourceLoader`

---

## 8. Appendix

### 8.1 Glossary

| Term | Definition |
|------|------------|
| DefaultResourceLoader | Pi SDK class for resource discovery |
| cwd | Current working directory - workspace root |
| agentDir | `~/.pi/agent` directory |

### 8.2 Related Documents

| Document | Location |
|----------|----------|
| BRD | documents/SA4E-315/BRD.md |
| FSD | documents/SA4E-315/FSD.md |
| TDD | documents/SA4E-315/TDD.md |

