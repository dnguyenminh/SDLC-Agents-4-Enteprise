# FIX-EVIDENCE — SA4E-393 Addendum 4 open issues — ĐỢT 1

Lệnh (cwd `extension/`): `npx vitest run <file test>` — test viết TRƯỚC, chạy ĐỎ trên code cũ, rồi sửa, chạy XANH.
Đỏ chung: `npx vitest run src/__tests__/design-gate-report-store.test.ts src/__tests__/design-gate-persist-run.test.ts src/__tests__/design-gate-localhost-fetcher.test.ts src/__tests__/design-gate-fs-adapter-containment.test.ts src/__tests__/design-gate-addendum4-fix.test.ts` → `Tests 13 failed` + 1 suite fail.
Xanh chung: `npx vitest run src/__tests__/design-gate src/slash` → `Test Files 8 passed (8), Tests 50 passed (50)`.

| Mục | Test | Output ĐỎ (code cũ) | Output XANH |
|-----|------|--------------------|-------------|
| F04 (a) runId có record, mode static/rendered/both | design-gate-persist-run `(a)` ×3 | `ENOENT: no such file ... design-gate\run_1794497873384_xpxh1o99.json` | pass |
| F04 (b) cache-hit runId mới + sourceRunId | `(b)` | `ENOENT` (không có file record) | pass |
| F04 (c) không có path tuyệt đối trong file ghi | `(c)` | fail (không có record; cache lưu `runId = sourcePath` tuyệt đối) | pass |
| F04 (d) ghi atomic, lỗi rename không để tmp | report-store `writeJsonAtomic` | `Cannot find module '../slash/report.store'` | pass |
| F04 ghi lỗi → message "report not persisted" | `write failure is surfaced` | fail: message rỗng; `Failed to cache result: ENOTDIR` chỉ console | pass |
| F05 (e) getReport("../secret", "../../x", "run_1_A", "", "\0"…) | `(e)` + report-store `runId validation` | fail: đọc được `.code-intel/secret.json` (traversal) | undefined cho mọi id |
| F04 (f) clearAllCache không xóa package.json | `(f)` | `expected false to be true` (package.json bị xóa) | pass |
| F04 (g) entry không fileCount / `{sha}.json` cũ = miss | `(g)` + addendum4-fix F-2 | addendum4-fix F-2: `expected +0 to be 3` (chữ ký cũ) | pass |
| F06 charset | localhost-fetcher `accepts text/html; charset=utf-8` | `rejected "DetectionError: CORS block prevented fetch: unexpected Content-Type: text/html; charset=utf-8"` | pass |
| F06 oversize → reject, không uncaught | `rejects with FETCH_FAILED` | Chạy trên `git show HEAD` của fetcher: vitest **treo >60s, không in kết quả** (throw trong `data` callback → uncaught). Lần chạy đỏ đầu tiên (server test lỗi, không gửi đủ 10MB) cho `promise resolved ... instead of rejecting` | pass (reject `FETCH_FAILED`, 12MB) |
| F06 SSRF còn nguyên | `non-localhost host is rejected` | pass (guard hồi quy) | pass |
| F07 tên bắt đầu `..` hợp lệ | fs-adapter-containment `allows ... '..'` ×2 | `expected false to be true` (`relative.startsWith("..")` chặn nhầm `..dots/a.css`) | pass |
| F07 sibling `root-evil` bị chặn | `blocks sibling directory` | pass trước & sau (code cũ chặn nhờ check `relative` thứ hai; test là guard hồi quy) | pass, dùng `isPathWithinRoot` |

Ghi chú trung thực: oversize (F06) và sibling (F07) không đỏ theo hành vi "đẹp": oversize đỏ bằng treo/uncaught; sibling chỉ là guard hồi quy. Test server oversize lần đầu sai (không xử lý backpressure) nên đã sửa test trước khi sửa code.

Kiểm tra cuối: `npx tsc --noEmit` sạch (0 lỗi). `eslint --no-ignore` các file chạm: 0 error, 2 warning max-lines (fs.adapter 263, integration.service 751).

---

# ĐỢT 2 — SEC-F08 GĐ2, log redaction (B), size 200/20 (C), dọn (D)

