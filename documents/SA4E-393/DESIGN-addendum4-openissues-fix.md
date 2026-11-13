# DESIGN — SA4E-393 Addendum 4: xử lý open issues (SEC-F04/F05/F08 + file-size)

Phạm vi: chỉ phân tích, chưa sửa code. Nguồn: đọc `detection.cache.ts`, `integration.service.ts`, `fs.adapter.ts`, `report.generator.ts`, `design-gate-*.ts`, TDD §D1/D4, SECURITY-ASSESSMENT-addendum4-fix.md.

## 0. Hiện trạng đã xác minh

| # | Sự thật | Vị trí |
|---|---------|--------|
| 1 | Cache file = `sha256(sourcePath:mode).json`; trường `runId` trong file = **sourcePath tuyệt đối**; chỉ lưu `result` (findings, fileCount), **không lưu report** | `detection.cache.ts:79-110` |
| 2 | Cache-hit gọi `generateQualityReport(..., runId=undefined)` → sinh runId mới, **không có file nào mang runId đó** | `integration.service.ts:~155` |
| 3 | Cache-miss cũng không ghi report; runId trả cho agent không map được tới file nào | `integration.service.ts:~243` |
| 4 | `getReport(runId)` đọc `${runId}.json` với runId chưa validate (SEC-F05) và dựng lại report từ cache entry | `integration.service.ts:531` |
| 5 | Tool description + TDD nói "full report persisted to `.code-intel/design-gate/{runId}.json` (BR-12)" | `design-gate-tool.ts:46`, TDD dòng 737 |
| 6 | **Lỗi mới phát hiện:** `clearAllCache()` đặt `cacheDir = getWorkspaceRoot()` → xóa mọi `*.json` ở **workspace root** (vd `package.json`). Chưa có caller trong tool path nhưng là bẫy mất dữ liệu | `detection.cache.ts:222` |
| 7 | `listCachedRuns()` phần memory tách key hex theo `":"` → trả rác; phần file lẫn với mọi `*.json` | `detection.cache.ts:253` |

## 1. Việc 1 — SEC-F04 / SEC-F05

### 1.1 Quyết định: **sửa code, giữ nguyên contract** (không sửa mô tả/TDD)

