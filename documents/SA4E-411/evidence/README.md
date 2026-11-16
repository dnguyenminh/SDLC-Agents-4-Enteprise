# Evidence index — SA4E-411 (Code Agent 16K)

Thư mục này chứa **bằng chứng chạy thật** cho hướng dẫn sử dụng `documents/SA4E-411/UG.md`.

> ## ⚠️ Trạng thái thư mục: **UNTRACKED**
>
> `git status` hiện báo `?? documents/SA4E-411/evidence/`.
> **Reviewer mở branch ở trạng thái committed sẽ KHÔNG thấy thư mục này.**
> Chưa `git add` / commit theo yêu cầu của user — SM/user tự quyết định.
> Lệnh khuyến nghị (chưa chạy): `git add documents/SA4E-411/evidence/`

## Nguyên tắc

- **Ảnh UG chỉ chụp từ instance Kiro cô lập** (profile riêng, mở workspace-file trỏ tới worktree SA4E-411)
  và **backend cô lập `:48731`** — không dùng instance Kiro/backend dùng chung `:48721` làm bằng chứng.
- Provenance ảnh được chứng minh bằng **dữ liệu văn bản** (SHA-256 · bytes · mtime · cây accessibility của
  `orca computer get-app-state --json`), không phụ thuộc việc mở xem pixel.
- Transcript `.raw-*.txt` là **output thật** của vitest / driver chạy trong worktree `SA4E-411`.
- File `.md` là bản diễn giải kỹ thuật nội bộ — **không nhúng vào UG**.

## Kết quả xác minh lại (pass hiện tại)

| Chỉ số | Kết quả |
|--------|---------|
| Số lệnh được chạy lại | **20 / 20** |
| Exit code | **20 / 20 = 0** |
| `mismatches` | **`[]` — không có sai lệch so với bản gốc** |
| `generatedAt` | `2026-11-16T07:11:06Z` |
| Tổng file evidence | **77** (`VERIFIED` 41 · `NOT_REPRODUCIBLE` 36) |
| Ảnh UG chụp mới | **3** (tất cả từ instance Kiro cô lập, PID 29420) |
| Ảnh cũ đã xoá | **4** (`STALE-IMAGE` — chụp từ repo `main` + backend `:48721`) |

Nguồn: [`.rerun-report.json`](.rerun-report.json) · [`MANIFEST.md`](MANIFEST.md) · [`manifest.sha256`](manifest.sha256) ·
[`screenshots-manifest.md`](screenshots-manifest.md)

Kiểm tra lại checksum:

```powershell
cd documents/SA4E-411/evidence
Get-Content manifest.sha256 | ForEach-Object {
  $p = $_ -split "  ",2
  if ((Get-FileHash $p[1] -Algorithm SHA256).Hash -ne $p[0]) { "MISMATCH " + $p[1] }
}
```

## Bảng lệnh đã chạy lại (exit code)

