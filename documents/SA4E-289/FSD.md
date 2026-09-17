# FSD – Epic SA4E-289

## Kiến trúc tổng quan
VS Code Webview → Extension Host PiWorkflowEngine → PiProvider → Phase Router → State Adapter → Checkpointer Adapter → Approval Adapter

## Luồng chính
1. User gửi yêu cầu từ Webview
2. Phase Router xác định phase
3. State Adapter chuyển đổi PipelineState ↔ PiInternalState
4. PiAgent Executor gọi Pi SDK
5. Checkpointer persist
6. Approval Adapter xử lý yêu cầu approve

## Giao diện
Dashboard, Agent Chat, Approval Panel, Settings Pi Provider — không thay đổi UI trực quan.
