# Test Execution Report — SA4E-324

## Pi Context Budget + Model Registry

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-324 (Epic SA4E-289) |
| Title | Pi Context Budget + Model Registry |
| Executed By | QA Agent |
| Date | 2026-09-27 |
| Environment | Extension unit/integration (vitest, `extension/` root); no Extension Development Host / webview launched |
| Browser | N/A (E2E-UI + SIT not executed — see §3) |
| Overall Verdict | **⚠️ CONDITIONAL PASS** |
| Re-test Rounds | 0 (no SIT execution yet; automated verification of DEV security fixes only) |

---

## 1. Executive Summary

SA4E-324 STC defines **80 test cases** (PBT 6 + UT 28 + IT 20 + E2E-API 12 + E2E-UI 8 + SIT 6) with 12 CSV test-data files (199 rows, RTM 100%). DEV fixed the 3 High security findings; QA verified the fixes by reading the fix code and running the targeted automated suites: **27/27** (provider-url-policy + path-containment + mcp-bridge), **138/138** (providers incl. ONNX guard + restricted-configurations), **83/83** (context-retrieval incl. retrieveLocal containment). DEV-reported full suites (28 files/270 tests + 55 files/420 tests, tsc + eslint PASS) are accepted as reported — not re-run in full by QA. E2E-UI (8) and SIT (6) remain **NOT_RUN** (need Extension Development Host + chat webview). The 5 Medium findings remain OPEN as accepted pre-wiring conditions.

| Level | Total | Passed | Failed | NOT_RUN | Pass Rate (of executed) |
|-------|-------|--------|--------|---------|-------------------------|
| PBT | 6 | 0 | 0 | 6 | — (not executed) |
| UT | 28 | 10* | 0 | 18 | 100% |
| IT | 20 | 9* | 0 | 11 | 100% |
| E2E-API | 12 | 0 | 0 | 12 | — (not executed) |
| E2E-UI | 8 | 0 | 0 | 8 | — (not executed) |
| SIT | 6 | 0 | 0 | 6 | — (not executed) |
| **Total** | **80** | **19*** | **0** | **61** | **100% (0 failures)** |

\* "Passed" = STC cases whose assertions are directly covered by the targeted suites QA re-ran (security guards + containment). Full per-case mapping in §2.2.

---

## 2. Automated Test Results

### 2.1 Execution

```
npx vitest run --root extension <targeted security/registry suites>
```

| Metric | Result |
|--------|--------|
| QA re-ran (targeted) | 3 runs: 27 + 138 + 83 = **248 tests PASS, 0 fail** |
| DEV-reported full suites | 28 files/270 tests PASS + 55 files/420 tests PASS, tsc + eslint PASS (accepted as reported) |
| Failed | 0 |
| Duration | <5s per targeted run |

### 2.2 SA4E-324 Test Breakdown

| Category | Count | Status |
|----------|-------|--------|
| Property-Based Tests (PBT-01 to PBT-06) | 6 properties | ⚠️ NOT_RUN (need fast-check run in Extension Host env) |
| Unit Tests (UT-01 to UT-28) | 28 | ⚠️ Partial — 10 verified via targeted suites (registry validate, MODEL_ID_RE, provider-url-policy, TOOL_ALLOWLIST/validateParams, containment helpers); 18 NOT_RUN |
| Integration Tests (IT-01 to IT-20) | 20 | ⚠️ Partial — 9 verified (bridge approval/audit, retrieveLocal containment, restricted-configurations, ONNX both-files isAvailable); 11 NOT_RUN |
| E2E-API (E2E-API-01 to E2E-API-12) | 12 | ⚠️ NOT_RUN (need loopback mock vendor server) |
| E2E-UI (E2E-UI-01 to E2E-UI-08) | 8 | ⚠️ NOT_RUN (need Playwright + chat webview) |

### 2.3 Fix-verification evidence (QA re-ran, 2026-09-27)

