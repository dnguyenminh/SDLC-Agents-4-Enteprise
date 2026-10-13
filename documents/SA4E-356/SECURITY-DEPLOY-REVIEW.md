# 🔒 Security Deployment Review — SA4E-356 (Phase 6.7b)

## Document Information

| Field | Value |
|-------|-------|
| Project | SDLC-Agents-4-Enterprise (SA4E extension + backend child server) |
| Ticket | SA4E-356 — [Bug] MCP tools: relative file_path resolves against process CWD instead of workspace root |
| Phase | 6.7b — Security Deployment Review (UAT PASS ✅ 2026-10-14, trước release Phase 7) |
| Date | 2026-10-14 |
| Assessor | Security Agent (static + artifact forensics — KHÔNG commit, KHÔNG exploit) |
| Branch | main (HEAD chứa 356 `7c525a8`+SA-02 fix và 358 `7bb9222`+OriginGate) |
| Artifacts reviewed | `extension/sdlc-agents-4-enterprise-1.48.0.vsix` (đang chạy trong Kiro), `1.52.0.vsix` (combined candidate), `extension/package.json` + scripts (esbuild.js, copy-resources.js, gen-checksums.js, .vscodeignore), `.github/workflows/ci-sa4e-356.yml` + `ci-sa4e-358.yml`, `.husky/pre-commit`, lockfiles (root + extension), `documents/SA4E-356/{TDD v1.2, SECURITY-ASSESSMENT, PENTEST-REPORT, RUN-LOG 57-59, STATUS.json}`, `documents/SA4E-358/{SECURITY-ASSESSMENT, STATUS.json}` |
| UAT evidence | RUN-LOG #57 (build+deploy 1.48.0 → verify marker PATH_NO_WORKSPACE trong bundle), #58 (evidence agent-side: stream_write_file relative path live), #59 (user confirm "UAT pass" — REG-1/REG-2 trên build deployed) |
| Verdict | **✅ APPROVED WITH CONDITIONS** |

---

## 1. Executive Summary