Lệnh (cwd `extension/`): test viết/siết TRƯỚC, chạy ĐỎ trên code đợt 1, rồi sửa, chạy XANH.
Đỏ: `npx vitest run src/__tests__/design-gate-explicit-root.test.ts src/__tests__/design-gate-log-redaction.test.ts src/__tests__/design-gate-size-guard.test.ts src/__tests__/design-gate-tools.test.ts`.
Xanh: `npx vitest run src/__tests__/design-gate src/slash` → `Test Files 12 passed (12), Tests 64 passed (64)`; full `npx vitest run` → `Test Files 444 passed | 1 skipped (445), Tests 3465 passed | 6 skipped (3471)`.

| Mục | Test | Output ĐỎ (code đợt 1) | Output XANH |
|-----|------|------------------------|-------------|
| A. F08 GĐ2: tool/command không ghi env, root truyền tường minh tới service | explicit-root `(a)` | `AssertionError: expected +0 to be 1` (service đọc root từ env/cwd, `Static detection error: Source path escapes workspace root`, fileCount 0) | pass: `payload.fileCount = 1`, record nằm dưới root, `process.env.WORKSPACE_ROOT` vẫn undefined |
| A. 2 workspace song song `Promise.all` không lẫn | explicit-root `(b)` | `AssertionError: expected 0 to be greater than 0` (không có findings: root sai) | pass: mỗi run chỉ thấy file của mình, record chỉ ở root của mình |
| A. test cũ khẳng định env được ghi | design-gate-tools `#0` (cũ) | `expected undefined to be MOCK_WS_ROOT` — test cũ mã hoá hành vi bị bỏ (DESIGN §2.3) | viết lại trong `design-gate-run.test.ts` #0: `runDetection` được gọi với `workspaceRoot` + env undefined → pass |
| A. addendum4-fix không còn dựa env | addendum4-fix | không đỏ riêng (chỉ đổi cách truyền root) | pass với `delete process.env.WORKSPACE_ROOT` + `{workspaceRoot: ws}` |
| B. log `loadDetector` lộ path (service + wasm.loader) | log-redaction #1 (×2 assert) | `expected 'Failed to load WASM binary: Impeccabl…' not to contain 'C:\Users\ASUS\AppData\Local\Temp\dg-l…'` ; `+ Load detector error: Impeccable skill WASM package not found at: C:\Users\ASUS\...\missing\detector.wasm` | pass (cùng `redactPaths` qua `logRedacted`; `res.message` cũng đã redact) |
| B. log ghi cache lỗi lộ path | log-redaction #2 | `expected 'Failed to cache result: ENOTDIR: not …' not to contain '<tmp ws>'` | pass |
| B. log `design_gate_run` fail | log-redaction #3 | **KHÔNG đỏ vì code**: đợt 1 đã redact ở tool. Test cũ đỏ do tiền đề sai (`isError` false: ws rỗng + wasm thật nên pipeline thành công, không có lỗi để log). Đã sửa test (mock `runDetection` ném lỗi chứa path ws trong message & stack) | pass — chỉ là guard hồi quy |
| C1. file ≤200 | size-guard `no file exceeds 200 lines` | `design-rules.ts: 486`, `integration.service.ts: 751`, `__tests__/design-gate-tools.test.ts: 300` | pass |
| C2/C3. hàm ≤20 (mở rộng: không tính callback của `describe`, vẫn tính `it`) | size-guard `no function body exceeds 20 lines` | 16 vi phạm: design-rules `check`(D2) 22; index.ts `registerDesignGateCommand` 27 / `<anonymous>` 25 / `runDetection` 30; integration `loadDetector` 54, `staticCore` 133, `renderedCore` 121, `fullCore` 95, `loadImpeccableSkill` 22; wasm.loader `loadWasmDetector` 43, `simulateWasmAnalysis` 23; 5 `it` trong design-gate-tools.test (27/44/26/25/26) | pass (0 vi phạm trên `src/slash/*.ts`, `src/tools/design-gate/*.ts`, `src/__tests__/design-gate*`, helpers) |

