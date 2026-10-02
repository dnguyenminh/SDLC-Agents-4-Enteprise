# HANDOFF — SA4E-336 (L3 pipeline → UAT)

> Mục đích: bàn giao để một AI/agent khác tiếp quản điều phối SA4E-336 từ chỗ đang dở tới UAT.
> Ngày lập: 2026-10-01. Epic: SA4E-289. Autonomy: L3 (unattended tới UAT). Human gate: UAT.
> 🛑 **Cập nhật 2026-10-02T08:31Z (SM — abort workflow):** Workflow SA4E-336 đang chạy Phase 5 (dev-agent invoked 2026-10-01T09:32Z) đã được **ABORT** trước khi bàn giao — để tránh 2 coordinator cùng ghi STATUS/RUN-LOG và cùng commit branch. **AI tiếp quản là coordinator DUY NHẤT** (nếu thấy workflow vẫn đang chạy khi đọc file này → stop nó trước khi làm việc khác). Toàn bộ code Phase 5 dở nằm **uncommitted trong working tree** (abort không mất code), **chưa hoàn tất, chưa TA review**.

## 1. Cách tiếp quản (QUAN TRỌNG)

- Entry point là **SM agent** (`.kiro/agents/sm-agent.md`). KHÔNG tự viết document/code — chỉ invoke sub-agent qua `invokeSubAgent`, verify quality gate, update STATUS.json + RUN-LOG.md, transition Jira.
- SM **luôn resume** từ `documents/SA4E-336/STATUS.json`. Đọc file đó trước tiên để biết phase hiện tại.
- Chế độ **L3**: tự proceed giữa các phase, KHÔNG hỏi user; chỉ DỪNG ở UAT, hoặc khi circuit breaker open / token budget cạn / vi phạm constraint.
- Giao tiếp với user bằng **tiếng Việt**. Báo cáo mỗi phase transition.
- **RUN-LOG row-per-invoke (BẮT BUỘC)**: mỗi lần invoke sub-agent ghi NGAY 1 dòng với đúng tên agent ở cột Agent (ba-agent/ta-agent/sa-agent/qa-agent/dev-agent/devops-agent/ui-agent/security-agent); dòng SM RIÊNG cho verify/transition. Không gộp authorship + verify vào 1 dòng SM.

## 2. Trạng thái hiện tại (snapshot)

| Phase | Trạng thái | Ghi chú |
|-------|-----------|---------|
| 1 Requirements | ✅ done | BRD v1 (ba-agent) |
| 2 Specification | ✅ done | FSD v2.0 (ba-agent + ta-agent) |
| 3 Design | ✅ done | TDD v1.1 → v1.2 (sa-agent) + BA Review Gate + reconcile |
| 3.5 Feedback loop | ✅ done | DISCREPANCY resolved; OPEN-2 đã đóng ở Phase 4 |
| 3.7 Security Design Review | ✅ done | 0 Critical, 4 High. SEC-01/02 fold vào TDD v1.2 |
| 4 Test Planning | ✅ done | STP/STC v1.2, 88 TCs, RTM 100%, SM+BA APPROVED, đã attach Jira |
| 4.5 DevOps Pipeline Setup | ✅ done | `.github/workflows/ci-sa4e-336.yml` (SEC-07 gate). Chưa commit — sẽ commit trên branch SA4E-336 ở Phase 5 |
| **5 Implementation** | ⏳ **in_progress** | branch `SA4E-336`; dev-agent invoked 09:32Z nhưng workflow **ABORTED 2026-10-02** → WIP uncommitted trong working tree, chưa TA review |
| 5.5 User Guide | ⏳ chưa | |
| 5.7 Security Code Review | ⏳ chưa | |
| 6 Testing | ⏳ chưa | |
| 6.3 Pentest | ⏳ chưa | |
| 6.5 UAT | 🛑 ĐIỂM DỪNG | chờ user/PO nghiệm thu |

- Jira status: In Progress. Token budget đã dùng ~158k/500k (ngày 2026-10-01).
- Git: branch `SA4E-336` đã tạo, **chưa commit gì của ticket này**. Working tree (cập nhật 2026-10-02) giờ gồm: (a) ~134 thay đổi pre-existing (steering/docs + extension files từ ticket khác, vd `documents/SA4E-335/*`) KHÔNG thuộc ticket này, và (b) **WIP Phase 5 của SA4E-336** do dev-agent viết trước khi abort — vd `extension/src/pi-workflow/*` (powershell-approval-branch.ts, pi-coding-tools.ts, shell-tool-factory.ts, turn-budget-guard.ts, workspace-info-tool.ts...), `extension/src/chat/engine/ps-command-patterns.ts`, `extension/src/config/config-namespace-migration.ts`, `llm-secret-keys.ts`, nhiều `__tests__/` mới, `documents/UPGRADE-pi-0.99-powershell-tool.md`. → Việc ĐẦU TIÊN của SM mới: `git status` + đối chiếu từng path với scope TDD v1.2 để phân loại WIP thuộc SA4E-336 hay ticket khác; stage per-path, KHÔNG `git add -A`.

## 3. Việc cần làm (theo thứ tự)

### Phase 5 — Implementation (ĐANG DỞ)
- [ ] **SM đánh giá WIP** trong working tree (workflow đã abort, KHÔNG có process nào đang chạy) — đối chiếu từng file với TDD v1.2 để xác định đã làm tới đâu, còn thiếu gì.
- [ ] Invoke **dev-agent** hoàn tất code theo TDD v1.2: bump version **0.99.1 lockstep**, OS-aware PowerShell tool, **allowlist-of-safe gate**, implement SEC-01/03/04/05/08.
- [ ] **Step 5c — TA review** implementation (invoke **ta-agent**): design conformance, API contracts, integration, data model, pseudocode alignment. Code chỉ done khi TA verdict = APPROVED (tối đa 2 vòng, sau đó report user).
- [ ] Commit theo convention `SA4E-336: {summary}`, stage per-path (gồm cả `ci-sa4e-336.yml`). Push `-u origin SA4E-336` (KHÔNG merge main).
- [ ] Transition Jira IN PROGRESS → IN REVIEW ("Review code").
- [ ] Update STATUS: implementation done + taReview approved.

