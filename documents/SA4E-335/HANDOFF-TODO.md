# SA4E-335 — Handoff / TODO cho AI tiếp theo

> **Mục tiêu gốc:** SM điều phối team làm ticket **SA4E-335** đến bước **UAT** theo autonomy **L3** (unattended, chỉ dừng ở UAT + deployment).
> **Loại ticket:** DevOps / backend-only — review `backend/Dockerfile` + `backend/docker-compose.yml` vs đề xuất SA4E-44, và tạo GitHub Actions CI build + push Docker image. **Không có UI.**
> **Workspace:** `c:\projects\kiro\SDLC-Agents-4-Enterprise`
> **Docs ticket:** `documents/SA4E-335/`
> **Git branch:** `SA4E-335`

---

## 1. Trạng thái hiện tại (tính đến handoff)

### Đã HOÀN TẤT (Phase 2 → Phase 6 two-axis review) — tất cả gate PASS/APPROVED

| Phase | Nội dung | Kết quả | Artifact |
|-------|----------|---------|----------|
| 2 | Specification — FSD (BA draft → TA enrich) | done, v1.1 | `FSD.md` + diagrams (system-context, sequence-ci-build-push, state-image-lifecycle) |
| 3 | Design — TDD (SA) | done, v1.0 | `TDD.md` + `diagrams/architecture.*`, `component.*` |
| 3.7 | Security Design Review | done — 13 findings (2C/3H/5M/3L) | `SECURITY-REVIEW.md` |
| 4 | Test Planning (QA) + BA review (2 vòng) | done — BA APPROVED, RTM 100% (17/17 AC) | `STP.md`, `STC.md`, `testdata/*.csv` |
| 4.5 | DevOps Pipeline Plan | done | `DEVOPS-PIPELINE-PLAN.md` |
| 5 | Implementation (DEV) + TA review | done — TA APPROVED, build PASS, /health=200, non-root uid 1001 | `IMPL-VERIFICATION.md`, `TA-IMPL-REVIEW.md`, `BUILD-AND-REGISTRY.md` |
| 5.7 | Security Code Review | done — APPROVED, 0 Critical / 0 High tồn dư, npm audit 0 vulns | `SECURITY-ASSESSMENT.md` |
| 6 (một phần) | Two-axis code review (Standards + Spec) | cả hai PASS, reconcile không cần fix | `STANDARDS-REVIEW.md`, `SPEC-REVIEW.md` |

**3 commit trên branch `SA4E-335` (đã verify, tách bạch đúng chuẩn):**
- `70f35f1` — artifact: hardened Dockerfile + docker-compose + GitHub Actions CI + .gitignore + *.example + BUILD-AND-REGISTRY.md
- `8d4b173` — prereq: regenerate `backend/package-lock.json` khớp package.json (caret-range, không đổi runtime). **Lưu ý:** đây là prereq fix TÁCH khỏi artifact ticket (lockfile lệch là tình trạng có sẵn của repo, không do ticket này gây ra).
- `70d39d6` — verification evidence (build PASS, non-root, /health=200, 93 tools loaded)

**2 Critical ban đầu (SEC-01 secret git-ignore, SEC-02 base image digest pinning) + 3 High (SEC-03/04/05) đã được xử lý trong code và security-agent đã verify.**

### CÒN LẠI (chưa xong) — 3 việc

Một workflow (`wf_1a891c5f74ce9db6`) đã được khởi để chạy 3 việc này, NHƯNG workflow trước đó (`wf_9a14e09621294781`) từng bị **kẹt sau agent restart** ở step test-execution (state không load lại được). **AI tiếp theo cần verify 3 việc dưới có thực sự hoàn tất chưa** — đọc STATUS.json + kiểm tra sự tồn tại của các file report. Nếu chưa, thực hiện thủ công theo mô tả.

---

## 2. VIỆC CẦN LÀM (TODO)

### TODO-1 — Phase 6: Test Execution (vai trò QA)
Chạy test suite thực tế theo `STP.md`/`STC.md` trên branch `SA4E-335`:
- [ ] `docker build --target production` trong `backend/` → verify PASS tới hết
- [ ] `docker compose config` → verify compose hardened resolve được secrets/limits/healthcheck
- [ ] Lint/validate `.github/workflows/build-push-backend.yml` (actionlint nếu có; nếu không thì YAML + logic validation)
- [ ] Smoke test image: start container → `/health` = HTTP 200 trên PORT **48721** → xác nhận non-root `sa4e` uid **1001** → stop & dọn container
- [ ] Dùng test data trong `documents/SA4E-335/testdata/` (config-validation, healthcheck, tag-scheme) khi liên quan
- [ ] Ghi `documents/SA4E-335/TEST-REPORT.md` (kết quả theo test level, pass/fail, evidence)
- [ ] Cập nhật `STATUS.json`: `testing.status = "done"`
- [ ] Append 1 dòng vào `RUN-LOG.md` (append-only, không sửa dòng cũ)
- ⚠️ Nếu test FAIL → báo chi tiết, **không tự fix code** (gửi về DEV).

