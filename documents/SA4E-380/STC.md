# Software Test Cases (STC)

## SDLC Agents 4 Enterprise — SA4E-380: Content Proxy for Child MCP Tools (Export DOCX/XLSX/PPTX/PDF/HTML/JSON Through the Extension Wrapper, No New Tools)

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-380 |
| Title | Content Proxy for child MCP tools: export DOCX/XLSX/PPTX/PDF/HTML/JSON through the extension wrapper (no new tools added) |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-10-23 |
| Status | Draft — pending BA review gate (STP §13.4) |
| Document Type | Software Test Cases (STC) — Phase 4b |
| Project | SA4E — SDLC Agents 4 Enterprise |
| Related STP | STP.md — v1.0, 2026-10-23 (`documents/SA4E-380/STP.md`). Case IDs, levels and allocation follow STP §13.2 exactly |
| Related BRD | BRD.md — v1.0, 2026-10-23 (7 stories, AC-1..AC-7, evidence E-1..E-9) |
| Related FSD | FSD.md — use cases UC-01..UC-07, business rules BR-01..BR-22, error contract §9.1 (E-01..E-11) |
| Related TDD | TDD.md — module map §2, error contract §6, cleanup design §9 (OI-14/OI-15) |
| Test data | Fixtures TD-01..TD-13 (STP §10.1) + concrete values inline per case; CSV files declared in STP §10.2 are the machine-readable source of truth |

> **Document nature.** This is an **as-built** test-case document for a documentation-backfill ticket. The change is already implemented in the workspace (uncommitted). Three case statuses are used and nothing in this document re-runs a suite or modifies code:
> - **Existing — passing**: the behaviour is pinned by a test that already exists in the repository and passed in the implementation-phase runs quoted in BRD §8.3 (E-1..E-4). The STC case documents what that test proves.
> - **Planned**: the case is specified here to be authored during test execution (STP §5, "Automated verification" / "E2E-API execution" phases). No result is claimed.
> - **Pending implementation (OI-14/OI-15)**: the case verifies the two BRD additions (immediate local cleanup E-8, periodic cleanup sweep E-9) whose design is in TDD §9 but whose code is **not yet implemented**. These cases must not be executed until DEV delivers OI-14/OI-15.

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-23 | QA Agent | Initiate document — 88 STP-allocated cases (PBT 6, UT 43, IT 12, E2E-API 16, E2E-UI 0, SIT 11) + 7-case addendum for the cleanup requirements E-8/E-9 (OI-14/OI-15, pending implementation); RTM over 7/7 stories, 22 business rules, 16 NFRs, error contract E-01..E-11 |

---

## Test Case Summary

| Level | ID range | Count | Automated | Manual | Status breakdown |
|-------|----------|-------|-----------|--------|------------------|
| PBT | PBT-01..06 | 6 | 6 | 0 | 6 planned (fast-check, ≥100 runs each) |
| UT | UT-01..43 | 43 | 43 | 0 | 16 existing-backed (35 existing test functions across 5 files), 27 planned |
| UT — addendum | UT-44..48 | 5 | 5 | 0 | **Pending implementation (OI-14/OI-15)** |
| IT | IT-01..12 | 12 | 12 | 0 | 9 existing-backed, 3 planned (registry gap, STP §2.2.3 note) |
| E2E-API | E2E-API-01..16 | 16 | 16 | 0 | 16 planned (real backend + real child) |
| E2E-UI | — | 0 | 0 | 0 | **N/A — no browser surface** (STP §2.2.5; decision recorded in §5) |
| SIT | SIT-01..11 | 11 | 0 | 11 | 6 harness-assisted (`LIVE_BACKEND=1`), 5 manual/staged |
| SIT — addendum | SIT-12..13 | 2 | 0 | 2 | **Pending implementation (OI-14/OI-15)** |
| **Total** | | **95** | **82 (86%)** | **13 (14%)** | STP baseline 88 + 7 addendum cases |

