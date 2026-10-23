# Architecture Decision Record — Base64 File Proxy Pattern (SA4E-29)

## Status: Accepted & Implemented

## Date: 2026-07-17

## Context

### Problem

The Code Intelligence backend runs as a **remote process** (port 48721) and does NOT have access to the client filesystem. The VS Code Extension (port 9181) is the only component with local filesystem access. However, LLM agents need to work with local files (read .drawio XML, export PNG, ingest documents into KB).

Previously, backend tools accepted `file_path` parameters and attempted to read files directly — which only worked when backend ran on the same machine. This broke the remote deployment model:

```
❌ Old: LLM → Backend(remote, no filesystem) → tries fs.readFileSync(file_path) → FAIL
```

### Decision

Implement a **transparent, schema-driven Base64 proxy layer** in the Extension that automatically:
1. Detects which backend tools require file content (by scanning their schemas)
2. Rewrites tool schemas for LLM consumption (hide `content_base64`, show `file_path`)
3. Intercepts tool calls to read files → encode base64 → forward to backend
4. Intercepts responses to decode base64 → write files → return file paths to LLM

```
✅ New: LLM → Extension(9181, has filesystem) → base64 proxy → Backend(48721, no filesystem)
```

## Architecture

### Data Flow

```
┌─────────┐    file_path     ┌──────────────────────┐   content_base64    ┌──────────────┐
│   LLM   │ ──────────────→  │  Extension (9181)    │ ──────────────────→ │ Backend(48721)│
│         │                   │  WrapperServer       │                     │              │
│         │ ← file_path ───  │  + Base64ProxyService│ ← output_base64 ── │              │
└─────────┘                   └──────────────────────┘                     └──────────────┘
```

### Key Components

| Component | File | Responsibility |
|-----------|------|----------------|
| **Base64ProxyService** | `extension/src/services/Base64ProxyService.ts` | Schema detection, input/output proxy, schema rewriting |
| **WrapperServer** | `extension/src/services/WrapperServer.ts` | HTTP MCP server, routes tools/list + tools/call, orchestrates proxy |
| **RemoteBackendClient** | `extension/src/remote-backend-client.ts` | Lifecycle management, delegates to WrapperServer |
| **Backend Tools** | `backend/src/engine/tools/drawio-*.ts`, `memory/` | Accept `content_base64`, process in temp dirs, return `output_base64` |

### Schema Detection (Auto — No Hardcoding)

When Extension receives `tools/list` from backend, `Base64ProxyService.detectFromToolList()` scans each tool:

```typescript
// Input proxy detection: tool has content_base64 in its inputSchema.properties
hasBase64InputParam(tool): tool.inputSchema.properties has "content_base64"

// Output proxy detection: tool description mentions output_base64
hasBase64Output(tool): tool.description includes "output_base64" or "Returns output_base64"
```

Result: two auto-populated Sets (`base64InputTools`, `base64OutputTools`). Adding a new file-based backend tool requires **zero Extension code changes** — just add `content_base64` to its schema.

### Schema Rewriting for LLM

LLM never sees `content_base64`. Extension rewrites schemas before exposing to LLM:

| Backend Schema | LLM Sees |
|---------------|-----------|
| `content_base64` (required) | Hidden |
| `file_path` (optional/reference) | `file_path` (required) |
| — | `output_path` (optional, added for output tools) |

### execute_dynamic_tool Proxy

When LLM calls `execute_dynamic_tool({ toolName: "X", arguments: { file_path: "..." } })`:

1. `WrapperServer.handleDynamic()` calls `unwrapDynamicTool(args)` → extracts `toolName` + `innerArgs`
2. Checks if `toolName` ∈ `base64InputTools`
3. If yes: `proxyInput(toolName, innerArgs)` reads file → injects `content_base64`
4. Wraps back into `execute_dynamic_tool` shape → forwards to backend
5. On response: `proxyOutput(toolName, innerArgs, result)` → writes `output_base64` to file

### find_tools Response Proxy

When `find_tools` returns tool schemas from backend:
- `WrapperServer.rewriteFindToolsResponse()` applies `rewriteSchemasForLlm()` to the tools in the response
- LLM only ever sees `file_path` params, never `content_base64`

## Consequences

