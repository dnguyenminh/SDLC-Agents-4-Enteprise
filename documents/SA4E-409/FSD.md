# SA4E-409 Functional Specification — Predictive Label Weighting for find_tools

**Author:** SM (SM-acting, SA4E-369 follow-up)
**Status:** Draft — pending BA/TA review
**Related:** SA4E-369 (labels for find_tools, verified 101/101 rows), SA4E-53 (mcp_tools ingestion), SA4E-42 (McpToolsRepository scoped upsert)

---

## 1. Overview

SA4E-369 added a deterministic `labels` keyword surface to `mcp_tools` and a flat `labelBoost` (+0.15/hit, cap +0.35) on top of cosine similarity. Verified working: 101 rows, 0 NULL labels, exact-keyword queries reach 0.94–1.04 vs vector-only baseline ~0.41.

SA4E-409 tracks the follow-up: **make that boost predictable across months and MRs**, not dependent on embedding drift or ad-hoc tuning.

---

## 2. Problem

`MemoryToolSearchService.labelBoost` is a flat cap. Two failure modes:

1. **Token signal scaling** — a query with 3 matching tokens ("create jira issue ticket") gets the same boost as one with 1 ("jira"). Real intent is indistinguishable from weak intent.
2. **Cosine drift** — the embedding model or corpus changes across MRs; cosine similarity drifts and the fixed +0.35 cap no longer outranks noise. The boost is calibrated to today's embedding, not tomorrow's.

---

## 3. Goal

A **predictive** weighting function `weight(queryTokens, toolLabels, cosineScore)` that:

- **(a)** Scales with token-signal density — more matching tokens → higher weight, but **non-linearly** (diminishing returns) so a 10-token query does not swamp a 1-token query.
- **(b)** **Normalizes against cosine**: the final score is `cosine + boost * (1 - max(cosine, cosineFloor))` so the boost's influence shrinks as cosine confidence grows (high-confidence cosine needs no rescue; low-confidence needs more).
- **(c)** **Stays bounded**: output in [0, 1] regardless of input, so a future embedding drift cannot push scores out of range.
- **(d)** **Is configurable** (thresholds in config, not magic numbers) so tuning does not require a code change per MR.

---

## 4. Proposed Shape

```ts
interface LabelWeight {
  perHit: number;        // base boost per matching token (default 0.15)
  cap: number;           // absolute cap (default 0.35)
  diminishing: number;   // exponent for token-count diminishing returns (default 0.7)
  cosineFloor: number;   // cosine below this is treated as "no signal" (default 0.3)
}

// final = cosine + boost * (1 - max(cosine, cosineFloor))
// boost = min(cap, perHit * hits ^ diminishing)
```

**Behavior:**
- 1 hit, cosine 0.30 → boost = 0.15, final = 0.30 + 0.15 × 0.70 = **0.405**
- 3 hits, cosine 0.30 → boost = min(0.35, 0.15 × 3^0.7) = 0.326, final = 0.30 + 0.326 × 0.70 = **0.528**
- 10 hits, cosine 0.30 → boost = 0.35 (cap), final = 0.30 + 0.35 × 0.70 = **0.545**
- 1 hit, cosine 0.85 → boost = 0.15, final = 0.85 + 0.15 × 0.15 = **0.873** (cosine dominates)

---

## 5. Acceptance Criteria

- [ ] `find_tools("create jira issue ticket")` score ≥ 0.90 (3-token intent)
- [ ] `find_tools("jira")` score ≥ 0.55 (1-token intent, still beats vector-only ~0.41)
- [ ] `find_tools("xyzzy nonsense")` score < 0.40 (no false positive)
- [ ] Unit tests: diminishing exponent, cosine-normalization, bounded output, config-driven thresholds
- [ ] vitest green; tsc clean; no regression in existing 163 orchestration/bootstrap tests

---

## 6. Related

- **SA4E-369** — labels for find_tools (base implementation, verified 101/101 rows)
- **SA4E-53** — mcp_tools ingestion + MemoryToolSearchService
- **SA4E-42** — McpToolsRepository scoped upsert (proxy-row writer, labels parity)