# Software Test Cases (STC)

## SDLC Agents 4 Enterprise (VS Code/Kiro Extension) — SA4E-320: Add opt-in checkbox to bypass HTTPS enforcement for remote backend server

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-320 |
| Title | Add opt-in checkbox to bypass HTTPS enforcement for remote backend server |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-09-23 |
| Status | Reviewed — BA Review Gate fixes applied (v1.1) |
| Related STP | `documents/SA4E-320/STP.md` |
| Related FSD | `documents/SA4E-320/FSD.md` (v1.1 — §10 TC-01…TC-19) |
| Related UI Spec | `documents/SA4E-320/UI-SPEC.md` |
| Test Data | `documents/SA4E-320/testdata/*.csv` |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-23 | QA Agent | Initiate document — continues FSD §10 IDs (TC-01…TC-19), adds TC-20…TC-23 for AF-7 / EF gaps; maps each TC to existing automated tests (backend-url.test.ts = 11 tests, knowledge-client-bypass.test.ts = 12 tests) or marks Manual |
| 1.1 | 2026-09-23 | BA Agent | BA business-coverage gate — **CHANGES REQUESTED**: added TC-24 (UC-02 EF-3: backend.url persistence failure after validation accepted) + TC-25 (UC-02 AF-4: Test Connection reject-before-network I/O); updated summary counts (23→25), level distribution (SIT 6→8), RTM (AC4/BR-04/UC-02/§9/US-1, coverage 54→56), test data §8.4, appendix A |

---

## Test Case Summary

| Category | ID Range | Count | Priority |
|----------|----------|-------|----------|
| FSD §10 scenarios (continued) | TC-01 … TC-19 | 19 | High/Medium |
| QA-added edge/error coverage (FSD AF-7, UC-04 EF-1, UC-03 EF-1, UC-01 EF-1) | TC-20 … TC-23 | 4 | Medium |
| BA-gate-added coverage (UC-02 EF-3, UC-02 AF-4) | TC-24 … TC-25 | 2 | Medium/High |
| **Total** | | **25** | |

**Level distribution & automation status:**

| Level | Count | Automated | Manual | Automated TCs | Manual TCs |
|-------|-------|-----------|--------|--------------|------------|
| PBT | 0 | 0 | 0 | — (N/A, see STP §2.1) | — |
| UT | 10 | 8 | 2 | TC-01…TC-06, TC-11, TC-14 | TC-19, TC-20 |
| IT | 4 | 4 | 0 | TC-12, TC-16, TC-17, TC-18 | — |
| E2E-API | 0 | 0 | 0 | — (N/A — no REST API) | — |
| E2E-UI | 3 | 0 | 3 | — (automation deferred, OI-10) | TC-07, TC-08, TC-09 |
| SIT | 8 | 0 | 8 | — | TC-10, TC-13, TC-15, TC-21, TC-22, TC-23, TC-24, TC-25 |
| **Total** | **25** | **12 (48%)** | **13 (52%)** | | |

**Verified automated evidence (do not restate differently):**

| Test file | Verified count | Source |
|-----------|----------------|--------|
| `extension/src/config/__tests__/backend-url.test.ts` | **11 tests** — pass | RUN-LOG #5 (11/11), disk (11 `it` blocks) |
| `extension/src/config/__tests__/knowledge-client-bypass.test.ts` | **12 tests** — pass | RUN-LOG #7 |
| Extension regression suite | **102 total pass**, `tsc` clean | RUN-LOG #7 (90+10+102) |

---

## 1. Functional Test Cases — Validation Branches (Happy Path & Baseline)

### TC-01: Setting exists as boolean with secure default false

| Field | Value |
|-------|-------|
| **ID** | TC-01 |
| **Priority** | High |
| **Type** | Functional |
| **Level** | UT |
| **Automation** | ✅ Automated — `extension/src/config/__tests__/backend-url.test.ts` → `it('package.json declares the setting as boolean with default false')` (suite = 11 tests, pass) |
| **Requirement** | AC1, BR-01, FSD §10 TC-01, V1 |
| **Preconditions** | Extension package manifest readable at `extension/package.json` |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Parse `extension/package.json` → `contributes.configuration.properties['kiroSdlc.backend.allowInsecureRemote']` | Property exists |
| 2 | Assert `prop.type` | `type === "boolean"` |
| 3 | Assert `prop.default` | `default === false` — never `true` |

**Test Data:** manifest path `extension/package.json` (property at lines 191–195)
**Postconditions:** Fresh installs initialize enforcement ON.

---

### TC-02: Bypass OFF — remote HTTP rejected (fail-closed)

| Field | Value |
|-------|-------|
| **ID** | TC-02 |
| **Priority** | High |
| **Type** | Functional |
| **Level** | UT |
| **Automation** | ✅ Automated — `backend-url.test.ts` → `it('rejects unencrypted http remote URLs')` + `it('bypass OFF (default/missing option): http remote still rejected')` |
| **Requirement** | AC4, BR-04, UC-04, FSD §10 TC-02 |
| **Preconditions** | Flag OFF (option omitted or `{ allowInsecureRemote: false }`); `console.warn` spied |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `validateBackendUrl('http://remote.server.internal:48721')` (no options) | Throws `/Insecure backend URL rejected: HTTP is only allowed for loopback/` |
| 2 | `validateBackendUrl('http://192.168.1.100:48721')` | Throws `/Insecure backend URL rejected/` |
| 3 | `validateBackendUrl('http://remote.server.internal:48721', { allowInsecureRemote: false })` | Throws `/Insecure backend URL rejected/` |
| 4 | Observe `console.warn` spy | Rejection warning emitted (`[Security] Insecure backend URL rejected…`) |

**Test Data:** `http://remote.server.internal:48721`, `http://192.168.1.100:48721` (see `testdata/url-validation-testdata.csv`)
**Postconditions:** URL not saved/used; SEC-289-03 intact.

---

### TC-03: Bypass OFF — remote HTTPS accepted

| Field | Value |
|-------|-------|
| **ID** | TC-03 |
| **Priority** | High |
| **Type** | Functional |
| **Level** | UT |
| **Automation** | ✅ Automated — `backend-url.test.ts` → `it('allows https remote URLs')` |
| **Requirement** | AC4, BR-04, UC-02 AF-2, FSD §10 TC-03 |
| **Preconditions** | Flag OFF (no option passed) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `validateBackendUrl('https://api.enterprise.internal/kb')` | Returns `https://api.enterprise.internal/kb` (accepted) |
| 2 | `validateBackendUrl('https://my-backend.corp.com:8443')` | Returns `https://my-backend.corp.com:8443` |
| 3 | Check `console.warn` | No security warning for HTTPS accepts |

