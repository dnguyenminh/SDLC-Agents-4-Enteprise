# PBT-05: Schema invariant — adaptation keeps the schema callable and self-describing

**Ticket:** SA4E-384  
**Case ID:** PBT-05  
**Priority:** High  
**Level/Type:** PBT — correctness property (automated)  
**Status:** ⏸ Deferred (planned spec not authored)  
**Deferral reason:** planned-not-authored — invariants pinned by UT-12 (markers, required rewrite) + live catalogue captures; randomised schema harness not authored  

**Substitute evidence (SA4E-380):** R-2/R-8 (substitute) — TEST-REPORT §4.2 (property-based test substitution)  

**Requirement:** STORY 5 (AC-5.3, AC-5.4), STORY 2 (AC-2.1) · UC-05 main flow · BR-11, BR-20 · NFR-13  

**Preconditions:** `adaptToolDefinition` importable; tool definitions generated with a content alias and arbitrary `required` orders  

**Test data:** Generated schemas (properties including markdown/content/text aliases, 0..3 other required entries)  

**Automation:** `content-proxy.pbt.test.ts` — planned (fast-check ^4.9.0 + vitest)  

---

## Steps

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Adapt 100+ generated definitions; locate the resolved content argument | Content argument **never** appears in `required` after adaptation |
| 2 | Read `x-content-param` | Always names a property that exists in `properties` |
| 3 | Count occurrences of `output_base64` in `description` | Appears **at most once** (marker sentence idempotent) |
| 4 | Verify tool `name` | Unchanged — adaptation never renames (BR-20) |

**Expected result:** property holds for all generated schemas.

**Postconditions:** none (pure property-based test).