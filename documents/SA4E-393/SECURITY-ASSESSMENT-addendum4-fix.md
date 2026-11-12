# Security Assessment — SA4E-393 Addendum 4 (post bug-fix quick review)

| Field | Value |
|-------|-------|
| Scope | Working-tree diff of the BUG-SA4E-393 fix; `extension/src/tools/design-gate/{design-gate-tool,design-gate-env,design-gate-resolve,design-gate-args,design-gate-payload}.ts`, plus `services/PathResolver.ts`, `slash/{fs.adapter,localhost-fetcher,detection.cache,report.generator}.ts` where the tool path reaches them |
| Focus | C3 path traversal, C4 SSRF, C5 no absolute paths in output, C6 persistence / runId, removal of `WORKSPACE_ROOT` from `PathResolver` |
| Method | Code reading plus a throw-away vitest probe (temp dir, real NTFS junction). The probe has been deleted and no source was modified. |
| Platform | Windows (win32). POSIX behaviour is from code reading only. |
| Not tested | Real extension host, live dev server, an end-to-end MCP call |

## Verdict: **PASS WITH CONDITIONS**

There is no Critical or High finding and no remote-exploitable hole. C3 is sound for lexical traversal and C4 is sound. One Medium finding on C3 (symlink/junction) and one Medium on C5 (absolute-path leak) should be fixed or risk-accepted before release. The `PathResolver` change does not weaken any other tool; it strengthens them.

## Findings

| ID | Severity | Condition | File | Description | Remediation |
|----|----------|-----------|------|-------------|-------------|
| SEC-F01 | **Medium** | C5 | `design-gate-resolve.ts:20-23` → `PathResolver.ts` (Step 4 message), forwarded by `design-gate-tool.ts:68` | `toolError(resolution.message)` forwards the PathResolver message verbatim. It contains the **absolute resolved path and the absolute workspace root**. Probe: `../outside` → `...resolves to C:\Users\...\outside — outside workspace root C:\Users\...\root.` This breaks TDD D4/C5 ("no absolute path in output, including errors"). The `<workspace>` strip in `sanitizeErrorText` is applied only in the catch path, not on this path. Tests that assert on the `PATH_REJECTED_OUTSIDE_WORKSPACE` code do not detect the leak. | In `resolveSourceRoot`, on `!ok` return only `${code}: source_path must stay inside the workspace` (use `resolution.code`, never `.message`/`rootPath`/`resolvedPath`). Add a unit test that asserts the output contains no drive letter or root. |
| SEC-F02 | **Medium** | C3 | `PathResolver.ts` `isPathWithinRoot` (lexical only); `fs.adapter.ts` `validateFilePath` / `readSourceFile` | No `realpath` check. Probe: a junction `root\link → outside` is accepted by `resolveSourceRoot('link')`. `listSourceFiles` returned `link\secret.html` and `readSourceFile` read the content outside the workspace. Mitigation present: `Dirent.isDirectory()` does not follow links, so links found **during recursion** are skipped. Only a link used as `source_path` (or the root itself) escapes. Impact is limited to design-file extensions, and content reaches the output only as rule messages and `file:line`. An attacker must be able to create a link inside the workspace. | After resolution, `fs.realpathSync.native(resolved)` and re-check containment against `realpathSync(root)`. Do this in `resolveSourceRoot` and in `readSourceFile`, or use `lstat` to refuse symlink/junction `source_path`. Fold it into `PathResolver` so every tool benefits. |
| SEC-F03 | **Low** | C5 | `design-gate-payload.ts:50-53` (`sanitizeErrorText`) | The regex is built from the root without escaping metacharacters (`.`, `(`, `)`, `+` are interpreted). It matches only the backslash form, case-sensitively. Probes: with the root `C:\Users\x.y (1)\proj` nothing was stripped, and with `C:/Users/ASUS/ws/a.html` (forward slashes) nothing was stripped. On POSIX, `/` is rewritten to `\`, so nothing ever matches (`/home/u/ws/a.html` leaked). Error text from fs/WASM often carries absolute paths (ENOENT, EACCES). It also never strips `os.tmpdir()`, the extension path or the WASM path. | Escape with `s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')`; match both separator variants and use the `i` flag on win32. Better: replace by `split(root).join('<workspace>')` for each of `root`, its `/` variant, `extensionPath`, `os.homedir()`. Fall back to a generic message keyed by error code. |
| SEC-F04 | **Low** | C6 | `detection.cache.ts:97-103`; description in `design-gate-tool.ts` | **Runtime does not match the contract.** The file is named `sha256(sourcePath:mode).json`, **not `{runId}.json`**. Consequence: (+) no path injection through the filename, because the name is a fixed hex digest, runId is generated internally (`run_${Date.now()}_…`) and the tool accepts no runId input. (−) The `runId` field **inside the file** is `sourcePath`, the absolute path, which breaks the "full report persisted to {runId}.json (BR-12)" claim and gives the agent no usable runId→file mapping. The cache holds absolute paths in a workspace-local file, so there is no output leak, but it is inconsistent with C5. The write is non-atomic (`writeFileSync`, no mode, `mkdir` follows links). `.code-intel` is not gitignored-checked here. | Either persist the report under a sanitized runId (`/^run_[0-9]{10,}_[a-z0-9]{8}$/` allow-list, resolved name checked to lie under the cache dir) or correct the tool description. Store a relative `sourcePath`. Write to a temp file and rename. |
| SEC-F05 | **Low (latent)** | C6 | `integration.service.ts:529-535` `getReport(runId)` | `path.join(cacheDir, `${runId}.json`)` with an unvalidated `runId` allows `..\..\x` to read any `*.json` outside the cache. **No caller exists in the tool path** (the design-gate tools expose no runId input), so it is not exploitable today. It becomes exploitable if a "get report by runId" tool is added. | Validate `runId` against the allow-list regex above and check containment before reading. |
| SEC-F06 | **Low** | C4 | `localhost-fetcher.ts` `res.on('data')` handler | The size-limit `throw` runs inside an event callback, so it becomes an **uncaught exception in the extension host** and not a rejected promise (DoS-class on a local malicious dev server). The Content-Type regex `^text\/html$` rejects `text/html; charset=utf-8`, so real servers fail with FETCH_FAILED (functional). `http.get` does not follow redirects, which is good for SSRF. | Call `req.destroy(err)` / `reject(err)` instead of `throw`. Parse the media type before the `;`. |
| SEC-F07 | **Info** | C3 | `fs.adapter.ts` `validateFilePath` | `startsWith(root)` has no separator guard, but the follow-up `path.relative(...)` check catches it. The `root-evil` case was rejected (see the matrix). Fragile defense in depth, no exploit. | Use `isPathWithinRoot` from PathResolver (one implementation). |
| SEC-F08 | **Info** | Env | `design-gate-env.ts:45` | `process.env.WORKSPACE_ROOT` is still written **per call** and is process-global. fs.adapter, cache and report.generator read it. It is set on every call from the live root, and the tool-router no longer sets it, so the stale-root risk is lower than before. Concurrent calls with different workspaces would race, but the root is always `workspaceFolders[0]`, so this is theoretical. | Longer term, pass the root through `DetectionConfig` instead of env. |

