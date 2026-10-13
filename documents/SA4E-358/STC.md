# Software Test Cases (STC)

## SDLC-Agents-4-Enterprise — SA4E-358: [Follow-up SA4E-356/SA-01] CORS * + no authN trên loopback :9181 — Origin/Host validation

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-358 |
| Title | [Follow-up SA4E-356/SA-01] CORS * + no authN trên loopback :9181 — Origin/Host validation |
| Author | QA Agent |
| Version | 1.1 |
| Date | 2026-10-13 |
| Status | Draft |
| Related STP | documents/SA4E-358/STP.md (v1.2) |
| Related BRD | documents/SA4E-358/BRD.md (v1.0) |
| Related FSD | documents/SA4E-358/FSD.md (v1.1 — TA enriched, 6/6 gaps resolved) |
| Related TDD | documents/SA4E-358/TDD.md (v1.1 — §3 contract 7 phases, §11 test arch, §12 C1..C12) |
| Related Security Review | documents/SA4E-358/SECURITY-REVIEW.md (v1.0 — SEC-358-01 Medium → SM chốt **Option A**: Host-check áp cho MỌI request có Host; tests H-7/H-8/H-9 là test cases chính thức UT-32..34) |

---

## Author Tracking

| Role | Name - Position | Responsibility |
|------|-----------------|----------------|
| Author | QA Agent – QA Engineer | Create STC + test data CSVs; trace T1..T14 + H-7..H-9; thực hiện live harness C8 + V-1..V-4 (C9) |
| Peer Reviewer | BA Agent – Business Analyst | Review business coverage (mandatory Review Gate — max 2 iterations) |
| Approver | SM Agent – Scrum Master | Final approval |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-13 | QA Agent | Initiate STC — **63 cases** (PBT 4, UT 38 gồm **H-7/H-8/H-9** SEC-358-01 Option A, IT 14 = T1..T14, E2E-API 5 gồm E2E-API-05 V-1..V-4 evidence blocker, SCAN 2; E2E-UI/SIT N/A with justification); RTM 100% AC-1..8 + FR-01..12 + UC-01..07 + BR-01..10 + R-4/R-6/NFR/SEC-358-01/SEC-358-03; test data 9 CSV files |
| 1.1 | 2026-10-13 | QA Agent | Hygiene fixes per BA review (APPROVED với điều kiện — 2 fixes bắt buộc trước Phase 6): **Gap-1** — SCAN-02 thêm step 6 (Phase 1.5 grep — reconcile testdata SCAN-02f có sẵn) + **step 7 grep `referer` → 0 match** (BR-05 traceability; testdata +SCAN-02g; postconditions 7/7); **Gap-2** — TEST-REPORT CSV khôi phục đúng 16 cột cho mọi row lệch (PBT-03/IT-01/IT-03 + 15 row cùng lỗi thiếu dấu phẩy cuối); **Gap-3** — STP §1.1 binding wording (STP v1.2); **Gap-4** — +**UT-39 optional** SEC-358-05 (Origin chứa [\t\n\r\f\v] → DENY — skip-nếu-DEV-không-implement, ghi rõ điều kiện trong case); **Gap-5** — IT-06 step 3 ghi chú kỹ thuật `sendRawRequest`; **N-QA3** — TDD §3.3 6→**7 phases** + PBT-04 title; RTM cập nhật (BR-05 step 7, I-8 step 6, +SEC-358-05 row); tổng 63 → **64 cases** (63 bắt buộc + 1 optional); **A1 sync (TA review it. 1)** — IT-06 step 5 both-fail precedence: expected log reason `origin-not-allowed` → `host-mismatch` (P1.5 chạy trước → deny đầu tiên định reason — TDD v1.1 §3.3, FSD v1.2 BR-05); v1.0 leftover — code đã assert đúng (evidence test-run-summary.md deviation #4); sync kèm testdata/integration-matrix.csv IT-06 + TEST-REPORT CSV row IT-06; origin-host-corpus.csv / live-harness-corpus.csv / STP đã kiểm tra — không còn both-fail stale khác |

---

## Test Case Summary

| Category | ID Range | Count | Priority |
|----------|----------|-------|----------|
| Property-Based (fail-closed correctness) | PBT-01 to PBT-04 | 4 | P2 |
| Unit — OriginGate pure (7 nhóm: extract, no-Origin, malformed, allowlist, host-check, **SEC-358-01 host-mọi-request**, robustness) + 1 optional SEC-358-05 | UT-01 to UT-39 | 38 + 1 optional | P1–P3 |
| Integration — WrapperServer server-thật (T1..T14) | IT-01 to IT-14 | 14 | P1–P2 |
| E2E-API — live harness :9181 (extension host thật, không mock transport) | E2E-API-01 to E2E-API-05 | 5 | P1 (E2E-API-05 = V-1..V-4 — **blocker merge**) |
| Static scans (ACAO `*` remnants + gate-first ordering) | SCAN-01 to SCAN-02 | 2 | P2 |
| E2E-UI (browser UI) | N/A — no UI surface (BRD/FSD UI: N/A — backend HTTP server behavior) | 0 | — |
| SIT (manual exploratory) | N/A — all deterministic (status + headers + body + log observable); V-1 residual risk handled bằng E2E-API-05 documented procedure | 0 | — |

## Test Level Summary

| Level | Count | Automated | Manual |
|-------|-------|-----------|--------|
| PBT | 4 | 4 | 0 |
| UT | 39 (38 + 1 optional) | 38 bắt buộc + 1 conditional (UT-39) | 0 |
| IT | 14 | 14 | 0 |
| E2E-API | 5 | 4 (harness tsx) | 1 (E2E-API-05 — V-1..V-4 procedure, cần client thật + dev host thật) |
| E2E-UI | 0 | 0 (N/A) | 0 |
| SIT | 0 | 0 (N/A) | 0 |
| SCAN | 2 | 2 | 0 |
| **Total** | **64 (63 bắt buộc + 1 optional)** | **62 bắt buộc + 1 conditional (98%)** | **1 (2%)** |

**Conventions dùng xuyên suốt (mỗi case dẫn chiếu section này):**

- `H(...pairs)` = helper dựng mảng rawHeaders phẳng: `H(["Origin","https://evil.com"],["Host","127.0.0.1:9181"])` → `["Origin","https://evil.com","Host","127.0.0.1:9181"]` — inject trực tiếp vào `evaluateOriginGate(rawHeaders, listenPort)` mức 1, KHÔNG server KHÔNG mock (TDD §11.3).
- **DENY_SHAPE** (FR-08 + TDD §7.1 + security review §deny hygiene): HTTP **403** + body EXACT `{"error":"Forbidden"}` + `Content-Type: application/json` + **KHÔNG header nào bắt đầu `access-control-`** (không ACAO, không Allow-Methods, không Allow-Headers) + 1 dòng deny log: `[WrapperServer] Denied request — reason=<origin-not-allowed|host-mismatch|malformed-origin> origin=<sanitized> host=<sanitized> (<METHOD> <path>)` — reason KHÔNG leak vào response.
- **echo EXACT (G-4):** ACAO === Origin RAW đã trim (KHÔNG `url.origin`); no-Origin → zero CORS headers (G-5); deny → zero CORS headers (I-2); KHÔNG BAO GIỜ `*` (BR-07).
- **Option A (SEC-358-01):** Host check áp cho **MỌI request có header Host** (Phase 1.5 — invariant I-8); no-Origin + Host ∉ {127.0.0.1/localhost:listenPort} → **DENY host-mismatch**; chỉ no-Origin + Host thiếu (HTTP/1.0 legacy) được pass.
- **Helpers mức 2 (TDD §11.5.1):** `requestWithHeaders(port, opts)` (headers tùy ý), `assertNoAccessControlHeaders(headers)` (scan mọi key — assert zero `access-control-*`), `sendRawRequest(port, rawBytes)` (raw `net.connect` — duplicate header/CRLF), `createCapturingOutputChannel()` (capture `lines[]` — deny log assert).
- **listenPort:** IT lấy từ `server.start(0)` (ngẫu nhiên — G-7, ghi `{listen_port}`); E2E live = `9181` (config `sdlcAgents.mcpServerPort`).
- **Tool-not-executed assert:** deny path → `restCallToolMock.calls.length === 0`.
- **Test data:** `testdata/origin-host-corpus.csv` (UT-01..39), `testdata/pbt-properties.csv`, `testdata/integration-matrix.csv` (IT-01..14), `testdata/preflight-matrix.csv` (IT-13), `testdata/live-harness-corpus.csv` (E2E-API-01..04), `testdata/scan-patterns.csv`, `testdata/v1-evidence-checklist.csv`, `testdata/pre-seeded-data.csv` (baseline).
- **Priority→SLA:** P1 (4h — chặn security review AC-3/merge), P2 (1 business day), P3 (3 business days) — STP §8.2.

---
## 1. Property-Based Tests (PBT) — `evaluateOriginGate` (fast-check, vitest)

### PBT-01: Result shape exhaustive — mọi input sinh OriginGateResult hợp lệ (fail-closed shape)

| Field | Value |
|-------|-------|
| **ID** | PBT-01 |
| **Priority** | High (P2) |
| **Type** | Property-Based (fast-check 4.9.0 + vitest) |
| **Requirement** | FR-12, BR-01, G-1 (AC-1) |
| **Preconditions** | `OriginGate.ts` compile (`tsc -p ./`); fast-check import được trong vitest; KHÔNG cần server (pure function) |

**Objective:** Với MỌI cặp input `(rawHeaders, listenPort)` bất kỳ, `evaluateOriginGate` luôn trả về result có cấu trúc discriminated-union hợp lệ — không bao giờ trạng thái mơ hồ (ok=true kèm reason, hay ok=false thiếu sanitized fields).

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Generate arbitrary `rawHeaders` = `fc.array(fc.string(), {maxLength: 40})` (gồm odd-length, rỗng, control chars, unicode, chuỗi 10KB) + arbitrary `listenPort` = `fc.integer()` | Valid arbitrary input |
| 2 | Gọi `evaluateOriginGate(rawHeaders, listenPort)` | Không throw; trả object có property `ok` |
| 3 | Assert shape: nếu `ok === true` → object có `echoOrigin: string \| null` (không undefined); nếu `ok === false` → `reason ∈ {"origin-not-allowed","host-mismatch","malformed-origin"}` + `originSanitized: string` + `hostSanitized: string` (không undefined) | 0 counterexample qua 10⁴ runs; counterexample → shrink + defect Major |

**Test Data:** `testdata/pbt-properties.csv` row PBT-01 (seed 388911)
**Postconditions:** Không state side-effect (pure — G-2)

---

### PBT-02: Never-throw (G-1) — gate không bao giờ exception với input xấu bất kỳ

| Field | Value |
|-------|-------|
| **ID** | PBT-02 |
| **Priority** | High (P2) |
| **Type** | Property-Based — Security (fast-check + vitest) |
| **Requirement** | G-1, FR-12, BR-01 (AC-1, NFR Reliability) |
| **Preconditions** | `OriginGate.ts` compile; không server |

**Objective:** `evaluateOriginGate` và `extractGateHeaders` KHÔNG BAO GIỜ throw — mọi failure (URL hỏng, rawHeaders lệch cấu trúc, port NaN/âm/0) là `OriginGateDeny` hoặc PASS-with-rationale, không exception path.

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Generate arbitrary inputs gồm: odd-length arrays, `["Origin"]` đơn lẻ, giá trị chứa `%%`, `\r\n\0`, null-literal, `javascript:`, scheme-only, listenPort ∈ {0, NaN, -1, 9181, 2¹⁶} | Valid adversarial corpus |
| 2 | `expect(() => evaluateOriginGate(h, port)).not.toThrow()` cho từng input | Không exception qua 10⁴ runs |
| 3 | Tương tự `expect(() => extractGateHeaders(h)).not.toThrow()` | Không exception (E-5 — odd/empty array guard) |

**Test Data:** `testdata/pbt-properties.csv` row PBT-02 (seed 388912)
**Postconditions:** I-3 (gate không throw) được chứng minh; không crash path

---

### PBT-03: Log-safety — mọi DENY result đã sanitized (G-3 bên trong gate)

| Field | Value |
|-------|-------|
| **ID** | PBT-03 |
| **Priority** | High (P2) |
| **Type** | Property-Based — Security (fast-check + vitest) |
| **Requirement** | G-3, BR-04, FR-09, R-4 |
| **Preconditions** | `OriginGate.ts` compile; import `sanitizeLogText` từ PathResolver (dependency một chiều) |

**Objective:** Với MỌI deny result, `originSanitized`/`hostSanitized` KHÔNG chứa ký tự control `\r`/`\n`/`\0` — WrapperServer không thể log giá trị raw dù muốn (bài học SEC-05/SA-02 SA4E-356 nâng cấp đúng mức).

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Generate arbitrary header values với injected control chars (`fc.string()` + append `\r\n\0` ngẫu nhiên vị trí) | Adversarial header corpus |
| 2 | Gọi `evaluateOriginGate(...)`; với kết quả `ok === false` | Deny (fail-closed với input hỏng) |
| 3 | Assert `/[\r\n\0]/.test(r.originSanitized) === false` VA `/[\r\n\0]/.test(r.hostSanitized) === false` | 0 lan control char lot qua 10^4 runs (tat ca da thay bang `?`) |

**Test Data:** `testdata/pbt-properties.csv` row PBT-03 (seed 388913)
**Postconditions:** Anti log-forging R-4 đóng; tie-in IT-09 (integration assert trên log thật)

---

### PBT-04: No-Origin + Host hợp lệ monotonic PASS (BR-06 + SEC-358-01 Option A)

| Field | Value |
|-------|-------|
| **ID** | PBT-04 |
| **Priority** | High (P2) |
| **Type** | Property-Based — Security (fast-check + vitest) |
| **Requirement** | BR-06, FR-02a, FR-04, SEC-358-01, I-8 (AC-4, AC-5) |
| **Preconditions** | `OriginGate.ts` compile với Phase 1.5 (Host-check-mọi-request-có-Host); không server |

**Objective:** Với MỌI rawHeaders KHÔNG chứa key `origin`, kết quả chỉ có thể là: (a) Host absent → `PASS {echoOrigin: null}`; (b) Host = `127.0.0.1:<listenPort>` hoặc `localhost:<listenPort>` (case-fold hostname, port numeric G-8) → `PASS {echoOrigin: null}`; (c) Host khác → `DENY host-mismatch`. Không có kết quả thứ 4 — monotonic, không mơ hồ.

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Generate arbitrary rawHeaders từ corpus Host (không Origin): absent, `127.0.0.1:{p}`, `localhost:{p}`, `LOCALHOST:{p}`, `127.0.0.1:0{p}` (numeric), `attacker.com:{p}`, `[::1]:{p}`, `127.0.0.1:abc`, `evil.com:9181` × listenPort arbitrary | Corpus 10⁴ combos |
| 2 | Gọi `evaluateOriginGate(...)`; classify kết quả | Chỉ rơi vào 3 lớp (a)/(b)/(c) đúng điều kiện — không PASS với Host lạ, không DENY với Host loopback đúng port |
| 3 | Assert: `hostAbsent → ok===true && echoOrigin===null`; `loopbackHost(port===listenPort) → ok===true && echoOrigin===null`; `otherHost → ok===false && reason==="host-mismatch"` | 0 counterexample; shrink nếu có |

**Test Data:** `testdata/pbt-properties.csv` row PBT-04 (seed 388914) + Host subset `testdata/origin-host-corpus.csv` rows UT-32..34
**Postconditions:** SEC-358-01 Option A semantics (I-8) được chứng minh property-level; tie-in UT-32..34 + IT-12/IT-13

---
## 2. Unit Tests (UT) — OriginGate pure function (mức 1, <50ms, không server)

**Common objective:** verify contract `evaluateOriginGate`/`extractGateHeaders` theo TDD §3.3 (7 phases — gồm Phase 1.5 SEC-358-01 Option A) + §3.4 (extract) + G-1..G-8 + SEC-358-01 Option A (Phase 1.5).
**Common preconditions:** `extension/src/services/OriginGate.ts` committed (C1) + `services/__tests__/origin-gate.test.ts` (C2); gate KHÔNG import http/vscode (G-2 — verify bằng grep, SCAN-02); gọi trực tiếp `evaluateOriginGate(H(...), listenPort)` với mảng rawHeaders mô phỏng.
**Common steps (áp cho mọi UT case):** 1) dựng input từ corpus row; 2) gọi function; 3) assert kết quả theo cột Expected; 4) với DENY: assert `originSanitized`/`hostSanitized` đúng cột tương ứng (đã sanitized).
**Common test data:** từng case = 1 row `testdata/origin-host-corpus.csv` (cột test_case_id khớp ID bên dưới).

