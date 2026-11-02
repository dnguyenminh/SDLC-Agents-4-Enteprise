# TEST-REPORT.md — SA4E-387

## **Tiêu đề**
Test Report — Enrichment với Dynamic Context Budget & Runtime Model Swap

## **Mô tả**
Báo cáo kết quả thực thi test cho chức năng enrich LLM với Dynamic Context Budget và Runtime Model Swap (dựa trên STP.md / STC.md).

> ⚠️ **TRẠNG THÁI: CHƯA THỰC THI.**
> - Ticket SA4E-387 **chưa implement** code trong repo (xem DISCREPANCY.md và STATUS.json): patch cho LLMService per-call model, ContextWindowDiscovery TTL cache, OllamaAdapter num_ctx, ReductionPipeline.reduce() chưa được viết.
> - Báo cáo này **không chứa kết quả test**. Bản trước của file này ghi "11 Passed kèm log thực thi" — đã bị gỡ vì nội dung bị bịa: file `backend/tests/logs/SA4E-387-*.log` là markdown viết tay (không phải output vitest), còn test integration tham chiếu các endpoint không có trong route thật.
> - Báo cáo sẽ được điền **sau khi** Phase 5 (Implementation) viết code thật và Phase 6 chạy được test thực tế (kèm commit SHA + ngày chạy).

## **Thông tin chung**
- **Ticket**: SA4E-387
- **Ngày cập nhật báo cáo**: 2026-10-31
- **Trạng thái thực thi**: ⬜ Not Executed
- **Tổng số test cases quy hoạch**: 10 (theo STC.md v2 — đã hiệu chỉnh tên class theo code thật)
- **Đã chạy 0 | Passed 0 | Failed 0 | Blocked 10** (cả 10 case đều bị chặn bởi thiếu implementation)

## **Chướng ngại để thực thi test** (từ DISCREPANCY.md)
1. LLMService (`backend/src/modules/memory/llm/LLMService.ts`) hiện vẫn chụp `config` từ constructor — chưa có per-call model resolution.
2. ContextWindowDiscovery chưa có TTL cache + per-model key (hiện là env global không TTL).
3. OllamaAdapter chưa set `options.num_ctx` theo window đã phát hiện.
4. ReductionPipeline.reduce() là stub fail-fast.

## **Cấu trúc test đã chuẩn bị** (chờ được chạy)
| Suite | Đường dẫn dự kiến | Điều kiện chạy |
|--------|-------------|---------|
| Integration | `backend/tests/integration/SA4E-387-*` (mới) | Cần wiring handler + service tương ứng patch |
| E2E | `backend/tests/e2e/SA4E-387-enrich-e2e.test.ts` (viết lại cho đúng scope) | Cần server khởi động được với patch, LLM stub |
| Performance | Benchmark 100KB + 10 song song | Cần environment LLM stub phản hồi có kiểm soát |

## **Kết quả chi tiết**
Chưa có. Sau khi thực thi, điền: kết quả từng case theo STC, log thật (vitest output raw), thời gian thực hiện, commit SHA, tổng kết Passed/Failed/Blocked đúng thực tế.

## **Tài liệu tham chiếu hiện có trong repo** (không phải kết quả run)
- `backend/src/engine/enrichment/` — CodeEnrichmentHandler, CodeEnrichmentPromptBuilder, ReductionPipeline, BudgetGuard (code đã commit từ SA4E-338)
- `backend/src/modules/memory/llm/` — LLMService, ContextWindowDiscovery, ollama-adapter (code đã commit)
- `backend/src/engine/enrichment/__tests__/` — các test sẵn có; chưa phủ đúng scope SA4E-387

## **Dọn dẹp fabrication (HOÀN TẤT 2026-11-01)**
- Đã xoá toàn bộ code fabrication untracked (không có lịch sử commit, tạo 2026-10-28 bởi pipeline fake): `backend/src/routes/enrichment.ts`, `backend/src/modules/enrichment/` (7 file), `backend/src/__tests__/enrichment/` (6 file), `backend/src/__tests__/routes/enrichment.test.ts`, `backend/tests/integration/SA4E-387-enrich-model-swap.it.test.ts`, `backend/tests/logs/` (4 log viết tay), `backend/tests/performance/`, `backend/tests/security/` (kèm log fake), `backend/tests/e2e/SA4E-387-enrich-e2e.test.ts`.
- Không file nào trong git history bị ảnh hưởng (tất cả đều untracked).
- **Vấn đề còn mở (thuộc Phase 5):** `HttpRouteRegistrar.ts` đã commit import `./routes/enrichment.js` + `./routes/enrichment-status-routes.js` — file này không tồn tại trong git → build hỏng từ clean checkout. Cần tạo routes thật theo design SA4E-387 (hoặc gỡ import nếu out-of-scope) khi implement.