Deployment readiness của SA4E-356 được đánh giá trên 8 trục checklist (deployment procedure, supply chain, CI/CD, runtime surface, rollback, monitoring, transition consistency, SA-07). **Runtime security posture: LOW** — code của 356 (containment) và 358 (CORS gate) đều đã được verify độc lập BÊN TRONG artifact build thật: bundle `1.48.0` chứa `PATH_NO_WORKSPACE` (2 markers, khớp RUN-LOG #57) nhưng **không có gate** và vẫn chứa đúng 1 pattern `setHeader("Access-Control-Allow-Origin", "*")` (SA-01 — đúng như trạng thái đã khai báo); bundle `1.52.0` (combined 356+358) chứa **4 markers của OriginGate** (`evaluateOriginGate`/`host-mismatch`/`origin-not-allowed`), **0 pattern ACAO \***, và giữ nguyên `PATH_NO_WORKSPACE` — chứng minh combined build chứa CẢ HAI fixes, không regression giữa 2 ticket. Bind `127.0.0.1:9181` xác nhận tại HEAD (`WrapperServer.ts:110`), gate chạy trước mọi route + trước body-read, stdio đi in-process không qua HTTP (không bị gate làm hỏng native client).

**Deployment/release readiness: MEDIUM risk** — 2 findings Medium nằm ở tầng artifact & supply chain, không phải code: **SD-01** — `.vscodeignore` tồn tại nhưng **thiếu rules** nên release VSIX (cả 1.48.0 lẫn 1.52.0) đang ship dev/debug artifacts: 4 file `pega-*.txt` (browser-inspector dump chứa internal URL `zdk8budo.pegaacademy.net`), `coverage/coverage-summary.json`, `PUBLISH.md`, `screenshots/*`, `svelte/*`, **stale `out/**/*.js.map` (source maps — `.vscodeignore` chỉ exclude `*.map` ở root)** và file thừa trong `resources/.analysis/` (`project-structure.md`, `kb-payloads.json` — không nằm trong MAPPINGS của copy-resources.js). **SD-02** — `extension/package-lock.json` **stale nghiêm trọng** (không chứa `pi-web-access` — direct dependency; 867 packages vs root lock 1173) nên CI job `npm audit --omit=dev --audit-level=high` **đang audit trên lock không phản ánh tree thật** (không thấy HIGH nested SDK 1.27.1 của SA-07), và CI install bằng `npm install --force` (float) thay vì `npm ci` → **build không reproducible**.

Không có finding nào chặn deploy nội bộ. **Go/No-Go: GO cho Phase 7** với 4 điều kiện bắt buộc (C1–C4, xem §8) — quan trọng nhất: **deploy PHẢI dùng combined build** (đã verify = 1.52.0 hoặc build mới hơn sau khi thêm .vscodeignore), verify markers trong artifact cuối trước khi install, Reload Window ngay sau `--force` install, và rollback plan phải document mất CORS gate. SA-07 (HIGH transitive) được đánh giá lại: **ACCEPT với follow-up** — không block (client-side, loopback-only, zero new surface, pre-existing trước cả 2 ticket).

### Severity Counts

| Severity | Count | IDs |
|----------|-------|-----|
| 🔴 Critical | 0 | — |
| 🟠 High | 0 | — |
| 🟡 Medium | 2 | SD-01 (artifact hygiene), SD-02 (supply chain lock/audit blind) |
| 🔵 Low | 3 | SD-03 (no signing/checksum publication), SD-04 (transition window), SD-05 (rollback mất gate) |
| ℹ️ Informational | 4 | SD-06 (monitoring gaps), SD-07 (gen-checksums dirty-tree), SD-08 (CI action pins), SD-09 (SA-07 re-assessment = accept) |

---

## 2. Findings Table

| # | Severity | Area | Description | Remediation | Owner |
|---|----------|------|-------------|-------------|-------|
| SD-01 | 🟡 Medium | Deployment procedure — VSIX artifact hygiene | `.vscodeignore` thiếu rules → release VSIX (1.48.0 + 1.52.0) chứa dev/debug artifacts: `pega-network-dump.txt` (+design/dom/js) chứa internal URL `https://zdk8budo.pegaacademy.net/prweb/PRServlet` + Chrome/browser-inspector logs; `coverage/coverage-summary.json`; `PUBLISH.md`; `screenshots/01-04*.png`; `svelte/store.js(.map)`; stale `out/**/*.js.map` (pattern `*.map` chỉ match root — không match `out/**`) + ~1.4k file out/ thừa; `resources/.analysis/{project-structure.md, kb-payloads.json, index-metadata.json}` (không thuộc MAPPINGS của copy-resources.js — leftover stale). Info-disclosure nội bộ + phình artifact (2018 files/12.43 MB) + mở rộng surface audit. **Không phải code vulnerability.** | Bổ sung rules: `out/**/*.map`, `pega-*.txt`, `coverage/**`, `screenshots/**`, `svelte/**`, `docs/**`, `PUBLISH.md`, `resources/.analysis/code-intelligence/{kb-payloads.json,index-metadata.json,project-structure.md}` (hoặc whitelist `resources/.analysis/code-intelligence/index-config.json` + `scripts/**` duy nhất). Sau đó: xoá stale `extension/resources/.analysis` files không thuộc MAPPINGS, rebuild, verify bằng `tar -tf` + smoke test. Thêm CI check "no dev artifacts in VSIX" (grep listing). | DevOps (P2 — trước release tag) |
| SD-02 | 🟡 Medium | Supply chain — lock drift + audit blind | `extension/package-lock.json` (412 KB, 867 pkgs) **không chứa `pi-web-access`** (direct dep của extension) → CI job `npm audit --omit=dev --audit-level=high` chạy trong `extension/` audit trên lock STALE = **không thấy** HIGH nested `@modelcontextprotocol/sdk 1.27.1` (SA-07, có thật trong root lock — workspaces — 1173 pkgs). CI install bằng `npm install --force` (float, header workflow tự thừa nhận drift) → VSIX build tại thời điểm nào chứa version resolve tại thời điểm đó → **không reproducible**, checksum artifact không neo được về lock. | (1) Re-sync `extension/package-lock.json` (ticket lock re-sync đã được SM schedule từ Phase 4.5 — promote priority); (2) chuyển CI sang `npm ci` khi lock sync; (3) chạy `npm audit` trên ROOT workspace lock (đúng tree thật) hoặc thêm triage record cho SA-07 vào `audit-mitigations`/docs; (4) release build PHẢI chạy trên tree `npm ci` sạch. | DevOps + SM (P2) |
| SD-03 | 🔵 Low | CI/CD — artifact integrity & signing | VSIX **unsigned** (không VSIX signature); CI không publish SHA-256 checksum của artifact; `upload-artifact@v4` theo major tag (mutable, SA-06). Với phân phối nội bộ (kiro --install-extension) risk thấp; khi publish marketplace sẽ trở thành gap thật (supply-chain injection vào binary distribution). | Publish `SHA256SUMS` của VSIX trong Release Notes/DPG (đối chiếu trước install); pin actions theo full-length SHA; đánh giá `vsce package` + signed VSIX (Azure Trusted Signing) khi ra marketplace. | DevOps (P3) |
| SD-04 | 🔵 Low | Deployed state consistency — transition window | `kiro --install-extension --force` chỉ thay file trên disk; **extension host đang chạy giữ nguyên code + server cũ (ACAO \*, gate-less) trong bộ nhớ tới khi Reload Window**. Trong cửa sổ transition: (a) posture cũ (SA-01) vẫn live — không phải regression mới nhưng phải được đóng nhanh; (b) nếu mở window MỚI trước khi reload window cũ → server mới bị **EADDRINUSE :9181** (old server giữ port) → wrapper mới down (fail-visible, availability-only, không phải security). | Deployment guidance (§7): install → **Reload Window NGAY** (không mở window mới trước đó), single-window trong lúc upgrade; post-reload CORS smoke (§7 bước 5). Ghi vào DPG + UG FAQ. | DevOps (DPG) |
| SD-05 | 🔵 Low | Rollback security | Rollback = reinstall 1.48.0 (= build UAT đã verify) → **mất CORS gate của 358**, quay về posture SA-01 (ACAO \* + no authN trên loopback). Chấp nhận được interim: bind 127.0.0.1-only + threat model đã chốt (local process = full user rights; vector browser drive-by được containment 356 giảm phần FS) — nhưng phải **time-bound + document**, không được để rollback thành trạng thái dài hạn. | Primary = forward-fix (reinstall combined build). Rollback chỉ khi blocking defect: document thời hạn tối đa + điều kiện quay lại combined; rollback KHÔNG cần dọn data/config (thuần code, TDD §13). Ghi vào DPG/RLN. | SM + DevOps |
| SD-06 | ℹ️ Informational | Monitoring | Security events = deny log 1 dòng/request vào outputChannel (`[WrapperServer] Denied request — reason=… origin=… host=…`, sanitized, reason enum cố định) — đã verify tại HEAD (`WrapperServer.ts:143-146`). Gaps (đều đã được design-accept: OI-3/OI-4): outputChannel in-memory (mất khi đóng window), không persistence, không rate-limit deny-log (log amplification), không aggregation/alerting, không audit trail cho tool-call side-effect. | Backlog: persist deny counters (file/SQLite), throttle theo reason (gộp OI-3), review cadence deny-log trong Phase 6/7 checklist. Không block. | SM (backlog, gộp OI-1 ticket) |
| SD-07 | ℹ️ Informational | Build chain — gen-checksums semantics | `gen-checksums.js` hash **git HEAD content** (chống drift local) — đúng trong CI (clean checkout) và đúng cho build UAT (code đã commit). Edge: build local khi working tree dirty → manifest ≠ shipped resources cho phần chưa commit. Build chain **không introject secrets** (copy-resources SKIP `mcp.json` ✅; gen-checksums chỉ đọc git; không .env; CI `permissions: contents: read`, 0 secrets ✅). | Policy: release artifacts chỉ build từ CI hoặc working tree clean (`git status` check trong prepublish hoặc DPG checklist). | DevOps (P3) |
| SD-08 | ℹ️ Informational | CI/CD hygiene | Carry-over từ SA-06 (chưa fix): `actions/checkout@v7`, `setup-node@v7`, `upload-artifact@v4` = mutable major tags; `pip install semgrep` unpinned; job semgrep vẫn `continue-on-error` (informational — policy đã document, grep gate là blocking ✅). Husky pre-commit 5 gates (lint-staged, secrets, line-count, N-8, CORS) ✅ đúng yêu cầu. | Pin SHA + pin semgrep version (SA-06 follow-up P3); promote semgrep sang required sau 1 green run post-fix như policy đã ghi. | DevOps (P3) |
| SD-09 | ℹ️ Informational | SA-07 re-assessment (deploy lens) | `pi-web-access 0.33.0` → nested `@modelcontextprotocol/sdk 1.27.1` (HIGH, root lock confirmed `node_modules/pi-web-access/node_modules/@modelcontextprotocol/sdk => 1.27.1`; direct dep 1.29-1.32.x clean). Deploy-lens: (a) client-side usage trong bundled extension, không expose network surface mới; (b) surface HTTP duy nhất (:9181) giờ CÓ gate 358; (c) pre-existing — không thuộc diff của cả 2 ticket; (d) lock stale khiến audit gate blind = SD-02 (đã tính riêng). → **ACCEPT deploy, không block.** | Follow-up ticket: bump `pi-web-access` khi upstream phát hành SDK fixed; triage record won't-fix-có-căn cứ; GATE cho **public release**: phải fix (hoặc override có phê duyệt) trước khi publish marketplace. | SM (tracking) |

---

## 3. Checklist Deployment Security — 8/8 mục

### 1) Deployment procedure — build chain & VSIX integrity — ⚠️ PASS WITH FINDINGS (SD-01)

| Kiểm tra | Kết quả | Evidence |
|----------|---------|----------|
| Build chain introject secrets? | ✅ KHÔNG | `vscode:prepublish` = esbuild-production → copy-resources → gen-checksums. `copy-resources.js` whitelist MAPPINGS + `SKIP_FILES = ["mcp.json", "mcp.json,bk"]` (chặn file có thể chứa token) + `SKIP_DIRS` node_modules/out/dist/.git. `gen-checksums.js` chỉ đọc git HEAD. Không .env, không secret trong scripts. |
| gen-checksums integrity? | ✅ ĐÚNG THIẾT KẾ (SD-07 edge) | SHA-256 manifest của resources injected, build từ git HEAD → chống drift local; manifest `resources/.sdlc-checksums.json` nằm trong VSIX (đã xác nhận trong listing). CI clean-checkout → nhất quán. |
| VSIX chứa đúng artifacts? | ⚠️ SD-01 | ✅ Không node_modules, không src/, không tests, không package-lock, không .vsix lồng (verify tar listing 1.48.0 + 1.52.0). `--no-dependencies` + bundle esbuild đúng pattern. ❌ Dev artifacts + stale maps + internal dumps vẫn ship (chi tiết SD-01). |
| Bundle production mode? | ✅ | `esbuild.js --production`: minify + treeShaking + metafile; `sourcemap: !production` → bundle mới KHÔNG sinh map (maps trong package là stale từ out/ cũ). |

### 2) Supply chain — ⚠️ PASS WITH FINDINGS (SD-02, SD-09)

- npm audit HIGH pre-existing (SA-07): tồn tại thật trong root lock; **extension lock stale không thấy nó** → audit gate blind (SD-02). Risk khi deploy: LOW (client-side, loopback-only, no new network surface, pre-existing) → **không block** (SD-09).
- Lock file pinned? ❌ Không hiệu lực: CI dùng `npm install --force` float; lock 2 ticket đều không đụng deps (đúng claim TDD §1.3 của cả 356 lẫn 358 — verified qua assessment notes), nhưng **cây dependency thật của bản build không được neo** bởi lock sync.
- Typosquatting: không có signal mới (deps không đổi trong cả 2 ticket; danh sách deps hiện tại gồm các package đã biết từ các ticket trước).

### 3) CI/CD pipeline security — ✅ PASS (cộng carry-over SA-06 → SD-03/SD-08)

| Kiểm tra | Kết quả |
|----------|---------|
| Secrets trong workflows | ✅ 0 secret; `permissions: contents: read` least-privilege (cả 2 workflow); concurrency group + cancel-in-progress ✅; CI packaging chỉ là smoke (`continue-on-error`), KHÔNG publish — không cần VSCE_PAT. |
| Gates đúng required? | ✅ N-8 grep gate (356) + CORS grep gate SCAN-01/02 (358) = REQUIRED blocking; coverage perFile ≥95% (PathResolver + OriginGate) = blocking qua vitest thresholds; semgrep = informational **theo policy đã document** (promote sau 1 green run). Husky pre-commit chặn 5 gates tại nguồn ✅. |
| Artifact signing | ⚠️ Chưa có → SD-03 (Low, chấp nhận nội bộ). |

### 4) Runtime deploy surface — ✅ PASS

- Bind: `srv.listen(requestedPort, "127.0.0.1")` — `WrapperServer.ts:110` tại HEAD; invariant assert qua T8 + `boundAddress` (AC-7). Không đổi ở combined build.
- CORS gate 358 trong combined build: **verify trực tiếp trong artifact** — 4 gate markers trong `out/extension.js` của 1.52.0.vsix; **0 pattern ACAO \*** (vs 1 pattern trong 1.48.0). Wiring theo SA4E-358 assessment: gate-first trước mọi route + trước body-read; deny 403 `{"error":"Forbidden"}` không leak; SSE gated; `Vary: Origin`; stdio in-process không qua HTTP → native client không bị gate chặn.
- Path containment 356: `PATH_NO_WORKSPACE` + PATH_REJECTED envelope có mặt ở cả 2 bundle; pentest 92 attempts (356) + 53 attempts (358) = 0 bypass trên boundary chính; residual design-accepted (SA-03/04, PT-01/02, SA358-R1/R2/R3).
- Combined threat posture: containment (FS) + gate (HTTP surface) **bổ sung lẫn nhau** — drive-by browser mất khả năng đọc response (gate) và mất khả năng ghi ngoài workspace (containment); kênh còn lại (tool-abuse in-workspace) hẹp và trong threat model.

### 5) Rollback security — ⚠️ ACCEPTABLE INTERIM (SD-05)

Rollback plan TDD §13 (git revert) đúng cho SOURCE; rollback DEPLOYED = reinstall 1.48.0 → mất CORS gate. Đánh giá: chấp nhận được vì (a) 1.48.0 là build đã UAT + pentest 356; (b) posture mất = về đúng trạng thái đã được assess Risk Low-pre-existing (SA-01), không worse; (c) bind loopback-only. Điều kiện: time-bound + forward-fix là primary (chi tiết SD-05). Tài liệu rollback phải nằm trong DPG (Phase 7).

### 6) Monitoring — ✅ CÓ BASELINE, gaps đã accept (SD-06)

Deny log hoạt động (1 dòng/deny, sanitized, reason enum); outputChannel audit lines cho PathResolver error. Gaps: persistence/rate-limit/alerting — đã được design-accept (OI-3/OI-4) từ 358 → không phải finding mới; đưa vào backlog OI-1.

### 7) Deployed state consistency — ⚠️ QUẢN LÝ ĐƯỢC (SD-04)

Kiro đang chạy 1.48.0 (356-only, gate-less) — verify khớp: bundle 1.48.0 = PATH_NO_WORKSPACE ✅ + ACAO \* ✅ + 0 gate markers. Combined deploy plan (install --force + reload) an toàn nếu tuân §7: rủi ro duy nhất là cửa sổ transition (posture cũ live tới reload; EADDRINUSE nếu mở window mới sớm). Không có security regression khi transition — chỉ kéo dài trạng thái đã biết.

### 8) SA-07 re-assessment — ✅ ACCEPT WITH FOLLOW-UP (SD-09)

Không block deploy nội bộ. Đầy đủ phân tích ở SD-09. Gate cho public release.

---

## 4. Combined-Build Deployment Guidance (Phase 7)

### Bước 0 — Chốt artifact nguồn
- Deploy **PHẢI** dùng combined build (chứa 356 + 358). Candidate hiện có: `extension/sdlc-agents-4-enterprise-1.52.0.vsix` (đã verify markers — xem §3.4). **KHÔNG deploy lại bất kỳ build 1.48.x/1.49/1.50/1.51 nào làm bản mới** — đều thiếu gate.
- Nếu rebuild sau khi thêm `.vscodeignore` (SD-01): bump version, rebuild bằng `npm run package:prod` trên **working tree clean**, chạy lại verify markers (bước 1).

### Bước 1 — Verify artifact TRƯỚC khi install (bắt buộc — C1)

```powershell
$vsix = "extension/sdlc-agents-4-enterprise-1.52.0.vsix"   # hoặc artifact cuối
$b = tar -xOf $vsix extension/out/extension.js -Raw         # hoặc: tar -xf vào temp rồi Get-Content -Raw

# (a) 356: containment phải có
$b -match "PATH_NO_WORKSPACE"                               # kỳ vọng True

# (b) 358: gate phải có
$b -match "evaluateOriginGate|host-mismatch|origin-not-allowed"   # kỳ vọng True

# (c) 358: wildcard ACAO phải BIẾN MẤT
$b -match '"Access-Control-Allow-Origin"\s*,\s*"\*"'              # kỳ vọng False

# (d) SD-01: listing không còn dev artifacts
tar -tf $vsix | Select-String -Pattern "pega-.*dump|coverage/|PUBLISH\.md|\.map$"   # kỳ vọng rỗng sau fix
```

### Bước 2 — Install
```powershell
kiro --install-extension extension/sdlc-agents-4-enterprise-1.52.0.vsix --force
```
Ghi nhận SHA-256 của VSIX vào RUN-LOG/DPG trước khi install (SD-03 mitigation thủ công).

### Bước 3 — Reload Window NGAY (bắt buộc — C2)
- `Ctrl+Shift+P → Developer: Reload Window` (hoặc restart Kiro) **ngay sau install**. Không mở window/worktree MỚI trước khi window cũ đã reload (EADDRINUSE :9181 → wrapper mới không bind được — lỗi availability, nhìn thấy ngay qua "Reconnect" đỏ).
- Trong thời gian chưa reload: posture cũ (ACAO \*) vẫn live — giữ cửa sổ transition < 5 phút, không duyệt web lạ trong lúc đó (compensating control thủ công).

### Bước 4 — Post-deploy security smoke (bắt buộc — C2, sau reload)

```powershell
# (1) Cross-origin phải bị 403 + KHÔNG có header access-control-*
curl.exe -i -H "Origin: https://evil.example" http://127.0.0.1:9181/health
#    kỳ vọng: HTTP/1.1 403 · body {"error":"Forbidden"} · KHÔNG access-control-allow-* header

# (2) DNS-rebinding (Host lạ, no-Origin) phải bị 403
curl.exe -i -H "Host: evil.example" http://127.0.0.1:9181/health
#    kỳ vọng: 403 + deny log reason=host-mismatch

# (3) Native/no-Origin vẫn hoạt động + KHÔNG CORS header
curl.exe -i http://127.0.0.1:9181/health
#    kỳ vọng: 200 + không access-control-* header

# (4) Containment 356 còn live: qua MCP client chạy
#     stream_write_file { file_path: "documents/smoke.md", content: "x" }  → thành công (relative OK)
#     stream_write_file { file_path: "../outside.md", content: "x" }        → lỗi PATH_NO_WORKSPACE
```

### Bước 5 — Deny log check (monitoring baseline)
OutputChannel của extension sau 2 request (1)/(2) phải có đúng 2 dòng:
`[WrapperServer] Denied request — reason=origin-not-allowed …` và `… reason=host-mismatch …`, không CR/LF lạ, không echo raw header.

### Bước 6 — Ghi nhận deployment
RUN-LOG entry + DPG: version, SHA-256 VSIX, kết quả 4 smoke checks, thời điểm reload. Nếu bất kỳ check nào FAIL → **STOP, rollback theo §5, raise ticket** (không workaround — no-workaround-rule).

---

## 5. Rollback Security Plan

| Kịch bản | Hành động | Security posture sau rollback | Điều kiện |
|----------|-----------|------------------------------|-----------|
| Combined build lỗi chức năng blocking | Reinstall 1.48.0 `--force` + Reload Window | **Mất CORS gate** (SA-01 reopen: ACAO \* + no authN trên :9181); GIỮ nguyên containment 356 | Interim **time-bound** (tối đa đến khi forward-fix); document trong DPG; không mở rộng dùng 1.48.x cho máy mới |
| Cần rollback SOURCE (TDD §13) | `git revert` C1–C9 (356) / commit 358 riêng | Về đúng commit đã test; không data/config cần dọn (thuần code) | Revert 358 trước 356 nếu cả hai (358 đụng WrapperServer mà 356 cũng đụng envelope — second-order chỉ là thứ tự build lại) |
| Server không bind được sau upgrade (EADDRINUSE) | KHÔNG rollback — Reload Window cũ (SD-04) | Không đổi | Fail-visible, xử lý bằng thao tác, không phải code |

**Acceptance của posture sau rollback:** bind 127.0.0.1-only + threat model local-process = full user rights + containment 356 vẫn đóng vector FS + kênh Atlassian-readback đã được assess Medium-pre-existing (SA-01) → rủi ro interim chấp nhận được với điều kiện time-bound. **Forward-fix (reinstall combined) luôn là primary.**

---

## 6. Monitoring & Alerting

| Phần tử | Trạng thái hiện tại | Gap | Hành động |
|---------|--------------------|-----|-----------|
| Deny log :9181 | ✅ 1 dòng/deny vào outputChannel, sanitized, reason enum (verify HEAD) | In-memory, mất khi đóng window; không rate-limit (SEC-358-02 accepted); không alert | Backlog OI-1/OI-3; review deny-log thủ công trong checklist deploy (Bước 5) |
| PathResolver errors | ✅ console.warn + outputChannel envelope, sanitized (SEC-05) | Không aggregate | Không bắt buộc |
| Tool-call audit trail | ❌ Không có audit trace cho side-effect calls (ghi file, Jira attach) | Đã nằm ngoài scope 2 ticket | Backlog P3 (khi làm OI-1 có thể ghép request-id) |
| npm audit | ⚠️ Blocking job nhưng blind trên stale lock (SD-02) | Kết quả không phản ánh tree thật | Fix theo SD-02 |

---

## 7. Remediation Priority

| # | Finding | Effort | Impact | Deadline đề xuất |
|---|---------|--------|--------|------------------|
| 1 | C1 — Verify markers trong artifact cuối (SD-none, thủ tục) | Low (5 phút) | Chặn deploy sai build | Trước install (Phase 7) |
| 2 | C2 — Reload + post-deploy smoke (SD-04) | Low (10 phút) | Đóng transition window, chứng minh gate live | Trong deployment |
| 3 | SD-01 — .vscodeignore whitelist + dọn resources stale | Low | VSIX sạch, không internal dumps/maps | **Trước release tag** |
| 4 | SD-02 — Lock re-sync + npm ci + audit trên root lock | Medium | Reproducible build, audit gate nhìn thấy SA-07 | P2 (lock re-sync ticket đã schedule) |
| 5 | C3/C4 — Rollback doc + follow-up tickets (OI-1, SA-07 triage, SD-03) | Low | Posture được giữ qua rollback; gate public release | Cùng Phase 7 |

---

## 8. Conditions & Go/No-Go — Phase 7 Release

**Verdict: ✅ APPROVED WITH CONDITIONS — GO cho Phase 7 (deployment nội bộ / UAT 358 / release nội bộ).**

| # | Điều kiện | Loại |
|---|-----------|------|
| C1 | Artifact cuối được verify markers (PATH_NO_WORKSPACE + OriginGate) và **0 ACAO \*** trước install — lệnh ở §4 Bước 1 | Bắt buộc, tại deploy |
| C2 | Reload Window ngay sau install --force + chạy 4 post-deploy smoke checks (§4 Bước 3-5); FAIL bất kỳ → STOP + rollback + ticket | Bắt buộc, tại deploy |
| C3 | DPG/RLN ghi rollback plan với chấp nhận "mất CORS gate khi rollback về 1.48.x" — time-bound, forward-fix là primary | Bắt buộc, tại deploy |
| C4 | SM tạo/confirm follow-up tickets: (1) SD-01 .vscodeignore + resources cleanup — **trước release tag**; (2) SD-02 lock re-sync + npm ci + audit trên root lock; (3) OI-1 shared-secret (SHOULD P3 — chưa thấy ticket); (4) SD-09 SA-07 bump pi-web-access + triage record | Bắt buộc, trước khi close ticket |

**Block cho PUBLIC release (marketplace) riêng ngoài Phase 7 nội bộ:** SD-01, SD-02, SD-09 (SA-07 fix/override), SD-03 (signing/checksums) phải đóng trước khi publish rộng — nhất quán với điều kiện "SA-01 follow-up trước release public" của Phase 5.7.

---

## 9. Điểm làm ĐÚNG (ghi nhận tích cực)

1. **Combined build verify được bằng artifact forensics** — 356 và 358 cùng tồn tại trong 1.52.0 bundle, 0 pattern ACAO \* còn sót, không xung đột wiring (routeToolCall envelope byte-identical theo diff 7bb9222).
2. Build chain sạch về secrets: copy-resources chặn mcp.json, gen-checksums git-only, CI `contents: read` + 0 secrets + concurrency.
3. Đầu tư gates đúng chỗ: N-8 + CORS grep gates blocking, coverage perFile 95% cho cả 2 module security-critical, pre-commit 5 layers, semgrep informational có policy promote rõ ràng.
4. Quy trình: pentest 92+53 attempts với harness rerunnable, UAT evidence gắn markers cụ thể (RUN-LOG #57-59), STATUS.json cập nhật phase đúng.
5. untrustedWorkspaces restricted-configurations trong package.json chặn config nhạy cảm trong workspace không tin cậy; `allowInsecureRemote` default false với warning rõ ràng.

---

## 10. Scope Limitations

- **Static + artifact forensics only** — không dynamic test trên Kiro host thật trong session này (post-deploy smoke §4 là script cho DEV/DevOps chạy), không network pentest, không review AuthManager OAuth callback chi tiết (out of scope, đã assess skim từ 358 design review).
- Verify combined build bằng marker-grep trên `out/extension.js` — không chứng minh hành vi runtime đầy đủ (đã được 358 assessment + 2808 tests + live harness cover độc lập).
- Không review DPG.md/RLN.md (Phase 7 chưa viết — report này là input cho DevOps viết DPG; rollback + transition guidance ở đây cần được sao chép vào DPG).
- CVE ID của HIGH MCP SDK không re-verify gegen GHSA/NVD trong session (không network audit tool); đánh giá dựa trên lockfile versions + npm audit results đã có từ Phase 5.7.
- Line references tại HEAD main (2026-10-14); drift nếu merge mới.

---

## Appendix

### A. Phương pháp
- Artifact forensics: `tar -tf/-xOf` trên 1.48.0 + 1.52.0 VSIX — marker-grep `PATH_NO_WORKSPACE`, `evaluateOriginGate`/`host-mismatch`/`origin-not-allowed`, `"Access-Control-Allow-Origin","*"`; listing classify theo top-level segment (2018 files 1.48.0).
- Build chain review: `esbuild.js`, `copy-resources.js`, `gen-checksums.js`, `.vscodeignore`, `package.json` scripts.
- CI/CD review: `ci-sa4e-356.yml`, `ci-sa4e-358.yml`, `.husky/pre-commit`.
- Supply chain: parse root + extension `package-lock.json` (pi-web-access, @modelcontextprotocol/sdk, undici versions), đối chiếu CI install strategy header.
- Code verify tại HEAD: `WrapperServer.ts` (bind/gate/deny-log), `OriginGate.ts` allowlist.
- Đối chiếu: TDD v1.2 §13 (rollback), SECURITY-ASSESSMENT 356 (SA-01..07), PENTEST-REPORT 356 (SECURE-WITH-NOTES), SECURITY-ASSESSMENT 358 (merge conditions 6/7), RUN-LOG #57-59, STATUS.json (356 + 358).

### B. Glossary
- **ACAO**: Access-Control-Allow-Origin · **Combined build**: VSIX chứa cả fix 356 (containment) + 358 (CORS gate) · **Transition window**: khoảng thời gian install --force xong nhưng extension host chưa Reload Window — code cũ vẫn chạy trong bộ nhớ · **EADDRINUSE**: lỗi bind khi port đã bị process cũ giữ · **Gate marker**: chuỗi chỉ có trong code 358 dùng để verify bundle.

### C. Sign-off

| Mục | Giá trị |
|-----|---------|
| Verdict | **APPROVED WITH CONDITIONS** |
| 0 Critical / 0 High / 2 Medium / 3 Low / 4 Informational | SD-01..SD-09 |
| Go/No-Go Phase 7 | **GO** với C1–C4 |
| Rerun verify | §4 Bước 1 (marker-grep) + §4 Bước 4 (smoke) |

*— Hết Security Deployment Review SA4E-356 (Phase 6.7b) · Verdict: APPROVED WITH CONDITIONS · GO cho Phase 7 với 4 điều kiện — SM ingest KB + log RUN-LOG —*