### 2.1 Nhóm extract — `extractGateHeaders` (5 case)

| ID | Input (rawHeaders) | Expected Result | Requirement | Priority |
|----|--------------------|-----------------|-------------|----------|
| UT-01 | `Origin=http://x.com`, `Host=127.0.0.1:9181` (single pair mỗi key) | `{origin:"http://x.com", host:"127.0.0.1:9181", duplicateOrigin:false, duplicateHost:false}` | FR-12, G-2 | P3 |
| UT-02 | 2 cặp `Origin` (a, b) + Host | `duplicateOrigin: true` (origin = giá trị sau cùng — nhưng gate sẽ deny, không first-wins ở mức evaluate) | R-6, FR-12 | P3 |
| UT-03 | 2 cặp `Host` + Origin | `duplicateHost: true` (request-smuggling surface — fail-closed) | FR-12, R-6 | P3 |
| UT-04 | `ORIGIN=a`, `origin=b` (key casing khác nhau) | 2 value được gom qua key compare lowercase → `duplicateOrigin: true` | C-3, FR-12 | P3 |
| UT-05 | `[]` (rỗng) và `["Origin"]` (odd length) | `origin: undefined, host: undefined`, duplicate flags false, **KHÔNG throw** (loop guard `i+1 < length`) | G-1, E-5 | P3 |

### 2.2 Nhóm no-Origin (3 case — BR-06)

| ID | Input | Expected Result | Requirement | Priority |
|----|-------|-----------------|-------------|----------|
| UT-06 | `Host=127.0.0.1:9181` (không Origin) | `PASS {ok:true, echoOrigin:null}` — KHÔNG Host check chặt, KHÔNG CORS (BR-06) | FR-02a, BR-06 | P1 |
| UT-07 | `Origin=""` + Host | `PASS {ok:true, echoOrigin:null}` — Origin rỗng sau trim = no-Origin | FR-02a, BR-06 | P1 |
| UT-08 | `Origin="   "` (whitespace) + Host | `PASS {ok:true, echoOrigin:null}` — trim về rỗng | FR-02a, BR-06 | P1 |

### 2.3 Nhóm malformed (7 case — FR-12 fail-closed)

| ID | Input (Origin value, listenPort=9181) | Expected Result | Requirement | Priority |
|----|----------------------------------------|-----------------|-------------|----------|
| UT-09 | `%%` | `DENY {reason:"malformed-origin", originSanitized:"%%"}` — `new URL` throw | FR-12, G-1 | P1 |
| UT-10 | `null` (literal) | `DENY malformed-origin` — URL throw | FR-12 | P1 |
| UT-11 | `file://x` | `DENY` (reason `origin-not-allowed` hoặc `malformed-origin` — assert CHỈ `ok:false`, KHÔNG pass) | FR-12, BR-02 | P1 |
| UT-12 | `localhost:3000` (thiếu scheme → scheme-only, hostname rỗng) | `DENY malformed-origin` (P3c — không phải catch path) | FR-12 | P1 |
| UT-13 | `http://a.com,http://b.com` (chứa comma) | `DENY malformed-origin` (P3a dual-check chống Node join semantics) | FR-12, C-3 | P1 |
| UT-14 | Duplicate Origin qua 2 cặp rawHeaders (`vscode-webview://abc` + `https://evil.com`, 1 giá trị hợp lệ) | `DENY malformed-origin` — **KHÔNG first-wins** (AD-2: reject dù 1 trong 2 hợp lệ) | FR-12, R-6, AD-2 | P1 |
| UT-15 | `vscode-webview://abc:9181` (opaque host chứa ":") | `DENY malformed-origin` — URL constructor throw (P3b) | FR-12 | P1 |

