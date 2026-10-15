# System Test Report (TEST-REPORT) — SA4E-44

## SA4E-44 — Persistent Task Queue & Code Intelligence Migration — Real ONNX Embedding (AD-6) — Workstream B (WS-B)

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-44 |
| Report Version | **1.0** |
| Date | 2026-10-15 |
| Tester | qa-agent (documentation-only evidence record — see §2.1 disclaimer) |
| Evidence session | 2026-10-15 — all evidence below was **executed and verified** in that session and is **recorded here verbatim** (not re-run) |
| Scope of this report | **Workstream B (WS-B) only** — real ONNX semantic embedding replacing the hash pseudo-embedding (decision **AD-6**) |
| Companion report | SA4E-335 TEST-REPORT **v1.2** — "Delta 2026-10-15 — WS-A MCP child servers (evidence record)" (same evidence session; WS-A covered the new Dockerfile stages: build check, image contents, SEC-05, stdio smoke of both MCP child servers, model bake) |
| Basis documents | SA4E-44 TDD v2.1 (EmbeddingService/ONNX component, VECTOR_EMBEDDING task type), SA4E-335 TDD §2.3 (AD-1..AD-7; **AD-6** = conditional-adopt of the cached embedding model), SA4E-44 STP/STC v1.0 |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-15 | qa-agent | Initial report — WS-B evidence record (real ONNX embedding, AD-6). Verdict **PASS with ⚠️ mandatory-reindex operational caveat (§6)**. |

---

## 1. Executive Summary

| Metric | Value |
|--------|-------|
| **Overall verdict** | ✅ **PASS — with ⚠️ mandatory operational caveat (§6: REINDEX MANDATORY AFTER DEPLOY)** |
| Unit suite (backend) | **332 files / 3,472 tests PASSED**, 19 skipped |
| Production build | `npm run build` (tsc) — **clean** |
| Inference backend (verified at runtime) | `onnx` — **384 dims** (`Xenova/paraphrase-multilingual-MiniLM-L12-v2`, quantized) |
| Semantic sanity (cosine) | related pair **0.783** (in-container) / **0.767** (local) vs unrelated pair **0.281** (local) — real semantic discrimination confirmed |
| Container-hardening compatibility | inference **succeeds with `--read-only --tmpfs /tmp`** — the production security posture (read-only rootfs) is preserved |
| Test-suite delta | **1 test updated**: `admin.test.ts` embedding assertion, per the new embedding config (§4.4) |
| Defects raised | **0** |

**Headline:** the embedding path is no longer a sin-hash pseudo-embedding. A real ONNX backend (`@huggingface/transformers` **4.3.1**) produces semantically meaningful 384-dim vectors, works inside the hardened read-only container, is backed by a fully green unit suite and a clean tsc build, and the Dockerfile **bakes the model into the image** (`ARG BAKE_EMBEDDING_MODEL=true` → `/app/models-cache` + `ENV TRANSFORMERS_CACHE`) so the runtime works fully offline. The single deployment-critical consequence is recorded as a **prominent caveat**: vectors produced by the old hash pseudo-embedding are **incompatible** with the new ONNX vectors — the existing corpus **MUST be purged and re-indexed after deploy** (§6).

---

## 2. Scope & Basis

### 2.1 ⛔ Evidence-record disclaimer (read first)

This report is a **documentation-only artifact**. Every number, command result and observation in §4 was **executed and verified in the 2026-10-15 evidence session** and is recorded here **verbatim**. While writing this report, **no test, build, container, or other mutating command was re-executed**. Each recorded item was additionally **cross-referenced against the current repo state** (source files, Dockerfile, package.json, test files) — cross-reference outcomes are annotated inline in §4.5. Cross-references confirmed **no inconsistency** between the recorded evidence and the code as it stands on 2026-10-15.

### 2.2 What was tested (WS-B)

1. **Real ONNX inference end-to-end** — locally and inside the hardened production container (`--read-only --tmpfs /tmp`).
2. **Semantic correctness** — cosine similarity on a related-topic pair vs an unrelated-topic pair.
3. **Regression safety** — full backend unit suite + clean `tsc` build (one intentional test update, §4.4).
4. **Implementation conformance** — `EmbeddingService` facade (caller API unchanged), `OnnxEmbeddingBackend` + `HashEmbeddingBackend` fail-over (single ERROR log via the `onnxFailed` latch), Dockerfile model bake.

### 2.3 Out of scope (not tested, not claimed)

- Execution of the reindex itself — that is the **post-deploy operational step mandated in §6**.
- pgvector query-path performance at production scale.
- Runtime model-download-failure path (only the code-level fail-over/latch was verified; the hash fallback itself is unit-tested).
- Non-quantized model variant, GPU execution, multi-process model sharing.

