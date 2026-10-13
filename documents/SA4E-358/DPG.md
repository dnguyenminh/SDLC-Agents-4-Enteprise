# Deployment Guide (DPG)

## SDLC-Agents-4-Enterprise — SA4E-358: [Follow-up SA4E-356/SA-01] CORS * + no authN trên loopback :9181 — Origin/Host validation

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-358 |
| Title | [Follow-up SA4E-356/SA-01] CORS * + no authN trên loopback :9181 — Origin/Host validation |
| Author | DevOps Agent |
| Version | 1.0 |
| Date | 2026-10-14 |
| Status | Draft — chờ SM review (UAT-evidence complete: combined build 1.52.0 đã deploy + Reload Window + **N-QA2 15/15 PASS dev-host :9183**; chờ user confirm) |
| Related TDD | documents/SA4E-358/TDD.md (v1.1 — §13 rollback, §3.6 integration, §8.5 verification gates) |
| Related Docs | STP.md v1.2 (§2.5 Exit/Merge conditions) · SECURITY-REVIEW.md v1.0 (PASS-with-fixes — SEC-358-01 Option A) · SECURITY-ASSESSMENT.md (APPROVED WITH FINDINGS — 7/7 merge conditions) · TEST-REPORT.md (CONDITIONAL PASS — 62/64, 0 FAIL) · PENTEST-REPORT.md (SECURE-WITH-NOTES — 53 attempts, 0 bypass) · UG.md v1.0 (§8 Behavior Changes) · **documents/SA4E-356/DPG.md** (format + deployment surface chung) · **documents/SA4E-356/SECURITY-DEPLOY-REVIEW.md** (C1–C4 + combined-build verify) · evidence/n-qa2-devhost-9183.log (N-QA2 live) |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-14 | DevOps Agent | Initiate DPG sau khi UAT-evidence complete (combined build 1.52.0 — 2028 files — install + Reload Window + N-QA2 15/15 PASS trên dev-host :9183). Tài liệu tập trung **DELTA CORS gate** so với DPG SA4E-356 (cùng deployment surface: VSIX per-user + Kiro + wrapper); rollback theo TDD §13 (revert commit `7bb9222`) + điều kiện C3 của Security Deploy Review 356 (mất gate khi rollback = time-bound) |

---

## Sign-Off

| Name | Role | Signature and date |
|------|------|--------------------|
| | Dev Lead | ☐ Approved for deployment |
| | QA Lead | ☐ Testing completed (Phase 6 CONDITIONAL PASS; N-QA2 dev-host 15/15 PASS — chờ user confirm UAT) |
| | Ops Lead | ☐ Infrastructure ready |

---

## 1. Overview

### 1.1 Feature Summary

SA4E-358 hardening bảo mật: thêm **CORS Origin/Host validation gate** vào điểm vào duy nhất `handleRequest` của WrapperServer (extension/src/services/WrapperServer.ts), qua module mới **`OriginGate.ts`** (pure function, 7 phases, fail-closed) — đóng finding **SA-01** của SA4E-356: `Access-Control-Allow-Origin: *` vô điều kiện + preflight OPTIONS 204 vô điều kiện + SSE GET mở trên loopback, đã live-confirmed ×3 (P6-15/16/17, PENTEST-REPORT SA4E-356).

