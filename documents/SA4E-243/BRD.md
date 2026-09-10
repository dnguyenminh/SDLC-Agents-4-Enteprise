# Business Requirements Document (BRD)

## Ticket: SA4E-243 — KB Scope Auto-Detection based on VCS

## Document Information
| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-243 |
| Title | KB Scope Auto-Detection based on VCS presence and branch for Extension ingest |
| Version | 1.1 |
| Status | Draft |

## 1. Executive Summary
Extension hiện hard-code scope PROJECT cho nhiều luồng ingest KB. Yêu cầu tự động phát hiện scope WORKSPACE / PROJECT dựa trên presence VCS và branch để đảm bảo dữ liệu KB được lưu đúng phạm vi.

## 2. Problem Statement
- Các service Pega/Jira hard-code scope PROJECT
- Không có logic phát hiện VCS → dẫn tới ingest sai scope cho workspace cá nhân/branch feature
- Backend IsolationLayer đã hỗ trợ WORKSPACE nhưng client chưa sử dụng

## 3. Business Objectives
- BO-1: Tự động chọn scope WORKSPACE khi không có VCS hoặc branch không phải main/master
- BO-2: Chọn scope PROJECT khi có git và branch main/master
- BO-3: Loại bỏ hard-code scope trong service ingest

## 4. Scope
### In Scope
- Tạo scope-detector utility
- Cập nhật BaseNode default scope
- Cập nhật PegaSchemaIndexer, AttachmentFetcher, KbEntryBuilder, JiraProjectIndexer, indexer-http

## 5. User Stories
### US-1: Auto-assign WORKSPACE on non-main branch
Là developer, tôi muốn KB entries tự động được gán WORKSPACE khi làm việc trên branch feature.

Acceptance Criteria:
1. detectKbScope trả về WORKSPACE khi không có .git hoặc branch != main/master
2. Các service ingest sử dụng scope từ detector

### US-2: Auto-assign PROJECT on git main/master
Là developer, tôi muốn KB entries được gán PROJECT khi làm việc trên main/master.

Acceptance Criteria:
1. detectKbScope trả về PROJECT khi có git và branch main/master
2. Không regression luồng ingest hiện tại

### US-3: Seamless migration
Là nhóm vận hành, tôi muốn migration không làm mất dữ liệu.

Acceptance Criteria:
1. BaseNode default scope sử dụng detector
2. Migration idempotent

## 6. Non-Functional Requirements
- Build TypeScript sạch, lint pass
- Không phá vỡ luồng ingest hiện tại

## 7. Dependencies
- SA4E-30 scope hierarchy
- SA4E-31 cross-workspace isolation
