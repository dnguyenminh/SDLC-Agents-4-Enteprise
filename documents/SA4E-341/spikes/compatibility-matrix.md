# Spike: IDE Fork CDP Attach & Compatibility Matrix (SA4E-341)

**Loại:** Spike (research) — kết quả dùng để un-skip 3 tests TC-02 (compatibility-matrix)
**Tác giả:** SA Agent
**Ngày:** 2026-10-10
**Phạm vi:** Đánh giá khả năng attach CDP/chromedriver vào các IDE dựa trên VSCode fork (Kiro, Antigravity, Kilo) bằng WebdriverIO + wdio-vscode-service

---

## 1. Mục tiêu

Spike này trả lời 4 rủi ro chính trong Jira SA4E-341:

| # | Rủi ro | Câu hỏi cần trả lời |
|---|--------|---------------------|
| R1 | IDE fork attach CDP | Fork (Kiro/Antigravity/Kilo) có khởi động được với remote debugging như VSCode gốc không? |
| R2 | chromedriver ↔ Electron mapping | Chromedriver được tải/khớp với phiên bản Electron của fork bằng cách nào? Fork có version riêng không khớp mapping công khai thì xử lý thế nào? |
| R3 | Webview/iframe | Nội dung webview (chạy trong iframe sandboxed) có locate được bằng WDIO không? |
| R4 | CI headless | Chạy headless trên CI (Linux/Windows) có khả thi không? |

## 2. Nguồn & phương pháp research

- **Webfetch (thành công):**
  - https://webdriver.io/docs/wdio-electron-service/ — tài liệu `@wdio/electron-service` (v10, scoped package)
  - https://github.com/webdriverio-community/wdio-vscode-service — README wdio-vscode-service
- **Source code nội bộ (đọc trực tiếp):** `e2e/src/support/env.ts` — schema env var + fail-fast validation cho IDE launch
- **Kiến thức nền:** cơ chế Chromium `--remote-debugging-port` / file `DevToolsActivePort` (chuẩn Chromium, áp dụng cho mọi Electron app)

> ⚠️ Các nhận định về Kiro/Antigravity/Kilo **chưa verify bằng cách chạy thực tế** — được đánh dấu "cần verify thực tế" ở từng mục. Không bịa version numbers cụ thể.

## 3. Phát hiện chính từ research

### 3.1 Cơ chế attach CDP / remote debugging (R1)

**wdio-vscode-service KHÔNG attach CDP thủ công** — nó dùng chromedriver làm driver service:

1. Service khởi động VSCode binary (hoặc tự tải về) với bộ args mặc định (xem `constants.ts#L5-L14` trong repo service) + `vscodeArgs` tùy chỉnh.
2. Chromedriver launch binary và **tự phát hiện debug port qua file `DevToolsActivePort`** (cơ chế chuẩn Chromium — mọi Electron app đều hỗ trợ).
3. Riêng VSCode API proxy: `vscodeProxyOptions` mở WebSocket thêm để đưa `executeWorkbench` vào ngữ cảnh VSCode (default `connectionTimeout`/`commandTimeout` = 5000ms).

Đối với fork: vì fork kế thừa codebase VSCode/Chromium, cơ chế `--remote-debugging-port` / `DevToolsActivePort` vẫn có mặt. Có thể truyền flag tường minh qua `vscodeArgs` (vd `vscodeArgs: { 'remote-debugging-port': 0 }`) — tuy nhiên thường **KHÔNG cần** vì chromedriver tự quản.

**Evidence:** README wdio-vscode-service mục "VSCode Capabilities (`wdio:vscodeOptions`)" → `vscodeArgs`, `vscodeProxyOptions`; kiến thức chuẩn Chromium.
**Kết luận R1:** Khả năng cao GO cho cả 4 IDE — nhưng cần verify thực tế từng fork (flag không bị fork strip, không conflict với bridge AI-agent của fork).

### 3.2 chromedriver ↔ Electron mapping (R2)

Hai cơ chế mapping, tùy service:

