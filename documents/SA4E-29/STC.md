# System Test Cases (STC)

## SA4E Extension — SA4E-29: Fix base64 design for file tools (drawio, mem_ingest_file)

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-29 |
| Title | Fix base64 design for file tools (drawio, mem_ingest_file) |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-07-21 |
| Status | Approved (Retroactive) |
| Related STP | documents/SA4E-29/STP.md |
| Documentation Mode | Retroactive — tests already implemented |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-21 | QA Agent | Initiate document — retroactive STC |

---

## 1. Unit Tests — Local Tools (TC-01 to TC-07, TC-10, TC-11)

### TC-01: Create new file with parent directories (mode: write)

| Field | Value |
|-------|-------|
| ID | TC-01 |
| Level | UT |
| UC/BR | UC-06, BR-08, BR-14 |
| Priority | High |
| Status | Implemented |

**Preconditions:** Temp directory exists; nested subdirectory does NOT exist.

**Steps:**
1. Call `executeLocalTool('stream_write_file', { file_path: 'nested/test1.txt', content: 'Hello World', mode: 'write' })`
2. Verify result.isError === false
3. Verify result.content[0].text contains "Wrote file:"
4. Read file from disk, verify content === 'Hello World'

**Expected:** File created with parent dirs; content matches.

---

### TC-02: Overwrite existing file (mode: write)

| Field | Value |
|-------|-------|
| ID | TC-02 |
| Level | UT |
| UC/BR | BR-14 |
| Priority | High |
| Status | Implemented |

**Preconditions:** File 'test2.txt' exists with content "Old Content".

**Steps:**
1. Call `executeLocalTool('stream_write_file', { file_path, content: 'New Content', mode: 'write' })`
2. Verify result.isError === false
3. Read file, verify content === 'New Content'

**Expected:** File overwritten with new content.

---

### TC-03: Append to existing file (mode: append)

| Field | Value |
|-------|-------|
| ID | TC-03 |
| Level | UT |
| UC/BR | BR-14 |
| Priority | Medium |
| Status | Implemented |

**Preconditions:** File 'test3.txt' exists with "Line 1\n".

**Steps:**
1. Call `executeLocalTool('stream_write_file', { file_path, content: 'Line 2', mode: 'append' })`
2. Read file, verify content === 'Line 1\nLine 2'

**Expected:** Content appended without overwriting.

---

### TC-04: Return error for missing file_path parameter

| Field | Value |
|-------|-------|
| ID | TC-04 |
| Level | UT |
| UC/BR | BR-14 |
| Priority | High |
| Status | Implemented |

**Preconditions:** None.

**Steps:**
1. Call `executeLocalTool('stream_write_file', { content: 'Hello', mode: 'write' })` (no file_path)
2. Verify result.isError === true
3. Verify error message contains "'file_path' and 'content' required"

**Expected:** Error returned; no file created.

---

### TC-05: Inline local PNG image as base64 data URI (embed_image)

| Field | Value |
|-------|-------|
| ID | TC-05 |
| Level | UT |
| UC/BR | BR-14 |
| Priority | High |
| Status | Implemented |

**Preconditions:** Temp dir has dummy.png + doc.md referencing it.

**Steps:**
1. Call `executeLocalTool('embed_image', { file_path: mdPath })`
2. Verify result.isError === false, "Embedded 1 image(s)"
3. Verify output file doc-embedded.md contains data:image/png;base64

**Expected:** Local image inlined as base64 data URI.

---

### TC-06: Skip remote URLs and data URIs (embed_image)

| Field | Value |
|-------|-------|
| ID | TC-06 |
| Level | UT |
| UC/BR | BR-14 |
| Priority | Medium |
| Status | Implemented |

**Preconditions:** Markdown references http:// and data: URLs.

**Steps:**
1. Call `executeLocalTool('embed_image', { file_path: mdPath })`
2. Verify "skipped 2"; output content unchanged

**Expected:** Remote and data URIs left untouched.

---

### TC-07: Skip missing local images without crashing

| Field | Value |
|-------|-------|
| ID | TC-07 |
| Level | UT |
| UC/BR | BR-14 |
| Priority | Medium |
| Status | Implemented |

**Preconditions:** Markdown references non-existent image.

**Steps:**
1. Call `executeLocalTool('embed_image', { file_path })`
2. Verify "skipped 1"; no crash; output unchanged