---

## 3. Test Environment

| Component | Value |
|-----------|-------|
| Local run | backend workspace, node/tsx — same 2026-10-15 session |
| In-container run | production image with the **baked model cache** (built in the same session — see SA4E-335 TEST-REPORT v1.2 Delta: `/app/models-cache` 130 MB, `model_quantized.onnx` + `config.json`), executed with `--read-only --tmpfs /tmp` |
| Model | `Xenova/paraphrase-multilingual-MiniLM-L12-v2`, quantized (q8), 384 dims, CPU, mean pooling + L2 normalization |
| Library | `@huggingface/transformers` **4.3.1** (exact-pinned in `backend/package.json`) |

---

## 4. Evidence

### 4.1 Unit suite (backend)

| Item | Result |
|------|--------|
| Test files | **332** |
| Tests | **3,472 PASSED** |
| Skipped | 19 |
| Build | `npm run build` (tsc) — **clean**, exit 0 |

### 4.2 ONNX inference — semantic correctness

| Scenario | Run context | backend | dims | cosine |
|----------|-------------|---------|------|--------|
| Related pair: *"deploy the backend docker image"* vs *"docker deployment of the backend"* | **in-container**, `--read-only --tmpfs /tmp` | onnx | 384 | **0.783** |
| Related pair (same texts) | local run | onnx | 384 | **0.767** |
| Unrelated-topic pair (Vietnamese) | local run | onnx | 384 | **0.281** |

**Interpretation (recorded):** related-pair similarity ≈ 0.77–0.78 vs ≈ 0.28 for the unrelated pair — the backend discriminates semantically related from unrelated text, i.e. vectors are semantically meaningful (not pseudo-random hash output). The container-vs-local delta on the same pair (0.783 vs 0.767) is small numerical variance between runs on the same quantized model — recorded as expected behaviour, not a defect.

### 4.3 Container read-only inference

| Check | Result |
|-------|--------|
| Runtime flags | `--read-only --tmpfs /tmp` (mirrors the production hardening from SA4E-335: read-only rootfs + tmpfs) |
| Reported backend | **onnx** |
| Reported dims | **384** |
| Inference | **succeeded** (cosine computed, §4.2 row 1) |

**Meaning (recorded):** the transformers.js/ONNX pipeline requires no writable rootfs beyond `/tmp` — the real embedding path is compatible with the hardened production container.

### 4.4 Test-suite delta — 1 test updated

| File | Change | Rationale |
|------|--------|-----------|
| `backend/src/server/routes/__tests__/admin.test.ts` (L342–345) | embedding assertion updated to the new config: `config.embedding.model = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2'`, `config.embedding.backend = 'onnx'`, `config.embedding.dimensions = 384` | the admin config now reports the **real** embedding configuration (previously the hash sentinel) — the assertion was updated to match the new intended behaviour, not weakened |

**Repo cross-ref:** ✅ verified present verbatim at the cited lines.

### 4.5 Implementation under test (recorded vs repo cross-reference)

| Component | Recorded (evidence session) | Repo cross-ref (2026-10-15) |
|-----------|------------------------------|------------------------------|
| `EmbeddingService` facade | caller API unchanged; fail-over to hash fallback logs **ERROR once** (`onnxFailed` latch — process-lifetime; restart to retry ONNX) | ✅ `backend/src/engine/parsers/embedding/EmbeddingService.ts` — `onnxFailed` at L30/56/72/103; header cites "SA4E-44 / AD-6" |
| `OnnxEmbeddingBackend` | `@huggingface/transformers` 4.3.1, `Xenova/paraphrase-multilingual-MiniLM-L12-v2`, 384 dims | ✅ `backend/src/engine/parsers/embedding/OnnxEmbeddingBackend.ts` (`kind='onnx'`, dynamic import, mean pooling + L2 norm); `backend/package.json` L54 `"@huggingface/transformers": "4.3.1"` |
| `HashEmbeddingBackend` fallback | degraded fallback so indexing/search never crash | ✅ `HashEmbeddingBackend.ts` — `kind='hash'`, sentinel `modelId='sin-hash-fallback'` |
| Dockerfile model bake | `ARG BAKE_EMBEDDING_MODEL=true` (default ON) bakes the model into `/app/models-cache` with `ENV TRANSFORMERS_CACHE` | ✅ `backend/Dockerfile` L69–80 (bake in build stage), L177–180 + L233–234 (`COPY --from=build /app/models-cache` + `ENV TRANSFORMERS_CACHE=/app/models-cache` in runtime stages) |
| Canonical vector size | 384 | ✅ `EmbeddingBackend.ts` L13 `EMBEDDING_DIMENSIONS = 384` — applies to **both** backends (see §6 precision note) |
| Reindex machinery | referenced for the post-deploy reindex | ✅ `backend/src/modules/orchestration/reindex/ReindexService.ts` |