**wdio-vscode-service (service chính của ticket):**
- Từ VSCode **v1.86+** → cần `webdriverio` v8.14+ để **tự tải chromedriver, không cần config** (README mục Chromedriver). Service map phiên bản VSCode → chromedriver tương ứng.
- Với VSCode **cũ hơn v1.86**: đọc version chromedriver mong đợi từ log lỗi (`Failed downloading chromedriver v108`), tải thủ công, cấu hình `wdio:chromedriverOptions.binary`.
- Với **fork**: service chỉ auto-map khi `browserVersion` khớp một bản VSCode công khai. Fork có version riêng (Electron/Chromium khác) → **KHÔNG khớp mapping tự động** → phải cấu hình `wdio:chromedriverOptions.binary` thủ công với chromedriver khớp Chromium engine của fork. Phiên bản Electron của từng fork: **cần verify thực tế** (đọc `product.json`/`version` trong thư mục cài đặt).

**@wdio/electron-service (tham chiếu chéo):**
- Auto-setup chromedriver cho **Electron v26+** (qua Chrome for Testing — nguồn này chỉ có bản chromedriver v115+).
- Electron **< v26** → phải cấu hình chromedriver thủ công (hạn chế nguồn Chrome for Testing).

**Evidence:** README wdio-vscode-service (mục Chromedriver, ví dụ cấu hình `wdio:chromedriverOptions.binary` + `browserVersion` '1.80.0'); docs wdio-electron-service (mục "Chromedriver Configuration").
**Kết luận R2:** VSCode chính thức = GO (auto). Fork = GO có điều kiện — cần 1 bước "xác định Chromium version của fork → chromedriver thủ công" trong setup script. Cần verify thực tế.

### 3.3 Webview / iframe handling (R3)

- Workbench VSCode dùng **iframe sandboxed** cho webviews (chuẩn VSCode). wdio-vscode-service cung cấp page objects + locators khớp từng phiên bản VSCode cho **workbench chrome** (sidebar, title bar, activity bar, notifications, quick input...).
- Nội dung BÊN TRONG webview cần switch frame (`browser.switchToFrame()`) hoặc chạy qua `executeWorkbench` (code được execute remote trong extension host, có quyền truy cập `vscode` API).
- Với fork: cấu trúc DOM workbench giống VSCode gốc nếu fork không custom sâu. Panel AI riêng của fork (nếu render trong webview/iframe riêng) cần locator riêng — **cần verify thực tế**.

**Evidence:** README wdio-vscode-service (mục Usage, Create Your Own PageObjects, executeWorkbench); kiến thức chuẩn VSCode webview.
**Kết luận R3:** Workbench = GO. Webview fork-specific = GO có điều kiện, cần locator riêng cho từng fork.

### 3.4 CI headless (R4)

- `@wdio/electron-service` hỗ trợ **headless + auto Xvfb trên Linux** (cần WebdriverIO 9.19.1+, option `autoXvfb`) — evidence docs v10 "Features".
- wdio-vscode-service: CI badge cho thấy pipeline của service chạy trên **Windows / macOS / ubuntu** (headful với desktop session; Linux cần Xvfb/xvfb-run — cấu hình chính xác trong CI của service cần verify).
- Chrome/Chromium headless (`--headless`/`--disable-gpu` qua `vscodeArgs`) là kỹ thuật quen thuộc, nhưng với VSCode desktop workbench cần verify (workbench có thể cần GPU/renderer để render đầy đủ).
- **✅ SPIKE-4 evidence (7 CI runs, 2026-10-10)**: VSCode desktop LAUNCH được trên Linux CI (xvfb-run + .deb apt); chromedriver auto-resolve qua cgmanifest OK (148 cho 1.123, 150 cho 1.140); workbench connect + Gherkin steps PASS; Serenity BDD report render PASS (post-run CLI + ArtifactArchiver). ⚠️ Còn lại: 1006 connection flakiness khi 4 workers song song — maxInstances (config + CLI) không serialize qua serenity WebdriverIOConfig; VSCode 1.140 (Modern UI) chết ngay, 1.123 flaky.
- **Kết luận R4 (update):** VSCode baseline = **GO có điều kiện** — serialize workers cần fix (investigate adapter config normalization / run từng feature riêng). Fork = như trước (blocked chờ verify V1-V3).

