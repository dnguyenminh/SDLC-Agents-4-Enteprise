# SA4E-358 — Test Run Summary (DEV implementation run)

> Run date: 2026-10-13 · Machine: Windows (win32), Node v24.8.0 · Branch: main (uncommitted working tree — SM xử lý git)

## 1. Suite results

| Suite | Command | Result |
|-------|---------|--------|
| Full extension suite | `npx vitest run` (extension/) | **286 files · 2808 tests · 0 failed** |
| OriginGate unit (STC UT-01..39 + PBT-01..04) | `npx vitest run src/services/__tests__/origin-gate.test.ts` | **46/46 PASS** (< 3s) |
| WrapperServer integration + regression (TC-22..43 + SA4E-356 describe + **T1..T14**) | `npx vitest run src/__tests__/wrapper-server.test.ts` | **40/40 PASS** |
| Coverage gate (perFile ≥95% L/F/B/S) | `npm run test:coverage` | **PASS — OriginGate.ts 100% stmts / 96.42% branches / 100% funcs / 100% lines**; PathResolver.ts ≥95% (giữ nguyên gate SA4E-356) |

## 2. Static gates

| Gate | Command | Result |
|------|---------|--------|
| G1/G2/G3 CORS consistency (SCAN-01/02 + I-1 + G-2) | `bash scripts/check-cors-gate-sa4e358.sh --all` | **PASSED — 528 files scanned** (output: cors-gate-script-output.txt) |
| Semgrep 3 rules (R1 wildcard / R2 echo-only / R3 outside-WS) | `semgrep --config .semgrep/sa4e-358-cors.yml --quiet extension/src` | **0 findings (exit 0)** |
| tsc | `npx tsc -p ./` | **0 errors** |
| eslint (5 changed/new files) | `npx eslint <files>` | **0 errors** |
| Type-check + package | VSIX smoke | CI job (continue-on-error) |

## 3. Bench (IT-14 / NFR <1ms — điều kiện merge #5)

| Input class | p50 | p95 | p99 |
|-------------|-----|-----|-----|
| no-Origin | 0.30µs | 0.50µs | **0.70µs** |
| allowed-webview | 1.20µs | 1.60µs | **2.30µs** |
| denied-evil | 2.30µs | 3.30µs | **6.30µs** |
| malformed | 36.90µs | 72.10µs | **145.20µs** |

E2E delta median (GET /health ×10⁴, gate vs baseline, real servers): **−0.0154ms** (≈0, nhiễu). **PASS** — mọi p99 < 1ms.
Chi tiết: bench-output.txt + bench-results.csv. (Lưu ý: malformed class chậm hơn do đường `new URL` throw — vẫn thấp hơn ngưỡng ~7×.)

## 4. Live harness (STC E2E-API-01..04 — LH-01..15)

Mode chạy: **STANDALONE** (`--standalone` — boot WrapperServer THẬT in-process, vscode stubbed; cùng HTTP surface + deny log production, server thật bind 127.0.0.1:9181).