## Condition matrix (probe results, Windows)

### C3 — `source_path`

| Input | Result |
|-------|--------|
| `../outside`, `src/../../outside` | Rejected |
| Absolute path outside the root | Rejected |
| Sibling with the same prefix, `root-evil` (absolute and `../root-evil`) | Rejected (PathResolver; fs.adapter also rejects) |
| UNC `\\server\share\x` | Rejected |
| Other drive `Z:\foo` | Rejected |
| `/etc` (resolves to `C:\etc`) | Rejected |
| NUL byte | Rejected (`PATH_INVALID`) |
| Different case on the root (win32) | Accepted, correct (case-insensitive FS) |
| Junction `link → outside` | **Accepted, content readable (SEC-F02)** |

The tool takes no URL or runId parameters. Empty `source_path` falls back to the root.

### C4 — SSRF
`isLocalhostUrl` accepts only the hostnames `localhost` and `127.0.0.1` (case-insensitive; `127.1` and `2130706433` are normalized by WHATWG URL to 127.0.0.1, which is still loopback).

Rejected: `localhost.evil.com`, `127.0.0.1.evil.com`, `localhost:5173@evil.com`, `[::1]`, `0.0.0.0`, `127.0.0.2`, `169.254.169.254`, `localhost.`, `file://`.

Accepted: `user:pw@localhost` (host is still localhost, harmless).

The URL can be set only through the `LOCALHOST_DEV_SERVER_URL` env var, never through tool arguments, and it is validated in both `integration.service` and `fetchLocalhostPage`. No redirect following. **C4 holds**; SEC-F06 is a robustness issue.

### C5 — output
- Findings: `sanitizeFilePath` in `report.generator` makes them relative (reviewed, not changed by this diff).
- Payload fields (`file`, `message`) carry no root. `runId` is generated and contains no path.
- **Error text leaks** the root: SEC-F01 (verified) and SEC-F03 (verified).
- `console.error(... e.stack)` goes to the host log only, not to the response (OK).

