# User Guide (UG)

## SDLC Agents 4 Enterprise — SA4E-380: Content Proxy for Child MCP Tools (Export DOCX/XLSX/PPTX/PDF/HTML/JSON Through the Extension Wrapper)

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-380 |
| Title | Content Proxy for child MCP tools: export DOCX/XLSX/PPTX/PDF/HTML/JSON through the extension wrapper (no new tools) |
| Author | DEV Agent |
| Reviewer | BA Agent |
| Version | 1.0 |
| Date | 2026-10-24 |
| Status | Draft |
| Related BRD | BRD-v1-SA4E-380.docx |
| Related FSD | FSD-v1-SA4E-380.docx |
| Related TDD | TDD-v1-SA4E-380.docx |

> **Evidence policy (per `.opencode/rules/sdlc/ug-evidence.md`).** This deliverable is an **API/MCP capability** (no UI), so the required evidence is **real request/response examples** captured from the actual running build. All examples in §4 and §8 were captured live on 2026-10-24 from: backend dev server (code-intel, `tsx watch`, PID restarted with the Phase 5 cleanup code) + extension wrapper **v1.55.3** installed in Kiro. Freshness checks performed: `find_tools` returns the adapted schema; a live export produced a real file and emptied the backend job dir (immediate cleanup OI-14); the periodic sweep (OI-15) cleaned 485 accumulated orphan files to 0.

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-24 | DEV Agent | Initial document — usage for agents + operators, cleanup configuration, troubleshooting; evidence from live v1.55.3 build |

---

## 1. Introduction

### 1.1 Purpose

SA4E-380 makes every file-producing child MCP tool (`export_docx`, `export_xlsx`, `export_pptx`, `export_pdf`, `export_html`, `export_json`) work **end-to-end through the extension wrapper**: an agent supplies a workspace `file_path`, and receives a **real file** at `output_path` — or an explicit error. The wrapper and backend also clean up the backend-side artifact files immediately after delivery and periodically sweep any orphans, so the backend host's disk does not fill up.

This guide tells (a) AI agents how to call the exporters and interpret every error, and (b) platform operators how to configure artifact roots, the cleanup sweep, and what to monitor.

### 1.2 Audience

| Audience | What They Need |
|----------|---------------|
| AI Agent (primary user) | How to discover and invoke exporters; the wrapper-mode contract (bytes or error, never a path); error handling rules |
| Platform Operator | Artifact root configuration (`ARTIFACT_OUTPUT_ROOTS`), sweep tuning (`ARTIFACT_CLEANUP_*`), log monitoring |
| Developer | How new child tools are auto-detected (convention + overrides) and where the proxy code lives |

### 1.3 Prerequisites

| Prerequisite | Version | Required |
|---------------|---------|----------|
| Extension (Kiro) | ≥ **1.55.3** | Yes — wrapper output-proxy + cleanup code ship together |
| Backend (code-intel) | same release as extension | Yes — both halves must be in lockstep |
| `markdown-exporter` child MCP server | pinned ref (see backend Dockerfile) | Yes — supplies the six exporters |
| Writable agent workspace | — | Yes — writes are confined to the workspace |

---

## 2. Getting Started

### 2.1 Quick Start (Agent)

```text
# Step 1: Discover the exporter (it is NOT in tools/list — use find_tools)
find_tools(query: "export docx")

# Step 2: Export a real file — pass a SOURCE PATH, never document content
execute_dynamic_tool(
  toolName   = "export_docx",
  arguments  = { file_path: "documents/SA4E-380/BRD-embedded.md",
                 output_path: "documents/SA4E-380/BRD-v1-SA4E-380.docx" }
)

# Step 3: Verify from the response — the file exists in the workspace
#   { "success": true, "file_path": ".../BRD-v1-SA4E-380.docx", "size_bytes": 1355130, ... }
```

### 2.2 System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| Node.js (backend) | 22 (per Dockerfile base) | 22 |
| Kiro + extension | v1.55.3 | latest |
| Artifact size | ≤ 25 MB per file (`MAX_ARTIFACT_BYTES`) | same — cap is shared by all retrieval paths |
| Disk (backend) | trivial — artifacts are deleted after inline + swept every 5 min | — |

### 2.3 Distribution Formats