Lý do:
- Contract `{runId}.json` được 3 nơi cùng nói (tool description, TDD BR-12/D1, `getReport` đọc `${runId}.json`). Sửa code = 1 nơi; sửa mô tả = 3 nơi và bỏ audit trail (BR-12) mà BA đã chốt.
- Agent nhận `runId` trong payload và cần truy ngược. Hiện runId đó không tồn tại trên đĩa → contract hỏng thật, không chỉ sai chữ.
- Cache (tối ưu hiệu năng, TTL 5') và report (audit, BR-12) là hai mối quan tâm khác nhau. Gộp vào một file khóa theo hash là gốc của sai lệch. Tách ra thì mỗi loại có đúng một nguồn sự thật.

### 1.2 Cấu trúc lưu trữ mới (`<root>/.code-intel/design-gate/`)

| Đường dẫn | Nội dung | Khóa | Vòng đời |
|-----------|----------|------|----------|
| `{runId}.json` | **Report record (audit, BR-12)**: `{schema:1, runId, sourcePath(rel), detectionMode, timestamp, cacheHit, sourceRunId?, report}` | runId thật | giữ lâu (dọn theo retention riêng, ngoài scope) |
| `cache/{sha}.json` | **Cache entry**: `{schema:1, runId (run gốc), sourcePath(rel), mode, timestamp, result}` | `sha256(relSourcePath + ":" + mode)` | TTL 5' |

File cũ `{sha}.json` ở top-level: không khớp regex runId nên bị bỏ qua (= miss, đúng ý FIX trước: entry không có `fileCount` là miss). Không cần migration; `clearAll` dọn được chúng.

### 1.3 Yêu cầu bắt buộc

1. **runId thật**: `runId` trong mọi file là runId do `generateQualityReport` sinh (`run_<ms>_<8 ký tự [a-z0-9]>`). Cấm ghi `sourcePath` vào trường `runId`.
2. **sourcePath lưu tương đối** (so với workspace root, dấu `/`, `"."` cho root). Hash cũng tính trên đường dẫn tương đối, nên cache không phụ thuộc máy/đường dẫn tuyệt đối. `invalidateCache(sourcePath, mode)` nhận tuyệt đối thì tự chuyển sang tương đối.
3. **Ghi atomic**: ghi vào `${file}.${pid}.${rand}.tmp` cùng thư mục (`flag:'wx'`, mode `0o600`) rồi `renameSync`; lỗi thì `unlink` tmp. Trước khi ghi: `mkdirSync(recursive)` rồi kiểm `realpath(cacheDir)` vẫn nằm trong `realpath(root)` (chặn `.code-intel` là symlink, nối tiếp SEC-F02).
4. **Cache-hit vẫn trả runId hợp lệ**: cache-hit **sinh runId mới** và ghi report record mới `{runId}.json` với `cacheHit:true, sourceRunId:<runId gốc>`. Lý do: một runId = một phán quyết (score/pass phụ thuộc `threshold` của lần gọi; dùng lại runId gốc với threshold khác sẽ làm audit sai). Chi phí là 1 lần ghi nhỏ. Không cache-hit nào được trả runId không có file.
5. **Báo lỗi ghi**: nếu ghi report record thất bại, vẫn trả kết quả nhưng thêm `message` "report not persisted" vào payload (không im lặng nuốt lỗi, đúng code-standards). Không để runId "ma".
6. Giữ nguyên guard FIX trước: cache entry thiếu `typeof fileCount === "number"` = miss.
7. Sửa lỗi #6/#7 ở §0: `clearAllCache` dùng `getCacheDir()` và chỉ xóa `cache/*.json` + `run_*.json` khớp regex; `listCachedRuns` đọc `{runId}.json` khớp regex, bỏ phần memory.

### 1.4 Thiết kế file/hàm (cho dev-agent)

**Mới `extension/src/slash/report.store.ts`** (~90 dòng, mỗi hàm ≤20):

| Hàm | Mô tả |
|-----|-------|
| `RUN_ID_RE = /^run_\d+_[a-z0-9]+$/` | Regex duy nhất (SEC-F05); export |
| `isValidRunId(id: unknown): id is string` | Test regex + `length ≤ 64` |
| `designGateDir(root): string` | `path.join(root, ".code-intel/design-gate")` |
| `resolveInside(dir, name): string \| undefined` | `path.resolve(dir, name)`; chỉ trả nếu `startsWith(dir + sep)` (containment) |
| `toRelSource(root, abs): string` | Tương đối, dấu `/`, `"."` nếu là root |
| `writeJsonAtomic(file, data): void` | tmp + rename, mode 0600, dọn tmp khi lỗi, kiểm realpath dir |
| `saveReport(root, report, meta): void` | Ghi `{runId}.json`; throw nếu `!isValidRunId` |
| `loadReport(root, runId): QualityReport \| undefined` | `isValidRunId` → `resolveInside` → đọc → trả `record.report`; sai → `undefined` (không phân biệt "sai định dạng" với "không tồn tại", tránh oracle) |
| `listRunIds(root)` | `readdirSync` lọc `RUN_ID_RE` trên tên bỏ `.json` |

**Sửa `detection.cache.ts`** (hiện 293 dòng → tách bớt, xem §3): `cacheResult(root, sourcePath, mode, result, runId)`, `getCachedResult(root, sourcePath, mode)` trả `{result, runId}`; file cache vào `cache/`; dùng `writeJsonAtomic`; khóa hash trên `toRelSource`. Các hàm invalidate/clear/list dùng `designGateDir(root)`.

**Sửa `integration.service.ts`** (nợ 718 dòng, chỉ chạm tối thiểu):
- `runStaticDetection`: cache-hit → `generateQualityReport(...)` rồi `saveReport(root, report, {cacheHit:true, sourceRunId})`; cache-miss → sau khi có report, `cacheResult(..., report.runId)` + `saveReport(...)`. Bọc hai việc ghi trong helper mới `persistRun()` đặt ở `report.store.ts` để không thêm dòng vào hàm 133 dòng.
- `getReport(runId, root?)` → `return loadReport(root ?? getWorkspaceRoot(), runId)` (thay thân 12 dòng, SEC-F05 xong ở đây: regex + containment).
- `runRenderedDetection`/`runFullDetection` cũng gọi `persistRun` sau khi có report cuối, vì tool mặc định `mode=both` (trong `both`, report cuối là report đã gộp; chỉ persist report trả cho agent).

**Sửa `design-gate-tool.ts`**: description giữ nguyên `{runId}.json`, thêm "cache entries kept under `cache/`" — không đổi ngữ nghĩa. TDD: thêm 1 dòng D1 mô tả `cache/{sha}.json` (bổ sung, không thay).

**Test (qa/dev)**: (a) runId trong payload ⇒ tồn tại `{runId}.json` và `report.runId` trùng; (b) cache-hit lần 2 ⇒ runId khác lần 1, file mới tồn tại, `sourceRunId` = lần 1; (c) không có chuỗi tuyệt đối trong mọi file ghi; (d) kill giữa chừng không để lại file dở (chỉ `.tmp`); (e) `getReport("../x")`, `"run_1_a/../../x"`, `"run_1_A"`, chuỗi rỗng, `"run_1_a\0"` ⇒ `undefined` và không có lần đọc fs nào; (f) `clearAllCache` không xóa `package.json` ở root; (g) entry cũ `{sha}.json` không có `fileCount` ⇒ miss.

## 2. Việc 2 — SEC-F08: truyền workspace root tường minh

### 2.1 Mọi điểm đọc `EnvConfig.WORKSPACE_ROOT` (grep toàn repo, trừ `node_modules`)

| # | Vị trí | Vai trò | Hành động |
|---|--------|---------|-----------|
| 1 | `tools/design-gate/design-gate-env.ts:45` | **Ghi** env mỗi lần gọi | Bỏ dòng ghi; chỉ trả `root` |
| 2 | `extension.ts:108` (`resolveWorkspace`) | **Ghi** env cho 3 command palette | Giữ giai đoạn 1 (fallback); bỏ ở giai đoạn 2 sau khi 3 command truyền `workspaceRoot` |
| 3 | `slash/fs.adapter.ts:105` `listSourceFiles` | Đọc | Nhận `options.workspaceRoot` |
| 4 | `slash/fs.adapter.ts:268` `getWorkspaceRoot()` | Đọc (dùng bởi `isPathSafe`, `integration.service`) | Giữ làm **fallback duy nhất** (`explicit ?? env ?? cwd`) |
| 5 | `slash/detection.cache.ts:31` | Đọc | Tham số `root` (§1.4) |
| 6 | `slash/report.generator.ts:155` `sanitizeFilePath` | Đọc | Tham số thứ 6 `workspaceRoot?` của `generateQualityReport` |
| 7 | `slash/integration.service.ts` (`getWorkspaceRoot()` gọi ở `runStaticDetection`, `getReport`…) | Gián tiếp | Dùng `config.workspaceRoot` |
| 8 | Tests: `design-gate-tools.test.ts:83,91`, `design-gate-no-vscode.test.ts:44`, `design-gate-addendum4-fix.test.ts:22-28` | Gán/kiểm env | Cập nhật theo §2.3 |
| 9 | `source/source-slash/*`, `source/slash/*` (bản sao nguồn/biên dịch cũ) | Cùng pattern | **Ngoài scope** (không nằm trong bundle `extension/`); ghi nợ SA4E-438, không sửa |

Các `MCP_WORKSPACE_ROOTS`, `base_dir`, `workspace_root` (SA4E-394) là cơ chế khác (allowlist PathResolver), **không** liên quan và không đụng.

Caller ngoài design-gate tool: chỉ `extension.ts` (3 command: static / rendered / both, ~dòng 133-179) gọi `runDetection`; không còn caller nào khác của `fs.adapter`, `detection.cache`, `report.generator` ngoài `integration.service.ts`. Vì vậy thay đổi API không phá module khác, miễn giữ `workspaceRoot` **tùy chọn** với fallback env/cwd.

### 2.2 Thiết kế

1. `slash/types.ts`: thêm `workspaceRoot?: string` vào `DetectionConfig` (đã có `sourceRoot`; hai khái niệm khác nhau: `workspaceRoot` = ranh giới containment, `sourceRoot` = thư mục quét).
2. `slash/index.ts::runDetection`: `workspaceRoot: config.workspaceRoot ?? config.sourceRoot` chuyển vào `detectionConfig` → `runFullDetection`.
3. `integration.service.ts`: `runFullDetection/runStaticDetection/runRenderedDetection` đọc `const root = config.workspaceRoot ?? getWorkspaceRoot()` **một lần** đầu hàm và truyền xuống: `isPathSafe(p, root)`, `listSourceFiles(p, {maxFiles, workspaceRoot: root})`, `readSourceFile(f, root)` (đã nhận root), `cache*(root, …)`, `generateQualityReport(..., root)`, `saveReport(root, …)`.
4. `fs.adapter.ts`: `isPathSafe(filePath, workspaceRoot = getWorkspaceRoot())`; `listSourceFiles` dùng `options.workspaceRoot ?? getWorkspaceRoot()`. Nhân tiện thay `startsWith` (SEC-F07) bằng `isPathWithinRoot` từ PathResolver.
5. `report.generator.ts`: `sanitizeFilePath(filePath, root)`; `generateQualityReport(..., totalFiles = 0, workspaceRoot?)` (thêm cuối nên không phá caller cũ).
6. `design-gate-tool.ts`: truyền `workspaceRoot` (đã có `env.root`) vào `runDetection({..., workspaceRoot})`. `prepareDesignGateRunEnv` không còn ghi env nên gọi đồng thời nhiều workspace không còn race.
7. 3 command trong `extension.ts` thêm `workspaceRoot: root` (thay đổi 1 dòng mỗi chỗ); sau đó mới bỏ dòng 108.

Triển khai 2 giai đoạn để không phá: GĐ1 thêm tham số + fallback, tool dùng tham số, command vẫn ghi env. GĐ2 command truyền tham số, xóa ghi env, test chuyển sang kiểm tham số.

### 2.3 Test phải đổi
- `design-gate-tools.test.ts` #0: thay `expect(process.env.WORKSPACE_ROOT)...` bằng `expect(runDetection).toHaveBeenCalledWith(objectContaining({workspaceRoot: MOCK_WS_ROOT, sourceRoot: …}))` + `expect(process.env.WORKSPACE_ROOT).toBeUndefined()`.
- `design-gate-addendum4-fix.test.ts`, `design-gate-no-vscode.test.ts`: bỏ gán env, truyền `workspaceRoot: ws`.
- Thêm test 2 workspace gọi song song (`Promise.all`) cho kết quả cache/report không lẫn.

## 3. Việc 3 — kích thước file/hàm

### 3.1 Tách `mapReportToPayload` (37 dòng thân) và `design-gate-payload.ts` (108 dòng, file ổn)

Tách thành các hàm trong cùng file (còn ~130 dòng, <200):

| Hàm mới | Trách nhiệm | ~dòng |
|---------|-------------|-------|
| `countBySeverity(findings): SeverityBreakdown` | vòng đếm severity (dùng `Object.hasOwn`) | 8 |
| `toFindingPayload(f, idx, runId, mode): FindingPayload` | map 1 finding | 10 |
| `buildPayload(report, mode, limit): DesignGateRunPayload` | ráp object payload | 18 |
| `mapReportToPayload(...)` | gọi `buildPayload`, gắn `fetchStatus`, `JSON.stringify` | 6 |

Thêm `runId` hợp lệ được echo y nguyên; nếu `report.runId` không khớp `RUN_ID_RE` thì thêm `message` cảnh báo.

### 3.2 Tách `design-gate-tools.test.ts` (300 dòng)

| File mới | Test | ~dòng |
|----------|------|-------|
| `design-gate-tools.fixtures.ts` | mock setup (`vi.mock`, `MOCK_*`, `makeReport()`) | 60 |
| `design-gate-run.test.ts` | #0, #1, #3, #4, #5, #7, #8 | 170 |
| `design-gate-rules-registry.test.ts` | #6 list_rules + `registerDesignGateLocalTools` | 70 |
| `design-gate-size-guard.test.ts` | #9, mở rộng kiểm cả hàm ≤20 dòng bằng TS AST (hiện chỉ kiểm file) | 50 |

Test #9 hiện chỉ kiểm `design-gate-tool.ts`; cần kiểm toàn thư mục `tools/design-gate/` và các file mới `report.store.ts`.

### 3.3 Vi phạm 200/20 dòng — file/hàm mà các fix chạm tới

| File | Dòng | Hàm >20 dòng | Tách trong scope? |
|------|------|--------------|-------------------|
| `design-gate-payload.ts` | 108 | `mapReportToPayload` 37 | **Có** (§3.1) |
| `detection.cache.ts` | 293 | `cacheResult` 37, `getCachedResult` 34, `invalidateCache` 31, `listCachedRuns` 36 | **Có** — viết lại theo §1.4: tách `detection.cache.ts` (get/set/invalidate, ≤150 dòng) và `report.store.ts`; mỗi hàm ≤20 |
| `fs.adapter.ts` | 292 | `validateFilePath` 22, `listSourceFiles` 58, `listFilesRecursive` 40, `readSourceFile` 32 | **Một phần**: chạm `listSourceFiles`, `isPathSafe`, `validateFilePath`. Tách `path-guard` (validate + containment, ~50 dòng) và `file-lister.ts` (list/recursive) để file <200 và hàm ≤20 |
| `report.generator.ts` | 250 | `generateQualityReport` 78, `sanitizeFilePath` 25 | **Một phần**: chỉ chạm chữ ký và `sanitizeFilePath` (rút còn ≤20 bằng `path.relative` + `isPathWithinRoot`). Tách `generateQualityReport` thành `computeScore`, `buildBreakdown`, `sanitizeFindings` để file xuống <200 |
| `integration.service.ts` | **718** | `loadDetector` 54, `runStaticDetection` 133, `runRenderedDetection` 121, `runFullDetection` 95, `loadImpeccableSkill` 22 | **Không** — nợ có sẵn, tách cần refactor riêng (static/rendered/full + load thành module). Fix này chỉ thêm ≤6 dòng gọi helper vào mỗi hàm; chuyển logic mới sang `report.store.ts` để không làm xấu thêm. Mở ticket SA4E-438 |
| `slash/index.ts` | 130 | `registerDesignGateCommand` 27, `runDetection` 30 | Chạm `runDetection` (thêm 1 dòng); tách `buildDetectionConfig()` ra để ≤20 (nhỏ, nên làm) |
| `localhost-fetcher.ts` | 247 | `fetchLocalhostPage` 137 | **Không chạm** bởi các fix này (SEC-F06 thuộc ticket riêng); nợ có sẵn |
| `wasm.loader.ts`, `design-rules.ts` (485) | 197 / 485 | `loadWasmDetector` 43, `check` 22; `design-rules.ts` 485 dòng | **Không chạm**; nợ có sẵn |

`tools/design-gate/*` còn lại (args 34, env 48, resolve 51, rules 58, tool 111) đạt chuẩn; mọi hàm trong các file này ≤20 dòng.

## 4. Thứ tự đề xuất cho dev-agent

1. `report.store.ts` + test (regex, containment, atomic) — SEC-F05.
2. Viết lại `detection.cache.ts` theo cấu trúc mới, sửa `clearAllCache`/`listCachedRuns`.
3. Nối `persistRun` và `getReport` trong `integration.service.ts` (cache-hit/miss, runId thật).
4. Thêm `workspaceRoot` (types → index → service → fs.adapter → report.generator) GĐ1; tool truyền tham số.
5. Tách `mapReportToPayload`, `fs.adapter`, `report.generator`, `runDetection` config builder.
6. Tách test, cập nhật test env; GĐ2 bỏ ghi env ở `extension.ts` và `design-gate-env.ts`.
7. Chạy lại `design_gate_run`? Không áp dụng (không sửa file design artifact); chạy `vitest` + lint + kiểm size guard.

## 5. Rủi ro / còn mở
- Mỗi lần gọi tool tạo 1 file `{runId}.json`: cần retention (đề xuất giữ N=200 gần nhất hoặc 30 ngày) — chưa thiết kế, ghi backlog SA4E-438.
- Report record chứa findings `file:line` + `message` (không có đường dẫn tuyệt đối) nhưng nằm trong workspace; kiểm `.code-intel/` đã trong `.gitignore` của dự án trước khi release.
- Không thể xác minh bằng chạy thật trong lần phân tích này (chỉ đọc code + AST đếm dòng); các số dòng đo bằng TypeScript AST.