### 2.4 Nhóm allowlist match (10 case — FR-03/BR-02/G-8)

| ID | Input (Origin + Host OK = `127.0.0.1:9181`, listenPort=9181) | Expected Result | Requirement | Priority |
|----|--------------------------------------------------------|-----------------|-------------|----------|
| UT-16 | `vscode-webview://abc123` | `PASS {echoOrigin:"vscode-webview://abc123"}` — echo **RAW** (G-4, không `url.origin`) | FR-03, G-4 | P1 |
| UT-17 | `http://localhost:3000` (port Origin ≠ listenPort — chỉ Host check dùng listenPort) | `PASS {echoOrigin:"http://localhost:3000"}` | FR-03 | P1 |
| UT-18 | `https://localhost:8443` | `PASS` (pattern https+localhost trong allowlist) | FR-03 | P1 |
| UT-19 | `http://127.0.0.1:5173` | `PASS` (pattern http+127.0.0.1) | FR-03 | P1 |
| UT-20 | `HTTPS://LOCALHOST:3000` (casing) | `PASS {echoOrigin:"HTTPS://LOCALHOST:3000"}` — so khớp fold lowercase (G-8), echo giữ RAW | FR-03, G-8 | P1 |
| UT-21 | `http://localhost.evil.com:3000` | `DENY origin-not-allowed` — exact set membership, KHÔNG substring (BR-02) | BR-02 | P1 |
| UT-22 | `https://127.0.0.1:8443` | `DENY origin-not-allowed` — https+127.0.0.1 KHÔNG trong FR-03 (chủ đích BRD) | FR-03 | P1 |
| UT-23 | `http://localhost.` (trailing dot) | `DENY origin-not-allowed` — không DNS-normalize (documented edge) | FR-12, G-8 | P1 |
| UT-24 | `http://[::1]:3000` (origin IPv6) | `DENY origin-not-allowed` — hostname `::1` ∉ allowlist (R-1 candidate) | FR-03 | P1 |
| UT-25 | `http://localhost:3000/evil` (có path) | `PASS {echoOrigin:"http://localhost:3000/evil"}` — hostname match; path ignored; echo nguyên value (G-4) | FR-03, G-4 | P1 |

### 2.5 Nhóm host-check khi có Origin (6 case — FR-04/BR-03)

| ID | Input (Origin hợp lệ + Host, listenPort=9181) | Expected Result | Requirement | Priority |
|----|--------------------------------------------|-----------------|-------------|----------|
| UT-26 | `vscode-webview://abc` + `Host=attacker.com:9181` | `DENY {reason:"host-mismatch"}` — DNS rebinding (UC-05) | FR-04, BR-03 | P1 |
| UT-27 | `vscode-webview://abc` + `Host=127.0.0.1:9182` (port = listen+1) | `DENY host-mismatch` — port so CHÍNH XÁC listenPort (G-7: không hardcode 9181) | FR-04, BR-03, G-7 | P1 |
| UT-28 | `vscode-webview://abc` + KHÔNG Host | `DENY host-mismatch` — fail-closed khi có Origin thiếu Host (EF-1 UC-05, HTTP/1.0) | FR-04, EF-1 UC-05 | P1 |
| UT-29 | `vscode-webview://abc` + `Host=[::1]:9181` | `DENY host-mismatch` — IPv6 literal (P5b; bind 127.0.0.1 → ::1 không chạm được server) | FR-04 | P1 |
| UT-30 | `vscode-webview://abc` + `Host=127.0.0.1:abc` (và variant `Host=127.0.0.1:`) | `DENY host-mismatch` — port không match `/^\d+$/` | FR-04 | P1 |
| UT-31 | `http://localhost:3000` + `Host=LOCALHOST:9181`; variant `Host=127.0.0.1:09181` | `PASS` cả 2 — hostname fold lowercase; port numeric `parseInt` (`:09181` === 9181, G-8) | FR-04, G-8 | P1 |

---
### 2.6 Nhóm SEC-358-01 Option A — Host check áp MỌI request có Host (3 case — H-7/H-8/H-9 per SECURITY-REVIEW.md remediation)

**Context:** Security review v1.0 phát hiện DNS rebinding same-origin qua nhánh no-Origin (GET /mcp SSE, /health — browser KHÔNG gắn Origin cho same-origin GET sau rebind → Host `evil.com:9181` đi lọt). SM chốt **Option A**: Host check chạy ở Phase 1.5 cho MỌI request có Host; chỉ no-Origin + Host thiếu (HTTP/1.0) được pass. Ba test case dưới đây là **remediation tests chính thức** — điều kiện merge #4 (H-7/H-8/H-9 PASS).

---

### UT-32 (H-7): no-Origin + Host attacker.com → DENY host-mismatch (rebinding same-origin)

| Field | Value |
|-------|-------|
| **ID** | UT-32 |
| **Priority** | High (P1) |
| **Type** | Unit — Security (SEC-358-01 remediation) |
| **Requirement** | SEC-358-01, FR-04, BR-03, I-8 (AC-5) |
| **Preconditions** | `OriginGate.ts` có Phase 1.5 (Host-check-mọi-request-có-Host — Option A implemented); SA sign-off contract change FR-04/BR-06 |

**Objective:** Request KHÔNG Origin nhưng Host = domain attacker (kịch bản DNS rebinding same-origin thực tế nhất) phải bị DENY — đóng gap SEC-358-01.

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `evaluateOriginGate(H(["Host","attacker.com:9181"]), 9181)` | Trả result |
| 2 | Assert `ok === false` | KHÔNG pass — Host check chạy DÙ không có Origin (I-8) |
| 3 | Assert `reason === "host-mismatch"`, `originSanitized === ""`, `hostSanitized === "attacker.com:9181"` | Đúng deny payload + sanitized |

**Test Data:** `testdata/origin-host-corpus.csv` row UT-32
**Postconditions:** Property-level counterpart: PBT-04; integration counterparts: IT-12 (raw socket), IT-13 row 1b, E2E-API-04 live vector LH-13

---

### UT-33 (H-8): no-Origin + Host loopback đúng port → PASS (native không bị chặn oan)

| Field | Value |
|-------|-------|
| **ID** | UT-33 |
| **Priority** | High (P1) |
| **Type** | Unit — Security (SEC-358-01 remediation — zero-breakage proof) |
| **Requirement** | SEC-358-01, FR-04, I-8, BR-06 (AC-4, AC-5) |
| **Preconditions** | Như UT-32 |

**Objective:** Option A KHÔNG phá native client: no-Origin + Host `127.0.0.1:<listenPort>` (hoặc `localhost:<listenPort>`) vẫn PASS — native MCP client (HTTP/1.1, undici/fetch) luôn gửi Host loopback đúng → zero breakage.

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `evaluateOriginGate(H(["Host","127.0.0.1:9181"]), 9181)` | `PASS {ok:true, echoOrigin:null}` |
| 2 | Variant `Host=localhost:9181` | `PASS {ok:true, echoOrigin:null}` |
| 3 | Variant `Host=LOCALHOST:9181` (case-fold) | `PASS` (G-8 hostname fold áp cả nhánh no-Origin) |

**Test Data:** `testdata/origin-host-corpus.csv` row UT-33
**Postconditions:** Tie-in IT-03 (native POST qua server thật), E2E-API-02 (V-1b live session), V-3 header capture (chứng minh Host thật của client = loopback)

---

### UT-34 (H-9): no-Origin + KHÔNG Host (HTTP/1.0 legacy) → PASS

| Field | Value |
|-------|-------|
| **ID** | UT-34 |
| **Priority** | High (P1) |
| **Type** | Unit — Security (SEC-358-01 remediation — legacy carve-out) |
| **Requirement** | SEC-358-01, FR-04, I-8 (AC-4) |
| **Preconditions** | Như UT-32 |

**Objective:** Host thiếu CHỈ được pass khi request no-Origin (HTTP/1.0 legacy per remediation Option A: "host == '' → defer: pass chỉ khi no-Origin"). Có-Origin + Host thiếu vẫn DENY (UT-28 giữ nguyên).

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `evaluateOriginGate(H([]), 9181)` — không Origin, không Host | `PASS {ok:true, echoOrigin:null}` |
| 2 | Variant `Host=""` (header rỗng sau trim) | `PASS {ok:true, echoOrigin:null}` — trim về rỗng = absent |
| 3 | Đối chiếu UT-28: có Origin + không Host | `DENY host-mismatch` (fail-closed giữ nguyên — không regression EF-1) |

**Test Data:** `testdata/origin-host-corpus.csv` row UT-34
**Postconditions:** Carve-out H-9 được assert riêng — chống regression "Host check deny cả HTTP/1.0"

---

### 2.7 Nhóm robustness (4 case)

| ID | Input | Expected Result | Requirement | Priority |
|----|-------|-----------------|-------------|----------|
| UT-35 | `Origin="https://evil.com\r\nX-Injected: 1\0more"` + `Host="localhost\r\n:9181"` | `DENY malformed-origin`; `originSanitized`/`hostSanitized` KHÔNG chứa `\r`/`\n`/`\0` — tất cả thành `?` (sanitize BÊN TRONG gate — G-3) | G-3, BR-04, R-4 | P2 |
| UT-36 | `vscode-webview://abc` + `Host=127.0.0.1:9181`, **listenPort=0** | `DENY host-mismatch` — effectivePort 9181 ≠ 0 → fail-closed (AD-7 defensive: port null/0 → mọi Host check fail) | BR-01, AD-7 | P3 |
| UT-37 | `Origin="javascript:alert(1)"` + Host OK | `DENY` (reason `origin-not-allowed` — scheme không trong allowlist; KHÔNG pass; không throw) | BR-02, G-1 | P3 |
| UT-38 | Fuzz: 100 rawHeaders arrays ngẫu nhiên (odd-length, control chars, unicode, key casing trộn) | `expect(() => evaluateOriginGate(...)).not.toThrow()` cho từng input + result luôn có property `ok` | G-1, FR-12 | P2 |