- **Gate-first:** `evaluateOriginGate` là statement đầu tiên của `handleRequest` — chạy TRƯỚC mọi route, TRƯỚC body-read; deny = **403 uniform** + `{"error":"Forbidden"}` + **zero CORS headers** + 1 dòng deny log sanitized vào outputChannel (reason enum: `malformed-origin` / `origin-not-allowed` / `host-mismatch`).
- **Allowlist echo-only:** ACAO chỉ được set khi Origin ∈ allowlist (`vscode-webview://*`, `http://localhost:*`, `http://127.0.0.1:*) — echo EXACT giá trị RAW + `Vary: Origin`; **không còn `*` ở bất kỳ đâu** (AC-8).
- **v1.1 — SEC-358-01 Option A (I-8/AD-10):** Phase 1.5 Host check áp cho **MỌI request có Host header** — kể cả no-Origin — đóng DNS rebinding same-origin (browser không gắn Origin cho same-origin GET/EventSource sau rebind); carve-out duy nhất: no-Origin + không-Host (HTTP/1.0 legacy, H-9).
- **Zero regression (FR-10):** native client no-Origin pass-through hoàn toàn (không nhận CORS header nào — không parse CORS → zero functional impact); stdio (SDLC agents) in-process không qua HTTP → ngoài bề mặt gate; hành vi MCP tools/envelope của SA4E-356 giữ nguyên byte-semantic.
- Commit: **`7bb9222`** (OriginGate + WrapperServer wiring + tests) → `65feabf` (UG + security assessment) → `3f4af4e` (test report + pentest). KHÔNG đổi dependency, KHÔNG schema, KHÔNG config/flag/env mới.

**Trạng thái:** UAT-evidence **complete** — combined build **1.52.0** (2028 files, chứa cả fix 356 + 358) đã install + Reload Window + **N-QA2 15/15 PASS** trên dev-host :9183 (evidence/n-qa2-devhost-9183.log — VERDICT: 15/15 PASS, 0 FAIL). Chờ user confirm để đóng UAT gate.

### 1.2 Deployment Scope

| Item | Type | Description |
|------|------|-------------|
| Extension VSIX (sdlc-agents-4-enterprise) | Modified | `OriginGate.ts` MỚI (~179–198 dòng) + `WrapperServer.ts` rewrite `handleRequest` (gate-first, xóa `setHeader("ACAO","*")` cũ, echo block + `Vary: Origin`) + test infra (38 unit + T1..T14 + harness). Build từ main là **combined** — chứa cả fix SA4E-356 (PathResolver) lẫn SA4E-358 (gate) |
| Backend child server | N/A | Không đổi — gate KHÔNG áp cho backend orchestration port (chỉ WrapperServer) |
| Database | N/A | Không schema/migration — gate là pure header-check, không persist |
| Configuration | N/A | KHÔNG có config/feature flag/env mới (allowlist là constant trong code — BR-09). Port wrapper là config **có sẵn** `sdlcAgents.mcpServerPort` — KHÔNG đổi, xem Section 7 |
| Infrastructure | N/A | Topology không đổi — bind `127.0.0.1:<port>` giữ nguyên (AC-7 verify-only, T8) |

### 1.3 Target Environments

Mô hình deploy là **per-user desktop extension** — không có server DEV/SIT/UAT/PROD riêng biệt:

| Environment | Đối tượng | Deploy Order | Approval Required | Trạng thái |
|-------------|-----------|--------------|-------------------|------------|
| DEV | Workstation dev (developer tự build/run) | 1 | No | Đã deploy suốt pipeline |
| UAT | Workstation user — combined build 1.52.0 qua Kiro CLI + Reload Window | 2 | User confirm | ⚠️ **Evidence complete — chờ user confirm** (N-QA2 15/15 PASS dev-host :9183) |
| PROD | = workstation user (bản release sau merge/tag từ main) | 3 | SM + User | Pending — theo quy trình Section 4 |

### 1.4 Delta Scope vs DPG SA4E-356 (tài liệu này KHÔNG lặp phần chung)

Deployment surface giống hệt SA4E-356 (VSIX per-user → Kiro CLI `--install-extension --force` → Reload Window từng cửa sổ). Các phần **tái sử dụng nguyên văn** từ DPG SA4E-356 — KHÔNG viết lại:

| Phần | Tham chiếu | Ghi chú |
|------|-----------|---------|
| Build chain (`npm run package:prod` → esbuild-production → copy-resources → gen-checksums) | 356 DPG §5.2 Step 1–2 | Giống hệt |
| Install Kiro CLI + Reload Window từng cửa sổ + transition window (SD-04) | 356 DPG §5.2 Step 4–6 | Giống hệt — cộng lưu ý activation riêng của 358 (§4.3) |
| R6 — deploy CHỈ từ main (integration point), KHÔNG build từ worktree feature | 356 DPG §3 #9, §11.4 | Giống hệt |
| Prerequisites infra/software/access (Node, vsce, esbuild, pwsh, Kiro CLI, write access user-level) | 356 DPG §2 | Giống hệt |
| Checksums `gen-checksums` + no-secret verify | 356 DPG §3 #7–8, §5.2 Step 3b–3c | Giống hệt |
| Worktree/artifact cleanup sau deploy/rollback | 356 DPG §8.4 | Giống hệt (KHÔNG xoá VSIX cũ — inventory rollback) |

Các phần **DELTA của 358** (nội dung chính của DPG này): marker-verify VSIX theo markers OriginGate (§3, §10.1), lưu ý activation sau Reload Window (§4.3), post-deploy verification CORS-specific + LH harness (§5), rollback với ràng buộc combined-build + mất-gate-time-bound (§6), port config-driven (§7), monitoring deny-log (§8), residuals riêng (§9).

### 1.5 Deployment Architecture (delta so với 356)

```
┌─ Kiro Desktop (per-user) ─────────────────────────────────────────────┐
│  Extension Host process                                               │
│   └─ Extension dnguyenminh.sdlc-agents-4-enterprise (VSIX <ver>)      │
│       ├─ MCP WrapperServer — bind 127.0.0.1:<sdlcAgents.mcpServerPort>│
│       │    · SA4E-358 (MỚI): OriginGate 7 phases — gate TRƯỚC mọi     │
│       │      route + trước body-read; deny 403 + {"error":"Forbidden"}│
│       │      + zero CORS; deny log 1 dòng → outputChannel (sanitized)  │
│       │    · stdio (SDLC agents) in-process — KHÔNG qua HTTP → ngoài  │
│       │      bề mặt gate (A-2, PT-46)                                 │
│       ├─ PathResolver (SA4E-356) — KHÔNG đổi; containment giữ nguyên  │
│       ├─ Native MCP HTTP client (no-Origin) — pass-through, zero CORS │
│       │    (AC-4)                                                     │
│       └─ Backend child server — port resolve runtime từ               │
│            .code-intel/settings.json (mcpUrl) — KHÔNG liên quan port  │
│            wrapper (hai port khác nhau — xem Section 7)               │
└───────────────────────────────────────────────────────────────────────┘
```

**Điểm then chốt (delta):**

1. **Gate-first (I-1)** — mọi request HTTP (POST /mcp, OPTIONS preflight, GET SSE, /health, 404 fallback) đi qua 1 cửa `handleRequest` → gate; caller bị deny nhận 403 uniform kể cả path không tồn tại (không leak route map — AD-3).
2. **Port động an toàn (G-7/AD-7)** — gate so Host với `listenPort` THỰC TẾ từ `srv.address().port`, không hardcode → đổi `sdlcAgents.mcpServerPort` không vỡ gate; port null → fail-closed deny.
3. **Activation & wrapper start** — extension chỉ activate khi mở SDLC tree view (`onView:sdlcAgentsTree`); wrapper start qua `startWrapper()` khi backend health OK — ảnh hưởng trực tiếp bước verify sau reload (§4.3).
4. **Combined build** — 1 VSIX chứa cả 356 + 358; mọi verify/rollback phải tính cả hai (§6.4).

---

## 2. Prerequisites

### 2.1 Code & Build Prerequisites

| Requirement | Giá trị | Verify bằng |
|-------------|---------|-------------|
| Branch main, HEAD ≥ `65feabf` (code) | Chain bắt buộc: `7bb9222` (CORS gate implement) → `65feabf` (UG + security assessment) → `3f4af4e` (test report + pentest). HEAD hiện tại main: `9c04427` (docs SA4E-355 — không đụng code extension) | `git log --oneline` |
| Build combined ≥ **1.52.0** | VSIX `sdlc-agents-4-enterprise-1.52.0.vsix` (13,057,486 bytes ≈ 12.45 MB, 2028 files, built 2026-10-14 03:43) — chứa CẢ fix 356 + 358. **KHÔNG deploy lại 1.48.x/1.49/1.50/1.51 làm bản mới — đều thiếu gate** (Security Deploy Review 356 §4 Bước 0) | `Get-ChildItem extension\*.vsix` + marker check (§3) |
| Full test suite | **2,808/2,808 PASS** (286 files, 0 FAIL — TEST-REPORT §2.1; gồm 46/46 unit OriginGate, 40/40 integration T1..T14+regression) | `cd extension && npm run test` |
| Coverage gate | `OriginGate.ts` = 100% stmts / 96.42% branch / 100% funcs / 100% lines (≥95% perFile threshold) — TEST-REPORT §2.4 | `npm run test:coverage` |
| Static gates | `tsc --noEmit` 0 errors; SCAN-01 (0 `ACAO: *`, 529 files) + SCAN-02 (gate-first) + semgrep 3 rules 0 findings + gate N-8 của 356 không hồi quy (528 files) | `bash scripts/check-cors-gate-sa4e358.sh --all` + `check-pathresolver-n8.sh --all` |

### 2.2 UAT & Evidence Prerequisites

| Requirement | Trạng thái | Evidence |
|-------------|-----------|----------|
| UAT SA4E-356 PASSED | ✅ **Đã đạt** 2026-10-14 (REG-1/REG-2 trên VSIX 1.48.0) — điều kiện tiên quyết vì combined build thay thế bản đang chạy | 356 DPG §7.3; STATUS.json 356 |
| 7/7 merge conditions (SECURITY-REVIEW v1.0) | ✅ **6/7 code-level PASS + #2 đóng bằng N-QA2** — bảng đầy đủ ở §3.2 | SECURITY-ASSESSMENT §10.2 |
| **N-QA2 — live harness trên dev-host thật** | ✅ **15/15 PASS, 0 FAIL** trên dev-host **:9183** sau khi combined 1.52.0 deploy + Reload Window (LH-09 SKIP theo design) | `evidence/n-qa2-devhost-9183.log` |
| Pentest | ✅ SECURE-WITH-NOTES — 53 attempts adversarial, 0 bypass, 0 Critical/High/Medium | PENTEST-REPORT v1.0 |
| V-4 (cập nhật BRD A-1) | ⚠️ Thuộc BA/SM — làm ngay sau user confirm (không block deploy, block close AC-3) | TEST-REPORT §5 |

### 2.3 Infrastructure / Software / Access / Backup

Giống hệt DPG SA4E-356 §2 (KHÔNG lặp): Kiro Desktop + Kiro CLI; Node.js + vsce + esbuild + pwsh 7; write access user-level; git push quyền main (chỉ khi rollback Option A). **KHÔNG có dependency runtime mới** (TDD §1.3 — commit `7bb9222` không đổi `package.json`/lock).

**Backup — delta so với 356:** inventory VSIX phải có **bản pre-gate cuối = 1.48.0** (UAT build 356 — rollback Option B của 358; KHÔNG phải 1.47.2 — bản đó pre-fix cả hai, xem §6.4). Đã có: `1.48.0` (13,031,429 bytes) + `1.52.0` (13,057,486 bytes) trong `extension/`.

---

## 3. Pre-Deployment Checklist

### 3.1 Checklist vận hành

| # | Item | Responsible | Verify bằng | Status |
|---|------|-------------|-------------|--------|
| 1 | Fix chain trên main ≥ `65feabf`: `7bb9222` → `65feabf` → `3f4af4e` (code + docs + tests) | DevOps | `git log --oneline` | ☐ |
| 2 | Full suite **2,808/2,808 PASS** + coverage OriginGate ≥95% perFile | QA | `npm run test` + `test:coverage` | ☑ |
| 3 | Static gates: tsc 0; SCAN-01/02 PASS; semgrep 0 findings; N-8 (356) không hồi quy | QA/DEV | `check-cors-gate-sa4e358.sh --all` | ☑ |
| 4 | CI green (workflow `ci-sa4e-358.yml` — CORS grep gate REQUIRED blocking; coverage threshold blocking) | DevOps | CI dashboard | ☑ |
| 5 | UAT 356 PASSED (2026-10-14) — combined build thay bản đang chạy | SM/User | STATUS.json 356 | ☑ |
| 6 | **Marker verify trong VSIX cuối (C1 — bắt buộc TRƯỚC install)**: gate markers có mặt + wildcard ACAO biến mất + containment 356 giữ nguyên — script §10.1 | DevOps | marker-grep trên bundle | ☑ (1.52.0: 4 gate markers, 0 ACAO *, PATH_NO_WORKSPACE giữ nguyên — Security Deploy Review 356 §3.4) |
| 7 | Checksums + version khớp (`.sdlc-checksums.json` = version package.json) + 0 secret trong bundle | DevOps | verify artifact sau build | ☑ |
| 8 | R6 — build/install CHỈ từ main | SM/DevOps | worktree-parallel-pipeline §3 R6 | ☐ |
| 9 | VSIX rollback inventory: **1.48.0** (pre-gate, giữ 356) còn trong `extension/` | DevOps | `Get-ChildItem extension\*.vsix` | ☑ |
| 10 | Rollback plan reviewed — đặc biệt ràng buộc combined-build + mất-gate time-bound (§6) | Team | review Section 6 | ☐ |
| 11 | Port config đã xác định (`sdlcAgents.mcpServerPort` — máy hiện tại **9183**, default 9181) cho mọi lệnh verify | DevOps | Section 7 | ☐ |
| 12 | Deployment window: không cần cửa sổ đặc biệt (desktop per-user) — KHÔNG mở window Kiro mới trước khi window cũ Reload Window (EADDRINUSE — SD-04) | SM | — | ☐ |

### 3.2 Trạng thái 7 điều kiện merge (SECURITY-REVIEW v1.0 → SECURITY-ASSESSMENT §10.2 → sau N-QA2)

| # | Điều kiện | Trạng thái | Bằng chứng |
|---|-----------|------------|------------|
| 1 | T1..T14 + unit + full regression 100% | ✅ PASS | 2808/2808 · 46/46 unit · 40/40 integration · tsc 0 |
| 2 | V-1..V-4 evidence đầy đủ | ✅ **PASS (sau N-QA2)** | V-1a static ✅ · V-1b standalone ✅ + **dev-host ✅ (N-QA2, deny log delta=0 — LH-08)** · V-1c CSV ✅ · V-4 BA/SM pending (không block deploy) |
| 3 | Live harness green | ✅ PASS | Standalone 15/15 + **dev-host 15/15 (:9183)** |
| 4 | SEC-358-01 Option A — H-7/H-8/H-9 | ✅ PASS | UT-32..34 + IT-12.4 + IT-13.1b + LH-13..15 full stack |
| 5 | Bench p99 < 1ms | ✅ PASS | p99 tệ nhất 38.8µs (malformed); e2e delta ≈ 0 |
| 6 | Grep 0 `ACAO: *` + T11 zero-CORS | ✅ PASS | 529 files PASSED + semgrep 0 + T11 15/15 |
| 7 | Verdict security review: 0 finding Medium+ CORS/Origin | ✅ PASS | SECURITY-ASSESSMENT: 0 Crit/High/Med (1 Low pre-existing + 2 Info) |

### 3.3 Điều kiện C1–C4 của Security Deployment Review 356 (áp cho combined deploy)

| # | Điều kiện | Áp dụng trong DPG này |
|---|-----------|----------------------|
| C1 | Verify markers artifact cuối (PATH_NO_WORKSPACE + OriginGate + 0 ACAO *) trước install | §3.1 #6 + script §10.1 |
| C2 | Reload Window NGAY sau install + 4 post-deploy smoke checks; FAIL → STOP + rollback | §4.2 Step 6 + §5.3 |
| C3 | Rollback plan ghi nhận "mất CORS gate khi rollback về 1.48.x" — time-bound, forward-fix primary | §6.3 |
| C4 | Follow-up tickets (SD-01 .vscodeignore trước release tag; SD-02 lock re-sync; OI-1 shared-secret; SA-07 triage) | §9 + SM tracking |

---

## 4. Application Deployment (Step-by-Step Procedure)

### 4.1 Deployment Flow

`git sync main` → `npm run package:prod` (trong `extension/`) → **verify VSIX markers CORS** (gate markers + 0 ACAO `*` + PATH_NO_WORKSPACE) → `kiro --install-extension --force` → **Reload Window BẮT BUỘC từng cửa sổ** (mở SDLC tree view để activate) → verify post-deploy CORS-specific (Section 5).

> Database migration: **N/A** — không có bước DB nào (§1.2); rollback thuần code/binary (Section 6).

### 4.2 Deployment Steps

| Step | Action | Command | Verification |
|------|--------|---------|--------------|
| 0 | Sync main (R6) | `git checkout main && git pull origin main` | HEAD ≥ `65feabf`; log chứa chain §3.1 #1 |
| 1 | (Tuỳ) Cài deps | `cd extension; npm ci` | `node_modules` đầy đủ, không error |
| 2 | Build production VSIX | `cd extension; npm run package:prod` | `sdlc-agents-4-enterprise-<ver>.vsix` (~12.4–12.6 MB). `vscode:prepublish` tự chạy esbuild-production → copy-resources → gen-checksums. Build combined hiện có: **1.52.0** (13,057,486 bytes, 2028 files, 2026-10-14 03:43) |
| 3 | **Verify VSIX — CORS markers (C1, bắt buộc)** | Script §10.1 | (a) `PATH_NO_WORKSPACE` ≥ 1 (356 giữ nguyên) · (b) `evaluateOriginGate`/`host-mismatch`/`origin-not-allowed`/`malformed-origin`/`vscode-webview` ≥ 1 mỗi marker (358 có mặt) · (c) pattern `"Access-Control-Allow-Origin"s*,s*"*"` **= 0** (wildcard biến mất) |
| 3b | Verify checksums + version | `<extract>\extension\resources\.sdlc-checksums.json` | version khớp `extension/package.json` + tên file |
| 3c | Verify không secret | `Select-String` bundle pattern `.env`/`jira.conf`/token | 0 match |
| 4 | Install vào Kiro | `& "C:\Users\ASUS\AppData\Local\Programs\Kiro\bin\kiro.cmd" --install-extension "<abs-path>\sdlc-agents-4-enterprise-<ver>.vsix" --force` | Exit 0 — "Extension was successfully installed" |
| 5 | Confirm version | `kiro.cmd --list-extensions --show-versions` | `dnguyenminh.sdlc-agents-4-enterprise@<ver>` |
| 6 | **Reload Window — BẮT BUỘC, từng cửa sổ** | Kiro: `Ctrl+Shift+P` → `Developer: Reload Window` — ngay sau install, KHÔNG mở window/worktree mới trước đó (EADDRINUSE giữ port — SD-04) | Xem §4.3 — extension activate khi mở SDLC tree view; wrapper listen port config |
| 7 | Post-deploy verification | Section 5 | PASS toàn bộ (15/15 harness + 4 smoke + deny log) |

**Thực tế đã thực hiện (UAT evidence — verified end-to-end):** build combined **1.52.0** (2028 files) → verify markers (4 gate markers, 0 ACAO `*`) → install `--force` → Reload Window → **N-QA2 harness 15/15 PASS** trên dev-host :9183 (`evidence/n-qa2-devhost-9183.log`).

### 4.3 ⚠️ Reload Window & Activation — lưu ý riêng của 358 (delta so với 356)

Sau Reload Window, extension **KHÔNG tự activate ngay** — cần hiểu chuỗi khởi động để không chẩn đoán nhầm "deploy fail":

1. **ActivationEvent:** `extension/package.json` khai báo `"activationEvents": ["onView:sdlcAgentsTree", "onView:sdlcChatPanel"]` → extension host chỉ activate extension khi user **mở SDLC tree view (sidebar)** hoặc SDLC chat panel. Sau reload: mở SDLC tree view trước, rồi mới chạy verify.
2. **Wrapper start khi backend health OK:** trong activation, `RemoteBackendClient.startWrapper()` (remote-backend-client.ts:151-161) đọc config `sdlcAgents.mcpServerPort` → `new WrapperServer(deps)` → `listen(port, "127.0.0.1")`. Nếu backend child chưa health OK, wrapper start bị hoãn — `/health` chưa phản hồi KHÔNG có nghĩa là gate lỗi.
3. **Nếu `/health` không phản hồi sau reload** — kiểm tra theo thứ tự (trước khi nghĩ rollback):
   - Extension chưa activate → mở SDLC tree view (§4.3.1);
   - Extensions panel: extension disabled/error?;
   - Developer Tools console (Help → Toggle Developer Tools): activation error?;
   - `EADDRINUSE :<port>` → **window cũ chưa reload vẫn giữ port** (SD-04) → Reload Window ở window cũ; KHÔNG mở window mới trước khi window cũ reload;
   - `netstat`/`Get-NetTCPConnection`: wrapper đã bind `127.0.0.1:<configured-port>`?
4. **Transition window (C2/SD-04):** giữa `--force` install và Reload Window, extension host đang chạy **giữ code cũ trong bộ nhớ** (ACAO `*` gate-less vẫn live) — giữ cửa sổ transition < 5 phút, Reload Window NGAY, không duyệt web lạ trong lúc đó.

### 4.4 Version Management

- **Combined build duy nhất:** mọi build từ main ≥ 1.52.0 chứa cả fix 356 + 358 (marker-verified — Security Deploy Review 356 §3.4: 1.52.0 có 4 OriginGate markers, 0 pattern ACAO `*`, `PATH_NO_WORKSPACE` giữ nguyên → không regression giữa 2 ticket).
- **KHÔNG deploy lại 1.48.x/1.49/1.50/1.51 làm bản mới** — đều thiếu gate (Security Deploy Review 356 §4 Bước 0). KHÔNG install đồng thời 2 version; `--force` ghi đè (per-user duy nhất).
- Tên VSIX theo `extension/package.json` `version` tại thời điểm build — specific version, không có khái niệm "latest". Nếu cần release riêng, SM bump version trước khi build.
- KHÔNG merge/tag trong session DevOps — SM xử lý git release (merge/tag/README changelog).

---

## 5. Post-Deployment Verification (CORS-Specific)

> ⚠️ Mọi lệnh dưới đây dùng `<p>` = **port configured** (`sdlcAgents.mcpServerPort` — máy hiện tại **9183**; default 9181). KHÔNG hardcode 9181 — xem Section 7.

### 5.1 Health Check

```powershell
curl.exe -i http://127.0.0.1:<p>/health
```

Expected: **HTTP 200** + `{"status":"ok","mode":"wrapper"}` + **KHÔNG có header `access-control-allow-*`** (curl no-Origin → native pass-through, zero CORS — khác pre-fix: response cũ có `ACAO: *`).

### 5.2 Live Harness — N-QA2 (điều kiện merge #2/#3 dev-host leg)

```powershell
npx tsx documents/SA4E-358/testdata/cors-pentest-harness.ts --port <p>
```

Expected: **15/15 PASS** (LH-09 SKIP theo design — baseline P6-15/16/17 đã có) + evidence ghi vào `testdata/pentest-results.csv` (mode DEV-HOST). KHÔNG dùng `--standalone` cho dev-host thật — đó là mode boot in-process chỉ dùng khi chưa deploy (TEST-REPORT §5).

**Trạng thái: ✅ ĐÃ PASS trên dev-host :9183** — sau combined 1.52.0 deploy + reload: LH-01..15 = 15/15 PASS, 0 FAIL, LH-08 native session `flow=[200,202,200,200,200] denyLog delta=0` (evidence/n-qa2-devhost-9183.log).

### 5.3 Smoke Checks — 4 curl + containment (C2)

| # | Check | Command | Expected |
|---|-------|---------|----------|
| 1 | **Evil-origin deny** | `curl.exe -i -H "Origin: https://evil.example" http://127.0.0.1:<p>/health` | **403** + body `{"error":"Forbidden"}` + **KHÔNG header `access-control-*`** |
| 2 | **DNS-rebinding / Host lạ** (no-Origin) | `curl.exe -i -H "Host: evil.example" http://127.0.0.1:<p>/health` | **403** + deny log `reason=host-mismatch` (curl kết nối 127.0.0.1 nhưng Host header forged — gate chặn theo Host header, P1.5) |
| 3 | **Native no-Origin pass** | `curl.exe -i http://127.0.0.1:<p>/health` | **200** + KHÔNG header CORS nào (AC-4) |
| 4 | **Webview echo** | `curl.exe -i -H "Origin: vscode-webview://abc123" -H "Host: 127.0.0.1:<p>" http://127.0.0.1:<p>/mcp -X OPTIONS` | **204** + `access-control-allow-origin: vscode-webview://abc123` (echo EXACT) + `Allow-*` + `Vary: Origin` |
| 5 | **Containment 356 giữ nguyên** (qua MCP client) | `stream_write_file {file_path: "documents/smoke-<ts>.md", content: "x"}` rồi `{file_path: "../outside.md"}` | Relative → thành công vào workspace; `../outside.md` → `PATH_NO_WORKSPACE` (không hồi quy 356); xoá file smoke sau |

### 5.4 Deny Log Check (outputChannel)

Sau smoke #1 và #2, outputChannel của extension (View → Output → chọn channel SDLC) phải có **đúng 2 dòng**:

```
[WrapperServer] Denied request — reason=origin-not-allowed …
[WrapperServer] Denied request — reason=host-mismatch …
```

Không CR/LF lạ, không echo raw header (sanitized — G-3, T9). Nếu KHÔNG thấy dòng nào → outputChannel sai channel hoặc gate chưa live (quay lại §4.3).

### 5.5 Log & Regression Verification

| Log Entry | Expected | Location |
|-----------|----------|----------|
| Extension activation | Không ERROR/FATAL mới sau Reload Window | Developer Tools console |
| Native session (client thật: initialize → tools/list → tools/call → SSE) | **KHÔNG** xuất hiện `reason=origin-not-allowed` cho native client (V-1b — đã PASS ở N-QA2) | outputChannel |
| MCP tools behavior (356) | Handshake, envelope `PathResolverError`, SSE keep-alive 15s — byte-semantic không đổi (FR-10) |Regression 26/26 + smoke #5 |

**FAIL bất kỳ check nào → STOP, KHÔNG workaround (no-workaround-rule): rollback theo Section 6 + raise ticket.** Ghi nhận deployment: version, SHA-256 VSIX, port config dùng, kết quả 5.1–5.4, thời điểm reload (RUN-LOG entry — template §10.2).

---

## 6. Rollback Plan

### 6.1 Rollback Decision Criteria

| Condition | Action |
|-----------|--------|
| Health fail / wrapper không bind sau Reload Window | **KHÔNG rollback ngay** — triage §4.3 trước (activation/EADDRINUSE là lỗi thao tác, xử lý bằng Reload Window cũ — SD-04) |
| Native client bị chặn oan (`reason=origin-not-allowed` cho client thật) | **KHÔNG rollback** — theo BR-10/AF-2: thêm pattern vào allowlist (code change nhỏ + test — TUYỆT ĐỐI KHÔNG nới `*`); rollback chỉ khi block work |
| Gate deny sai nghiêm trọng / blocking defect chức năng | **Rollback ngay — Option B** (binary, ~5 phút), forward-fix là primary |
| Defect logic gate nghiêm trọng cần fix source | **Rollback ngay — Option A** (git revert `7bb9222` theo TDD §13) + hotfix |
| Minor issue có workaround | Báo cáo SM/PO, đợi quyết định (không tự retry deploy không approval) |

### 6.2 Option A — Code Rollback (git revert `7bb9222` → rebuild → reinstall)

TDD §13: change nằm trong **1 commit duy nhất** (`7bb9222` — module OriginGate + WrapperServer delta + tests) → revert = rollback hoàn toàn. KHÔNG có schema/DB/config/data cần dọn; **KHÔNG có feature flag** — flag tắt gate = bypass security, trái fail-closed; rollback = revert commit.

| Step | Action | Command | Verification |
|------|--------|---------|--------------|
| A1 | Revert commit gate | `git checkout main && git revert 7bb9222 --no-edit` | Conflict-free (delta cô lập `handleRequest` + module mới — TDD §13); `npm run test` xanh trở lại (suite pre-gate) |
| A2 | Rebuild | `cd extension; npm run package:prod` | VSIX version mới (bump trước nếu cần phân biệt) |
| A3 | Verify markers | Script §10.1 | (b) gate markers = **0**; (a) `PATH_NO_WORKSPACE` **≥ 1** (356 vẫn còn — bắt buộc) |
| A4 | Reinstall + Reload Window từng cửa sổ | `kiro.cmd --install-extension "<vsix>" --force` | Exit 0; §4.3 |
| A5 | Verify rollback | Health §5.1 = 200; smoke #1 evil-origin → **200 + `ACAO: *`** (= SA-01 **REOPEN**, đúng kỳ vọng pre-fix P6-15/16/17); containment smoke #5 vẫn pass | PASS |

Sau revert, server trở về `ACAO: *` + preflight 204 vô điều kiện — chấp nhận được **trong thời gian ngắn** vì đây là hardening (không phải data-integrity fix); **note SA-01 re-open nếu kéo dài** (TDD §13).

### 6.3 Option B — Binary Rollback (reinstall **1.48.0** — nhanh, khuyến nghị khi cần phục vụ ngay)

`1.48.0` = UAT build của SA4E-356 (REG-1/REG-2 PASS 2026-10-14): **giữ containment 356, KHÔNG có CORS gate 358**.

| Step | Action | Command | Verification |
|------|--------|---------|--------------|
| B1 | Xác nhận VSIX | `Get-ChildItem extension\*.vsix` — `sdlc-agents-4-enterprise-1.48.0.vsix` (13,031,429 bytes, 2026-10-12) | File tồn tại |
| B2 | Reinstall | `& "...\Kiro\bin\kiro.cmd" --install-extension "<abs>\sdlc-agents-4-enterprise-1.48.0.vsix" --force` | Exit 0 |
| B3 | Confirm version | `kiro.cmd --list-extensions --show-versions` | `...@1.48.0` |
| B4 | Reload Window từng cửa sổ | — | Wrapper sống lại (bản cũ) |
| B5 | Verify rollback | Health 200; evil-origin → 200 + `ACAO: *` (SA-01 reopen); REG-2 absolute attach pass | PASS |

> ⚠️ **Posture sau rollback = MẤT CORS GATE** (SA-01 reopen: `ACAO: *` + no authN trên loopback): drive-by browser đọc/điều khiển MCP được trở lại; GIỮ nguyên containment 356 (FS). Chấp nhận được **interim TIME-BOUND** (điều kiện C3 — Security Deploy Review 356 SD-05): bind 127.0.0.1-only + threat model local-process + vector FS đã đóng bởi 356. **Forward-fix (reinstall combined ≥ 1.52.0) LUÔN là primary**; document thời hạn tối đa + điều kiện quay lại; **KHÔNG mở rộng dùng 1.48.x cho máy mới**.

### 6.4 ⚠️ Ràng buộc Combined Build — KHÔNG rollback riêng 358 mà mất 356

- Build ≥ 1.52.0 chứa **cả hai** fix → ở mức binary **KHÔNG tồn tại rollback "chỉ 358"**. Rollback binary hợp lệ duy nhất = **1.48.0** (mất 358, **giữ 356**).
- ⚠️ **KHÔNG reinstall 1.47.2 để "rollback 358"** — 1.47.2 là pre-fix **cả hai** (mất cả containment 356); chỉ dùng khi rollback cả 356 — không có kịch bản hợp lệ ở đây (356 đã UAT PASS).
- Rollback SOURCE khi cần revert cả hai: **revert 358 (`7bb9222`) TRƯỚC chain 356 (`bb17b39..f453e77`)** — 358 đụng `WrapperServer` mà 356 cũng đụng envelope; second-order chỉ là thứ tự build lại (Security Deploy Review 356 §5).
- Mọi build trước/sau rollback phải pass marker check §10.1 — tối thiểu check (a) `PATH_NO_WORKSPACE` ≥ 1.

### 6.5 Rollback Time Estimate

| Action | Estimated Time |
|--------|---------------|
| Option B (binary reinstall + reload + verify) | ~5 phút |
| Option A (revert + rebuild + reinstall + verify) | ~30–45 phút |
| Database rollback | N/A |
| **Tổng tối đa (Option A)** | **~45 phút** |

---

## 7. Port Configuration — Config-Driven (KHÔNG hardcode 9181)

**Nguồn config:** `extension/src/remote-backend-client.ts:152` —

```typescript
const port = vscode.workspace.getConfiguration("sdlcAgents").get<number>("mcpServerPort", 9181);
```

| Thuộc tính | Giá trị |
|-----------|---------|
| Default (thiếu setting) | **9181** |
| Máy user hiện tại | **9183** (user setting override — N-QA2 đã chạy trên :9183) |
| Bind | `127.0.0.1:<configured-port>` (loopback-only — AC-7) |
| Gate so Host với | `listenPort` THỰC TẾ từ `srv.address().port` (G-7); port null → mọi Host check fail → deny (AD-7, fail-closed) |

**Quy tắc bắt buộc:**

1. **Xác định port trước khi chạy mọi lệnh verify**: đọc user settings (`sdlcAgents.mcpServerPort` trong Kiro settings.json), hoặc `Get-NetTCPConnection -State Listen | Where-Object LocalAddress -eq '127.0.0.1'` quanh vùng port config.
2. **Mọi curl / harness / tài liệu / test dùng placeholder `<p>` hoặc `--port <configured-port>`** — như harness: `npx tsx documents/SA4E-358/testdata/cors-pentest-harness.ts --port <p>` (CLI parse `--port`, fallback 9181 chỉ khi thiếu tham số).
3. **TUYỆT ĐỐI KHÔNG hardcode 9181** trong lệnh vận hành — default chỉ là fallback khi setting thiếu. Đổi port KHÔNG cần đổi code/test (gate so với port listen thực tế — G-7).
4. **Hai port khác nhau — đỡ nhầm:** (i) wrapper `:<sdlcAgents.mcpServerPort>` = HTTP surface CÓ gate; (ii) backend orchestration child server = port resolve runtime từ `.code-intel/settings.json` (`mcpUrl`, ví dụ :48721) — gate KHÔNG áp cho backend port (chỉ WrapperServer; AuthManager OAuth callback tự áp Host-check riêng, ngoài scope ticket).

---

## 8. Monitoring & Alerting

Không hạ tầng monitoring/alerting mới (outputChannel là kênh duy nhất — TDD §10.2; SD-06/OI-4 đã design-accept). Điểm quan sát chính:

| Kênh | Cái gì | Ngưỡng/Signal | Hành động |
|------|--------|---------------|-----------|
| **Deny log — outputChannel** | 1 dòng/deny: `[WrapperServer] Denied request — reason=… origin=… host=…` (sanitized; reason enum: `malformed-origin` / `origin-not-allowed` / `host-mismatch`) | Rate cao bất thường | `origin-not-allowed` cho client hợp lệ → BR-10 thêm allowlist pattern (code + test — KHÔNG nới `*`) · `host-mismatch` → client cấu hình sai (gọi qua hostname khác loopback) → sửa client gọi thẳng `127.0.0.1:<p>` · dò scan bất thường → giữ gate, review nguồn |
| **⚠️ SEC-358-02 — deny-log amplification (đã quantified — PT-42)** | KHÔNG rate-limit: đo live **200 deny requests trong 36ms ≈ ~5,556 deny-log lines/s** (10 batch × 20 concurrent) | Một trang web JS-loop có thể sinh **hàng nghìn dòng 403/phút** → outputChannel spam + memory growth tuyến tính (in-memory — mất khi đóng window) | Accepted cho ticket này (attacker không đọc được gì — 403 + zero CORS, thiệt hại giới hạn local performance). **Follow-up OI-3**: throttle deny-log theo reason khi làm OI-1 shared-secret. Theo dõi thủ công: outputChannel phình nhanh → nghi bị scan |
| Extension host errors | Developer Tools console | ERROR/FATAL mới sau Reload Window | Triage §4.3; rollback Option B nếu block thao tác |
| Health | `/health` giờ yêu cầu caller hợp lệ (403 cho origin lạ) | — | Health-checker in-process của extension KHÔNG qua HTTP → không bị gate ảnh hưởng (TDD §10.4) |

**Baseline bình thường:** trong hoạt động ổn định, deny log ≈ 0 dòng (native no-Origin và webview allowlist đều pass — không log allowed). Mọi deny đều là signal (client lạ hoặc cấu hình sai) — đây là lý do không log allowed (tránh noise, FSD §7.3).

---

## 9. Known Residuals & Follow-ups

Tổng hợp từ Security Assessment (5.7) + Pentest (6.3) — **KHÔNG block deploy** (0 Critical/High/Medium):

| ID | Mô tả | Severity | Trạng thái / Follow-up |
|----|-------|----------|------------------------|
| **SA358-R1 (PT-51)** | Request-target absolute-form malformed (`GET http://[::1`) + Host loopback hợp lệ → `new URL(req.url)` ngoài try (WrapperServer.ts:160) throw → **unhandledRejection "Invalid URL"** — live-confirmed lần đầu (PT-51). Non-browser only, loopback only; trong Extension Host thường bị EH log thay vì crash (request bị ngắt + log noise). Phát hiện thêm: variant Host-xấu bị gate chặn 403 TRƯỚC URL parse (gate-first I-1 = lớp bảo vệ phụ) | 🔵 Low (pre-existing — không phải regression của `7bb9222`) | Backlog hardening: move `new URL(req.url)` vào trong try `handleRequest` (1 dòng dịch chuyển → 404) — gộp cùng SEC-358-04 |
| **SEC-358-05 / OI-1** | Non-browser forge Origin/Host (`Origin: vscode-webview://legit` từ local process) → full access — gate không phải authN boundary | ℹ️ Info (threat model accepted) | **SM tạo follow-up ticket shared-secret (SHOULD, P3)** — mitigation THẬT duy nhất cho vector non-browser; candidate kèm: rate-limit deny-log, Sec-Fetch-Site, canonical-origin check |
| **SEC-358-02 (PT-42)** | Deny-log amplification ~5.5k lines/s đã quantified (Section 8) | 🔵 Low (accepted) | OI-3 throttle theo reason — gộp OI-1 |
| **SA358-R2 (PT-05/06)** | WHATWG URL normalize userinfo/percent-encoded Origin → pass + echo RAW (`http://evil@localhost:9000`) | ℹ️ Info (non-browser-only; zero browser-readback — echo RAW không match origin browser nào) | Optional canonical-check khi làm OI-1 |
| **SA358-R3** | Tab `\t` sống sót qua `sanitizeLogText` (chỉ \r\n\0) | ℹ️ Info (cosmetic — không log-forging trong outputChannel) | Backlog: thêm \t vào regex — ripple regression 356 |
| **SEC-358-04** | 500 handler echo `err.message` | ℹ️ Info (pre-existing, FR-10) | Backlog cùng SA358-R1 (generic `{"error":"Internal error"}` + log server-side) |
| SD-01/02/03/09 (356 deploy review) | `.vscodeignore` dev artifacts; lock stale + npm audit blind; VSIX unsigned; SA-07 nested SDK HIGH | 🟡/🔵 | Gate cho **public release (marketplace)** — không block deploy nội bộ; C4 SM tracking |

---

## 10. Appendix

### 10.1 Verify Bundle Markers — Combined Build (script cho §4.2 Step 3 / A3)

```powershell
$vsix = "extension\sdlc-agents-4-enterprise-<ver>.vsix"
Copy-Item $vsix "$env:TEMP\vsix-check.zip" -Force
$dest = "$env:TEMP\vsix-check-<ver>"
Expand-Archive "$env:TEMP\vsix-check.zip" $dest -Force
$bundle = "$dest\extension\out\extension.js"

# (a) 356: containment PHẢI còn (bắt buộc cả trước lẫn sau rollback — §6.4)
(Select-String -Path $bundle -Pattern "PATH_NO_WORKSPACE" -SimpleMatch).Count          # kỳ vọng >= 1

# (b) 358: gate markers PHẢI có
(Select-String -Path $bundle -Pattern "evaluateOriginGate"   -SimpleMatch).Count       # kỳ vọng >= 1
(Select-String -Path $bundle -Pattern "host-mismatch"        -SimpleMatch).Count       # kỳ vọng >= 1
(Select-String -Path $bundle -Pattern "origin-not-allowed"   -SimpleMatch).Count       # kỳ vọng >= 1
(Select-String -Path $bundle -Pattern "malformed-origin"     -SimpleMatch).Count       # kỳ vọng >= 1
(Select-String -Path $bundle -Pattern "vscode-webview"       -SimpleMatch).Count       # kỳ vọng >= 1 (allowlist)

# (c) 358: wildcard ACAO PHẢI BIẾN MẤT (regex — minified bundle)
(Select-String -Path $bundle -Pattern '"Access-Control-Allow-Origin"\s*,\s*"\*"').Count   # kỳ vọng = 0
```

Tham chiếu: Security Deploy Review 356 §4 Bước 1 (C1) — đã verify trên 1.52.0: 4 gate markers, 0 ACAO `*`, `PATH_NO_WORKSPACE` giữ nguyên.

### 10.2 Deployment Report Template (điền sau mỗi lần deploy)

```markdown
## Deployment Report — SA4E-358
Date: <timestamp> | Environment: <UAT/PROD> | Version: <ver> | Port config: sdlcAgents.mcpServerPort = <p>
Artifact: <vsix> (SHA-256: <hash>) | Markers: (a) >=1 (b) >=1 (c) = 0
Steps: build → marker-verify (§10.1) → install --force → Reload Window (mở SDLC tree view) → verify (§5)
Sanity: health 200 no-Origin [ ] | harness --port <p> 15/15 [ ] | evil-origin 403 zero-CORS [ ] |
        webview echo 204 [ ] | deny log 2 dòng đúng reason [ ] | containment 356 [ ] | logs 0 ERROR [ ]
Merge conditions: 7/7 (V-4 BRD A-1 = BA/SM) | Rollback: N/A / Option <A|B> — trigger: <...>
```

### 10.3 Related Tickets & Documents

| Ticket / Doc | Summary | Relationship |
|--------------|---------|--------------|
| SA4E-356 | Fix path resolution (PathResolver) — UAT PASSED 2026-10-14 | **Combined deploy** — cùng 1 VSIX; DPG 356 = format + deployment surface chung; SECURITY-DEPLOY-REVIEW 356 = C1–C4 + combined verify |
| SA4E-356/SA-01 | Finding nguồn (ACAO `*` + no authN, live-confirmed ×3 P6-15/16/17) | Đóng bởi ticket này |
| SA4E-360 | Multi-Resolution Context Supply (song song) | Cùng main — R6 áp dụng |
| TDD v1.1 §13 | Rollback plan nguồn | Section 6 |
| STP v1.2 §2.5 | 7 merge conditions + exit criteria | Section 3.2 |
| TEST-REPORT v1.0 §5 | Kế hoạch N-QA2 + V-1..V-4 closure | Section 5.2 |
| PENTEST-REPORT v1.0 | 53 attempts, PT-51/PT-42 | Sections 8–9 |
| UG v1.0 §8 | Behavior Changes cho user cũ | Bảng dưới |

**Behavior changes tóm tắt (chi tiết — UG.md §8):** (1) không còn `ACAO: *` — web origin lạ 403 + zero CORS; (2) preflight 204 chỉ cho caller được phép; (3) Host phải `127.0.0.1`/`localhost` + đúng port listen (mọi request có Host); (4) `Vary: Origin` trên response echo; (5) binding 127.0.0.1 assert; (6) native/stdio zero regression. Caller hợp lệ + native client: backward compatible, không đổi config.

### 10.4 Contacts

| Role | Name | Contact |
|------|------|---------|
| Scrum Master | SM Agent | qua pipeline session |
| DevOps | DevOps Agent | session này |
| Security | Security Agent | qua pipeline session (SEC review + pentest) |

---

*— Hết DPG SA4E-358 v1.0 — Deployment model: VSIX per-user Kiro (combined build ≥ 1.52.0 chứa 356+358) · UAT-evidence complete: N-QA2 15/15 PASS dev-host :9183 — chờ user confirm · Rollback: revert `7bb9222` (Option A) hoặc reinstall 1.48.0 (Option B — mất gate, time-bound per C3; forward-fix primary) · Port = `sdlcAgents.mcpServerPort` config-driven (KHÔNG hardcode 9181) · Deploy chỉ từ main (R6) —*
