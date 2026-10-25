# PBT-01: Base64 Round Trip — Decoded Content Equals Source Text for Arbitrary UTF-8

**Ticket:** SA4E-384  
**Case ID:** PBT-01  
**Priority:** High  
**Level/Type:** PBT — correctness property (automated)  
**Status:** ⏸ Deferred (planned spec not authored)  
**Deferral reason:** planned-not-authored — deterministic round trip pinned by UT-17 + UT-19 (passing), but the randomised harness is missing  
**Substitute evidence:** R-2 — TEST-REPORT §4.2 (property-based test substitution)  

**Requirement:** STORY 1 (AC-1.2), STORY 7 (AC-7.2) · UC-01 step 6, UC-07 Flow B · BR-02, BR-03 · NFR-5 · E-09 context  

**Automation:** `content-proxy.pbt.test.ts` — planned (fast-check ^4.9.0 + vitest)  

**Test data:** fast-check Unicode string generator (covers TD-08: `# Kiểm thử\r\n\r\n😀 emoji — "quotes"\r\n` shapes); payload = `Buffer.from(text).toString('base64')`  

**Preconditions:** `detectCapability(EXPORT_DOCX)` returns `{ contentParam: 'markdown', fileOutput: true }`; `adaptInvocation` importable as a pure function  

**Evidence (to capture):** `evidence/PBT-01-roundtrip.txt`  

---

## Steps

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | For 100+ generated `text` values, call `adaptInvocation(cap, { content_base64: base64(text) })` | `invocation.error` undefined; `invocation.wrapperMode === true` |
| 2 | Read `invocation.args['markdown']` (the `x-content-param` target) | Value **===** the generated `text`, byte-for-byte after UTF-8 decode |
| 3 | Inspect `invocation.args` keys | `content_base64`, `output_path`, `file_path` absent (stripped) |

**Expected result:** property holds for all runs; no counter-example retained. **Postconditions:** none (pure function).