# BRD – Epic SA4E-289 Migrate LangGraph Workflow Engine to Pi SDK Option C

## 1. Mục tiêu
Thay thế LangGraph Workflow Engine bằng Pi SDK `@earendil-works/pi-agent-core` trong VS Code extension, giữ nguyên UI và trải nghiệm người dùng.

## 2. Phạm vi
- 8 stories SA4E-290 → SA4E-297
- Backend extension host + Webview UI
- Không thay đổi luồng người dùng, chỉ thay engine xử lý workflow

## 3. Yêu cầu chức năng
- Khởi tạo PiProvider tự động
- Phase Router, State Adapter, Checkpointer Adapter, Approval Adapter tích hợp
- Streaming output giữ nguyên
- Approval mapping chuẩn hoá id

## 4. Tiêu chí chấp nhận
- Tests 1855 passed
- Latency p95 <2s
- Checkpoint consistency >99%
