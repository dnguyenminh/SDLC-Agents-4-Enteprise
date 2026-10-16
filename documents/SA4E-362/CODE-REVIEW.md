# CODE-REVIEW — SA4E-362: [Pega Ingest] Refresh-on-401 cho ingest path

| Field | Value |
|-------|-------|
| Reviewer | Fresh-context code reviewer (Phase 6, không tham gia implementation) |
| Scope | Uncommitted diff trên branch `SA4E-365` workspace — chỉ 14 file src + 5 test file SA4E-362; **EXCLUDED**: `pi-workflow/*`, `types/executor.types.ts` (SA4E-365 WIP) |
| Baseline | TDD v1.0 §2 (per-file spec), FSD v1.0 (FR-1..8, BR-1..6, §4.1 observability, §5.1 error matrix), STC v1.1 (UT-01..UT-14, PBT-01, REG-13) |
| Verification | `tsc -p ./ --noEmit` PASS; vitest targeted 6 file SA4E-362: **51/51 PASS**; full suite `vitest run`: 2987/2989 PASS — 2 fail duy nhất thuộc `pi-workflow/__tests__` (SA4E-365, out of scope) |

## Verdict: **APPROVED-WITH-MINOR-FIXES**

Thiết kế tuân thủ TDD §2 1:1 (signature, message contract, keep-unchanged zones đúng). 3 deviation đều có chủ đích, được ghi comment tại chỗ và là root-cause fix chứ không phải workaround (CR-05). Không có Critical/Major. Các Minor có thể fix nhanh trước khi commit.

## Findings

