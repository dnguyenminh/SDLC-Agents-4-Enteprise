# User Guide — SA4E-313 Pass IDE workspace root as cwd to Pi SDK session

## Overview
This guide describes how the Pi Coding Agent now automatically uses the VS Code workspace root as current working directory for Pi SDK sessions, eliminating the 'unknown workspace' prompt.

## Installation
No manual installation required. Feature is included in SDLC Agents 4 Enterprise extension v1.40.2+.

Prerequisites:
- VS Code 1.85+
- Active workspace folder opened

## Configuration Reference
No configuration needed. Workspace root is auto-detected via `workspace.workspaceFolders[0].uri.fsPath`.

Fallback:
- If workspace not detected → fallback to `process.cwd()`
- Warning logged to extension output

## Usage
1. Open VS Code with workspace folder.
2. Activate Pi chatbox.
3. Session is created automatically with cwd = workspace root.
4. Built-in tools `ls/read/bash/edit/write/grep/find` resolve relative to workspace root.
5. AGENTS.md / context files are auto-discovered walking up from cwd.

### Example
Workspace: `C:\Users\ASUS\project`
Session created with:
```ts
createAgentSession({
  cwd: 'C:\Users\ASUS\project',
  sessionManager: SessionManager.inMemory('C:\Users\ASUS\project')
})
```

## Administration
- No admin actions required.
- Check Output panel → SDLC Agents for logs: `Session created with cwd: ...`

## Troubleshooting
| Issue | Cause | Resolution |
|-------|-------|------------|
| Workspace not detected | workspaceFolders undefined | Open a folder first |
| Invalid workspace path | cwd not absolute | Ensure workspace folder is valid |
| Tools resolve wrong dir | Fallback used | Open workspace, reload window |

Error codes:
- `WORKSPACE_NOT_FOUND` → Fallback used
- `INVALID_PATH` → Session not created

## API Reference
### WorkspaceRootResolver
- `resolve(): string` — returns cwd
- `resolveWithInfo(info): string` — testable resolver

### PiSessionFactory
- `createSession(sdk: PiSdk): SessionResult` — creates session with cwd

## FAQ
Q: Does it support multi-root?
A: Uses first workspace folder only. Multi-root support out of scope.

Q: Can I override cwd?
A: Not exposed via UI. Code can inject custom resolver.