### `WORKSPACE_ROOT` removal from `PathResolver.defaultWorkspaceRootProvider`
- Before: any `process.env.WORKSPACE_ROOT` (set by tool-router or by an earlier call) **overrode** the real vscode root for every tool using `resolveWorkspacePath` (embed_image, stream_write, Base64ProxyService, jira attach, and others). A stale or wrong value silently moved the containment boundary.
- After: root = `workspaceFolders[0]` per call, with no cache. The boundary is now set only by the editor, so **no boundary check is weakened**; the change reduces env-driven boundary drift.
- Remaining behaviour: when vscode is unavailable (the probe returned `undefined`), tools fall back to `cwd_fallback`. Relative paths are rejected (SEC-02) and absolute paths pass without containment (pre-existing DISC-1, unchanged).
- The `workspaceRoot`/`wasmPath` deps removed from `WrapperServerDeps` and tool-router also reduce env mutation (positive).
- `design_gate_run` is not affected because it passes its own `rootProvider`.

## Conditions for release
1. Fix SEC-F01 (Medium, small change).
2. Fix SEC-F02 (Medium) or record a risk acceptance; `realpath` in PathResolver is preferred.
3. Triage SEC-F03 to SEC-F06 in the shared backlog (SA4E-438).

## Limitations
Windows-only probes. Tests were run against units, not through MCP. POSIX symlinks were reasoned about, not run. Temporary files have been removed (probe test and its output file); no source changes were made.

---

## Re-review sau fix F04–F08 (working tree chưa commit)

| Field | Value |
|-------|-------|
| Method | Đọc code thật (git diff + file untracked), chạy `npx vitest run src/__tests__/design-gate` (12 files / 64 tests pass), `npx vitest run` toàn extension (444 files pass, 3465 tests pass, 6 skipped), `npx tsc --noEmit` sạch. Không sửa code. |
| Platform | Windows. POSIX chỉ đọc code, chưa chạy. |
| Chưa kiểm | Chạy thật trong extension host, gọi MCP end-to-end, kiểm tra quyền file 0600 trên POSIX (Windows bỏ qua mode). |

### Verdict: **PASS** (không còn Critical/High/Medium; 4 điểm Low/Info còn lại để theo dõi ở SA4E-438)

### Kết luận từng finding

