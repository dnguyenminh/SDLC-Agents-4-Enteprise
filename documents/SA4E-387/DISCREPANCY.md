# DISCREPANCY.md — SA4E-387
## Document Information

| Field | Value |
|-------|-------|
| Ticket | SA4E-387 |
| Title | Enrichment với Dynamic Context Budget & Runtime Model Swap |
| Date Created | 2026-10-30 |
| Version | 1.1 |
| Author | SA Agent |
| Status | Closed (document-level) |

> ⚠️ **Amendment 2026-10-31:** Các resolution dưới đây là **giải quyết ở mức thiết kế tài liệu** (FSD/TDD đã chốt hướng). Code implementation SA4E-387 **chưa tồn tại trong repo** — không ghi nhận bất kỳ mục nào là "đã cập nhật trong code".

---

## Executive Summary

Tài liệu này ghi lại các discrepancy giữa BRD và FSD trong quá trình feedback loop giữa Business Analyst và Solution Architect cho ticket SA4E-387.

**Tổng số discrepancy**: 3  
**Đã giải quyết**: 3 (100%)  
**Đang mở**: 0  

---

## Discrepancy List

### Discrepancy #1: Model Swap Cache Invalidation Strategy

| Field | Value |
|-------|-------|
| ID | DISC-001 |
| Date Reported | 2026-10-28 |
| Phase | Phase 3 (SA Review) |
| Severity | Medium |
| Status | ✅ Resolved |

**Mô tả discrepancy:**
BRD yêu cầu "ContextWindowDiscovery không invalidate cache" (mục 33), trong khi FSD đề xuất invalidate cache mỗi lần model swap để đảm bảo consistency.

**Nguyên nhân:**
- BRD mô tả vấn đề hiện tại (ContextWindowDiscovery KHÔNG invalidate cache → gây bug)
- FSD đề xuất giải pháp (cần invalidate cache khi model swap)

**Giải pháp được thống nhất:**
✅ Invalidate cache mỗi khi model swap runtime (qua hook `onModelChanged`) → đã chốt trong FSD §3.3 / TDD. **Chưa có code implementation** (chờ Phase 5).

**Tài liệu tham khảo:**
- BRD.md §33
- FSD.md §3.3
- TDD.md §3.2

---

### Discrepancy #2: Budget Calculation Formula

| Field | Value |
|-------|-------|
| ID | DISC-002 |
| Date Reported | 2026-10-28 |
| Phase | Phase 3 (SA Review) |
| Severity | Low |
| Status | ✅ Resolved |

**Mô tả discrepancy:**
BRD đề cập "Tính budget động thay vì cap tĩnh" nhưng không chỉ rõ công thức tính. FSD cần định nghĩa chi tiết công thức.

**Nguyên nhân:**
- BRD yêu cầu ở mức high-level
- FSD cần chi tiết hóa công thức để implementation

**Giải pháp được thống nhất:**
✅ Công thức theo FSD §3.2 / BR-01: `inputBudget = contextWindow − RESERVED_OUTPUT_TOKENS (800) − SAFETY_MARGIN (500) − overhead`, không dùng cap tĩnh. (Pseudo-code cũ `calculateBudget(fileSize, modelConfig)` trả `{budget: chunkSize}` đã bị loại vì sai bản chất — đó là số chunk, không phải token budget.)

**Tài liệu tham khảo:**
- BRD.md §37.2
- FSD.md §3.2
- TDD.md §3.1

---

### Discrepancy #3: Map-Reduce Implementation Scope

| Field | Value |
|-------|-------|
| ID | DISC-003 |
| Date Reported | 2026-10-28 |
| Phase | Phase 3 (SA Review) |
| Severity | Medium |
| Status | ✅ Resolved |

**Mô tả discrepancy:**
BRD yêu cầu "Map-reduce thật thay stub", nhưng không rõ phạm vi implementation (chỉ enrich hay cả error handling, retry logic).

**Nguyên nhân:**
- BRD không chi tiết hóa yêu cầu map-reduce
- SA cần xác định rõ scope để thiết kế TDD

**Giải pháp được thống nhất:**
✅ Scope map-reduce trong TDD:
- Chia file thành chunks
- Enrich từng chunk song song
- Reduce kết quả với error handling cơ bản
- Retry logic không nằm trong scope ticket này

**Tài liệu tham khảo:**
- BRD.md §37.6
- FSD.md §3.5
- TDD.md §3.4

---

## Feedback Loop Summary

### Vòng lặp 1
- **Ngày**: 2026-10-28
- **Agent**: SA → BA
- **Số discrepancy báo cáo**: 3
- **Thời gian giải quyết**: 1 vòng lặp

### Kết quả
- **Tất cả discrepancy đã được giải quyết**
- BRD đã được cập nhật (nếu cần)
- FSD và TDD đã được finalize
- Chuyển sang Phase 4 (Test Planning)

---

## Close-out Report

**BA Sign-off:**
- **Ngày**: 2026-10-28
- **Người**: BA Agent
- **Kết quả**: ✅ Approved
- **Ghi chú**: FSD hoàn toàn khớp yêu cầu BRD. Mọi discrepancy đã được giải quyết.

**SA Sign-off:**
- **Ngày**: 2026-10-28
- **Người**: SA Agent
- **Kết quả**: ✅ Approved
- **Ghi chú**: TDD đã được tạo dựa trên FSD đã finalize. Không còn ambiguity.

---

## Lịch sử thay đổi
- **2026-10-30**: Tạo DISCREPANCY.md. Mọi discrepancy đã được giải quyết trong Phase 3 (mức tài liệu).
- **2026-10-31**: Amendment — làm rõ resolution là mức thiết kế; gỡ claim sai "đã cập nhật trong code implementation"; thay công thức DISC-002 bằng công thức BR-01 của FSD.