**Test Data:** `https://api.enterprise.internal/kb`, `https://my-backend.corp.com:8443`
**Postconditions:** Save/Test proceed normally.

---

### TC-04: Bypass OFF — loopback HTTP accepted (localhost, 127.0.0.1, ::1)

| Field | Value |
|-------|-------|
| **ID** | TC-04 |
| **Priority** | High |
| **Type** | Functional |
| **Level** | UT |
| **Automation** | ✅ Automated — `backend-url.test.ts` → `it('allows http loopback URLs (localhost, 127.0.0.1, ::1)')`; also `knowledge-client-bypass.test.ts` → `it('loopback HTTP unaffected regardless of flag')` |
| **Requirement** | AC4, BR-06, FSD §10 TC-04 |
| **Preconditions** | Flag OFF |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `validateBackendUrl('http://127.0.0.1:48721')` | Returns `http://127.0.0.1:48721` |
| 2 | `validateBackendUrl('http://localhost:3000')` | Returns `http://localhost:3000` |
| 3 | `validateBackendUrl('http://[::1]:8080')` | Returns `http://[::1]:8080` |
| 4 | `isLoopbackHost('127.0.0.1')`, `isLoopbackHost('localhost')` | Both `true` |
| 5 | (IT) `new KnowledgeClient('http://127.0.0.1:48721')` flag false; `'http://localhost:9999'` flag true | Neither throws |

**Test Data:** `http://127.0.0.1:48721`, `http://localhost:3000`, `http://[::1]:8080`, `http://localhost:9999`
**Postconditions:** Loopback exemption unchanged with or without checkbox.

---

### TC-05: Bypass ON — remote HTTP accepted with MITM console warning

| Field | Value |
|-------|-------|
| **ID** | TC-05 |
| **Priority** | High |
| **Type** | Functional / Security |
| **Level** | UT |
| **Automation** | ✅ Automated — `backend-url.test.ts` → `it('bypass ON: http remote accepted and console.warn still logged')` |
| **Requirement** | AC5, BR-05, BR-03, Finding #7, FSD §10 TC-05 |
| **Preconditions** | Option `{ allowInsecureRemote: true }`; `console.warn` spied |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `validateBackendUrl('http://remote.server.internal:48721', { allowInsecureRemote: true })` | Returns `http://remote.server.internal:48721` (accepted — no throw) |
| 2 | Assert warn called with | Matches `/\[Security\] WARNING: Insecure remote backend URL allowed \(allowInsecureRemote=true\).*unencrypted HTTP/` |
| 3 | Assert MITM wording | Matches `/Credentials and data can be intercepted \(MITM\)/` |
| 4 | Assert trusted-network wording | Matches `/Only use on trusted private networks/` |

**Test Data:** `http://remote.server.internal:48721`
**Postconditions:** Insecure usage traceable in console on **every** validation call (never throttled).

---

### TC-06: Bypass ON — HTTPS remote and loopback HTTP accepted without warning

| Field | Value |
|-------|-------|
| **ID** | TC-06 |
| **Priority** | High |
| **Type** | Functional |
| **Level** | UT |
| **Automation** | ✅ Automated — `backend-url.test.ts` → `it('bypass ON: loopback http and https remote unaffected (no warning)')` |
| **Requirement** | BR-06, UC-02 AF-2/AF-3, FSD §10 TC-06 |
| **Preconditions** | Flag ON; `console.warn` spied |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `validateBackendUrl('http://127.0.0.1:48721', { allowInsecureRemote: true })` | Returns URL unchanged |
| 2 | `validateBackendUrl('https://api.enterprise.internal', { allowInsecureRemote: true })` | Returns URL unchanged |
| 3 | Assert `warnSpy` | `not.toHaveBeenCalled()` — warning fires **only** for insecure remote-HTTP accepts |

**Test Data:** `http://127.0.0.1:48721`, `https://api.enterprise.internal`
**Postconditions:** No warning noise for secure URLs.

---

## 2. UI/UX Test Cases (SettingsPanel — manual until E2E-UI automation)

### TC-07: Checkbox placement, exact label, default OFF

| Field | Value |
|-------|-------|
| **ID** | TC-07 |
| **Priority** | High |
| **Type** | UI/UX |
| **Level** | E2E-UI (executed manually as SIT — automation deferred OI-10) |
| **Automation** | ❌ Manual — no automated webview test yet (TDD §11.5 recommends `#allow-insecure-remote-chk` selector tests) |
| **Requirement** | AC2, UI-SPEC §1–§3, FSD §10 TC-07 |
| **Preconditions** | Fresh workspace (flag unset); open **Settings > Server Settings**; card `#backend-mcp-section` rendered |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Locate Backend URL input inside `#backend-mcp-section` | Input present (existing, unchanged) |
| 2 | Inspect DOM order directly below the URL `.form-group` | `.form-group.checkbox-group` block sits **below URL input, above `.btn-row`** (Save URL / Test Connection) |
| 3 | Find checkbox by id | Element `#allow-insecure-remote-chk` present, wrapped in `<label for="allow-insecure-remote-chk">` |
| 4 | Read label text | Exact: `Bypass HTTPS requirement for remote server` |
| 5 | Check default state | Checkbox **unchecked** (setting unset → default `false`) |
| 6 | Keyboard: Tab to checkbox, press Space | Toggles state (native keyboard operable) |

**Test Data:** fresh workspace, `kiroSdlc.backend.allowInsecureRemote` unset (`testdata/pre-seeded-config-testdata.csv` row P-01)
**Postconditions:** Checkbox OFF; warning hidden.

---

### TC-08: Warning visibility toggle with exact amber copy

| Field | Value |
|-------|-------|
| **ID** | TC-08 |
| **Priority** | High |
| **Type** | UI/UX |
| **Level** | E2E-UI (manual as SIT) |
| **Automation** | ❌ Manual — DOM/visual assertion needs webview harness (OI-10) |
| **Requirement** | AC3, BR-03, UI-SPEC §2/§4, FSD §10 TC-08 |
| **Preconditions** | Settings panel open; checkbox OFF; warning `#allow-insecure-remote-warning` present with `hidden` |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Verify default | `#allow-insecure-remote-warning` has `hidden` attribute — **not visible** |
| 2 | Click checkbox (ON) | Warning becomes visible immediately (same `change` event) |
| 3 | Read warning text | Exact: `⚠️ Traffic to a remote backend will be sent as unencrypted HTTP — credentials and data can be intercepted. Only enable on trusted private networks.` |
| 4 | Inspect style | Class `status-indicator warning` → amber `--vscode-editorWarning-foreground` (≈ `#cca700`), `font-size: 12px` |
| 5 | Click checkbox (OFF) | Warning hidden again (`hidden` restored) |
| 6 | Repeat ON/OFF 3× | Visibility always synchronized — cannot remain visible while unchecked |