> **Addendum note.** STP v1.0 (§13.2) fixed the allocation at **88 cases** before the BRD added the two cleanup obligations (BRD §1.2 #9, §6 "Capacity — local cleanup / periodic cleanup", evidence E-8/E-9). The TDD (§9) designs them as OI-14/OI-15. The STC therefore documents the 88 allocated cases **plus 7 addendum cases** (UT-44..48, SIT-12..13) that trace exclusively to the new requirements. The addendum keeps the STP numbering intact — no allocated ID is reused or renumbered.

> **Evidence rule (STP §2.3).** Quoted counts (21/21 content-proxy, 3,493 backend pass, 3,255/6 skipped extension, 6/6 live) are **evidence from prior runs, not re-executed by this document**. Existing cases carry their recorded result; planned cases claim nothing.

---

## 1. Property-Based Tests (PBT)

Environment: backend workspace, no server, no filesystem writes outside `os.tmpdir()/content-proxy-*`. Framework: `fast-check ^4.9.0` + vitest. Exit criteria (STP G1): 6/6 properties pass with ≥100 runs each; every shrunk counter-example is frozen as a UT regression case before the property is considered green.

### PBT-01: Base64 round trip — decoded content equals source text for arbitrary UTF-8

| Field | Value |
|-------|-------|
| **ID** | PBT-01 |
| **Priority** | High |
| **Level / Type** | PBT — correctness property (automated) |
| **Requirement** | STORY 1 (AC-1.2), STORY 7 (AC-7.2) · UC-01 step 6, UC-07 Flow B · BR-02, BR-03 · NFR-5 · E-09 context |
| **Preconditions** | `detectCapability(EXPORT_DOCX)` returns `{ contentParam: 'markdown', fileOutput: true }`; `adaptInvocation` importable as a pure function |
| **Test data** | fast-check Unicode string generator (covers TD-08: `# Kiểm thử\r\n\r\n😀 emoji — "quotes"\r\n` shapes); payload = `Buffer.from(text).toString('base64')` |
| **Automation** | `backend/src/modules/orchestration/content-proxy/__tests__/content-proxy.pbt.test.ts` — **planned** |
| **Status** | Planned |
| **Evidence** | To be captured at execution — vitest run log `evidence/PBT-01-roundtrip.txt` |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | For 100+ generated `text` values, call `adaptInvocation(cap, { content_base64: base64(text) })` | `invocation.error` undefined; `invocation.wrapperMode === true` |
| 2 | Read `invocation.args['markdown']` (the `x-content-param` target) | Value **===** the generated `text`, byte-for-byte after UTF-8 decode |
| 3 | Inspect `invocation.args` keys | `content_base64`, `output_path`, `file_path` absent (stripped) |

**Expected result:** property holds for all runs; no counter-example retained. **Postconditions:** none (pure function).

---

### PBT-02: Byte fidelity — inline → base64 → decode returns identical bytes

| Field | Value |
|-------|-------|
| **ID** | PBT-02 |
| **Priority** | High |
| **Level / Type** | PBT — correctness property (automated) |
| **Requirement** | STORY 1 (AC-1.2), STORY 4 (AC-4.1) · UC-01 step 9, UC-04 step 2 · BR-06, BR-09 · NFR-11 (determinism) |
| **Preconditions** | `adaptResult` callable with a constructed child result; temp dir available |
| **Test data** | fast-check `uint8array` generator (1 B..64 KB buffers); artifact descriptor `{ name: 'pbt.bin', path: <temp file with the generated bytes> }` |
| **Automation** | `backend/src/modules/orchestration/content-proxy/__tests__/content-proxy.pbt.test.ts` — **planned** |
| **Status** | Planned |
| **Evidence** | `evidence/PBT-02-byte-fidelity.txt` |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Write the generated buffer to a temp file; build a wrapper-mode invocation (`content_base64` present) | Invocation valid |
| 2 | `adaptResult` the child result declaring the artifact | Parsed `output_base64` defined |
| 3 | Decode `output_base64` and compare with the generated buffer | **Byte-identical** (same length, same bytes) — proving base64 inflates but never corrupts |

**Expected result:** property holds; same input always yields same bytes (retrieval order fixed, NFR-11).

---

### PBT-03: Size cap — inline resolver accepts only 0 < length ≤ 26,214,400 bytes

| Field | Value |
|-------|-------|
| **ID** | PBT-03 |
| **Priority** | High |
| **Level / Type** | PBT — correctness property (automated) |
| **Requirement** | STORY 3 (AC-3.6) · UC-03 AF-1/EF-3/EF-4 · BR-06 · NFR-1 · TD-05, TD-13 |
| **Preconditions** | `artifact-source.fromBase64` (or the inline branch of `resolveArtifact`) importable; no 25 MB fixture is ever materialised (STP TR-2) |
| **Test data** | Declared sizes generated as **metadata**: `size` values around the boundary `26214400` (accept) and `26214401` (reject); buffers synthesised via mocked streams for sub-cap sizes |
| **Automation** | `backend/src/modules/orchestration/content-proxy/__tests__/content-proxy.pbt.test.ts` — **planned** |
| **Status** | Planned |
| **Evidence** | `evidence/PBT-03-size-cap.txt` |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | For generated sizes in (0, 26,214,400], resolve an inline payload of that declared size | Non-empty buffer returned; length === declared size |
| 2 | For `size = 0` (empty/whitespace base64) | Resolves to "no artifact" (`null`) — never a 0-byte payload (BR-06) |
| 3 | For `size = 26,214,401` and above (declared `content-length` / descriptor size) | Source treated as unusable → `ARTIFACT_FETCH_FAILED` path; **nothing buffered to disk** |

**Expected result:** the cap is inclusive at 25 MB and exact — no truncated buffer is ever returned (RK-03).

---

### PBT-04: Name safety — `safeName` never emits a path fragment

| Field | Value |
|-------|-------|
| **ID** | PBT-04 |
| **Priority** | High |
| **Level / Type** | PBT — correctness property (automated) |
| **Requirement** | STORY 1 (AC-1.6), STORY 2 (AC-2.3) · UC-01 step 9 · BR-08, BR-10 · NFR-7 · naming-testdata.csv |
| **Preconditions** | `artifact-name.safeName` importable |
| **Test data** | fast-check strings mixed with hostile seeds: `/srv/secret/UG.docx`, `C:\\x\\y.docx`, `../etc/passwd`, `a?token=1`, `b#frag`, `.`, `..`, `''` |
| **Automation** | `backend/src/modules/orchestration/content-proxy/__tests__/content-proxy.pbt.test.ts` — **planned** |
| **Status** | Planned |
| **Evidence** | `evidence/PBT-04-name-safety.txt` |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | For 100+ generated/seeded inputs, call `safeName(value)` | Result (when non-null) contains **no** `/` and **no** `\` |
| 2 | Assert the never-set | Result is never `.`, never `..`, never empty string |
| 3 | Call `safeName(safeName(x))` | Idempotent — second call returns the same value |

**Expected result:** property holds; a path fragment never leaves the component (RK-02).

---

### PBT-05: Schema invariant — adaptation keeps the schema callable and self-describing

| Field | Value |
|-------|-------|
| **ID** | PBT-05 |
| **Priority** | High |
| **Level / Type** | PBT — correctness property (automated) |
| **Requirement** | STORY 5 (AC-5.3, AC-5.4), STORY 2 (AC-2.1) · UC-05 main flow · BR-11, BR-20 · NFR-13 |
| **Preconditions** | `adaptToolDefinition` importable; tool definitions generated with a content alias and arbitrary `required` orders |
| **Test data** | Generated schemas (properties including `markdown`/`content`/`text` aliases, 0..3 other required entries) |
| **Automation** | `backend/src/modules/orchestration/content-proxy/__tests__/content-proxy.pbt.test.ts` — **planned** |
| **Status** | Planned |
| **Evidence** | `evidence/PBT-05-schema-invariant.txt` |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Adapt 100+ generated definitions; locate the resolved content argument | Content argument **never** appears in `required` after adaptation |
| 2 | Read `x-content-param` | Always names a property that exists in `properties` |
| 3 | Count occurrences of `output_base64` in `description` | Appears **at most once** (marker sentence idempotent) |
| 4 | Verify tool `name` | Unchanged — adaptation never renames (BR-20) |

**Expected result:** property holds for all generated schemas.

---

### PBT-06: Detection monotonicity — every convention-matching name is a file producer unless exempted

| Field | Value |
|-------|-------|
| **ID** | PBT-06 |
| **Priority** | Medium |
| **Level / Type** | PBT — correctness property (automated) |
| **Requirement** | STORY 6 (AC-6.1, AC-6.7) · UC-05 main flow · BR-04, BR-05 |
| **Preconditions** | `detectCapability` importable; `CONTENT_PROXY_OVERRIDES` reachable for the exemption branches |
| **Test data** | Generated names with `export_`/`render_`/`generate_` prefixes + random suffixes; paired variants declaring `content_base64` (TD-09) or disabled via override |
| **Automation** | `backend/src/modules/orchestration/content-proxy/__tests__/content-proxy.pbt.test.ts` — **planned** |
| **Status** | Planned |
| **Evidence** | `evidence/PBT-06-detection-monotonic.txt` |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | For each generated prefixed name (plain tool) | `detectCapability` returns non-null with `fileOutput: true` |
| 2 | Same name but schema already declares `content_base64` | Returns `null` (BR-05 beats BR-04) |
| 3 | Same name with override `{ enabled: false }` | Returns `null` (BR-04 first clause) |

**Expected result:** property holds — the prefix gate is monotonic and its two exemptions are exact.

---

## 2. Unit Tests (UT)

Environment: backend `backend/src/modules/orchestration/content-proxy/__tests__/` and `backend/src/config/` + extension `extension/src/__tests__/`. Filesystem effects confined to `os.tmpdir()/content-proxy-*`. Exit criteria (STP G2): all UT cases pass; every error code asserted by exact prefix.

### 2.1 Capability detection and overrides (`detect.ts`)

### UT-01: `export_docx` detected as content-in / artifacts-out

| Field | Value |
|-------|-------|
| **ID** | UT-01 |
| **Priority** | High |
| **Level / Type** | UT — functional (automated) |
| **Requirement** | STORY 6 (AC-6.1) · UC-05 step 3 · BR-03, BR-04 |
| **Preconditions** | `EXPORT_DOCX` fixture (name `export_docx`, schema with required `markdown`) |
| **Test data** | TD-01-based fixture — `inputSchema.required: ['markdown']` |
| **Automation** | `content-proxy.test.ts` › "detects export_docx as a content-in / artifacts-out tool" — **existing** |
| **Status** | Existing — passing (E-1, 21/21) |
| **Evidence** | BRD §8.3 E-1 |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `detectCapability(EXPORT_DOCX)` | Non-null capability |
| 2 | Inspect fields | `contentParam === 'markdown'`, `fileOutput === true` |

---

### UT-02: Non-file tools with content-like arguments are rejected

| Field | Value |
|-------|-------|
| **ID** | UT-02 |
| **Priority** | High |
| **Level / Type** | UT — negative detection (automated) |
| **Requirement** | STORY 6 (AC-6.2) · UC-05 · BR-04 · TD-10 · RK-09 |
| **Preconditions** | Fixtures for `confluence_create_page` (body), `jira_create_issue` (description), `mem_ingest` (content) |
| **Test data** | TD-10 — three real tool shapes, none matching prefix or "to <format>" description |
| **Automation** | `content-proxy.test.ts` › "ignores ordinary tools..." — **existing** (confluence variant) |
| **Status** | Existing — passing (E-1); jira/mem_ingest variants **planned** to be added to the same test |
| **Evidence** | BRD §8.3 E-1 |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `detectCapability` each TD-10 tool | `null` for all three — their `content`/`body` payloads belong to external systems, not documents |

---

### UT-03: Wrapper-native tool (`drawio_export_png`) never double-adapted

| Field | Value |
|-------|-------|
| **ID** | UT-03 |
| **Priority** | High |
| **Level / Type** | UT — negative detection (automated) |
| **Requirement** | STORY 5 (AC-5.6 validation), STORY 6 (AC-6.3) · UC-05 AF-1 · BR-05 · TD-09 · RK-10 |
| **Preconditions** | Fixture declaring its own `content_base64` (required) |
| **Test data** | TD-09 — `drawio_export_png`, description already mentioning `output_base64` |
| **Automation** | `content-proxy.test.ts` › "leaves wrapper-native tools untouched" — **existing** |
| **Status** | Existing — passing (E-1) |
| **Evidence** | BRD §8.3 E-1 |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `detectCapability(drawio_export_png)` | `null` — no `x-content-param`, no property injection, no second content mapping |

---

### UT-04: Text converters without file artifacts are rejected

| Field | Value |
|-------|-------|
| **ID** | UT-04 |
| **Priority** | Medium |
| **Level / Type** | UT — negative detection (automated) |
| **Requirement** | STORY 6 (AC-6.2) · UC-05 · BR-04 |
| **Preconditions** | Fixture `convert_to_markdown` (description has no "to <format>" phrase; returns text, not a file) |
| **Test data** | `{ name: 'convert_to_markdown', inputSchema: { required: ['uri'] } }` |
| **Automation** | `content-proxy.test.ts` › "ignores text converters" — **existing** |
| **Status** | Existing — passing (E-1) |
| **Evidence** | BRD §8.3 E-1 |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `detectCapability(convert_to_markdown)` | `null` — no file artifact implied |

---

### UT-05: Override `enabled: false` disables adaptation entirely

| Field | Value |
|-------|-------|
| **ID** | UT-05 |
| **Priority** | Medium |
| **Level / Type** | UT — override behaviour (automated) |
| **Requirement** | STORY 6 (AC-6.4) · UC-05 AF-3 · BR-04 |
| **Preconditions** | `CONTENT_PROXY_OVERRIDES` seeded with `{ export_docx: { enabled: false } }` (test-local, restored after) |
| **Test data** | TD-01 fixture + override row |
| **Automation** | `content-proxy.test.ts` (new describe "overrides") — **planned** |
| **Status** | Planned |
| **Evidence** | To be captured — `evidence/UT-05-override-disabled.txt` |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `detectCapability(export_docx)` with the override | `null` — tool behaves exactly as if the proxy did not exist |
| 2 | Remove override, re-detect | Capability returns (control) |

---

### UT-06: Override `contentParam` forces the content argument; `null` means none

| Field | Value |
|-------|-------|
| **ID** | UT-06 |
| **Priority** | Medium |
| **Level / Type** | UT — override behaviour (automated) |
| **Requirement** | STORY 6 (AC-6.4) · UC-05 AF-4 · BR-03 step 1 |
| **Preconditions** | Overrides `{ export_docx: { contentParam: 'payload_md' } }` and `{ export_docx: { contentParam: null } }` seeded in turn |
| **Test data** | Tool schema with property `payload_md` (string) alongside `markdown` |
| **Automation** | `content-proxy.test.ts` — **planned** |
| **Status** | Planned |
| **Evidence** | `evidence/UT-06-override-contentparam.txt` |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Detect with `contentParam: 'payload_md'` | `capability.contentParam === 'payload_md'` — override wins over alias priority |
| 2 | Detect with `contentParam: null` | Capability returned with no content param → output-only adaptation (no `content_base64` injected, BR-11) |

---

### UT-07: Override `fileOutput: true` enables inlining for a non-convention tool

| Field | Value |
|-------|-------|
| **ID** | UT-07 |
| **Priority** | Medium |
| **Level / Type** | UT — override behaviour (automated) |
| **Requirement** | STORY 6 (AC-6.4) · UC-05 AF-5 · BR-04 |
| **Preconditions** | Override `{ make_bundle: { fileOutput: true } }` on a tool matching no prefix/description convention |
| **Test data** | `{ name: 'make_bundle', description: 'Builds a bundle', properties: { spec: 'string' } }` |
| **Automation** | `content-proxy.test.ts` — **planned** |
| **Status** | Planned |
| **Evidence** | `evidence/UT-07-override-fileoutput.txt` |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `detectCapability(make_bundle)` | Non-null with `fileOutput: true` — `x-output-base64` set downstream (UT-12) |

---

### UT-08: Content-argument alias priority is deterministic

| Field | Value |
|-------|-------|
| **ID** | UT-08 |
| **Priority** | Medium |
| **Level / Type** | UT — detection detail (automated) |
| **Requirement** | STORY 6 (AC-6.5) · UC-05 · BR-03 step 2 |
| **Preconditions** | `detectContentParam` importable |
| **Test data** | Schemas containing 2+ aliases: `{ content, markdown }` → `markdown`; `{ text, html }` → `html`; `{ body, source, template }` → `body` (priority: markdown, markdown_content, content, html, xml, text, body, source, template) |
| **Automation** | `content-proxy.test.ts` — **planned** |
| **Status** | Planned |
| **Evidence** | `evidence/UT-08-alias-priority.txt` |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `detectContentParam` on each alias-combination schema | First alias in the documented priority order wins every time |

---

### UT-09: Single-required-string fallback and `NON_CONTENT_PARAM` exclusions

| Field | Value |
|-------|-------|
| **ID** | UT-09 |
| **Priority** | Medium |
| **Level / Type** | UT — detection detail (automated) |
| **Requirement** | STORY 6 (AC-6.5) · UC-05 · BR-03 step 3 · NFR-10 |
| **Preconditions** | Schemas with no alias but one required string property |
| **Test data** | `{ properties: { payload: 'string' }, required: ['payload'] }` → `payload`; `{ properties: { token: 'string' }, required: ['token'] }` → undefined; `{ properties: { url }, required: ['url'] }` → undefined |
| **Automation** | `content-proxy.test.ts` — **planned** |
| **Status** | Planned |
| **Evidence** | `evidence/UT-09-fallback-exclusions.txt` |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Fallback case | Single non-excluded required string is chosen |
| 2 | Exclusion cases (`token`, `secret`, `password`, `*_id`, `url`, `uri`, `*_path`, `*_type`, `type`, `format`, `mode`, `encoding`) | Never chosen as content — credential-like arguments can never become document content (NFR-10) |

---

### UT-10: Ambiguous candidates are never guessed; non-string properties excluded

| Field | Value |
|-------|-------|
| **ID** | UT-10 |
| **Priority** | High |
| **Level / Type** | UT — detection detail (automated) |
| **Requirement** | STORY 6 (AC-6.5 validation) · UC-05 · BR-03 step 4 · NFR-10 (credential hygiene, S-6) |
| **Preconditions** | Schemas with 2+ non-excluded string candidates, and with number/boolean/array properties only |
| **Test data** | `{ a: 'string', b: 'string', both required }` → undefined; `{ count: 'number' }` → undefined |
| **Automation** | `content-proxy.test.ts` — **planned** |
| **Status** | Planned |
| **Evidence** | `evidence/UT-10-ambiguity.txt` |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Ambiguous schema | Content param **undefined** — never guessed (BR-03) |
| 2 | Non-string-like property (number, boolean, object, array without string variant) | Never chosen |

---

### UT-11: `anyOf`/`oneOf` string unions (pydantic-style) are recognised

| Field | Value |
|-------|-------|
| **ID** | UT-11 |
| **Priority** | Medium |
| **Level / Type** | UT — detection detail (automated) |
| **Requirement** | STORY 6 (AC-6.5) · UC-05 AF-7 · BR-03 · `isStringLike` tolerance |
| **Preconditions** | Schema whose content property is `{ anyOf: [{type:'string'},{type:'null'}] }` |
| **Test data** | TD-01 real-world shape — `export_pdf` publishes `file_name`/`options` as `anyOf[string,null]`; content property in the same style |
| **Automation** | `content-proxy.test.ts` — **planned** |
| **Status** | Planned |
| **Evidence** | `evidence/UT-11-anyof-union.txt` |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `detectContentParam` on the union schema | Content argument still found — the union is treated as string-like |

---

### 2.2 Schema adaptation (`schema-adapter.ts`)

### UT-12: Adapted schema carries the full marker set

| Field | Value |
|-------|-------|
| **ID** | UT-12 |
| **Priority** | High |
| **Level / Type** | UT — functional (automated) |
| **Requirement** | STORY 5 (AC-5.3, AC-5.4) · UC-05 step 4 · BR-11 |
| **Preconditions** | Capability from UT-01 |
| **Test data** | TD-01 fixture |
| **Automation** | `content-proxy.test.ts` › "adds content_base64/x-content-param..." — **existing** |
| **Status** | Existing — passing (E-1) |
| **Evidence** | BRD §8.3 E-1 |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `adaptToolDefinition(EXPORT_DOCX, cap)` | `properties.content_base64` defined; `x-content-param === 'markdown'`; `x-output-base64 === true` |
| 2 | Read `required` | `markdown` removed; other entries keep order |
| 3 | Read `description` | Contains `output_base64` |

---

### UT-13: `x-content-param` names an existing property; injection description warns the LLM

| Field | Value |
|-------|-------|
| **ID** | UT-13 |
| **Priority** | Medium |
| **Level / Type** | UT — schema detail (automated) |
| **Requirement** | STORY 5 (AC-5.3) · UC-05 · BR-11 |
| **Preconditions** | Adapted definition from UT-12 |
| **Test data** | TD-01 |
| **Automation** | `content-proxy.test.ts` — **planned** (refinement of the existing combined assertion) |
| **Status** | Planned |
| **Evidence** | `evidence/UT-13-content-param-target.txt` |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `schema['x-content-param']` | Value exists as a key of `schema.properties` |
| 2 | `schema.properties.content_base64.description` | Contains "Never send this from an LLM" (wrapper-owned argument) |

---

### UT-14: `required` rewritten by value — remaining entries keep order

| Field | Value |
|-------|-------|
| **ID** | UT-14 |
| **Priority** | Medium |
| **Level / Type** | UT — schema detail (automated) |
| **Requirement** | STORY 5 (AC-5.3) · UC-05 · BR-11 |
| **Preconditions** | Fixture with `required: ['markdown', 'file_name', 'options']` |
| **Test data** | TD-01 variant |
| **Automation** | `content-proxy.test.ts` — **planned** |
| **Status** | Planned |
| **Evidence** | `evidence/UT-14-required-order.txt` |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Adapt and read `required` | `['file_name', 'options']` — content arg removed **by value**, order and content of the rest preserved |

---

### UT-15: Marker sentence appended exactly once (idempotent across listings)

| Field | Value |
|-------|-------|
| **ID** | UT-15 |
| **Priority** | Medium |
| **Level / Type** | UT — schema detail (automated) |
| **Requirement** | STORY 5 (AC-5.4) · UC-05 AF-6 · BR-11 (`withOutputMarker`) |
| **Preconditions** | Two definitions: one with a plain description, one already mentioning `output_base64` |
| **Test data** | TD-09-style description for the second variant |
| **Automation** | `content-proxy.test.ts` — **planned** |
| **Status** | Planned |
| **Evidence** | `evidence/UT-15-marker-idempotent.txt` |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Adapt the plain definition twice (simulating repeated `tools/list`) | `output_base64` appears exactly once — no accumulation |
| 2 | Adapt the pre-annotated definition | Sentence **not** appended a second time |

---

### UT-16: Schema without `properties`/`required` is tolerated

| Field | Value |
|-------|-------|
| **ID** | UT-16 |
| **Priority** | Low |
| **Level / Type** | UT — robustness (automated) |
| **Requirement** | STORY 5 (error handling) · UC-05 EF-1 · BR-11 |
| **Preconditions** | Definition with `inputSchema: {}` or missing `inputSchema` |
| **Test data** | Minimal tool `{ name: 'export_min', description: 'Export to PDF.' }` |
| **Automation** | `content-proxy.test.ts` — **planned** |
| **Status** | Planned |
| **Evidence** | `evidence/UT-16-minimal-schema.txt` |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Detect + adapt the minimal tool | Treated as empty; a minimal valid schema is produced; the catalogue listing does **not** crash |

---

### 2.3 Invocation adaptation (`invocation-adapter.ts`)

### UT-17: `content_base64` maps onto the child content argument; wrapper-only keys stripped

| Field | Value |
|-------|-------|
| **ID** | UT-17 |
| **Priority** | High |
| **Level / Type** | UT — functional (automated) |
| **Requirement** | STORY 1 (AC-1.2), STORY 2 (AC-2.1) · UC-01 steps 4-6, AF-5 · BR-01, BR-02, BR-03 |
| **Preconditions** | Capability for `export_docx` |
| **Test data** | `{ file_path: '/repo/documents/UG.md', output_path: '/repo/documents/UG.docx', content_base64: base64('# Hello'), file_name: 'UG' }` |
| **Automation** | `content-proxy.test.ts` › "maps content_base64 to the child content arg..." — **existing** |
| **Status** | Existing — passing (E-1) |
| **Evidence** | BRD §8.3 E-1 |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `adaptInvocation(cap, args)` | `error` undefined; `wrapperMode === true` |
| 2 | Read `invocation.args` | Exactly `{ markdown: '# Hello', file_name: 'UG' }` — `content_base64`, `output_path`, `file_path` stripped; declared child args (`file_name`) pass through (UC-01 AF-5) |

---

### UT-18: Empty `content_base64` still enters wrapper mode; non-string payload treated as absent

| Field | Value |
|-------|-------|
| **ID** | UT-18 |
| **Priority** | Medium |
| **Level / Type** | UT — edge case (automated) |
| **Requirement** | STORY 2 (AC-2.1 validation) · UC-07 AF-4 · BR-01 |
| **Preconditions** | Capability for `export_docx` |
| **Test data** | `{ content_base64: '' , output_path: '/x.docx' }` and `{ content_base64: 42, output_path: '/x.docx' }` |
| **Automation** | `content-proxy.test.ts` — **planned** |
| **Status** | Planned |
| **Evidence** | `evidence/UT-18-empty-payload.txt` |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Empty-string payload | `wrapperMode === true` (ownership check, not truthiness — BR-01) → missing-content error (UC-07 main flow A) |
| 2 | Non-string payload (number/object) | Treated as "no payload" → content-argument branch decides (UC-07 AF-4) |

---

### UT-19: Invalid base64 rejected before the child is invoked

| Field | Value |
|-------|-------|
| **ID** | UT-19 |
| **Priority** | High |
| **Level / Type** | UT — error path (automated) |
| **Requirement** | STORY 7 (AC-7.2) · UC-01 EF-3, UC-07 Flow B · BR-01 · E-09 · NFR-5, NFR-12 · RK-04 |
| **Preconditions** | Capability for `export_docx` |
| **Test data** | TD-04 `'!!!not-base64!!!"`; `'abc'` (length % 4 ≠ 0); `'YWJj!'` (bad alphabet) |
| **Automation** | `content-proxy.test.ts` › "rejects invalid base64..." — **existing** |
| **Status** | Existing — passing (E-1) |
| **Evidence** | BRD §8.3 E-1 |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `adaptInvocation(cap, { content_base64: TD-04 })` | `error` matches `/Invalid content_base64/` — literal message prefix `Invalid content_base64 payload.` (E-09) |
| 2 | Inspect side effects | Child args never built; child **not** invoked; no file written |

---

### UT-20: Direct (non-wrapper) calls are untouched

| Field | Value |
|-------|-------|
| **ID** | UT-20 |
| **Priority** | High |
| **Level / Type** | UT — compatibility (automated) |
| **Requirement** | STORY 2 (AC-2.6), STORY 5 (AC-5.6) · UC-06 main flow · BR-12 · NFR-4, NFR-14 · RK-11 |
| **Preconditions** | Capability for `export_docx` |
| **Test data** | `{ markdown: '# Direct' }` — no wrapper-owned key |
| **Automation** | `content-proxy.test.ts` › "leaves direct (non-wrapper) calls untouched" — **existing** |
| **Status** | Existing — passing (E-1) |
| **Evidence** | BRD §8.3 E-1 |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `adaptInvocation(cap, { markdown: '# Direct' })` | `wrapperMode === false`; `args` identical to input (nothing stripped or decoded) |

---

### UT-21: Wrapper mode without content returns the missing-content error

| Field | Value |
|-------|-------|
| **ID** | UT-21 |
| **Priority** | High |
| **Level / Type** | UT — error path (automated) |
| **Requirement** | STORY 7 (AC-7.1) · UC-01 EF-4, UC-07 Flow A · BR-01, BR-03 · E-08 |
| **Preconditions** | Capability for `export_docx`; no `content_base64` and no direct `markdown` supplied |
| **Test data** | `{ file_path: '/repo/UG.md', output_path: '/repo/UG.docx' }` |
| **Automation** | `content-proxy.test.ts` › "returns a clear error when wrapper mode carries no content" — **existing** |
| **Status** | Existing — passing (E-1) |
| **Evidence** | BRD §8.3 E-1 |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `adaptInvocation(cap, args)` | `error` matches `/Missing content/` — literal: `Missing content: pass file_path so the extension wrapper can inject content_base64 (or send markdown directly).` |
| 2 | Observe child invocation | **Not** invoked with an empty document (STORY 7 AC-7.1) |

---

### 2.4 Artifact naming (`artifact-name.ts`)

### UT-22: Only the basename survives; query/fragment stripped

| Field | Value |
|-------|-------|
| **ID** | UT-22 |
| **Priority** | High |
| **Level / Type** | UT — security-relevant naming (automated) |
| **Requirement** | STORY 1 (AC-1.6), STORY 2 (AC-2.3) · UC-01 step 9 · BR-08, BR-10 · NFR-7 · RK-02 |
| **Preconditions** | `safeName` importable |
| **Test data** | `'/srv/exports/UG.docx'` → `UG.docx`; `'https://f.example/r/report.pdf?token=1'` → `report.pdf`; `'C:\\tmp\\a.docx#frag'` → `a.docx`; `'  pad.docx  '` → `pad.docx` |
| **Automation** | `content-proxy.test.ts` — **planned** |
| **Status** | Planned |
| **Evidence** | `evidence/UT-22-basename.txt` |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `safeName` each input | Bare name only — value cut at first `?` or `#`, then basename'd; trimmed |
| 2 | Inspect result for path separators | None present — a path fragment never leaves the component (NFR-7) |

---

### UT-23: Empty, dot and dot-dot names are absent; MIME fallback map applies

| Field | Value |
|-------|-------|
| **ID** | UT-23 |
| **Priority** | Medium |
| **Level / Type** | UT — naming fallback (automated) |
| **Requirement** | STORY 4 (validation) · UC-04 step 4 · BR-08 |
| **Preconditions** | `safeName` + `nameFromMime` importable |
| **Test data** | `''`, `'.'`, `'..'`, `null`, `undefined` → null; MIME map: `application/pdf` → `artifact.pdf`; OOXML types → `artifact.docx/xlsx/pptx`; `text/html` → `artifact.html`; `application/json` → `artifact.json`; `application/zip` → `artifact.zip`; `text/plain` → `artifact.txt`; `text/markdown` → `artifact.md` |
| **Automation** | `content-proxy.test.ts` — **planned** |
| **Status** | Planned |
| **Evidence** | `evidence/UT-23-mime-fallback.txt` |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Absent-name inputs | `null` — treated as "no suggested name" (multi-mode entries then skip, BR-15) |
| 2 | Each MIME value | Documented fallback name from the 12-entry map |

---

### UT-24: Unknown MIME falls back to `artifact.bin`

| Field | Value |
|-------|-------|
| **ID** | UT-24 |
| **Priority** | Low |
| **Level / Type** | UT — naming fallback (automated) |
| **Requirement** | STORY 1 (validation) · UC-01 · BR-08 |
| **Preconditions** | `nameFromLocation` importable |
| **Test data** | MIME `'application/x-unknown'` + location `'https://f.example/r/file.xyz'` |
| **Automation** | `content-proxy.test.ts` — **planned** |
| **Status** | Planned |
| **Evidence** | `evidence/UT-24-default-name.txt` |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Resolve name from location + unknown MIME | `file.xyz` (location basename wins); with no location → `artifact.bin` default |

---

### 2.5 Artifact source resolution (`artifact-source.ts`)

### UT-25: Inline payload in the descriptor wins over any location

| Field | Value |
|-------|-------|
| **ID** | UT-25 |
| **Priority** | High |
| **Level / Type** | UT — retrieval order (automated) |
| **Requirement** | STORY 3 (AC-3.1) · UC-03 AF-1 · BR-07 step 1 · NFR-11 (determinism) |
| **Preconditions** | `resolveArtifact` importable with injectable deps |
| **Test data** | Descriptor `{ output_base64: base64('INLINE'), url: 'https://f.example/a.pdf', path: '/srv/a.pdf', name: 'a.pdf' }` with `fetchUrl`/`readResource` spies |
| **Automation** | `content-proxy.test.ts` — **planned** |
| **Status** | Planned |
| **Evidence** | `evidence/UT-25-inline-precedence.txt` |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `resolveArtifact(descriptor, deps)` | Bytes === `'INLINE'` |
| 2 | Check spies | `fetchUrl` and `readResource` **never called** — no network, no filesystem access for an inline payload |
| 3 | Repeat with `content_base64`, `base64`, `data` keys | Each accepted as inline payload (alias set per BR-07) |

---

### UT-26: MCP resource blocks resolve to bytes (blob, text, resource_link)

| Field | Value |
|-------|-------|
| **ID** | UT-26 |
| **Priority** | High |
| **Level / Type** | UT — retrieval (automated) |
| **Requirement** | STORY 3 (AC-3.1) · UC-03 AF-2, AF-3, AF-4 · BR-07 step 2/3 · BR-21 |
| **Preconditions** | `adaptResult` with injectable `readResource` |
| **Test data** | (a) content block `{ type:'resource', resource:{ blob: base64('REMOTE-DOCX'), uri:'file:///remote/UG.docx', mimeType: docx-mime } }`; (b) descriptor `{ uri: 'artifact://job-7/UG.docx' }` + `readResource` returning the buffer |
| **Automation** | `content-proxy.remote.test.ts` › "reads remote artifacts through MCP resources…" and "inlines MCP resource blobs…" — **existing** (2 tests) |
| **Status** | Existing — passing (E-1) |
| **Evidence** | BRD §8.3 E-1 |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Resolve the `resource.blob` block | `output_base64` === base64('INLINE-DOCX'); `file_name === 'UG.docx'` |
| 2 | Resolve the `uri` descriptor via `resources/read` | `output_base64` === base64('REMOTE-DOCX') — the mechanism that crosses hosts (BR-21) |

---

### UT-27: `file:` URI platform conversion and unknown-scheme delegation

| Field | Value |
|-------|-------|
| **ID** | UT-27 |
| **Priority** | Medium |
| **Level / Type** | UT — portability (automated) |
| **Requirement** | STORY 3 (AC-3.5) · UC-03 AF-7, AF-8 · BR-22 · NFR-16 · RK-12 |
| **Preconditions** | `readLocation`/`toFileUri` importable |
| **Test data** | `C:\\exports\\r.pdf` → `file:///C:/exports/r.pdf`; UNC `\\\\srv\\share\\f.docx`; POSIX `/x/y.md` (not mangled on a Windows host); `artifact://x/y` → delegated to `readResource`, never interpreted locally |
| **Automation** | `content-proxy.test.ts` — **planned** |
| **Status** | Planned |
| **Evidence** | `evidence/UT-27-file-uri-platforms.txt` |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Convert each platform path | Correct `file:` URI per platform (drive letter, UNC, POSIX) |
| 2 | Read `artifact://x/y` | `readResource` invoked with the URI (server-owned scheme, BR-22); no local path guessed |

---

### UT-28: HTTP retrieval — success, non-2xx, timeout and declared-oversize rejection

| Field | Value |
|-------|-------|
| **ID** | UT-28 |
| **Priority** | High |
| **Level / Type** | UT — retrieval guard (automated) |
| **Requirement** | STORY 3 (AC-3.2, AC-3.6) · UC-03 AF-5, EF-3 · BR-06 · NFR-2 · TD-05 · RK-03 |
| **Preconditions** | `adaptResult` with injectable `fetchUrl`; no real network |
| **Test data** | (a) `{ url: 'https://files.example/UG.docx' }` + fetch → buffer (existing); (b) fetch → 404; (c) fetch aborts at 30 s; (d) response declaring `content-length: 26214401` (TD-05) — rejected **before** download |
| **Automation** | `content-proxy.remote.test.ts` › "reads artifacts exposed as http(s) URLs" — **existing** (success path); failure variants — **planned** |
| **Status** | Partially existing (E-1) — failure variants planned |
| **Evidence** | BRD §8.3 E-1 |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | 2xx response | Bytes fetched and inlined as `output_base64` |
| 2 | Non-2xx / timeout | Source treated as "not readable" (`null`) — never a protocol error; next source attempted |
| 3 | Declared oversize | Rejected before any buffering — no partial buffer kept (BR-06, NFR-2) |

---

### UT-29: Local read guards — regular file only, no symlink, size checked before read

| Field | Value |
|-------|-------|
| **ID** | UT-29 |
| **Priority** | High |
| **Level / Type** | UT — security guard (automated) |
| **Requirement** | STORY 3 (AC-3.5, AC-3.6) · UC-03 AF-7/AF-8, EF-4 · BR-06 · NFR-3, NFR-8 · S-5 |
| **Preconditions** | Temp dir with: a regular file (≤ cap), a symlink (target inside the workspace), a directory, and a file declared above the cap |
| **Test data** | TD-12 symlink fixture; regular file with known bytes; directory path; oversize declared size 26214401 |
| **Automation** | `content-proxy.test.ts` — **planned** |
| **Status** | Planned |
| **Evidence** | `evidence/UT-29-local-guards.txt` |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Read the regular file | Bytes returned (happy path) |
| 2 | Read the symlink | **Refused** (`lstat` + `isSymbolicLink`) even though the target resolves inside the workspace — no host-layout information leaked |
| 3 | Read the directory | Refused silently at source layer → surfaces as `ARTIFACT_FETCH_FAILED` with the bare name |
| 4 | Stat the oversize file | Size checked **before** read (`lstat` then conditional `readFileSync`) — a multi-hundred-MB file never enters memory (NFR-3) |

---

### UT-30: `data:` URI decoding and the exact 25 MB boundary

| Field | Value |
|-------|-------|
| **ID** | UT-30 |
| **Priority** | High |
| **Level / Type** | UT — retrieval + boundary (automated) |
| **Requirement** | STORY 3 (AC-3.3, AC-3.6) · UC-03 AF-6 · BR-06 · NFR-1 · TD-13 |
| **Preconditions** | `decodeDataUri` / inline resolver importable |
| **Test data** | `data:application/pdf;base64,` + base64 bytes → decoded; `data:text/plain,` + percent-encoded UTF-8 → decoded; boundary buffers of exactly `26214400` (accepted) and `26214401` (rejected), both synthetic |
| **Automation** | `content-proxy.test.ts` — **planned** |
| **Status** | Planned |
| **Evidence** | `evidence/UT-30-data-uri-boundary.txt` |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `base64` marker URI | Base64-decoded inline |
| 2 | No marker | Percent-decoded to UTF-8 |
| 3 | Boundary sizes | At-cap accepted; one byte over rejected — cap is inclusive and exact (TD-13, NFR-1) |

---

### 2.6 Result adaptation (`result-adapter.ts`)

### UT-31: Single artifact inlined as `output_base64` with host paths stripped

| Field | Value |
|-------|-------|
| **ID** | UT-31 |
| **Priority** | High |
| **Level / Type** | UT — functional (automated) |
| **Requirement** | STORY 1 (AC-1.6), STORY 2 (AC-2.3) · UC-01 step 9 · BR-08, BR-09, BR-10 |
| **Preconditions** | Wrapper-mode invocation; temp file with known bytes |
| **Test data** | Temp `out.docx` = `DOCX-BYTES` (10 B); child result `artifacts: [{ path: <temp>, name: 'out.docx', mime_type: 'application/docx', size: 10 }]` |
| **Automation** | `content-proxy.test.ts` › "inlines artifacts as output_base64 and strips host paths" — **existing** |
| **Status** | Existing — passing (E-1) |
| **Evidence** | BRD §8.3 E-1 |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `adaptResult(wrapperInvocation(), result)` | `parsed.output_base64` === base64('DOCX-BYTES'); `file_name === 'out.docx'` |
| 2 | Inspect `parsed.artifacts[0]` | `path` **undefined** — only `name`, `mime_type`, `size` survive (BR-10) |

---

### UT-32: Multi-artifact result shaped as `outputs[]`; single-payload fields removed

| Field | Value |
|-------|-------|
| **ID** | UT-32 |
| **Priority** | High |
| **Level / Type** | UT — functional (automated) |
| **Requirement** | STORY 4 (AC-4.1, AC-4.6) · UC-04 step 2 · BR-09 |
| **Preconditions** | Wrapper-mode invocation; two temp files |
| **Test data** | `a.json` = '{"a":1}', `b.json` = '{"b":2}'; artifacts declaring both |
| **Automation** | `content-proxy.test.ts` › "returns every artifact for multi-file tools" — **existing** |
| **Status** | Existing — passing (E-1) |
| **Evidence** | BRD §8.3 E-1 |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `adaptResult` the 2-artifact result | `outputs` has length 2 with `file_name`s `['a.json','b.json']` in array order |
| 2 | Inspect top level | `output_base64` **undefined** (deleted — no competing source of truth, BR-09) |
| 3 | Control: 1-artifact result | Top-level shape, **never** a one-element `outputs[]` (BR-09, UC-04 AF-3) |

---

### UT-33: Direct call result returned unchanged (identity)

| Field | Value |
|-------|-------|
| **ID** | UT-33 |
| **Priority** | High |
| **Level / Type** | UT — compatibility (automated) |
| **Requirement** | STORY 2 (AC-2.6) · UC-06 step 6 · BR-12 · NFR-4, NFR-14 |
| **Preconditions** | Direct invocation (`markdown` only) |
| **Test data** | Child result `{ content: [{ type:'text', text: '{"success":true,"artifacts":[]}' }], isError: false }` |
| **Automation** | `content-proxy.test.ts` › "does not inline base64 for direct calls" — **existing** |
| **Status** | Existing — passing (E-1) |
| **Evidence** | BRD §8.3 E-1 |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `adaptResult(directInvocation, result)` | Returns the **same object** — no artifact work, no parsing, no path stripping (NFR-4: no extra artifact work on direct calls) |

---

### UT-34: Child `isError` short-circuits adaptation (pass-through)

| Field | Value |
|-------|-------|
| **ID** | UT-34 |
| **Priority** | High |
| **Level / Type** | UT — error pass-through (automated) |
| **Requirement** | STORY 7 (AC-7.7) · UC-02 AF-4, UC-06 EF-1 · BR-18 · E-10 |
| **Preconditions** | Wrapper-mode invocation; child result with `isError: true` and the child's own message |
| **Test data** | `{ content: [{ type:'text', text: 'unsupported markdown table' }], isError: true }` |
| **Automation** | `content-proxy.test.ts` — **planned** |
| **Status** | Planned |
| **Evidence** | `evidence/UT-34-child-error-passthrough.txt` |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `adaptResult(wrapperInvocation(), childError)` | Returned **untouched** — message text, `isError` flag and structured detail survive verbatim |
| 2 | `readResource`/fetch spies | Never called — no artifact retrieval attempted for a failed invocation (BR-18, STORY 7 RD-5) |

---

### UT-35: Unreadable artifacts fail loudly — `ARTIFACT_FETCH_FAILED`, no path leak

| Field | Value |
|-------|-------|
| **ID** | UT-35 |
| **Priority** | High |
| **Level / Type** | UT — fail-loud contract (automated) |
| **Requirement** | STORY 2 (AC-2.2, AC-2.6), STORY 7 (AC-7.3, AC-7.5) · UC-02 main flow, UC-03 EF-1 · BR-14 · E-03 · TD-06 · RK-01, RK-02 |
| **Preconditions** | Wrapper-mode invocation; `serverName: 'remote-exporter'` in deps |
| **Test data** | TD-06 — `{ success: true, artifacts: [{ path: '/remote/secret/UG.docx', name: 'UG.docx' }] }` with no readable source |
| **Automation** | `content-proxy.remote.test.ts` › "fails loudly (never returns a path)..." — **existing** |
| **Status** | Existing — passing (E-1) |
| **Evidence** | BRD §8.3 E-1, E-7 |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `adaptResult` the path-only result | `isError === true`; text matches `/ARTIFACT_FETCH_FAILED/` |
| 2 | Inspect the message | Names the artifact (`UG.docx`) and the server (`remote-exporter`); contains `No file was written.`; lists the three supported alternatives (MCP resource / http(s) URL / data URI) |
| 3 | Search the whole payload for `/remote/secret` | **Absent** — no host path anywhere (BR-10, AC-2.3) |

---

### 2.7 Extension output proxy (`output-proxy.ts`)

### UT-36: Single write — payload written, response reduced to metadata

| Field | Value |
|-------|-------|
| **ID** | UT-36 |
| **Priority** | High |
| **Level / Type** | UT — functional (automated) |
| **Requirement** | STORY 1 (AC-1.6) · UC-01 steps 10-11 · BR-15, BR-16 |
| **Preconditions** | `proxyToolOutput` with a mocked wrapper context (workspace root = temp dir) |
| **Test data** | Backend result `{ success: true, file_name: 'UG-v1.docx', size_bytes: 4, output_base64: base64('DOCX') }`; `output_path: <tmp>/UG-v1.docx` |
| **Automation** | `backend-local-tools.base64-proxy.test.ts` › "proxyOutput writes base64 to file" — **existing** (extension suite) |
| **Status** | Existing — passing (E-3, 3,255 pass) |
| **Evidence** | BRD §8.3 E-3; FSD §10.4 (UT-22 FSD-numbering) |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run the output proxy | File exists at the resolved destination with the exact bytes |
| 2 | Read the returned result | `output_base64` removed; `file_path` = destination; `size_bytes` = **byte length** (4, not base64 length) |

---

### UT-37: Multi-file write — one file per entry, count verified

| Field | Value |
|-------|-------|
| **ID** | UT-37 |
| **Priority** | High |
| **Level / Type** | UT — functional (automated) |
| **Requirement** | STORY 4 (AC-4.1, AC-4.2, AC-4.5) · UC-04 steps 3-7 · BR-09, BR-15, BR-16 · TD-07 |
| **Preconditions** | Backend result with `outputs[]` of 2 entries |
| **Test data** | TD-07 — `report.pdf` (1,967 B, `%PDF`-prefixed synthetic) + `data.json` (31 B, `{"k":1}`-style) |
| **Automation** | `base64-proxy.dynamic-catalog.test.ts` › "Multi-output: writes every file, verifies count" — **existing** |
| **Status** | Existing — passing (E-3) |
| **Evidence** | BRD §8.3 E-3 |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run the output proxy | Exactly 2 files on disk, each under **its own** bare name; neither overwrites the other |
| 2 | Read the response | `outputs[]` metadata only (`file_path`, `size_bytes`, `file_name`, `mime_type`) — **no** `output_base64` anywhere (a second base64 round is never sent, BR-09/UC-04 step 7) |
| 3 | Count check | `writtenCount === expectedCount` → success (BR-16) |

---

### UT-38: Metadata without bytes → extension-side `ARTIFACT_FETCH_FAILED`; zero-declared pass-through

| Field | Value |
|-------|-------|
| **ID** | UT-38 |
| **Priority** | High |
| **Level / Type** | UT — fail-loud second guard (automated) |
| **Requirement** | STORY 2 (AC-2.2, AC-2.5) · UC-02 AF-1, EF-1 · BR-13, BR-14 · E-04 |
| **Preconditions** | Wrapper mode active (`file_path` present, BR-13); backend returned artifact metadata with no payload |
| **Test data** | `{ success: true, artifacts: [{ name: 'no-bytes.docx', size: 123 }] }` (no `output_base64`, no `outputs[]`) |
| **Automation** | `output-proxy` unit test — **planned** (IT-level evidence already exists: IT-12) |
| **Status** | Planned |
| **Evidence** | `evidence/UT-38-missing-payload.txt` |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run the output proxy | `isError === true`; literal: `ARTIFACT_FETCH_FAILED: no-bytes.docx was returned without content (the backend could not read the artifact). No file was written.` (E-04) |
| 2 | Control — zero declared artifacts AND zero payload (text-only result) | Result returned unchanged — **not** an error (UC-02 EF-1, OI-05) |
| 3 | Control — non-wrapper call | Historical behaviour kept (BR-13 evaluated on original args) |

---

### UT-39: Zero and partial multi-file writes fail with exact counts

| Field | Value |
|-------|-------|
| **ID** | UT-39 |
| **Priority** | High |
| **Level / Type** | UT — fail-loud contract (automated) |
| **Requirement** | STORY 4 (AC-4.3, AC-4.4), STORY 7 (AC-7.4) · UC-04 EF-1, EF-2, EF-5 · BR-16 · E-05, E-06 · RK-05, RK-13 |
| **Preconditions** | 3-entry `outputs[]` (TD-07 extended with a third entry); destinations made unwritable (read-only dir / name collision with a directory) |
| **Test data** | 3 payloads; variant A: all destinations blocked; variant B: only the 2nd blocked → 1 written / 3 expected |
| **Automation** | `output-proxy` unit test — **planned** |
| **Status** | Planned |
| **Evidence** | `evidence/UT-39-write-counts.txt` |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Zero-writable variant | `isError === true`; literal: `PROXY_WRITE_FAILED: no artifact could be written for '<tool>'.` (E-05) |
| 2 | Partial variant | `isError === true`; literal template: `PROXY_WRITE_FAILED: only X/Y artifacts could be written for '<tool>'.` (E-06) — for this data: `only 1/3 artifacts could be written for 'export_bundle'.` — the **only** error allowed to leave files behind, and it says so with counts |
| 3 | Entry without a usable name (multi mode) | Skipped → count mismatch → E-06 wording, never a silent drop (UC-04 EF-3) |

---

### UT-40: Write exceptions are sanitised; non-wrapper calls pass through

| Field | Value |
|-------|-------|
| **ID** | UT-40 |
| **Priority** | High |
| **Level / Type** | UT — security + compatibility (automated) |
| **Requirement** | STORY 7 (AC-7.5) · UC-01 EF-6 · BR-17 · E-07 · TD-11, TD-12 · RK-13 |
| **Preconditions** | Destination outside the workspace (TD-11 `../../etc/passwd`-style) and a symlinked destination (TD-12) |
| **Test data** | `output_path` escaping the workspace root; `link.docx` symlink → outside; then a plain non-wrapper result |
| **Automation** | `output-proxy` unit test — **planned** |
| **Status** | Planned |
| **Evidence** | `evidence/UT-40-write-guard.txt` |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Write to the escaping path | `isError`; literal shape: `PROXY_WRITE_FAILED: <sanitized reason> — no file was written.` (E-07) |
| 2 | Inspect the message | **No absolute path, no stack trace** — exception text sanitised before embedding (BR-17, AC-7.5) |
| 3 | Non-wrapper result | Returned unchanged — the output proxy does not police direct calls (BR-13) |

---

### 2.8 Extension LLM-facing schema rewrite (`schema-rewrite.ts`)

### UT-41: LLM-facing view hides content arguments, exposes `file_path`/`output_path`

| Field | Value |
|-------|-------|
| **ID** | UT-41 |
| **Priority** | High |
| **Level / Type** | UT — schema contract (automated) |
| **Requirement** | STORY 5 (AC-5.5) · UC-05 steps 7-9 · BR-11 |
| **Preconditions** | Backend-adapted catalog entry (with `content_base64`, `x-content-param`, `markdown`) |
| **Test data** | Catalog fixture of `export_docx` (as in IT-09) |
| **Automation** | `base64-proxy.dynamic-catalog.test.ts` › "Rewrite catalog schema: hides markdown, adds file_path/output_path" — **existing** |
| **Status** | Existing — passing (E-3) |
| **Evidence** | BRD §8.3 E-3 |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Rewrite the catalog for the LLM | `content_base64` and `markdown` removed from `properties` — the model is never asked to produce base64 |
| 2 | Inspect exposed arguments | `file_path` present **and required**; `output_path` present for output tools |

---

### UT-42: Destination default — `.drawio` → `.png` swap, otherwise `.out` appended

| Field | Value |
|-------|-------|
| **ID** | UT-42 |
| **Priority** | Medium |
| **Level / Type** | UT — naming default (automated) |
| **Requirement** | STORY 1 (RD-3) · UC-01 AF-1 · BR-15 |
| **Preconditions** | No `output_path`; no backend-suggested name |
| **Test data** | Source `diagram.drawio` → destination `diagram.png`; source `notes.md` → `notes.md.out` |
| **Automation** | `schema-rewrite`/`resolveOutputPath` unit test — **planned** |
| **Status** | Planned |
| **Evidence** | `evidence/UT-42-default-suffix.txt` |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Resolve destination for a `.drawio` source | `.png` swapped |
| 2 | Resolve for any other source | `.out` appended (single artifact only; multi without a name → entry skipped, BR-15) |

---

### UT-43: Detection from both catalog populations; additive registration

| Field | Value |
|-------|-------|
| **ID** | UT-43 |
| **Priority** | Medium |
| **Level / Type** | UT — wiring detail (automated) |
| **Requirement** | STORY 5 (AC-5.2), STORY 6 (AC-6.1) · UC-05 AF-8 · BR-19 |
| **Preconditions** | `Base64ProxyService.detectFromToolList` / `registerTools` |
| **Test data** | `find_tools` catalog (schema field) and `tools/list` (inputSchema field) fixtures |
| **Automation** | `base64-proxy.dynamic-catalog.test.ts` › "Detect input/output from find_tools catalog" + "registerTools additive…" — **existing** (2 tests) |
| **Status** | Existing — passing (E-3) |
| **Evidence** | BRD §8.3 E-3 |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Detect from a `find_tools` catalog entry | Input + output proxy detected from the `schema` field (AF-8 first-use path) |
| 2 | `registerTools` with local + dynamic tools | Additive — local tools keep working; detection is per-definition at registration (BR-19: zero per-call detection cost) |

---

### 2.9 Addendum — artifact cleanup (TDD §9, pending implementation)

> **⛔ Status: pending implementation (OI-14/OI-15).** The as-built code performs neither obligation today (`readLocalFile` leaves the artifact in place — TDD §9). These cases are specified from TDD §9.1/§9.2 and must not be executed until DEV delivers OI-14 (immediate cleanup) and OI-15 (periodic sweep). They trace to BRD STORY 3 RD-7/RD-8, §6 NFR rows and evidence E-8/E-9.

### UT-44: Immediate cleanup — local artifact deleted after successful inline (OI-14)

| Field | Value |
|-------|-------|
| **ID** | UT-44 |
| **Priority** | Medium |
| **Level / Type** | UT — cleanup contract (automated) |
| **Requirement** | STORY 3 (RD-7) · BRD §6 "Security — local cleanup" · Evidence E-8 · OI-14 |
| **Preconditions** | OI-14 implemented (`cleanup` dep in `ArtifactDeps`); temp artifact file with known bytes |
| **Test data** | Temp file `out.docx` = 10 known bytes; descriptor `{ path: <temp>, name: 'out.docx' }` |
| **Automation** | `content-proxy.test.ts` (new describe "local cleanup") — **pending implementation (OI-14)** |
| **Status** | Pending implementation (OI-14) |
| **Evidence** | To be captured — `evidence/UT-44-immediate-cleanup.txt` |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `resolveArtifact` the local-path descriptor | Returned bytes equal the original content |
| 2 | `fs.existsSync(temp)` | **false** — the file was deleted after the bytes were inlined (E-8) |
| 3 | Repeat for a `file:` URI read | Same deletion behaviour (`readLocalFileUri` inherits via `readLocalFile`) |

---

### UT-45: Cleanup failure never fails the tool call (OI-14)

| Field | Value |
|-------|-------|
| **ID** | UT-45 |
| **Priority** | Medium |
| **Level / Type** | UT — cleanup robustness (automated) |
| **Requirement** | STORY 3 (RD-7 validation) · BRD §6 · OI-14 |
| **Preconditions** | OI-14 implemented; artifact file locked (Windows: open handle) or otherwise undeletable |
| **Test data** | Temp file with an open write handle preventing unlink |
| **Automation** | `content-proxy.test.ts` — **pending implementation (OI-14)** |
| **Status** | Pending implementation (OI-14) |
| **Evidence** | `evidence/UT-45-cleanup-failure.txt` |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Resolve the artifact; unlink fails | Warning logged with the **basename** only; bytes still returned; tool call **succeeds** (bytes already delivered) |
| 2 | Deletion timing check | A **failed** read never deletes anything — deletion happens only after the buffer is fully materialised (TDD §9.1 rule 2) |

---

### UT-46: Remote/resource-resolved artifacts are never deleted (OI-14 scope)

| Field | Value |
|-------|-------|
| **ID** | UT-46 |
| **Priority** | Medium |
| **Level / Type** | UT — cleanup scope (automated) |
| **Requirement** | STORY 3 (RD-7) · OI-14 rule 4 |
| **Preconditions** | OI-14 implemented; `readResource`/URL descriptors |
| **Test data** | Descriptor `{ uri: 'artifact://job-7/UG.docx' }` + resource blob; descriptor with an http(s) URL |
| **Automation** | `content-proxy.test.ts` — **pending implementation (OI-14)** |
| **Status** | Pending implementation (OI-14) |
| **Evidence** | `evidence/UT-46-cleanup-scope.txt` |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Resolve via `resources/read` | Bytes returned; **no** deletion attempted (the resource may be served from a store the child still needs) |
| 2 | Resolve via URL | Same — cleanup applies exclusively to the local-filesystem path (step 6 of the retrieval order, BR-07) |

---

### UT-47: Periodic sweep removes orphans older than TTL; keeps young and non-matching files (OI-15)

| Field | Value |
|-------|-------|
| **ID** | UT-47 |
| **Priority** | Medium |
| **Level / Type** | UT — cleanup sweep (automated) |
| **Requirement** | STORY 3 (RD-8) · BRD §1.2 #9, §6 "Capacity — periodic cleanup" · Evidence E-9 · OI-15 |
| **Preconditions** | OI-15 implemented (`CleanupSweep`); test config overrides: `intervalMs`, `ttlMs` shortened for test speed; scan root = temp dir |
| **Test data** | Files in the scan root: `export_r1.docx` (mtime = now − TTL − 1 min → **delete**), `export_r2.docx` (mtime = now − 1 min → **keep**), `notes.txt` (non-matching, old → **keep**), a symlinked `export_l.docx` → **keep** (`lstat` guard) |
| **Automation** | `backend/src/modules/orchestration/artifact-cleanup/__tests__/CleanupSweep.test.ts` — **pending implementation (OI-15)** |
| **Status** | Pending implementation (OI-15) |
| **Evidence** | `evidence/UT-47-sweep-ttl.txt` |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run one sweep tick | `export_r1.docx` removed; the young, non-matching and symlinked files all remain |
| 2 | Read the summary log line | `{ removed: 1, failed: 0, skipped: ≥2, durationMs }` — basenames only in any failure list (I-3) |
| 3 | Verify scan roots | Agent workspace **never** scanned — only configured artifact directories (OS temp + backend `tmp/`) |

---

### UT-48: Sweep bounds and configuration (OI-15)

| Field | Value |
|-------|-------|
| **ID** | UT-48 |
| **Priority** | Medium |
| **Level / Type** | UT — cleanup sweep (automated) |
| **Requirement** | STORY 3 (RD-8 validation) · BRD §6 (max sweep duration 30 s; defaults 5 min / 10 min) · OI-15 |
| **Preconditions** | OI-15 implemented; many orphan files seeded to exceed `maxRunMs` |
| **Test data** | `artifact.cleanup.maxRunMs` overridden to a small value; `artifact.cleanup.enabled = false` variant; default config keys `intervalMs = 300000`, `ttlMs = 600000` asserted |
| **Automation** | `CleanupSweep.test.ts` — **pending implementation (OI-15)** |
| **Status** | Pending implementation (OI-15) |
| **Evidence** | `evidence/UT-48-sweep-bounds.txt` |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Sweep with `maxRunMs` overrun | Tick **stops** at the bound; partial deletions reported honestly; event loop never blocked beyond 30 s |
| 2 | `enabled: false` | No timer started at all |
| 3 | Undeletable file (locked) | Listed in `failed` with basename; sweep continues with the remaining files |

---

## 3. Integration Tests (IT)

Environment: in-process fake MCP `Client` (`listTools` + `callTool`) injected into the real `McpClientManager` / `ProxiedToolRegistry`; extension side uses the real `WrapperServer` with a stubbed REST transport; real temp filesystem; no network. Exit criteria (STP G3): adapted and non-adapted tools coexist in one catalogue; a path-only remote result never escapes as a path; the wrapper writes exactly N files for N payloads.

### 3.1 Backend wiring — `McpClientManager.executeTool` (existing)

### IT-01: Full wrapper-mode invocation through the real client manager

| Field | Value |
|-------|-------|
| **ID** | IT-01 |
| **Priority** | High |
| **Level / Type** | IT — wiring (automated) |
| **Requirement** | STORY 1 (AC-1.2), STORY 2 (AC-2.1) · UC-01 steps 4-9 · BR-01, BR-02, BR-09, BR-10 |
| **Preconditions** | `McpClientManager` connected to a fake client serving `export_docx`; temp artifact file on the backend host |
| **Test data** | Temp `UG.docx` = 'DOCX'; call `executeTool('export_docx', { file_path: '/repo/UG.md', output_path: '/repo/UG.docx', content_base64: base64('# UG') })` |
| **Automation** | `McpClientManager.content-proxy.test.ts` › "maps content_base64 → markdown..." — **existing** |
| **Status** | Existing — passing (E-1, includes this file's 5 cases) |
| **Evidence** | BRD §8.3 E-1 |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Capture the arguments the fake child receives | Exactly `{ markdown: '# UG' }` — mapping + stripping happened in the real manager (BR-01/BR-02) |
| 2 | Read the returned result | `parsed.output_base64` === base64('DOCX'); `file_name === 'UG.docx'` — local artifact read through the real `readLocation` |

---

### IT-02: Missing content is a tool error; the child is never invoked

| Field | Value |
|-------|-------|
| **ID** | IT-02 |
| **Priority** | High |
| **Level / Type** | IT — error path (automated) |
| **Requirement** | STORY 7 (AC-7.1) · UC-07 Flow A · BR-01 · E-08 |
| **Preconditions** | Connected manager with `export_docx` |
| **Test data** | `executeTool('export_docx', { output_path: '/repo/UG.docx' })` — no payload |
| **Automation** | `McpClientManager.content-proxy.test.ts` › "returns a tool error when wrapper mode has no content" — **existing** |
| **Status** | Existing — passing (E-1) |
| **Evidence** | BRD §8.3 E-1 |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Execute | `isError === true`; text matches `/Missing content/` |
| 2 | Observe the fake child | `callTool` **not** reached — the invocation adapter short-circuits before the child round-trip |

---

### IT-03: Direct call passes through the real manager untouched

| Field | Value |
|-------|-------|
| **ID** | IT-03 |
| **Priority** | High |
| **Level / Type** | IT — compatibility (automated) |
| **Requirement** | STORY 2 (AC-2.6) · UC-06 · BR-12 · NFR-4, NFR-14 |
| **Preconditions** | Connected manager with `export_docx` |
| **Test data** | `executeTool('export_docx', { markdown: '# Direct' })` |
| **Automation** | `McpClientManager.content-proxy.test.ts` › "does not adapt direct calls" — **existing** |
| **Status** | Existing — passing (E-1) |
| **Evidence** | BRD §8.3 E-1 |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Execute | Child receives `{ markdown: '# Direct' }` verbatim |
| 2 | Inspect the response | `output_base64` absent — child shape preserved, no artifact work (NFR-4) |

---

### IT-04: Remote artifact retrieved through `resources/read` wiring

| Field | Value |
|-------|-------|
| **ID** | IT-04 |
| **Priority** | High |
| **Level / Type** | IT — cross-host retrieval (automated) |
| **Requirement** | STORY 3 (AC-3.1) · UC-03 main flow · BR-07 step 3, BR-21 |
| **Preconditions** | Fake client with `callTool` returning a `uri` descriptor and `readResource` returning `{ contents: [{ blob }] }` |
| **Test data** | `artifact://job-9/UG.docx` → blob base64('REMOTE-DOCX') |
| **Automation** | `McpClientManager.content-proxy.test.ts` › "fetches artifacts from a remote child through resources/read" — **existing** |
| **Status** | Existing — passing (E-1) |
| **Evidence** | BRD §8.3 E-1 |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Execute a wrapper-mode call | `parsed.output_base64` === base64('REMOTE-DOCX') — the real `readResourceFromClient` wiring delivered the bytes |
| 2 | Search the response text for `artifact://` | **Absent** — the MCP URI never leaks into the agent-visible payload |

---

### IT-05: Unreachable remote artifact fails loudly, never leaks a path

| Field | Value |
|-------|-------|
| **ID** | IT-05 |
| **Priority** | High |
| **Level / Type** | IT — fail-loud (automated) |
| **Requirement** | STORY 2 (AC-2.2, AC-2.3), STORY 7 (AC-7.3) · UC-03 EF-1 · BR-14 · E-03 · RK-01, RK-02 |
| **Preconditions** | Fake child returning a path-only artifact on a foreign host; no `readResource` success |
| **Test data** | `artifacts: [{ path: '/srv/artifacts/UG.docx', name: 'UG.docx' }]` |
| **Automation** | `McpClientManager.content-proxy.test.ts` › "errors instead of leaking a path..." — **existing** |
| **Status** | Existing — passing (E-1) |
| **Evidence** | BRD §8.3 E-1, E-7 |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Execute | `isError === true`; text matches `/ARTIFACT_FETCH_FAILED/` |
| 2 | Search the response for `/srv/artifacts` | **Absent** — a path-only remote result never escapes as a path (STP G3) |

---

### 3.2 Backend wiring — `ProxiedToolRegistry` (planned — closes the STP §2.2.3 gap)

### IT-06: Mixed catalogue registers adapted and raw definitions with zero new names

| Field | Value |
|-------|-------|
| **ID** | IT-06 |
| **Priority** | High |
| **Level / Type** | IT — registration (automated) |
| **Requirement** | STORY 5 (AC-5.1, AC-5.2), STORY 6 (AC-6.1, AC-6.2) · UC-05 steps 1-5 · BR-19, BR-20 |
| **Preconditions** | Fake client returning a mixed tool list: `export_docx` (file producer), `jira_create_issue` (non-file, TD-10), `drawio_export_png` (wrapper-native, TD-09) |
| **Test data** | TD-01 + TD-09 + TD-10 definitions in one `listTools` response |
| **Automation** | `ProxiedToolRegistry` integration test — **planned** (STP §2.2.3 "honest gap": registry only exercised indirectly today) |
| **Status** | Planned |
| **Evidence** | `evidence/IT-06-registry-mixed.txt` |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `registerServerTools('markdown-exporter', fakeClient)` | Proxied list has **exactly 3 tools** — same names as the child published, zero additions (no `*_proxied`, `content_proxy`, `fetch_artifact`) |
| 2 | Inspect `export_docx` definition | Adapted: `content_base64` present, `x-content-param`, `x-output-base64`, `required` without `markdown` |
| 3 | Inspect the other two | Raw definitions pushed untouched |
| 4 | `getCapability` lookups | Capability stored for `export_docx` only (invocation-time O(1) map, BR-19) |

---

### IT-07: Non-file and wrapper-native tools behave unchanged through the registry path

| Field | Value |
|-------|-------|
| **ID** | IT-07 |
| **Priority** | Medium |
| **Level / Type** | IT — regression (automated) |
| **Requirement** | STORY 6 (AC-6.2, AC-6.3) · UC-05 AF-1, UC-06 AF-1 · BR-05 · RK-09, RK-10 |
| **Preconditions** | Manager registered per IT-06 |
| **Test data** | Calls to `jira_create_issue` (direct args) and `drawio_export_png` (own `content_base64`) |
| **Automation** | Registry integration test — **planned** |
| **Status** | Planned |
| **Evidence** | `evidence/IT-07-registry-untouched.txt` |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `jira_create_issue` with body content | No capability → no adapter objects constructed; child receives the arguments verbatim |
| 2 | Call `drawio_export_png` with its own `content_base64` | Not re-mapped (BR-05); wrapper flow still proxies input/output from its own detection (UC-01 AF-4) |

---

### IT-08: `clear()` drops capabilities; re-registration re-detects

| Field | Value |
|-------|-------|
| **ID** | IT-08 |
| **Priority** | Medium |
| **Level / Type** | IT — lifecycle (automated) |
| **Requirement** | STORY 6 (validation) · UC-05 · BR-19 |
| **Preconditions** | Manager registered per IT-06 |
| **Test data** | Same fixtures |
| **Automation** | Registry integration test — **planned** |
| **Status** | Planned |
| **Evidence** | `evidence/IT-08-registry-clear.txt` |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `clear()` the registry | `getCapability('export_docx')` → undefined; proxied tool list empty |
| 2 | Re-register | Capability re-detected once per definition; adapted definitions re-pushed (no duplicate entries) |

---

### 3.3 Extension wiring — `WrapperServer` dynamic tool router (existing)

### IT-09: Catalog rewritten for the LLM before discovery

| Field | Value |
|-------|-------|
| **ID** | IT-09 |
| **Priority** | High |
| **Level / Type** | IT — schema contract (automated) |
| **Requirement** | STORY 5 (AC-5.5) · UC-05 steps 6-9 · BR-11, BR-13 |
| **Preconditions** | `WrapperServer` in-process; stubbed backend returning the adapted CATALOG fixture |
| **Test data** | CATALOG: `export_docx` with `markdown` + `content_base64` properties, `x-content-param: 'markdown'`, `x-output-base64: true` |
| **Automation** | `wrapper-server.dynamic-export.test.ts` › "rewrites the catalog schema for the LLM" — **existing** |
| **Status** | Existing — passing (E-3) |
| **Evidence** | BRD §8.3 E-3 |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `find_tools('export docx')` through the wrapper | Tool schema shows `file_path` + `output_path`; `content_base64` and `markdown` **undefined** |
| 2 | Read `required` | Contains `file_path`; does not contain `markdown` |
| 3 | Inspect entry shape | `inputSchema` field absent (catalog uses `schema`) — no raw backend schema leaks |

---

### IT-10: `file_path` read → `content_base64` forwarded → returned bytes written

| Field | Value |
|-------|-------|
| **ID** | IT-10 |
| **Priority** | High |
| **Level / Type** | IT — end-to-end input/output proxy (automated) |
| **Requirement** | STORY 1 (AC-1.1, AC-1.6), STORY 2 (AC-2.1) · UC-01 steps 2-3, 10-11 · BR-13, BR-15, BR-16 |
| **Preconditions** | Wrapper server running; input file in the harness temp dir; stubbed backend returning `output_base64` |
| **Test data** | Input `UG.md` = '# User Guide\n\nNội dung tiếng Việt.' (UTF-8 multi-byte); backend result `{ file_name: 'UG-v1.docx', size_bytes: 4, output_base64: base64('DOCX') }` |
| **Automation** | `wrapper-server.dynamic-export.test.ts` › "reads file_path, forwards content_base64 and writes the returned bytes" — **existing** |
| **Status** | Existing — passing (E-3) |
| **Evidence** | BRD §8.3 E-3 |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `execute_dynamic_tool(export_docx, { file_path: input, output_path: output })` via HTTP `tools/call` | Backend receives `content_base64` === base64 of the exact file bytes (UTF-8 Vietnamese intact) + `file_path` + `output_path` |
| 2 | Check the destination file | Exists; contents === 'DOCX' |
| 3 | Read the LLM response | `output_base64` **undefined**; `file_path` = destination; `size_bytes` = 4 (metadata only — BR-16/UC-04 step 7) |

---

### IT-11: Proxy detection on first use (no prior `find_tools`)

| Field | Value |
|-------|-------|
| **ID** | IT-11 |
| **Priority** | Medium |
| **Level / Type** | IT — lazy detection (automated) |
| **Requirement** | STORY 5 (AC-5.2) · UC-05 AF-8 · BR-19 |
| **Preconditions** | Fresh `WrapperServer` whose stub records call order and answers `find_tools` with the catalog |
| **Test data** | Input `lazy.md` = '# lazy'; expected output `lazy.docx` = 'LAZY' |
| **Automation** | `wrapper-server.dynamic-export.test.ts` › "auto-detects the schema on first use" — **existing** |
| **Status** | Existing — passing (E-3) |
| **Evidence** | BRD §8.3 E-3 |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `execute_dynamic_tool` directly (never having called `find_tools`) | Recorded call order === `['find_tools', 'execute_dynamic_tool']` — `ensureProxyDetection` fetched the schema lazily |
| 2 | Check the forwarded arguments and the output file | `content_base64` === base64('# lazy'); file written with 'LAZY' |

---

### IT-12: Backend yields metadata without bytes → loud failure, no file

| Field | Value |
|-------|-------|
| **ID** | IT-12 |
| **Priority** | High |
| **Level / Type** | IT — fail-loud second guard (automated) |
| **Requirement** | STORY 2 (AC-2.2, AC-2.5), STORY 7 (AC-7.3) · UC-02 AF-1 · BR-13, BR-14 · E-04 · RK-01 |
| **Preconditions** | Wrapper server running; stubbed backend returns artifact metadata with **no** payload |
| **Test data** | `{ success: true, artifacts: [{ name: 'no-bytes.docx', size: 123 }] }`; destination pre-deleted |
| **Automation** | `wrapper-server.dynamic-export.test.ts` › "fails loudly instead of returning a path..." — **existing** |
| **Status** | Existing — passing (E-3) |
| **Evidence** | BRD §8.3 E-3, E-7 |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Execute through the wrapper | HTTP result `isError === true`; text matches `/ARTIFACT_FETCH_FAILED/` (extension-side variant, E-04) |
| 2 | `fs.existsSync(destination)` | **false** — no file written (STP G3: the router wires input proxy → backend call → output proxy with no silent path) |
---

## 4. End-to-End API Tests (E2E-API)

Environment: real backend at `http://127.0.0.1:3000` + real child `markdown-exporter-mcp-local` (stdio/local); writable temp workspace; `LIVE_BACKEND` not required. Entry (STP G4): server started with current code; child tools discovered; **baseline `tools/list` snapshot captured before the first export**. Exit (STP G4): zero new tool names; six export calls write six valid files; direct-call shape unchanged; both negative payload cases return the exact documented error.

> These 16 cases are the only place where the contract is observable **from outside the process**; E2E-API-01..07 also substitute for the missing UI surface (STP §2.5).

### E2E-API-01: Catalogue invariant — zero new tools versus baseline

| Field | Value |
|-------|-------|
| **ID** | E2E-API-01 |
| **Priority** | High |
| **Level / Type** | E2E-API — invariant (automated) |
| **Requirement** | STORY 5 (AC-5.1, AC-5.2) · UC-05 · BR-20 · NFR-13 · TD-10 |
| **Preconditions** | Backend + child running current code; baseline `tools/list` captured **before** any export |
| **Test data** | Baseline name set vs post-change name set; forbidden names: `export_docx_proxied`, `content_proxy`, `fetch_artifact` (BR-20) |
| **Automation** | `backend/tests/e2e-api/content-proxy.catalog.e2e.test.ts` — **planned** |
| **Status** | Planned |
| **Evidence** | `evidence/E2E-API-01-catalogue-diff.txt` |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `tools/list` → snapshot the name set | Set captured before any adaptation is observable |
| 2 | Run one wrapper-mode export (any format) | Export succeeds |
| 3 | `tools/list` again; diff the name sets | **Zero** additions, zero removals, zero renames — adaptation rewrites definitions in place |
| 4 | Search the catalogue for TD-10 tools (`jira_create_issue`, `confluence_create_page`, `mem_ingest`) | Still present with **unchanged** schemas (over-detection regression guard, RK-09) |

---

### E2E-API-02..07: Adapted schema contract per exporter

| Field | E2E-API-02 | E2E-API-03 | E2E-API-04 | E2E-API-05 | E2E-API-06 | E2E-API-07 |
|-------|-----------|-----------|-----------|-----------|-----------|-----------|
| **Tool** | `export_docx` | `export_xlsx` | `export_pptx` | `export_pdf` | `export_html` | `export_json` |
| **Priority** | High | High | High | High | Medium | Medium |
| **Status** | Planned | Planned | Planned | Planned | Planned | Planned |
| **Evidence** | `evidence/E2E-API-02..07-schema.txt` | | | | | |

| Field (common) | Value |
|-------|-------|
| **Level / Type** | E2E-API — schema contract (automated) |
| **Requirement** | STORY 5 (AC-5.3, AC-5.4) · UC-05 · BR-11 · verified live shape per FSD §3.9.1 |
| **Preconditions** | Backend running; exporter discoverable via `find_tools` |
| **Test data** | `find_tools('<exporter>')` response; reference live shape of `export_pdf`: properties `markdown`, `file_name` (`anyOf[string,null]`), `options`, `content_base64`; `required: []` |
| **Automation** | `backend/tests/e2e-api/content-proxy.schema.e2e.test.ts` (one test per exporter) — **planned** |

**Steps (identical for each of the six):**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `find_tools` for the exporter | Tool found; **same name** as the child publishes |
| 2 | `inputSchema.required` | `[]` — the content argument (`markdown`) is no longer required |
| 3 | `inputSchema['x-content-param']` | `'markdown'` — names the child's real content argument |
| 4 | `inputSchema['x-output-base64']` | `true` |
| 5 | `inputSchema.properties.content_base64` | Present, `type: string`, description warns the LLM never to send it |
| 6 | `description` | Mentions `output_base64` **exactly once** (marker sentence not duplicated on repeat reads) |

---

### E2E-API-08..13: One real export per format with signature assertions

| Field | E2E-API-08 | E2E-API-09 | E2E-API-10 | E2E-API-11 | E2E-API-12 | E2E-API-13 |
|-------|-----------|-----------|-----------|-----------|-----------|-----------|
| **Tool / format** | `export_docx` | `export_xlsx` | `export_pptx` | `export_pdf` | `export_html` | `export_json` |
| **Priority** | High | High | High | High | Medium | Medium |
| **Signature** | OOXML package (`PK` + `word/` parts) | `PK` + `xl/workbook.xml` + `xl/worksheets/sheet1.xml` | OOXML package (`PK` + `ppt/` parts) | starts with `%PDF` | HTML document (`<` / doctype) | parses as JSON |
| **Status** | Planned ×6 | | | | | |
| **Evidence** | `evidence/E2E-API-08..13-export.txt` | | | | | |

| Field (common) | Value |
|-------|-------|
| **Level / Type** | E2E-API — functional happy path (automated) |
| **Requirement** | STORY 1 (AC-1.1..AC-1.6) · UC-01 main flow · BR-07, BR-09, BR-10 · TD-01 · TR-1 |
| **Preconditions** | Backend + child running; temp workspace writable; source fixture written |
| **Test data** | TD-01 — `# Hello\n\nWorld.\n` (~20 B) written to `<tmp>/content-proxy-e2e/source.md`; `output_path: <tmp>/content-proxy-e2e/out.<ext>` |
| **Automation** | `backend/tests/e2e-api/content-proxy.export.e2e.test.ts` (one test per format) — **planned** |

**Steps (identical shape for each of the six):**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `execute_dynamic_tool(toolName, { file_path, output_path })` over HTTP | HTTP 200; result is **not** `isError` |
| 2 | Stat the destination file | Exists; size **> 0** |
| 3 | Read the first bytes / ZIP entries | Format signature per the table (for XLSX: both package parts present — AC-1.3) |
| 4 | Parse the response text | `file_path` = destination; `size_bytes` === actual byte size; `output_base64` **absent** (post-write metadata only) |
| 5 | Search the whole response for an absolute child path (`/tmp/`, drive letters, the child's host dirs) | **None found** — no host path leak (AC-1.6, RK-02) |

---

### E2E-API-14: Direct call keeps the child's original response shape

| Field | Value |
|-------|-------|
| **ID** | E2E-API-14 |
| **Priority** | Medium |
| **Level / Type** | E2E-API — compatibility (automated) |
| **Requirement** | STORY 2 (AC-2.6), STORY 5 (AC-5.6) · UC-06 · BR-12 · NFR-4, NFR-14 · RK-11 |
| **Preconditions** | Backend + child running |
| **Test data** | `execute_dynamic_tool('export_pdf', { markdown: '# Direct' })` — no wrapper-owned key |
| **Automation** | `backend/tests/e2e-api/content-proxy.direct.e2e.test.ts` — **planned** |
| **Status** | Planned |
| **Evidence** | `evidence/E2E-API-14-direct-shape.txt` |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Execute the direct call | HTTP 200; not `isError` |
| 2 | Parse the response | Child's **original** shape — `artifacts[].path` preserved verbatim, no `output_base64`, no file written by the proxy |

---

### E2E-API-15: Wrapper mode without content → exact missing-content error

| Field | Value |
|-------|-------|
| **ID** | E2E-API-15 |
| **Priority** | High |
| **Level / Type** | E2E-API — error path (automated) |
| **Requirement** | STORY 7 (AC-7.1) · UC-07 Flow A · BR-01 · E-08 |
| **Preconditions** | Backend + child running |
| **Test data** | `execute_dynamic_tool('export_docx', { output_path: '<tmp>/never.docx' })` — no `content_base64`, no `markdown` |
| **Automation** | `backend/tests/e2e-api/content-proxy.payload.e2e.test.ts` — **planned** |
| **Status** | Planned |
| **Evidence** | `evidence/E2E-API-15-missing-content.txt` |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Execute | `isError === true`; text begins `Missing content: pass file_path so the extension wrapper can inject content_base64 (or send markdown directly).` |
| 2 | Verify no artifact was produced | `<tmp>/never.docx` does not exist; the child was never invoked with an empty document |

---

### E2E-API-16: Invalid `content_base64` → exact rejection, no file

| Field | Value |
|-------|-------|
| **ID** | E2E-API-16 |
| **Priority** | High |
| **Level / Type** | E2E-API — error path (automated) |
| **Requirement** | STORY 7 (AC-7.2) · UC-01 EF-3, UC-07 Flow B · BR-01 · E-09 · NFR-5, NFR-12 · TD-04 · RK-04 |
| **Preconditions** | Backend + child running |
| **Test data** | TD-04 — `content_base64: '!!!not-base64!!!'` |
| **Automation** | `backend/tests/e2e-api/content-proxy.payload.e2e.test.ts` — **planned** |
| **Status** | Planned |
| **Evidence** | `evidence/E2E-API-16-invalid-base64.txt` |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Execute with the malformed payload | `isError === true`; text === `Invalid content_base64 payload.` (exact documented message) |
| 2 | Verify no side effects | No file written; child not invoked; no corrupted document reported as success |

---

## 5. End-to-End UI Tests (E2E-UI) — Not Applicable

| Field | Value |
|-------|-------|
| **Planned cases** | **0** — recorded as a decision, not an oversight (STP §2.2.5) |
| **Reason** | SA4E-380 is a protocol/orchestration capability between the agent, the extension wrapper and the child MCP server. There is no screen, no route, no component; the agent-visible output is a tool-result text block. A browser would test nothing this ticket changes |
| **Substitute coverage** | The **schema-visible contract** (what an LLM or human reading the catalogue sees) is asserted at E2E-API-01..07; the **agent-visible result contract** (`file_path`, `size_bytes`, error codes) at E2E-API-08..16 and SIT-01..11 |
| **Reactivation rule** | If a future ticket exposes a document-export screen, Playwright cases must be added here and the level becomes active |
---

## 6. System Integration Tests (SIT — live, on-demand)

Environment: backend running locally; `markdown-exporter-mcp-local` as a stdio child; extension wrapper on port **9183** inside the Kiro window; harness `WrapperServer` on ephemeral port (live harness uses 48721); evidence in `documents/SA4E-380/evidence/`. Entry (STP G6): **SIT-11 runs first** as the wrapper-build freshness smoke check (STP TR-3 / §12.1); fixture `documents/SA4E-375/UG-embedded.md` present. Exit (STP G6): SIT-01..10 pass; SIT-11 PASS or BLOCKED with the reload action stated; **no unexplained file; every failure path leaves zero files behind**.

Automation: 0% in CI. SIT-01..06 are driven by the on-demand harness `extension/src/__tests__/live-content-proxy.test.ts` (`LIVE_BACKEND=1`, excluded from CI by design); the tester runs it and records the artifacts. Reference sizes from the recorded live run (E-6): xlsx **4,849 B**; docx **14,599 B**; pptx **29,296 B**; pdf **1,967 B**; html **199 B**; json **31 B** — used for comparison, never overwritten (STP §10.3 rule 5).

### SIT-01..06: Six exporters through the real wrapper (harness-assisted)

| Field | SIT-01 | SIT-02 | SIT-03 | SIT-04 | SIT-05 | SIT-06 |
|-------|--------|--------|--------|--------|--------|--------|
| **Tool** | `export_docx` | `export_xlsx` | `export_pptx` | `export_pdf` | `export_html` | `export_json` |
| **Priority** | High | High | High | High | Medium | Medium |
| **Magic** | `PK` | `PK` | `PK` | `%PDF` | `<` | `{` |
| **Reference size (E-6)** | 14,599 B | 4,849 B | 29,296 B | 1,967 B | 199 B | 31 B |
| **Status** | Existing — passing on demand (E-4, 6/6) | | | | | |

| Field (common) | Value |
|-------|-------|
| **Level / Type** | SIT — live end-to-end (harness `LIVE_BACKEND=1`) |
| **Requirement** | STORY 1 (AC-1.1, AC-1.2, AC-1.6) · UC-01 full flow · BR-01, BR-15, BR-16 · TD-01/TD-08 |
| **Preconditions** | SIT-11 PASS (wrapper build current); backend started; harness temp dir writable |
| **Test data** | MARKDOWN fixture in the harness (live-content-proxy.test.ts): `# Live E2E\n\nNội dung kiểm thử **content proxy**.\n\n| Cột A | Cột B |\n---\n| 1 | 2 |\n\n- một\n- hai\n` — Unicode + table + list; source `<TMP_DIR>/live/<tool>-source.md`, output `<tool>-output.<ext>` |
| **Automation** | `extension/src/__tests__/live-content-proxy.test.ts` › `it.each(EXPORTERS)` — **existing, on demand** |
| **Evidence** | `documents/SA4E-380/evidence/SIT-01..06-<tool>.png` + file listing + sizes recorded into `live-evidence.csv` (STP §10.2) |

**Steps (per exporter):**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `execute_dynamic_tool(tool, { file_path: source, output_path: output, file_name })` through the wrapper | HTTP 200; no `Missing content` / `Invalid content_base64` in the result |
| 2 | Check the output file | Exists; size **> 0** (compare with the E-6 reference size for drift) |
| 3 | Read the first bytes | Magic signature matches the table (OOXML `PK`, `%PDF`, HTML, JSON) |
| 4 | Parse the response | `output_base64` absent; `file_path` = destination; `size_bytes` === on-disk byte size |
| 5 | Inspect the workspace for stray files | Zero unexplained files (exit criterion) |

---

### SIT-07: Embedded-image DOCX round trip

| Field | Value |
|-------|-------|
| **ID** | SIT-07 |
| **Priority** | High |
| **Level / Type** | SIT — live, content fidelity (manual + harness variant) |
| **Requirement** | STORY 1 (AC-1.5) · UC-01 · Evidence E-5 · TD-02 |
| **Preconditions** | SIT-11 PASS; fixture present in the repo |
| **Test data** | TD-02 — `documents/SA4E-375/UG-embedded.md` (**184,761 B**, embedded base64 images); reference output **265,062 B** DOCX |
| **Automation** | Manual execution with the harness exporter call; artifacts inspected in an Office renderer (optional, STP §4.2) |
| **Status** | Manual (recorded evidence E-5 exists from the implementation run) |
| **Evidence** | `evidence/SIT-07-embedded-docx.png` + `live-evidence.csv` row |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Export TD-02 through the wrapper to `UG-embedded-out.docx` | Not `isError`; file written |
| 2 | Compare size with the recorded 265,062 B | Same order/scale (recorded value is the comparison anchor, not an exactness assertion across converter versions) |
| 3 | Unzip: list package parts | Valid OOXML: `[Content_Types].xml`, `word/document.xml`, `word/media/*` present |
| 4 | Compare `word/media/*` sizes with the base64 images embedded in TD-02 | Images byte-identical after conversion (decode each embedded base64 and compare lengths) — **no image lost** |
| 5 | Open in Word/LibreOffice (optional) | Document renders; images visible (qualitative usability check, STP §2.4) |

---

### SIT-08: Multi-artifact result writes N distinct files

| Field | Value |
|-------|-------|
| **ID** | SIT-08 |
| **Priority** | High |
| **Level / Type** | SIT — live, multi-output (staged) |
| **Requirement** | STORY 4 (AC-4.1, AC-4.2) · UC-04 full flow · BR-09, BR-15, BR-16 · TD-07 |
| **Preconditions** | Wrapper + backend running; a staged child/tool result with 2 artifacts (test double injected at the backend REST boundary, or an exporter producing multiple files) |
| **Test data** | TD-07 — `report.pdf` (1,967 B) + `data.json` (31 B), both with real bytes |
| **Automation** | Manual/staged (UT-37 and IT cover the deterministic part; this is the live confirmation) |
| **Status** | Manual |
| **Evidence** | `evidence/SIT-08-multi-artifact.png` + directory listing |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Trigger the wrapper-mode call whose backend result carries `outputs[]` with 2 payloads | No `isError` |
| 2 | List the destination directory | Exactly 2 files — `report.pdf` and `data.json` — each non-empty, each with its own name; no name collapse (UC-04 AF-1) |
| 3 | Parse the response | `outputs[]` metadata only (`file_path`, `size_bytes`); **no** `output_base64` anywhere |

---

### SIT-09: Remote path-only child fails loudly end-to-end

| Field | Value |
|-------|-------|
| **ID** | SIT-09 |
| **Priority** | High |
| **Level / Type** | SIT — live, failure path (staged) |
| **Requirement** | STORY 2 (AC-2.2, AC-2.3), STORY 3 (AC-3.4), STORY 7 (AC-7.3) · UC-02 main flow, UC-03 EF-1 · BR-14 · E-03 · TD-06 · RK-01 |
| **Preconditions** | A child stub serving a path-only descriptor (host path that the backend cannot read); wrapper + backend running |
| **Test data** | TD-06 — `{ name: 'UG.docx', path: '/remote/secret/UG.docx' }` with `readResource` unavailable/returning empty |
| **Automation** | Manual/staged (the in-process equivalents already pass: UT-35, IT-05) |
| **Status** | Manual |
| **Evidence** | `evidence/SIT-09-path-only-failure.png` + response payload capture |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Invoke the wrapper-mode call against the path-only stub | `isError === true` |
| 2 | Read the message | Begins `ARTIFACT_FETCH_FAILED`; names `UG.docx` and the server; contains `No file was written.`; lists the three alternatives (MCP resource / http(s) URL / data URI) and the shared-host requirement |
| 3 | Search the entire response payload for `/remote/secret` | **Absent** — no path survives (AC-2.3); this case must **never** be made to pass by accepting a path (STP §12.2) |
| 4 | Check the workspace | Zero files written |

---

### SIT-10: Write confinement and source-read guards (FS_ERROR family)

| Field | Value |
|-------|-------|
| **ID** | SIT-10 |
| **Priority** | High |
| **Level / Type** | SIT — live, security (manual) |
| **Requirement** | STORY 7 (AC-7.4, AC-7.5), STORY 1 (validation) · UC-01 EF-1, EF-2, EF-6 · BR-17 · E-01, E-02, E-07 · NFR-8, NFR-9 · TD-11, TD-12 · RK-13 |
| **Preconditions** | Real wrapper (port 9183 or harness); workspace resolver + symlink guard = **real implementations** (stubbing invalidates this case, STP §4.3) |
| **Test data** | Variant A: `output_path` = `<workspace>/../outside/out.docx` (TD-11); Variant B: destination `link.docx` symlink → outside the workspace (TD-12); Variant C: `file_path` = `../../etc/passwd` / `C:\\Windows\\win.ini` (TD-11); Variant D: source file > 25 MB (created locally, deleted after; not committed) |
| **Automation** | Manual (unit guards already asserted at UT-29/UT-40) |
| **Status** | Manual |
| **Evidence** | `evidence/SIT-10-confinement-<variant>.png` ×4 |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Variant A — export with an escaping `output_path` | `isError`; `PROXY_WRITE_FAILED: <sanitized reason> — no file was written.` (E-07); **no file outside the workspace**; message contains no absolute path |
| 2 | Variant B — symlinked destination | Guard aborts the write; `PROXY_WRITE_FAILED`; the symlink target is never written through |
| 3 | Variant C — traversal `file_path` | `FS_ERROR: Failed to read file <sanitized resolved path>: <sanitized reason>` (E-01); the child is **never invoked**; nothing written |
| 4 | Variant D — source > 25 MB | `FS_ERROR: file too large for proxy pre-read (limit 25 MB): <sanitized path> — attach a smaller file or read a slice.` (E-02); child not invoked |
| 5 | After all variants | Workspace contains zero new files; guards logged the rejections |

---

### SIT-11: Wrapper-build freshness smoke check (runs FIRST)

| Field | Value |
|-------|-------|
| **ID** | SIT-11 |
| **Priority** | High (operational — P1 gate) |
| **Level / Type** | SIT — environment smoke (manual) |
| **Requirement** | STP §12.1 BLOCKER-WRAPPER-RELOAD · BRD R-3 · OI-01 |
| **Preconditions** | Backend running; Kiro window state unknown |
| **Test data** | TD-01 — one tiny markdown export to `<tmp>/smoke.docx` |
| **Automation** | Manual — the check depends on the Kiro host process state, not on code (STP §2.5) |
| **Status** | Manual — currently BLOCKED pending Kiro reload (STP §12.1) |
| **Evidence** | `evidence/SIT-11-wrapper-smoke.png` |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Reload the Kiro window (Ctrl+Shift+P → Reload Window) so port 9183 loads the post-change wrapper | Wrapper process restarted |
| 2 | Export one small DOCX through the wrapper (file_path + output_path only) | **PASS**: file exists with size > 0 → the new build is loaded; proceed to SIT-01..08 |
| 3 | If instead the result is `Missing content: pass file_path so the extension wrapper can inject content_base64…` with **no file created** | **BLOCKED** — the wrapper still runs pre-change code. Record BLOCKED (not FAILED), escalate the reload to DevOps, and exclude SIT-01..08 from the pass-rate denominator only with the recorded justification (STP §12.1) |

---

### 6.1 SIT addendum — cleanup verification (pending implementation OI-14/OI-15)

### SIT-12: Immediate cleanup verified live (E-8)

| Field | Value |
|-------|-------|
| **ID** | SIT-12 |
| **Priority** | Medium |
| **Level / Type** | SIT — live cleanup verification |
| **Requirement** | STORY 3 (RD-7) · BRD §8.3 E-8 · BRD §6 Capacity — local cleanup · OI-14 |
| **Preconditions** | **OI-14 implemented**; wrapper + backend running with a local (stdio) child |
| **Test data** | TD-01 source; a wrapper-mode export whose child returns a host-local artifact path |
| **Automation** | Manual, scripted inspection |
| **Status** | **Pending implementation (OI-14)** |
| **Evidence** | `evidence/SIT-12-immediate-cleanup.png` + stat output |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Wrapper-mode export where the child returns a local path | Response carries `output_base64` (bytes delivered — call succeeds) |
| 2 | `stat` the backend artifact path immediately after | **ENOENT** — the file was deleted after inlining (E-8) |
| 3 | Inspect the backend log | No cleanup warnings; no temporary artifact files remain in the backend workspace after the call |

### SIT-13: Periodic sweep verified live (E-9)

| Field | Value |
|-------|-------|
| **ID** | SIT-13 |
| **Priority** | Medium |
| **Level / Type** | SIT — live cleanup verification |
| **Requirement** | STORY 3 (RD-8) · BRD §8.3 E-9 · BRD §6 Capacity — periodic cleanup · OI-15 |
| **Preconditions** | **OI-15 implemented**; access to the backend scan root and logs; config keys `artifact.cleanup.intervalMs` (default 300,000) / `artifact.cleanup.ttlMs` (default 600,000) / `artifact.cleanup.maxRunMs` (30,000) |
| **Test data** | Orphaned artifacts seeded in the scan root: `export_orphan1.docx` with mtime backdated beyond the TTL; a young `export_fresh.docx` (kept) |
| **Automation** | Manual observation across one sweep interval |
| **Status** | **Pending implementation (OI-15)** |
| **Evidence** | `evidence/SIT-13-sweep-log.png` + sweep log capture |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Simulate an orphan (kill the backend between child artifact write and cleanup, or backdate the mtime) | Orphan exists in the scan root |
| 2 | Wait one sweep interval (default 5 min) past TTL expiry | Orphan **removed** by the sweep (E-9); the young file and non-matching files remain (UT-47 coverage at unit level) |
| 3 | Read the sweep log | `removed ≥ 1, failed = 0` with the summary shape `{ removed, failed, skipped, durationMs }` |
| 4 | Tool-call interference check | No tool call is affected by the sweep running (bounded 30 s, no event-loop blockage) |
---

## 7. Test Data Reference

Fixtures TD-01..TD-13 are defined in STP §10.1 and referenced by every case above. Data rules (STP §10.3): no oversized fixture on disk; concrete values only; deterministic temp locations; no secrets; evidence immutable. The machine-readable CSV files below are declared in STP §10.2 and are to be generated under `documents/SA4E-380/testdata/` when the planned cases are authored — they are the single source of truth for row-level values.

| CSV file (STP §10.2) | Covers these STC cases | Key columns |
|----------------------|------------------------|-------------|
| `testdata/pre-seeded-tools.csv` | UT-01..11, E2E-API-01..07 | tool_name, description, has_content_base64, content_arg, expected_detected, expected_content_param |
| `testdata/export-formats-testdata.csv` | E2E-API-08..13, SIT-01..06 | test_case_id, format, tool_name, source_fixture, expected_magic, expected_min_size, expected_parts |
| `testdata/payload-validation-testdata.csv` | UT-17..21, E2E-API-15..16 | test_case_id, content_base64, args_present, expected_is_error, expected_message_prefix, child_invoked |
| `testdata/artifact-source-testdata.csv` | UT-25..35 | test_case_id, descriptor_json, read_resource_result, fetch_result, expected_resolved, expected_error |
| `testdata/naming-testdata.csv` | UT-22..24, PBT-04 | test_case_id, input_name, mime_type, expected_safe_name |
| `testdata/multi-artifact-testdata.csv` | UT-37, UT-39, IT-01, SIT-08 | test_case_id, outputs_count, output_path_mode, expected_files, expected_error |
| `testdata/write-confinement-testdata.csv` | UT-39, UT-40, SIT-10 | test_case_id, output_path, symlink_target, expected_result, expected_files_written |
| `testdata/live-evidence.csv` | SIT-01..07 | test_case_id, exporter, expected_bytes, observed_bytes, magic, package_parts |

**Concrete fixture values used across cases** (from STP §10.1):

| ID | Fixture | Concrete value | Used by |
|----|---------|----------------|---------|
| TD-01 | Small markdown | `# Hello\n\nWorld.\n` (~20 B) | E2E-API-08..13, SIT-01..06, UT-01/12/17 |
| TD-02 | Embedded-image markdown | `documents/SA4E-375/UG-embedded.md` — 184,761 B | SIT-07 |
| TD-03 | Empty file | 0 B markdown | UT-18 variant, SIT-05 variant |
| TD-04 | Invalid base64 | `!!!not-base64!!!` | UT-19, E2E-API-16 |
| TD-05 | Oversize artifact (metadata only) | `size: 26214401` + mocked `content-length: 26214401` — never a real 25 MB file | PBT-03, UT-28, UT-30 |
| TD-06 | Path-only remote artifact | `{ name: 'UG.docx', path: '/remote/secret/UG.docx' }` + `readResource → null` | UT-35, IT-05, SIT-09 |
| TD-07 | Multi-artifact result | `report.pdf` (1,967 B) + `data.json` (31 B), inline base64 | UT-37, UT-39, SIT-08 |
| TD-08 | Unicode + CRLF markdown | `# Kiểm thử\r\n\r\n😀 emoji — “quotes”\r\n` | PBT-01, SIT-01 variant |
| TD-09 | Wrapper-native tool | `drawio_export_png` declaring its own `content_base64` | UT-03, UT-15, IT-06, IT-07 |
| TD-10 | Non-file tools | `jira_create_issue`, `confluence_create_page`, `mem_ingest` | UT-02, IT-06, IT-07, E2E-API-01 |
| TD-11 | Path traversal | `../../etc/passwd`, `C:\\Windows\\win.ini`, `/etc/hosts` | UT-40, SIT-10 variant C |
| TD-12 | Symlinked destination | `link.docx` → outside the workspace | UT-29, UT-40, SIT-10 variant B |
| TD-13 | Boundary artifact sizes | exactly 26,214,400 (accept) / 26,214,401 (reject), synthetic | PBT-03, UT-30 |

---

## 8. Requirements Traceability Matrix (RTM)

Coverage rule (STP G7): every BRD story and acceptance criterion has at least one case at a level that can observe it; 0 orphan cases — every case ID in this document appears in at least one row.

### 8.1 Stories (7/7 — 100%)

| Requirement | Source | Test cases | Status |
|-------------|--------|------------|--------|
| **STORY 1** — Six-format export through the wrapper (AC-1.1..1.7) | BRD §2.3; FSD §3.1 (UC-01) | PBT-01, PBT-02; UT-01, UT-12..17; UT-22, UT-31, UT-36, UT-42; IT-01, IT-09, IT-10; E2E-API-02..13; SIT-01..07 | ✅ Covered (existing + planned) |
| **STORY 2** — Wrapper mode never returns a bare path (AC-2.1..2.6) | BRD §2.3; FSD §3.2 (UC-02) | PBT-04, PBT-05; UT-17..21; UT-31..35, UT-38; IT-02, IT-03, IT-05, IT-12; E2E-API-11..16; SIT-09 | ✅ Covered |
| **STORY 3** — Remote artifact retrieval (AC-3.1..3.7) | BRD §2.3; FSD §3.3 (UC-03) | PBT-03; UT-25..30; IT-04, IT-05; SIT-09; cleanup addendum UT-44..48, SIT-12..13 (RD-7/RD-8) | ✅ Covered (cleanup rows pending OI-14/15) |
| **STORY 4** — Multi-file completeness (AC-4.1..4.6) | BRD §2.3; FSD §3.4 (UC-04) | PBT-02; UT-23, UT-32, UT-37, UT-39; IT-01; SIT-08 | ✅ Covered |
| **STORY 5** — Zero new tools (AC-5.1..5.6) | BRD §2.3; FSD §3.5 (UC-05) | PBT-05, PBT-06; UT-03, UT-12..16, UT-20, UT-33, UT-41, UT-43; IT-06, IT-07, IT-09, IT-11; E2E-API-01..07, E2E-API-14 | ✅ Covered |
| **STORY 6** — Convention detection + override (AC-6.1..6.7) | BRD §2.3; FSD §3.5 | PBT-06; UT-01..11; IT-06, IT-07, IT-08, IT-11; E2E-API-01 | ✅ Covered |
| **STORY 7** — Fail loud (AC-7.1..7.7) | BRD §2.3; FSD §3.2/§3.7 (UC-02, UC-07) | UT-19, UT-21, UT-34, UT-35, UT-38, UT-39, UT-40; IT-02, IT-05, IT-12; E2E-API-15, E2E-API-16; SIT-09, SIT-10 | ✅ Covered |

### 8.2 Business rules BR-01..BR-22 (22/22 — 100%)

| Rule | FSD §3.8 (essence) | Test cases | Status |
|------|--------------------|------------|--------|
| BR-01 | Wrapper mode = `content_base64` ∨ `output_path` (ownership, not truthiness) | UT-17, UT-18, UT-21, IT-02, E2E-API-15 | ✅ |
| BR-02 | Wrapper-only args stripped before the child call | UT-17, IT-01 | ✅ |
| BR-03 | Content-argument resolution (override → aliases → single-string → never guess) | UT-01, UT-05..11, UT-21 | ✅ |
| BR-04 | Detection precedence (override → prefix → description) | UT-02, UT-04, UT-05, UT-07, PBT-06 | ✅ |
| BR-05 | Already-native tool never adapted | UT-03, IT-07 | ✅ |
| BR-06 | 25 MB cap on all retrieval paths; zero-length = no artifact | PBT-03, UT-28, UT-29, UT-30 (TD-13) | ✅ |
| BR-07 | Retrieval order, first source wins, descriptors before blocks | UT-25, UT-26, UT-28, IT-04 | ✅ |
| BR-08 | Basename-only naming + MIME fallback | PBT-04, UT-22..24 | ✅ |
| BR-09 | Single vs multi shaping; no one-element `outputs[]` | UT-31, UT-32, UT-37 | ✅ |
| BR-10 | Host locations stripped in wrapper mode | UT-31, UT-35, E2E-API-08..13, SIT-09 | ✅ |
| BR-11 | Schema adaptation (markers, required, sentence once, idempotent) | UT-12..16, UT-41, E2E-API-02..07, IT-06, IT-09 | ✅ |
| BR-12 | Direct calls untouched; `isError` short-circuit | UT-20, UT-33, IT-03, E2E-API-14 | ✅ |
| BR-13 | Extension wrapper mode (original args); non-wrapper passthrough | UT-38, IT-10, IT-12 | ✅ |
| BR-14 | Declared artifacts without bytes = hard error (both guards) | UT-35, UT-38, IT-05, IT-12, SIT-09 | ✅ |
| BR-15 | Destination resolution (output_path / suggested name / defaults) | UT-36, UT-37, UT-42, IT-10 | ✅ |
| BR-16 | Write verification (writtenCount == payload count) | UT-36, UT-37, UT-39 | ✅ |
| BR-17 | Workspace resolver + symlink guard on every write | UT-40, SIT-10 | ✅ |
| BR-18 | Child errors pass through untouched | UT-34 | ✅ |
| BR-19 | Detection once per definition, cached | UT-43, IT-06, IT-08, IT-11 | ✅ |
| BR-20 | Zero new tools; discovery unchanged | E2E-API-01, IT-06, PBT-05 | ✅ |
| BR-21 | Transport-agnostic retrieval (stdio vs HTTP child) | UT-26, UT-28, IT-04 | ✅ |
| BR-22 | Unknown URI schemes delegated to `resources/read` | UT-27 | ✅ |

### 8.3 Error contract E-01..E-11 (11/11 — 100%)

| Error | FSD §9.1 trigger | Test cases | Status |
|-------|------------------|------------|--------|
| E-01 `FS_ERROR` | Source missing / outside / symlink | SIT-10 variant C (real wrapper); supporting existing evidence: extension input-proxy suite (E-3) | ✅ |
| E-02 `FS_ERROR` oversize | Source > 25 MB | SIT-10 variant D; existing pre-read-cap evidence (E-3) | ✅ |
| E-03 `ARTIFACT_FETCH_FAILED` (backend) | Declared artifacts, zero bytes | UT-35, IT-05, SIT-09 | ✅ |
| E-04 `ARTIFACT_FETCH_FAILED` (extension) | Metadata without payload | UT-38, IT-12 | ✅ |
| E-05 `PROXY_WRITE_FAILED` (zero) | Zero files written | UT-39 variant A, SIT-10 variant A | ✅ |
| E-06 `PROXY_WRITE_FAILED` (X/Y) | Partial write | UT-39 variant B | ✅ |
| E-07 `PROXY_WRITE_FAILED` (exception) | Guard / permission / disk | UT-40, SIT-10 variants A/B | ✅ |
| E-08 Missing content | Wrapper mode, no payload | UT-21, IT-02, E2E-API-15 | ✅ |
| E-09 `Invalid content_base64 payload.` | Malformed base64 | UT-19, E2E-API-16 | ✅ |
| E-10 Child error pass-through | Child `isError` | UT-34 (BR-18) | ✅ |
| E-11 Server disconnected | Child not connected | Propagated health message (TDD §6); covered by the platform health suite — out of this ticket's change surface; noted, no dedicated case | ⚠️ Noted (pre-existing) |

### 8.4 Non-functional requirements (16/16 traced — per STP §11)

| NFR | Requirement | Cases | Status |
|-----|-------------|-------|--------|
| NFR-1 | 0 < size ≤ 25 MB, single shared constant | PBT-03, UT-28, UT-30 (TD-13) | ✅ |
| NFR-2 | HTTP ≤ 30 s, redirects, declared oversize rejected pre-download | UT-28 | ✅ |
| NFR-3 | Local size-check before read | UT-29 | ✅ |
| NFR-4 | Direct calls incur no artifact work | UT-20, UT-33, IT-03, E2E-API-14 | ✅ |
| NFR-5 | Strict base64 + UTF-8 input validation | PBT-01, UT-19, E2E-API-16 | ✅ |
| NFR-6 | Non-zero size; written count == payload count | UT-36..39, SIT-08 | ✅ |
| NFR-7 | No absolute host path in responses/errors | PBT-04, UT-22, UT-35, E2E-API-08..13, SIT-09 | ✅ |
| NFR-8 | Local read: regular files only, symlinks refused | UT-29, SIT-10 | ✅ |
| NFR-9 | Write confined to workspace + symlink guard | UT-40, SIT-10 | ✅ |
| NFR-10 | No credential-like argument treated as content | UT-09, UT-10 | ✅ |
| NFR-11 | Determinism (fixed retrieval order) | PBT-02, UT-25 | ✅ |
| NFR-12 | Observable failures, stable code prefixes | UT-19, UT-35, UT-38, UT-39, E2E-API-15, E2E-API-16 | ✅ |
| NFR-13 | Zero new tools; discovery unchanged | E2E-API-01..07 | ✅ |
| NFR-14 | Direct mode keeps pre-change behaviour | UT-20, UT-33, IT-03, E2E-API-14 | ✅ |
| NFR-15 | Transport portability | UT-25..28, IT-04 | ✅ |
| NFR-16 | Platform portability (Windows/UNC/POSIX) | UT-27, UT-29 | ✅ |

### 8.5 Cleanup requirements — BRD additions (pending implementation)

| Requirement | Source | Test cases | Status |
|-------------|--------|------------|--------|
| **E-8** — Immediate local cleanup: artifact file deleted after inlining; failure logs a warning and never fails the call; resource/URL artifacts never deleted | BRD §8.3 E-8, §1.2 #9, §6; TDD §9.1 (OI-14); FSD §11.6 | UT-44, UT-45, UT-46; SIT-12 | ⛔ **Pending implementation (OI-14)** — cases specified, execution blocked until DEV delivers |
| **E-9** — Periodic cleanup sweep: orphaned artifact files older than TTL removed within one interval; young/non-matching kept; bounded 30 s; `enabled: false` disables; basenames-only failure log | BRD §8.3 E-9, §6; TDD §9.2 (OI-15) | UT-47, UT-48; SIT-13 | ⛔ **Pending implementation (OI-15)** |

### 8.6 Coverage summary

| Category | Total | Covered | Coverage % |
|----------|-------|---------|------------|
| Use Cases (UC-01..UC-07) | 7 | 7 | 100% |
| Business Rules (BR-01..BR-22) | 22 | 22 | 100% |
| Acceptance Criteria (46 ACs across 7 stories) | 46 | 46 | 100% |
| Error contract codes (E-01..E-11) | 11 | 10 ✅ + 1 noted | 100% (E-11 pre-existing) |
| NFRs | 16 | 16 | 100% |
| Cleanup additions (E-8/E-9) | 2 | 2 specified | Cases pending OI-14/OI-15 |
| **Overall (STP 88 + addendum 7)** | **95** | **95** | **100% planned** |

> **Honesty note.** "Covered" in this STC means *a specified case traces to the requirement* — not that the case has passed. 31 of the 88 STP-allocated case IDs are backed by existing passing tests (35 test functions, see §9); the remaining 57 are planned; the 7 addendum cases are pending implementation (OI-14/OI-15). No result is claimed for planned or pending cases.
---

## 9. Known Unrelated Failures and Out-of-Scope Notes

### 9.1 KNOWN-TEST-FAILURE — `ProjectIsolation.derive-project-id.test.ts` UT-11 (no fix case created)

| Attribute | Value |
|-----------|-------|
| Failure | UT-11 fails on a Windows root path (deterministic on Windows) |
| Relationship to SA4E-380 | **None** — pre-existing, unrelated to the content proxy |
| Decision | Deliberately **not fixed** in this ticket (BRD §1.2 #6, R-8; STP §12.3) to keep the change surface minimal |
| Handling in this STC | **No test case is created for it and no fix is requested.** It is whitelisted at gate G5: counted neither as a pass nor as a blocker. The backend full suite remains **3,493 pass with this one known unrelated failure** (E-2) |
| Reporting obligation | The test report must list it **by name** so the whitelist stays visible — never silently absorbed |

### 9.2 Documented implementation deviations — recorded, no case pins the non-conformant behaviour

| Item | FSD/TDD reference | Why no STC case |
|------|-------------------|-----------------|
| Valid-base64 payload decoding to non-UTF-8 bytes is converted to U+FFFD instead of rejected | UC-07 EF-1, OI-03 | The BRD wording is stricter than the implementation. A case would pin the deviation as correct behaviour; the gap is tracked as OI-03 for a future fix. UT-19 already rejects malformed base64 (the as-built contract) |
| Payload decoding to an **empty string** is accepted (child receives an empty document) | UC-07 EF-2, OI-03 | Same family as OI-03; the empty-string guard applies to the encoded value only. Recorded, not pinned |
| Invocation-side payload has no explicit post-decode 25 MB check | UC-07 EF-3, OI-09 | The practical limit is the wrapper's 25 MB pre-read cap (SIT-10 variant D); the backend-side check is a follow-up |
| Two artifacts with the same suggested name: the second write overwrites the first; the count check still passes | UC-04 AF-5, OI-08 | Accepted risk recorded in the FSD; child names are normally distinct. A collision case would assert the accepted-risk behaviour |
| Wrapper argument sent to an adapted tool with **no detectable content argument** is forwarded rather than rejected | UC-07 AF-2, OI-04 | BRD expected a rejection; implementation forwards. Tracked as OI-04 — configuration errors stay visible rather than being silently corrected |

### 9.3 Explicitly out of scope (per STP §3.2 — no case may be created)

Modifying the `markdown-exporter` child; adding any tool to `tools/list`; UI/Playwright work; `ARTIFACT_PATH_MAP`; deployment/CI changes; fixing the UT-11 failure above; load/stress testing; child-server auth changes; third-party Office renderer pixel fidelity; Jira DOCX attachment (blocked by SIT-11).

---

## 10. Existing Test Code → STC Case Mapping

35 existing test functions (all passing in the recorded runs E-1..E-4) back 31 of the case IDs in this document. This table is the audit trail between the STC and the repository.

| Test file (repository) | Tests | STC case IDs | Evidence |
|------------------------|-------|--------------|----------|
| `backend/src/modules/orchestration/content-proxy/__tests__/content-proxy.test.ts` | 12 | UT-01, UT-02, UT-03, UT-04, UT-12, UT-17, UT-19, UT-20, UT-21, UT-31, UT-32, UT-33 | E-1 |
| `backend/src/modules/orchestration/content-proxy/__tests__/content-proxy.remote.test.ts` | 4 | UT-26 (×2 tests: resource-via-uri + inline blob), UT-28 (success path), UT-35 | E-1 |
| `backend/src/modules/orchestration/__tests__/McpClientManager.content-proxy.test.ts` | 5 | IT-01, IT-02, IT-03, IT-04, IT-05 | E-1 |
| `extension/src/__tests__/base64-proxy.dynamic-catalog.test.ts` | 4 | UT-41, UT-43 (×2 tests: detect-from-catalog + registerTools-additive), UT-37 | E-3 |
| `extension/src/__tests__/wrapper-server.dynamic-export.test.ts` | 4 | IT-09, IT-10, IT-11, IT-12 | E-3 |
| `extension/src/__tests__/live-content-proxy.test.ts` (`LIVE_BACKEND=1`) | 6 (1 `it.each` × 6 exporters) | SIT-01..06 | E-4 |
| `extension/src/__tests__/backend-local-tools.base64-proxy.test.ts` (supplementary) | input/output proxy basics | Supports UT-36, SIT-10 variants C/D (FSD §10.4 mapping: proxyInput missing file, proxyOutput write, schema rewrite) | E-3 |
| **Subtotal** | **35** | **31 case IDs** | |

**Planned additions to author (57 case IDs):** PBT-01..06; UT-05..11, UT-13..16, UT-18, UT-22..25, UT-27, UT-29, UT-30, UT-34, UT-38..40, UT-42; IT-06..08; E2E-API-01..16. **Pending implementation (7):** UT-44..48, SIT-12, SIT-13 (OI-14/OI-15).

---

## 11. Execution Commands

| Level | Command | Gate |
|-------|---------|------|
| PBT + UT (backend) | `cd backend && npx vitest run src/modules/orchestration/content-proxy` | G1, G2 |
| IT (backend wiring) | `cd backend && npx vitest run src/modules/orchestration/__tests__/McpClientManager.content-proxy.test.ts` (+ the planned registry spec) | G3 |
| Full backend regression | `cd backend && npm test` — expect 3,493 pass + the whitelisted UT-11 failure (§9.1) | G5 |
| E2E-API | Start backend (`npm run dev`) + child; `npm run test:e2e-api` (or the planned e2e-api specs) | G4 |
| UT/IT (extension) | `cd extension && npx vitest run src/__tests__/wrapper-server.dynamic-export.test.ts src/__tests__/base64-proxy.dynamic-catalog.test.ts` | G3 |
| Full extension regression | `cd extension && npm test` — expect 3,255 pass / 6 skipped | G5 |
| SIT-01..06 (live harness) | `cd extension; $env:LIVE_BACKEND='1'; npx vitest run src/__tests__/live-content-proxy.test.ts` — **only after SIT-11 passes** | G6 |
| SIT-07..13 | Manual — steps above; evidence into `documents/SA4E-380/evidence/` | G6 |
| Cleanup addendum | Blocked until OI-14/OI-15 are implemented; re-check TDD §9 test list before authoring UT-44..48 | — |

---

## 12. Review Gate, Sign-Off and Document Control

### 12.1 BA review gate (STP §13.4)

This STC is **not complete** until the BA Agent returns **APPROVED** against the five gate dimensions: business coverage (7/7 stories + all ACs), business-rule semantics (BR-01..BR-22 + the E-xx contract), edge/failure behaviour (path-only, partial write, invalid payload — §8.3), scope discipline (nothing outside BRD §3.2/STP §3.2 — §9.3), and evidence integrity (§10 quotes only recorded runs). CHANGES REQUESTED → each gap is treated as a defect, the RTM is corrected back to 100%, and the document is resubmitted (max 2 iterations, then escalate to the SM).

### 12.2 Exit criteria linkage (STP §2.6)

1. 88/88 STP cases + 7 addendum cases executed or justified BLOCKED (SIT-11 reload) — no BLOCKED requirement-level case without an environment record.
2. Pass rate ≥ 95% of executed; **0 Critical / 0 High** defects open.
3. No silent-corruption path remains: every wrapper-mode failure yields `ARTIFACT_FETCH_FAILED` or `PROXY_WRITE_FAILED`.
4. Zero new tool names attributable to the change (E2E-API-01).
5. RTM 100% for the seven BRD stories (§8.1).
6. `ProjectIsolation` UT-11 whitelisted by name in the test report (§9.1).

### 12.3 Document control

| Item | Value |
|------|-------|
| Source of truth | BRD v1.0 (requirements), FSD (UC/BR/E-xx), TDD (module map §2, error contract §6, cleanup §9), STP v1.0 §13.2 (numbering), as-built code (behaviour) |
| Scope of this document | Test cases only — no code, no test code authored, no suite re-run |
| Machine-readable data | `documents/SA4E-380/testdata/*.csv` (declared in STP §10.2; generated with the planned-case authoring) |
| Evidence target | `documents/SA4E-380/evidence/` (created at execution; STP §4.1) |
| Explicitly not done | Jira attachment, `STATUS.json` update, DOCX/XLSX export of this document (owned by SM/DevOps) |

---

## Sign-Off

| Name | Signature and date |
|------|--------------------|
| QA Agent (author) | ☐ |
| BA Agent (review gate — APPROVED required) | ☐ |
| Duc Nguyen Minh (Product Owner) | ☐ |

*End of document.*
