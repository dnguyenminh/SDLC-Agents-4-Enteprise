# User Guide (UG)

## SDLC Agents 4 Enterprise — SA4E-394: [MCP Tools] Per-call base_dir parameter for all file_path Tools

---
 
## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-394 |
| Title | [MCP Tools] Hỗ trợ multi-worktree: tham số base_dir per-call (hoặc multi-root registry) cho mọi tool nhận file_path |
| Author | DEV Agent |
| Reviewer | BA Agent |
| Version | 1.0 |
| Date | 2026-11-01 |
| Status | Draft |
| Related BRD | BRD-v1.1-SA4E-394.docx |
| Related FSD | FSD-v1.1-SA4E-394.docx |
| Related TDD | TDD-v1.0-SA4E-394.docx |

---
 
## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-11-01 | DEV Agent | Initial document — multi-workspace base_dir support, allowlist configuration, cross-worktree path resolution |

---
 
## 1. Introduction

### 1.1 Purpose

This user guide explains how to configure and use the multi-workspace `base_dir` parameter for all MCP (Model Context Protocol) server tools that accept `file_path` parameters. After implementing SA4E-394, AI agents operating from different worktrees (e.g., Orca worktrees) can resolve relative file paths against the correct workspace root per invocation, instead of being pinned to a single server-startup root.

This guide is for:
- **AI Agents** — how to call tools with `base_dir` to resolve paths in your worktree
- **System Administrators** — how to configure the workspace allowlist
- **Developers** — how the feature is implemented (quick reference)

### 1.2 Audience

| Audience | What They Need |
|----------|---------------|
| AI Agent | How to pass `base_dir` when calling MCP tools so relative `file_path` resolves against their worktree root |
| System Administrator | How to set `MCP_WORKSPACE_ROOTS` env var or `MCP_WORKSPACE_ROOTS_FILE` config file so the server knows which workspaces are allowed |
| Developer | How the shared `MultiWorktreePathResolver` works and where the 8 handler surfaces were extended |

### 1.3 Prerequisites

| Prerequisite | Version | Required |
|--------------|---------|----------|
| Node.js runtime | `>=20.0.0` | Yes |
| MCP server (code-intel) | `v1.0+` (with SA4E-394 feature) | Yes |
| Access to `MCP_WORKSPACE_ROOTS` env var or config file | — | Yes |

---
 
## 2. Getting Started

### 2.1 Quick Start

> **NOTE:** This quick start assumes the MCP server is already running with the SA4E-394 feature enabled (server code updated, new shared resolver module loaded).

```bash
# Step 1: Configure the workspace allowlist
# On Windows (Orca worktrees):
set MCP_WORKSPACE_ROOTS=C:\Users\ASUS\orca\workspaces\SDLC-Agents-4-Enterprise;C:\Users\ASUS\orca\workspaces\SDLC-Agents-4-Enterprise\SA4E-306;C:\Users\ASUS\orca\workspaces\SDLC-Agents-4-Enterprise\SA4E-313

# On POSIX / macOS:
export MCP_WORKSPACE_ROOTS="/home/user/project:/home/user/project-worktree-A:/home/user/project-worktree-B"

# Alternative: use config file MCP_WORKSPACE_ROOTS_FILE
# Create MCP_WORKSPACE_ROOTS_FILE (1 root/line, # comments, blank lines skipped):
# /home/user/project
# /home/user/project-worktree-A
# /home/user/project-worktree-B

# Step 2: Restart the MCP server so allowlist takes effect
# The server reads MCP_WORKSPACE_ROOTS at startup, logs "MCP workspace allowlist loaded" listing entries

# Step 3: As an AI agent, call tools with base_dir parameter
# Example: mem_ingest_file with base_dir pointing to your worktree
mem_ingest_file(file_path="documents/SA4E-394/UG.md", base_dir="/home/user/project-worktree-B")
```

### 2.2 System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| Runtime — Node.js | `v20.0.0` | `v22.0.0` |
| Memory | 512 MB RAM | 1 GB+ RAM |
| Disk | 100 MB free | 500 MB free |
| OS | Windows 10+/Ubuntu 20.04+ | Latest LTS |

### 2.3 Distribution Formats

