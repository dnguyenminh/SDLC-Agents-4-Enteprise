# STP.md — SA4E-387

## **Tiêu đề**
Test Plan — Enrichment với Dynamic Context Budget & Runtime Model Swap

## **Mô tả**
Test Plan cho chức năng enrich LLM với Dynamic Context Budget và Runtime Model Swap.

> ⚠️ **Điều kiện tiên quyết:** Code cho SA4E-387 chưa được implement trong repo (xem DISCREPANCY.md). Bản test plan này mô tả chiến lược và modules/taarget đúng theo **code thật đã commit**; các mục ngày/thời gian chỉ là dự kiến, được hiệu chỉnh khi kế hoạch chạy thật.

## **Test Strategy**
1. **Unit Testing**: Từng module riêng lẻ — `computeInputBudget`, `capTotalPrompt(messages, budget)`, TTL cache của `ContextWindowDiscovery`, `truncateToTokens`.
2. **Integration Testing**: Tương tác giữa modules — `CodeEnrichmentHandler.enrichSymbol` với LLMService stub, chuyển model giữa 2 lần gọi `complete()`.
3. **End-to-End Testing**: Flow enrich qua TaskWorker (+ endpoint `POST /model/swap` theo design).
4. **Property / Regression Testing**: Với các cặp (kích thước body × window) ∈ {8k, 32k, 128k}: prompt gửi ≤ budget, không overflow (theo FSD §10).
5. **Performance Testing**: Đo baseline và so sánh trước/sau patch (ticket không chỉ định target cụ thể — định nghĩa baseline khi chạy thực tế).
6. **Security Testing**: Xét swap runtime + cache invalidation không gây lỗi/stale state.

## **Test Scope** (theo code thật đã commit)
| **Module** | **File** | **Mục tiêu test** |
|------------|----------|-------------------|
| LLMService | `backend/src/modules/memory/llm/LLMService.ts` | Per-call model resolution; `setActiveModel` + hook `onModelChanged` (mới) |
| ContextWindowDiscovery | `backend/src/modules/memory/llm/context-window.ts` | TTL cache (`WINDOW_CACHE_TTL_MS`), env per-model (`LLM_CONTEXT_WINDOW__<model>`), fallback 8192 |
| OllamaAdapter | `backend/src/modules/memory/llm/ollama-adapter.ts` | `options.num_ctx = config.contextWindow` |
| CodeEnrichmentPromptBuilder | `backend/src/engine/enrichment/CodeEnrichmentPromptBuilder/` | `capTotalPrompt` nhận budget động; `bodyBudget` dẫn xuất |
| CodeEnrichmentHandler | `backend/src/engine/enrichment/CodeEnrichmentHandler.ts` | Truyền `inputBudget` xuyên suốt; `callLLMWithTimeout` (timeout 120s) |
| ReductionPipeline | `backend/src/engine/enrichment/reduction-pipeline.ts` | `reduce()` thật thay stub; `MAX_REDUCE_ROUNDS=3`, `MAX_CHUNKS_PER_RULE=32` |
| TaskWorker wiring | `backend/src/modules/memory/task-queue/TaskWorker.ts` | Dispatch `CODE_ENRICHMENT` đúng path|
| HTTP layer | `POST /model/swap` (mới theo design) | Swap + invalidate cache |

## **Test Environment**
- **Runtime**: Node.js (theo `backend/package.json` engines).
- **Database**: `DatabaseAdapter` — dùng SQLite in-memory cho test (PostgreSQL adapter chỉ cho môi trường đầy đủ).
- **Model Providers**: Adapter thật có sẵn: `Ollama`, `OpenAI` (type `LLMProvider` gồm 8 giá trị: ollama, openai, anthropic, gemini, lmstudio, copilot, opencode, opencode-zen).
- **Test Data**: `backend/tests/testdata/sample-code*.txt`.

## **Test Schedule** (dự kiến — hiệu chỉnh khi bắt đầu Phase 6)
| **Phase** | **Thời gian** | **Trách nhiệm** |
|------------|------------|------------|
| Unit Testing | 2 ngày | Dev Team |
| Integration Testing | 2 ngày | Dev Team |
| End-to-End Testing | 3 ngày | QA Team |
| Performance Testing | 2 ngày | Dev Team |
| Security Testing | 2 ngày | Security Team |

## **Test Cases**
Xem chi tiết tại **STC.md** (bản v2 — chưa thực thi, chỉ spec).

## **Risk Analysis**
| **Rủi ro** | **Mức độ** | **Giải pháp** |
|------------|------------|------------|
| Model swap runtime gây stale cache | Cao | Bracket `onModelChanged` → `invalidateWindowCache()` (BR-02) |
| Budget động không chính xác | Trung bình | Property test nhiều cặp window × body (FSD §10) |
| Ollama adapter không nhận `num_ctx` | Trung bình | Capture payload ở proxy/spy (TC-006) |
| `reduce()` risk fail khi map quá round | Cao | Bounded rounds + best-effort summary (BR-08/BR-09/BR-10) |
| In-flight request crash khi swap | Trung bình | Giữ request trên adapter cũ, chỉ request mới dùng adapter mới |

## **Checklist**
- [ ] Tạo Test Cases chi tiết (STC.md v2 — ✅ đã định nghĩa, chưa chạy).
- [ ] Implement code theo design (Phase 5) — **điều kiện bắt buộc trước khi test**.
- [ ] Thực hiện Unit Testing.
- [ ] Thực hiện Integration Testing.
- [ ] Thực hiện End-to-End Testing.
- [ ] Thực hiện Performance Testing.
- [ ] Thực hiện Security Testing.

## **Tài liệu tham khảo**
- `documents/enrichment-runtime-model-swap/TDD-Enrichment-Dynamic-Context-Budget.md` (design gốc SA4E-387)
- `documents/SA4E-387/FSD.md` §10 — Test mapping
- `documents/SA4E-387/STC.md`

## **Lịch sử thay đổi**
- **2026-10-28**: Tạo Test Plan ban đầu (chưa đúng scope code).
- **2026-10-31**: Viết lại Test Scope theo modules đã commit thật; gỡ các mục dựa trên code/fabrication chưa từng tồn tại.

---
