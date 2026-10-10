# SA4E-341 — [E2E Testing] Serenity/JS + wdio-vscode-service cho VSCode-based IDEs (Kiro/Antigravity/Kilo)

## Ticket Metadata

| Field | Value |
|-------|-------|
| Key | SA4E-341 |
| Type | Epic |
| Status | To Do → In Progress (SM transitioned lúc pipeline start) |
| Priority | Medium |
| Labels | e2e-testing, serenity-js, vscode, wdio |

## Summary

[E2E Testing] Serenity/JS + wdio-vscode-service cho VSCode-based IDEs (Kiro/Antigravity/Kilo)

## Mục tiêu

Xây dựng framework kiểm thử E2E theo chuẩn BDD cho VSCode và các IDE fork từ VSCode (Kiro, Antigravity IDE, Kilo...), sử dụng stack: WebdriverIO + wdio-vscode-service + Serenity/JS (Cucumber + Screenplay Pattern).

## Bối cảnh

- Serenity/JS chạy trên nền WebdriverIO/Playwright/Cucumber, bổ sung Screenplay Pattern + reporting.
- wdio-vscode-service là Service của WebdriverIO (điều khiển VSCode, expose Workbench, EditorView...).
- @serenity-js/webdriverio là Framework Runner/Reporting chạy trên WDIO.

## Lợi ích

- BDD Gherkin (Given/When/Then)
- Serenity BDD HTML Report (tự chụp màn hình khi lỗi)
- Screenplay Pattern

## Rủi ro cần Spike

1. IDE fork có cho attach WebDriver/CDP không
2. chromedriver ↔ Electron version mapping
3. Webview/AI chat panel — WDIO xử lý iframe/webview tới đâu
4. CI headless (Linux xvfb / Windows runner)

## Phạm vi — 7 Stories

1. Spike tích hợp
2. Setup skeleton
3. Spike IDE fork
4. Viết test BDD/Screenplay
5. Test webview
6. HTML report + screenshot
7. CI headless

## Tham khảo

- https://serenity-js.org/handbook/
- https://github.com/webdriverio-community/wdio-vscode-service
- https://code.visualstudio.com/api/working-with-extensions/testing-extension
- https://webdriver.io/docs/wdio-electron-service/

## Pipeline Context (SM)

- documents/SA4E-340/ là spike đánh giá Serenity/JS trước đó (BACKLOG/DISCOVERY) — SA4E-341 là epic triển khai tiếp theo.
- Working directory: C:\projects\kiro\SDLC-Agents-4-Enterprise (git repo, branch main).
- Project architecture: extension/ (TypeScript VSCode extension), backend/ (TypeScript MCP server).
- Current test setup: extension tests dùng @vscode/test-electron, backend tests Node.
- Autonomy Level 3 (Unattended) — làm trực tiếp trên main, KHÔNG feature branch, KHÔNG commit tự động trừ khi quality gates pass.