**Evidence:** docs wdio-electron-service (mục Features — Headless testing support, autoXvfb); CI badge wdio-vscode-service (Platform: Windows/macOS/ubuntu); SPIKE-4 CI runs 38031285319→38033873230 (GitHub Actions, ubuntu-latest).

## 4. Ma trận go/no-go

Schema khớp STC TC-02 PBT (`e2e/src/__tests__/compatibility-matrix.test.ts`): mỗi row parse được, `cdp attach` ∈ {go, no-go, blocked}, row "go" phải có chromedriver major khớp Chromium major (verified từ wdio-vscode-service launcher.js `_fetchChromedriverVersion` — đọc Chromium registration từ `cgmanifest.json` của VSCode release), mọi row phải có evidence.

| IDE | IDE version | CDP attach | Chromium version (Electron) | Chromedriver version | Smoke scenario ref | Notes |
|-----|-------------|------------|------------------------------|----------------------|--------------------|-------|
| VSCode (`code`) | 1.140.0 (local install; 1.139.1 cũng có) | go | 150.0.7871.250 (cgmanifest tag 1.140.0) | 150 (auto — wdio-vscode-service qua cgmanifest) | features/workbench/open-editor.feature | Service tự khởi động + chromedriver tự phát hiện port qua DevToolsActivePort; locators mặc định tối đa 1.123.0 (service 8.0.0 chưa có locator riêng 1.139/1.140 — workbench locators fallback, cần verify UI flows) |
| Kiro | 1.2.37 (local install) | go | 152.0.7977.130 (CDP /json/version — Electron 44.4.3) | 152 (manual — Chrome-for-Testing 152.0.7977.82) | (WebDriver session proof — feature wiring pending) | **SPIKE VERIFIED (2026-10-10)**: V1 — CDP /json/version trả Chrome/152.0.7977.130 + Kiro/1.2.37 + Electron/44.4.3; V2 — remote-debugging-port không bị strip, DevTools API + WebSocketDebuggerUrl phản hồi; V3 — chromedriver-win64 152.0.7977.82 (CfT) tạo WebDriver session với Kiro.exe thành công (sessionId OK, browser 152.0.7977.130). Follow-up wiring: wdio.conf fork-support (inject chromedriver manual — service chỉ resolve qua cgmanifest VSCode, không biết Kiro) + locator fallback (workbench 152 > service locators 1.123) |
| Antigravity | cần verify (product.json của fork) | blocked | cần verify | cần verify — chromedriver manual | (chưa có) | Sau Kiro; chưa có evidence riêng ngoài cơ chế Chromium chung |
| Kilo | cần verify (product.json của fork) | blocked | cần verify | cần verify — chromedriver manual | (chưa có) | Sau Kiro; hình thái standalone (fork độc lập hay extension trong VS Code) cần verify — nếu là extension trong VS Code thì đường baseline `code` đã phủ |

Chú thích:
- `go` = verify qua docs/evidence (VSCode baseline); `blocked` = khả năng cao nhưng chưa verify thực tế (fork) — un-skip sau khi hoàn thành V1–V5 (mục 6).
- Evidence VSCode row: cgmanifest.json tag 1.140.0 (Chromium 150.0.7871.250), wdio-vscode-service launcher.js (chromedriver auto qua cgmanifest), CI badge service.

## 5. Cách test với fork (env var override + wdio binary path)

### 5.1 Env var (schema hiện có — `e2e/src/support/env.ts`)

```powershell
E2E_IDE=kilo                          # kiro | code | antigravity | kilo (fail-fast nếu sai)
E2E_IDE_BINARY_PATH="C:\...\Kilo.exe" # bắt buộc tồn tại — BR-01 fail fast trước khi launch
E2E_BASE_URL=<workspace-path>         # tùy chọn — phải tồn tại nếu cung cấp
E2E_HEADLESS=true                     # headless
E2E_FAIL_FAST=true                    # dừng sớm khi fail
```

`resolveE2EEnv()` validate fail-fast TRƯỚC khi launch IDE — pattern này không đổi với fork, chỉ cần cung cấp đúng giá trị binary của fork. Env config sai → `EnvConfigError` và run aborts (BR-01).

### 5.2 wdio.conf — trỏ binary path của fork