### 2.8 Case optional — SEC-358-05 defense-in-depth (1 case — điều kiện thực thi trong Preconditions)

### UT-39 (OPTIONAL — SEC-358-05): Origin chứa [\t\n\r\f\v] → DENY trước `new URL`

| Field | Value |
|-------|-------|
| **ID** | UT-39 |
| **Priority** | Low (P3 — optional, Info finding design-accepted) |
| **Type** | Unit — Security (defense-in-depth optional) |
| **Requirement** | SEC-358-05 (SECURITY-REVIEW.md v1.0 — Info), G-1, BR-01 |
| **Preconditions** | **Điều kiện thực thi (pre-agree với BA review Gap-4):** case này CHỈ là bắt-buộc nếu DEV implement optional defense — guard `Origin.match(/[\t\n\r\f\v]/)` → DENY TRƯỚC `new URL` (~1 dòng trong `OriginGate.ts`, khuyến nghị mục 4 SECURITY-REVIEW.md). Nếu DEV **không** implement → **SKIP hợp lệ**: đánh dấu `SKIPPED` trong TEST-REPORT với note "SEC-358-05 optional defense không implement — accepted risk documented"; KHÔNG tính fail, KHÔNG chặn merge (mitigation chính thức của vector này là OI-1 shared-secret — follow-up ticket) |

**Objective:** WHATWG URL strip `\t\n\r` trong Origin value (`"local\thost"` → `"localhost"`) — browser không bao giờ serialize Origin dạng này nên không phải bypass thực tế, nhưng non-browser có thể forge. Defense-in-depth: deny sớm TRƯỚC `new URL` để giá trị forged không qua URL parsing (SEC-358-05 ghi chú kỹ thuật phụ).

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Grep guard control chars trong `OriginGate.ts` (pattern `/[\t\n\r\f\v]/` trước lời gọi `new URL`) | Có guard → chạy step 2-3; không có → **SKIP** (đánh dấu SKIPPED + note điều kiện) |
| 2 | `evaluateOriginGate(H("vscode-webview://a\tb"), 9181)` + variants `\n` `\r` `\f` `\v` trong Origin value | `DENY` mỗi variant — KHÔNG pass, KHÔNG throw (G-1 — reason từ enum hiện có, không thêm giá trị mới) |
| 3 | Variant Origin hợp lệ KHÔNG control chars (dùng lại input UT-16) | Vẫn `PASS` + echo EXACT — guard không chặn oan (zero false positive) |

**Test Data:** `testdata/origin-host-corpus.csv` row UT-39
**Postconditions:** Nếu implement → SEC-358-05 optional defense verified mức pure-function; nếu SKIP → risk đã documented (SEC-358-05 design-accepted), OI-1 shared-secret là mitigation thật

---
## 3. Integration Tests (IT) — WrapperServer server-thật, matrix T1..T14 (mức 2)

**Common objective:** verify gate wired đúng trong `handleRequest` (FR-01 — TRƯỚC mọi route + mọi setHeader) trên server Node http thật.
**Common preconditions:** C3 (wire WrapperServer) + C4 (4 helpers mới) + C5 (matrix trong `wrapper-server.test.ts` describe `"SA4E-358 Origin Gate (T1..T14)"`); `createTestServer()` + `server.start(0)` → port ngẫu nhiên `{listen_port}` (G-7); deps mock (`restCallToolMock`, capturing outputChannel).
**Common asserts cho mọi DENY case:** DENY_SHAPE (403 + `{"error":"Forbidden"}` + Content-Type json + zero `access-control-*` qua `assertNoAccessControlHeaders` + 1 dòng log đúng format) + `restCallToolMock.calls.length === 0`.
**Test data:** `testdata/integration-matrix.csv` (row per case); IT-13 dùng thêm `testdata/preflight-matrix.csv`.

---

### IT-01 (T1): POST /mcp Origin evil — deny đầy đủ trước handleMcp

| Field | Value |
|-------|-------|
| **ID** | IT-01 (TDD T1) |
| **Priority** | High (P1) |
| **Type** | Integration — Security |
| **Requirement** | FR-01, FR-02c, FR-05, FR-08, FR-09 (AC-1, AC-8) |
| **Preconditions** | Server listen `{listen_port}`; capturing outputChannel gắn vào deps |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `requestWithHeaders(port, {method:"POST", path:"/mcp", headers:{Origin:"https://evil.com", Host:"127.0.0.1:{listen_port}"}, body: JSON-RPC tools/call hợp lệ})` | `status === 403` |
| 2 | `assertNoAccessControlHeaders(res.headers)` | 0 key bắt đầu `access-control-` (I-2) |
| 3 | Assert `body === '{"error":"Forbidden"}'` + `Content-Type === application/json` | DENY_SHAPE đúng (FR-08) |
| 4 | Assert `restCallToolMock.calls.length === 0` | Tool KHÔNG thực thi — deny trước handleMcp (AC-1, BO-2) |
| 5 | Assert `outputChannel.lines` chứa 1 dòng khớp `\[WrapperServer\] Denied request — reason=origin-not-allowed origin=https://evil\.com .* \(POST /mcp\)` | Log format §7.3 đúng, đúng 1 dòng/deny (FR-09) |

**Test Data:** integration-matrix.csv IT-01
**Postconditions:** Server vẫn sống — IT-10 assert tiếp request xử lý được

---

### IT-02 (T2): OPTIONS preflight Origin evil — 403 (KHÔNG 204), không Allow-*

| Field | Value |
|-------|-------|
| **ID** | IT-02 (TDD T2) |
| **Priority** | High (P1) |
| **Type** | Integration — Security |
| **Requirement** | FR-01, FR-06, FR-08 (AC-1) — P6-16 đóng |
| **Preconditions** | Như IT-01 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `requestWithHeaders(port, {method:"OPTIONS", path:"/mcp", headers:{Origin:"https://evil.com", "Access-Control-Request-Method":"POST", "Access-Control-Request-Headers":"Content-Type", Host:"127.0.0.1:{listen_port}"}})` | `status === 403` (KHÔNG 204 — preflight fail) |
| 2 | `assertNoAccessControlHeaders(res.headers)` | KHÔNG ACAO, KHÔNG Allow-Methods, KHÔNG Allow-Headers (FR-06) |
| 3 | Assert body DENY_SHAPE + log `reason=origin-not-allowed` | Như IT-01 steps 3, 5 |

**Test Data:** integration-matrix.csv IT-02
**Postconditions:** Browser không gửi POST thật sau preflight fail (UC-01 step 6)

---

### IT-03 (T3): POST /mcp no-Origin native — pass-through zero regression

| Field | Value |
|-------|-------|
| **ID** | IT-03 (TDD T3) |
| **Priority** | High (P1) |
| **Type** | Integration — Regression |
| **Requirement** | FR-02a, FR-10, BR-06, BR-08 (AC-4) + SEC-358-01 (Host loopback vẫn pass sau Option A) |
| **Preconditions** | Server + mock deps; regression suites TC-22..TC-31, TC-37 chạy cùng file |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `requestWithHeaders(port, {method:"POST", path:"/mcp", headers:{Host:"127.0.0.1:{listen_port}"}, body: initialize})` | `200` + protocol negotiation đúng (:170-182 — byte-semantic hiện trạng) |
| 2 | Tuần tự `notifications/initialized` → `tools/list` → `tools/call` | 202 / 200 (+schema rewrite) / 200 (+envelope SA4E-356) — semantics không đổi |
| 3 | Assert KHÔNG header nào bắt đầu `access-control-` trên MỌI response | Zero CORS cho native (G-5) — **KHÔNG assert ACAO** (TA clarify FSD §3.1.6.1-E: native không parse CORS) |
| 4 | Assert `restCallToolMock.calls.length === 3` | Tool thực thi bình thường — không bị Option A chặn oan (Host loopback đúng — UT-33 counterpart) |
| 5 | Assert `outputChannel.lines` KHÔNG có dòng `Denied` cho session này | Allowed không log (FSD §7.3) |

**Test Data:** integration-matrix.csv IT-03
**Postconditions:** Full regression pass là điều kiện mở security review (TDD §8.5)

---

### IT-04 (T4): OPTIONS preflight webview — 204 + echo EXACT + Allow-* + Vary: Origin

| Field | Value |
|-------|-------|
| **ID** | IT-04 (TDD T4) |
| **Priority** | High (P1) |
| **Type** | Integration — Functional |
| **Requirement** | FR-03, FR-06, G-4, G-5 (AC-2) + SEC-358-03 (Vary: Origin) |
| **Preconditions** | Server + mock deps |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `requestWithHeaders(port, {method:"OPTIONS", path:"/mcp", headers:{Origin:"vscode-webview://abc123", Host:"127.0.0.1:{listen_port}"}})` | `status === 204` |
| 2 | Assert `res.headers["access-control-allow-origin"] === "vscode-webview://abc123"` | Echo **EXACT** RAW value (G-4 — KHÔNG `url.origin` = "null") |
| 3 | Assert Allow-Methods === `"GET, POST, OPTIONS"`, Allow-Headers === `"Content-Type"` | FR-06 |
| 4 | Assert `res.headers["vary"] === "Origin"` (assert mềm — **should**): nếu DEV chưa thêm Vary theo SEC-358-03 → ghi nhận defect **Minor**, không chặn merge | SEC-358-03 (Informational) |
| 5 | Assert KHÔNG có chữ `*` trong bất kỳ access-control header nào | BR-07 — echo-only, không wildcard |

**Test Data:** integration-matrix.csv IT-04
**Postconditions:** Webview đọc được response sau này (AC-2)

---

### IT-05 (T5): POST /mcp localhost — pass + echo + tool thực thi

