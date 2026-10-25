# Software Test Cases (STC) — Deferred Register

## SDLC Agents 4 Enterprise — SA4E-384: Deferred test cases for SA4E-380 (52 planned-not-authored specs)

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-384 |
| Title | Deferred test case register for SA4E-380 — 52 planned specs (PBT 6, UT 24, IT 3, E2E-API 16, SIT 3) |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-10-24 |
| Status | Deferred register — v1.0, no execution claimed in this document |
| Document Type | Software Test Cases (STC) — deferred register (Phase 4b automation follow-up) |
| Source STC | `documents/SA4E-380/STC.md` — v1.0, 95 cases (43 executed ✅ PASS + 52 ⏸ DEFERRED) |
| Source report | `documents/SA4E-380/TEST-REPORT.md` §4 (per-case deferral reasons) + §9 (automation follow-up) |
| Related documents | SA4E-380 BRD.md, FSD.md, TDD.md; STP.md §10 (fixtures), §13.2 (case allocation) |
| Test data | Fixtures TD-01..TD-13 (SA4E-380 STP §10.1); CSV files per STP §10.2 |

> **Document nature.** This STC **re-registers, with full case detail**, the **52 cases** that SA4E-380 recorded as **DEFERRED (planned-not-executed)** in TEST-REPORT §4.8 — their dedicated automated specs were planned in STC Phase 4b but not authored in that release. This document claims **no execution result**: every case below is a specification ready for authoring and execution during the automation follow-up (SA4E-380 TEST-REPORT §9; RUN-LOG #28).
>
> **Not in this register.** The OI-14/OI-15 cleanup cases (UT-44..48, SIT-12..13) are **already executed ✅ PASS** on the current build (SA4E-380 TEST-REPORT §5.2/§5.3; evidence R-2/R-5/R-6) and are **not** part of the 52-deferred set.

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-24 | QA Agent | Initiate — re-register the 52 DEFERRED cases from SA4E-380 STC with full case detail, per-case deferral reason class and substitute evidence; traceability to SA4E-380 TEST-REPORT §4/§9 |

---

## 1. Deferral Context

### 1.1 Why these 52 cases are deferred

SA4E-380 (Content Proxy for child MCP tools) documented **95 test cases** across 6 levels. Of these, **43 were executed ✅ PASS (43/43 = 100%)** and **52 were ⏸ DEFERRED (planned-not-executed)**: their dedicated automated specs were planned in STC Phase 4b but **not authored in that release**. No case was silently skipped — every deferred row carries a **reason class** and **substitute evidence** (SA4E-380 TEST-REPORT §4.8).

SA4E-380 count summary (source of the 52):

| Level | Total | PASS | DEFERRED | FAIL | BLOCKED |
|-------|-------|------|----------|------|---------|
| PBT | 6 | 0 | 6 | 0 | 0 |
| UT | 48 | 24 | 24 | 0 | 0 |
| IT | 12 | 9 | 3 | 0 | 0 |
| E2E-API | 16 | 0 | 16 | 0 | 0 |
| E2E-UI | 0 | N/A | N/A | N/A | N/A |
| SIT | 13 | 10 | 3 | 0 | 0 |
| **Total** | **95** | **43** | **52** | **0** | **0** |

### 1.2 Reason classes (per SA4E-380 TEST-REPORT §4.1)

| Reason class | Meaning |
|--------------|---------|
| **covered-by-suite** | The same behaviour is pinned by a passing test at another level/boundary — a substitute exists, but this spec must still be authored to pin the exact surface |
| **live-covered / live-observed** | The scenario was verified in a live run (R-4/R-5/R-8 captures) — the dedicated assertion is still missing |
| **code-verified** | Verified by the Phase 5.7 code audit (literals/guards present in code); **no executed test pins them** — priority follow-up |
| **scope** | Inert in the SA4E-380 release (e.g. the empty `CONTENT_PROXY_OVERRIDES` table) — author only when the feature is activated |
| **planned-not-authored** (plain "—") | No substitute; the spec must be authored |

### 1.3 Blocking OI items — resolved

The two design obligations behind the BRD cleanup requirements — **OI-14 (immediate local cleanup)** and **OI-15 (periodic sweep)** — are **implemented and verified live** on the current build (SA4E-380 TEST-REPORT §5.2/§5.3: SIT-12 → DOCX 14,243 B delivered then `stat` ENOENT; SIT-13 → 485 orphan files drained to 0 in one sweep tick; unit corroboration UT-44..48 green). Their cases are **not part of this register** — the 52 cases below remain deferred for authoring reasons unrelated to OI-14/OI-15.

### 1.4 Entry criteria to execute this register

1. Automation follow-up scheduled; priority order per §10.2 (E2E-API-01 baseline diff → UT-39/UT-40/UT-38 literals → PBT harness → registry IT-06..08 → remaining UT edge cases → SIT-08..10 staging).
2. Environment per level: backend workspace for PBT/UT; in-process fake MCP client for IT; backend + real child for E2E-API; live wrapper (port 9183) + backend + staged stubs for SIT.
3. Fixtures TD-01..TD-13 available/generated per SA4E-380 STP §10: no oversized fixture on disk (synthetic metadata only); deterministic temp locations (`os.tmpdir()/content-proxy-*`); no secrets; evidence immutable.
4. Cases are executed **only** with their dedicated spec authored — a deferred case is never "made to pass" by accepting a path or a substitute (SA4E-380 STP §12.2).

---

## 2. Test Case Summary — 52 cases

| Level | IDs | Count | Reason-class split | Automation |
|-------|-----|-------|--------------------|------------|
| PBT | PBT-01..06 | 6 | substitute evidence only — randomised harness not authored | 6 automated (fast-check, ≥100 runs) |
| UT | UT-05..42 | 24 | scope ×3 · covered-by-suite ×7 · live-covered/observed ×3 · code-verified ×2 · plain ×9 | 24 automated |
| IT | IT-06..08 | 3 | registry exercised indirectly (R-2); dedicated specs not authored | 3 automated |
| E2E-API | E2E-API-01..16 | 16 | live-substituted where applicable (R-4/R-8) | 16 automated |
| E2E-UI | — | 0 | N/A — no browser surface (§7) | — |
| SIT | SIT-08..10 | 3 | covered-by-suite ×2 · code-verified ×1 (live staging not performed) | manual / staged |
| **Total** | | **52** | every case carries reason class + substitute evidence | |

UT deferred set (24): UT-05, UT-06, UT-07, UT-08, UT-09, UT-10, UT-11, UT-13, UT-14, UT-15, UT-16, UT-18, UT-22, UT-23, UT-24, UT-25, UT-27, UT-29, UT-30, UT-34, UT-38, UT-39, UT-40, UT-42.

---

## 3. Property-Based Tests (PBT) — 6 cases

Environment: backend workspace, no server, no filesystem writes outside `os.tmpdir()/content-proxy-*`. Framework: `fast-check ^4.9.0` + vitest. All six properties target `backend/src/modules/orchestration/content-proxy/__tests__/content-proxy.pbt.test.ts`. Exit criteria (SA4E-380 STP G1): 6/6 properties pass with ≥100 runs each; every shrunk counter-example is frozen as a UT regression case before the property is considered green.

### PBT-01: Base64 round trip — decoded content equals source text for arbitrary UTF-8

| Field | Value |
|-------|-------|
| **ID** | PBT-01 |
| **Priority** | High |
| **Level / Type** | PBT — correctness property (automated) |
| **Requirement** | STORY 1 (AC-1.2), STORY 7 (AC-7.2) · UC-01 step 6, UC-07 Flow B · BR-02, BR-03 · NFR-5 · E-09 context |
| **Preconditions** | `detectCapability(EXPORT_DOCX)` returns `{ contentParam: 'markdown', fileOutput: true }`; `adaptInvocation` importable as a pure function |
| **Test data** | fast-check Unicode string generator (covers TD-08: `# Kiểm thử\r\n\r\n😀 emoji — "quotes"\r\n` shapes); payload = `Buffer.from(text).toString('base64')` |
| **Automation** | `content-proxy.pbt.test.ts` — planned |
| **Status** | ⏸ Deferred (planned spec not authored) |
| **Deferral reason** | planned-not-authored — deterministic round trip pinned by UT-17 + UT-19 (passing), but the randomised harness is missing |
| **Substitute evidence (SA4E-380)** | R-2 — TEST-REPORT §4.2 |
| **Evidence (to capture)** | `evidence/PBT-01-roundtrip.txt` |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | For 100+ generated `text` values, call `adaptInvocation(cap, { content_base64: base64(text) })` | `invocation.error` undefined; `invocation.wrapperMode === true` |
| 2 | Read `invocation.args['markdown']` (the `x-content-param` target) | Value **===** the generated `text`, byte-for-byte after UTF-8 decode |
| 3 | Inspect `invocation.args` keys | `content_base64`, `output_path`, `file_path` absent (stripped) |

**Expected result:** property holds for all runs; no counter-example retained. **Postconditions:** none (pure function).

### PBT-02: Byte fidelity — inline → base64 → decode returns identical bytes

| Field | Value |
|-------|-------|
| **ID** | PBT-02 |
| **Priority** | High |
| **Level / Type** | PBT — correctness property (automated) |
| **Requirement** | STORY 1 (AC-1.2), STORY 4 (AC-4.1) · UC-01 step 9, UC-04 step 2 · BR-06, BR-09 · NFR-11 (determinism) |
| **Preconditions** | `adaptResult` callable with a constructed child result; temp dir available |
| **Test data** | fast-check `uint8array` generator (1 B..64 KB buffers); artifact descriptor `{ name: 'pbt.bin', path: <temp file with the generated bytes> }` |
| **Automation** | `content-proxy.pbt.test.ts` — planned |
| **Status** | ⏸ Deferred (planned spec not authored) |
| **Deferral reason** | planned-not-authored — byte fidelity pinned by UT-31 + IT-01/IT-04 (passing); randomised harness not authored |
| **Substitute evidence (SA4E-380)** | R-2 — TEST-REPORT §4.2 |
| **Evidence (to capture)** | `evidence/PBT-02-byte-fidelity.txt` |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Write the generated buffer to a temp file; build a wrapper-mode invocation (`content_base64` present) | Invocation valid |
| 2 | `adaptResult` the child result declaring the artifact | Parsed `output_base64` defined |
| 3 | Decode `output_base64` and compare with the generated buffer | **Byte-identical** (same length, same bytes) — proving base64 inflates but never corrupts |

**Expected result:** property holds; same input always yields same bytes (retrieval order fixed, NFR-11).

### PBT-03: Size cap — inline resolver accepts only 0 < length ≤ 26,214,400 bytes

| Field | Value |
|-------|-------|
| **ID** | PBT-03 |
| **Priority** | High |
| **Level / Type** | PBT — correctness property (automated) |
| **Requirement** | STORY 3 (AC-3.6) · UC-03 AF-1/EF-3/EF-4 · BR-06 · NFR-1 · TD-05, TD-13 |
| **Preconditions** | `artifact-source.fromBase64` (or the inline branch of `resolveArtifact`) importable; no 25 MB fixture is ever materialised (STP TR-2) |
| **Test data** | Declared sizes generated as **metadata**: `size` values around the boundary `26214400` (accept) and `26214401` (reject); buffers synthesised via mocked streams for sub-cap sizes |
| **Automation** | `content-proxy.pbt.test.ts` — planned |
| **Status** | ⏸ Deferred (planned spec not authored) |
| **Deferral reason** | planned-not-authored — cap enforced by shared `MAX_ARTIFACT_BYTES`; oversize refusal exercised by UT-45 step 2 (26 MB file never read/deleted); randomised boundary harness not authored |
| **Substitute evidence (SA4E-380)** | R-2 (partial) — TEST-REPORT §4.2 |
| **Evidence (to capture)** | `evidence/PBT-03-size-cap.txt` |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | For generated sizes in (0, 26,214,400], resolve an inline payload of that declared size | Non-empty buffer returned; length === declared size |
| 2 | For `size = 0` (empty/whitespace base64) | Resolves to "no artifact" (`null`) — never a 0-byte payload (BR-06) |
| 3 | For `size = 26,214,401` and above (declared `content-length` / descriptor size) | Source treated as unusable → `ARTIFACT_FETCH_FAILED` path; **nothing buffered to disk** |

**Expected result:** the cap is inclusive at 25 MB and exact — no truncated buffer is ever returned (RK-03).

### PBT-04: Name safety — `safeName` never emits a path fragment

| Field | Value |
|-------|-------|
| **ID** | PBT-04 |
| **Priority** | High |
| **Level / Type** | PBT — correctness property (automated) |
| **Requirement** | STORY 1 (AC-1.6), STORY 2 (AC-2.3) · UC-01 step 9 · BR-08, BR-10 · NFR-7 · naming-testdata.csv |
| **Preconditions** | `artifact-name.safeName` importable |
| **Test data** | fast-check strings mixed with hostile seeds: `/srv/secret/UG.docx`, `C:\\x\\y.docx`, `../etc/passwd`, `a?token=1`, `b#frag`, `.`, `..`, `''` |
| **Automation** | `content-proxy.pbt.test.ts` — planned |
| **Status** | ⏸ Deferred (planned spec not authored) |
| **Deferral reason** | live-observed — name safety observed correct in every live export (artifact names in responses match expectations); property harness not authored |
| **Substitute evidence (SA4E-380)** | R-4/R-5/R-8 (observed) — TEST-REPORT §4.2 |
| **Evidence (to capture)** | `evidence/PBT-04-name-safety.txt` |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | For 100+ generated/seeded inputs, call `safeName(value)` | Result (when non-null) contains **no** `/` and **no** `\` |
| 2 | Assert the never-set | Result is never `.`, never `..`, never empty string |
| 3 | Call `safeName(safeName(x))` | Idempotent — second call returns the same value |

**Expected result:** property holds; a path fragment never leaves the component (RK-02).

### PBT-05: Schema invariant — adaptation keeps the schema callable and self-describing

| Field | Value |
|-------|-------|
| **ID** | PBT-05 |
| **Priority** | High |
| **Level / Type** | PBT — correctness property (automated) |
| **Requirement** | STORY 5 (AC-5.3, AC-5.4), STORY 2 (AC-2.1) · UC-05 main flow · BR-11, BR-20 · NFR-13 |
| **Preconditions** | `adaptToolDefinition` importable; tool definitions generated with a content alias and arbitrary `required` orders |
| **Test data** | Generated schemas (properties including `markdown`/`content`/`text` aliases, 0..3 other required entries) |
| **Automation** | `content-proxy.pbt.test.ts` — planned |
| **Status** | ⏸ Deferred (planned spec not authored) |
| **Deferral reason** | planned-not-authored — invariants pinned by UT-12 (markers, `required` rewrite) + live catalogue captures; randomised schema harness not authored |
| **Substitute evidence (SA4E-380)** | R-2/R-8 (substitute) — TEST-REPORT §4.2 |
| **Evidence (to capture)** | `evidence/PBT-05-schema-invariant.txt` |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Adapt 100+ generated definitions; locate the resolved content argument | Content argument **never** appears in `required` after adaptation |
| 2 | Read `x-content-param` | Always names a property that exists in `properties` |
| 3 | Count occurrences of `output_base64` in `description` | Appears **at most once** (marker sentence idempotent) |
| 4 | Verify tool `name` | Unchanged — adaptation never renames (BR-20) |

**Expected result:** property holds for all generated schemas.

### PBT-06: Detection monotonicity — every convention-matching name is a file producer unless exempted

| Field | Value |
|-------|-------|
| **ID** | PBT-06 |
| **Priority** | Medium |
| **Level / Type** | PBT — correctness property (automated) |
| **Requirement** | STORY 6 (AC-6.1, AC-6.7) · UC-05 main flow · BR-04, BR-05 |
| **Preconditions** | `detectCapability` importable; `CONTENT_PROXY_OVERRIDES` reachable for the exemption branches |
| **Test data** | Generated names with `export_`/`render_`/`generate_` prefixes + random suffixes; paired variants declaring `content_base64` (TD-09) or disabled via override |
| **Automation** | `content-proxy.pbt.test.ts` — planned |
| **Status** | ⏸ Deferred (planned spec not authored) |
| **Deferral reason** | planned-not-authored — detection pinned by UT-01..04 (passing); all six real exporters detected and adapted live (R-4); randomised name harness not authored |
| **Substitute evidence (SA4E-380)** | R-2/R-4 (substitute) — TEST-REPORT §4.2 |
| **Evidence (to capture)** | `evidence/PBT-06-detection-monotonic.txt` |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | For each generated prefixed name (plain tool) | `detectCapability` returns non-null with `fileOutput: true` |
| 2 | Same name but schema already declares `content_base64` | Returns `null` (BR-05 beats BR-04) |
| 3 | Same name with override `{ enabled: false }` | Returns `null` (BR-04 first clause) |

**Expected result:** property holds — the prefix gate is monotonic and its two exemptions are exact.

---

## 4. Unit Tests (UT) — 24 cases

Environment: backend `backend/src/modules/orchestration/content-proxy/__tests__/` and `backend/src/config/` + extension `extension/src/__tests__/`. Filesystem effects confined to `os.tmpdir()/content-proxy-*`. Exit criteria (SA4E-380 STP G2): all UT cases pass; every error code asserted by exact prefix.

### 4.1 Capability detection and overrides (`detect.ts`)

### UT-05: Override `enabled: false` disables adaptation entirely

| Field | Value |
|-------|-------|
| **ID** | UT-05 |
| **Priority** | Medium |
| **Level / Type** | UT — override behaviour (automated) |
| **Requirement** | STORY 6 (AC-6.4) · UC-05 AF-3 · BR-04 |
| **Preconditions** | `CONTENT_PROXY_OVERRIDES` seeded with `{ export_docx: { enabled: false } }` (test-local, restored after) |
| **Test data** | TD-01 fixture + override row |
| **Automation** | `content-proxy.test.ts` (new describe "overrides") — planned |
| **Status** | ⏸ Deferred (planned spec not authored) |
| **Deferral reason** | scope — `CONTENT_PROXY_OVERRIDES` ships empty (inert this release); no override in the acceptance set. Author when the feature is activated |
| **Substitute evidence (SA4E-380)** | TEST-REPORT §4.3 (scope) |
| **Evidence (to capture)** | `evidence/UT-05-override-disabled.txt` |

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
| **Automation** | `content-proxy.test.ts` — planned |
| **Status** | ⏸ Deferred (planned spec not authored) |
| **Deferral reason** | scope — same empty-overrides table as UT-05 |
| **Substitute evidence (SA4E-380)** | TEST-REPORT §4.3 (scope) |
| **Evidence (to capture)** | `evidence/UT-06-override-contentparam.txt` |

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
| **Automation** | `content-proxy.test.ts` — planned |
| **Status** | ⏸ Deferred (planned spec not authored) |
| **Deferral reason** | scope — same empty-overrides table as UT-05 |
| **Substitute evidence (SA4E-380)** | TEST-REPORT §4.3 (scope) |
| **Evidence (to capture)** | `evidence/UT-07-override-fileoutput.txt` |

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
| **Automation** | `content-proxy.test.ts` — planned |
| **Status** | ⏸ Deferred (planned spec not authored) |
| **Deferral reason** | covered-by-suite (partial) — `markdown` resolution pinned by UT-01; multi-alias ordering not individually pinned |
| **Substitute evidence (SA4E-380)** | R-2 — TEST-REPORT §4.3 |
| **Evidence (to capture)** | `evidence/UT-08-alias-priority.txt` |

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
| **Automation** | `content-proxy.test.ts` — planned |
| **Status** | ⏸ Deferred (planned spec not authored) |
| **Deferral reason** | planned-not-authored — single-string fallback + `NON_CONTENT_PARAM` exclusions not individually pinned |
| **Substitute evidence (SA4E-380)** | none — TEST-REPORT §4.3 |
| **Evidence (to capture)** | `evidence/UT-09-fallback-exclusions.txt` |

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
| **Automation** | `content-proxy.test.ts` — planned |
| **Status** | ⏸ Deferred (planned spec not authored) |
| **Deferral reason** | planned-not-authored — ambiguity / non-string exclusion not individually pinned (SA-07 records regex gaps on this surface) |
| **Substitute evidence (SA4E-380)** | none — TEST-REPORT §4.3 |
| **Evidence (to capture)** | `evidence/UT-10-ambiguity.txt` |

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
| **Automation** | `content-proxy.test.ts` — planned |
| **Status** | ⏸ Deferred (planned spec not authored) |
| **Deferral reason** | live-covered (partial) — real exporters publish `anyOf` schemas (R-8 capture) and all six were detected/adapted live (R-4); dedicated assertion not authored. ⚠️ Distinct from the whitelisted ProjectIsolation failure that STP §12.3 also labels "UT-11" |
| **Substitute evidence (SA4E-380)** | R-8/R-4 — TEST-REPORT §4.3 |
| **Evidence (to capture)** | `evidence/UT-11-anyof-union.txt` |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `detectContentParam` on the union schema | Content argument still found — the union is treated as string-like |

---

### 4.2 Schema adaptation (`schema-adapter.ts`)

### UT-13: `x-content-param` names an existing property; injection description warns the LLM

| Field | Value |
|-------|-------|
| **ID** | UT-13 |
| **Priority** | Medium |
| **Level / Type** | UT — schema detail (automated) |
| **Requirement** | STORY 5 (AC-5.3) · UC-05 · BR-11 |
| **Preconditions** | Adapted definition from UT-12 |
| **Test data** | TD-01 |
| **Automation** | `content-proxy.test.ts` — planned (refinement of the existing combined assertion) |
| **Status** | ⏸ Deferred (planned spec not authored) |
| **Deferral reason** | covered-by-suite (partial) — markers pinned by UT-12 + live capture; refinement not authored |
| **Substitute evidence (SA4E-380)** | R-2/R-8 — TEST-REPORT §4.3 |
| **Evidence (to capture)** | `evidence/UT-13-content-param-target.txt` |

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
| **Automation** | `content-proxy.test.ts` — planned |
| **Status** | ⏸ Deferred (planned spec not authored) |
| **Deferral reason** | covered-by-suite (partial) — removal pinned by UT-12; order preservation not asserted |
| **Substitute evidence (SA4E-380)** | R-2 — TEST-REPORT §4.3 |
| **Evidence (to capture)** | `evidence/UT-14-required-order.txt` |

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
| **Automation** | `content-proxy.test.ts` — planned |
| **Status** | ⏸ Deferred (planned spec not authored) |
| **Deferral reason** | planned-not-authored — marker-sentence idempotence (repeat `tools/list`) not authored |
| **Substitute evidence (SA4E-380)** | none — TEST-REPORT §4.3 |
| **Evidence (to capture)** | `evidence/UT-15-marker-idempotent.txt` |

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
| **Automation** | `content-proxy.test.ts` — planned |
| **Status** | ⏸ Deferred (planned spec not authored) |
| **Deferral reason** | planned-not-authored — minimal/absent schema tolerance not authored |
| **Substitute evidence (SA4E-380)** | none — TEST-REPORT §4.3 |
| **Evidence (to capture)** | `evidence/UT-16-minimal-schema.txt` |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Detect + adapt the minimal tool | Treated as empty; a minimal valid schema is produced; the catalogue listing does **not** crash |

---

### 4.3 Invocation adaptation (`invocation-adapter.ts`)

### UT-18: Empty `content_base64` still enters wrapper mode; non-string payload treated as absent

| Field | Value |
|-------|-------|
| **ID** | UT-18 |
| **Priority** | Medium |
| **Level / Type** | UT — edge case (automated) |
| **Requirement** | STORY 2 (AC-2.1 validation) · UC-07 AF-4 · BR-01 |
| **Preconditions** | Capability for `export_docx` |
| **Test data** | `{ content_base64: '' , output_path: '/x.docx' }` and `{ content_base64: 42, output_path: '/x.docx' }` |
| **Automation** | `content-proxy.test.ts` — planned |
| **Status** | ⏸ Deferred (planned spec not authored) |
| **Deferral reason** | planned-not-authored — empty/non-string payload edge not authored (OI-03 family deviation, SA4E-380 STC §9.2) |
| **Substitute evidence (SA4E-380)** | none — TEST-REPORT §4.3 |
| **Evidence (to capture)** | `evidence/UT-18-empty-payload.txt` |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Empty-string payload | `wrapperMode === true` (ownership check, not truthiness — BR-01) → missing-content error (UC-07 main flow A) |
| 2 | Non-string payload (number/object) | Treated as "no payload" → content-argument branch decides (UC-07 AF-4) |

---

### 4.4 Artifact naming (`artifact-name.ts`)

### UT-22: Only the basename survives; query/fragment stripped

| Field | Value |
|-------|-------|
| **ID** | UT-22 |
| **Priority** | High |
| **Level / Type** | UT — security-relevant naming (automated) |
| **Requirement** | STORY 1 (AC-1.6), STORY 2 (AC-2.3) · UC-01 step 9 · BR-08, BR-10 · NFR-7 · RK-02 |
| **Preconditions** | `safeName` importable |
| **Test data** | `'/srv/exports/UG.docx'` → `UG.docx`; `'https://f.example/r/report.pdf?token=1'` → `report.pdf`; `'C:\\tmp\\a.docx#frag'` → `a.docx`; `'  pad.docx  '` → `pad.docx` |
| **Automation** | `content-proxy.test.ts` — planned |
| **Status** | ⏸ Deferred (planned spec not authored) |
| **Deferral reason** | live-observed — correct names observed in every live export (R-4/R-5/R-8); dedicated `safeName` cases not authored |
| **Substitute evidence (SA4E-380)** | R-4/R-5/R-8 — TEST-REPORT §4.3 |
| **Evidence (to capture)** | `evidence/UT-22-basename.txt` |

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
| **Automation** | `content-proxy.test.ts` — planned |
| **Status** | ⏸ Deferred (planned spec not authored) |
| **Deferral reason** | planned-not-authored — absent names + MIME fallback map not authored |
| **Substitute evidence (SA4E-380)** | none — TEST-REPORT §4.3 |
| **Evidence (to capture)** | `evidence/UT-23-mime-fallback.txt` |

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
| **Automation** | `content-proxy.test.ts` — planned |
| **Status** | ⏸ Deferred (planned spec not authored) |
| **Deferral reason** | planned-not-authored — unknown MIME → `artifact.bin` not authored |
| **Substitute evidence (SA4E-380)** | none — TEST-REPORT §4.3 |
| **Evidence (to capture)** | `evidence/UT-24-default-name.txt` |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Resolve name from location + unknown MIME | `file.xyz` (location basename wins); with no location → `artifact.bin` default |

---

### 4.5 Artifact source resolution (`artifact-source.ts`)

### UT-25: Inline payload in the descriptor wins over any location

| Field | Value |
|-------|-------|
| **ID** | UT-25 |
| **Priority** | High |
| **Level / Type** | UT — retrieval order (automated) |
| **Requirement** | STORY 3 (AC-3.1) · UC-03 AF-1 · BR-07 step 1 · NFR-11 (determinism) |
| **Preconditions** | `resolveArtifact` importable with injectable deps |
| **Test data** | Descriptor `{ output_base64: base64('INLINE'), url: 'https://f.example/a.pdf', path: '/srv/a.pdf', name: 'a.pdf' }` with `fetchUrl`/`readResource` spies |
| **Automation** | `content-proxy.test.ts` — planned |
| **Status** | ⏸ Deferred (planned spec not authored) |
| **Deferral reason** | covered-by-suite (partial) — inline/blob path pinned by UT-26; precedence-over-location not authored |
| **Substitute evidence (SA4E-380)** | R-2 — TEST-REPORT §4.3 |
| **Evidence (to capture)** | `evidence/UT-25-inline-precedence.txt` |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `resolveArtifact(descriptor, deps)` | Bytes === `'INLINE'` |
| 2 | Check spies | `fetchUrl` and `readResource` **never called** — no network, no filesystem access for an inline payload |
| 3 | Repeat with `content_base64`, `base64`, `data` keys | Each accepted as inline payload (alias set per BR-07) |

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
| **Automation** | `content-proxy.test.ts` — planned |
| **Status** | ⏸ Deferred (planned spec not authored) |
| **Deferral reason** | covered-by-suite (partial) — `file:` URI read + cleanup pinned on Windows (UT-44); UNC/POSIX matrix not authored |
| **Substitute evidence (SA4E-380)** | R-2 — TEST-REPORT §4.3 |
| **Evidence (to capture)** | `evidence/UT-27-file-uri-platforms.txt` |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Convert each platform path | Correct `file:` URI per platform (drive letter, UNC, POSIX) |
| 2 | Read `artifact://x/y` | `readResource` invoked with the URI (server-owned scheme, BR-22); no local path guessed |

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
| **Automation** | `content-proxy.test.ts` — planned |
| **Status** | ⏸ Deferred (planned spec not authored) |
| **Deferral reason** | covered-by-suite (partial) — out-of-root refusal pinned (F-01 case); regular-file/symlink/size-before-read assertions not authored |
| **Substitute evidence (SA4E-380)** | R-2 — TEST-REPORT §4.3 |
| **Evidence (to capture)** | `evidence/UT-29-local-guards.txt` |

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
| **Automation** | `content-proxy.test.ts` — planned |
| **Status** | ⏸ Deferred (planned spec not authored) |
| **Deferral reason** | planned-not-authored — `data:` URI decode + 25 MB boundary not authored (SA-06 sits on this path) |
| **Substitute evidence (SA4E-380)** | none — TEST-REPORT §4.3 |
| **Evidence (to capture)** | `evidence/UT-30-data-uri-boundary.txt` |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `base64` marker URI | Base64-decoded inline |
| 2 | No marker | Percent-decoded to UTF-8 |
| 3 | Boundary sizes | At-cap accepted; one byte over rejected — cap is inclusive and exact (TD-13, NFR-1) |

---

### 4.6 Result adaptation (`result-adapter.ts`)

### UT-34: Child `isError` short-circuits adaptation (pass-through)

| Field | Value |
|-------|-------|
| **ID** | UT-34 |
| **Priority** | High |
| **Level / Type** | UT — error pass-through (automated) |
| **Requirement** | STORY 7 (AC-7.7) · UC-02 AF-4, UC-06 EF-1 · BR-18 · E-10 |
| **Preconditions** | Wrapper-mode invocation; child result with `isError: true` and the child's own message |
| **Test data** | `{ content: [{ type:'text', text: 'unsupported markdown table' }], isError: true }` |
| **Automation** | `content-proxy.test.ts` — planned |
| **Status** | ⏸ Deferred (planned spec not authored) |
| **Deferral reason** | planned-not-authored — child `isError` pass-through not authored |
| **Substitute evidence (SA4E-380)** | none — TEST-REPORT §4.3 |
| **Evidence (to capture)** | `evidence/UT-34-child-error-passthrough.txt` |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `adaptResult(wrapperInvocation(), childError)` | Returned **untouched** — message text, `isError` flag and structured detail survive verbatim |
| 2 | `readResource`/fetch spies | Never called — no artifact retrieval attempted for a failed invocation (BR-18, STORY 7 RD-5) |

---

### 4.7 Extension output proxy (`output-proxy.ts`)

### UT-38: Metadata without bytes → extension-side `ARTIFACT_FETCH_FAILED`; zero-declared pass-through

| Field | Value |
|-------|-------|
| **ID** | UT-38 |
| **Priority** | High |
| **Level / Type** | UT — fail-loud second guard (automated) |
| **Requirement** | STORY 2 (AC-2.2, AC-2.5) · UC-02 AF-1, EF-1 · BR-13, BR-14 · E-04 |
| **Preconditions** | Wrapper mode active (`file_path` present, BR-13); backend returned artifact metadata with no payload |
| **Test data** | `{ success: true, artifacts: [{ name: 'no-bytes.docx', size: 123 }] }` (no `output_base64`, no `outputs[]`) |
| **Automation** | `output-proxy` unit test — planned (IT-level evidence already exists: IT-12) |
| **Status** | ⏸ Deferred (planned spec not authored) |
| **Deferral reason** | covered-by-suite — the same E-04 contract is pinned one level up by IT-12 (passing); unit-level case not authored |
| **Substitute evidence (SA4E-380)** | R-3 / IT-12 — TEST-REPORT §4.3 |
| **Evidence (to capture)** | `evidence/UT-38-missing-payload.txt` |

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
| **Automation** | `output-proxy` unit test — planned |
| **Status** | ⏸ Deferred (planned spec not authored) |
| **Deferral reason** | code-verified — literals verified in code (`output-proxy.ts:71/77`, Phase 5.7 §5-A08); **no executed test pins them** — priority follow-up |
| **Substitute evidence (SA4E-380)** | code audit — TEST-REPORT §4.3 |
| **Evidence (to capture)** | `evidence/UT-39-write-counts.txt` |

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
| **Automation** | `output-proxy` unit test — planned |
| **Status** | ⏸ Deferred (planned spec not authored) |
| **Deferral reason** | code-verified — write-guard sanitisation (E-07) family; not test-pinned |
| **Substitute evidence (SA4E-380)** | code audit + extension suite — TEST-REPORT §4.3 |
| **Evidence (to capture)** | `evidence/UT-40-write-guard.txt` |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Write to the escaping path | `isError`; literal shape: `PROXY_WRITE_FAILED: <sanitized reason> — no file was written.` (E-07) |
| 2 | Inspect the message | **No absolute path, no stack trace** — exception text sanitised before embedding (BR-17, AC-7.5) |
| 3 | Non-wrapper result | Returned unchanged — the output proxy does not police direct calls (BR-13) |

---

### 4.8 Extension LLM-facing schema rewrite (`schema-rewrite.ts`)

### UT-42: Destination default — `.drawio` → `.png` swap, otherwise `.out` appended

| Field | Value |
|-------|-------|
| **ID** | UT-42 |
| **Priority** | Medium |
| **Level / Type** | UT — naming default (automated) |
| **Requirement** | STORY 1 (RD-3) · UC-01 AF-1 · BR-15 |
| **Preconditions** | No `output_path`; no backend-suggested name |
| **Test data** | Source `diagram.drawio` → destination `diagram.png`; source `notes.md` → `notes.md.out` |
| **Automation** | `schema-rewrite`/`resolveOutputPath` unit test — planned |
| **Status** | ⏸ Deferred (planned spec not authored) |
| **Deferral reason** | live-observed (partial) — rule documented (UG) and visible in the live schema description; dedicated case not authored |
| **Substitute evidence (SA4E-380)** | R-8 — TEST-REPORT §4.3 |
| **Evidence (to capture)** | `evidence/UT-42-default-suffix.txt` |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Resolve destination for a `.drawio` source | `.png` swapped |
| 2 | Resolve for any other source | `.out` appended (single artifact only; multi without a name → entry skipped, BR-15) |

---

## 5. Integration Tests (IT) — 3 cases

Environment: in-process fake MCP `Client` (`listTools` + `callTool`) injected into the real `McpClientManager` / `ProxiedToolRegistry`; extension side uses the real `WrapperServer` with a stubbed REST transport; real temp filesystem; no network. Exit criteria (SA4E-380 STP G3): adapted and non-adapted tools coexist in one catalogue; a path-only remote result never escapes as a path; the wrapper writes exactly N files for N payloads.

### IT-06: Mixed catalogue registers adapted and raw definitions with zero new names

| Field | Value |
|-------|-------|
| **ID** | IT-06 |
| **Priority** | High |
| **Level / Type** | IT — registration (automated) |
| **Requirement** | STORY 5 (AC-5.1, AC-5.2), STORY 6 (AC-6.1, AC-6.2) · UC-05 steps 1-5 · BR-19, BR-20 |
| **Preconditions** | Fake client returning a mixed tool list: `export_docx` (file producer), `jira_create_issue` (non-file, TD-10), `drawio_export_png` (wrapper-native, TD-09) |
| **Test data** | TD-01 + TD-09 + TD-10 definitions in one `listTools` response |
| **Automation** | `ProxiedToolRegistry` integration test — planned (STP §2.2.3 "honest gap": registry only exercised indirectly today) |
| **Status** | ⏸ Deferred (planned spec not authored) |
| **Deferral reason** | registry mixed-catalogue spec not authored; the registry is exercised indirectly via `McpClientManager` in the passing suites (R-2) |
| **Substitute evidence (SA4E-380)** | R-2 (indirect) — TEST-REPORT §4.4 |
| **Evidence (to capture)** | `evidence/IT-06-registry-mixed.txt` |

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
| **Automation** | Registry integration test — planned |
| **Status** | ⏸ Deferred (planned spec not authored) |
| **Deferral reason** | registry untouched-tool spec not authored; exercised indirectly (R-2) |
| **Substitute evidence (SA4E-380)** | R-2 (indirect) — TEST-REPORT §4.4 |
| **Evidence (to capture)** | `evidence/IT-07-registry-untouched.txt` |

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
| **Automation** | Registry integration test — planned |
| **Status** | ⏸ Deferred (planned spec not authored) |
| **Deferral reason** | registry `clear()` / re-register spec not authored; exercised indirectly (R-2) |
| **Substitute evidence (SA4E-380)** | R-2 (indirect) — TEST-REPORT §4.4 |
| **Evidence (to capture)** | `evidence/IT-08-registry-clear.txt` |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `clear()` the registry | `getCapability('export_docx')` → undefined; proxied tool list empty |
| 2 | Re-register | Capability re-detected once per definition; adapted definitions re-pushed (no duplicate entries) |

---

## 6. End-to-End API Tests (E2E-API) — 16 cases

Environment: real backend at `http://127.0.0.1:3000` + real child `markdown-exporter-mcp-local` (stdio/local); writable temp workspace; `LIVE_BACKEND` not required. Entry (SA4E-380 STP G4): server started with current code; child tools discovered; **baseline `tools/list` snapshot captured before the first export**. Exit (STP G4): zero new tool names; six export calls write six valid files; direct-call shape unchanged; both negative payload cases return the exact documented error.

> These 16 cases are the only place where the contract is observable **from outside the process**; E2E-API-01..07 also substitute for the missing UI surface (SA4E-380 STP §2.5). The planned `backend/tests/e2e-api/*.e2e.test.ts` specs were not authored in the SA4E-380 release — the externally visible contract they target is currently delivered by the live runs (R-4/R-8) and suite-level pins, recorded per case below.

### E2E-API-01: Catalogue invariant — zero new tools versus baseline

| Field | Value |
|-------|-------|
| **ID** | E2E-API-01 |
| **Priority** | High |
| **Level / Type** | E2E-API — invariant (automated) |
| **Requirement** | STORY 5 (AC-5.1, AC-5.2) · UC-05 · BR-20 · NFR-13 · TD-10 |
| **Preconditions** | Backend + child running current code; baseline `tools/list` captured **before** any export |
| **Test data** | Baseline name set vs post-change name set; forbidden names: `export_docx_proxied`, `content_proxy`, `fetch_artifact` (BR-20) |
| **Automation** | `backend/tests/e2e-api/content-proxy.catalog.e2e.test.ts` — planned |
| **Status** | ⏸ Deferred (planned spec not authored) |
| **Deferral reason** | live-substituted (partial) — live: 95 tools loaded, exporters surface via `find_tools` under their original names, no new name in any capture; the formal baseline-diff spec was not executed |
| **Substitute evidence (SA4E-380)** | R-8 (partial) — TEST-REPORT §4.5 |
| **Evidence (to capture)** | `evidence/E2E-API-01-catalogue-diff.txt` |

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
| **Status** | ⏸ Deferred ×6 (planned specs not authored) | | | | | |
| **Evidence (to capture)** | `evidence/E2E-API-02..07-schema.txt` | | | | | |

| Field (common) | Value |
|-------|-------|
| **Level / Type** | E2E-API — schema contract (automated) |
| **Requirement** | STORY 5 (AC-5.3, AC-5.4) · UC-05 · BR-11 · verified live shape per FSD §3.9.1 |
| **Preconditions** | Backend running; exporter discoverable via `find_tools` |
| **Test data** | `find_tools('<exporter>')` response; reference live shape of `export_pdf`: properties `markdown`, `file_name` (`anyOf[string,null]`), `options`, `content_base64`; `required: []` |
| **Automation** | `backend/tests/e2e-api/content-proxy.schema.e2e.test.ts` (one test per exporter) — planned |
| **Deferral reason** | live-substituted (partial) — markers live-confirmed (backend `/api/tools/find` + wrapper `find_tools`, R-8); per-exporter full 6-field assertion not executed |
| **Substitute evidence (SA4E-380)** | R-8 + R-4 (partial) — TEST-REPORT §4.5 |

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
| **Status** | ⏸ Deferred ×6 (planned specs not authored) | | | | | |
| **Evidence (to capture)** | `evidence/E2E-API-08..13-export.txt` | | | | | |

| Field (common) | Value |
|-------|-------|
| **Level / Type** | E2E-API — functional happy path (automated) |
| **Requirement** | STORY 1 (AC-1.1..AC-1.6) · UC-01 main flow · BR-07, BR-09, BR-10 · TD-01 · TR-1 |
| **Preconditions** | Backend + child running; temp workspace writable; source fixture written |
| **Test data** | TD-01 — `# Hello\n\nWorld.\n` (~20 B) written to `<tmp>/content-proxy-e2e/source.md`; `output_path: <tmp>/content-proxy-e2e/out.<ext>` |
| **Automation** | `backend/tests/e2e-api/content-proxy.export.e2e.test.ts` (one test per format) — planned |
| **Deferral reason** | live-covered — each format exported live through the wrapper on the current build (sizes recorded: docx 14,599 B → SIT-12 14,243 B; xlsx 4,849 B; pptx 29,296 B; pdf 1,967 B; html 199 B; json 31 B); planned HTTP spec not authored |
| **Substitute evidence (SA4E-380)** | R-4 (live-covered) — TEST-REPORT §4.5 |

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
| **Automation** | `backend/tests/e2e-api/content-proxy.direct.e2e.test.ts` — planned |
| **Status** | ⏸ Deferred (planned spec not authored) |
| **Deferral reason** | covered-by-suite — direct-call shape pinned by UT-20/UT-33 + IT-03 (passing); live direct call not performed |
| **Substitute evidence (SA4E-380)** | R-2 (covered-by-suite) — TEST-REPORT §4.5 |
| **Evidence (to capture)** | `evidence/E2E-API-14-direct-shape.txt` |

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
| **Automation** | `backend/tests/e2e-api/content-proxy.payload.e2e.test.ts` — planned |
| **Status** | ⏸ Deferred (planned spec not authored) |
| **Deferral reason** | live-observed — the exact `Missing content: pass file_path…` error with zero files created was observed live during the BLOCKER-WRAPPER-RELOAD investigation (STP §12.1); planned HTTP assertion not executed |
| **Substitute evidence (SA4E-380)** | live-observed (STP §12.1) — TEST-REPORT §4.5 |
| **Evidence (to capture)** | `evidence/E2E-API-15-missing-content.txt` |

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
| **Automation** | `backend/tests/e2e-api/content-proxy.payload.e2e.test.ts` — planned |
| **Status** | ⏸ Deferred (planned spec not authored) |
| **Deferral reason** | covered-by-suite — exact `Invalid content_base64 payload.` pinned by UT-19 (child never invoked, no file); live check not performed |
| **Substitute evidence (SA4E-380)** | R-2 (covered-by-suite) — TEST-REPORT §4.5 |
| **Evidence (to capture)** | `evidence/E2E-API-16-invalid-base64.txt` |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Execute with the malformed payload | `isError === true`; text === `Invalid content_base64 payload.` (exact documented message) |
| 2 | Verify no side effects | No file written; child not invoked; no corrupted document reported as success |

---

## 7. End-to-End UI Tests (E2E-UI) — Not Applicable (0 cases)

| Field | Value |
|-------|-------|
| **Planned cases** | **0** — recorded as a decision, not an oversight (SA4E-380 STP §2.2.5) |
| **Reason** | SA4E-380 is a protocol/orchestration capability between the agent, the extension wrapper and the child MCP server. There is no screen, no route, no component; the agent-visible output is a tool-result text block. A browser would test nothing this ticket changes |
| **Substitute coverage** | The **schema-visible contract** (what an LLM or human reading the catalogue sees) is asserted at E2E-API-01..07; the **agent-visible result contract** (`file_path`, `size_bytes`, error codes) at E2E-API-08..16 and SIT-01..13 |
| **Reactivation rule** | If a future ticket exposes a document-export screen, Playwright cases must be added here and the level becomes active |

---

## 8. System Integration Tests (SIT) — 3 cases

Environment: backend running locally; `markdown-exporter-mcp-local` as a stdio child; extension wrapper on port **9183** inside the Kiro window; harness `WrapperServer` on ephemeral port (live harness uses 48721); evidence in `documents/SA4E-380/evidence/`. These three cases require **live staging** (test doubles injected at the backend REST boundary or a staged child stub) that was not performed in the SA4E-380 release.

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
| **Status** | ⏸ Deferred (live staging not performed) |
| **Deferral reason** | covered-by-suite — deterministic write/count pinned by UT-32/UT-37/IT-10 (passing); no acceptance-set exporter emits multi-file results (scope) |
| **Substitute evidence (SA4E-380)** | R-2/R-3 (covered-by-suite) — TEST-REPORT §4.7 |
| **Evidence (to capture)** | `evidence/SIT-08-multi-artifact.png` + directory listing |

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
| **Status** | ⏸ Deferred (live staging not performed) |
| **Deferral reason** | covered-by-suite — no remote child is configured (by design, LIMITATION-REMOTE-PATH-ONLY); the E-03 contract is pinned by UT-35 + IT-05 + the F-01 case, and the live error text is documented (SA4E-380 UG §7.1/§7.2) |
| **Substitute evidence (SA4E-380)** | R-2 (covered-by-suite) — TEST-REPORT §4.7 |
| **Evidence (to capture)** | `evidence/SIT-09-path-only-failure.png` + response payload capture |

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
| **Status** | ⏸ Deferred (live write-confinement staging not performed) |
| **Deferral reason** | code-verified — input-guard variants supported by the extension suite (`backend-local-tools.base64-proxy.test.ts`); write-guard literals (`PROXY_WRITE_FAILED` family) code-verified in Phase 5.7 §5-A08 — dedicated cases (UT-39/40) deferred |
| **Substitute evidence (SA4E-380)** | R-3 + code-verified — TEST-REPORT §4.7 |
| **Evidence (to capture)** | `evidence/SIT-10-confinement-<variant>.png` ×4 |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Variant A — export with an escaping `output_path` | `isError`; `PROXY_WRITE_FAILED: <sanitized reason> — no file was written.` (E-07); **no file outside the workspace**; message contains no absolute path |
| 2 | Variant B — symlinked destination | Guard aborts the write; `PROXY_WRITE_FAILED`; the symlink target is never written through |
| 3 | Variant C — traversal `file_path` | `FS_ERROR: Failed to read file <sanitized resolved path>: <sanitized reason>` (E-01); the child is **never invoked**; nothing written |
| 4 | Variant D — source > 25 MB | `FS_ERROR: file too large for proxy pre-read (limit 25 MB): <sanitized path> — attach a smaller file or read a slice.` (E-02); child not invoked |
| 5 | After all variants | Workspace contains zero new files; guards logged the rejections |

---

## 9. Test Data Reference

Fixtures TD-01..TD-13 are defined in SA4E-380 STP §10.1 and referenced by every case above. Data rules (STP §10.3): no oversized fixture on disk (synthetic metadata only); concrete values only; deterministic temp locations (`os.tmpdir()/content-proxy-*`); no secrets; evidence immutable. The machine-readable CSV files declared in SA4E-380 STP §10.2 (`naming-testdata.csv`, `live-evidence.csv`, …) are the single source of truth for the naming and live-evidence cases and are to be generated under `documents/SA4E-380/testdata/` when the deferred cases are authored.

Key fixtures used by this register:

| Fixture | Used by | Shape |
|---------|---------|-------|
| TD-01 | Most UT/IT/E2E-API cases | `export_docx` definition — `inputSchema.required: ['markdown']`; source `# Hello\n\nWorld.\n` |
| TD-04 | UT-19, E2E-API-16 | Invalid base64 payloads: `'!!!not-base64!!!'`, `'abc'`, `'YWJj!'` |
| TD-05 / TD-13 | PBT-03, UT-30 | Declared 25 MB boundaries: `26214400` (accept) / `26214401` (reject), synthetic only |
| TD-06 | SIT-09 | Path-only descriptor `{ name: 'UG.docx', path: '/remote/secret/UG.docx' }` |
| TD-07 | UT-39, SIT-08 | Multi-artifact: `report.pdf` (1,967 B) + `data.json` (31 B) |
| TD-08 | PBT-01 | Unicode string shapes: `# Kiểm thử\r\n\r\n😀 emoji — "quotes"\r\n` |
| TD-09 | UT-03/15, PBT-06, IT-06 | Wrapper-native `drawio_export_png` — declares its own `content_base64` |
| TD-10 | UT-02, E2E-API-01, IT-06 | Non-file tools: `confluence_create_page`, `jira_create_issue`, `mem_ingest` |
| TD-11 / TD-12 | UT-29/40, SIT-10 | Traversal paths / symlink destinations |

---

## 10. Traceability & Automation Follow-up

### 10.1 Case → reason class → substitute (full 52)

| Case(s) | Level | Reason class | Substitute evidence (SA4E-380) |
|---------|-------|--------------|-------------------------------|
| PBT-01 | PBT | planned-not-authored | UT-17 + UT-19 (R-2) |
| PBT-02 | PBT | planned-not-authored | UT-31 + IT-01/IT-04 (R-2) |
| PBT-03 | PBT | planned-not-authored | `MAX_ARTIFACT_BYTES` + UT-45 step 2 (R-2, partial) |
| PBT-04 | PBT | live-observed | R-4/R-5/R-8 captures |
| PBT-05 | PBT | planned-not-authored | UT-12 + live catalogue (R-2/R-8) |
| PBT-06 | PBT | planned-not-authored | UT-01..04 + live detection (R-2/R-4) |
| UT-05, UT-06, UT-07 | UT | scope | overrides table ships empty |
| UT-08 | UT | covered-by-suite (partial) | UT-01 |
| UT-09, UT-10 | UT | planned-not-authored | none (SA-07 noted) |
| UT-11 | UT | live-covered (partial) | R-8/R-4 |
| UT-13, UT-14 | UT | covered-by-suite (partial) | UT-12 (+ R-8) |
| UT-15, UT-16, UT-18 | UT | planned-not-authored | none |
| UT-22 | UT | live-observed | R-4/R-5/R-8 |
| UT-23, UT-24 | UT | planned-not-authored | none |
| UT-25 | UT | covered-by-suite (partial) | UT-26 |
| UT-27 | UT | covered-by-suite (partial) | UT-44 |
| UT-29 | UT | covered-by-suite (partial) | F-01 case |
| UT-30 | UT | planned-not-authored | none (SA-06 noted) |
| UT-34 | UT | planned-not-authored | none |
| UT-38 | UT | covered-by-suite | IT-12 (R-3) |
| UT-39, UT-40 | UT | code-verified | Phase 5.7 §5-A08 (no test pins) |
| UT-42 | UT | live-observed (partial) | R-8 |
| IT-06, IT-07, IT-08 | IT | planned-not-authored | R-2 (indirect via `McpClientManager`) |
| E2E-API-01..07 | E2E-API | live-substituted (partial) | R-8 |
| E2E-API-08..13 | E2E-API | live-covered | R-4 (all six sizes recorded) |
| E2E-API-14 | E2E-API | covered-by-suite | UT-20/UT-33/IT-03 |
| E2E-API-15 | E2E-API | live-observed | STP §12.1 investigation |
| E2E-API-16 | E2E-API | covered-by-suite | UT-19 |
| SIT-08 | SIT | covered-by-suite | UT-32/UT-37/IT-10 |
| SIT-09 | SIT | covered-by-suite | UT-35/IT-05/F-01 |
| SIT-10 | SIT | code-verified | extension suite + Phase 5.7 §5-A08 |

### 10.2 Authoring priority (per SA4E-380 TEST-REPORT §9)

1. **E2E-API-01** — baseline-diff catalogue invariant (highest value, closes the outside-the-process contract).
2. **UT-39 / UT-40 / UT-38** — pin the `PROXY_WRITE_FAILED` literals and the extension missing-payload guard (currently code-verified only).
3. **PBT harness (PBT-01..06)** — one `content-proxy.pbt.test.ts` file, fast-check, ≥100 runs each.
4. **Registry IT-06..08** — dedicated `ProxiedToolRegistry` specs (STP §2.2.3 gap).
5. **Remaining UT edge cases** — UT-09/10/15/16/18/23/24/30/34 (+ refinements UT-08/13/14/25/27/29/42).
6. **SIT-08..10 live staging** — multi-artifact, path-only, write-confinement with real guards.
7. **UT-05/06/07 (scope)** — author only when `CONTENT_PROXY_OVERRIDES` is activated.

### 10.3 Exit criteria for this register

- All 52 cases have their dedicated spec authored and executed (or re-classified with SM sign-off).
- Every error literal (E-01..E-11) is pinned by at least one executed test.
- Zero DEFERRED rows remain without a reason class + substitute evidence through PARK to PASS transition.
- No case is ever made to pass by accepting a path or a substitute for the exact documented behaviour (STP §12.2).

---

*End of STC — SA4E-384 (deferred register). Source of truth for case detail: `documents/SA4E-380/STC.md`; for deferral reasons: `documents/SA4E-380/TEST-REPORT.md` §4.*