| Format | How to Get | Use Case |
|--------|-----------|----------|
| VSIX (extension) | `sdlc-agents-4-enterprise-1.55.3.vsix` → `kiro --install-extension <file>.vsix` | Kiro desktop |
| Docker (backend image) | `ghcr.io/dnguyenminh/sdlc-agents-4-enteprise/backend` (CI-built, Trivy-gated) | Server deployments |

### 2.4 Configuration Methods

| Method | Priority | Best For |
|--------|----------|----------|
| Environment variables (`ARTIFACT_OUTPUT_ROOTS`, `ARTIFACT_CLEANUP_*`) | 1 (highest — overrides defaults) | Ops/deployment |
| Compiled defaults (`backend/src/config/ContentProxy.ts`) | 2 (fallback) | Zero-config dev setups |

### 2.5 Verify Configuration

- **Check 1 — backend alive:** `GET http://127.0.0.1:<backend-port>/health` → `{"status":"healthy",...}`.
- **Check 2 — exporter adapted:** `find_tools("export docx")` must return the schema with `x-content-param: "markdown"` and `x-output-base64: true` (real capture in §8.1).
- **Check 3 — round trip:** export any small markdown; the response must contain `file_path` + `size_bytes` and the file must exist in the workspace.
- **Check 4 — cleanup active (optional):** after the export, the backend job dir (`<artifact root>/<uuid>/`) is **empty**; one sweep tick later there is nothing left under any artifact root.

---

## 3. Configuration

### 3.1 Where configuration lives

There is no config file: the content proxy and cleanup read **environment variables** at backend start (see `backend/src/config/ContentProxy.ts` and `backend/src/modules/orchestration/artifact-cleanup/cleanup-config.ts`). Change requires a backend restart.

### 3.2 Configuration Reference

#### Artifact roots (F-01 confinement)

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `ARTIFACT_OUTPUT_ROOTS` | string (paths joined by `path.delimiter`: `;` on Windows) | see defaults below | Directories the backend may read **and delete** local artifacts from. A descriptor path outside these roots is never read → `ARTIFACT_FETCH_FAILED`. |

Defaults (when the variable is unset): `os.tmpdir()/sa4e-artifacts`, `<workspace>/tmp/artifacts`, and the `markdown-exporter` child home — `%LOCALAPPDATA%/markdown-exporter-mcp/artifacts` on Windows, `~/.cache/markdown-exporter-mcp/artifacts` on POSIX.

#### Cleanup sweep (OI-15)

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `ARTIFACT_CLEANUP_ENABLED` | boolean (`"true"`/`"false"`) | `true` | Master switch; `false` never starts the timer |
| `ARTIFACT_CLEANUP_INTERVAL_MS` | number | `300000` (5 min) | Tick interval |
| `ARTIFACT_CLEANUP_TTL_MS` | number | `600000` (10 min) | Minimum age before a file is considered orphaned |
| `ARTIFACT_CLEANUP_MAX_RUN_MS` | number | `30000` | Hard bound per tick; overrun logs a warning and stops the tick |

#### Content proxy conventions (backend code constants, `ContentProxy.ts`)

| Property | Default | Description |
|----------|---------|-------------|
| `FILE_TOOL_NAME_PREFIXES` | `export_`, `render_`, `generate_` | Name-based file-producer detection |
| `CONTENT_PROXY_OVERRIDES` | `{}` | Per-tool escape hatch (`contentParam` / `fileOutput` / `enabled`) |
| `MAX_ARTIFACT_BYTES` | 26,214,400 (25 MB) | Single cap shared by every retrieval path |

### 3.3 Environment Variables — examples

```powershell
# Windows — point roots at an extra child output dir + tighten the sweep
$env:ARTIFACT_OUTPUT_ROOTS = "D:\exports\childA;C:\Users\me\AppData\Local\markdown-exporter-mcp\artifacts"
$env:ARTIFACT_CLEANUP_INTERVAL_MS = "60000"    # every minute
$env:ARTIFACT_CLEANUP_TTL_MS = "300000"        # 5 min TTL
$env:ARTIFACT_CLEANUP_ENABLED = "true"
```

```bash
# POSIX
export ARTIFACT_OUTPUT_ROOTS="/srv/exports/childA:$HOME/.cache/markdown-exporter-mcp/artifacts"
export ARTIFACT_CLEANUP_TTL_MS=300000
```