| Fix | Test file(s) | Result |
|-----|--------------|--------|
| SEC-324-01 baseUrl policy | `providers/__tests__/provider-url-policy.test.ts` + `config/__tests__/restricted-configurations.test.ts` | ✅ PASS (part of 27 + 138) |
| SEC-324-02 MODEL_ID_RE + realpath + both-files isAvailable | `providers/__tests__/onnx-provider*` (within 12-file providers run, 138 PASS) | ✅ PASS |
| SEC-324-03 TOOL_ALLOWLIST + approval + audit | `extensions/__tests__/mcp-bridge-extension.test.ts` (incl. `TOOL_ALLOWLIST.has('execute_dynamic_tool') === false`) | ✅ PASS (part of 27) |
| SEC-325-D1 containment (cross-ticket proof) | `context-retrieval/__tests__/path-containment.test.ts` + `pi-agent/__tests__/context-retriever.test.ts` | ✅ PASS (27 + 83) |

---

## 3. Manual SIT Results (Final)

> SIT not executed in Phase 6 — no Extension Development Host session was launched. All 6 SIT cases remain NOT_RUN.

| ID | Test Case | Priority | Final Result | Notes |
|----|-----------|----------|--------------|-------|
| SIT-01 | Blocking overlay timing (visual) | Medium | ⚠️ NOT_RUN | Needs Extension Host + webview |
| SIT-02 | Responsive layout eyeball | Low | ⚠️ NOT_RUN | Needs human eyes |
| SIT-03 | Vietnamese corpus judgment | Medium | ⚠️ NOT_RUN | Corpus eyeball beyond ±15% |
| SIT-04 | Streaming-drift judgment | Medium | ⚠️ NOT_RUN | Beyond ±10% threshold |
| SIT-05 | Hostile settings.json exploratory | High | ⚠️ NOT_RUN | Adversarial — run before wiring |
| SIT-06 | Prompt-injection chaining exploratory | High | ⚠️ NOT_RUN | Adversarial — run before wiring |

**Final SIT Pass Rate: 0/6 = 0% (not executed)**

---

## 4. Defect Summary

> No new functional defects found (no SIT/E2E execution). Security findings tracked below; Mediums remain **OPEN (accepted conditions)**.

### BUG-324-SEC-MEDs: 5 Medium findings unfixed — OPEN ⚠️ (accepted)

| Field | Value |
|-------|-------|
| Severity | Major (Medium security, accepted pre-wiring) |
| Test Case | IT-16/17/18, E2E-API-10/11/12 (security integration) |
| Component | credentials-manager, settings-manager, agent-configurator, tokenizer path, package.json |
| Status | **OPEN — accepted as Phase 7 conditions (defense-in-depth)** |

**Description:** SEC-324-04 (cloud countTokens PII hop), SEC-324-05 (CredentialsError echo), SEC-324-06 (settings fail-open/pollution), SEC-324-07 (cwd/SYSTEM.md containment), SEC-324-08 (js-tiktoken pin) — none fixed in this DEV pass.

---

## 5. Test Metrics

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| UT Pass Rate | ≥90% | 100% of executed (10/10), 0 failures | ✅ Met (partial scope) |
| IT Pass Rate | 100% | 100% of executed (9/9), 0 failures | ✅ Met (partial scope) |
| SIT Pass Rate | ≥85% | 0% (0/6, NOT_RUN) | ⚠️ Not yet |
| Critical Defects | 0 | 0 | ✅ Met |
| High Defects (open) | 0 | 0 (3/3 FIXED) | ✅ Met |
| Open Defects | 0 | 5 Medium (accepted) | ⚠️ Conditional |

---

## 6. Evidence Files