| Field | Value |
|-------|-------|
| **ID** | IT-05 (TDD T5) |
| **Priority** | High (P1) |
| **Type** | Integration — Functional |
| **Requirement** | FR-02b, FR-03, FR-04 (AC-2) |
| **Preconditions** | Server + mock deps |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `requestWithHeaders(port, {method:"POST", path:"/mcp", headers:{Origin:"http://localhost:3000", Host:"localhost:{listen_port}"}, body: tools/call})` | `200` + JSON-RPC result đúng |
| 2 | Assert ACAO echo === `http://localhost:3000` (EXACT) + `restCallToolMock.calls.length === 1` | Echo đúng + tool thực thi (Origin port ≠ listenPort vẫn hợp lệ — FR-03 mọi port) |
| 3 | Variant `Origin: http://127.0.0.1:5173` + `Host: 127.0.0.1:{listen_port}` | `200` + echo (AF-1 UC-03 — Vite dev server) |

**Test Data:** integration-matrix.csv IT-05
**Postconditions:** UC-03 pass

---

### IT-06 (T6): Host variants khi có Origin — DNS rebinding chặn cả 4 + precedence

| Field | Value |
|-------|-------|
| **ID** | IT-06 (TDD T6) |
| **Priority** | High (P1) |
| **Type** | Integration — Security |
| **Requirement** | FR-04, BR-03, BR-05, G-7 (AC-5) |
| **Preconditions** | Server trên port **NGẪU NHIÊN** (chứng minh không hardcode 9181 — G-7); mock deps |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST /mcp + `Origin: vscode-webview://abc` + `Host: attacker.com:{listen_port}` | `403` + log `reason=host-mismatch` |
| 2 | Variant `Host: 127.0.0.1:{listen_port + 1}` (port sai) | `403 host-mismatch` — port chính xác với port listen THẬT |
| 3 | Variant KHÔNG gửi Host (HTTP/1.0-style) — **ghi chú kỹ thuật:** Node `http.request` tự gắn header `Host` mặc định → omit thật sự KHÔNG thể qua `requestWithHeaders`; phải dùng `sendRawRequest` (raw `net.connect` — helper C4, pattern IT-12) để gửi request không có Host | `403 host-mismatch` (EF-1 UC-05 — fail-closed) — expected KHÔNG đổi kể cả khi dùng raw socket |
| 4 | Variant `Host: [::1]:{listen_port}` | `403 host-mismatch` (IPv6 literal) |
| 5 | Variant precedence: `Origin: https://evil.com` + `Host: attacker.com:{listen_port}` (CẢ HAI fail) | `403` + log `reason=host-mismatch` — **Host reason thắng**: Phase 1.5 (P1.5) Host-validate chạy TRƯỚC allowlist check → deny đầu tiên định reason (TDD v1.1 §3.3 precedence decisions; FSD v1.2 BR-05). **Sync A1 (TA review it. 1):** v1.0 ghi `origin-not-allowed` — stale v1.0 leftover; code đã assert `host-mismatch` đúng theo TDD (evidence test-run-summary.md deviation #4). Khác biệt chỉ nằm trong deny LOG — reason không leak vào response (TDD §7.1) |
| 6 | Với từng variant: `assertNoAccessControlHeaders` + `restCallToolMock.calls.length === 0` | DENY_SHAPE đủ + tool không thực thi |

**Test Data:** integration-matrix.csv IT-06
**Postconditions:** UC-05 pass cả main + precedence

---

### IT-07 (T7): GET /mcp SSE Origin lạ — 403 TRƯỚC stream mở

| Field | Value |
|-------|-------|
| **ID** | IT-07 (TDD T7) |
| **Priority** | High (P1) |
| **Type** | Integration — Security |
| **Requirement** | FR-01, FR-07 (AC-6) — P6-17 đóng |
| **Preconditions** | Server + mock deps; C-4 (403 phải đi ra trước khi 1 byte SSE nào được write) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `requestWithHeaders(port, {method:"GET", path:"/mcp", headers:{Origin:"https://evil.com", Host:"127.0.0.1:{listen_port}"}})` | `status === 403` — KHÔNG 200 |
| 2 | `assertNoAccessControlHeaders(res.headers)` + assert `body` KHÔNG chứa `event:` / `text/event-stream` | Zero CORS + KHÔNG byte SSE nào rò ra (P6-17 đóng) |
| 3 | Nhánh allowed: `openSse()` hiện có với caller pass (no-Origin) | Stream mở như hiện trạng — keep-alive 15s nguyên vẹn (FR-10) |
| 4 | Assert log `reason=origin-not-allowed` cho step 1 | Deny log đúng |

**Test Data:** integration-matrix.csv IT-07
**Postconditions:** UC-06 EF-1 pass

---
### IT-08 (T8): Bind address invariant 127.0.0.1 (AC-7)

| Field | Value |
|-------|-------|
| **ID** | IT-08 (TDD T8, C10) |
| **Priority** | Medium (P2) |
| **Type** | Integration — Invariant |
| **Requirement** | FR-11 (AC-7, BR-08) |
| **Preconditions** | `createTestServer()` + `server.start(0)` |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Sau `start(0)`, introspect `srv.address()` (qua accessor hiện có) | `address() === "127.0.0.1"` — bind loopback giữ nguyên, KHÔNG code change (FR-11) |
| 2 | Assert `port === {listen_port}` thực tế (AddressInfo) | `this.port` lưu đúng :99 — nguồn cho gate listenPort (I-6) |

**Test Data:** integration-matrix.csv IT-08
**Postconditions:** Chặn hồi quy âm thầm về 0.0.0.0 (BRD Story 3 Req 4)

---

### IT-09 (T9): Deny log sanitized — anti log-forging trên log thật

| Field | Value |
|-------|-------|
| **ID** | IT-09 (TDD T9) |
| **Priority** | High (P2) |
| **Type** | Integration — Security |
| **Requirement** | FR-09, BR-04, G-3 (R-4) |
| **Preconditions** | Capturing outputChannel trong deps; server + mock deps |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `requestWithHeaders(port, {method:"POST", path:"/mcp", headers:{Origin:"https://evil.com\r\nX-Injected: 1\0more", Host:"localhost\r\n:9181"}})` | `403` (deny — malformed) |
| 2 | Assert DENY_SHAPE: `body === '{"error":"Forbidden"}'` sạch, không header lạ | Response KHÔNG echo attacker header (FR-08) |
| 3 | Assert MỌI dòng trong `outputChannel.lines` KHÔNG chứa `\r`, `\n`, `\0` — tất cả thay bằng `?` | G-3 sanitize BÊN TRONG gate — log forging bất khả thi (R-4 đóng) |

**Test Data:** integration-matrix.csv IT-09
**Postconditions:** Node llhttp chặn CR/LF trong header value; gate sanitize là lớp thứ 2 — cả 2 lớp được chứng minh

---

### IT-10 (T10): Malformed Origin matrix — fail-closed, không crash

| Field | Value |
|-------|-------|
| **ID** | IT-10 (TDD T10) |
| **Priority** | High (P1) |
| **Type** | Integration — Security/Reliability |
| **Requirement** | FR-12, G-6, BR-01 (AC-1, NFR Reliability) |
| **Preconditions** | Server + mock deps; chạy TRƯỚC IT-11 (dùng chung server instance trong describe) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST /mcp lần lượt với Origin: `%%` / `"   "` / `http://a.com,http://b.com` / duplicate Origin 2 cặp (rawHeaders) / `localhost:3000` (thiếu scheme) | `403` + log `reason=malformed-origin` cho từng case (duplicate → deny DÙ 1 giá trị hợp lệ — KHÔNG first-wins) |
| 2 | Case `Origin: ""` (empty sau trim) | KHÔNG 403 — rơi nhánh no-Origin PASS (assert riêng: behavior = hiện trạng theo method) |
| 3 | Sau toàn bộ malformed inputs: GET `/health` (no-Origin) | `200` `{"status":"ok","mode":"wrapper"}` — **server không crash**, request kế tiếp xử lý được (FR-12) |

**Test Data:** integration-matrix.csv IT-10
**Postconditions:** Không exception thoát handleRequest; error handler :138-143 vẫn là chốt chặn cuối

---

### IT-11 (T11): Zero-CORS sweep — 5 route × 3 nhánh = 15 responses (assert systematic AC-8)

| Field | Value |
|-------|-------|
| **ID** | IT-11 (TDD T11) |
| **Priority** | High (P1) |
| **Type** | Integration — Security sweep |
| **Requirement** | FR-05, FR-07, G-5, BR-07 (AC-8) |
| **Preconditions** | Server + mock deps; bảng G-5 (TDD §7.4) là oracle |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Với MỖI route ∈ {GET /health, GET /mcp, POST /mcp, OPTIONS /mcp, GET /nonexistent} × nhánh evil (`Origin: https://evil.com`) | `403` + `assertNoAccessControlHeaders` — **mọi route kể cả /nonexistent** (403 uniform, không leak route map — AD-3) |
| 2 | × nhánh webview (`Origin: vscode-webview://abc123` + Host OK) | ACAO echo === Origin trên MỌI status (200/204/404 — G-5 echo uniform kể cả 404 fallback) + Allow-* đồng bộ |
| 3 | × nhánh no-Origin (Host: 127.0.0.1:{listen_port}) | Zero CORS headers + behavior hiện trạng (200/204/404 như cũ — KHÔNG assert ACAO) |
| 4 | Ghi kết quả 15/15 vào evidence | Bảng G-5 khớp 15/15 ô — AC-8 systematic |

**Test Data:** integration-matrix.csv IT-11
**Postconditions:** "Không còn ACAO `*` ở bất kỳ response nào" được chứng minh runtime (điều kiện merge #6)

---

### IT-12 (T12): Raw-socket duplicate header + variant no-Origin Host-evil (SEC-358-01)

| Field | Value |
|-------|-------|
| **ID** | IT-12 (TDD T12) |
| **Priority** | High (P1) |
| **Type** | Integration — Security (raw socket) |
| **Requirement** | FR-12, R-6, I-4, SEC-358-01, I-8 |
| **Preconditions** | Helper `sendRawRequest` (C4); server + mock deps |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `sendRawRequest(port, "POST /mcp HTTP/1.1\r\nHost: 127.0.0.1:{listen_port}\r\nOrigin: vscode-webview://abc\r\nOrigin: https://evil.com\r\n...")` — duplicate `Origin:` 2 dòng (client API chuẩn không gửi được) | `403` + log `reason=malformed-origin` — **KHÔNG first-wins** (rawHeaders version-independent — C-3/I-4) |
| 2 | Variant duplicate `Host:` 2 dòng | `403` + `reason=host-mismatch` (request-smuggling fail-closed) |
| 3 | Variant key `origin:` lowercase | Vẫn detect + deny đúng reason (key compare lowercase) |
| 4 | **Variant SEC-358-01:** raw request KHÔNG Origin + `Host: attacker.com:{listen_port}` | `403` + `reason=host-mismatch` — Host-check-mọi-request qua raw socket thật (I-8; H-7 integration counterpart) |
| 5 | Với từng response: assert DENY_SHAPE + `restCallToolMock.calls.length === 0` | Không bypass |

**Test Data:** integration-matrix.csv IT-12
**Postconditions:** Node http duplicate semantics không ảnh hưởng gate trên MỌI version

---

### IT-13 (T13): Preflight matrix — 7 origin/host rows × ACAM có/không = 14 responses

| Field | Value |
|-------|-------|
| **ID** | IT-13 (TDD T13) |
| **Priority** | High (P1) |
| **Type** | Integration — Functional matrix |
| **Requirement** | UC-07, FR-04, FR-06, FR-12, SEC-358-01 (AC-1, AC-2, AC-5) |
| **Preconditions** | Server + mock deps; oracle = `testdata/preflight-matrix.csv` |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | OPTIONS /mcp × 7 rows (1a no-Origin+Host loopback; **1b no-Origin+Host attacker — Option A**; 2 webview+Host ok; 3 localhost+Host ok; 4 evil; 5 webview+Host evil; 6 `%%`) × ACAM present/absent | Row 1a → `204` bare không ACAO (AD-8); **Row 1b → `403` `host-mismatch`** (SEC-358-01 — Origin pass KHÔNG cần thiết để Host chặn); Row 2, 3 → `204` + echo + Allow-*; Row 4 → `403` zero CORS; Row 5 → `403` `host-mismatch` (FR-04 — UC-07 row 5); Row 6 → `403` `malformed-origin` |
| 2 | Assert ACAM có/không KHÔNG đổi kết quả | Gate không đọc ACAM (§3.1.4.2) — 14/14 responses khớp CSV |
| 3 | Assert row 5: Origin `vscode-webview://abc` PASS ở Phase 4 nhưng Host evil → deny | "Origin pass KHÔNG đủ" — Host là lớp xác nhận độc lập (FR-04) |

**Test Data:** testdata/preflight-matrix.csv (14 rows) + integration-matrix.csv IT-13
**Postconditions:** UC-07 matrix đầy đủ incl. Option A row 1b

---

### IT-14 (T14): Bench — gate overhead p99 < 1ms (NFR)

| Field | Value |
|-------|-------|
| **ID** | IT-14 (TDD T14, C7) |
| **Priority** | Medium (P2) |
| **Type** | Integration — Performance (on-demand trước security review, không trong CI mặc định — FSD §8.1) |
| **Requirement** | NFR <1ms (FSD §8.1, TDD §9) — điều kiện merge #5 |
| **Preconditions** | `bench-gate.ts` (C7); warmup 10⁴; đo 10⁶ lần/class |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Micro bench `evaluateOriginGate` × 4 input class (no-Origin, allowed webview, denied evil, malformed) qua `process.hrtime.bigint()` | p50/p95/p99 per class; **p99 < 1ms** mọi class (kỳ vọng thực tế < 10µs) |
| 2 | E2E: server `start(0)`, 10⁴ request `GET /health` sequential sau-fix vs baseline | **delta median < 1ms** (kỳ vọng < 0.1ms) |
| 3 | Ghi `testdata/bench-results.csv` (input_class, p50_ns, p95_ns, p99_ns, e2e_delta_median_ms) | Evidence cho security review AC-3 (điều kiện merge #5) |

**Test Data:** integration-matrix.csv IT-14; pre-seeded-data.csv PS-17
**Postconditions:** KHÔNG tối ưu hóa sớm; caching decision TỪ CHỐI (AD-9)

---
## 4. E2E-API Tests — Live harness trên server thật :9181 (extension dev host, không mock transport)

**Common objective:** tái hiện finding SA-01 (red — optional, có baseline P6-15/16/17) và chứng minh fix (green — bắt buộc) trên HTTP server thật của extension host, đúng pattern `documents/SA4E-356/testdata/pentest-harness.ts` (Row/Verdict bookkeeping `rec()/check()`, self-cleaning tmp).
**Common preconditions:** Extension dev host chạy thật, wrapper listen `127.0.0.1:9181` (config `sdlcAgents.mcpServerPort`); harness script `documents/SA4E-358/testdata/cors-pentest-harness.ts` (C8); chạy `npx tsx documents/SA4E-358/testdata/cors-pentest-harness.ts`.
**Common output:** evidence CSV `documents/SA4E-358/testdata/pentest-results.csv` (columns: id, vector, payload, expected, actual, verdict).
**Test data:** `testdata/live-harness-corpus.csv` (LH-01..16).
**Rule:** extension dev host không khả dụng → **BLOCK security review AC-3** (N-QA2 — QA không được skip).

---

### E2E-API-01: Live harness green — attacker vectors replay (P6-15/16/17 đóng)

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-01 |
| **Priority** | High (P1) |
| **Type** | Automated (tsx harness) |
| **File** | documents/SA4E-358/testdata/cors-pentest-harness.ts |
| **Traces To** | BRD Story 1 (AC-1, AC-6, AC-8); SA4E-356 P6-15/16/17 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | (Red — optional) Trên code cũ qua git-stash: GET /health + `Origin: https://evil.com` | 200 + ACAO `*` — tái hiện P6-15 (baseline có sẵn → skip được) |
| 2 | (Green) GET /health + `Origin: https://evil.com` | `403` + zero `access-control-*` (P6-15 closed — AC-8) |
| 3 | (Green) OPTIONS /mcp preflight evil + ACAM | `403` KHÔNG 204 (P6-16 closed — AC-1) |
| 4 | (Green) GET /mcp SSE + `Origin: https://evil.com` | `403`, KHÔNG byte SSE nào (P6-17 closed — AC-6) |
| 5 | (Green) POST /mcp tools/call evil | `403` + tool không thực thi (verify qua side-effect không xảy ra) |
| 6 | Ghi LH-01..04 + LH-09 vào `pentest-results.csv` | Verdict PASS toàn bộ |

**Test Data:** live-harness-corpus.csv LH-01..LH-04, LH-09
**Postconditions:** P6-15/16/17 chuyển closed; readback chặn (BO-1)

---

### E2E-API-02: Native client live session (V-1b runtime capture)

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-02 |
| **Priority** | High (P1) |
| **Type** | Automated (harness + client thật) |
| **File** | documents/SA4E-358/testdata/cors-pentest-harness.ts |
| **Traces To** | BRD Story 3 (AC-4); FSD §3.1.4.3 V-2/V-1b |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Chạy 1 session MCP ĐẦY ĐỦ bằng client thật (VS Code/Kiro MCP HTTP client): initialize → notifications/initialized → tools/list → tools/call → GET /mcp SSE | 100% flow pass — KHÔNG đổi config client (AC-4, FR-10) |
| 2 | Đọc deny log outputChannel sau session | KHÔNG có dòng `reason=origin-not-allowed` cho native client — **chính deny log là capture mechanism** (V-1b PASS condition) |
| 3 | Ghi LH-08 vào `pentest-results.csv` | Verdict PASS |

**Test Data:** live-harness-corpus.csv LH-08; Host client gửi phải = `127.0.0.1:9181`/`localhost:9181` (V-3 đã capture — nếu lệch → BR-10 xử lý)
**Postconditions:** V-1b evidence hoàn tất — input cho E2E-API-05 V-1c

---

### E2E-API-03: vscode-webview-sim live — preflight + POST + SSE với echo

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-03 |
| **Priority** | High (P1) |
| **Type** | Automated (harness) |
| **File** | documents/SA4E-358/testdata/cors-pentest-harness.ts |
| **Traces To** | BRD Story 2 (AC-2) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | OPTIONS /mcp + `Origin: vscode-webview://<id-thật-từ-V-3>` + Host đúng | `204` + ACAO echo EXACT + Allow-Methods/Headers |
| 2 | POST /mcp tools/call cùng Origin | `200` + ACAO echo + tool thực thi |
| 3 | GET /mcp SSE cùng Origin | `200 text/event-stream` — stream mở + keep-alive 15s |
| 4 | Ghi LH-05..07 vào `pentest-results.csv` | Verdict PASS |

**Test Data:** live-harness-corpus.csv LH-05..07; webview ID lấy từ V-3 capture (AF-1 UC-02 — pattern `*` khớp mọi ID)
**Postconditions:** AC-2 live-verified

---

### E2E-API-04: Live adversarial vectors — R-6 + SEC-358-01 DNS-rebind no-Origin

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-04 |
| **Priority** | High (P1) |
| **Type** | Automated (harness + raw socket) |
| **File** | documents/SA4E-358/testdata/cors-pentest-harness.ts |
| **Traces To** | BRD Story 4 Error Handling (R-6); SECURITY-REVIEW SEC-358-01 (AC-5); FR-12 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Raw socket: duplicate `Origin:` 2 dòng → :9181 | `403 malformed-origin` (KHÔNG first-wins — live) |
| 2 | Raw socket: duplicate `Host:` 2 dòng | `403 host-mismatch` |
| 3 | POST /mcp với key `origin:` lowercase | `403` — detect đúng (casing trick không bypass) |
| 4 | **Raw socket GET /mcp KHÔNG Origin + `Host: evil.com:9181`** (DNS-rebind same-origin — SEC-358-01) | `403` + log `reason=host-mismatch` — **vector rebinding no-Origin bị chặn LIVE (điều kiện merge #4)** |
| 5 | GET /health no-Origin + `Host: 0.0.0.0:9181`; variant `Host: 127.1:9181` | `403 host-mismatch` cả 2 (shorthand/0.0.0.0 không trong Host allowlist — không normalize trên Host path) |
| 6 | Ghi LH-10..15 vào `pentest-results.csv` | Verdict PASS toàn bộ; vector bypass mới (nếu có) → FINDING + fix trong ticket (BRD Story 4) |

**Test Data:** live-harness-corpus.csv LH-10..15
**Postconditions:** R-6 + SEC-358-01 fail-closed được chứng minh trên server thật

---

### E2E-API-05: V-1..V-4 evidence procedure — điều kiện merge (MANUAL)

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-05 |
| **Priority** | High (P1 — **blocker merge, OI-3/R-3**) |
| **Type** | **Manual** (client thật + dev host thật ngoài tầm với CI) — steps documented, tiêu chí PASS machine-checkable |
| **File** | documents/SA4E-358/testdata/cors-pentest-harness.ts + checklist testdata/v1-evidence-checklist.csv |
| **Traces To** | BRD A-1/R-3; FSD §3.1.4.3 + §3.1.4.3.1; TDD §11.7 C9; SECURITY-REVIEW khuyến nghị 6 |

**Objective:** Chứng minh giả định A-1 (native client không gửi Origin) trước merge — nếu sai, xử lý theo AF-2 UC-04 + BR-10 (thêm pattern allowlist), TUYỆT ĐỐI KHÔNG nới `*`.

**Test Steps (V-3 chạy ĐẦU TIÊN — security review khuyến nghị 6):**

| Step | Bước | Action | Expected Result (PASS criteria) |
|------|------|--------|--------------------------------|
| 0 | **V-3** | One-off header capture TRƯỚC khi enable gate: listener/proxy trên :9181 bắt raw headers thật của từng client trong 1 session MCP đầy đủ | `native-client-headers.md` mục V-3: Origin/Host THẬT per client (kỳ vọng Origin=none, Host=127.0.0.1:9181); nếu client gửi Origin lạ → xử lý BR-10 TRƯỚC khi bật gate |
| 1 | V-1a | Static grep HTTP layer từng client: `@modelcontextprotocol/sdk` `client/streamableHttp.js` + `client/sse.js` (VS Code install dir), Kiro client tương tự — `grep -i "origin"` trong dist/esm/client/; SDLC in-process đã verify (remote-backend-client.ts:120 không qua HTTP) | Không có dòng gắn Origin → ghi vào `native-client-headers.md` |
| 2 | V-1b | Runtime: 1 session MCP đầy đủ bằng client thật sau khi gate live (= E2E-API-02) | Deny log KHÔNG có `reason=origin-not-allowed` cho native client |
| 3 | V-1c | Ghi 1 dòng V-1 vào `pentest-results.csv` | PASS = (a) static grep sạch **VÀ** (b) session live không sinh deny log |
| 4 | V-4 | Cập nhật BRD A-1 status (verified/refuted) + FSD §11.2 Change Log nếu refuted | Không còn open assumption trước merge |

**FAIL handling:** V-1b sinh deny log → theo AF-2 UC-04 + BR-10: thêm pattern vào allowlist constant (code change nhỏ + unit test update T4/T5/corpus) — KHÔNG nới `*`, KHÔNG bỏ gate (no-workaround-rule); update preflight-matrix/live-harness corpus.
**Test Data:** testdata/v1-evidence-checklist.csv (5 steps, blocking=YES toàn bộ)
**Postconditions:** V-1..V-4 hoàn tất = điều kiện mở security review AC-3; không chạy đủ → KHÔNG merge (R-3 impact High)

---
## 5. Static Scans (SCAN) — static hygiene

### SCAN-01: Grep 0 `ACAO: *` + setHeader access-control chỉ trong echo block

| Field | Value |
|-------|-------|
| **ID** | SCAN-01 |
| **Priority** | High (P2) |
| **Type** | Static scan (grep + vitest static scan) |
| **Requirement** | FR-05, BR-07 (AC-8) — điều kiện merge #6 |
| **Preconditions** | Code change committed; pre-fix snapshot grep captured để diff |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Grep pattern `Access-Control-Allow-Origin` kết hợp literal `"*"` trong `extension/src/**/*.ts` (whitelist: test files, docs, vendored `lighthouse-devtools-mcp-bundle.js` — third-party không phải surface wrapper) | **0 match** (điều kiện merge #6: grep 0 `ACAO: *`) |
| 2 | Grep `setHeader("Access-Control` trong `WrapperServer.ts` | Chỉ xuất hiện trong block `if (gate.echoOrigin !== null)` SAU gate — không setHeader nào trước gate (C-2 — dòng :126-128 cũ đã XÓA, không ghi đè) |
| 3 | So với pre-fix snapshot | Diff chỉ chứa: xóa 3 dòng setHeader cũ + thêm echo block + Vary |

**Test Data:** testdata/scan-patterns.csv SCAN-01a, SCAN-01b
**Postconditions:** Hygiene runtime (IT-11) và static (SCAN-01) khớp nhau

---

### SCAN-02: Gate-first ordering + allowlist immutability + deny log format (code review checklist §8.6)

| Field | Value |
|-------|-------|
| **ID** | SCAN-02 |
| **Priority** | High (P2) |
| **Type** | Static scan + code review checklist |
| **Requirement** | FR-01, I-1, G-2, BR-09, FR-09, SEC-358-03 (I-8), BR-05 |
| **Preconditions** | Code change committed; symbol-based grep (OI-7 — không line-based) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Đọc `handleRequest` — assert statement đầu tiên là `evaluateOriginGate(...)` | FR-01/I-1 — không statement nào trước gate (URL parse dời xuống sau gate) |
| 2 | Grep imports `OriginGate.ts` | CHỈ `import { sanitizeLogText } from "./PathResolver"` — không http, không vscode (G-2, pure module) |
| 3 | Grep `ALLOWED_ORIGIN_PATTERNS` | `readonly` constant, không export mutable reference, không setter/push (BR-09, TDD §8.3) |
| 4 | Grep `Vary` | `res.setHeader("Vary", "Origin")` trong echo block (SEC-358-03) |
| 5 | Grep deny log call site | Đúng 1 dòng/deny, format `[WrapperServer] Denied request — reason=... origin=... host=... (METHOD path)`; allowed KHÔNG log (FR-09) |
| 6 | Grep Phase 1.5 trong `OriginGate.ts` | Host validate (I-8) chạy TRƯỚC return PASS nhánh no-Origin — 1 hàm validate chung tái sử dụng P1.5 + P5 (TDD §8.6 item 6, AD-10 — Option A implemented) |
| 7 | Grep `referer` (case-insensitive) trong `OriginGate.ts` + `WrapperServer.ts` (toàn bộ trust path `handleRequest`) | **0 match** — gate KHÔNG BAO GIỜ đọc Referer; Origin/Host là 2 header quyết định duy nhất (BR-05 — traceability fix BA review Gap-1) |

**Test Data:** testdata/scan-patterns.csv SCAN-02a..g
**Postconditions:** Checklist §8.6 TDD pass 6/6 items; 7/7 scan steps green

---

## 6. E2E-UI / SIT — N/A Justification

| Level | Verdict | Justification |
|-------|---------|---------------|
| E2E-UI | **N/A (0 cases)** | Backend HTTP server behavior thuần — không có UI surface (BRD: "UI Specifications: N/A" cho cả 4 stories; FSD §3.1.5 N/A; TDD §1.2 không đổi webview/panel). Không có screen/dialog/visual element để assert; browser test chỉ lặp lại những gì E2E-API harness đã chứng minh trực tiếp trên HTTP. |
| SIT (manual exploratory) | **N/A (0 cases)** | Mọi behavior của gate deterministic và quan sát được qua status + headers + body + deny log — phủ bởi PBT/UT/IT (server thật port ngẫu nhiên) + E2E-API (server thật :9181 live). Không có visual/UX/timing judgment (gate stateless header-check). Residual exploratory risk (client thật gửi Origin lạ — A-1) xử lý bằng **E2E-API-05 (V-1..V-4)** — quy trình documented với tiêu chí PASS machine-checkable, không phải exploratory. |

---

## 7. Contract Rules Traceability — G-1..G-8 (TDD §3.5)

| Rule | Nội dung | Test Cases |
|------|----------|------------|
| G-1 | Gate KHÔNG BAO GIỜ throw | PBT-01, PBT-02, UT-05, UT-38, IT-10 |
| G-2 | Gate PURE — chỉ import sanitizeLogText, không http/vscode | SCAN-02 (step 2), UT chạy không server (mọi UT-01..38) |
| G-3 | Sanitize BÊN TRONG gate (originSanitized/hostSanitized) | PBT-03, UT-35, IT-09 |
| G-4 | echoOrigin = RAW đã trim, KHÔNG url.origin | UT-16, UT-20, UT-25, IT-04, IT-05, E2E-API-03 |
| G-5 | Echo uniform / no-Origin zero CORS / deny zero CORS / không `*` | IT-11 (15-response sweep), IT-03, IT-04, SCAN-01 |
| G-6 | Fail-closed + route-agnostic (403 uniform mọi path) | UT-14, IT-10, IT-11 (GET /nonexistent), IT-12, IT-13 |
| G-7 | listenPort từ srv.address().port — không hardcode 9181 | UT-27, IT-06 (port ngẫu nhiên + port+1), IT-08 |
| G-8 | Scheme+hostname case-insensitive fold; port numeric; không substring | UT-20, UT-21, UT-23, UT-31, IT-05 |
| I-8 (mới — SEC-358-01) | Host check áp cho MỌI request có header Host | UT-32..34, PBT-04, IT-12 (step 4), IT-13 (row 1b), E2E-API-04 (LH-13..15), SCAN-02 (step 6) |

---

## 8. Requirements Traceability Matrix (RTM) — 100%

| Requirement | Source | Test Cases | Coverage |
|-------------|--------|------------|----------|
| **AC-1** — Cross-origin evil → 403 (preflight + POST) trước handleMcp | BRD Story 1 | PBT-01, PBT-02, UT-09..15, UT-21..24, IT-01, IT-02, IT-10, IT-13, E2E-API-01, E2E-API-04 | ✅ |
| **AC-2** — vscode-webview + localhost accepted (204 + echo, POST, SSE) | BRD Story 2 | UT-16..20, UT-25, UT-31, IT-04, IT-05, IT-13, E2E-API-03 | ✅ |
| **AC-3** — Security review pass (process gate) | BRD Story 4 | Tất cả levels + E2E-API-05 (V-1..V-4) + SCAN-01/02 + IT-14 bench | ✅ |
| **AC-4** — MCP clients hiện có không lỗi, không đổi config | BRD Story 3 | PBT-04, UT-06..08, UT-33, UT-34, IT-03, IT-08, IT-11, E2E-API-02, E2E-API-05 | ✅ |
| **AC-5** — Host ≠ loopback → 403 (DNS rebinding, kể cả no-Origin sau Option A) | BRD Story 1 + SEC-358-01 | UT-26..34, IT-06, IT-12, IT-13, E2E-API-04 | ✅ |
| **AC-6** — GET /mcp (SSE) áp cùng gate | BRD Story 2 | IT-07, IT-11, E2E-API-01 | ✅ |
| **AC-7** — Binding 127.0.0.1 giữ nguyên + assert | BRD Story 3 | IT-08 | ✅ |
| **AC-8** — Denied response KHÔNG ACAO; không còn `ACAO: *` | BRD Story 1 | IT-01, IT-02, IT-07, IT-11, SCAN-01, SCAN-02, E2E-API-01 | ✅ |
| **FR-01** — Gate TRƯỚC mọi route + mọi setHeader | FSD 3.1 | IT-01, IT-02, IT-07, IT-11, SCAN-02 | ✅ |
| **FR-02** — Origin rule 3 nhánh (a/b/c) | FSD 3.1 | UT-06..08, UT-09..25, IT-01, IT-03, IT-04, IT-05 | ✅ |
| **FR-03** — Allowlist 4 patterns | FSD 3.1 | UT-16..25, IT-04, IT-05 | ✅ |
| **FR-04** — Host rule (kể cả mọi-request-có-Host — Option A) | FSD 3.1 + SEC-358-01 | UT-26..34, IT-06, IT-12, IT-13 | ✅ |
| **FR-05** — Bỏ ACAO `*`, echo-only | FSD 3.1 | IT-01, IT-02, IT-07, IT-11, SCAN-01 | ✅ |
| **FR-06** — Preflight 204 + Allow-* chỉ khi allowed | FSD 3.1 | IT-02, IT-04, IT-13 | ✅ |
| **FR-07** — Gate mọi route (incl. SSE) | FSD 3.1 | IT-07, IT-11, E2E-API-01 | ✅ |
| **FR-08** — Deny shape 403 + `{"error":"Forbidden"}` | FSD 3.1 | IT-01, IT-02, IT-06, IT-10 | ✅ |
| **FR-09** — Deny log 1 dòng sanitized | FSD 3.1 | PBT-03, UT-35, IT-09, SCAN-02 | ✅ |
| **FR-10** — Zero regression MCP (byte-semantic) | FSD 3.1 | IT-03, IT-05, IT-08, IT-11, E2E-API-02 | ✅ |
| **FR-11** — Binding invariant verify-only | FSD 3.1 | IT-08 | ✅ |
| **FR-12** — Fail-closed header hỏng / duplicate | FSD 3.1 | PBT-01, PBT-02, UT-05, UT-09..15, IT-10, IT-12 | ✅ |
| **UC-01** — Drive-by deny | FSD 3.1.2 | IT-01, IT-02, IT-10, E2E-API-01 | ✅ |
| **UC-02** — Webview accepted | FSD 3.1.2 | IT-04, E2E-API-03 | ✅ |
| **UC-03** — Localhost accepted | FSD 3.1.2 | IT-05 | ✅ |
| **UC-04** — Native no-Origin pass-through | FSD 3.1.2 | IT-03, E2E-API-02, E2E-API-05 | ✅ |
| **UC-05** — DNS rebinding chặn | FSD 3.1.2 | IT-06, IT-13, UT-26..34, E2E-API-04 | ✅ |
| **UC-06** — SSE gated | FSD 3.1.2 | IT-07, E2E-API-01 | ✅ |
| **UC-07** — Preflight matrix | FSD 3.1.2 | IT-13 | ✅ |
| **BR-01** — Fail-closed, default deny | FSD 3.1.3 | PBT-01, PBT-02, UT-36, IT-10, IT-13 | ✅ |
| **BR-02** — Allowlist exact match, không substring | FSD 3.1.3 | UT-21, UT-22, UT-25, UT-37, IT-05 | ✅ |
| **BR-03** — Host case-insensitive + port chính xác | FSD 3.1.3 | UT-26..31, IT-06, IT-13 | ✅ |
| **BR-04** — Deny log sanitized (anti log-forging) | FSD 3.1.3 | PBT-03, UT-35, IT-09 | ✅ |
| **BR-05** — Origin > Host precedence; cấm Referer | FSD 3.1.3 | UT-26, IT-06 (step 5 — precedence), SCAN-02 (step 7 — grep `referer` 0 match trong trust path) | ✅ |
| **BR-06** — No-Origin = native signal | FSD 3.1.3 | PBT-04, UT-06..08, UT-33, UT-34, IT-03, IT-13 (row 1a) | ✅ |
| **BR-07** — ACAO echo-only, không `*` | FSD 3.1.3 | IT-04, IT-11, SCAN-01, E2E-API-01 | ✅ |
| **BR-08** — Byte-level behavior giữ nguyên cho caller được phép | FSD 3.1.3 | IT-03, IT-05, IT-08, E2E-API-02 | ✅ |
| **BR-09** — Allowlist constant immutable | FSD 3.1.3 | UT-16 (import constant), SCAN-02 (step 3) | ✅ |
| **BR-10** — No-workaround khi client hợp lệ bị chặn | FSD 3.1.3 | E2E-API-05 (FAIL handling — AF-2 UC-04 flow) | ✅ (process) |
| **R-4** — Log-forging | BRD 5.1 | PBT-03, UT-35, IT-09 | ✅ |
| **R-6** — Header trick bypass | BRD 5.1 | UT-02..04, UT-14, IT-12, E2E-API-04 | ✅ |
| **NFR <1ms** — Gate overhead | FSD §8.1 | IT-14 (p99 < 1ms + e2e delta median) | ✅ |
| **SEC-358-01** — DNS rebinding same-origin no-Origin (Option A) | SECURITY-REVIEW v1.0 | **UT-32..34 (H-7/H-8/H-9)**, PBT-04, IT-12, IT-13, E2E-API-04 | ✅ |
| **SEC-358-03** — Vary: Origin trên echo | SECURITY-REVIEW v1.0 (Info) | IT-04 (step 4), SCAN-02 (step 4) | ✅ |
| **SEC-358-05** — Non-browser forge Origin/Host (optional defense: Origin chứa [\t\n\r\f\v] → DENY) | SECURITY-REVIEW v1.0 (Info — design-accepted) | UT-39 (optional — **skip nếu DEV không implement**; mitigation chính thức OI-1 shared-secret follow-up) | ⏳ Conditional |

**Coverage: 8/8 ACs, 12/12 FRs, 7/7 UCs, 10/10 BRs + R-4 + R-6 + NFR + SEC-358-01 + SEC-358-03 — 100%.** Không requirement nào thiếu test case; không test case nào ngoài scope BRD/FSD/SECURITY-REVIEW.

---

## 9. Test Data File Index

| File | Dùng cho | Rows | Notes |
|------|----------|------|-------|
| `testdata/pre-seeded-data.csv` | Baseline env (PS-01..18) | 18 | Server, port, allowlist 4 patterns, helpers, mock deps, regression suites, harness/bench scripts |
| `testdata/origin-host-corpus.csv` | UT-01..UT-39 | 39 (UT-39 optional) | rawHeaders + listenPort + expected result/reason/echo per row |
| `testdata/pbt-properties.csv` | PBT-01..04 | 4 | Property + invariant + generator + seed |
| `testdata/integration-matrix.csv` | IT-01..IT-14 | 14 | Route/method/origin/host/body/expected status/ACAO/tool-calls/log-reason |
| `testdata/preflight-matrix.csv` | IT-13 | 14 | 7 origin/host rows × ACAM có/không (gồm row 1b SEC-358-01) |
| `testdata/live-harness-corpus.csv` | E2E-API-01..04 | 16 | LH-01..16: red baseline + green + R-6 + DNS-rebind no-Origin + V-1 row |
| `testdata/scan-patterns.csv` | SCAN-01/02 | 9 | Forbidden/allowed grep patterns + expected counts (SCAN-02a..g — gồm 02f Phase 1.5, 02g referer-grep) |
| `testdata/v1-evidence-checklist.csv` | E2E-API-05 | 5 | V-3/V-1a/V-1b/V-1c/V-4 — blocking=YES toàn bộ |
| `TEST-REPORT-SA4E-358.csv` | Execution tracking (Phase 6) | 64 | 1 row per test case — Status NOT_RUN prefill (UT-39 có điều kiện SKIP) |

**Verification:** mọi test case ID trong STC (64 — gồm 1 optional UT-39) xuất hiện ít nhất 1 lần trong testdata CSVs — coverage 100%.

---

*— Hết STC v1.1 — SA4E-358 — 64 cases (63 bắt buộc + 1 optional): PBT 4 · UT 39 (gồm H-7/H-8/H-9 SEC-358-01 Option A + UT-39 optional SEC-358-05) · IT 14 (T1..T14) · E2E-API 5 (gồm E2E-API-05 V-1..V-4 blocker) · SCAN 2 (SCAN-02 7 steps) · E2E-UI/SIT N/A — RTM 100% —*
