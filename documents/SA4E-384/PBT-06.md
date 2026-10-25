# PBT-06: Detection monotonicity — every convention-matching name is a file producer unless exempted

**Ticket:** SA4E-384  
**Case ID:** PBT-06  
**Priority:** Medium  
**Level/Type:** PBT — correctness property (automated)  
**Status:** ⏸ Deferred (planned spec not authored)  

**Deferral reason:** planned-not-authored — detection pinned by UT-01..04 (passing); all six real exporters detected and adapted live (R-4); randomised name harness not authored  

**Substitute evidence (SA4E-380):** R-2/R-4 (substitute) — TEST-REPORT §4.2 (property-based test substitution)  

**Requirement:** STORY 6 (AC-6.1, AC-6.7) · UC-05 main flow · BR-04, BR-05  

**Preconditions:** `detectCapability` importable; `CONTENT_PROXY_OVERRIDES` reachable for the exemption branches  

**Test data:** Generated names with `export_`/`render_`/`generate_` prefixes + random suffixes; paired variants declaring `content_base64` (TD-09) or disabled via override  

**Automation:** `content-proxy.pbt.test.ts` — planned (fast-check ^4.9.0 + vitest)  

---

## Steps

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | For each generated prefixed name (plain tool) | `detectCapability` returns non-null with `fileOutput: true` |
| 2 | Same name but schema already declares `content_base64` | Returns `null` (BR-05 beats BR-04) |
| 3 | Same name with override `{ enabled: false }` | Returns `null` (BR-04 first clause) |

**Expected result:** property holds — the prefix gate is monotonic and its two exemptions are exact.  

**Postconditions:** none (pure property-based test).  

**Evidence (to capture):** `evidence/PBT-06-detection-monotonic.txt`  

---

### Appendix: Test File Location

```
backend/src/modules/orchestration/content-proxy/__tests__/content-proxy.pbt.test.ts
```

**PBT-06 test code skeleton (fast-check + vitest):**

```ts
import { describe, it } from "vitest";
import { fastCheck } from "fast-check";
import { detectCapability } from "../../../../../server";

describe("PBT-06: Detection monotonicity", () => {
  it("generates prefixed names detect as file producers", () => {
    fastCheck(
      // Property: every convention-matching name is a file producer unless exempted
      (name: string) => {
        const cap = detectCapability(name);
        if (!name.startsWith("export_") && !name.startsWith("render_") && !name.startsWith("generate_")) {
          // Non-convention names are out of scope — skip
          return true;
        }
        return cap !== null && cap.fileOutput === true;
      },
      // Generate random suffixed names with the three prefixes
      { maxArbitrary: 100, shrinks: 10 }
    );
  });

  it("returns null when schema declares content_base64", () => {
    fastCheck(
      (name: string) => {
        const cap = detectCapability(name, { content_base64: true });
        if (!name.startsWith("export_") && !name.startsWith("render_") && !name.startsWith("generate_")) {
          return true;
        }
        // BR-05: if content_base64 already declared, override is ignored → null
        return cap === null;
      },
      { maxArbitrary: 100, shrinks: 10 }
    );
  });

  it("returns null when override { enabled: false }", () => {
    fastCheck(
      (name: string) => {
        const cap = detectCapability(name, { override: { enabled: false } });
        if (!name.startsWith("export_") && !name.startsWith("render_") && !name.startsWith("generate_")) {
          return true;
        }
        // BR-04 first clause: override disabled → null
        return cap === null;
      },
      { maxArbitrary: 100, shrinks: 10 }
    );
  });
});
```