**Expected:** Graceful skip for missing images.

---

### TC-10: getLocalToolDefinitions returns schemas

| Field | Value |
|-------|-------|
| ID | TC-10 |
| Level | UT |
| UC/BR | BR-14 |
| Priority | Medium |
| Status | Implemented |

**Steps:**
1. Call `getLocalToolDefinitions()`
2. Verify returns 2 definitions: stream_write_file, embed_image

**Expected:** Correct tool schemas returned.

---

### TC-11: Unknown tool returns error

| Field | Value |
|-------|-------|
| ID | TC-11 |
| Level | UT |
| UC/BR | BR-14 |
| Priority | Medium |
| Status | Implemented |

**Steps:**
1. Call `executeLocalTool('unknown_tool', {})`
2. Verify result.isError === true, "not implemented"

**Expected:** Clean error for unknown local tools.

---

## 2. Unit Tests — Proxy Input/Output (TC-08, TC-09)

### TC-08: proxyInput skips when content_base64 already present

| Field | Value |
|-------|-------|
| ID | TC-08 |
| Level | UT |
| UC/BR | BR-06 |
| Priority | High |
| Status | Implemented (implicit in TC-14 group) |

**Preconditions:** Service detected drawio_export_png as input proxy tool.

**Steps:**
1. Call `service.proxyInput('drawio_export_png', { file_path: '/x.drawio', content_base64: 'already' })`
2. Verify returned args === input args (same reference, no double-encode)

**Expected:** No double-encoding; args returned unchanged.

---

### TC-09: proxyOutput derives output path from .drawio to .png

| Field | Value |
|-------|-------|
| ID | TC-09 |
| Level | UT |
| UC/BR | BR-07 |
| Priority | High |
| Status | Implemented (implicit in TC-17) |

**Preconditions:** Service detected drawio_export_png as output proxy.

**Steps:**
1. Call proxyOutput with file_path ending .drawio, mockResult containing output_base64
2. Verify output file written at .png path
3. Verify result has file_path ending .png

**Expected:** Auto-derived path: .drawio -> .png.

---

## 3. Unit Tests — Base64ProxyService (TC-12 to TC-21)

### TC-12: Auto-detect input proxy tools from schema

| Field | Value |
|-------|-------|
| ID | TC-12 |
| Level | UT |
| UC/BR | UC-02, BR-01, BR-12, BR-13 |
| Priority | Critical |
| Status | Implemented |

**Preconditions:** Service initialized with 3 tools (2 with content_base64, 1 without).

**Steps:**
1. needsInputProxy('drawio_export_png') -> true
2. needsInputProxy('mem_ingest_file') -> true
3. needsInputProxy('code_search') -> false

**Expected:** Schema-driven detection identifies correct tools.

---

### TC-13: Auto-detect output proxy tools from description

| Field | Value |
|-------|-------|
| ID | TC-13 |
| Level | UT |
| UC/BR | UC-02, BR-02 |
| Priority | Critical |
| Status | Implemented |

**Steps:**
1. needsOutputProxy('drawio_export_png') -> true
2. needsOutputProxy('mem_ingest_file') -> false
3. needsOutputProxy('code_search') -> false

**Expected:** Only tools with "output_base64" in description detected.

---

### TC-14: proxyInput reads file and injects content_base64

| Field | Value |
|-------|-------|
| ID | TC-14 |
| Level | UT |
| UC/BR | UC-01, BR-05 |
| Priority | Critical |
| Status | Implemented |

**Preconditions:** File exists with known content "hello proxy".

**Steps:**
1. Call proxyInput('drawio_export_png', { file_path })
2. Verify result.content_base64 === base64("hello proxy")
3. Verify result.file_path preserved

**Expected:** File read, base64 encoded, injected into args.

---

### TC-15: proxyInput throws on missing file

| Field | Value |
|-------|-------|
| ID | TC-15 |
| Level | UT |
| UC/BR | UC-01 (EF-01-1) |
| Priority | Critical |
| Status | Implemented |

**Steps:**
1. proxyInput('drawio_export_png', { file_path: '/nonexistent.drawio' })
2. Verify throws /Failed to read file/

**Expected:** Clear error for ENOENT.

---

### TC-16: proxyInput passes through for non-proxy tool

| Field | Value |
|-------|-------|
| ID | TC-16 |
| Level | UT |
| UC/BR | UC-06 |
| Priority | High |
| Status | Implemented |

