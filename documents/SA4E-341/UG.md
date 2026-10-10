# UG — E2E Testing Framework (SA4E-341)

## 1. Tổng quan

E2E Testing Framework kiểm tra extension SDLC-Agents chạy bên trong IDE thật (Kiro, VSCode, Kilo, Antigravity) bằng **WebdriverIO + wdio-vscode-service**, theo pattern **Serenity/JS Screenplay** và sinh báo cáo **Serenity BDD (HTML)**.

Thành phần chính:

| Thành phần | Vai trò |
|---|---|
| WebdriverIO | Runner điều phối phiên IDE |
| wdio-vscode-service | Cung cấp Workbench API (`browser.getWorkbench()`, `browser.executeWorkbench()`) |
| @serenity-js/webdriverio | Framework adapter — Screenplay + reporting |
| @serenity-js/cucumber | Chạy Gherkin (`.feature`) với glue TypeScript |
| Serenity BDD reporter | Render báo cáo HTML sau khi chạy xong |

Cấu trúc thư mục `e2e/`:

```
e2e/
├── wdio.conf.ts                       # Cấu hình WDIO + Serenity + Cucumber
├── vitest.config.ts                   # Cấu hình unit test (vitest)
├── features/
│   ├── smoke/                         # Smoke scenario
│   ├── workbench/open-editor.feature  # UC-04 — mở file, xác nhận tab active
│   ├── commands/run-extension-command.feature  # UC-04/TC-12 — chạy extension command
│   ├── webview/                       # Webview scenario
│   └── step_definitions/*.steps.ts    # Glue TypeScript (Cucumber)
└── src/
    ├── cast.ts                        # Đăng ký dàn actor Screenplay (actor 'QA')
    ├── screenplay/
    │   ├── tasks/                     # OpenWorkspace, OpenEditor, RunCommand...
    │   └── questions/                 # ActiveTabText, IsPanelVisible...
    └── support/env.ts                 # Schema biến môi trường + fail-fast validation
```

## 2. Prerequisites

| Yêu cầu | Phiên bản | Ghi chú |
|---|---|---|
| Node.js | 20+ | Bắt buộc để chạy WebdriverIO và vitest |
| Java (JDK) | 11+ | Bắt buộc cho Serenity BDD reporter (render HTML qua CLI jar) |
| npm | Đi kèm Node | Cài đặt dependencies |
| IDE | Kiro / VSCode / Kilo / Antigravity | Trỏ tới file thực thi qua `E2E_IDE_BINARY_PATH` |

Kiểm tra nhanh:

```bash
node --version    # phải >= 20
java -version     # phải >= 11
```

## 3. Cài đặt

```bash
cd e2e
npm install
```

## 4. Cấu hình

### 4.1. Biến môi trường (`e2e/src/support/env.ts`)

Toàn bộ cấu hình phụ thuộc máy được inject qua biến môi trường — **không hardcode** trong code. `resolveE2EEnv()` validate fail-fast **trước khi launch IDE**: nếu thiếu/thiếu hợp lệ, chạy bị huỷ ngay với `EnvConfigError`.

| Biến | Bắt buộc | Giá trị hợp lệ | Mặc định | Mô tả |
|---|---|---|---|---|
| `E2E_IDE` | Có | `kiro` \| `code` \| `antigravity` \| `kilo` | — | Chọn IDE sẽ launch khi test |
| `E2E_IDE_BINARY_PATH` | Có | Đường dẫn tới file thực thi của IDE (phải tồn tại trên disk) | — | IDE binary được truyền vào capability `wdio:vscodeOptions.binary` |
| `E2E_BASE_URL` | Không | Đường dẫn workspace (phải tồn tại nếu cung cấp) | không đặt | Workspace mở khi test; cũng dùng làm `baseUrl` |
| `E2E_HEADLESS` | Không | `true` / giá trị khác | `false` | Khi `true`: thêm flag `--disable-gpu --no-sandbox` (dành cho CI headless) |
| `E2E_FAIL_FAST` | Không | `true` / giá trị khác | `false` | Khi `true`: dừng ngay khi có step fail đầu tiên |
| `CI` | Không | `true`, hoặc có biến `DISPLAY` | auto | Khi CI: `logLevel = info` để debug dễ hơn trên CI |

Thông báo lỗi xác thực (fail-fast, xảy ra trước khi IDE launch):

| Lỗi | Thông báo |
|---|---|
| Thiếu/sai `E2E_IDE` | `E2E_IDE must be one of: kiro \| code \| antigravity \| kilo (got "..."). Setup: set E2E_IDE and E2E_IDE_BINARY_PATH before running (BR-01).` |
| `E2E_IDE_BINARY_PATH` không tồn tại | `E2E_IDE_BINARY_PATH does not exist: "...". Run aborts before IDE launch (BR-01). Set the path to the IDE executable.` |
| `E2E_BASE_URL` không tồn tại | `E2E_BASE_URL does not exist: "..." (BR-01).` |