| ID | Kết luận | Bằng chứng code | Test |
|----|----------|-----------------|------|
| SEC-F01 | **FIXED** | `design-gate-resolve.ts:12-16,38` (`genericReject` chỉ giữ CODE + câu cố định, không dùng `.message`/root). Nhánh `PATH_NOT_FOUND` (`:43`) chỉ trả path tương đối. `design-gate-tool.ts:68` giờ chỉ forward chuỗi generic. | `design-gate-explicit-root.test.ts`, `design-gate-run.test.ts` |
| SEC-F02 | **FIXED** (cho đường tool) | `design-gate-resolve.ts:19-22,46-48` kiểm `realpath(target)` nằm trong `realpath(root)`, link hỏng thì fail-closed (`:50-52`). Khi duyệt thư mục, `file-lister.ts:57-62` dùng `Dirent.isDirectory()/isFile()` nên symlink/junction bị bỏ qua. `report.store.ts:68-73` `ensureDirInside` chặn `.code-intel` là symlink thoát root. | `design-gate-fs-adapter-containment.test.ts`, `design-gate-explicit-root.test.ts` |
| SEC-F03 | **FIXED** | `path-redactor.ts:10-34`: escape metacharacter, khớp cả `\` và `/`, cờ `i` trên win32, thay mọi đường dẫn tuyệt đối còn lại bằng `<path>`. Dùng ở `design-gate-payload.ts:46-48`, `design-gate-tool.ts:97-100` (log), `error-text.ts`, và mọi `logRedacted` trong `slash/`. | `design-gate-log-redaction.test.ts` |
| SEC-F04 | **FIXED** | `report.store.ts:93-110` ghi `{runId}.json` đúng hợp đồng BR-12; `:80-90` ghi atomic (`wx` + `mode 0o600` vào tmp cùng thư mục, rồi `rename`, dọn tmp khi lỗi). `detection.cache.ts:57-68` dùng cùng `writeJsonAtomic`, lưu `sourcePath` tương đối và `runId` thật (không còn là đường dẫn tuyệt đối). Lỗi ghi được báo lên `report.message` (`integration.service.ts:106-115`), không nuốt. | `design-gate-report-store.test.ts`, `design-gate-persist-run.test.ts` |
| SEC-F05 | **FIXED** | `report.store.ts:20,35-37` `RUN_ID_RE = /^run_\d+_[a-z0-9]+$/` + giới hạn 64 ký tự (`$` trong JS không có cờ `m` nên không khớp trước newline cuối). Mọi đường dẫn dựng từ runId đi qua `resolveInside` (`:40-46`, chặn NUL, `..`, bằng chính thư mục) ở `saveReport :97`, `loadReport :117`. `getReport` (`integration.service.ts:121-123`) gọi `loadReport`; id sai và id không tồn tại cùng trả `undefined` (không có oracle). `listRunIds :131-138` lọc theo regex. | `design-gate-report-store.test.ts` |
| SEC-F06 | **FIXED** | `localhost-request.ts:60-70`: vượt 10MB thì `req.destroy()` + `reject` (không `throw` trong callback). `:25-30` tách media type trước `;` nên `text/html; charset=utf-8` được chấp nhận. Timeout cũng reject (`:92-96`). Không theo redirect (`http.get`). | `design-gate-localhost-fetcher.test.ts` |
| SEC-F07 | **FIXED** | `path-guard.ts:14-16` dùng `isPathWithinRoot` của PathResolver (một cài đặt duy nhất), `fs.adapter.ts` và `file-lister.ts` đều đi qua đó. | `design-gate-fs-adapter-containment.test.ts` |
| SEC-F08 | **FIXED** | `design-gate-env.ts:41-47` không còn ghi `process.env.WORKSPACE_ROOT`; root đi qua `DetectionConfig.workspaceRoot` (`index.ts:67`, `integration.service.ts:rootOf`, cache/report/lister nhận root tường minh). `getWorkspaceRoot()` (env/cwd) chỉ còn là fallback cho caller không truyền root. | `design-gate-explicit-root.test.ts` |

### Kiểm thêm

| Hạng mục | Kết quả |
|----------|---------|
| Regex runId + containment | Đạt: regex neo hai đầu, giới hạn độ dài, `resolveInside` ở mọi chỗ ghi/đọc/liệt kê. Tool không nhận runId từ input. |
| Symlink/realpath cacheDir | Đạt: `ensureDirInside` gọi `realpathSync` cả root và dir sau `mkdir`, dùng cho report và cache. Xem điểm S-2 về TOCTOU. |
| SSRF fetcher | **Còn nguyên**: `isLocalhostUrl` (`localhost-fetcher.ts:48-62`) chỉ chấp nhận hostname `localhost` / `127.0.0.1`, kiểm lại trong `fetchLocalhostPage` (`:98`), không redirect, cap 10MB, timeout 10s, retry 1 lần. Refactor tách `localhost-request.ts` không đổi logic chặn. |
| Rò đường dẫn tuyệt đối | Đạt: output tool, `report.message`, log host đều qua `redactPaths`/`logRedacted`. Findings dùng `sanitizeFilePath` (tương đối). File ghi ra đĩa chứa `sourcePath` tương đối. |
| Ghi file atomic, mode 0600 | Đạt trên code (`flag: "wx"`, `mode: 0o600`, rename). Windows không thực thi mode; POSIX chưa chạy thật. |
| Hồi quy do refactor `integration.service` | Không thấy: `tsc` sạch, 3465 test của extension pass, API công khai (`loadDetector`, `runStatic/Rendered/FullDetection`, `getReport`, `listReports`, `reset`, `getImpeccableService`) giữ nguyên chữ ký; `runFullDetection` đảm bảo mọi runId trả ra đều có record (`:80-83`). |

### Điểm còn lại (không chặn release)

| ID | Mức | Mô tả | Gợi ý |
|----|-----|-------|-------|
| S-1 | Low | `errorReport()` (`report.generator.ts:46`) dùng runId `run_error`, không khớp `RUN_ID_RE`, nên `persistRun` từ chối và `report.message` báo "report not persisted". Run lỗi không có audit record (không rò dữ liệu, chỉ mất dấu vết). | Sinh runId hợp lệ cho report lỗi. |
| S-2 | Low | `ensureDirInside` kiểm sau `mkdir` và `realpath` của `source_path` kiểm một lần; có cửa sổ TOCTOU nếu kẻ tấn công đổi link giữa lúc kiểm và lúc dùng. Cần quyền ghi vào workspace. Ngoài ra `listSourceFiles`/`readSourceFile` gọi trực tiếp (không qua tool) không tự `realpath` `sourceRoot`; hiện chỉ tool gọi và đã qua `resolveSourceRoot`. | Đưa `realpath` vào PathResolver hoặc `assertListable`. |
| S-3 | Info | `redactPaths` là heuristic: đường dẫn POSIX chứa khoảng trắng hoặc ký tự lạ ngoài workspace root chỉ được che một phần. Windows có khoảng trắng ngoài root cũng vậy. | Chấp nhận; bổ sung test nếu có ca thực tế. |
| S-4 | Info | Mode 0600 chưa được xác minh runtime; tmp file không `fsync` trước rename (độ bền khi mất điện, không phải bảo mật). Thư mục `.code-intel/design-gate` tạo bằng mode mặc định. | Tuỳ chọn `mkdirSync(..., {mode: 0o700})`. |

Hạn chế: không chạy kiểm thử thâm nhập động và không có junction thật trong lần chạy này (dựa vào test trong repo và đọc code).