### Positive
- **Zero-config for new tools**: Add `content_base64` to backend schema → auto-proxied
- **LLM simplicity**: LLM only deals with `file_path` (familiar concept)
- **Remote-safe**: Backend never touches client filesystem
- **Transparent**: Existing tool contracts unchanged from LLM perspective

### Negative
- **Base64 overhead**: ~33% bandwidth increase for binary files (acceptable for diagrams/documents)
- **Memory**: Large files held in memory as base64 strings (mitigated: typical files < 10MB)
- **Single point**: Extension must be running for file I/O (by design — it owns the filesystem)

## Tools Currently Proxied (auto-detected)

| Tool | Input Proxy | Output Proxy | Purpose |
|------|-------------|--------------|---------|
| `drawio_export_png` | ✅ file → base64 (drawio XML) | ✅ base64 → file (PNG) | Export .drawio to PNG |
| `drawio_auto_layout` | ✅ file → base64 (drawio XML) | ❌ (returns JSON text) | Analyze diagram layout |
| `mem_ingest_file` | ✅ file → base64 (any doc) | ❌ (returns status) | Ingest document into KB |

### Adding a New File Tool (Zero Extension Changes)

```typescript
// In backend — just declare content_base64 in schema:
export const MY_NEW_TOOL_DEF = {
  name: 'my_new_tool',
  description: 'Process a file. Returns output_base64 (result bytes).',
  inputSchema: {
    type: 'object',
    properties: {
      content_base64: { type: 'string', description: 'Base64-encoded file content' },
      file_path: { type: 'string', description: 'Original file path (reference)' },
    },
    required: ['content_base64'],
  },
};
// → Extension auto-detects and proxies. LLM sees file_path required.
```

## Child Tool Content Proxy (backend orchestration)

The extension proxy above only covers **backend tools that declare `content_base64`**. Child MCP tools (e.g. `markdown-exporter`'s `export_docx`) declare a content argument (`markdown`) and return a host-local artifact path — the extension never sees that path's bytes.

The backend orchestration layer adapts these tools **without adding a new tool** (`backend/src/modules/orchestration/content-proxy/`):

| Stage | Behaviour |
|-------|-----------|
| Detection | Name prefix `export_*` / `render_*` / `generate_*`, or description `… to PDF/DOCX/…`. Escape hatch: `CONTENT_PROXY_OVERRIDES` in `backend/src/config/ContentProxy.ts`. |
| Schema | Adds `content_base64`, moves the real content arg (`markdown`) to `x-content-param`, marks `x-output-base64: true`, removes the content arg from `required`. |
| Invocation | Wrapper mode = `content_base64` or `output_path` present → decode to the child's content argument; wrapper-only args are stripped. |
| Result | Artifact bytes become `output_base64` (multi-file → `outputs[]`); host paths are stripped. |

Artifact retrieval is transport-agnostic — the child may sit next to the backend (stdio) or on another host (streamable-http):

1. inline payload (`output_base64` / `base64` / `data`) or MCP `resource` blob
2. `resource_link` / `uri` → `resources/read` on the child (works across hosts)
3. `url` → http(s) fetch by the backend
4. `file:` / filesystem path → local read (stdio child)
5. nothing readable → **tool error `ARTIFACT_FETCH_FAILED`**

**Wrapper-mode contract: bytes or a hard error — never a bare path.** A remote server that returns only a local path must expose its artifact as an MCP resource or URL (or share a volume with the backend); silently returning the path is forbidden because the caller would report success while no file exists.

Verified live for all six exporters: `export_docx`, `export_xlsx`, `export_pptx`, `export_pdf`, `export_html`, `export_json`.

## Testing

- `extension/src/__tests__/backend-local-tools.test.ts` — 19 tests covering:
  - TC-12..13: Auto-detection from schema
  - TC-14..16: proxyInput (read file, throw on missing, passthrough)
  - TC-17: proxyOutput (write base64 → file)
  - TC-18: Schema rewriting (hide content_base64, add output_path)
  - TC-19..21: unwrapDynamicTool (nested args extraction)

## Related

- **SA4E-18**: Tool Visibility Tiers (CoreTools allowlist)
- **SA4E-42**: find_tools re-index (semantic discovery)
- **SA4E-43**: Extension compile fixes (langgraph stubs)