This feature is distributed as a code change to the MCP server (backend + extension). No separate binary distribution — the `base_dir` parameter is automatically available on all 8 path-accepting tools after server update + restart.

### 2.4 Configuration Methods

The workspace allowlist can be configured via two methods, with the following priority order:

| Method | Priority | Best For |
|--------|----------|----------|
| **Environment variable `MCP_WORKSPACE_ROOTS`** | 1st (highest) | Quick startup, CI/CD, dynamic per-deployment |
| **Config file `MCP_WORKSPACE_ROOTS_FILE`** | 2nd | Persistent allowlist, team-shared config, not changing frequently |
| **Legacy mode (no config, no env)** | 3rd (fallback) | Backward compatibility only — server pins single root at startup as before |

**Environment variable format:**
- **Windows**: semicolon-delimited, e.g. `C:\root1;C:\root2;C:\root3`
- **POSIX / macOS**: colon-delimited, e.g. `/root1:/root2:/root3`

**Config file format** (`MCP_WORKSPACE_ROOTS_FILE`):
- One absolute path per line
- Lines starting with `#` are treated as comments and skipped
- Blank lines are skipped
- Example content:
  ```
  # MCP Workspace Allowlist — SA4E-394
  /home/user/project
  /home/user/project-worktree-A
  /home/user/project-worktree-B
  ```

### 2.5 Verify Configuration

After configuring `MCP_WORKSPACE_ROOTS` or `MCP_WORKSPACE_ROOTS_FILE` and restarting the server, verify the allowlist loaded correctly:

1. **Check startup log**: The MCP server should output an INFO message similar to:
   ```
   MCP workspace allowlist loaded: 3 entries
   - /home/user/project
   - /home/user/project-worktree-A
   - /home/user/project-worktree-B
   ```
   If any entry's directory does not exist on the filesystem, a WARN is logged: `Warning: workspace root '/path/that/does/not/exist' does not exist; skipping`.

2. **Test with a relative path call**: As an AI agent, call any of the 8 tools with `base_dir` set to one of the configured roots. The tool should succeed (relative `file_path` resolves against that root).

3. **Test rejection**: Call any tool with `base_dir` set to a path NOT in the allowlist. The tool should return error `PATH_REJECTED_OUTSIDE_ALLOWLIST` with message: `"Workspace root '{base_dir}' is not registered in the allowlist. Configure MCP_WORKSPACE_ROOTS to include this path."`

