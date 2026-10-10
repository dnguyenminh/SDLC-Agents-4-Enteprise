# Release Notes (RLN)

## SA4E-341 — E2E Testing Framework v0.1.0 (WebdriverIO + wdio-vscode-service + Serenity/JS)

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-341 |
| Title | [E2E Testing] Serenity/JS + wdio-vscode-service for VSCode-based IDEs (Kiro/Antigravity/Kilo) |
| Release Version | v0.1.0 (framework milestone — test-infrastructure only) |
| Release Date | 2026-10-09 |
| Author | DevOps Agent |
| Status | Released on `main` |
| Related Documents | DPG v1.0, TDD v1.0, STP v1.0, STC v1.0 |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| v0.1.0 | 2026-10-09 | DevOps Agent | Initial release — E2E framework skeleton tại `e2e/` + CI headless workflow `.github/workflows/e2e-tests.yml` |

---

## 1. What's New (Tính năng mới)

Phiên bản v0.1.0 ra mắt **framework kiểm thử E2E dạng BDD** cho VSCode và các IDE fork (Kiro, Antigravity IDE, Kilo), đặt tại thư mục `e2e/` (package riêng `@sa4e/e2e`):

- **BDD Gherkin** — viết test case bằng ngôn ngữ tự nhiên (Feature / Scenario / Given-When-Then). QA đọc hiểu kịch bản mà không cần đọc code; người dùng cuối KHÔNG THẤY thay đổi nào (deliverable chỉ phục vụ nội bộ QA/Dev).
- **Screenplay Pattern (Serenity/JS 3)** — test được tổ chức thành Actor + Task + Question, dễ tái sử dụng và ít trùng lặp hơn Page Object truyền thống.
- **Serenity BDD Report** — mỗi lần chạy tự sinh báo cáo HTML tại `e2e/target/site/serenity/index.html`, kèm **ảnh chụp màn hình tự động khi test fail** (UC-06).
- **wdio-vscode-service 8** — điều khiển VSCode/IDE fork bằng WebdriverIO v9: tự tải IDE, tự mở workspace, có selectors sẵn cho Workbench (sidebar, editor, terminal, notifications…).

> ⚠️ Đây là deliverable hạ tầng kiểm thử: KHÔNG thay đổi code production (`extension/`, `backend/`), KHÔNG có DB, KHÔNG ảnh hưởng người dùng cuối.

---

## 2. Technical Changes (Thay đổi kỹ thuật)

### 2.1 Thư mục / file mới hoặc sửa đổi

| Item | Type | Mô tả |
|------|------|-------|
| `e2e/` | New | Standalone npm package `@sa4e/e2e` — WDIO v9.32 + wdio-vscode-service 8 + Serenity/JS 3.48 + Cucumber 13 + tsx loader; config contract `e2e/wdio.conf.ts` (SPIKE-1 actuals) |
| `e2e/package.json` | New | Scripts: `test:e2e` (wdio run), `test:unit` (vitest run), `lint`, `typecheck` |
| Root `package.json` | Modified (additive) | Scripts `test:e2e`, `test:e2e:report`, `test:e2e:clean` — delegate tới `--prefix e2e` |
| `.gitignore` | Modified (additive) | `e2e/target/`, `e2e/node_modules/` |
| `.github/workflows/e2e-tests.yml` | New | CI headless (unit tests + wdio với xvfb) — workflow E2E riêng, KHÔNG sửa pipeline có sẵn |
| Production code (`extension/`, `backend/`) | Unchanged | Framework additive, non-invasive (BR-05) |

### 2.2 API

- Không có API public mới. Framework expose entry points nội bộ:
  - `npx wdio run wdio.conf.ts` (trong `e2e/`) — chạy full E2E.
  - `npx vitest run` (trong `e2e/`) — unit tests cho step definitions / page objects.

### 2.3 Database & Infrastructure

- Database: **không có** (no DB in this epic, TDD §7).
- Infrastructure: thêm CI job headless trên GitHub Actions (`ubuntu-latest` + Node 20 + xvfb). Không có server mới.