### 3.4 Configuration Examples

```text
Minimal (dev):      set nothing — defaults cover the standard stdio child + dedicated roots.
Multi-child server:  ARTIFACT_OUTPUT_ROOTS must list EVERY child's artifact directory.
Lockdown:            ARTIFACT_CLEANUP_ENABLED=false disables the sweep (immediate cleanup OI-14 still runs).
```

---

## 4. Usage

> All examples below are **real captures** from the running v1.55.3 build (2026-10-24).

### 4.1 Discover an exporter (`find_tools`)

**Description:** The six exporters are **not** in `tools/list` (the change registers zero new tools). Discovery is always semantic, via `find_tools`.

**How to use:**

```
find_tools(query: "export docx", threshold: 0.2, top_k: 8)
```

**Expected output (real capture — LLM-facing schema, wrapper-rewritten):**

```json
{
  "name": "export_docx",
  "schema": {
    "type": "object",
    "properties": {
      "file_name":  { "anyOf": [{ "type": "string" }, { "type": "null" }], "default": null, "title": "File Name" },
      "options":   { "anyOf": [{ "type": "object", "additionalProperties": true }, { "type": "null" }], "default": null, "title": "Options" },
      "file_path": { "type": "string", "description": "Relative paths resolve against the primary workspace folder; absolute paths pass through; paths outside the workspace root are rejected." },
      "output_path": { "type": "string", "description": "Relative paths resolve against the primary workspace folder; absolute paths pass through; paths outside the workspace root are rejected. Defaults to <file_path> with extension swapped (.drawio→.png; non-.drawio inputs get .out appended)." }
    },
    "required": ["file_path"],
    "title": "export_docxArguments",
    "x-content-param": "markdown",
    "x-output-base64": true
  }
}
```

Note what the LLM sees: `file_path` + `output_path` only. The child's `markdown` argument and the wrapper's `content_base64` are hidden — **the model must never produce base64**.

### 4.2 Export a document (wrapper mode)

**Description:** Converts a workspace markdown file into a real document and writes it back into the workspace. Same call shape for all six formats.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `toolName` | string | Yes | `export_docx` / `export_xlsx` / `export_pptx` / `export_pdf` / `export_html` / `export_json` |
| `arguments.file_path` | string | Yes | Source markdown inside the workspace (pass the PATH, never content) |
| `arguments.output_path` | string | No | Destination file or directory; omitted → next to the source with the child-suggested name |
| `arguments.file_name` | string | No | Suggested artifact name honoured by the child |

**Example (real request):**

```
execute_dynamic_tool(
  toolName  = "export_html",
  arguments = { file_path: "tmp/cleanup-smoke.md",
                output_path: "tmp/cleanup-smoke-out.html",
                file_name: "cleanup-smoke-out.html" }
)
```

**Expected output (real response, 2026-10-24):**

```json
{
  "success": true,
  "summary": "Exported Markdown to HTML: cleanup-smoke-out.html",
  "artifacts": [{ "name": "cleanup-smoke-out.html", "mime_type": "text/html", "size": 90 }],
  "file_name": "cleanup-smoke-out.html",
  "size_bytes": 90,
  "mime_type": "text/html",
  "file_path": "c:\\projects\\kiro\\SDLC-Agents-4-Enterprise\\tmp\\cleanup-smoke-out.html"
}
```

**Wrapper-mode contract:** on success the response carries `file_path` + `size_bytes` (payloads are stripped); on failure it carries `isError = true` with a stable code prefix. **A bare host path is never a valid result** — treat any path-only "success" as a defect.

**Six formats, verified live (BRD §8.3):** docx 14,599 B (OOXML), xlsx 4,849 B (`xl/workbook.xml` + `xl/worksheets/sheet1.xml`), pptx 29,296 B, pdf 1,967 B (`%PDF`), html 199 B, json 31 B. DOCX with embedded images: 184,761 B markdown → 265,062 B DOCX, images intact.

### 4.3 Multi-file results

When a tool returns several artifacts, the backend sends `outputs[]` and the wrapper writes **every** file, then rewrites the response as `outputs: [{ file_path, size_bytes, file_name, mime_type }, …]`. Partial writes are impossible: if only X of Y files can be written, the call fails with `PROXY_WRITE_FAILED: only X/Y artifacts could be written`.

