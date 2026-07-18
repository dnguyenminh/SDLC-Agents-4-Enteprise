# User Guide — Code Intelligence Module (Extension Phase 3)

## Overview

The Code Intelligence module provides automatic workspace scanning, symbol extraction, and incremental re-indexing for the VS Code extension. It parses source files using the TypeScript Compiler API, computes file hashes for deduplication, and uploads structured code intelligence data to the backend via the `code_intel_upload` MCP tool.

## Quick Start

The module activates automatically when the extension starts (if `kiroSdlc.codeIntel.enabled` is `true`). No manual setup required.

1. Open a workspace in VS Code
2. Ensure the backend is running and reachable
3. Save any TypeScript/JavaScript file — it will be indexed automatically

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `kiroSdlc.codeIntel.enabled` | `true` | Enable/disable code intelligence scanning |

## Supported Languages

| Language | Extensions |
|----------|------------|
| TypeScript | `.ts`, `.tsx` |
| JavaScript | `.js`, `.jsx` |
| Kotlin | `.kt`, `.kts` |
| Python | `.py` |

## How It Works

### File Change Detection

The module watches for:
- **File saves** (`onDidSaveTextDocument`) — re-indexes changed files
- **File creates** (`onDidCreateFiles`) — indexes new files
- **File deletes** (`onDidDeleteFiles`) — removes from hash cache

All changes are debounced by 1 second to avoid redundant processing during rapid saves.

### Hash-Based Deduplication

Each file's content is hashed with SHA-256. If the hash hasn't changed since the last upload, the file is skipped. This prevents unnecessary network traffic and backend processing.

### Timestamp Resolution (BR-09)

Timestamps are resolved with the following priority:
1. **Git last commit time** — `git log -1 --format=%aI -- <file>`
2. **Filesystem modified time** — `fs.stat().mtime`
3. **Current time** — `Date.now()`

Security: Git commands use `execFile` (array args, no shell) to prevent command injection (SEC-07).

### Symbol Extraction

The module uses the TypeScript Compiler API (`ts.createSourceFile`) to extract:
- **Symbols**: functions, classes, interfaces, variables, methods
- **Imports**: named, default, namespace
- **Exports**: with kind and default flag

### Offline Queue

When the backend is unreachable, uploads are queued locally (up to 1000 items). The queue drains automatically when the backend reconnects.

## Architecture

```
FileChangeWatcher (onDidSave)
  → HashCache.hasChanged()
  → CodeIntelScanner.scanFile()
  → TimestampResolver.resolve()
  → CodeIntelUploader.uploadBatch()
  → (on failure) OfflineQueue.enqueue()
```

## Troubleshooting

| Issue | Cause | Resolution |
|-------|-------|------------|
| Files not being indexed | Extension disabled | Check `kiroSdlc.codeIntel.enabled` setting |
| Uploads failing | Backend unreachable | Check backend URL; uploads will queue and retry on reconnect |
| Git timestamps not resolving | Not a git repo or git not in PATH | Falls back to filesystem mtime automatically |
| Unsupported file ignored | Extension not in supported list | Only `.ts/.tsx/.js/.jsx/.kt/.kts/.py` are indexed |

## Error Codes

| Error | Description |
|-------|-------------|
| `Connection refused` | Backend server not running at configured URL |
| `Upload failed` | Backend rejected the upload (check payload format) |
| `Invalid response format` | Backend returned unexpected JSON structure |

## API Reference

### Backend Tool: `code_intel_upload`

```json
{
  "projectId": "string",
  "files": [{
    "filePath": "string (relative path)",
    "language": "string",
    "hash": "string (SHA-256, 64 hex chars)",
    "timestamp": "string (ISO 8601)",
    "symbols": [{ "name", "kind", "startLine", "endLine", "signature?" }],
    "imports": [{ "source", "names[]", "importType" }],
    "exports": [{ "name", "kind", "isDefault" }]
  }]
}
```

### Response

```json
{
  "accepted": 5,
  "skipped": 2,
  "errors": []
}
```