**Test Data:** none (UI state toggles)
**Postconditions:** Warning state matches checkbox; flag persisted per UC-01.

---

### TC-09: State round-trip across panel reopen / window reload

| Field | Value |
|-------|-------|
| **ID** | TC-09 |
| **Priority** | High |
| **Type** | Functional — Persistence / UI |
| **Level** | E2E-UI (manual as SIT); state-assembly covered partially by `ProviderConfigService.test.ts` (in 102 regression suite) |
| **Automation** | ❌ Manual full round-trip — OI-10 gap (webview `handleState()` untested in CI) |
| **Requirement** | AC6, BR-08, UC-03, FSD §10 TC-09 |
| **Preconditions** | Settings panel open; bypass currently OFF |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Check the bypass checkbox | Warning visible; workspace `.vscode/settings.json` gains `"kiroSdlc.backend.allowInsecureRemote": true` |
| 2 | Close Settings panel; reopen **Settings > Server Settings** | Checkbox restored **checked**; warning visible (via `state.allowInsecureRemote`) |
| 3 | Reload window (Ctrl/Cmd+Shift+P → Reload Window); reopen panel | Still checked + warning visible (workspace persistence survives reload) |
| 4 | Uncheck; repeat steps 2–3 | Restored **unchecked** + warning hidden |
| 5 | Confirm `.vscode/settings.json` after uncheck | Value `false` (or removed/default) |

**Test Data:** `testdata/pre-seeded-config-testdata.csv` (reset between runs)
**Postconditions:** UI state = persisted state; enforcement reads same value fresh.

---

## 3. Message Contract & Persistence Test Cases (SIT — manual)

### TC-10: Message → workspace persistence (setAllowInsecureRemote)

| Field | Value |
|-------|-------|
| **ID** | TC-10 |
| **Priority** | High |
| **Type** | Functional — Integration (message contract) |
| **Level** | SIT |
| **Automation** | ❌ Manual — handler not covered by the two feature suites (partially: write coercion exists in code; round-trip = OI-10) |
| **Requirement** | AC6, BR-02, BR-08, UC-01, FSD §10 TC-10 |
| **Preconditions** | Settings panel open; DevTools/console open; workspace writable |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Check the checkbox | Webview posts `{ type: "setAllowInsecureRemote", enabled: true }` (inspect via instrumentation or effect) |
| 2 | Inspect `.vscode/settings.json` | `"kiroSdlc.backend.allowInsecureRemote": true` written at **Workspace** scope — **immediately**, without clicking Save URL |
| 3 | Uncheck the checkbox | Workspace value updated to `false` |
| 4 | Verify no ambient activation | Setting changes **only** via checkbox interaction — no env var / URL parameter can set it (BR-02; SDR grep verified) |

**Test Data:** `testdata/ui-message-testdata.csv` rows M-01, M-02
**Postconditions:** Flag persisted; single sanctioned write path (W1).

---

### TC-13: Ordering — toggle ON then immediate Save URL (FIFO + await)

| Field | Value |
|-------|-------|
| **ID** | TC-13 |
| **Priority** | Medium |
| **Type** | Functional — Concurrency/Ordering |
| **Level** | SIT |
| **Automation** | ❌ Manual — contract-level (FSD notes TC-13 is contract-level; OI-10) |
| **Requirement** | UI-SPEC §5, UC-03 AF-3, FSD §10 TC-13 |
| **Preconditions** | Bypass OFF; Backend URL input contains `http://remote.server.internal:48721` |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | With remote HTTP URL already entered, **check** the bypass checkbox | `setAllowInsecureRemote` posted immediately (not deferred to Save); handler `await`s config write |
| 2 | **Immediately** click **Save URL** (same second) | `setBackendUrl` validated against the **just-persisted** flag (FIFO postMessage + awaited handler) |
| 3 | Observe result | Save succeeds — "Saved ✓" (flag already `true` at validation time); NO race/rejection |
| 4 | Invert: uncheck then immediately Save with remote HTTP | Save **rejected** with `[Security] Insecure backend URL rejected …` (flag already `false`) |

**Test Data:** `http://remote.server.internal:48721` (`testdata/ui-message-testdata.csv` row M-05)
**Postconditions:** UI state and enforcement state never diverge after write completes.

---

## 4. Functional Test Cases — Exception/Error Flows

### TC-11: Bypass ON — unsupported protocol and malformed URL still rejected

| Field | Value |
|-------|-------|
| **ID** | TC-11 |
| **Priority** | High |
| **Type** | Functional / Security |
| **Level** | UT (+ IT for KnowledgeClient path) |
| **Automation** | ✅ Automated — `backend-url.test.ts`: `it('rejects invalid schemes')`, `it('rejects malformed URLs (bypass OFF / default)')`, `it('bypass ON: invalid scheme still rejected')`, `it('bypass ON: malformed URL still rejected')`; `knowledge-client-bypass.test.ts`: `it('bypass ON does not relax protocol allowlist (ftp still rejected by KnowledgeClient)')` |
| **Requirement** | BR-07, UC-02 EF-1/EF-2, FSD §10 TC-11 |
| **Preconditions** | Flag ON (`{ allowInsecureRemote: true }` or config `true`) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `validateBackendUrl('ftp://remote.server.internal:21', { allowInsecureRemote: true })` | Throws `/Invalid backend URL protocol/` |
| 2 | `validateBackendUrl('ws://remote.server.internal', { allowInsecureRemote: true })` | Throws `/Invalid backend URL protocol/` |
| 3 | `validateBackendUrl('not a valid url', { allowInsecureRemote: true })` | Throws `/Malformed backend URL/` |
| 4 | OFF-path regression: `validateBackendUrl('ftp://localhost:21')`, `validateBackendUrl('http://')` | Throws protocol / malformed respectively |
| 5 | (IT) `new KnowledgeClient('ftp://remote.server.internal:21')` flag true | Throws `/\[Security\] Invalid backend URL protocol/` |

**Test Data:** `ftp://remote.server.internal:21`, `ws://remote.server.internal`, `not a valid url`, `http://`
**Postconditions:** Bypass relaxes HTTP-vs-HTTPS **only** — never the protocol allowlist or parser.

---

### TC-15: Write-path coercion of non-boolean enabled payload

