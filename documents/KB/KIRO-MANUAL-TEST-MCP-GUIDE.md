# Hướng dẫn Manual Test Kiro bằng MCP Tools

## Mục tiêu
Thực hiện manual test cho extension/workflow trong môi trường Kiro bằng bộ MCP IDE tools: ide_launch, ide_attach, ide_screenshot, ide_evaluate, ide_inspect.

## Bộ tool MCP liên quan

- **ide_launch** — khởi chạy IDE Kiro/Code với remote debugging, trả về sessionId + cdpEndpoint
- **ide_attach** — attach puppeteer-core vào session qua CDP endpoint
- **ide_screenshot** — capture PNG base64 của workbench
- **ide_evaluate** — evaluate JS expression trong renderer context
- **ide_inspect** — kiểm tra title, url, visibility workbench/panel/sidebar
- **ide_current_executeCommand** — chạy VS Code command
- **ide_current_openFile** — mở file trong editor

## Quy trình Manual Test 7 bước

### 1. Launch Kiro
```
ide_launch(ide: "kiro", userDataDir: "<profile>")
```
Lưu sessionId và cdpEndpoint.

### 2. Attach
```
ide_attach(sessionId: "<id>", cdpEndpoint: "<url>")
```
Bắt buộc trước khi screenshot/evaluate.

### 3. Inspect trạng thái
```
ide_inspect(sessionId: "<id>")
```
Kiểm tra workbench/panel mở.

### 4. Mở file / thực hiện flow
```
ide_current_openFile(path: "extension/src/...")
ide_current_executeCommand(commandId: "workbench.action.files.openFile")
```

### 5. Thực hiện test steps
- Thực hiện các bước theo STC
- Dùng ide_evaluate để lấy nội dung DOM/Console nếu cần
- Ví dụ: `document.querySelector('.chat-input').value`

### 6. Capture evidence
```
ide_screenshot(sessionId: "<id>")
```
Lưu base64 PNG làm evidence file:line.

### 7. Kết thúc
```
ide_close(sessionId: "<id>", kill: true)
```
Ghi kết quả vào TEST-REPORT.md với evidence.

## Ví dụ flow kiểm thử Chatbox

1. ide_launch(ide:"kiro")
2. ide_attach(...)
3. ide_current_openFile(path:"extension/src/__tests__/chat/ui-scenarios.manual.test.ts")
4. ide_screenshot → lưu evidence PASS
5. ide_evaluate(script:"window.getComputedStyle(document.querySelector('.chat-panel')).display")

## Quy tắc SDLC
- Mọi claim phải có citation file:line + screenshot
- mem_search trước khi thực hiện
- Ghi RUN-LOG.md và cập nhật STATUS.json
- Ingest kết quả vào KB sau test

## Checklist
- [ ] Session launched và attached
- [ ] Evidence screenshot/ log captured
- [ ] Kết quả ghi TEST-REPORT
- [ ] KB ingest hoàn tất
