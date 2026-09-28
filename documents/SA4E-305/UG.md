# User Guide — SA4E-305 Pi Chat 3-pane Layout Redesign

## 1. Overview
Pi Chat webview được redesign sang layout 3-pane với Toolbar, Left Pane, Center Pane, Right Pane, Input Area, Status Bar.

## 2. Installation
Không cần cài đặt thêm. Extension tự build webview.

## 3. Configuration
Không có cấu hình mới. Sử dụng stores hiện có.

## 4. Usage
1. Mở Pi Chat từ VS Code extension
2. Layout 3-pane hiển thị tự động
3. Left Pane: Worklist tab và navigation
4. Center Pane: Chat workflow chính
5. Right Pane: Approval Panel
6. Toolbar: actions top
7. Status Bar: trạng thái kết nối

## 5. API Reference
Sử dụng extension-webview bridge hiện có. Messages JSON.

## 6. Troubleshooting
- Bridge timeout: hiển thị warning "Data unavailable, retrying"
- Layout không render: kiểm tra runtime model-resolution

## 7. FAQ
Q: Có hardcoded session? A: Không, tuân thủ SEC-289-11