| Field | Value |
|-------|-------|
| **ID** | TC-15 |
| **Priority** | High |
| **Type** | Functional / Security |
| **Level** | SIT (handler-level; no unit test file for `SettingsMessageHandler` observed) |
| **Automation** | ❌ Manual — write coercion at `SettingsMessageHandler.ts:212` (`enabled === true`, Finding #6 fixed) not covered by the two feature suites |
| **Requirement** | BR-10, Finding #6, UC-01 EF-3, FSD §10 TC-15 |
| **Preconditions** | Ability to post crafted webview message (debug harness) or code-inspection + manual payload injection |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Post `{ type: "setAllowInsecureRemote", enabled: "true" }` | Workspace config updated to **`false`** (coerced — string `"true" !== true`) |
| 2 | Post `{ type: "setAllowInsecureRemote", enabled: 1 }` | Workspace config = `false` |
| 3 | Post `{ type: "setAllowInsecureRemote", enabled: {} }` | Workspace config = `false` |
| 4 | Post `{ type: "setAllowInsecureRemote", enabled: true }` | Workspace config = `true` (only strict boolean true passes) |
| 5 | Hand-edit `.vscode/settings.json`: `"kiroSdlc.backend.allowInsecureRemote": "true"` then Save remote HTTP URL | Rejected — enforcement read uses strict `=== true` → treats string as OFF |

**Test Data:** `testdata/ui-message-testdata.csv` rows M-06…M-09
**Postconditions:** Garbage payloads can never enable bypass (defense in depth).

---

### TC-19: Empty URL → default loopback normalization (no throw)

| Field | Value |
|-------|-------|
| **ID** | TC-19 |
| **Priority** | Medium |
| **Type** | Functional — Boundary |
| **Level** | UT |
| **Automation** | ❌ Manual — **gap:** TDD §10 lists TC-19 for `backend-url.test.ts`, but the current file (11 `it` blocks) contains **no empty-URL test**; execute ad-hoc now, automate in follow-up |
| **Requirement** | UC-02 AF-6, FSD §10 TC-19 |
| **Preconditions** | Access to `validateBackendUrl` (unit runner or REPL) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `validateBackendUrl('')` | Returns `http://127.0.0.1:48721` — **no throw** |
| 2 | `validateBackendUrl(undefined as any)` / non-string | Returns `http://127.0.0.1:48721` — **no throw** |
| 3 | Use returned URL for Save | Persists default loopback URL (safe — not remote) |

**Test Data:** `""`, `undefined`, `null` (`testdata/url-validation-testdata.csv` rows E-01…E-03)
**Postconditions:** Empty input silently normalized to safe loopback default (documented behavior).

---

### TC-20: Trailing slash stripped exactly once before validation

| Field | Value |
|-------|-------|
| **ID** | TC-20 |
| **Priority** | Medium |
| **Type** | Functional — Boundary |
| **Level** | UT |
| **Automation** | ❌ Manual — **gap:** FSD UC-02 AF-7 (`url.replace(/\/$/, "")`) has no automated test in the current suites |
| **Requirement** | UC-02 AF-7 (FSD §3.1.3), FSD §3.1.8 contract |
| **Preconditions** | Access to `validateBackendUrl` |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `validateBackendUrl('http://127.0.0.1:48721/')` | Returns `http://127.0.0.1:48721` (one trailing slash removed, no throw) |
| 2 | `validateBackendUrl('https://api.enterprise.internal/kb/')` | Returns `https://api.enterprise.internal/kb` |
| 3 | `validateBackendUrl('http://remote.server.internal:48721/', { allowInsecureRemote: false })` | Still throws `/Insecure backend URL rejected/` — strip happens **before** loopback/remote decision; stripped URL does not turn remote into loopback |
| 4 | `validateBackendUrl('http://remote.server.internal:48721/', { allowInsecureRemote: true })` | Returns `http://remote.server.internal:48721` (cleaned, no slash) |

**Test Data:** URLs with trailing `/` (`testdata/url-validation-testdata.csv` rows S-01…S-04)
**Postconditions:** Persisted URL is the cleaned (slash-stripped) form.

---

## 5. Fail-Closed & Default Guard Test Cases

### TC-12: Non-boolean / missing flag fails closed (strict === true)

| Field | Value |
|-------|-------|
| **ID** | TC-12 |
| **Priority** | High |
| **Type** | Functional / Security |
| **Level** | IT |
| **Automation** | ✅ Automated — `knowledge-client-bypass.test.ts` → `it('bypass OFF / missing → getAllowInsecureRemote returns false (fail-closed)')` (asserts `false`, deleted key → `false`, string `"true"` → `false`); enforcement path: `it('bypass missing (flag OFF default) + remote HTTP → still rejects (default behavior unchanged)')` |
| **Requirement** | BR-10, UC-02 AF-5, V3/V4, FSD §10 TC-12 |
| **Preconditions** | Mocked `vscode.workspace.getConfiguration` (pattern in `knowledge-client-bypass.test.ts`) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `mockConfig['backend.allowInsecureRemote'] = false` → `getAllowInsecureRemote()` | `false` |
| 2 | `delete mockConfig['backend.allowInsecureRemote']` → `getAllowInsecureRemote()` | `false` (undefined → fail-closed) |
| 3 | `mockConfig['backend.allowInsecureRemote'] = 'true'` → `getAllowInsecureRemote()` | `false` (string truthy does NOT enable — strict `=== true`) |
| 4 | Config remote HTTP + flag missing → `getBackendUrl()` / `new KnowledgeClient(url)` | Throws `/Insecure backend URL rejected/` (enforcement ON) |

**Test Data:** flag ∈ {`false`, deleted, `"true"`}, URL = `http://remote.server.internal:48721` (`testdata/knowledge-client-testdata.csv`)
**Postconditions:** Missing/invalid flag can never relax enforcement.

---

### TC-14: Default-never-true guard (regression pin)

| Field | Value |
|-------|-------|
| **ID** | TC-14 |
| **Priority** | High |
| **Type** | Regression |
| **Level** | UT |
| **Automation** | ✅ Automated — `backend-url.test.ts` → `it('package.json declares the setting as boolean with default false')` (same manifest assertion as TC-01; suite **fails** if default ever ≠ `false`) + OFF-branch tests fail if remote-HTTP rejection removed |
| **Requirement** | BR-01, BR-04, BRD US-5 validation rule, FSD §10 TC-14 |
| **Preconditions** | CI/local `npm test` runs the suite |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run `npm test` in `extension/` | Manifest guard passes (`default === false`, `type === boolean`) |
| 2 | (Negative proof — do not commit) Change manifest default to `true` locally | Suite **fails** at manifest guard → proves the pin works; revert |
| 3 | (Negative proof) Remove OFF-branch rejection from validator | TC-02 tests fail → suite red; revert |

**Test Data:** `extension/package.json` (read-only in normal runs)
**Postconditions:** Transport-security baseline cannot silently regress (AC7).

---

## 6. Integration Test Cases — Knowledge-Client Flag Forwarding (BR-09 / OI-1)

> All TC-16…TC-18 are automated in `extension/src/config/__tests__/knowledge-client-bypass.test.ts` (**12 tests**, verified pass — RUN-LOG #7). Common setup: `vi.mock('vscode')` config map; `REMOTE_HTTP = 'http://remote.server.internal:48721'`; `CODE_INTEL_PORT` env deleted.

### TC-16: KnowledgeClient / getBackendUrl / resolveKbBaseUrl accept remote HTTP with bypass ON

| Field | Value |
|-------|-------|
| **ID** | TC-16 |
| **Priority** | High |
| **Type** | Integration |
| **Level** | IT |
| **Automation** | ✅ Automated — `knowledge-client-bypass.test.ts`: `it('bypass ON + remote HTTP → getAllowInsecureRemote reads true from config')`, `it('bypass ON + remote HTTP → getBackendUrl accepts remote URL')`, `it('bypass ON + remote HTTP → resolveKbBaseUrl succeeds with remote URL')`, `it('bypass ON + remote HTTP → new KnowledgeClient does NOT throw (Finding #1 regression)')` |
| **Requirement** | BR-09, OI-1 (Resolved), UC-04 EF-2, FSD §10 TC-16 |
| **Preconditions** | `mockConfig['backend.url'] = REMOTE_HTTP`; flag `true`; `CODE_INTEL_PORT` unset |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Set `mockConfig['backend.allowInsecureRemote'] = true` | `getAllowInsecureRemote() === true` |
| 2 | `getBackendUrl()` | Returns `http://remote.server.internal:48721` (no throw) |
| 3 | `resolveKbBaseUrl()` | Returns `http://remote.server.internal:48721` |
| 4 | `new KnowledgeClient(REMOTE_HTTP)` | Does **not** throw; instance of `KnowledgeClient` |
| 5 | Assert `console.warn` | Called with `/\[Security\] WARNING: Insecure remote backend URL allowed/` (warning still emitted while accepted) |

**Test Data:** `http://remote.server.internal:48721`, flag `true`
**Postconditions:** SDR Finding #1 stays fixed — bypass flows end-to-end to KB client.

---

### TC-17: KnowledgeClient rejects remote HTTP with bypass OFF / missing / string

| Field | Value |
|-------|-------|
| **ID** | TC-17 |
| **Priority** | High |
| **Type** | Integration / Security |
| **Level** | IT |
| **Automation** | ✅ Automated — `knowledge-client-bypass.test.ts`: `it('bypass OFF + remote HTTP → getBackendUrl still rejects (enforcement unchanged)')`, `it('bypass OFF + remote HTTP → new KnowledgeClient still throws [Security]')`, `it('bypass missing (flag OFF default) + remote HTTP → still rejects (default behavior unchanged)')` |
| **Requirement** | BR-09, BR-10, FSD §10 TC-17 |
| **Preconditions** | Flag `false` or deleted; URL = REMOTE_HTTP |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Flag `false` → `getBackendUrl()` | Throws `/Insecure backend URL rejected/` |
| 2 | Flag `false` → `new KnowledgeClient(REMOTE_HTTP)` | Throws `/\[Security\] Insecure backend URL rejected/` |
| 3 | Flag deleted → `new KnowledgeClient(REMOTE_HTTP)` | Throws `/\[Security\] Insecure backend URL rejected/` |

**Test Data:** flag ∈ {`false`, deleted}; URL = `http://remote.server.internal:48721`
**Postconditions:** Enforcement unchanged for non-opted-in users (AC4 regression guard at consumer level).

---

### TC-18: resolveKbBaseUrl fail-closed fallback to loopback default

| Field | Value |
|-------|-------|
| **ID** | TC-18 |
| **Priority** | High |
| **Type** | Integration |
| **Level** | IT |
| **Automation** | ✅ Automated — `knowledge-client-bypass.test.ts` → `it('bypass OFF + remote HTTP → resolveKbBaseUrl falls back to loopback default (fail-closed)')` |
| **Requirement** | BR-09, BR-10, FSD §10 TC-18, FSD §5.3 |
| **Preconditions** | `backend.url` = remote HTTP; flag OFF; `CODE_INTEL_PORT` unset |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Config: remote HTTP + flag `false` | `resolveKbBaseUrl()` returns **`http://127.0.0.1:48721`** (loopback default) — **does not throw** |
| 2 | Contrast with `getBackendUrl()` same config | Throws `[Security]` (KB resolver catches and falls back) |

**Test Data:** `http://remote.server.internal:48721` + flag false → expect `http://127.0.0.1:48721`
**Postconditions:** KB resolution degrades safely to loopback, never to insecure remote.

---

## 7. SIT Test Cases — Error Handling & State Fallbacks (manual)

### TC-21: Toggle bypass OFF while stored remote HTTP URL → fail-closed consumers

| Field | Value |
|-------|-------|
| **ID** | TC-21 |
| **Priority** | Medium |
| **Type** | Functional — Exception Flow |
| **Level** | SIT |
| **Automation** | ❌ Manual — known availability behavior (OI-5 / Finding #5), no automated test |
| **Requirement** | UC-04 EF-1, FSD §9.1 scenario 6 |
| **Preconditions** | Bypass ON; `kiroSdlc.backend.url` = `http://remote.server.internal:48721` saved successfully |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | With bypass ON, Save `http://remote.server.internal:48721` | "Saved ✓" |
| 2 | Uncheck bypass (flag → `false`) | Warning hidden; workspace flag `false` |
| 3 | Trigger a consumer that resolves the URL (open sidebar tree-view / panel that calls `getBackendUrl()`) | Throws/surfaces `[Security] Insecure backend URL rejected …` (fail-closed — **no insecure transmission**) |
| 4 | Remediation: enter `https://…` or loopback and Save | Error clears; consumer works |

**Test Data:** `http://remote.server.internal:48721` → flag ON→OFF (`testdata/error-scenario-testdata.csv` row X-01)
**Postconditions:** Security preserved; availability degradation documented as OI-5 (not a new defect).

---

### TC-22: state message missing allowInsecureRemote → safe default rendering

| Field | Value |
|-------|-------|
| **ID** | TC-22 |
| **Priority** | Medium |
| **Type** | Functional — Exception Flow |
| **Level** | SIT (E2E-UI candidate) |
| **Automation** | ❌ Manual — `handleState()` branch untested in CI (OI-10) |
| **Requirement** | UC-03 EF-1, FSD §9.1 scenario 7, BRD US-3 error handling |
| **Preconditions** | Settings panel load path; ability to simulate `state` without the field (debug/harness) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Simulate incoming `{ type: "state" }` **without** `allowInsecureRemote` field | `handleState()` skips branch → checkbox **unchecked**, warning **hidden** |
| 2 | Verify no phantom ON state | No warning shown in default secure state |
| 3 | Next real `state` including `allowInsecureRemote: true` | Checkbox + warning restored correctly |

**Test Data:** `testdata/ui-message-testdata.csv` row M-10 (state payload without field)
**Postconditions:** Safe fallback; no confusing risk message when field absent.

---

### TC-23: Persistence failure on toggle → fail-closed, no user feedback (OI-9 known)

| Field | Value |
|-------|-------|
| **ID** | TC-23 |
| **Priority** | Medium |
| **Type** | Functional — Exception Flow / Reliability |
| **Level** | SIT |
| **Automation** | ❌ Manual — handler has no try/catch (OI-9 open by design gap) |
| **Requirement** | UC-01 EF-1, FSD §9.1 scenario 4, BR-10 |
| **Preconditions** | Workspace settings file made read-only (or `config.update` forced to reject) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Make `.vscode/settings.json` read-only | — |
| 2 | Check bypass checkbox | UI checkbox stays checked **optimistically**; **no error message posted** (OI-9 — known behavior, zero feedback) |
| 3 | Inspect stored value | Unchanged (previous value / default `false`) — write rejected |
| 4 | Click Save URL with remote HTTP | **Rejected** `[Security] Insecure backend URL rejected` — enforcement reads stored value (fail-closed), NOT the optimistic checkbox |

**Test Data:** read-only workspace settings file; URL `http://remote.server.internal:48721` (`testdata/error-scenario-testdata.csv` row X-02)
**Postconditions:** Enforcement authority = config read at validation time; stored state unchanged.

---

### TC-24: backend.url persistence failure after validation accepted (flag unchanged)

| Field | Value |
|-------|-------|
| **ID** | TC-24 |
| **Priority** | Medium |
| **Type** | Functional — Exception Flow |
| **Level** | SIT |
| **Automation** | ❌ Manual — config-write failure path not covered by the two feature suites (same harness as TC-23; **BA-gate added**) |
| **Requirement** | UC-02 EF-3, FSD §6.1 step 8, FSD §3.1.3 UC-02 |
| **Preconditions** | Validation must accept the URL: bypass **ON** (checkbox checked) **or** URL = loopback; Settings panel open; ability to make `.vscode/settings.json` read-only |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Pre-set variant: bypass ON (or loopback URL) so validation will accept | Flag / URL ready per chosen variant |
| 2 | Make `.vscode/settings.json` read-only | Subsequent `config.update` for `backend.url` will fail |
| 3 | Enter `http://remote.server.internal:48721` (bypass-ON variant) → click **Save URL** | Validation **passes** — **no** `[Security] Insecure backend URL rejected` (bypass honored); Save fails at the subsequent **configuration-write** step (FSD UC-02 EF-3: "Save fails with a configuration-write error") |
| 4 | Inspect bypass flag in `.vscode/settings.json` | Flag **unchanged** (still `true`) — only the URL write failed (EF-3: "the bypass flag itself is unchanged") |
| 5 | Restore `.vscode/settings.json` writable → click **Save URL** again | Save succeeds — "Saved ✓"; URL persisted (user retry path) |

**Test Data:** `http://remote.server.internal:48721` + bypass ON; read-only settings file (inline vectors in §8.4 — QA to append row X-03 to `testdata/error-scenario-testdata.csv`)
**Postconditions:** Validation outcome and persistence outcome are distinct; a failed URL save never side-effects the bypass flag; retry after remediation succeeds.

---

### TC-25: Test Connection rejects remote HTTP before network I/O (bypass OFF)

| Field | Value |
|-------|-------|
| **ID** | TC-25 |
| **Priority** | High |
| **Type** | Functional / Security |
| **Level** | SIT |
| **Automation** | ❌ Manual — end-to-end Test button path with network observation not covered by the two feature suites (**BA-gate added**) |
| **Requirement** | AC4, BR-04, UC-02 AF-4, UC-04 AF-1, FSD §9.1 scenario 1 ("Reject **before** network I/O") |
| **Preconditions** | Settings panel open; bypass **OFF**; DevTools **Network** tab open, filtered to the remote host |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Enter `http://remote.server.internal:48721`, leave bypass **OFF** | Baseline secure state |
| 2 | Click **Test Connection** | Failure surfaced: `[Security] Insecure backend URL rejected …` in the test-result indicator |
| 3 | Inspect DevTools **Network** tab | **Zero** outbound requests to the remote host — no `GET /health` (rejection occurs **before** any network I/O — FSD §9.1 #1) |
| 4 | Control: change URL to loopback `http://127.0.0.1:48721` → click **Test Connection** | Validation accepts → `GET http://127.0.0.1:48721/health` **attempted** (Test path works when validation passes) |
| 5 | Enable bypass **ON**, restore remote HTTP URL → click **Test Connection** | Validation accepts (bypass honored on the Test path — UC-02 AF-4) → `GET …/health` **attempted** to remote host + `[Security] WARNING…` in console |

**Test Data:** `http://remote.server.internal:48721`, `http://127.0.0.1:48721`; flag OFF→ON (inline vectors in §8.4 — QA to append row X-04 to `testdata/error-scenario-testdata.csv`)
**Postconditions:** BR-04 verified on the Test path — no request is ever attempted to an insecure remote while bypass OFF; Test shares the flag-aware validator (UC-02 AF-4).

---

## 8. Test Data

Test data lives as CSV files in `documents/SA4E-320/testdata/` (files: `pre-seeded-config-testdata.csv`, `url-validation-testdata.csv`, `knowledge-client-testdata.csv`, `ui-message-testdata.csv`, `error-scenario-testdata.csv`). Key vectors:

### 8.1 URL & Flag Vectors (validation — TC-02…TC-06, TC-11, TC-19, TC-20)

| test_case_id | url | allow_insecure_remote | expected_result |
|--------------|-----|----------------------|-----------------|
| TC-02 | `http://remote.server.internal:48721` | (unset) | REJECT — `[Security] Insecure backend URL rejected` |
| TC-02 | `http://192.168.1.100:48721` | `false` | REJECT — `[Security] Insecure backend URL rejected` |
| TC-03 | `https://api.enterprise.internal/kb` | `false` | ACCEPT — returns input |
| TC-03 | `https://my-backend.corp.com:8443` | `false` | ACCEPT — returns input |
| TC-04 | `http://127.0.0.1:48721` | `false` | ACCEPT — returns input |
| TC-04 | `http://localhost:3000` | `false` | ACCEPT — returns input |
| TC-04 | `http://[::1]:8080` | `false` | ACCEPT — returns input |
| TC-05 | `http://remote.server.internal:48721` | `true` | ACCEPT + `console.warn` contains `[Security] WARNING: Insecure remote backend URL allowed (allowInsecureRemote=true)` + `Credentials and data can be intercepted (MITM)` + `Only use on trusted private networks` |
| TC-06 | `http://127.0.0.1:48721` | `true` | ACCEPT — no `console.warn` |
| TC-06 | `https://api.enterprise.internal` | `true` | ACCEPT — no `console.warn` |
| TC-11 | `ftp://remote.server.internal:21` | `true` | REJECT — `[Security] Invalid backend URL protocol` |
| TC-11 | `ws://remote.server.internal` | `true` | REJECT — `[Security] Invalid backend URL protocol` |
| TC-11 | `not a valid url` | `true` | REJECT — `[Security] Malformed backend URL` |
| TC-11 | `http://` | `false` | REJECT — `[Security] Malformed backend URL` |
| TC-19 | `` (empty) / `undefined` | any | RETURN `http://127.0.0.1:48721` (no throw) |
| TC-20 | `http://127.0.0.1:48721/` | `false` | ACCEPT — returns `http://127.0.0.1:48721` (slash stripped) |
| TC-20 | `http://remote.server.internal:48721/` | `false` | REJECT — `[Security] Insecure backend URL rejected` |
| TC-20 | `http://remote.server.internal:48721/` | `true` | ACCEPT — returns `http://remote.server.internal:48721` |

### 8.2 Knowledge-Client Vectors (TC-12, TC-16…TC-18)

| test_case_id | backend.url | allow_insecure_remote | expected_result |
|--------------|-------------|----------------------|-----------------|
| TC-16 | `http://remote.server.internal:48721` | `true` | `getBackendUrl()` = remote URL; `resolveKbBaseUrl()` = remote URL; `new KnowledgeClient(url)` no throw + warn emitted |
| TC-17 | `http://remote.server.internal:48721` | `false` | All throw `[Security] Insecure backend URL rejected` |
| TC-17 | `http://remote.server.internal:48721` | (deleted) | `new KnowledgeClient` throws `[Security] Insecure backend URL rejected` |
| TC-12 | `http://remote.server.internal:48721` | `"true"` (string) | `getAllowInsecureRemote()` = `false`; enforcement rejects |
| TC-18 | `http://remote.server.internal:48721` | `false` | `resolveKbBaseUrl()` = `http://127.0.0.1:48721` (fallback, no throw) |
| TC-04 | `http://127.0.0.1:48721` / `http://localhost:9999` | `false` / `true` | `new KnowledgeClient` never throws (loopback) |

### 8.3 UI / Message Vectors (TC-07…TC-10, TC-13, TC-15, TC-22)

| test_case_id | scenario / payload | expected_result |
|--------------|--------------------|-----------------|
| TC-07 | Fresh settings, flag unset | Checkbox `#allow-insecure-remote-chk` present below URL input, label exact, unchecked |
| TC-08 | Toggle ON | `#allow-insecure-remote-warning` visible with exact ⚠️ copy, amber; toggle OFF → hidden |
| TC-09 | flag `true` → close/reopen/reload panel | Checkbox checked + warning visible from `state.allowInsecureRemote` |
| TC-10 | `{ type: "setAllowInsecureRemote", enabled: true }` | Workspace `kiroSdlc.backend.allowInsecureRemote = true` immediately |
| TC-13 | Toggle ON → immediate Save with remote HTTP | Save accepted (FIFO ordering) |
| TC-15 | `{ enabled: "true" }` / `1` / `{}` | Persisted value = `false` (coerced) |
| TC-15 | `{ enabled: true }` | Persisted value = `true` |
| TC-22 | `{ type: "state" }` without `allowInsecureRemote` | Checkbox unchecked, warning hidden |

### 8.4 Error Scenario Vectors (TC-21, TC-23)

| test_case_id | setup | expected_result |
|--------------|-------|-----------------|
| TC-21 | Stored URL `http://remote.server.internal:48721`, flag ON → set OFF → consumer resolves URL | `[Security] Insecure backend URL rejected` surfaced; no outbound HTTP |
| TC-23 | settings.json read-only → toggle ON → Save remote HTTP | Write rejected (silent, OI-9); Save still rejected fail-closed |
| TC-24 | settings.json read-only → bypass ON → Save remote HTTP (validation accepts) | No `[Security]` rejection; URL write fails (config-write error path); **bypass flag unchanged**; retry after writable → "Saved ✓" |
| TC-25 | bypass OFF → Test Connection with remote HTTP | `[Security] Insecure backend URL rejected` shown; **0** outbound requests (no `GET /health`); control: loopback / bypass-ON → request attempted |

### 8.5 Pre-seeded Baseline (reset before each SIT run)

| id | setting key | value | description |
|----|-------------|-------|-------------|
| P-01 | `kiroSdlc.backend.allowInsecureRemote` | (unset / `false`) | Fresh secure default before TC-07 |
| P-02 | `kiroSdlc.backend.url` | `http://127.0.0.1:48721` | Safe loopback baseline |
| P-03 | `kiroSdlc.backend.allowInsecureRemote` | `true` | Pre-state for TC-09 restore / TC-21 ON→OFF |

---

## 9. Requirements Traceability Matrix (RTM)

| Requirement | Source | Test Cases | Coverage |
|-------------|--------|------------|----------|
| AC1 — setting boolean default `false` | BRD 2.2 / FSD §3.1.5 | TC-01, TC-14 | ✅ |
| AC2 — checkbox placement + default OFF | BRD 2.2 / UI-SPEC §1 | TC-07 | ✅ |
| AC3 — warning in warning color ON / hidden OFF | BRD 2.2 / UI-SPEC §2 | TC-08, TC-22 | ✅ |
| AC4 — OFF: HTTP reject; HTTPS + loopback accept | BRD 2.2 | TC-02, TC-03, TC-04, TC-25 (Test-path, before network I/O) | ✅ |
| AC5 — ON: accept remote HTTP + console warning | BRD 2.2 | TC-05, TC-06 | ✅ |
| AC6 — message handler + webview + workspace persistence | BRD 2.2 | TC-09, TC-10, TC-13, TC-15, TC-23 | ✅ |
| AC7 — unit tests both branches | BRD 2.2 | TC-01…TC-06, TC-11, TC-14 (backend-url.test.ts, 11 tests) | ✅ |
| BR-01 Secure-by-default | BRD §3 | TC-01, TC-14 | ✅ |
| BR-02 Opt-in only | BRD §3 | TC-10 (+ SDR review) | ✅ |
| BR-03 Warning mandatory while ON | BRD §3 | TC-05, TC-08 | ✅ |
| BR-04 OFF = legacy behavior | BRD §3 | TC-02, TC-03, TC-04, TC-25 | ✅ |
| BR-05 ON = accept + warn | BRD §3 | TC-05 | ✅ |
| BR-06 Loopback exemption unchanged | BRD §3 | TC-04, TC-06 | ✅ |
| BR-07 Bypass scope = scheme only | BRD §3 | TC-11 | ✅ |
| BR-08 State persistence + fresh read | BRD §3 | TC-09, TC-10, TC-13 | ✅ |
| BR-09 Downstream consistency (KB client) | BRD §3 | TC-16, TC-17, TC-18 (knowledge-client-bypass.test.ts, 12 tests) | ✅ |
| BR-10 Fail-closed missing/invalid flag | BRD §3 | TC-12, TC-15, TC-17, TC-23 | ✅ |
| BR-11 Security Design Review gate | BRD §3 | SECURITY-REPORT.md (artifact gate) | ✅ |
| UC-01 Configure Bypass ON (+ EF-1/EF-3) | FSD §3.1.3 | TC-07, TC-08, TC-10, TC-15, TC-23 | ✅ |
| UC-02 Validate URL (+ AF-1…AF-7, EF-1…EF-3) | FSD §3.1.3 | TC-02…TC-06, TC-11, TC-12, TC-13, TC-19, TC-20, TC-24, TC-25 | ✅ |
| UC-03 Persist & Restore (+ EF-1) | FSD §3.1.3 | TC-09, TC-10, TC-13, TC-22 | ✅ |
| UC-04 Reject when OFF (+ EF-1) | FSD §3.1.3 | TC-02, TC-21 | ✅ |
| FSD §9 Error scenarios 1–8 | FSD §9.1 | 1→TC-02 + TC-25 (Test path, before network I/O); 2→TC-11; 3→TC-11; 4→TC-23; 5→TC-05; 6→TC-21; 7→TC-22; 8→TC-12/TC-15 | ✅ |
| US-1…US-5 | BRD §2.2 | US-1→TC-01/02/03/04/25; US-2→TC-05/07; US-3→TC-08; US-4→TC-09/10; US-5→TC-01…06/11/14 | ✅ |

**Coverage Summary:**

| Category | Total | Covered | Coverage % |
|----------|-------|---------|------------|
| Acceptance Criteria | 7 | 7 | **100%** |
| Business Rules | 11 | 11 | **100%** |
| Use Cases (UC-01…UC-04) | 4 | 4 | **100%** |
| User Stories (US-1…US-5) | 5 | 5 | **100%** |
| FSD §10 TC-01…TC-19 | 19 | 19 | **100%** |
| FSD §9 Error Scenarios | 8 | 8 | **100%** |
| BA-gate flow coverage (UC-02 EF-3, UC-02 AF-4) | 2 | 2 | **100%** |
| **Overall** | **56** | **56** | **100%** |

---

## 10. Appendix

### A. Automated ↔ Manual Quick Map

| TC | Level | Automation status |
|----|-------|-------------------|
| TC-01 | UT | ✅ `backend-url.test.ts` (11-test suite) |
| TC-02 | UT | ✅ `backend-url.test.ts` |
| TC-03 | UT | ✅ `backend-url.test.ts` |
| TC-04 | UT | ✅ `backend-url.test.ts` + `knowledge-client-bypass.test.ts` |
| TC-05 | UT | ✅ `backend-url.test.ts` |
| TC-06 | UT | ✅ `backend-url.test.ts` |
| TC-07 | E2E-UI | ❌ Manual SIT |
| TC-08 | E2E-UI | ❌ Manual SIT |
| TC-09 | E2E-UI | ❌ Manual SIT (state assembly partly in `ProviderConfigService.test.ts`) |
| TC-10 | SIT | ❌ Manual |
| TC-11 | UT/IT | ✅ both suites |
| TC-12 | IT | ✅ `knowledge-client-bypass.test.ts` (12-test suite) |
| TC-13 | SIT | ❌ Manual |
| TC-14 | UT | ✅ `backend-url.test.ts` manifest guard |
| TC-15 | SIT | ❌ Manual |
| TC-16 | IT | ✅ `knowledge-client-bypass.test.ts` |
| TC-17 | IT | ✅ `knowledge-client-bypass.test.ts` |
| TC-18 | IT | ✅ `knowledge-client-bypass.test.ts` |
| TC-19 | UT | ❌ Manual (automation gap — TDD claims coverage, file lacks it) |
| TC-20 | UT | ❌ Manual (automation gap — AF-7 untested) |
| TC-21 | SIT | ❌ Manual (OI-5 known behavior) |
| TC-22 | SIT | ❌ Manual (OI-10) |
| TC-23 | SIT | ❌ Manual (OI-9 known behavior) |
| TC-24 | SIT | ❌ Manual (UC-02 EF-3 — added by BA gate) |
| TC-25 | SIT | ❌ Manual (UC-02 AF-4 / Test reject-before-network — added by BA gate) |

### B. Environment Configuration

- Run automated: `cd extension && npm test` (vitest) — expect `backend-url.test.ts` **11 pass**, `knowledge-client-bypass.test.ts` **12 pass**, full suite **102 total pass**, `tsc` clean (per RUN-LOG #7).
- Manual SIT: launch extension host → Settings → Server Settings → Backend MCP Server card; open Developer Tools for `[Security]` console assertions.
- Reset data: restore `testdata/pre-seeded-config-testdata.csv` baseline into `.vscode/settings.json` between manual runs.

### C. Reference Documents

| Document | Location |
|----------|----------|
| STP | `documents/SA4E-320/STP.md` |
| BRD / FSD / TDD / UI-SPEC / SECURITY-REPORT | `documents/SA4E-320/*.md` |
| Test data CSVs | `documents/SA4E-320/testdata/` |
| Verified run evidence | `documents/SA4E-320/RUN-LOG.md` (#4, #5, #7) |