### 4.4 Adding a new exporter (zero proxy changes)

A child tool added later is adapted automatically if its name starts with `export_`/`render_`/`generate_` **or** its description says "… to <format>" (pdf, docx, html, pptx, xlsx, json, png, jpg, gif, svg, zip). Restart the backend, verify via `find_tools`. Non-conforming tools: add an entry to `CONTENT_PROXY_OVERRIDES` (`contentParam` / `fileOutput` / `enabled`).

---

## 5. User Interface Guide

*Not applicable.* SA4E-380 is a protocol/orchestration capability with no user-facing screen; the observable surface is the tool contract documented in §4 and §8 (per UG template note: remove for server-only deliverables; evidence = real request/response examples).

---

## 6. Administration

### 6.1 Point the backend at a new child's artifact directory

1. Find where the child writes artifacts (its docs or source; e.g. `markdown-exporter-mcp` → `%LOCALAPPDATA%/markdown-exporter-mcp/artifacts`).
2. Append the directory to `ARTIFACT_OUTPUT_ROOTS` (joined with `;` on Windows / `:` on POSIX), keeping the existing entries.
3. Restart the backend; verify with one export — a missing root yields `ARTIFACT_FETCH_FAILED`.

### 6.2 Tune or disable the sweep

Set `ARTIFACT_CLEANUP_*` (see §3.2) and restart. `ARTIFACT_CLEANUP_ENABLED=false` keeps only the immediate post-delivery deletion (OI-14) and stops the periodic reaper.

### 6.3 Monitor cleanup health

Every tick logs one line — healthy example:

```json
{"component":"CleanupSweep","removed":12,"failed":0,"skipped":3,"durationMs":45,
 "msg":"Artifact cleanup sweep tick completed"}
```

Alert when `failed > 0` persists across ticks (locked/permission-denied files accumulate). All logs use basenames only — no host paths.

### 6.4 What operators never need to do

- Delete backend-side artifact files by hand — immediate cleanup empties each job dir on delivery; the sweep removes anything older than the TTL (verified live: 485 accumulated orphans → 0 after the fix).
- Configure per-format anything — the proxy is format-blind; format validity is the child's job.

---

## 7. Troubleshooting

### 7.1 Common Issues

| # | Symptom | Cause | Solution |
|---|---------|-------|----------|
| 1 | `ARTIFACT_FETCH_FAILED: <name> … path-only artifacts require the server to run on the backend host` | The child's artifact directory is not in `ARTIFACT_OUTPUT_ROOTS` (F-01 confinement refuses out-of-root reads), or the child runs remotely and returns only a host path | Add the child's artifact dir to the roots (§6.1); for remote children configure them to expose MCP resources/URLs |
| 2 | `Missing content: pass file_path so the extension wrapper can inject content_base64…` | Wrapper mode was requested but no usable payload reached the backend (typically: calling with `output_path` only, or an old wrapper build that does not inject content) | Pass a real workspace `file_path`; ensure the extension is ≥ 1.55.3 |
| 3 | Exported file does not appear although the call "succeeded" | Old wrapper code pre-1.55.3 (known environment blocker before this release) | Reload the Kiro window / reinstall ≥ 1.55.3; verify with one smoke export |
| 4 | `PROXY_WRITE_FAILED: … — no file was written` | Destination blocked by the workspace path/symlink guard, permission, or disk | Choose a destination inside the workspace; free disk; check the sanitized reason in the message |
| 5 | Sweep never removes anything | `ARTIFACT_CLEANUP_ENABLED=false`, or files younger than the TTL, or they live outside the roots | Re-enable; wait one TTL; confirm the root list |
| 6 | `Invalid content_base64 payload.` | The payload failed strict base64/UTF-8 validation | Never send content manually — pass `file_path` and let the wrapper inject |
| 7 | Backend artifacts dir grows despite cleanup | A child writes to a directory not in the roots (sweep cannot touch it; OI-14 also cannot read it) | §6.1 — add the directory |

### 7.2 Error Codes

