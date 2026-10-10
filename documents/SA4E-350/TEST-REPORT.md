# [SA4E-350] Test Report
**Ticket:** SA4E-350 — Pega CodeIntelligence: rules/query strips '@baseclass' appliesTo → 0 results; short insKey 404 on custom service
**Author:** qa-agent (main agent coordination) | **Date:** 2026-10-10
**Verdict:** ✅ **PASS**

---

## 1. Root Cause (confirmed with real-server evidence)

Custom REST service `/api/CodeIntelligence/v1/rules/query` matches `appliesTo` exactly. Probe results (academy server, operator SSA@TGB):

| Probe | Request | Response |
|-------|---------|----------|
| A1 | `appliesTo=` (empty — client behavior before fix) | 200, results=**0** → not found |
| A2 | `appliesTo=@baseclass` | 200, results=**1** → found (`RULE-HTML-SECTION @BASECLASS PZBULKACTIONS #20180713T134741.673 GMT`) |
| B1 | `/rules/instance` SHORT insKey (no #timestamp) | **404** Rule not found |
| B2 | `/rules/instance` FULL pzInsKey (with #timestamp) | **200** + full rule JSON (20,451 B) |

Client code stripped `@baseclass` before querying (`PegaRuleReadClient.getObject` line 17). Additionally, the query result row is a **handle-only row** (10 fields: pxObjClass/pxUpdateDateTime/pxUpdateOperator/pyClass/pyClassName/pyRuleAvailable/pyRuleName/pyRuleSet/pyRuleSetVersion/pzInsKey — NO content); full content requires a `/rules/instance` follow-up with the row's full pzInsKey.

## 2. Fix (commit `96cc3b3`, branch main)

`extension/src/services/pega/PegaRuleReadClient.ts`:
1. **`getObject()`** — keep `@baseclass` verbatim in the triple query; `queryByTripleWithCompatRetry` retries with empty appliesTo ONLY when the exact query misses AND the original was `@baseclass` (server compat; auth/5xx rethrow fail-loud).
2. **`fetchFullRuleIfHandleRow()`** — when the triple query returns a handle-only row (all keys ⊆ HANDLE_FIELDS + has pzInsKey), follow up `/rules/instance` with the full pzInsKey to fetch the complete rule JSON for KB indexing; soft fallback to the handle row.

Callers `PegaCrawlHelper.fetchRulesInParallel` + `PegaMcpTools` unchanged (pass `pyClassName` through).

## 3. Verification

| Level | Result |
|-------|--------|
| Unit tests (`pega-rule-read-client.test.ts`) | ✅ 6/6 PASS (verbatim passthrough, compat retry, handle follow-up, instance-fail soft fallback, full-body no follow-up, non-@baseclass no retry, 401 fail-loud) |
| Full suite | ✅ 2405/2405 PASS (252 files) — before fix commit |
| tsc / lint | ✅ exit 0 / exit 0 |
| Runtime verify (REAL fixed client + REAL academy server, temp suite deleted after) | ✅ 3/3 PASS: pzBulkActions resolved (full insKey + full rule via instance follow-up); pzModalButtonsConfiguration (user-reported) resolved; regression pxIsMobileDevice resolved |
| Deploy | ✅ 1.47.2 packaged (22.66 MB) + installed into Kiro (`dnguyenminh.sdlc-agents-4-enterprise@1.47.2`) |

## 4. UAT Checklist (user, extension 1.47.2 — reload Kiro first)

1. Index Source Code → `@baseclass` rules (pzBulkActions, pzModalButtonsConfiguration, pxIsMobileDevice…) download ✅ thay vì "❌ Not found"
2. KB entries cho các rule đó có full content (không còn handle trống)
3. Rules non-@baseclass vẫn resolve bình thường (regression)
