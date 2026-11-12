# TEST REPORT — SA4E-393 Addendum 4 — E2E D6 (design gate)

Tester: qa-agent. Production code KHÔNG bị sửa. Instance không bị kill/restart.

## Môi trường / lưu ý quan trọng
- MCP: http://127.0.0.1:9183/mcp (từ `.kiro/settings/mcp.json`), `execute_dynamic_tool` → `design_gate_run`, arguments là OBJECT.
- **Workspace root thật của instance = `c:\projects\kiro\SDLC-Agents-4-Enterprise`** (không phải worktree SA4E-393-2). Lần chạy đầu với fixture đặt trong worktree trả `Source path does not exist: c:\projects\kiro\SDLC-Agents-4-Enterprise\tmp-dg-fixture`. Fixture sau đó được copy tạm vào root của instance, chạy test, rồi xoá.
- Công thức (đọc `extension/src/slash/report.generator.ts`): `score = 1 - (số file có finding HIGH/MEDIUM) / totalFiles`; LOW không làm fail file; totalFiles=0 → score 1 (vacuous). Lưu ý: KHÔNG phải công thức trừ trọng số của `source/slash/report.generator.ts`.

## Fixture (cố ý lỗi)
`tmp-dg-fixture/` gồm `bad.html` (img thiếu alt, gradient-text, side-tab, dark-glow, marquee, buzzword, Inter, tracking âm, ai-color-palette...), `bad.css` (radial-halo, bounce-easing, Space Grotesk, !important, magic spacing...), `clean.html` (sạch). 3 file.

## Kết quả

| # | Test | Kỳ vọng | Thực tế | Kết quả |
|---|------|---------|---------|---------|
| 1 | list_rules (đã có từ trước) | 30 rules, thr 0.8 | OK (theo lời yêu cầu) | PASS |
| 2 | static trên documents/SA4E-393 (đã có) | — | run_1794496129296_l6ijx3el, score 1, 0 files | PASS (vacuous) |
| 3 | static, `tmp-dg-fixture` | findings>0, path relative+line, score<1 | runId `run_1794496229874_5mvfuaym`, score **0.6667**, pass=false, 22 findings (high 1, low 21), file `tmp-dg-fixture\bad.html` line 11 (A1 img alt)... | PASS |
| 4 | Đối chiếu công thức static | 1 - 1/3 = 0.6667 | 0.6667 | PASS |
| 5 | both, `tmp-dg-fixture` | findings>0, score cùng công thức (1 file flagged / 3) | runId `run_1794496230410_o3rdt32k`, score **0.9545**, pass=**true**, 22 findings giống hệt | **FAIL** |
| 6 | fileCount thực | = 3 | `fileCount: 0` ở cả static và both | **FAIL (bug xác nhận)** |
| 7 | SEC-F01 `../..` | reject, không lộ path | `PATH_REJECTED_OUTSIDE_WORKSPACE: source_path resolves outside the workspace`, isError=true | PASS |
| 8 | SEC-F01 absolute `C:\Windows` | reject | như trên | PASS |
| 9 | SEC-F02 junction → ngoài root (`mklink /J`) | reject | `PATH_REJECTED_OUTSIDE_WORKSPACE...`, isError=true | PASS |
| 10 | SEC-F03 ký tự regex `a(b[c*+?^$` | không crash; không lộ path | ok:true, score 0, pass **false**, message `Source path does not exist: c:\projects\kiro\SDLC-Agents-4-Enterprise\a(b[c*+?^$` | **FAIL** (lộ absolute path, xem F-3) |
| 11 | Dọn dẹp | fixture + junction xoá, target junction không bị ảnh hưởng | junction xoá bằng `cmd /c rmdir`; temp target và fixture đã xoá (Test-Path = False cả 3) | PASS |
| 12 | `tsc -p ./ --noEmit` (extension) | 0 lỗi | exit 0 | PASS |
| 13 | `eslint src/tools/design-gate` | 0 lỗi | exit 0 (chỉ warning MODULE_TYPELESS). `src/slash` bị eslint ignore theo config nên không lint được | PASS |
| 14 | `vitest run design-gate` | pass | 3 file, 21/21 pass | PASS |

## Findings (FAIL, kèm bằng chứng)

- **F-1 (bug fileCount=0)**: `design-gate-payload.ts:85` `fileCount: report.fileCount ?? 0`. `generateQualityReport` không đặt `fileCount` vào `QualityReport` nên payload luôn 0 (run #3, #5 đều `fileCount: 0` dù scan 3 file). Xác nhận.
- **F-2 (score both ≠ static, root cause)**: run #5 dùng cache (`cacheReuse: true`). `extension/src/slash/integration.service.ts:149` khi cache hit đặt `fileCount: cached.findings.length` (=22 findings) thay vì số file (3). Hệ quả: `scopeFiles`=22, score = 1 - 1/22 = 0.9545 → pass=true, trong khi cùng dữ liệu static cho 0.6667/fail. Gate **báo PASS sai** trên input có lỗi HIGH khi chạy `both` sau `static` (cache hit). Nghiêm trọng (false pass). Chưa kiểm tra riêng nhánh rendered (không có dev-server localhost).
- **F-3 (rò absolute path, vi phạm C5/SEC-F01 tinh thần)**: khi source_path hợp lệ về containment nhưng không tồn tại, `message` trả `Source path does not exist: <absolute workspace root>\...` (run #10 và lần chạy đầu). Chỉ nhánh reject mới được sanitize. Cũng: path không tồn tại trả `score 0, pass false, ok true` (không phải isError).
- **Ghi chú**: file path trong findings dùng dấu `\` (Windows), relative — đạt. Chạy trên worktree khác root với instance: cần chạy test ở root instance; nếu agent truyền path của worktree sẽ không thấy.
- Chưa test: mode=rendered thật, `findings_limit` truncate trên instance, whole-workspace scan (không thực hiện để tránh quét repo lớn).

## Kết luận
Core chức năng (phát hiện, line, relative path, runId, công thức static, 3 negative reject) đạt. **3 FAIL**: F-1 (fileCount luôn 0), F-2 (false PASS ở both khi cache hit — nên fix trước release), F-3 (lộ absolute path trong message path-không-tồn-tại). Đề xuất: ghi nhận backlog SA4E-438 hoặc fix và re-run.