| # | Label | Lệnh | Exit | Kết quả thật | Transcript |
|---|-------|------|------|--------------|------------|
| 1 | `ac01-08` | `npx vitest run src/engine/acceptance/__tests__/acceptance-ac01-08.test.ts --reporter=verbose` | 0 | Test Files  1 passed (1) | `.rerun-ac01-08.txt` |
| 2 | `pipeline` | `npx vitest run src/engine/pipeline/__tests__/index-pipeline.isolation.test.ts src/engine/pipeline/__tests__/index-pipeline.order.test.ts src/engine/chunking/__tests__/ast-chunker.test.ts --reporter=verbose` | 0 | Test Files  3 passed (3) | `.rerun-pipeline.txt` |
| 3 | `retrieval` | `npx vitest run src/engine/retrieval/__tests__/snapshot-retrieval.test.ts --reporter=verbose` | 0 | Test Files  1 passed (1) | `.rerun-retrieval.txt` |
| 4 | `query` | `npx vitest run src/engine/api/__tests__/pinned-snapshot-guard.test.ts src/engine/agent-tools/__tests__/core-tools.test.ts src/engine/map/__tests__/repo-map-service.test.ts src/engine/map/__tests__/repo-map-rank.test.ts --reporter=verbose` | 0 | Test Files  4 passed (4) | `.rerun-query.txt` |
| 5 | `coretools` | `npx vitest run src/engine/map/__tests__/repo-map-service.test.ts src/engine/agent-tools/__tests__/core-tools.test.ts src/engine/map/__tests__/repo-map-rank.test.ts --reporter=verbose` | 0 | Test Files  3 passed (3) | `.rerun-coretools.txt` |
| 6 | `scratchpad` | `npx vitest run src/engine/scratchpad/__tests__/scratchpad.test.ts src/engine/scratchpad/__tests__/eviction.test.ts src/engine/scratchpad/__tests__/token-eviction.integration.test.ts --reporter=verbose` | 0 | Test Files  3 passed (3) | `.rerun-scratchpad.txt` |
| 7 | `security` | `npx vitest run src/engine/security/__tests__/staged-patch.test.ts src/engine/security/__tests__/patch-protocol.test.ts src/engine/security/__tests__/sandbox.test.ts --reporter=verbose` | 0 | Test Files  3 passed (3) | `.rerun-security.txt` |
| 8 | `stagedpatch` | `npx vitest run src/engine/security/__tests__/staged-patch.test.ts src/engine/security/__tests__/patch-protocol.test.ts --reporter=verbose` | 0 | Test Files  2 passed (2) | `.rerun-stagedpatch.txt` |
| 9 | `sandbox` | `npx vitest run src/engine/security/__tests__/sandbox.test.ts --reporter=verbose` | 0 | Test Files  1 passed (1) | `.rerun-sandbox.txt` |
| 10 | `agent` | `npx vitest run src/engine/agent/__tests__/sse-stream.test.ts src/engine/agent/__tests__/agent-state-recovery.test.ts src/engine/agent/__tests__/agent-persistence.test.ts --reporter=verbose` | 0 | Test Files  3 passed (3) | `.rerun-agent.txt` |
| 11 | `resume` | `npx vitest run src/engine/agent/__tests__/agent-persistence.test.ts src/engine/agent/__tests__/agent-state-recovery.test.ts --reporter=verbose` | 0 | Test Files  2 passed (2) | `.rerun-resume.txt` |
| 12 | `sse` | `npx vitest run src/engine/agent/__tests__/sse-stream.test.ts --reporter=verbose` | 0 | Test Files  1 passed (1) | `.rerun-sse.txt` |
| 13 | `pinned` | `npx vitest run src/engine/api/__tests__/pinned-snapshot-guard.test.ts --reporter=verbose` | 0 | Test Files  1 passed (1) | `.rerun-pinned.txt` |
| 14 | `ac09-12` | `npx vitest run src/engine/acceptance/__tests__/acceptance-ac09-12.test.ts --reporter=verbose` | 0 | Test Files  1 passed (1) | `.rerun-ac09-12.txt` |
| 15 | `ac13-16` | `npx vitest run src/engine/acceptance/__tests__/acceptance-ac13-16.test.ts --reporter=verbose` | 0 | Test Files  1 passed (1) | `.rerun-ac13-16.txt` |
| 16 | `regression` | `npx vitest run src/engine/regression/__tests__/sa4e-regression.test.ts --reporter=verbose` | 0 | Test Files  1 passed (1) | `.rerun-regression.txt` |
| 17 | `tokenbudget` | `npx vitest run src/pi-agent/__tests__/acceptance-ac17.test.ts src/pi-agent/__tests__/session-budget-gate.test.ts src/pi-agent/__tests__/budget-gate-runtime-count.test.ts src/pi-agent/__tests__/budget-gate-escalation.test.ts src/pi-agent/__tests__/budget-gate-enforce.test.ts src/pi-agent/__tests__/budget-gate-decisions.test.ts src/pi-agent/__tests__/context-budget-resolver.pbt.test.ts src/pi-agent/__tests__/runtime-tokenizer.test.ts src/pi-agent/__tests__/token-eviction.integration.test.ts --reporter=verbose` | 0 | Test Files  9 passed (9) | `.rerun-tokenbudget.txt` |
| 18 | `ext-regression` | `npx vitest run src/__tests__/sa4e-regression.test.ts --reporter=verbose` | 0 | Test Files  1 passed (1) | `.rerun-ext-regression.txt` |
| 19 | `demo` | `npx tsx ..\documents\SA4E-411\evidence\demo-driver-core-tools.mts` | 0 |  | `.rerun-demo.txt` |
| 20 | `demo2` | `npx tsx ..\documents\SA4E-411\evidence\demo-driver-patch-sse-resume.mts` | 0 |  | `.rerun-demo2.txt` |
> Bảng lệnh gốc (không rút gọn) nằm trong [`MANIFEST.md`](MANIFEST.md) §2.

## Bằng chứng ảnh UG (chụp mới)

| File | Nội dung |
|------|----------|
| `../diagrams/ug-sa411-01-sdlc-agents-panel.png` | Panel **SDLC Agents** — điểm vào, backend đang trỏ tới `:48731` |
| `../diagrams/ug-sa411-02-ai-context-symbol.png` | Lấy ngữ cảnh AI cho symbol → thông báo thành công |
| `../diagrams/ug-sa411-03-no-active-editor.png` | Gọi lệnh khi không có file mở → thông báo cảnh báo |

Metadata đầy đủ (SHA-256 · bytes · mtime · PID · tiêu đề cửa sổ · profile · phiên bản extension · dòng log backend):
[`screenshots-manifest.md`](screenshots-manifest.md)

## Script kiểm chứng

| Script | Công dụng |
|--------|----------|
| [`rerun-evidence.mjs`](rerun-evidence.mjs) | Chạy lại 20 lệnh acceptance, ghi `.rerun-*.txt` + `.rerun-report.json` |
| [`verify-evidence.mjs`](verify-evidence.mjs) | So kết quả chạy lại với bản gốc |
| [`freshness-probe.mjs`](freshness-probe.mjs) | Chứng minh backend cô lập mang schema 16K (30 bảng V6 · 36 index `idx_16k_%` · schema v6) |
| [`mcp-probe.mjs`](mcp-probe.mjs) | Gọi tool qua MCP wrapper của instance cô lập (`tools/list` + `tools/call`) |
| [`db-inspect.mjs`](db-inspect.mjs) / [`db-count.mjs`](db-count.mjs) | Kiểm tra store SQLite cô lập |
| [`seed-index.mjs`](seed-index.mjs) | Nạp 3 file nguồn SA4E-411 vào index cô lập |
| [`start-isolated-backend.ps1`](start-isolated-backend.ps1) | Chạy backend cô lập (port 48731 · data dir riêng) |
| [`start-isolated-kiro.ps1`](start-isolated-kiro.ps1) | Mở Kiro cô lập (profile riêng · VSIX build từ worktree này) |
| [`capture-kiro.ps1`](capture-kiro.ps1) / [`find-click.ps1`](find-click.ps1) / [`ug-flow-ai-context.ps1`](ug-flow-ai-context.ps1) | Chụp ảnh + điều khiển GUI qua `orca computer` |
| [`build-manifest.ps1`](build-manifest.ps1) | Sinh `MANIFEST.md` + `manifest.sha256` + `screenshots-manifest.md` |