| Code | Meaning | Agent action |
|------|---------|--------------|
| `ARTIFACT_FETCH_FAILED` | Child declared an artifact but no readable bytes were obtained; **no file was written** | Fix deployment (roots / remote child exposure). Do NOT retry with a raw path — a path is never an acceptable result |
| `PROXY_WRITE_FAILED` (zero / X-Y / exception) | Bytes arrived but could not all be written | Retry into a different destination after fixing the sanitized cause |
| `Invalid content_base64 payload.` | Malformed payload — child never invoked | Re-check the call: pass `file_path`, not content |
| `Missing content: pass file_path …` | Wrapper mode without a usable payload | Supply `file_path` |
| `FS_ERROR` (wrapper) | Source unreadable / outside workspace / symlink / > 25 MB | Fix the source path; split very large inputs |

### 7.3 Logs

| Log source | Content | Useful for |
|-----------|---------|------------|
| Backend (`pino`, component `CleanupSweep`) | Per-tick `{removed, failed, skipped, durationMs}`; per-file failures with basename only | Sweep health, orphan accumulation |
| Backend (content proxy) | `Proxying tool execution to child server {toolName, serverName, wrapperMode}` | Confirming wrapper-mode invocation |
| Wrapper output channel (`[WrapperServer]`) | Origin-gate denials, proxy write failures | Extension-side debugging |

### 7.4 FAQ

**Q: Why can't I see `export_docx` in `tools/list`?**
A: By design — the change registers zero new tools. Discovery is via `find_tools`; execution via `execute_dynamic_tool`.

**Q: Can I pass the markdown content directly?**
A: No. Pass a workspace `file_path`; the wrapper reads and injects the bytes. Passing content where a path belongs produces a valid but meaningless document (BRD Risk R-9).

**Q: A new child tool `export_csv` appeared — what do I configure?**
A: Nothing. Convention detection adapts it on the next backend restart (unless its artifacts go to a directory outside the default roots — then §6.1).

**Q: Where do exported files live?**
A: In the agent workspace — exactly where `output_path` (or the default next-to-source rule) puts them. Nothing persists on the backend host after delivery.

---

## 8. API Reference

### 8.1 `export_docx` (representative for all six exporters)

| Attribute | Value |
|-----------|-------|
| Name | `export_docx` |
| Description | Export Markdown content to a DOCX document. Returns `output_base64` (base64 file bytes) when invoked through the extension wrapper. |

**LLM-facing input schema** (real capture — see §4.1): `required: ["file_path"]`; properties `file_path`, `output_path`, `file_name`, `options`; markers `x-content-param: "markdown"`, `x-output-base64: true` (wrapper-managed, hidden from the model).

**Example request / response:** see §4.2 (real captures).

**Sibling tools:** `export_xlsx`, `export_pptx`, `export_pdf`, `export_html`, `export_json` — identical contract; the child converter and MIME type differ.

---

## 9. Appendix

### 9.1 Glossary

| Term | Definition |
|------|------------|
| Wrapper mode | Invocation with `file_path`/`output_path` present; bytes in, bytes out, paths forbidden |
| Artifact roots (`ARTIFACT_OUTPUT_ROOTS`) | The only directories the backend may read **and delete** local artifacts from (F-01 confinement) |
| Immediate cleanup (OI-14) | Backend deletes the local artifact file right after its bytes are inlined into the response |
| Periodic sweep (OI-15) | Bounded background task removing orphaned files older than the TTL from the roots |
| `ARTIFACT_FETCH_FAILED` / `PROXY_WRITE_FAILED` | The two fail-loud delivery error codes; both state that no (or only part of the) file was written |

### 9.2 Related Documents

| Document | Location |
|----------|----------|
| BRD / FSD / TDD / STP / STC / SECURITY-REVIEW | `documents/SA4E-380/` (+ v1 DOCX attached to Jira SA4E-380) |
| Architecture note | `documents/SA4E-29/ARCHITECTURE-BASE64-PROXY.md` § "Child Tool Content Proxy" |
| Cleanup design | TDD §9 (OI-14/OI-15 + F-01 binding) |
| Canonical agent procedure | `.opencode/skills/file-writing/SKILL.md` |

### 9.3 Version Compatibility

| System Version | Breaking Changes |
|-----------------|------------------|
| 1.55.3 | First release shipping the content proxy + cleanup; requires backend and extension in lockstep. Mixed versions degrade to loud `ARTIFACT_FETCH_FAILED`, never silent loss |

---

*End of document.*