### TODO-2 — Phase 6.3: Penetration Testing (vai trò Security)
Pentest phù hợp với deliverable container/CI, branch `SA4E-335`:
- [ ] Container/image hardening: non-root, read_only fs, cap_drop, no-new-privileges
- [ ] Port/network: postgres KHÔNG publish port, backend bind 127.0.0.1 (loopback)
- [ ] Secret-leak: không secret trong image layers / CI logs; `git check-ignore` xác nhận secrets bị ignore
- [ ] CI supply-chain: GitHub Actions SHA-pinned, Trivy CRITICAL/HIGH gate, scope của GHCR GITHUB_TOKEN
- [ ] (Nếu MCP HTTP server chạy được trong test) kiểm tra security headers / endpoint trên `/health` + MCP endpoint PORT 48721
- [ ] Ghi `documents/SA4E-335/PENTEST-REPORT.md` (executive summary, bảng findings ID/Severity/Category/PoC/Remediation, risk rating)
- [ ] Cập nhật `STATUS.json`: `pentest.status = "done"`
- [ ] Append 1 dòng vào `RUN-LOG.md`
- ⚠️ Critical/High phải surface rõ ràng cho người quyết định — không âm thầm pass.

### TODO-3 — Phase 6.5: UAT Readiness (vai trò DevOps) — BƯỚC CUỐI, rồi DỪNG
- [ ] Ghi `documents/SA4E-335/UAT-READINESS.md` gồm:
  - Deliverables đã giao + commit refs (`70f35f1` / `8d4b173` / `70d39d6`)
  - Hướng dẫn build + run local (lệnh chính xác)
  - Cách verify từng acceptance criterion của BRD (17 AC thuộc 4 story)
  - Link tới mọi document/report (BRD, FSD, TDD, STP, STC, SECURITY-REVIEW, SECURITY-ASSESSMENT, PENTEST-REPORT, TEST-REPORT, BUILD-AND-REGISTRY)
  - Các mục non-blocking đã chấp nhận (onnx `:latest` dev-only; node `/health` probe thay `wget` theo SEC-12; findings Medium/Low đã accept)
- [ ] Cập nhật `STATUS.json`: `uat.status = "in_progress"` (sẵn sàng cho human UAT), `currentPhase = "uat"`
- [ ] Append 1 dòng vào `RUN-LOG.md`
- 🛑 **DỪNG tại đây.** KHÔNG transition Jira sang READY-FOR-PRODUCT, KHÔNG deploy — UAT là human gate (L3 chỉ dừng ở UAT + deployment).

---

## 3. Ràng buộc & quy ước (BẮT BUỘC tuân thủ)

- **Role separation:** mỗi agent chỉ làm đúng vai trò, chỉ ghi artifact của mình. SM/orchestrator KHÔNG tự viết document/code — chỉ điều phối, verify, cập nhật STATUS.json + RUN-LOG.md.
- **RUN-LOG.md: append-only** — không bao giờ sửa/xóa dòng cũ.
- **Test data** phải nằm trong `documents/SA4E-335/testdata/` (đã chuẩn hóa; tham chiếu trong STP/STC dùng path `testdata/...`). Quy ước này đã thêm vào `.kiro/steering/phase-4-test-planning.md`.
- **Diagrams** dùng draw.io (KHÔNG Mermaid), theo `.kiro/steering/shared-diagrams.md`.
- **Verify trước khi báo done:** thực sự chạy build/validate; file phải có nội dung thật, không placeholder.
- **Git safety:** không force-push, không merge vào main/master. Mọi commit trên branch `SA4E-335`.
- **Autonomy L3:** tự chạy giữa các phase, chỉ dừng ở UAT và Deployment (human gates).

---

## 4. Các bước SAU UAT (ngoài phạm vi lần chạy này — chỉ để tham khảo)

Khi user/PO xác nhận UAT PASS, pipeline sẽ tiếp (do AI/agent điều phối, cần user approve từng gate):
- Phase 6.7 — Security Deployment Review (security-agent + devops-agent)
- Phase 7 — Deployment: DPG.md + RLN.md, deploy, sanity test, release process (bump version, sync version refs, merge master), transition Jira READY-FOR-PRODUCT → DONE.

---

## 5. File tham chiếu nhanh

- Trạng thái máy đọc: `documents/SA4E-335/STATUS.json`
- Nhật ký chạy: `documents/SA4E-335/RUN-LOG.md`
- Yêu cầu nghiệp vụ: `documents/SA4E-335/BRD.md` (4 story, 17 AC)
- Spec kỹ thuật: `documents/SA4E-335/FSD.md`, `TDD.md`
- File hạ tầng đã sửa: `backend/Dockerfile`, `backend/docker-compose.yml`, `.github/workflows/build-push-backend.yml`, `.gitignore`, `backend/.env.production.example`, `backend/secrets/*.example`