4. **Test backward compatibility**: Call any tool **without** `base_dir` parameter. The tool should behave exactly as before SA4E-394 — resolving relative `file_path` against the legacy pinned root (the server's startup checkout).

---
 
## 3. Configuration

### 3.1 Configuration File

The optional config file path is `MCP_WORKSPACE_ROOTS_FILE`. If set, its content overrides relative paths. If not set, the server falls back to `MCP_WORKSPACE_ROOTS` env var, then to legacy single-root mode.

- **Default location**: no default; if neither env nor file is set → legacy mode
- **Format**: 1 absolute path per line, `#` comments, blank lines skipped
- **Override**: `MCP_WORKSPACE_ROOTS` env var always takes precedence over `MCP_WORKSPACE_ROOTS_FILE`

### 3.2 Configuration Reference

#### Server Settings (auto-generated at startup, read-only)

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `MCP_WORKSPACE_ROOTS` | string (env) | — | Delimited list of allowed workspace roots, parsed at startup |
| `MCP_WORKSPACE_ROOTS_FILE` | string (file) | — | Path to config file with 1 root per line |
| `MCP_LEGACY_ROOT` | string | `process.cwd()` | The pinned legacy root at server startup (internal, not user-configurable) |

#### Feature Settings (controlled by SA4E-394)

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `feature.multi-worktree.enabled` | boolean | `true` (after SA4E-394 enable) | Toggles the `base_dir` parameter support across all 8 tools |
| `feature.multi-worktree.strict-containment` | boolean | `true` | Enforces containment check AFTER path resolution (blocks `../` traversal) |

### 3.3 Environment Variables

| Variable | Description | Required | Example |
|----------|-------------|----------|---------|
| `MCP_WORKSPACE_ROOTS` | Delimited list of allowed workspace roots (see format in §2.4) | Yes (for feature to work) | Windows: `C:\Users\ASUS\orca\workspaces\SDLC-Agents-4-Enterprise;C:\Users\ASUS\orca\workspaces\SDLC-Agents-4-Enterprise\SA4E-394`<br>POSIX: `/home/dnguyenminh/SDLC-Agents-4-Enterprise:/home/dnguyenminh/SDLC-Agents-4-Enterprise/SA4E-394` |
| `MCP_WORKSPACE_ROOTS_FILE` | Path to config file with workspace roots (1 per line, `#` comments, blank lines skipped) | Optional | `C:\opt\mcp-workspace-roots.txt` |

### 3.4 Configuration Examples

#### Minimal Configuration (env var only)

**Windows CMD:**
```cmd
set MCP_WORKSPACE_ROOTS=C:\Users\ASUS\orca\workspaces\SDLC-Agents-4-Enterprise
```

**PowerShell:**
```powershell
$env:MCP_WORKSPACE_ROOTS="C:\Users\ASUS\orca\workspaces\SDLC-Agents-4-Enterprise"
```

**POSIX / macOS:**
```bash
export MCP_WORKSPACE_ROOTS="/home/user/project"
```

#### Full Configuration (env var + config file)

**Windows:**
```
MCP_WORKSPACE_ROOTS=C:\Users\ASUS\orca\workspaces\SDLC-Agents-4-Enterprise;C:\Users\ASUS\orca\workspaces\SDLC-Agents-4-Enterprise\SA4E-394
```
Config file `C:\opt\mcp-workspace-roots.txt`:
```
# MCP Allowlist — includes primary + 2 Orca worktrees
C:\Users\ASUS\orca\workspaces\SDLC-Agents-4-Enterprise
C:\Users\ASUS\orca\workspaces\SDLC-Agents-4-Enterprise\SA4E-306
C:\Users\ASUS\orca\workspaces\SDLC-Agents-4-Enterprise\SA4E-313
```

**POSIX / macOS:**
```
MCP_WORKSPACE_ROOTS="/home/user/project:/home/user/project-worktree-A:/home/user/project-worktree-B"
```
Config file `/opt/mcp-workspace-roots.txt`:
```
/home/user/project
# This worktree is temporary
/home/user/project-worktree-A
/home/user/project-worktree-B
```

#### Verification after configuration

After restarting the MCP server, check the startup log for:
```
MCP workspace allowlist loaded: N entries
```
where N is the number of valid, existing directory entries from your config.

---
 
## 4. Usage

### 4.1 Resolve Relative Path in Your Worktree (AI Agent)

As an AI agent operating in a worktree, you can now call any of the 8 path-accepting MCP tools with a `base_dir` parameter. The relative `file_path` will resolve against the workspace root you specify.

**Example — mem_ingest_file with base_dir:**

```json
{
  "file_path": "documents/SA4E-394/UG.md",
  "base_dir": "/home/user/project-worktree-B"
}
```

**Result:** The server validates `/home/user/project-worktree-B` is in the allowlist, then resolves `documents/SA4E-394/UG.md` against it → absolute path `/home/user/project-worktree-B/documents/SA4E-394/UG.md`. The file is read/processed from that location.

**Example — drawio_export_png with base_dir:**

```json
{
  "file_path": "diagrams/system-context.drawio",
  "base_dir": "C:\\Users\\ASUS\\orca\\workspaces\\SDLC-Agents-4-Enterprise\\SA4E-394"
}
```

**Result:** Same validation + resolution logic. Note: `drawio_export_png` also has `output_path` parameter (extension-side proxy for PNG export).

**Example — jira_attach_file with base_dir:**

```json
{
  "issue_key": "SA4E-394",
  "file_path": "docs/diagrams/brd_flow.drawio",
  "base_dir": "C:\\Users\\ASUS\\orca\\workspaces\\SDLC-Agents-4-Enterprise\\SA4E-394"
}
```

### 4.2 Omit base_dir — Legacy Behavior

If you omit the `base_dir` parameter entirely, the tool behaves exactly as before SA4E-394:

- Relative `file_path` resolves against the **legacy pinned root** (the workspace the MCP server was started in)
- Absolute `file_path` is validated against that same legacy root
- All existing integrations continue to work without modification

**Example — mem_ingest_file without base_dir:**

```json
{
  "file_path": "documents/SA4E-394/UG.md"
}
```

**Result:** The server resolves `documents/SA4E-394/UG.md` against its startup root (e.g., `c:\projects\kiro\SDLC-Agents-4-Enterprise`). If the file exists there, it works. If not, you get `FS_ERROR` or `PATH_REJECTED_OUTSIDE_WORKSPACE` (legacy code). This is **byte-identical backward compatibility**.

### 4.3 Per-Tool Path-Argument Name Reference

Not all tools use the parameter name `file_path`. Here's the complete reference per TDD §3.3.4:

| Tool | Parameter name for file path | Notes |
|------|------------------------------|-------|
| `mem_ingest_file` | `file_path` | Standard |
| `embed_image` | `file_path` | Standard |
| `drawio_export_png` | `file_path` | **reference-only**: the actual PNG export happens on the extension side via `output_path`; `file_path` is the diagram to process |
| `drawio_auto_layout` | `file_path` | Standard |
| `jira_attach_file` | `file_path` | Standard |
| `confluence_add_attachment` | `file_path` | Standard |
| `sandbox_run` | `file` | **Different name**: the sandbox tool accepts `file` (not `file_path`) as the path parameter |
| `stream_write_file` | `path` or `file_path` | **Dual acceptance**: both names are supported for backward compatibility; `path` is the primary name per TDD DISC-3 |

### 4.4 Error Messages

When `base_dir` is used, these are the exact error messages from FSD §3.1.6 and BR-11 precedence:

| Scenario | Error Code | Message |
|----------|------------|---------|
| `base_dir` not in allowlist | `PATH_REJECTED_OUTSIDE_ALLOWLIST` | `"Workspace root '{base_dir}' is not registered in the allowlist. Configure MCP_WORKSPACE_ROOTS to include this path."` |
| `base_dir` does not exist on filesystem | `FS_ERROR` | `"Workspace root '{base_dir}' does not exist on filesystem"` |
| Resolved path escapes `base_dir` (via `../`) | `PATH_REJECTED_OUTSIDE_ALLOWLIST` | `"Resolved path '{resolved}' is outside workspace root '{base_dir}'"` |
| Legacy branch (no `base_dir`, path outside pinned root) | `PATH_REJECTED_OUTSIDE_WORKSPACE` | `"Resolved path '{resolved}' is outside workspace root (legacy pinned root)"` |
| Permission denied on file operation | `FS_ERROR` | OS-specific error details (e.g., `EACCES`) |

**Error precedence (BR-11):** allowlist check → existence check → resolution → containment check. The first failing check returns its error; subsequent checks are not evaluated.

### 4.5 Security Considerations

When using `base_dir`, the following security rules apply (from TDD threat model T1–T10):

1. **Containment is never widened**: The allowlist is the **only** gate. Even if `base_dir` is provided and valid, the resolved absolute path must be strictly within `base_dir` — `../` traversal is blocked even inside the allowlist.

2. **Symlink escape prevented**: The resolver resolves symlinks to their real paths before containment check. A symlink inside `base_dir` pointing outside `base_dir` is rejected.

3. **TOCTOU guard**: The allowlist is loaded at server startup and cached in-memory as a `Set`. Changing the env var or config file requires a server restart — no hot-reload. This prevents race conditions where a path could be added/removed between validation and execution.

4. **No null-byte injection**: The resolver normalizes and validates paths without interpreting null bytes; any path containing null-byte sequences is rejected with `FS_ERROR`.

5. **Alias precedence (BR-10)**: If both `base_dir` and `workspace_root` are sent, `base_dir` takes precedence. If only `workspace_root` is sent, it is treated identically to `base_dir`.

---
 
## 5. User Interface Guide (if applicable)

> **Note:** This feature is server-side / MCP-tool-side. There is no user interface — all interaction is via tool call parameters (JSON). The UG does not include a UI section per the template rule (server-only / CLI-only system).

---
 
## 6. Administration

### 6.1 Adding/Removing Workspace Roots

**To add a workspace root:**
1. Add the absolute path to `MCP_WORKSPACE_ROOTS` env var (semicolon on Windows, colon on POSIX)
   OR add one line to `MCP_WORKSPACE_ROOTS_FILE` config file
2. **Restart the MCP server** — allowlist changes require restart (BR-17, no hot-reload)

**To remove a workspace root:**
1. Remove the path from `MCP_WORKSPACE_ROOTS` env var
   OR delete the line from `MCP_WORKSPACE_ROOTS_FILE`
2. **Restart the MCP server**

### 6.2 Monitoring Health

The MCP server logs the following events (info/warn/error levels):

| Event | Log Level | Message Pattern |
|-------|-----------|-----------------|
| Allowlist loaded at startup | INFO | `MCP workspace allowlist loaded: N entries` |
| Missing directory in allowlist | WARN | `Warning: workspace root '{path}' does not exist; skipping` |
| `base_dir` rejected (not in allowlist) | ERROR | `PATH_REJECTED_OUTSIDE_ALLOWLIST: workspace root '{base_dir}' not registered` |
| Containment violation (resolved path escapes base_dir) | ERROR | `PATH_REJECTED_OUTSIDE_ALLOWLIST: resolved path '{resolved}' outside '{base_dir}'` |
| Backward-compat call (no base_dir) | INFO | `Legacy path resolution: '{file_path}' against pinned root '{legacyRoot}'"` |

### 6.3 Rollback Plan

If the feature causes issues after deployment:

1. **Unset `MCP_WORKSPACE_ROOTS`** env var (or remove `MCP_WORKSPACE_ROOTS_FILE`)
2. **Restart the MCP server** — it falls back to legacy single-root mode automatically
3. **Verify**: all tools work without `base_dir` as before SA4E-394
4. **Code rollback** (if needed): `git revert <commit-hash>` that introduced the shared resolver + handler edits

The feature is **additive** — rolling back restores the exact prior behavior. No data migration or DB changes are involved.

---
 
## 7. Troubleshooting

### 7.1 Common Issues

| # | Symptom | Cause | Solution |
|---|---------|-------|----------|
| 1 | `PATH_REJECTED_OUTSIDE_ALLOWLIST` on valid worktree | `base_dir` not in allowlist, or delimiter mismatch (Windows `;` vs POSIX `:`) | Add the path to `MCP_WORKSPACE_ROOTS` with correct delimiter; restart server |
| 2 | `FS_ERROR: Failed to resolve parent dir` | Relative `file_path` without `base_dir`, file outside legacy pinned root | Either add `base_dir` parameter, or ensure file is in the server's startup checkout |
| 3 | Tool works without `base_dir` but fails with it | Server not restarted after configuring `MCP_WORKSPACE_ROOTS` | Restart the MCP server; allowlist is loaded at startup only |
| 4 | `PATH_REJECTED_OUTSIDE_WORKSPACE` even with `base_dir` | Server running old code (pre-SA4E-394) or extension not updated | Ensure MCP server code includes the new `multi-worktree-path-resolver.ts` modules and all 8 handler surfaces are updated |
| 5 | Traversal `../` allowed inside allowlist | Containment check not enforced or resolver bug | Verify the server code runs the containment check **AFTER** resolution (BR-07); upgrade to TDD v1.0+ design |

### 7.2 Error Codes Reference

| Code | Message | When it Happens | Action |
|------|---------|-----------------|--------|
| `PATH_REJECTED_OUTSIDE_ALLOWLIST` | `"Workspace root '{base_dir}' is not registered in the allowlist..."` | `base_dir` not in server allowlist | Add path to allowlist; or omit `base_dir` for legacy behavior |
| `PATH_REJECTED_OUTSIDE_ALLOWLIST` | `"Resolved path '{resolved}' is outside workspace root '{base_dir}'"` | Path traversal via `../` escaped `base_dir` | Fix the `file_path` — ensure resolved path stays within `base_dir` |
| `PATH_REJECTED_OUTSIDE_WORKSPACE` | `"Resolved path '{resolved}' is outside workspace root (legacy pinned root)"` | No `base_dir` provided; absolute `file_path` outside legacy root | Provide `base_dir`, or place file in legacy root |
| `FS_ERROR` | `"Workspace root '{base_dir}' does not exist on filesystem"` | `base_dir` specified but directory doesn't exist on server | Create the directory, or use a different `base_dir` |
| `FS_ERROR` | `EACCES / permission denied` | No read/write permission on resolved path | Fix filesystem permissions; run server with appropriate user |

### 7.3 Logs

The server writes the following to its main log (stdout or file, depending on configuration):

- **Start allowlist**: `MCP workspace allowlist loaded: 3 entries`
- **Each tool call with base_dir**: `Tool 'mem_ingest_file' called with base_dir='/opt/workspaces/ticket-42', file_path='docs/report.md'` (INFO, if tracing enabled)
- **Error events**: As listed in the table above (ERROR level)
- **Legacy calls (no base_dir)**: `Legacy resolution: 'docs/report.md' against pinned root '/opt/old-root'` (INFO)

### 7.4 FAQ

**Q: Do I need to restart the server every time I change the allowlist?**  
A: Yes. The allowlist is loaded once at server startup and cached in-memory as a `Set` (BR-17, P9). Changes to `MCP_WORKSPACE_ROOTS` env var or `MCP_WORKSPACE_ROOTS_FILE` require a server restart to take effect.

**Q: Can I use relative paths for `base_dir` itself?**  
A: No. The `base_dir` must be an absolute path. If a relative path is provided, the server normalizes it to absolute against the server's working directory before validation (BR-09). For best results, always use absolute paths.

**Q: What happens if both `base_dir` and `workspace_root` are sent?**  
A: `base_dir` takes precedence per BR-10. The `workspace_root` alias is kept for backward compatibility but is effectively ignored when `base_dir` is present.

**Q: Is the feature backward compatible?**  
A: Yes. Omitting `base_dir` gives byte-identical behavior to pre-SA4E-394 (legacy pinned root). All 4 ACs verify this: AC3 explicitly tests the backward-compat branch.

**Q: Can I configure different allowlists for different agent sessions?**  
A: The allowlist is a **server-level** configuration, not per-session. All agents sharing the same MCP server instance use the same allowlist. If you need isolated allowlists, you need separate MCP server instances (different ports, different start directories).

---
 
## 8. API Reference (if applicable)

This section is not applicable — the `base_dir` parameter is an optional parameter on existing MCP tool calls; no new API endpoints are introduced. The functional behavior is documented in §4 of this guide and in FSD.md §3.1.6.

---
 
## 9. Appendix

### 9.1 Glossary

| Term | Definition |
|------|------------|
| MCP | Model Context Protocol — the protocol used by the code-intelligence server to expose tools to AI agents |
| Worktree | A Git worktree — a linked working directory attached to the same repository, allowing isolated agent sessions |
| Allowlist | A server-side configuration (`MCP_WORKSPACE_ROOTS` or `MCP_WORKSPACE_ROOTS_FILE`) listing absolute paths of workspace roots permitted for `base_dir` parameter |
| Pinned Root | The single workspace root fixed at MCP server startup (legacy behavior, before SA4E-394) |
| base_dir | Optional parameter on 8 MCP tools; when provided, relative `file_path` resolves against this workspace root |
| workspace_root | Alias for `base_dir` (deprecated name, kept for compatibility); behaves identically per BR-10 |
| Containment | Security property ensuring resolved absolute paths cannot escape the effective workspace root (blocks `../` traversal) |
| Effective Root | The workspace root actually used: `base_dir` if provided and valid, otherwise the legacy pinned root (BR-11 precedence) |

### 9.2 Related Documents

| Document | Location |
|----------|----------|
| BRD | BRD-v1.1-SA4E-394.docx |
| FSD | FSD-v1.1-SA4E-394.docx |
| TDD | TDD-v1.0-SA4E-394.docx |
| DPG | DPG-v1.0-SA4E-394.docx |
| STP | STP-v1.0-SA4E-394.md |
| STC | STC-v1.0-SA4E-394.md |
| UG | UG-v1.0-SA4E-394.md (this document) |

### 9.3 Version Compatibility

| System Version | Config Version | Breaking Changes |
|---------------|---------------|-----------------|
| `1.0.0` (MCP server) | `v1.1` (FSD+TDD) | None — feature is fully backward compatible; omitted `base_dir` = legacy behavior |
| `1.0.0` (client/agent) | `v1.0` (tool call format) | None — `base_dir` is optional; existing calls without it continue working |

---
 
*End of UG for SA4E-394*