**Steps:**
1. proxyInput('code_search', { query: 'test' })
2. Verify returned === input args (identity)

**Expected:** Non-file tools unaffected.

---

### TC-17: proxyOutput writes base64 to file

| Field | Value |
|-------|-------|
| ID | TC-17 |
| Level | UT |
| UC/BR | UC-01, BR-07, BR-08 |
| Priority | Critical |
| Status | Implemented |

**Preconditions:** Mock result with output_base64 = base64("PNG data").

**Steps:**
1. Call proxyOutput('drawio_export_png', { file_path: 'input.drawio', output_path }, mockResult)
2. Verify file exists at output_path
3. Verify file content === "PNG data"
4. Verify result text has file_path, no output_base64

**Expected:** Base64 decoded, written to disk, result cleaned.

---

### TC-18: rewriteSchemasForLlm hides content_base64, adds output_path

| Field | Value |
|-------|-------|
| ID | TC-18 |
| Level | UT |
| UC/BR | UC-03, BR-03, BR-04 |
| Priority | Critical |
| Status | Implemented |

**Steps:**
1. Call rewriteSchemasForLlm with tool having content_base64 in properties
2. Verify properties.content_base64 === undefined
3. Verify properties.file_path defined
4. Verify properties.output_path defined
5. Verify required contains 'file_path', not 'content_base64'

**Expected:** LLM-facing schema hides internal params.

---

### TC-19: unwrapDynamicTool extracts toolName and arguments

| Field | Value |
|-------|-------|
| ID | TC-19 |
| Level | UT |
| UC/BR | UC-04, BR-09, BR-10 |
| Priority | Critical |
| Status | Implemented |

**Steps:**
1. Call unwrapDynamicTool({ toolName: 'drawio_export_png', arguments: { file_path: '/test.drawio' } })
2. Verify result.toolName === 'drawio_export_png'
3. Verify result.innerArgs.file_path === '/test.drawio'

**Expected:** Nested args extracted correctly.

---

### TC-20: unwrapDynamicTool handles tool_name + args variant

| Field | Value |
|-------|-------|
| ID | TC-20 |
| Level | UT |
| UC/BR | UC-04, BR-09 |
| Priority | High |
| Status | Implemented |

**Steps:**
1. Call unwrapDynamicTool({ tool_name: 'mem_ingest_file', args: { file_path: '/data.txt' } })
2. Verify result.toolName === 'mem_ingest_file'
3. Verify result.innerArgs.file_path === '/data.txt'

**Expected:** Both naming variants supported.

---

### TC-21: unwrapDynamicTool returns null for missing toolName

| Field | Value |
|-------|-------|
| ID | TC-21 |
| Level | UT |
| UC/BR | UC-04 (AF-04-2) |
| Priority | High |
| Status | Implemented |

**Steps:**
1. Call unwrapDynamicTool({ random: 'data' })
2. Verify result === null

**Expected:** Null returned when no toolName found (passthrough signal).

---

## 4. Integration Tests — WrapperServer (TC-22 to TC-26)

### TC-22: tools/call routes file tool through full proxy chain

| Field | Value |
|-------|-------|
| ID | TC-22 |
| Level | IT / E2E-API |
| UC/BR | UC-01 |
| Priority | Critical |
| Status | Planned |

**Preconditions:** WrapperServer started with mocked restCallTool returning output_base64.

**Steps:**
1. POST /mcp: tools/call drawio_export_png with file_path
2. Verify restCallTool received content_base64
3. Verify response has file_path + size_bytes
4. Verify output file on disk

**Expected:** Full proxy: read -> encode -> forward -> decode -> write -> respond.

---

### TC-23: tools/list returns rewritten schemas via HTTP

| Field | Value |
|-------|-------|
| ID | TC-23 |
| Level | IT / E2E-API |
| UC/BR | UC-03, UC-05 |
| Priority | Critical |
| Status | Planned |

**Steps:**
1. POST /mcp: tools/list
2. Verify schemas have file_path not content_base64
3. Verify output tools have output_path

**Expected:** Schemas rewritten for LLM consumption.

---

### TC-24: execute_dynamic_tool unwraps and proxies via HTTP

| Field | Value |
|-------|-------|
| ID | TC-24 |
| Level | IT / E2E-API |
| UC/BR | UC-04, BR-09, BR-10 |
| Priority | Critical |
| Status | Planned |