Ghi chú trung thực:
- localhost-fetcher `fetchLocalhostPage` (137) và `fs.adapter` đã được tách ở đợt 1 (`localhost-request.ts`, `file-lister.ts`, `path-guard.ts`) nên không còn trong danh sách đỏ; `mapReportToPayload` đã ≤20 (size-guard bao `tools/design-gate/`).
- Tôi đổi định nghĩa size-guard: callback `describe(...)` là container nhóm test (bị chặn bởi giới hạn 200 dòng/file), không tính 20 dòng; thân `it` vẫn tính. Đỏ ban đầu của 3 `describe` lớn (design-gate-tools 215 dòng…) vì thế biến mất không phải do sửa code.
- Test #9 cũ (chỉ đo `design-gate-tool.ts`) bị bỏ vì size-guard đã đo toàn bộ thư mục.
- Refactor thuần: `integration.service.ts` 751 → 154 dòng, API public giữ (`loadDetector`, `runStaticDetection`, `runRenderedDetection`, `runFullDetection`, `getReport`, `listReports`, `reset`, `getInstanceIdStr`, `getImpeccableService`, kiểu `CombinedResult`/`RenderedDetectionResult`). `getReport/listReports` thêm tham số tuỳ chọn `workspaceRoot`. Logic tách sang `detector.runtime.ts`, `static.detection.ts`, `rendered.detection.ts`, `full.detection.ts`, `error-text.ts`, `detection.types.ts`. Thay đổi hành vi nhỏ, chủ ý: (1) `loadDetector` không còn đọc/validate WASM lần thứ hai (dư thừa); (2) biến `severityBreakdown` tính trong nhánh `both` nhưng không dùng bị bỏ; (3) `report.message`/log của pipeline giờ được redact path (SEC-F03).
- `design-rules.ts` 486 → 4 file nhóm rule + `design-rules.types.ts` + file lắp ráp; 30 rule, ID và thứ tự giữ nguyên (đã kiểm: A1…D4, 8 style-slop, 9 content-slop; test #6 registry và toàn bộ rule tests xanh).
- `index.ts::runDetection` giờ chuyển `workspaceRoot` (không dùng `sourceRoot` thay root như DESIGN §2.2.2 vì sourceRoot có thể là thư mục con → cache/report sẽ rơi vào thư mục con).
- `process.env.WORKSPACE_ROOT` chỉ còn được ĐỌC ở `path-guard.getWorkspaceRoot()` (fallback cuối; dùng bởi `fs.adapter`, `file-lister`, `report.generator`, service `rootOf`). Không còn chỗ nào ghi. Ba test (persist-run, fs-adapter-containment, và log-redaction không gán) vẫn gán env CÓ CHỦ ĐÍCH để kiểm chính đường fallback.
- `extension.ts` vượt 200 dòng (209) do thêm `workspaceRoot` ở đợt 1; gom thành helper `gateConfig` → 189 dòng.
- D: đã xoá `extension/size-scan.tmp.ts` (làm `tsc` fail TS6059). `extension/.code-intel/` là artifact test (75 file `run_*.json`/cache do các lần chạy đỏ với root=cwd), không phải source: đã xoá; chạy lại design-gate suites và full vitest không tái tạo. Chưa có `.gitignore` cho thư mục này — nên thêm `extension/.code-intel/` (không làm ở đây vì ngoài phạm vi được phép).
- Kiểm cuối: `npx tsc --noEmit` sạch; `npx eslint --no-ignore` trên toàn bộ file `.ts` chạm → 0 error, 0 warning (hết max-lines).

---
# ĐỢT 3 — D1, D2, D3, S-1, S-2, mục 8 (read-only/an toàn)
Lệnh (cwd `extension/`): test viết TRƯỚC, chạy ĐỎ trên code đợt 2 (`npx vitest run src/__tests__/design-gate-addendum4-batch3.test.ts src/__tests__/design-gate-persist-run.test.ts --retry=0` → `Tests 4 failed | 3 passed` ở batch3), rồi sửa, chạy XANH.
Xanh: 3 file mới/đổi → `Test Files 3 passed, Tests 24 passed`; full `npx vitest run` → `Test Files 446 passed | 1 skipped (447), Tests 3480 passed | 6 skipped (3486)` (gồm size-guard xanh). `npx tsc --noEmit` sạch; `eslint --no-ignore` các file chạm: 0 lỗi.
QA mutation M2 (bỏ `isValidRunId` trong `loadReport`): thêm 6 test vào `design-gate-report-store.test.ts` (file có thật trên đĩa: `RUN_1_X`, `run_1_A`, `run_1_a-b`, `run_1_`, runId 86 ký tự khớp regex nhưng >64). Tạm bỏ check → `Tests 5 failed | 9 passed (14)` (ĐỎ thật); hoàn tác, SHA256 `report.store.ts` = `58FA1955…C2091` như trước (file untracked nên kiểm bằng hash); lại XANH: `npx vitest run design-gate` → `Test Files 13 passed, Tests 79 passed`; `tsc --noEmit` sạch; eslint file chạm 0 lỗi; test file 107 dòng (≤200).
| Mục | Test | ĐỎ (code đợt 2) | XANH |
|-----|------|-----------------|------|
| D1 cache entry không chứa abs path | batch3 `cacheResult ... absolute finding.file is relativised` (gọi `cacheResult` với finding `file` tuyệt đối) | `expected true to be false` (file cache chứa root tuyệt đối) | pass: ghi `site\a.css`; cache hit trả `fileCount=2`, `file` tương đối |
| D1 luồng thật có finding | persist-run `(c2)` ×2 (fixture `a.css` dùng `font-family: Inter` → finding thật, WASM thật qua `loadDetector`) | **KHÔNG đỏ**: trên luồng `runStaticDetection` hiện tại `listSourceFiles` đã trả đường dẫn tương đối nên record + cache không chứa root. Không tái hiện được leak qua luồng thật; leak chỉ xảy ra nếu `cacheResult` nhận finding tuyệt đối (test dòng trên). Sửa = chuẩn hoá tại biên `cacheResult` (`sanitizeFindings`) | pass (guard hồi quy: không file nào dưới `.code-intel/design-gate` chứa root; hit đúng findings/fileCount) |
| D2 `..dots/a.css` | batch3 `keeps '..dots/a.css' inside root` | `expected 'unknown' to be '..dots\a.css'` (`startsWith("..")`) | pass; ngoài root (`../x.css`, `../root-evil/x.css`, abs ngoài) → `unknown`; dùng `isPathWithinRoot` |
| D3 .gitignore | `git check-ignore -v .code-intel/design-gate/x.json extension/.code-intel/x.json` | exit 1 (không ignore) | in 2 dòng khớp `.gitignore:108,109` |
| S-1 runId lỗi | batch3 `error report gets a valid runId` (`generateQualityReport(null)` → nhánh lỗi) | `RUN_ID_RE.test("run_error")` = false → `expected false to be true` (saveReport sẽ ném `invalid runId`, không có record) | pass: runId dạng `run_<ms>_<id>`, `persistRun` OK, `loadReport` đọc lại được |
| S-2 junction | batch3 `rejects a sourceRoot that is a junction` (junction thật `ws/link → outside`) | `promise resolved "[ 'link\leak.css' ]" instead of rejecting` | pass: `listSourceFiles` ném INVALID_PATH (realpath ngoài root, fail-closed; không resolve được cũng từ chối). Test thư mục thường vẫn liệt kê đúng. (Test tự skip có ghi `console.warn` nếu không tạo được junction; trên máy này tạo được.) |
| Mục 8(i) | tài liệu | — | `ANALYSIS-settings-worktree.md`: thay dòng "Chưa xác nhận" bằng kết quả thực: `workspace-init.ts:52` (qua alias `McpServerManager`), `workspaceRoot` từ `extension.ts:87-89` = `workspaceFolders[0].uri.fsPath` |
| Mục 8(ii) | `runtime-settings.test.ts` (6 test) | **Không đỏ — đây là characterization baseline của hành vi hiện tại, xanh ngay từ đầu**, không phải test sửa lỗi. Có 1 test ghi lại "known gap" (clear xoá file bất kể pid chủ) | pass |
Ghi chú trung thực:
- Không đụng `runtime-settings.ts`, `remote-backend-client.ts`, steering, `.kiro/*`, `.sdlc-checksums.json`; không commit/bump version.
- `.code-intel/design-gate/20daf50f…json` đã được git TRACK từ trước; `.gitignore` không gỡ file đã track. Cần `git rm --cached` (chưa làm, để user quyết định).
- S-2: Dirent không theo symlink nên `walk` vốn bỏ qua symlink/junction con; lỗ hổng chỉ ở chính `sourceRoot`, nay đã chặn bằng realpath.