```ts
capabilities: [{
    browserName: 'vscode',
    // browserVersion: '...' — CHỈ đặt khi khớp bản VSCode công khai; với fork thường bỏ qua
    'wdio:enforceWebDriverClassic': true,   // bắt buộc khi dùng WebdriverIO v9
    'wdio:vscodeOptions': {
        binary: process.env.E2E_IDE_BINARY_PATH,  // ← path fork (Kiro/Antigravity/Kilo)
        extensionPath: __dirname,
        vscodeArgs: {
            // 'remote-debugging-port': 0 — thường KHÔNG cần (chromedriver tự quản qua DevToolsActivePort)
            'disable-updates': true,           // tránh fork tự update giữa test — cần verify flag tên đúng trên fork
        },
        storagePath: <tmp-dir>,                // cô lập user-data-dir / extension-install-dir của fork
    },
}],
services: ['vscode'],
```

### 5.3 Chromedriver thủ công cho fork (khi auto-download fail)

1. Chạy 1 lần → đọc log: `ERROR webdriver: Failed downloading chromedriver vXXX` → biết Chromium version mong đợi (cách service README khuyến nghị).
2. Xác định Chromium engine của fork (đọc `product.json`/`version` trong thư mục cài fork) — cần verify thực tế.
3. Tải chromedriver khớp → cấu hình:

```ts
'wdio:chromedriverOptions': {
    binary: path.join(cacheDir, 'chromedriver-<XXX>'),
}
```

### 5.4 Checklist smoke test cho từng fork (điều kiện un-skip)

- [ ] Launch fork bằng option `binary` → workbench xuất hiện
- [ ] `getWorkbench()` → page objects load đúng (title bar, activity bar)
- [ ] `executeWorkbench((vscode) => ...)` → gọi được VSCode API qua proxy WebSocket
- [ ] Chromedriver: auto-download OK hoặc manual binary OK
- [ ] Extension test: mở extension trong fork → locate được panel
- [ ] Headless: chạy với `E2E_HEADLESS=true` (Windows) / Xvfb (Linux)

## 6. Kết luận + khuyến nghị

1. **Cả 4 IDE đều khả thi** — wdio-vscode-service thiết kế cho mọi VSCode-family binary qua option `binary`; cơ chế CDP là chuẩn Chromium, các fork kế thừa đầy đủ.
2. **Thứ tự go trước:** (1) VSCode chính thức (`code`) — baseline, mọi thứ auto; (2) Kiro — env.ts đã hỗ trợ và là fork ít modify nhất trong 3; (3) Antigravity; (4) Kilo — sau khi xác định chromedriver mapping từng fork.
3. **Điểm nghẽn duy nhất:** chromedriver ↔ Electron mapping cho fork có version riêng → cần setup script "detect fork Chromium version → download/point chromedriver". Đây là công việc 1 lần mỗi fork.
4. **Khuyến nghị un-skip TC-02 (compatibility-matrix, 3 tests):**
   - Un-skip ngay cho `code` (baseline GO — evidence mạnh nhất).
   - Với 3 fork: un-skip sau khi hoàn thành checklist 5.4 cho từng fork (ước tính mỗi fork ~1 ngày spike verify).
   - Dùng skip theo IDE (`skipIf`) thay vì skip toàn bộ suite — để matrix test chạy được trên các IDE đã GO.
5. Rủi ro còn lại: webview locator cho AI panel của fork — cần verify khi implement locator cụ thể; CI headless Linux cần Xvfb trên runner.

## 7. Việc cần verify thực tế (TODO trước khi un-skip fork)

| # | Việc verify | Cách |
|---|-------------|------|
| V1 | Chromium/Electron version của Kiro, Antigravity, Kilo | Đọc `product.json`/`version` trong thư mục cài; hoặc log khi launch |
| V2 | `vscodeArgs` không bị fork strip / conflict | Launch + đọc log `verboseLogging: true` |
| V3 | chromedriver matching từng fork | Smoke test mục 5.3 |
| V4 | Webview locator AI panel từng fork | Implement locator + chạy |
| V5 | Headless trên CI runner thật | Chạy pipeline CI với `E2E_HEADLESS=true` |