**Steps:**
1. POST /mcp: tools/call execute_dynamic_tool with nested drawio_export_png
2. Verify inner args proxied (content_base64 injected)
3. Verify output file written from response

**Expected:** Dynamic tool fully proxied.

---

### TC-25: find_tools response rewriting via execute_dynamic_tool

| Field | Value |
|-------|-------|
| ID | TC-25 |
| Level | IT |
| UC/BR | UC-05, BR-11 |
| Priority | High |
| Status | Planned |

**Steps:**
1. POST tools/call execute_dynamic_tool(toolName: "find_tools")
2. Verify response schemas rewritten (file_path, no content_base64)
3. Compare with tools/list output — must match

**Expected:** find_tools schemas consistent with tools/list.

---

### TC-26: Non-file tool passes through without proxy

| Field | Value |
|-------|-------|
| ID | TC-26 |
| Level | IT / E2E-API |
| UC/BR | UC-06 |
| Priority | High |
| Status | Planned |

**Steps:**
1. POST tools/call mem_search with { query: "test" }
2. Verify args forwarded unchanged
3. Verify response unchanged

**Expected:** Non-file tools unaffected.

---

## 5. PBT — Property-Based Tests (TC-27, TC-28)

### TC-27: Any schema with content_base64 property is detected

| Field | Value |
|-------|-------|
| ID | TC-27 |
| Level | PBT |
| UC/BR | BR-01, BR-13 |
| Priority | Medium |
| Status | Candidate |

**Property:** For any tool T where inputSchema.properties has "content_base64", detectFromToolList([T]) results in needsInputProxy(T.name) === true.

**Generator:** Arbitrary tool schemas with random names and property sets, always including "content_base64".

**Falsification:** Find schema that should be detected but is not.

---

### TC-28: Body size limit rejects oversized requests

| Field | Value |
|-------|-------|
| ID | TC-28 |
| Level | E2E-API |
| UC/BR | BR-15 |
| Priority | High |
| Status | Planned |

**Steps:**
1. POST /mcp with body > 1MB (1024*1024 + 1 bytes)
2. Verify connection rejected/destroyed
3. No valid JSON-RPC response returned

**Expected:** Oversized body rejected per MAX_BODY_SIZE.

---

## 6. E2E-API — Error Cases (TC-29 to TC-31)

### TC-29: File not found returns JSON-RPC error

| Field | Value |
|-------|-------|
| ID | TC-29 |
| Level | E2E-API |
| UC/BR | UC-01 (EF-01-1) |
| Priority | High |
| Status | Planned |

**Steps:**
1. POST /mcp: tools/call drawio_export_png { file_path: "/does/not/exist.drawio" }
2. Verify JSON-RPC error code -32603
3. Verify message contains "Failed to read file"

**Expected:** File errors propagated as JSON-RPC error.

---

### TC-30: Backend unreachable returns JSON-RPC error

| Field | Value |
|-------|-------|
| ID | TC-30 |
| Level | E2E-API |
| UC/BR | UC-01 (EF-01-3) |
| Priority | High |
| Status | Planned |

**Preconditions:** restCallTool throws network error.

**Steps:**
1. POST /mcp: tools/call for proxied tool
2. Verify JSON-RPC error code -32603
3. Verify error indicates backend unreachable

**Expected:** Backend errors propagated via JSON-RPC.

---

### TC-31: Invalid JSON body returns parse error

| Field | Value |
|-------|-------|
| ID | TC-31 |
| Level | E2E-API |
| UC/BR | FSD Section 7 |
| Priority | Medium |
| Status | Planned |

**Steps:**
1. POST /mcp with body "not-valid-json{{"
2. Verify JSON-RPC error code -32700
3. Verify message "Parse error"

**Expected:** Malformed requests handled gracefully.

---

## 7. Summary

| Level | Test Cases | Count |
|-------|-----------|-------|
| UT | TC-01..21 | 19 |
| IT | TC-22..26 | 5 |
| E2E-API | TC-22, TC-24, TC-28..31 | 5 |
| PBT | TC-27 | 1 |
| E2E-UI | — | 0 |
| SIT | — | 0 |
| **Total** | | **30** |

Note: TC-22, TC-24 count as both IT and E2E-API (same scenario, different execution mode).
Unique test case IDs: TC-01 through TC-31 (30 unique, TC-08/TC-09 added).