### 2.4 Configuration

- Không có biến môi trường production mới. WDIO config đọc các thiết lập cục bộ trong `e2e/wdio.conf.ts` (đường dẫn IDE, workspace test) — chi tiết xem DPG v1.0 §6.

---

## 3. Cấu trúc thư mục `e2e/`

```
e2e/
├── package.json            # @sa4e/e2e — standalone (KHÔNG thuộc root workspaces, TDD §2.1)
├── wdio.conf.ts            # WDIO v9 + wdio-vscode-service + Serenity/JS reporter (SPIKE-1)
├── src/
│   ├── features/           # Spec Gherkin (*.feature)
│   ├── step-definitions/   # Cucumber step bindings (Screenplay)
│   ├── screenPlay/         # Actors / Tasks / Questions
│   └── page-objects/       # Selectors Workbench
└── target/
    └── site/serenity/      # Serenity BDD report (generated, git-ignored)
```

---

## 4. Cách dùng nhanh

```bash
# Trong thư mục e2e/
npm ci                          # cài dependencies (lockfile)

npx vitest run                  # unit tests (nhanh, không cần IDE)
npx wdio run wdio.conf.ts       # full E2E — tự tải VSCode/IDE fork + chạy spec Gherkin

# Xem báo cáo Serenity (mở file bằng browser)
start target/site/serenity/index.html   # Windows
# hoặc: open target/site/serenity/index.html  (macOS)
```

CI: workflow `e2e-tests.yml` tự chạy trên push/PR chạm `e2e/**` — job `unit-tests` là blocking check; job `e2e-headless` chạy WDIO với `xvfb-run` (optional, continue-on-error) và upload artifact `sa4e-341-serenity-report` để tải về xem.

---

## 5. Known Issues & Limitations

| # | Vấn đề | Chi tiết / Workaround |
|---|--------|----------------------|
| KI-1 | **IDE fork — CDP attach không ổn định** | `wdio-vscode-service` được thiết kế cho VSCode chính thức; các IDE fork (Kiro/Antigravity/Kilo) attach qua Chrome DevTools Protocol có thể fail hoặc treo ở bước launch tùy fork/build. Workaround: pin đường dẫn IDE binary đã verify trong `wdio.conf.ts`; fork chưa verify chạy trên VSCode stable trước. |
| KI-2 | **UI dạng webview chạy trong iframe** | Phần UI của IDE/render trong webview là iframe riêng — selectors WebdriverIO mặc định không thấy phần tử trong iframe. Workaround: dùng `browser.switchToFrame()` trước khi assert/tương tác webview; step definitions cần hỗ trợ chuyển frame context. |
| KI-3 | CI headless Electron cần virtual display | WDIO Electron thật trên Linux CI phải chạy qua `xvfb-run`; job `e2e-headless` đã thêm nhưng đang ở chế độ continue-on-error cho đến khi SPIKE-4 xác nhận go/no-go. |

---

## 6. Dependencies

- **Release bắt buộc deploy trước/together:** không có — framework độc lập, không phụ thuộc release của module khác.
- **External:** Node.js 20+ (local), GitHub Actions runners (CI), VSCode stable hoặc IDE fork binary đã verify cho run E2E.
- Tooling nội bộ: WebdriverIO 9.32, wdio-vscode-service 8, Serenity/JS 3.48, Cucumber 13, vitest 4, tsx 4.

---

## 7. Migration Notes

- **Breaking changes:** không có — deliverable hoàn toàn additive, không đụng code production hiện có.
- **Backward compatibility:** 100% — pipeline có sẵn (`ci.yml`, `publish.yml`, `auto-release.yml`, `ci-sa4e-336.yml`) không bị sửa đổi.
- **Data migration:** không áp dụng (no DB).
- **Rollback:** revert commit của `e2e/` + xóa `.github/workflows/e2e-tests.yml`; không ảnh hưởng service nào khác (chi tiết DPG v1.0 §8).