### 4.2. Cấu hình WDIO (`e2e/wdio.conf.ts`)

Các thiết lập quan trọng:

| Thiết lập | Giá trị | Ý nghĩa |
|---|---|---|
| `specs` | `features/**/*.feature` | Chạy toàn bộ feature trong `e2e/features/` |
| `maxInstances` | `1` | Phiên IDE chạy tuần tự (serialized) — tránh xung đột Workbench |
| `capabilities` | `browserName: 'vscode'` + `wdio:vscodeOptions` | Key capability đúng của wdio-vscode-service 8.x là `wdio:vscodeOptions` (không phải `wdio-vscode-service:options`); `extensionPath` trỏ tới `../extension` |
| `services` | `vscode`, `serenity-bdd` | Service IDE + service render báo cáo HTML post-run (`specDirectory: 'features'`) |
| `framework` | `@serenity-js/webdriverio` | Screenplay + reporting |
| `serenity.runner` | `cucumber` | Glue Gherkin qua @serenity-js/cucumber |
| `serenity.crew` | console-reporter, serenity-bdd, Photographer | Log console, kết quả Serenity BDD, **screenshot mọi step fail** (`TakePhotosOfFailures`) |
| `cucumberOpts.require` | `features/step_definitions/**/*.steps.ts` | Nạp glue TypeScript |
| `cucumberOpts.requireModule` | `tsx/cjs` | Cucumber 13 không transpile TS sẵn — cần module loader `tsx` |
| `cucumberOpts.retry` | `2` | Retry step fail tối đa 2 lần (BR-03) |
| `cucumberOpts.strict` | `true` | Fail khi có step undefined |
| `outputDir` | `target/site/serenity` | Thư mục gốc của báo cáo |
| `connectionRetryTimeout` | `120000` (ms) | Ngân sách chờ IDE launch (2 phút) |
| `connectionRetryCount` | `1` | Không retry ngầm vượt BR-03 |
| `logLevel` | `info` (CI) / `warn` (local) | Mức log theo môi trường |

Lưu ý cách nối Serenity: adapter `@serenity-js/webdriverio` tự gọi `Serenity.configure()`, do đó cấu hình đặt qua key `serenity` trong `wdio.conf.ts` — **không** gọi `configure()` thủ công trong hook `before()` (sẽ xung đột).

## 5. Viết test mới

### 5.1. Feature file (Gherkin)

Đặt trong `e2e/features/{domain}/`, ví dụ `e2e/features/commands/run-extension-command.feature`:

```gherkin
Feature: Extension command journey — run command
  QA executes an extension command inside the IDE and observes the panel response.

  Scenario: Execute the SDLC agentic chat command
    Given the IDE is launched with the extension under development
    When the command "sdlcAgents.openAgenticChat" is executed
    Then the panel area is visible
```

### 5.2. Step definitions (glue TypeScript)

Đặt trong `e2e/features/step_definitions/*.steps.ts`. Mỗi step **delegate** sang Screenplay Task/Question có sẵn trong `e2e/src/screenplay/` — không gọi lệnh WebdriverIO thô trong glue:

```ts
import { When, Then } from '@cucumber/cucumber';
import { actorCalled } from '@serenity-js/core';
import { Ensure, isTrue } from '@serenity-js/assertions';
import { RunCommand } from '../../src/screenplay/tasks/RunCommand';
import { IsPanelVisible } from '../../src/screenplay/questions/IsPanelVisible';

When('the extension command {string} runs', async (command: string) => {
    await actorCalled('QA').attemptsTo(RunCommand(command));
});

Then('the {string} panel becomes visible', async (panelId: string) => {
    await actorCalled('QA').attemptsTo(Ensure.that(IsPanelVisible(panelId), isTrue()));
});
```

Quy ước bắt buộc:

- **Given dùng chung**: `the IDE is launched with the extension under development` được định nghĩa **MỘT LẦN** trong `workbench.steps.ts` và dùng chung cho mọi feature (smoke/workbench/commands/webview). KHÔNG khai báo lại ở file khác — Cucumber sẽ báo `AmbiguousStep` khi có step definition trùng nhau.
- Mỗi hàm step tối đa **20 dòng**; logic phức tạp đặt trong Task/Question của Screenplay layer.
- Đặt tên Task theo hành động (`OpenWorkspace`, `OpenEditor`, `RunCommand`), Question theo câu hỏi (`ActiveTabText`, `IsPanelVisible`).

## 6. Chạy test

### 6.1. Đặt biến môi trường trước khi chạy

Windows (PowerShell):

```powershell
$env:E2E_IDE = "kiro"
$env:E2E_IDE_BINARY_PATH = "C:\Users\<user>\AppData\Local\Programs\Kiro\Kiro.exe"
$env:E2E_BASE_URL = "C:\projects\kiro\SDLC-Agents-4-Enterprise"   # tùy chọn
```