---

## 5. Traceability

| Requirement / design item | Source | Evidence in this report |
|---------------------------|--------|-------------------------|
| Real semantic embeddings via `EmbeddingService` (ONNX) — component spec, `VECTOR_EMBEDDING` task type + payload schema, degradation behaviour ("model not loaded → reset task to PENDING"; "service unavailable → mem_ingest succeeds, task not created") | SA4E-44 TDD v2.1 (component table L142; task flow L496; schema L712–730; degradation L788/798) | §4.1 (suite incl. EmbeddingService unit tests), §4.2 (runtime semantics), §4.5 |
| **AD-6** — cached embedding model, conditional-adopt from SA4E-44 items D-7..D-10; pre-download into `TRANSFORMERS_CACHE` at build, copy into production, `ENV TRANSFORMERS_CACHE` | SA4E-335 TDD §2.3 (L88), stage table (L109–110), env table (L239) | §4.3 (in-container inference), §4.5 (Dockerfile rows; WS-A image contents: `/app/models-cache` 130 MB) |
| Admin config surface: `embeddingModelId` / `embeddingCacheDir` (`TRANSFORMERS_CACHE`) / `embeddingQuantized` | `backend/src/config/index.ts` L53–56, L172–179 (comments cite "SA4E-44 / AD-6") | §4.4 (admin.test.ts asserts model/backend/dims) |
| Offline runtime — no model fetch at boot (model baked at build) | SA4E-335 BR-04 intent / AD-6 | §4.3 + WS-A evidence (model baked 130 MB; inference ran in-container) |

---

## 6. ⚠️ OPERATIONAL CAVEAT — REINDEX MANDATORY AFTER DEPLOY

> ### ⛔ DEPLOY IS **NOT COMPLETE** UNTIL A FULL RE-INDEX HAS RUN

| Rule | Detail |
|------|--------|
| **Incompatibility** | Vectors produced by the **old hash pseudo-embedding are INCOMPATIBLE** with the new ONNX 384-dim vectors. |
| **Why (precision)** | Hash vectors are deterministic sin-hash values with **no semantic meaning**; ONNX vectors are real model embeddings. **Both are 384-dim** (`EMBEDDING_DIMENSIONS = 384` is canonical for both backends), so old and new vectors coexist in the same column/slot **without any type or dimension error** — but they occupy **unrelated semantic spaces**. Cross-generation cosine comparison is therefore **garbage**: mixed corpora yield meaningless similarity scores and wrong search results, with **no crash and no error to warn you**. |
| **Cross-generation comparison** | **FORBIDDEN** — never compare or mix vectors generated before this change with vectors generated after it. |
| **Required action** | Immediately after deploying this build: **purge all stale (hash-era) vectors** and **re-index the corpus via `ReindexService`** (`backend/src/modules/orchestration/reindex/ReindexService.ts`). |
| **Detection of incomplete reindex** | Admin config exposes `embedding.backend` / `embedding.model`: if it ever reports `backend='hash'` / `model='sin-hash-fallback'`, the process is running in degraded fallback mode and freshly written vectors are hash-era vectors again. An `ERROR` log from `EmbeddingService` (single-shot `onnxFailed` latch) marks the fail-over moment. |
| **Failure mode if skipped** | Silent ranking/search degradation — no exception, no health-check impact. |

---

## 7. Verdict & Recommendation

**✅ PASS (v1.0 — WS-B evidence record)** — real ONNX embedding verified functionally (§4.2), operationally inside the hardened container (§4.3), and by regression (§4.1: 3,472 PASS / tsc clean). Zero defects raised.

1. **Deploy checklist (mandatory order):** deploy image → **purge stale hash-era vectors** → run full **`ReindexService`** re-index → verify no hash-era vectors remain and `embedding.backend` reports `onnx`. Deploy without reindex = silently broken search (§6).
2. **Monitoring:** alert on the `EmbeddingService` ERROR (ONNX fail-over) and on `embedding.backend='hash'` in admin config — either means the deployment is producing incompatible vectors again.
3. **Non-blocking follow-ups (suggested):** automated guard/alarm against mixed-generation vector corpora; E2E test covering the pgvector query path with ONNX vectors at scale; exercise the runtime model-download-failure path.

*Documentation hygiene: this report was produced as a documentation-only record (autonomy L3 task brief). No tests, builds or containers were re-run while writing it; no production code, documents of other agents, or KB state were modified. Evidence source: 2026-10-15 verification session (WS-B), cross-referenced against repo state on 2026-10-15 with zero inconsistencies found.*
