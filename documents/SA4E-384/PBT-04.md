# PBT-04: Name safety — `safeName` never emits a path fragment

**Ticket:** SA4E-384  
**Case ID:** PBT-04  
**Priority:** High  
**Level/Type:** PBT — correctness property (automated)  
**Status:** ⏸ Deferred (planned spec not authored)  
**Deferral reason:** live-observed — name safety observed correct in every live export (artifact names in responses match expectations); property harness not authored  

**Substitute evidence:** R-4/R-5/R-8 (observed) — TEST-REPORT §4.2 (property-based test substitution, observed)  

**Requirement:** STORY 1 (AC-1.6), STORY 2 (AC-2.3) · UC-01 step 9 · BR-08, BR-10 · NFR-7 · naming-testdata.csv  

**Preconditions:** `artifact-name.safeName` importable  

**Test data:** fast-check strings mixed with hostile seeds: `/srv/secret/UG.docx`, `C:\\x\\y.docx`, `../etc/passwd`, `a?token=1`, `b#frag`, `.`, `..`, `''`  

**Automation:** `content-proxy.pbt.test.ts` — planned  

**Status:** ⏸ Deferred (planned spec not authored)  
**Deferral reason:** live-observed — name safety observed correct in every live export (artifact names in responses match expectations); property harness not authored  
**Substitute evidence (SA4E-380):** R-4/R-5/R-8 (observed) — TEST-REPORT §4.2  
**Evidence (to capture):** `evidence/PBT-04-name-safety.txt`  

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | For 100+ generated/seeded inputs, call `safeName(value)` | Result (when non-null) contains **no** `/` and **no** `\` |
| 2 | Assert the never-set | Result is never `.`, never `..`, never empty string |
| 3 | Call `safeName(safeName(x))` | Idempotent — second call returns the same value |

**Expected result:** property holds; a path fragment never leaves the component (RK-02).

**Postconditions:** none (pure property-based test).