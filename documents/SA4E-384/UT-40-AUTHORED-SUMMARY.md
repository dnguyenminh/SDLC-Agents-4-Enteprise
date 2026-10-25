# UT-40 Authored Summary — SA4E-384

**Ticket:** SA4E-384  
**Case ID:** UT-40  
**Priority:** High  
**Level/Type:** UT — security + compatibility (automated)  
**Status:** Authored (completed — deferred spec now authored)  
**Date Authored:** 2026-10-25  
**Author:** QA Agent (subagent)  

---

## Test Case Content (as authored in STC.md)

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
| **Status** | ⏸ Deferred (planned spec not authored) → **✅ Authored** |
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

## Verification Status

| Check | Result |
|-------|--------|
| STC.md content present and complete | ✅ UT-40 fully defined in `documents/SA4E-384/STC.md` lines 825-849 |
| All required fields populated | ✅ ID, Priority, Level/Type, Requirement, Preconditions, Test data, Automation, Status, Deferral reason, Substitute evidence, Evidence, Steps with Expected Result |
| Content matches user specification | ✅ All fields exactly match the provided context (STORY 7, AC-7.5, UC-01 EF-6, BR-17, E-07, TD-11/12, RK-13) |
| RUN-LOG.md updated | ✅ UT-40 logged as Authored on 2026-10-25 (line 139) |
| STATUS.json updated | ✅ `casesCompleted: 4`, `nextPriority: "PBT-01"` |
| Evidence path specified | ✅ `evidence/UT-40-write-guard.txt` |

---

## Dev-Agent Dependencies

| Dependency | Description | Action Required |
|------------|-------------|-----------------|
| **Code fixes / test scaffolding** | UT-40 is marked `code-verified` with substitute evidence = "code audit + extension suite" — the literals/guards exist in code (E-07 family) but **no executed test pins them**. The dev-agent may need to implement code fixes or write minimal test scaffolding so the `output-proxy` unit test can actually execute and validate the write-guard sanitisation behaviour. | **PBT/UT infrastructure**: Verify `output-proxy.ts` contains the E-07 sanitisation literals at the expected line references. If code changes are needed to make the test pass, the dev-agent should implement them before test execution. |
| **Test data fixtures** | TD-11 and TD-12 fixtures must be available in the test workspace (TD-11: `../../etc/passwd`-style escaping path; TD-12: symlinked destination → outside workspace). | **Dev-agent**: Ensure test fixtures TD-11 and TD-12 are set up in the backend test workspace, or that the test can generate synthetic equivalents. |
| **Automation framework** | The planned automation is `output-proxy` unit test. This requires the vitest/fast-check test environment already established for other UT cases. | **Dev-agent**: If the `output-proxy.test.ts` or similar test file doesn't exist, create the minimal test scaffolding to run UT-40's three steps. |

---

## Summary

✅ **UT-40 is now fully authored** and all supporting files are consistent:

- **STC.md**: UT-40 test case fully defined with all required fields
- **STATUS.json**: `casesCompleted: 4`, `nextPriority: "PBT-01"` (first PBT case)
- **RUN-LOG.md**: UT-40 logged as Authored on 2026-10-25

**Next priority case: PBT-01** — the first property-based test from the PBT-01..06 set, per the updated STATUS.json `nextPriority`.

⚠️ **Note:** UT-40 is `code-verified` but `not test-pinned`. The dev-agent should investigate the `output-proxy.ts` code to verify the E-07 sanitisation literals exist and may need to write minimal test scaffolding or implement code fixes so the `output-proxy` unit test can execute successfully.