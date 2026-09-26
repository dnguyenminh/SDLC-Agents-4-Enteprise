# Yêu cầu fix: Bỏ đường enrichment trùng lặp (Path A) + dedup CODE_ENRICHMENT tasks

## Bối cảnh & Vấn đề (đã trace, xác nhận qua DB PostgreSQL)

Có **HAI đường** tạo `pending_tasks(task_type='CODE_ENRICHMENT')` cùng chạy trong một lần
`IndexingEngine.runFullIndex`, gây **task trùng lặp** và số liệu enrichment phình to.

Bằng chứng: `pending_tasks(CODE_ENRICHMENT)` toàn hệ thống = **72,946**; Enrichment Total UI
(1180) > số symbols thật của project SF (886). Trùng lặp + tích lũy qua nhiều lần re-index.

### Path A — `queueCodeSummaryTasks` (PHỤ, kém hơn — CẦN BỎ)
File: `backend/src/engine/graph/graph-sync-service.ts`
- Gọi từ `syncProjectSymbols()` (dòng ~50):
  `this.queueCodeSummaryTasks(projectId, symbols).catch(...)`
- Hạn chế:
  - `symbols.slice(0, 200)` — cap cứng 200.
  - Bắt buộc `body_embeddings` (token_count ≥ 10, text ≥ 50) → bỏ qua kind non-function.
  - INSERT với `entry_id = 0`, KHÔNG set `project_id`, KHÔNG kiểm `enrichment_status`
    (không dedup) → tạo lại task mỗi lần index.
  - Không dùng `TaskType`/`TaskStatus` enum, không `workspaceType`.

### Path B — `CodeEnrichmentTaskCreator` (CHÍNH, đầy đủ — GIỮ)
File: `backend/src/engine/enrichment/CodeEnrichmentTaskCreator.ts`
- Gọi từ `IndexingEngine.runFullIndex → createEnrichmentTasks → createTasksForProject`.
- Ưu điểm:
  - Bao phủ đầy đủ `ENRICHABLE_KINDS` + mọi `pega_*` (isPegaKind).
  - KHÔNG cần body (query thẳng `symbols`).
  - Lọc `enrichment_status` (NULL/FAILED/COMPLETED-thiếu-summary) → tránh trùng.
  - Cross-scope dedup theo content_hash (copy thay vì gọi LLM lại).
  - `entry_id = symbolId`, có `project_id`, `workspaceType`, dùng enum, LIMIT 500.

→ Path B đã làm tốt hơn Path A về mọi mặt. Path A chỉ gây trùng lặp + rác.

## Yêu cầu fix

### Fix 1 (chính) — GỠ Path A khỏi graph-sync
Trong `backend/src/engine/graph/graph-sync-service.ts`:
1. XÓA lời gọi `this.queueCodeSummaryTasks(projectId, symbols)` trong `syncProjectSymbols()`.
2. XÓA hẳn method `queueCodeSummaryTasks(...)` (không còn nơi dùng).
3. GIỮ NGUYÊN phần còn lại của `syncProjectSymbols`: `readTopSymbols`, `replaceCodeNodes`
   (project graph nodes), `syncCodeEdges`. Enrichment KHÔNG còn là việc của graph-sync.
4. Nếu sau khi xóa mà `readTopSymbols`/`CODE_KINDS`/`body_embeddings` import không còn dùng
   ở chỗ khác trong file → dọn import/biến thừa (giữ file ≤ 200 dòng, hàm ≤ 20 dòng).
   LƯU Ý: `readTopSymbols` vẫn được `replaceCodeNodes` dùng để lấy symbols cho graph nodes —
   KHÔNG xóa nếu còn dùng. Chỉ xóa phần enrichment.