Linux / macOS:

```bash
export E2E_IDE=kiro
export E2E_IDE_BINARY_PATH=/usr/share/kiro/kiro
export E2E_BASE_URL=/path/to/workspace   # tùy chọn
```

### 6.2. Chạy toàn bộ E2E (cần IDE + biến môi trường)

```bash
cd e2e
npx wdio run
```

### 6.3. Chạy một feature duy nhất

```bash
npx wdio run --spec features/commands/run-extension-command.feature
```

### 6.4. Chạy unit test (không cần IDE)

Unit test của tầng Screenplay/support chạy bằng vitest:

```bash
cd e2e
npx vitest run
```

## 7. Xem báo cáo

Sau khi `npx wdio run` kết thúc:

| Đầu ra | Vị trí | Mô tả |
|---|---|---|
| Serenity BDD HTML report | `e2e/target/site/serenity/index.html` | Mở bằng trình duyệt; xem kết quả từng scenario, step, thời gian |
| Screenshot step fail | `e2e/target/site/serenity/` | Photographer chụp **mọi** step fail (BR-08) |
| Kết quả JSON trung gian | `e2e/target/site/serenity/` | Serenity BDD dùng để render HTML |
| Console report | stdout khi chạy | Tổng kết nhanh ngay sau khi chạy xong |

Quy trình xem báo cáo:

```bash
cd e2e
npx wdio run
# mở file sau bằng trình duyệt:
# target/site/serenity/index.html
```

## 8. Troubleshooting

| Triệu chứng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| `EnvConfigError` ngay khi khởi động, IDE chưa kịp launch | `E2E_IDE` sai/giá trị không hợp lệ; `E2E_IDE_BINARY_PATH` không tồn tại | Đặt đúng biến môi trường theo mục 4.1; kiểm tra file thực thi IDE có tồn tại không |
| **Electron/IDE không launch** | Binary path sai; phiên IDE cũ còn treo; chạy CI headless thiếu flag | Kiểm tra `E2E_IDE_BINARY_PATH`; đóng tiến trình IDE cũ; đặt `E2E_HEADLESS=true` trên CI (tự thêm `--disable-gpu --no-sandbox`); ngân sách chờ là 120000 ms (`connectionRetryTimeout`) |
| **Timeout workbench** (kết nối IDE quá hạn) | IDE tải chậm; extension build lỗi nên không load được | Đảm bảo extension đã build (`extension/`); đặt `logLevel=info` (chạy với `CI=true`) để xem log chi tiết; chạy lại 1 lần theo `connectionRetryCount: 1` |
| **Webview không tìm thấy panel/iframe** | Webview render bên trong iframe; panel chưa load xong khi assert | Dùng Question `IsPanelVisible(panelId)` thay vì truy vấn DOM thô; đợi webview load xong trước khi assert; xem scenario webview trong `features/webview/` |
| `AmbiguousStep` khi chạy feature | Khai báo trùng step definition giữa các file glue | Given dùng chung đã có trong `workbench.steps.ts` — xoá khai báo trùng; mỗi expression chỉ định nghĩa một lần |
| Step TypeScript không được nạp | Thiếu module loader `tsx` | Giữ `requireModule: ['tsx/cjs']` trong `cucumberOpts` (Cucumber 13 không transpile TS sẵn) |
| Không có báo cáo HTML sau khi chạy | Thiếu Java 11+ trên máy; service `serenity-bdd` không render được | Cài JDK 11+; kiểm tra `target/site/serenity/` có kết quả JSON trung gian |

## 9. FAQ

**Tại sao cần Java 11+?**
Serenity BDD reporter render báo cáo HTML bằng một CLI jar chạy trên JVM. Không có Java thì E2E vẫn chạy được nhưng không có báo cáo HTML.

**Tại sao `maxInstances = 1`?**
Các phiên IDE chạy tuần tự để tránh xung đột Workbench giữa các worker (FSD 5.2).

**Step fail có được retry không?**
Có — tối đa 2 lần (`cucumberOpts.retry: 2`, BR-03). Không retry ngầm vượt mức này.

**Test cách ly với dữ liệu thật thế nào?**
wdio-vscode-service mở IDE với `userSettings` đặt `update.mode: none` và `extensions.autoUpdate: false` — IDE không tự update giữa lần chạy, đảm bảo kết quả ổn định (BR-05).

**Biến `E2E_BASE_URL` thật ra là gì?**
Đường dẫn workspace sẽ được mở khi test (không phải URL web). Nếu không đặt, IDE mở không có workspace cụ thể; nếu đặt, đường dẫn phải tồn tại trên disk.

**Làm sao chạy nhanh một kịch bản duy nhất khi debug?**
`npx wdio run --spec features/<domain>/<ten-file>.feature` — chỉ feature đó được chạy.