### Phase 5.5 — User Guide
- [ ] **dev-agent** viết `UG.md` (template `documents/templates/UG-TEMPLATE.md`).
- [ ] **ba-agent** review UG (ngôn ngữ, đủ use case, config examples, troubleshooting).
- [ ] **qa-agent** verify UG bằng cách thực hiện theo hướng dẫn (không chỉ đọc). FAIL → dev fix → re-verify (max 2).
- [ ] Attach UG DOCX lên Jira. Ingest KB.

### Phase 5.7 — Security Code Review
- [ ] **security-agent** audit code branch SA4E-336 → `SECURITY-ASSESSMENT.md` (OWASP Top 10, injection, secrets, deps CVE...).
- [ ] ⛔ **SEC-07 blocking DEV gate**: `npm audit` sạch (không High/Critical) + capability `pi-codemode` phải thỏa trước khi qua Phase 6.
- [ ] Critical/High findings → dev-agent fix → re-review (max 2). Không còn Critical/High (hoặc user chấp nhận rủi ro) mới proceed.

### Phase 6 — Testing
- [ ] **Two-axis code review (trước test execution)**, chạy song song:
  - Axis 1 Standards (**dev-agent**) theo `code-standards.md` (file ≤200 dòng, hàm ≤20 dòng, SOLID, Fowler smells, zod validation...).
  - Axis 2 Spec Compliance (**qa-agent**) đối chiếu TDD/FSD (missing features, scope creep, API contracts, business rules).
  - FAIL bất kỳ axis → dev-agent fix → re-review (max 2).
- [ ] (Tùy chọn) **Fresh-context review** nếu high-risk: >500 dòng đổi, security code, DB schema, hoặc >5 files. Theo `fresh-context-review.md`.
- [ ] **qa-agent** chạy automated tests (vitest trong backend/ + extension/). Báo pass/fail.
- [ ] **SM review test code quality**: IT phải dùng đúng technique STC yêu cầu (không mock-all giả làm integration test).
- [ ] Tests fail → "Fix bugs" → dev fix → retest. Pass → `TEST-REPORT.md` + attach Jira.
- [ ] Transition Jira IN REVIEW → QA TEST ("Verify").

### Phase 6.3 — Penetration Testing
- [ ] App chạy ở test env. **security-agent** pentest động (recon → auth/authz/injection/XSS/CSRF/API abuse/business-logic → infra TLS/headers/cookie/CORS) bằng curl/httpie thật.
- [ ] Output `PENTEST-REPORT.md` + attach Jira. Critical/High → dev fix → re-pentest (max 2). Medium → log, proceed.

### Phase 6.5 — UAT (🛑 DỪNG)
- [ ] Transition Jira QA TEST → UAT ("Start UAT").
- [ ] Cung cấp cho user/PO: URL môi trường, test accounts, acceptance criteria (từ BRD), key test scenarios.
- [ ] ⛔ DỪNG — chờ user/PO xác nhận. KHÔNG tự transition qua UAT. KHÔNG giả định UAT pass.

## 4. Lưu ý / nợ kỹ thuật đã biết

- **SEC-07** là blocking gate cho DEV (xem Phase 5.7) — phải xử lý trước Phase 6.
- **FSD v2.1 sync (6 mục)**: đổi thuật ngữ "name-set" → "allowlist" trong FSD. Non-blocking, để BA xử lý ở pass sau (không chặn pipeline).
- **STC export**: không có XLSX exporter → đã dùng DOCX fallback cho STC (chấp nhận được).
- **CI single-version gate**: RED-by-design cho tới khi bump version 0.99.1 ở Phase 5 (sẽ xanh sau khi dev bump).
- Dockerfile / DB migration: **N/A** (đây là VS Code/Kiro extension đóng gói VSIX, không phải service có container/DB).
- **`backend/sa4e_test_pw_123`**: file rác 25 bytes ("secrets/postgres_password", tạo 2026-10-01 17:09) — có vẻ unit test của dev ghi fixture ra repo thay vì temp dir → dev-agent dọn file + fix test dùng temp dir (security review sẽ flag file giống secret trong repo).
- **MCP code-intel DOWN lúc handoff (2026-10-02)**: `http://localhost:9181/mcp` không respond (cả 48721/9186). Nếu cần tool (find_tools/mem_*/export/Jira) → start server trước: `npx tsx backend/src/index.ts` (xem `.opencode/rules/sdlc/tool-usage-dynamic.md` §Server Startup).

## 5. Tham chiếu file

- STATUS: `documents/SA4E-336/STATUS.json` (nguồn sự thật về phase)
- RUN-LOG: `documents/SA4E-336/RUN-LOG.md` (lịch sử invoke từng agent)
- Tài liệu: `BRD.md`, `FSD.md`, `TDD.md`, `STP.md`, `STC.md`, `SECURITY-REVIEW.md`, `DISCREPANCY.md`
- Test data: `documents/SA4E-336/testdata/*.csv` (13 files)
- CI: `.github/workflows/ci-sa4e-336.yml`
- Steering điều phối: `.kiro/agents/sm-agent.md` + `.kiro/steering/` (sm-core, phase-*, shared-*, role-boundaries, loop-constraints, code-standards, fresh-context-review, dev-bug-diagnosis)