### Fix 2 (phòng thủ) — Dedup trong CodeEnrichmentTaskCreator.insertTask
File: `backend/src/engine/enrichment/CodeEnrichmentTaskCreator.ts` → `insertTask(...)`.
Trước khi INSERT, kiểm tra đã tồn tại task PENDING/PROCESSING cho cùng symbol chưa:
```
SELECT 1 FROM pending_tasks
 WHERE task_type = 'CODE_ENRICHMENT' AND entry_id = ? AND project_id = ?
   AND status IN ('PENDING','PROCESSING') LIMIT 1
```
Nếu có → bỏ qua (không INSERT trùng). Áp dụng cho cả `createTasks` và `createTasksForProject`.
(Đây là guard idempotent; `shouldCreateTask` đã lọc theo enrichment_status nhưng KHÔNG
lọc theo task PENDING đang chờ → vẫn trùng khi index 2 lần liên tiếp trước khi worker chạy.)

### Fix 3 (dọn nợ) — Xóa task CODE_ENRICHMENT mồ côi từ Path A cũ
Các task cũ do Path A tạo có `entry_id = 0` và/hoặc `project_id` NULL (không hợp lệ để worker
map về symbol). Cần migration/dọn một lần:
```
DELETE FROM pending_tasks
 WHERE task_type = 'CODE_ENRICHMENT'
   AND status = 'PENDING'
   AND (entry_id = 0 OR project_id IS NULL);
```
Đặt trong một ensure/migration idempotent (theo pattern `backend/src/database/schema-registry/ensure-*.ts`),
hoặc một script dọn chạy một lần. PHẢI tuân thủ PG transaction rule (không nuốt lỗi trong transaction).

## KHÔNG nằm trong phạm vi (chỉ ghi chú, không làm ở đây)
- Việc `body_embeddings` chưa lưu cho property/sf_field/lwc_component/flow/pega_* khiến các
  kind này được enrich chỉ từ signature (không pseudo code). Đây là hạn chế CHẤT LƯỢNG, không
  phải trùng lặp — xử lý riêng nếu muốn nâng chất lượng enrich cho các kind đó.

## Kiểm thử (bắt buộc)
1. Unit test `graph-sync-service`: sau `syncProjectSymbols`, graph_nodes vẫn được tạo đúng
   (số node = số symbol đủ điều kiện), và KHÔNG có INSERT nào vào `pending_tasks` từ graph-sync.
2. Unit test `CodeEnrichmentTaskCreator.insertTask`: gọi 2 lần cho cùng symbol khi đã có task
   PENDING → chỉ 1 row trong pending_tasks (dedup hoạt động).
3. Integration: chạy `runFullIndex` 2 lần liên tiếp trên cùng project → số CODE_ENRICHMENT
   task KHÔNG nhân đôi; mỗi symbol đủ điều kiện có tối đa 1 task PENDING.
4. Regression: Pega project vẫn tạo task cho pega_* (workspaceType='pega'); mọi ngôn ngữ
   (ts/js/py/java/go/rust/kotlin/c/cpp/cs/php/ruby/scala/swift/apex/lwc) vẫn được enrich cho
   các kind trong ENRICHABLE_KINDS.
5. Sau Fix 3: không còn task CODE_ENRICHMENT với entry_id=0 hoặc project_id NULL.

## DoD
- [ ] graph-sync KHÔNG còn tạo CODE_ENRICHMENT task (chỉ project graph nodes + edges).
- [ ] `queueCodeSummaryTasks` bị xóa; không còn import/biến thừa; file ≤ 200 dòng.
- [ ] `CodeEnrichmentTaskCreator.insertTask` dedup theo (task_type, entry_id, project_id, status).
- [ ] Task mồ côi (entry_id=0 / project_id NULL) được dọn qua migration idempotent.
- [ ] runFullIndex 2 lần → không nhân đôi task; enrichment Total ≈ số symbol đủ điều kiện.
- [ ] Pega + tất cả ngôn ngữ vẫn được enrich cho ENRICHABLE_KINDS.
- [ ] Có unit + integration test như trên; tuân thủ code-standards + PG transaction rule.