| Vector | Kết quả |
|--------|---------|
| LH-01..04 (P6-15/16/17 replays + attacker POST) | 4/4 PASS — 403 + zero CORS, tool không thực thi |
| LH-05..07 (webview-sim preflight/POST/SSE) | 3/3 PASS — 204 + echo EXACT + Allow-*, 200 + echo + tool thực thi, SSE mở |
| LH-08 (V-1b native full session) | PASS — flow [200,202,200,200,200], deny log delta 0 |
| LH-09 (red baseline) | SKIP theo design (baseline P6-15/16/17 đã có) |
| LH-10..12 (R-6 raw socket + casing) | 3/3 PASS |
| **LH-13 (SEC-358-01 — merge condition #4)** | **PASS — raw GET /mcp no-Origin + Host evil.com:9181 → 403 + log `reason=host-mismatch`** |
| LH-14/15 (Host 0.0.0.0 / 127.1 — không normalize) | 2/2 PASS — 403 host-mismatch |

**15/15 PASS** (output: live-harness-standalone-output.txt; CSV: pentest-results.csv).
**Còn lại cho SM/QA (N-QA2):** chạy lại harness KHÔNG `--standalone` trên extension dev host thật (:9181, Kiro/VS Code) → xác nhận cùng verdict + capture deny log outputChannel thật.

## 5. V-1..V-4 (E2E-API-05 — điều kiện merge #5... blocker R-3)

| Bước | Trạng thái |
|------|-----------|
| V-3/V-1a static grep | **PASS** — `@modelcontextprotocol/sdk` client layer (streamableHttp/sse/auth/middleware): 0 Origin-header emission (native-client-headers.md) |
| V-1b runtime | **PASS ở mức standalone** (LH-08: SDK-equivalent full session, deny log delta 0). Dev-host confirmation pending SM/QA |
| V-1c CSV row | Đã append vào pentest-results.csv |
| V-4 BRD A-1 status + FSD Change Log | **Thuộc BA/SM** — DEV không sửa BRD/FSD |

## 6. Test inventory mới (60 tests)

- `extension/src/services/__tests__/origin-gate.test.ts` (MỚI — 46): UT-01..39 (38 bắt buộc + UT-39 optional SEC-358-05 **đã implement guard** + 2 companion UT-03b/UT-31b cho branch coverage) + allowlist immutability + PBT-01..04 (fast-check, seed 388911..388914 theo STC).
- `extension/src/__tests__/wrapper-server.test.ts` (+14): T1..T13 integration matrix (STC IT-01..13) + T14 micro-overhead sanity (p99 20k-calls < 1ms; full bench = bench-gate.ts on-demand).
- Helpers mới (wrapper-server.helpers.ts): `requestWithHeaders`, `assertNoAccessControlHeaders`, `sendRawRequest`, `createCapturingOutputChannel`.

## 7. Deviation notes (cho TA review)

1. **`evaluateOriginGate` 7 phases implemented as designed** (TDD §3.3 v1.1) — gồm Phase 1.5 Host-check-mọi-request-có-Host (I-8/AD-10/SEC-358-01 Option A).
2. **P3d (documented deviation, giữ intent TDD):** Node 22 WHATWG URL parse `vscode-webview://abc:9181` thành host=abc + port=9181 — KHÔNG throw như TDD §3.3 note giả định. Đã thêm check `non-special scheme + url.port !== "" → deny malformed-origin` để giữ đúng contract STC UT-15 (webview thật không bao giờ có port). SA-verified bằng runtime probe.
3. **GateHeaders giữ 4 field public** (TDD §3.2); value lists cho deny-join nằm ở internal `scanGateHeaders` (TDD §3.4 note — không làm thay đổi contract UT-01..05).
4. **IT-06 step 5 (both-fail precedence):** assert `host-mismatch` theo TDD §3.3 v1.1 + FSD BR-05 v1.2 ("P1.5 chạy trước — deny đầu tiên định reason"). STC IT-06 step 5 còn ghi `origin-not-allowed` — v1.0 leftover, **cần QA sync STC** (comment trong test ghi rõ).
5. **T9/IT-09:** Node client/llhttp chặn CR/LF/\0 trong header value trước khi tới gate (client throw / raw 400) — test chứng minh CẢ 2 lớp (llhttp + gate sanitize nội bộ,-unit UT-35). Log assertion "MỌI dòng không chứa \r\n\0" giữ nguyên theo STC.
6. **WrapperServer thêm getter `boundAddress`** (verify-only, T8/IT-08 — TDD cho phép "qua introspect address hoặc accessor"); không đổi bind call :98.
7. **T14 bench:** phần CI-safe (p99 20k calls) nằm trong vitest; bench đầy đủ 10⁶/class + e2e delta là script `bench-gate.ts` on-demand — đúng STC IT-14 "không trong CI mặc định".
