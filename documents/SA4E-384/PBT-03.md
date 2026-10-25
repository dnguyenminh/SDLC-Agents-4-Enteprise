# PBT-03: Size cap — inline resolver accepts only 0 < length ≤ 26,214,400 bytes

**Ticket:** SA4E-384  
**Case ID:** PBT-03  
**Priority:** High  
**Level/Type:** PBT — correctness property (automated)  
**Status:** ⏸ Deferred (planned spec not authored)  
**Deferral reason:** planned-not-authored — cap enforced by shared `MAX_ARTIFACT_BYTES`; oversize refusal exercised by UT-45 step 2 (26 MB file never read/deleted); randomised boundary harness not authored  

**Substitute evidence:** R-2 (partial) — TEST-REPORT §4.2 (property-based test substitution, partial)  

**Requirement:** STORY 3 (AC-3.6) · UC-03 AF-1/EF-3/EF-4 · BR-06 · NFR-1 · TD-05, TD-13  

**Automation:** `content-proxy.pbt.test.ts` — planned (fast-check ^4.9.0 + vitest)  

**Test data:** Declared sizes generated as **metadata**: `size` values around the boundary `26214400` (accept) and `26214401` (reject); buffers synthesised via mocked streams for sub-cap sizes  

**Preconditions:** `artifact-source.fromBase64` (or the inline branch of `resolveArtifact`) importable; no 25 MB fixture is ever materialised (STP TR-2)  

**Evidence (to capture):** `evidence/PBT-03-size-cap.txt`  

---

## Steps

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | For generated sizes in (0, 26,214,400], resolve an inline payload of that declared size | Non-empty buffer returned; length === declared size |
| 2 | For `size = 0` (empty/whitespace base64) | Resolves to "no artifact" (`null`) — never a 0-byte payload (BR-06) |
| 3 | For `size = 26,214,401` and above (declared `content-length` / descriptor size) | Source treated as unusable → `ARTIFACT_FETCH_FAILED` path; **nothing buffered to disk** |

**Expected result:** the cap is inclusive at 25 MB and exact — no truncated buffer is ever returned (RK-03).

**Postconditions:** none (pure property-based test).