| ID | Severity | File:line | Mô tả | Đề xuất |
|----|----------|-----------|-------|---------|
| CR-01 | Minor | PegaProjectIndexer.ts:68 | FR-7 (SHOULD) threading chưa trọn: `pegaClient.crawlPlan({...})` không truyền `this.auth` (TDD §2.6 Đổi 4 liệt kê rõ call này). Path vẫn hoạt động (postBackend fallback `buildBackendAuthHeaders()` → globalThis) nhưng không có refresh-on-401 trên crawl-plan của fallback BFS path | `pegaClient.crawlPlan({ ... }, this.auth)` — 1 dòng, signature đã sẵn sàng |
| CR-02 | Minor | BackendHttpPoster.ts:43-76 | `postJson` dài 33 dòng (>20 standard) sau khi thêm khối FR-6. Logic cohesive, khớp TDD §2.8 nguyên văn | Extract khối refresh-on-401 thành private `retryOn401(res, doFetch)` nếu muốn đúng chuẩn; không blocking |
| CR-03 | Minor | PegaBfsPipeline.ts:105-131 | `run()` nay 27 dòng (>20) — thay đổi nhỏ trên hàm có sẵn | Gộp log-stop thành private helper; ưu tiên thấp |
| CR-04 | Info | bounded-channel.ts:89-91 | Getter `size` (TDD §2.10 bắt buộc thêm) **không còn consumer nào** — log stop dùng `discardedAtStop` chính xác hơn (buffer luôn rỗng sau drainDiscard) | Giữ (spec'd, observability API) hoặc xoá khi dọn; không ảnh hưởng behaviour |
| CR-05 | Info | PegaBfsPipeline.ts:64,70 / PegaBfsIndexer.ts:104 / PegaStreamIngester.ts:143-146 | 3 deviation có chủ đích so với TDD, đều được ghi comment: (1) `stopReason` thu hẹp `string\|null` → literal `"auth"\|null` (SEC-01, STC UT-08 sync note đã dự liệu); (2) `drainDiscard` + `discardedAtStop` — **TDD-gap deadlock fix**: consumer exit khi supplier đang park trên `push()` backpressure sẽ treo `run()` vĩnh viễn; drain-and-discard đánh thức supplier, không double-count (discarded ≠ skipped, inFlight release đúng 1 lần/item — đã trace đủ 8 interleaving); (3) message 401 cap 200 ký tự (`truncate` — SEC-02, message contract ngắn hơn threshold nên không vỡ) | Chấp nhận; ghi nhận vào TDD ở sync pass tiếp theo |
| CR-06 | Info | auth/__tests__/auth-manager.test.ts:265 | File mất trailing newline ở EOF | Thêm newline |
| CR-07 | Info | nhiều file mới | Comment code tiếng Việt (theo nguyên văn spec TDD §2); convention dự án là English | Non-blocking; cân nhắc chuẩn hoá khi có dịp |

## Checklist kết quả

1. **withAuthRetry/fetchWithAuthRetry** — retry CHỈ khi `res.status === 401` thực (network error/timeout không tới điểm check — exception propagate); đúng 1 retry (kết quả send thứ 2 trả thẳng, kể cả 401); refresh `undefined` → trả 401 gốc không retry; `makeBody()` factory: `idx` trong factory → stream instance mới encode lại từ đầu (UT-04 assert 2 instance khác nhau + duplex 'half' cả 2); poll rebuild headers per-iteration qua `authHeaders()` trong send closure (UT-05). ✅
2. **PegaBfsPipeline** — `shouldStop` check tại supply() loop-top VÀ consume() đầu vòng; `drainDiscard` fix deadlock park-on-push (đã verify BoundedChannel push/take/close semantics: take chỉ park khi buffer rỗng ⇔ push chỉ park khi buffer đầy — hai trạng thái loại nhau, drain luôn đánh thức supplier → close đạt được → take trả done); discarded không đếm skipped, `inFlight--` đúng 1 lần/item; `stopReason` set đúng 1 lần (guard trong `checkStop`); path `aborted` giữ nguyên throw, thắng khi cả hai (EF-1). ✅
3. **PegaBfsIndexer** — `err instanceof IngestAuthError` (không regex), đặt trước catch-generic giữ nguyên; `authNotified` guard 1 log ⛔ + 1 notification, reset đầu run(); non-auth path không đổi; `localIndex.flush()` trong finally + rule A `{ingested:false}` giữ eligible → rerun incremental. ✅
4. **Constructor threading** — grep toàn repo: mọi call site `PegaStreamIngester` (2), `PegaBfsIndexer`, `PegaCatalogIndexer`, `PegaProjectIndexer`, `PegaSchemaIndexer`, `PegaCodeIntelDiscovery`, `BackendHttpPoster` đã cập nhật; tsc strict PASS; không có `any` cast che miss tại call site; union `BackendHttpPoster` discriminate bằng `typeof === "function"` an toàn; 3 test cũ poster (:31/:44/:58) không sửa, vẫn PASS. ✅
5. **Standards** — xem bảng metrics; không console.log mới (console.debug PegaProjectIndexer:137 là có sẵn); không `any` leak trong code mới; naming tuân chuẩn. ⚠️ 2 Minor function-length (CR-02/03)
6. **Tests** — đúng convention (`vi.stubGlobal('fetch')`, `jsonResponse`, fake timers UT-05, không sleep thật, PBT-01 `fc.asyncProperty` 100 runs — fast-check ^4.9.0 có sẵn trong package.json từ trước, không thêm dep); UT-08 dùng supercession assertion đã ghi trong TDD §5; PegaBfsPipeline test chạy chain THẬT indexer→pipeline→ingester, chỉ stub fetch + mock vscode — không over-mock; UT-10 append vào file test cũ (tái dùng helper, không duplicate). ✅
7. **BR conformance** — xem bảng dưới; grep BR-6: không interpolation token trong bất kỳ log mới (chỉ `endpoint=`). ✅

## Standards metrics

| File (SA4E-362) | LOC | Ghi chú |
|-----------------|-----|---------|
| utils/backend-auth-headers.ts | 74 | Mới + extend; ≤200 ✅ |
| code-intel/delta/BackendHttpPoster.ts | 76 | ≤200 ✅ |
| services/pega/PegaBackendClient.ts | 78 | ≤200 ✅ |
| services/bounded-channel.ts | 91 | ≤200 ✅ |
| services/PegaHttpClient.ts | 96 | ≤200 ✅ |
| services/PegaCodeIntelDiscovery.ts | 150 | ≤200 ✅ |
| services/PegaCatalogIndexer.ts | 173 | ≤200 ✅ |
| services/PegaSchemaIndexer.ts | 238 | Changed (pre-existing 219) |
| services/PegaBfsPipeline.ts | 287 | Changed (pre-existing ~232) |
| services/PegaStreamIngester.ts | 296 | Changed (pre-existing ~233) |
| services/PegaProjectIndexer.ts | 354 | Changed (pre-existing) |
| services/PegaBfsIndexer.ts | 369 | Changed (pre-existing) |
| services/IndexingService.ts | 379 | Changed (pre-existing) |
| Test mới: PegaStreamIngester.auth-retry | 261 | Test file — trong convention repo (max có sẵn 931) |
| Test mới: PegaBfsPipeline.auth-dead / IndexingService.ingest-auth / PegaSchemaIndexer.auth | 150 / 67 / 66 | ✅ |
| Hàm mới dài nhất | `withAuthRetry` 17 dòng; `ingestAuthProvider` 20 dòng | ≤20 ✅ |
| Hàm changed vi phạm >20 | `postJson` 33 (CR-02), `run` 27 (CR-03); submitJob/poll/ingestSingle/supply/consume dài có sẵn | Minor |

## BR conformance

| BR | Rule | Bằng chứng | Kết luận |
|----|------|-----------|----------|
| BR-1 | Refresh CHỈ khi HTTP 401 | `withAuthRetry` check `res.status !== 401` return; BackendHttpPoster/postBackend/discovery/schema cùng điều kiện; UT-03 (400/403/500/503 → 0 refresh), UT-10c, PBT-01 bất biến | ✅ PASS |
| BR-2 | Retry đúng MỘT lần, không retry khi refresh undefined | `send(fresh)` trả thẳng không loop; `fresh === undefined` → return 401 gốc; UT-02, UT-14, UT-10b, PBT-01 (fetch ≤ 2, refresh ≤ 1 trên 100 runs) | ✅ PASS |
| BR-3 | Không auto-login | Không lời gọi login nào trong change-set; UT-08 assert không auto-login; refresh chết → notification "login lại" | ✅ PASS |
| BR-4 | Graceful stop, state preserved, rerun incremental | `shouldStop` → supplier break → close; `drainDiscard` bảo đảm liveness (CR-05.2); run() return counters bình thường (không throw); UT-08 (skippedCount=1, fetchMock×1, stopReason='auth'); localIndex.flush finally | ✅ PASS |
| BR-5 | Token rỗng → không Authorization | `authHeaders` guard `if (token)`; `buildBackendAuthHeaders` giữ nguyên guard; UT-07 (Authorization undefined, X-Project-Id còn); UT-13 call#1 có Bearer (root-cause "thiếu hẳn header" đã fix) | ✅ PASS |
| BR-6 | Không log token; 1 notification per run | Grep: log chỉ chứa endpoint/label; UT-05 assert log không chứa stale/fresh-token; `authNotified` guard; UT-08 assert đúng 1 ⛔ log + 1 showWarningMessage | ✅ PASS |

## Test traceability (STC v1.1)

| STC | File | Trạng thái |
|-----|------|-----------|
| UT-01..UT-07, UT-14, PBT-01 (+SEC-02 extra) | services/__tests__/PegaStreamIngester.auth-retry.test.ts | ✅ 10 tests PASS |
| UT-08, UT-09 | services/__tests__/PegaBfsPipeline.auth-dead.test.ts | ✅ 2 tests PASS |
| UT-11 | services/__tests__/IndexingService.ingest-auth.test.ts | ✅ 3 tests PASS |
| UT-13 | services/__tests__/PegaSchemaIndexer.auth.test.ts | ✅ 1 test PASS |
| UT-10a-c (+3 cũ) | code-intel/delta/__tests__/BackendHttpPoster.test.ts (append) | ✅ 6 tests PASS |
| UT-12 | auth/__tests__/auth-manager.test.ts (append) | ✅ PASS |
| REG-13 | full `vitest run` | ✅ 2987/2989 (2 fail = pi-workflow SA4E-365, excluded) |
| SIT-01/02, E2E-API-01..04 | Manual / covered-by-SIT theo STC §Revision | N/A (QA) |

## Kết luận

Change-set SA4E-362 đạt chuẩn design + correctness. Khuyến nghị fix CR-01 (1 dòng) và CR-06 trước khi commit; CR-02/03/07 có thể gom vào dịp dọn dẹp. Sau khi commit, branch SA4E-362 sẵn sàng cho TA gate.