| File | Description | Section |
|------|-------------|---------|
| testdata/*.csv (12 files, 199 rows) | STC coverage 100% of TC IDs | §1 |
| extension test runs (27+138+83 PASS, 2026-09-27) | Fix verification | §2.3 |

---

## 7. Conclusion

**Overall Verdict: ⚠️ CONDITIONAL PASS**

| Metric | Result |
|--------|--------|
| Automated tests (targeted re-run) | 248/248 PASS (100%) |
| DEV full suites (as reported) | 270 + 420 PASS, tsc + eslint PASS |
| Manual SIT tests | 0/6 (NOT_RUN) |
| High findings fixed | 3/3 ✅ |
| Open Mediums | 5 (accepted conditions) |

**Recommendation:** Approve for Phase 7 **only with** the §8 conditions (5 Mediums + SIT-05/SIT-06 adversarial sessions before production wiring).

---

## 8. Security Conditions (Phase 3.7 Findings → Phase 6 Status)

> Every High/Medium from `SECURITY-REVIEW.md` v1.0 (13 findings: 0 Critical, 3 High, 5 Medium, 4 Low, 1 Info).

### 8.1 High findings — all FIXED ✅ (verified by QA)

| ID | Title | Status | Fix file | Proving test |
|----|-------|--------|----------|--------------|
| SEC-324-01 | Provider `baseUrl` SSRF + API-key exfiltration | **FIXED** ✅ | `extension/src/langgraph/providers/provider-url-policy.ts` (NEW, `validateProviderBaseUrl` → `validateBackendUrl` policy); wired in anthropic/openai/ollama-provider ctors; `package.json` `restrictedConfigurations` += 4 keys (`anthropicBaseUrl`, `openaiBaseUrl`, `ollamaUrl`, `lmstudioBaseUrl`) | `provider-url-policy.test.ts` + `restricted-configurations.test.ts` — PASS (QA re-ran) |
| SEC-324-02 | ONNX `modelId` path traversal → arbitrary file read | **FIXED** ✅ | `onnx-provider.ts`: `MODEL_ID_RE /^[a-z0-9][a-z0-9._-]*$/` + `resolveModelDir` realpath containment + `isAvailable()` checks **both** `model.onnx` **and** `tokenizer.json` | `onnx-provider` tests (12-file providers run, 138 PASS) |
| SEC-324-03 | Pi→MCP bridge arbitrary tool chaining | **FIXED** ✅ | `tool-definitions.ts`: `TOOL_ALLOWLIST` (4 concrete tools, **no** `execute_dynamic_tool`) + `MAX_STRING_PARAM_LENGTH 4000`; `mcp-bridge-extension.ts`: deny-by-default + chained-target allowlist + approval hook + audit log (`{toolName, argKeys, decision}`, never values) | `mcp-bridge-extension.test.ts` (`TOOL_ALLOWLIST.has('execute_dynamic_tool') === false`) — PASS |

### 8.2 Medium findings — OPEN, accepted (ride next PR / pre-wiring)

| ID | Title | Status | Mitigation / Condition |
|----|-------|--------|------------------------|
| SEC-324-04 | Cloud countTokens ships full prompt (PII) | OPEN-ACCEPTED | Prefer local counting for secret batches; add secret-tripwire warn; document 2nd disclosure hop before wiring |
| SEC-324-05 | CredentialsError echoes raw ref | OPEN-ACCEPTED | Redact value + broaden patterns + `env:` allowlist |
| SEC-324-06 | SettingsManager fail-open + proto-pollution | OPEN-ACCEPTED | Fail-closed + null-proto + 1 MB cap |
| SEC-324-07 | cwd/agentDir + SYSTEM.md symlink | OPEN-ACCEPTED | realpath containment + size cap + fail-closed |
| SEC-324-08 | js-tiktoken unpinned | OPEN-ACCEPTED | Pin `1.0.21` + `npm audit` + Dependabot |

### 8.3 Low + Informational — OPEN (hygiene, fold into DEV pass)

SEC-324-09 (tokenizer read caps), SEC-324-10 (central logger redaction), SEC-324-11 (model-id sanitization), SEC-324-12 (window cache/rate-limit), SEC-324-13 (loopback nonce/LRU/dispose) — OPEN, non-blocking.

---

## Appendix A: Re-Test History

> No re-test rounds required (no SIT execution; no functional FAIL to re-test). Targeted fix-verification runs passed on first execution (2026-09-27).

```
Round 1 (Fix verification, 2026-09-27) → 248/248 PASS, 0 bugs found
SIT/E2E rounds → pending Extension Host environment (Phase 7 entry)
```
