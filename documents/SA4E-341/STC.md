# Software Test Cases (STC)

## SDLC-Agents-4-Enterprise E2E Testing Framework — SA4E-341: [E2E Testing] Serenity/JS + wdio-vscode-service for VSCode-based IDEs (Kiro/Antigravity/Kilo)

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-341 |
| Title | [E2E Testing] Serenity/JS + wdio-vscode-service for VSCode-based IDEs (Kiro/Antigravity/Kilo) |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-10-09 |
| Status | Draft |
| Related STP | documents/SA4E-341/STP.md v1.0 |
| Related FSD | documents/SA4E-341/FSD.md v1.0 (UC-01..UC-07, BR-01..BR-08) |
| Related TDD | documents/SA4E-341/TDD.md v1.0 (root e2e/, SPIKE-1..4, Implementation Checklist §8) |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-09 | QA Agent | Initiate document — 22 test cases across 6 levels (PBT 2, UT 4, IT 3, E2E-API 7, E2E-UI 4, SIT 2), traceable to BRD US-01..07, FSD UC-01..07, BR-01..08 |

---

## Test Case Summary

| TC ID | Title | Level | Related Req | Priority | Automated |
|-------|-------|-------|-------------|----------|-----------|
| TC-01 | PBT — env-config validation: resolveE2EEnv throws EnvConfigError for any invalid E2E_IDE | PBT | UC-02, BR-01 | Medium | Yes |
| TC-02 | PBT — chromedriver ↔ Electron version mapping table consistency | PBT | UC-01, UC-03, BR-07 | Medium | Yes |
| TC-03 | UT — Screenplay Tasks (OpenEditor, RunCommand) with mock WDIO | UT | UC-04, BR-04 | High | Yes |
| TC-04 | UT — Screenplay Questions (ActiveTabText, IsPanelVisible) with mock WDIO | UT | UC-04, BR-04 | High | Yes |
| TC-05 | UT — step definitions delegation-only audit (no raw WDIO — BR-04) | UT | UC-04, BR-04 | High | Yes |
| TC-06 | IT — wdio.conf.ts config contract validates FSD §5.2 schema (retry 2, maxInstances 1, reporters) | IT | UC-02, BR-03, BR-08 | High | Yes |
| TC-07 | IT — env→capabilities mapping (binaryPath, workspacePath, vscodeArgs, userSettings — BR-01/BR-05) | IT | UC-02, BR-01, BR-05 | High | Yes |
| TC-08 | IT — Serenity cast + Cucumber glue registration in-process (actorCalled QA) | IT | UC-01, UC-02, UC-06 | High | Yes |
| TC-09 | E2E-API — wdio-vscode-service capabilities resolution + IDE launch (maxInstances=1) | E2E-API | UC-01, UC-03 | High | Yes |
| TC-10 | E2E-API — skeleton one-command run: npm run test:e2e exits 0, report generated, scenario under 60s | E2E-API | UC-02, UC-06, BR-06 | High | Yes |
| TC-11 | E2E-UI — workbench open-editor journey via WDIO + Serenity/JS + wdio-vscode-service | E2E-UI | UC-01, UC-04, BR-07 | High | Yes |
| TC-12 | E2E-UI — terminal/extension command run journey (commands/run-extension-command.feature) | E2E-UI | UC-04 | High | Yes |
| TC-13 | SIT — webview visual layout manual check (chat panel iframe rendering) | SIT | UC-05, BR-05 | Medium | No |
| TC-14 | SIT — AI chat panel UX manual check (layout, responsiveness) | SIT | UC-05 | Medium | No |
| TC-15 | E2E-UI — webview switchFrame interaction: chat message sent, reply renders | E2E-UI | UC-05 | High | Yes |
| TC-16 | E2E-UI — report generated on failed step with automatic screenshot (BR-08) | E2E-UI | UC-06, BR-08 | High | Yes |
| TC-17 | E2E-API — chromedriver auto-detection matches IDE Electron runtime | E2E-API | UC-01, UC-02, UC-03 | High | Yes |
| TC-18 | E2E-API — headless CI run on Linux xvfb: exit code reflects result, budget 15 min | E2E-API | UC-07, BR-06 | High | Yes |
| TC-19 | E2E-API — fail-fast: E2E_IDE_BINARY_PATH missing aborts before IDE launch (BR-01) | E2E-API | UC-02, BR-01 | High | Yes |
| TC-20 | E2E-API — flaky scenario: retry limit 2, persistent failure flagged not masked (BR-03) | E2E-API | UC-04, UC-07, BR-03 | Medium | Yes |
| TC-21 | UT — committed-config hygiene: no hardcoded paths, no secrets (BR-01, BR-02) | UT | UC-02, UC-07, BR-01, BR-02 | High | Yes |
| TC-22 | E2E-API — regression: existing extension vitest + backend Node tests still pass | E2E-API | UC-02 | High | Yes |

> **Notation:** Level field per test case (PBT / UT / IT / E2E-API / E2E-UI / SIT). SA4E-341 has no REST API — **E2E-API** = process/CLI-level E2E (real `npm run test:e2e` / `npm test` runs spawned as child processes, verified by exit codes + artifacts). **E2E-UI** = WDIO v9 + wdio-vscode-service + Serenity/JS Screenplay against the real IDE. **SIT** = manual visual/UX-only.

**Shared preconditions (all automated cases):** repo `C:\projects\kiro\SDLC-Agents-4-Enterprise`; Node.js 22.x + npm; `e2e/` dependencies installed (`npm --prefix e2e install`); env vars set per `testdata/test-data-env.csv` (never committed — BR-01). Baseline local env: `E2E_IDE=code`, `E2E_IDE_BINARY_PATH=C:\Users\ASUS\AppData\Local\Programs\Microsoft VS Code\Code.exe` (example), optional `E2E_BASE_URL=<fixture workspace>`, `E2E_HEADLESS=false`.

---

## 1. Test Cases — PBT (Property-Based)

### TC-01: PBT — env-config validation (resolveE2EEnv throws for any invalid input)

| Field | Value |
|-------|-------|
| **ID** | TC-01 |
| **Priority** | Medium |
| **Type** | Property-Based (fast-check + vitest) |
| **Level** | PBT |
| **Requirement** | UC-02 (FSD 3.2 EF-1), BR-01, TDD §7.2 |
| **Preconditions** | e2e/src/support/env.ts implemented per TDD §7.2; fast-check + vitest installed in e2e/ |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Property 1: generate arbitrary strings NOT in VALID_IDES = ['kiro','code','antigravity','kilo'] and set E2E_IDE to each | resolveE2EEnv() throws EnvConfigError for EVERY invalid value; error message lists the valid enum |
| 2 | Property 2: generate values inside VALID_IDES with an existing binary path (temp fixture file) | resolveE2EEnv() returns a valid E2EEnv object; no throw |
| 3 | Property 3: generate arbitrary non-existent paths for E2E_IDE_BINARY_PATH | resolveE2EEnv() throws EnvConfigError naming the env var — fail fast (BR-01) |
| 4 | Verify counterexample shrinking on any failure | fast-check reports minimal counterexample; test fails with reproducible input |

**Test Data:** invalid E2E_IDE values: "jetbrains", "", "vscode-fork", "CODE"; valid: "kiro", "code", "antigravity", "kilo"; binary paths: existing temp fixture (e.g., os.tmpdir() + "/e2e-fake-ide.cmd") vs non-existent "Z:\no-such-ide.exe".
**Postconditions:** no side effects — resolveE2EEnv is pure (reads process.env + fs only).

---

### TC-02: PBT — chromedriver ↔ Electron version mapping table consistency

| Field | Value |
|-------|-------|
| **ID** | TC-02 |
| **Priority** | Medium |
| **Type** | Property-Based (fast-check + vitest) |
| **Level** | PBT |
| **Requirement** | UC-01 (FSD 3.1), UC-03 (FSD 3.3), BR-07, TDD §11.2 (SPIKE-2) |
| **Preconditions** | Compatibility matrix committed at documents/SA4E-341/spikes/compatibility-matrix.md (SPIKE-2 output) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Load the committed compatibility matrix rows (ide, ide_version, cdp_attach, electron_version, chromedriver_version) | Every row parses; cdp_attach is one of go / no-go / blocked |
| 2 | Property: for every row where cdp_attach = "go", chromedriver_version is non-empty AND major version is compatible with electron_version per the chromedriver-Electron mapping rule | Property holds for ALL go rows — no mismatched mapping committed |
| 3 | Property: every row (any result) has evidence — committed smoke_scenario ref or documented blocker | No verbal-only conclusions (BR-07) |
| 4 | If a counterexample is found, shrink to the minimal offending IDE row | Test reports the specific IDE row violating the mapping |

**Test Data:** matrix rows for Kiro (electron 32.2.0, chromedriver 128.0.6613.84), Antigravity IDE, Kilo per testdata/test-cases.csv.
**Postconditions:** mapping table remains committed and unchanged; mismatches raised as defects.

---

## 2. Test Cases — UT (Unit)

### TC-03: UT — Screenplay Tasks (OpenEditor, RunCommand) with mock WDIO

| Field | Value |
|-------|-------|
| **ID** | TC-03 |
| **Priority** | High |
| **Type** | Unit Test (vitest, mock WDIO handle) |
| **Level** | UT |
| **Requirement** | UC-04 (FSD 3.4), BR-04, TDD §6.3 |
| **Preconditions** | e2e/src/screenplay/tasks/*.ts implemented; vitest configured in e2e/ |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create an actor with a mocked BrowseTheWebWithWebdriverIO handle (test double exposing workbench().getEditorView().openFile and executeCommand) | Actor created with the ability bound to the mock |
| 2 | Perform OpenEditor.at("extension/src/extension.ts") | Mock receives openFile called exactly once with the typed path argument |
| 3 | Perform RunCommand("sdlcAgents.openAgenticChat") | Mock receives executeCommand called exactly once with the command constant |
| 4 | Verify task naming convention: Task.where("#actor opens the editor at ...") — verb naming | Task descriptions are verb phrases (BR-04 / FSD UC-04 validation rules) |

**Test Data:** path "extension/src/extension.ts"; command "sdlcAgents.openAgenticChat" (real activation event from extension/package.json).
**Postconditions:** no IDE spawned; mock discarded.

---

### TC-04: UT — Screenplay Questions (ActiveTabText, IsPanelVisible) with mock WDIO

| Field | Value |
|-------|-------|
| **ID** | TC-04 |
| **Priority** | High |
| **Type** | Unit Test (vitest, mock WDIO handle) |
| **Level** | UT |
| **Requirement** | UC-04 (FSD 3.4), BR-04, TDD §6.4 |
| **Preconditions** | e2e/src/screenplay/questions/*.ts implemented; vitest configured in e2e/ |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create an actor with a mocked WDIO handle returning a tab titled "extension.ts" | Actor bound to mock |
| 2 | Ask ActiveTabText() and assert via Ensure.that(..., equals("extension.ts")) | Question returns the mocked tab title; assertion passes |
| 3 | Mock getActiveTab() to return undefined | ActiveTabText() returns "" (empty string — safe default, no throw) |
| 4 | Ask IsPanelVisible("workbench") with mock isDisplayed returning true | Question returns true; noun-phrase naming verified ("whether the workbench panel is visible") |

**Test Data:** tab title "extension.ts"; panel name "workbench".
**Postconditions:** no side effects.

---

### TC-05: UT — step definitions delegation-only audit (no raw WDIO — BR-04)

| Field | Value |
|-------|-------|
| **ID** | TC-05 |
| **Priority** | High |
| **Type** | Unit Test (vitest, static AST/regex scan) |
| **Level** | UT |
| **Requirement** | UC-04 (FSD 3.4), BR-04, TDD §6.5 |
| **Preconditions** | e2e/features/step_definitions/*.ts exist per TDD §4.1 (smoke.steps.ts, workbench.steps.ts, webview.steps.ts) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Scan all files under e2e/features/step_definitions/ for raw WebdriverIO commands: `$(`, `browser.`, `.setValue(`, `.click(`, `.getText(` used directly | Zero matches — BR-04 violation would fail the audit |
| 2 | Verify every step body delegates via actorCalled(...).attemptsTo(Task/Question) | 100% of steps delegate to Screenplay constructs |
| 3 | Verify actorCalled is referenced ONLY inside step-definition files (grep e2e/src/) | No actorCalled usage in e2e/src/ |
| 4 | Verify Gherkin lint: one Given/When/Then block per scenario; declarative steps; no implementation detail in feature text | All .feature files pass the lint rules |

**Test Data:** the 5+ committed feature files: smoke/launch.feature, workbench/open-editor.feature, commands/run-extension-command.feature, webview/chat-panel.feature, report/screenshot.feature.
**Postconditions:** audit report attached to TC evidence.

---

### TC-06: IT — wdio.conf.ts config contract validates FSD §5.2 schema

| Field | Value |
|-------|-------|
| **ID** | TC-06 |
| **Priority** | High |
| **Type** | Integration Test (vitest + Node, in-process config load — no IDE spawn) |
| **Level** | IT |
| **Requirement** | UC-02 (FSD 3.2), BR-03, BR-08, FSD §5.2, TDD §5.1 |
| **Preconditions** | e2e/wdio.conf.ts implemented per TDD §5.1; env vars set (valid baseline) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Load e2e/wdio.conf.ts in-process (dynamic import with valid env) | Config loads without throw |
| 2 | Assert runner === "local", specs discover features/**/*.feature, maxInstances === 1 | Matches FSD §5.2 schema exactly |
| 3 | Assert capabilities[0].browserName === "vscode" and services include "vscode" | wdio-vscode-service enabled (FSD §5.2) |
| 4 | Assert framework === "@serenity-js/webdriverio" and frameworkOptions.cucumberOpts.retry === 2 | Serenity adapter + retry limit 2 (BR-03) |
| 5 | Assert reporters include SerenityBDDReporter; outputDir === "target/site/serenity"; connectionRetryTimeout === 120000, connectionRetryCount === 1 | Report + timeout contract per TDD §5.1 (BR-08, UC-07 EF-2) |
| 6 | Assert logLevel resolves to "warn" locally and "info" when CI=true | FSD §5.2 logging verbosity |

**Test Data:** env: E2E_IDE=code, E2E_IDE_BINARY_PATH=<existing fixture>, E2E_HEADLESS=false; CI variant: CI=true.
**Postconditions:** no IDE spawn; config object discarded.

---

### TC-07: IT — env→capabilities mapping (binaryPath, workspacePath, vscodeArgs, userSettings)

| Field | Value |
|-------|-------|
| **ID** | TC-07 |
| **Priority** | High |
| **Type** | Integration Test (vitest + Node, in-process) |
| **Level** | IT |
| **Requirement** | UC-02 (FSD 3.2), BR-01, BR-05, FSD §5.2, TDD §5.1 |
| **Preconditions** | Same as TC-06; dedicated fixture workspace created for E2E_BASE_URL |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Set E2E_IDE_BINARY_PATH=<fixture path>, E2E_BASE_URL=<fixture workspace>, E2E_HEADLESS=true; load config | Config loads |
| 2 | Assert capabilities options.binaryPath === E2E_IDE_BINARY_PATH value | Env var mapped to binaryPath (BR-01) |
| 3 | Assert capabilities options.workspacePath === E2E_BASE_URL value | Env var mapped to workspacePath (BR-01) |
| 4 | Assert capabilities options.vscodeArgs contains disable-gpu: true and no-sandbox: true when E2E_HEADLESS=true | CI headless flags applied (UC-07) |
| 5 | Assert capabilities options.userSettings === { "update.mode": "none", "extensions.autoUpdate": false } | Test isolation settings (BR-05, TDD §10.2) |
| 6 | Assert options.extensionPath resolves to the extension/ directory | Extension under development attached (FSD §5.2) |

**Test Data:** fixture workspace at os.tmpdir() + "/sa4e-341-fixture-workspace" (created then removed); E2E_IDE_BINARY_PATH=<existing fixture>.
**Postconditions:** fixture workspace removed; repo state unchanged (BR-05).

---

### TC-08: IT — Serenity cast + Cucumber glue registration in-process

| Field | Value |
|-------|-------|
| **ID** | TC-08 |
| **Priority** | High |
| **Type** | Integration Test (vitest + Node, in-process) |
| **Level** | IT |
| **Requirement** | UC-01 (FSD 3.1), UC-02 (FSD 3.2), UC-06 (FSD 3.6), TDD §5.2, §5.3 |
| **Preconditions** | e2e/src/cast.ts + step definitions implemented; vitest configured |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call configureCast(mockBrowser) from e2e/src/cast.ts | Returns a Cast where every actor receives BrowseTheWebWithWebdriverIO.using(browser) |
| 2 | Inspect wdio.conf.ts before() hook wiring | Serenity.configure crew includes configureCast(browser) + Photographer.whoWillTakePhotosOfActivities(TakePhotosOfFailures) (BR-08) |
| 3 | Assert Cucumber glue: frameworkOptions.cucumberOpts.features + stepDefinitions point to features/ and features/step_definitions/ | Gherkin discovery + glue wired per FSD §5.2 |
| 4 | Assert services include ["serenity-bdd", { specDirectory: "features" }] | Serenity BDD HTML render service registered (UC-06) |
| 5 | Record actuals (exact option keys, reporter syntax) in the SPIKE-1 findings register | SPIKE-1 verification points documented (TDD OI-5, BR-07) |

**Test Data:** mockBrowser test double (UT-level double acceptable — no IDE spawn at IT level).
**Postconditions:** findings register updated.

---

## 3. Test Cases — E2E-API (Process/CLI-level)

### TC-09: E2E-API — wdio-vscode-service capabilities resolution + IDE launch

| Field | Value |
|-------|-------|
| **ID** | TC-09 |
| **Priority** | High |
| **Type** | Automated (vitest + Node child_process spawn of real WDIO run) |
| **Level** | E2E-API |
| **Requirement** | UC-01 (FSD 3.1), UC-03 (FSD 3.3), SPIKE-1 |
| **Preconditions** | Skeleton committed; VSCode + Kiro binaries installed; env vars set per testdata/test-data-env.csv |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Spawn `npm run test:e2e -- --spec e2e/features/smoke/launch.feature` as a real child process (E2E_IDE=code) | WDIO starts; wdio-vscode-service launches VSCode with --extensionDevelopmentPath + CDP port |
| 2 | Observe service onPrepare: chromedriver auto-detection for the IDE Electron runtime | Compatible chromedriver picked without manual config |
| 3 | Verify maxInstances=1: only ONE IDE process spawns (serialized sessions) | Exactly 1 IDE instance per run (FSD §5.2) |
| 4 | Repeat with E2E_IDE=kiro + Kiro binary path | Same behavior on the Kiro fork — CDP attach works (SPIKE-1 go evidence) |
| 5 | Record per-IDE results in the compatibility matrix (cdp_attach, electron_version, chromedriver_version) | Matrix rows backed by executed runs (BR-07, UC-03) |

**Test Data:** E2E_IDE=code with C:\Users\ASUS\AppData\Local\Programs\Microsoft VS Code\Code.exe; E2E_IDE=kiro with C:\Users\ASUS\AppData\Local\Programs\Kiro\Kiro.exe (example paths — set per machine).
**Postconditions:** IDE sessions closed; matrix updated; artifacts in e2e/target/site/serenity/.

---

### TC-10: E2E-API — skeleton one-command run: exit 0, report generated, scenario under 60s

| Field | Value |
|-------|-------|
| **ID** | TC-10 |
| **Priority** | High |
| **Type** | Automated (vitest + Node child_process spawn of real npm run) |
| **Level** | E2E-API |
| **Requirement** | UC-02 (FSD 3.2 AC-1), UC-06 (FSD 3.6 AC-1), BR-06, FSD §6.4 |
| **Preconditions** | Skeleton committed (TDD gate G1); env vars valid; artifacts cleaned via npm run test:e2e:clean |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run `npm run test:e2e:clean` from repo root | e2e/target/site/serenity/ removed (FSD §6.4) |
| 2 | Spawn `npm run test:e2e` as a real child process with valid env (E2E_IDE=code) | One command executes: launch IDE, run at least 1 scenario, produce report |
| 3 | Verify process exit code === 0 | Suite result reflected in exit code (UC-02 AC-1) |
| 4 | Verify e2e/target/site/serenity/index.html + serenity-summary.json exist | Report generated on every run (UC-06 AC-1) |
| 5 | Parse serenity-summary.json: measure scenario wall-clock duration from timestamps | Single scenario completes in 60s or less (BR-06) |

**Test Data:** E2E_IDE=code, E2E_IDE_BINARY_PATH=<VSCode path>, E2E_BASE_URL=<fixture workspace>, E2E_HEADLESS=false.
**Postconditions:** artifacts present; IDE closed; fixture workspace unchanged.

---

## 4. Test Cases — E2E-UI (IDE UI via WDIO + Serenity/JS + wdio-vscode-service)

### TC-11: E2E-UI — workbench open-editor journey

| Field | Value |
|-------|-------|
| **ID** | TC-11 |
| **Priority** | High |
| **Type** | Automated (WDIO + Serenity/JS Screenplay, stack: wdio-vscode-service) |
| **Level** | E2E-UI |
| **Requirement** | UC-01 (FSD 3.1), UC-04 (FSD 3.4), BR-07; feature: e2e/features/workbench/open-editor.feature |
| **Preconditions** | IDE binary installed; extension loads via --extensionDevelopmentPath; env vars valid; SPIKE-1 go |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run the suite scoped to open-editor.feature (E2E_IDE=code) | wdio-vscode-service launches the IDE; Serenity/JS cast binds actorCalled("QA") to the WDIO session |
| 2 | Given step: the IDE is launched with the extension under development — delegates to OpenWorkspace() | Workbench ready: .monaco-workbench visible within 30s (WaitUntilWorkbenchReady, no sleeps) |
| 3 | When step: the editor opens the file "extension/src/extension.ts" — delegates to OpenEditor(path) | EditorView opens the file; tab activates |
| 4 | Then step: the active editor tab shows "extension.ts" — delegates to Ensure.that(ActiveTabText(), equals("extension.ts")) | Assertion passes; scenario marked Passed in Serenity report |
| 5 | Verify zero raw WDIO commands in step definitions (delegation only — BR-04) | Steps contain only actorCalled().attemptsTo(...) |

**Test Data:** feature e2e/features/workbench/open-editor.feature; file path "extension/src/extension.ts"; expected tab title "extension.ts".
**Postconditions:** IDE closed; Serenity report updated with the Passed scenario (UC-06).

---

### TC-12: E2E-UI — terminal/extension command run journey

| Field | Value |
|-------|-------|
| **ID** | TC-12 |
| **Priority** | High |
| **Type** | Automated (WDIO + Serenity/JS Screenplay, stack: wdio-vscode-service) |
| **Level** | E2E-UI |
| **Requirement** | UC-04 (FSD 3.4); feature: e2e/features/commands/run-extension-command.feature; TDD §6.3 RunCommand |
| **Preconditions** | Same as TC-11; extension command "sdlcAgents.openAgenticChat" registered (activationEvents in extension/package.json) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run the suite scoped to run-extension-command.feature (E2E_IDE=code) | IDE launched; actor bound |
| 2 | Given step: the IDE is launched with the extension under development | Workbench ready |
| 3 | When step: the command "sdlcAgents.openAgenticChat" is executed — delegates to RunCommand(command) | Command executed inside the IDE via workbench.executeCommand; extension activates |
| 4 | Then step: the extension responds (observable state, e.g., chat panel opens or output appears) | Observable extension response asserted via a Question (noun phrase) |
| 5 | Verify Gherkin steps remain declarative (no implementation detail in feature text) | Feature text passes the lint rules (UC-04 validation rules) |

**Test Data:** command "sdlcAgents.openAgenticChat" (code constant — never parsed from step text per TDD §10.3).
**Postconditions:** IDE closed; report updated; extension state reset by fixture workspace isolation (BR-05).

---

## 5. Test Cases — SIT (Manual visual/UX only)

### TC-13: SIT — webview visual layout manual check (chat panel iframe rendering)

| Field | Value |
|-------|-------|
| **ID** | TC-13 |
| **Priority** | Medium |
| **Type** | Manual (browser + IDE inspection) |
| **Level** | SIT |
| **Requirement** | UC-05 (FSD 3.5), BR-05; panel: AI chat panel (extension/src/webview/components/ChatPanel.svelte) |
| **Preconditions** | IDE running with the extension loaded; chat panel opened via command sdlcAgents.openAgenticChat |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Launch VSCode/Kiro manually with the extension under development; open the SDLC chat panel | Chat panel opens as a webview panel in the IDE |
| 2 | Inspect the webview iframe rendering visually | Panel content renders inside an iframe; layout matches ChatPanel.svelte design (header, message list, input area) |
| 3 | Verify test isolation visually: the IDE runs with isolated user settings (no developer profile pollution) | IDE shows default isolated settings; repo state unchanged (BR-05) |
| 4 | Resize the IDE window and observe the panel | Panel layout adapts without visual breakage |
| 5 | Record observations in the webview inventory (strategy, automatable Partial/Yes, manual_checklist) | Inventory row backed by this manual check (BR-07) |

**Test Data:** command "sdlcAgents.openAgenticChat"; panel iframe selector pattern 'iframe[name*="sdlcChatPanel"]' (verified at SPIKE-3).
**Postconditions:** webview inventory updated; IDE closed.

---

### TC-14: SIT — AI chat panel UX manual check (layout, responsiveness)

| Field | Value |
|-------|-------|
| **ID** | TC-14 |
| **Priority** | Medium |
| **Type** | Manual (browser + IDE inspection) |
| **Level** | SIT |
| **Requirement** | UC-05 (FSD 3.5) |
| **Preconditions** | Chat panel open (as TC-13); backend MCP server reachable if the panel requires it |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Send a message manually in the chat panel input area | Message appears in the message list; reply area renders a response |
| 2 | Judge the UX visually: message list scrolling, input focus behavior, loading states | No stuck loading indicator; scrolling smooth; focus returns to input after send |
| 3 | Verify error state visually (e.g., backend unreachable) | Panel shows a readable error state, not a blank/frozen area |
| 4 | Record any UX limitation in the manual checklist for non-automatable interactions | Limitations reported, not masked (no-workaround rule) |

**Test Data:** message "Show status"; expected: a rendered response in the reply area.
**Postconditions:** manual checklist updated; findings fed into the risk register (UC-05).

---

## 6. Test Cases — E2E-UI (continued)

### TC-15: E2E-UI — webview switchFrame interaction: chat message sent, reply renders

| Field | Value |
|-------|-------|
| **ID** | TC-15 |
| **Priority** | High |
| **Type** | Automated (WDIO + Serenity/JS Screenplay, stack: wdio-vscode-service) |
| **Level** | E2E-UI |
| **Requirement** | UC-05 (FSD 3.5); feature: e2e/features/webview/chat-panel.feature; TDD §6.3 SendChatMessage, §11.3 SPIKE-3 |
| **Preconditions** | SPIKE-3 verified the webview reach strategy (workbench.getWebviewByLocator works on the target IDE); IDE binary installed |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run the suite scoped to chat-panel.feature (E2E_IDE=code) | IDE launched; actor bound |
| 2 | When step: the SDLC chat panel is opened — delegates to OpenChatPanel() (command sdlcAgents.openAgenticChat) | Chat panel webview opens |
| 3 | And step: a chat message "Show status" is sent — delegates to SendChatMessage(message) | Webview reached via switchFrame/getWebviewByLocator; textarea filled; submit clicked |
| 4 | Then step: the chat reply area renders a response — Ensure.that(ChatReplyText(), isNonEmpty()) | Reply area content is non-empty; scenario Passed |
| 5 | If the webview context switch is unsupported on a fork IDE | Scenario records the limitation in the webview inventory; panel routed to manual testing (UC-05 EF-1 — no workaround masking) |

**Test Data:** message "Show status"; iframe selector 'iframe[name*="sdlcChatPanel"]'; reply selector ".chat-messages" (verified at SPIKE-3).
**Postconditions:** IDE closed; report updated; webview inventory row backed by an executed scenario (BR-07).

---

### TC-16: E2E-UI — report generated on failed step with automatic screenshot (BR-08)

| Field | Value |
|-------|-------|
| **ID** | TC-16 |
| **Priority** | High |
| **Type** | Automated (WDIO + Serenity/JS Screenplay + Serenity BDD reporter) |
| **Level** | E2E-UI |
| **Requirement** | UC-06 (FSD 3.6 AC-2), BR-08, FSD §5.3 |
| **Preconditions** | Skeleton with Serenity BDD reporter + Photographer configured; a temporary failing scenario fixture added in the fixture workspace (BR-05) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Add a temporary scenario whose Then step deliberately fails (e.g., active tab shows "WRONG-TITLE") in the fixture workspace | Fixture scenario ready (repo state untouched — BR-05) |
| 2 | Run the suite (E2E_IDE=code); let the scenario fail | Serenity/JS emits failure events; Photographer captures a screenshot on EVERY failed step |
| 3 | Verify e2e/target/site/serenity/pages/ contains the failure screenshot for the failed step | Screenshot file exists and is referenced from the report HTML (UC-06 AC-2, FSD §5.3) |
| 4 | Verify the report shows the failed step with the original error message (tab shows "WRONG-TITLE") | Original failure never masked (BR-08) |
| 5 | Remove the temporary failing fixture | Workspace returns to clean state (BR-05) |

**Test Data:** failing assertion expected tab "WRONG-TITLE" vs actual "extension.ts"; screenshot dir target/site/serenity/pages/.
**Postconditions:** fixture removed; report retains the failure evidence for diagnosis.

---

## 7. Test Cases — E2E-API (continued)

### TC-17: E2E-API — chromedriver auto-detection matches IDE Electron runtime

| Field | Value |
|-------|-------|
| **ID** | TC-17 |
| **Priority** | High |
| **Type** | Automated (vitest + Node child_process spawn of real WDIO run) |
| **Level** | E2E-API |
| **Requirement** | UC-01 (FSD 3.1), UC-02 (FSD 3.2 EF-2), UC-03 (FSD 3.3), TDD §11.2 SPIKE-2 |
| **Preconditions** | IDE binaries installed; compatibility matrix committed; env vars valid |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Read the IDE Electron version via the IDE CLI version output (e.g., Code --version, Kiro --version) | Electron version recorded per IDE |
| 2 | Run the smoke scenario and observe wdio-vscode-service chromedriver auto-detection | Auto-detected chromedriver matches the Electron runtime per the mapping table (UC-03) |
| 3 | Negative: pin an incompatible chromedriver (simulate mismatch) and run again | Explicit version-mapping error referencing the UC-03 mapping table; run blocked until fixed (FSD §7.1 row 3) |
| 4 | Restore auto-detection; re-run | Smoke scenario passes again |
| 5 | Record electron_version + chromedriver_version per IDE in the compatibility matrix | Matrix rows updated with executed evidence (BR-07) |

**Test Data:** VSCode Electron runtime (e.g., 32.2.0) vs chromedriver 128.0.6613.84 per the mapping table; incompatible driver for the negative step.
**Postconditions:** mapping table updated; auto-detection restored.

---

### TC-18: E2E-API — headless CI run on Linux xvfb: exit code reflects result, budget 15 min

| Field | Value |
|-------|-------|
| **ID** | TC-18 |
| **Priority** | High |
| **Type** | Automated (vitest + Node child_process; CI job on Linux xvfb) |
| **Level** | E2E-API |
| **Requirement** | UC-07 (FSD 3.7 AC-1, AC-4), BR-06, TDD §11.4 SPIKE-4 |
| **Preconditions** | Linux CI runner with xvfb (DISPLAY=:99) + IDE binary on runner; CI env vars configured per testdata/test-data-env.csv |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Trigger the E2E CI job on push to main (Autonomy Level 3) | Job starts; xvfb presence validated (fail fast with install hint if missing — UC-07 EF-1) |
| 2 | Verify CI env vars: E2E_IDE, E2E_IDE_BINARY_PATH, DISPLAY=:99, E2E_HEADLESS=true | Env vars provided via CI variables only (BR-01, BR-02) |
| 3 | Run `npm run test:e2e` headless (IDE flags via vscodeArgs --disable-gpu, --no-sandbox) | Suite executes headless against the configured IDE |
| 4 | Verify job exit code reflects the suite result | Exit code 0 on pass; non-0 on fail (UC-07 AC-1) |
| 5 | Verify target/site/serenity/ + screenshots published as artifacts on every run (pass or fail) | Artifacts published (UC-07 AC-3) |
| 6 | Measure stage wall-clock duration | E2E stage completes within 15 minutes for up to 50 scenarios (BR-06, UC-07 AC-4) |

**Test Data:** DISPLAY=:99; E2E_HEADLESS=true; IDE_TYPE=kiro; IDE binary on runner (e.g., /usr/bin/kiro).
**Postconditions:** artifacts published; job result recorded; no secrets in logs (BR-02).

---

### TC-19: E2E-API — fail-fast: E2E_IDE_BINARY_PATH missing aborts before IDE launch

| Field | Value |
|-------|-------|
| **ID** | TC-19 |
| **Priority** | High |
| **Type** | Automated (vitest + Node child_process spawn of real npm run) |
| **Level** | E2E-API |
| **Requirement** | UC-02 (FSD 3.2 EF-1), BR-01, FSD §7.1 row 1 |
| **Preconditions** | Skeleton committed; E2E_IDE_BINARY_PATH unset or pointing to a non-existent path |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Unset E2E_IDE_BINARY_PATH (or set to Z:\no-such-ide.exe); keep E2E_IDE=code | Invalid env prepared |
| 2 | Spawn `npm run test:e2e` as a real child process | resolveE2EEnv() throws EnvConfigError at config load — BEFORE IDE launch (BR-01, TDD §9 row 1) |
| 3 | Verify the console error names the expected env var + setup instructions | Error message: "E2E_IDE_BINARY_PATH does not exist ... Run aborts before IDE launch (BR-01). Set the path to the IDE executable." |
| 4 | Verify NO IDE process spawned (no VSCode/Kiro process in the process list) | Run aborted before IDE launch — no environment side effects |
| 5 | Verify process exit code is not 0 | Fail-fast exit code (FSD §7.1 row 1) |

**Test Data:** E2E_IDE_BINARY_PATH unset; variant: E2E_IDE_BINARY_PATH=Z:\no-such-ide.exe; E2E_IDE=code.
**Postconditions:** no IDE spawned; no artifacts corrupted; system stable.

---

### TC-20: E2E-API — flaky scenario: retry limit 2, persistent failure flagged not masked

| Field | Value |
|-------|-------|
| **ID** | TC-20 |
| **Priority** | Medium |
| **Type** | Automated (vitest + Node child_process spawn of real WDIO run) |
| **Level** | E2E-API |
| **Requirement** | UC-04 (FSD 3.4 EF-1), UC-07 (FSD 3.7 EF-2), BR-03 |
| **Preconditions** | A temporary intermittently-failing scenario fixture added (BR-05); retry config per TC-06 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Add a temporary scenario that fails deterministically (simulating persistent flakiness) | Fixture ready |
| 2 | Run the suite; observe Cucumber retry behavior | Scenario retried at most 2 times (cucumberOpts.retry: 2 — BR-03) |
| 3 | Verify after retries exhausted: persistent-failure flag in logs | Failure logged as persistent — not silently retried beyond limit 2 (FSD §7.1 row 7) |
| 4 | Verify a defect ticket is raised (or the defect-logging hook fires) instead of the failure being masked | Defect raised (UC-04 EF-1) |
| 5 | Verify IDE-connection retry stays at 1 (connectionRetryCount) | No silent IDE-connection retries (BR-03, TDD §9 retry summary) |
| 6 | Remove the temporary fixture | Workspace clean (BR-05) |

**Test Data:** failing scenario with Then step "the workbench shows IMPOSSIBLE-STATE"; retry config: cucumberOpts.retry=2, connectionRetryCount=1.
**Postconditions:** fixture removed; defect record created.

---

### TC-21: UT — committed-config hygiene: no hardcoded paths, no secrets (BR-01, BR-02)

| Field | Value |
|-------|-------|
| **ID** | TC-21 |
| **Priority** | High |
| **Type** | Unit Test (vitest, grep-gated static scan — TDD gate G5) |
| **Level** | UT |
| **Requirement** | UC-02 (FSD 3.2 AC-4), UC-07 (FSD 3.7 AC-5), BR-01, BR-02, TDD §10.1 |
| **Preconditions** | e2e/ framework code + config committed; git tracked state |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Grep committed e2e/ config + src for machine-specific paths: C:\Users, /home/, /usr/bin, C:\projects | Zero hardcoded machine-specific paths — only env var references via resolveE2EEnv() (BR-01, UC-02 AC-4) |
| 2 | Grep committed e2e/ for secret patterns: password, token, api_key, secret, credential | Zero secrets committed (BR-02) — grep-gated per TDD §10.1 |
| 3 | Verify .gitignore excludes e2e/target/ and e2e/node_modules/ | Generated artifacts never committed (TDD §8.2) |
| 4 | Verify credentials flow: resolveE2EEnv() consumes env vars only | Any future credentials injected via env vars, never hardcoded (BR-02, TDD §10.1) |

**Test Data:** patterns: "C:\\Users", "/home/", "/usr/bin", "password", "token", "api_key", "secret"; scope: e2e/ committed files only (excludes node_modules, target).
**Postconditions:** audit evidence attached; no config changes required if clean.

---

### TC-22: E2E-API — regression: existing extension vitest + backend Node tests still pass

| Field | Value |
|-------|-------|
| **ID** | TC-22 |
| **Priority** | High |
| **Type** | Automated (vitest + Node child_process spawn of real npm test) |
| **Level** | E2E-API |
| **Requirement** | UC-02 (FSD 3.2 AC-3), FSD §1.1, TDD gate G2 |
| **Preconditions** | e2e/ skeleton added to the repo; e2e/ NOT registered in root workspaces (TDD §2.1) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run `npm test` at the repo root (runs npm run test --workspaces) | Extension vitest suites (test, test:unit, test:e2e vitest config) pass unchanged |
| 2 | Verify backend Node tests pass | Backend tests unaffected (FSD §1.1, OI-1) |
| 3 | Verify root `npm test` NEVER launches an IDE or installs E2E deps implicitly | e2e/ excluded from workspaces array ["backend","extension"] — blanket npm install/test cannot trigger IDE runs (TDD §2.1 rationale 1) |
| 4 | Verify zero changes to extension/package.json and backend/ (git diff) | Production code + existing test setup untouched (FSD §1.2, TDD §8.3) |

**Test Data:** repo at C:\projects\kiro\SDLC-Agents-4-Enterprise; workspaces ["backend","extension"].
**Postconditions:** existing suites green; regression evidence recorded.

---

## 8. Test Data Reference (CSV files)

| File | Covers TC IDs | Description |
|------|---------------|-------------|
| testdata/test-cases.csv | All 22 | Test case register: tc_id, title, level, related_req, priority, automated |
| testdata/test-data-env.csv | TC-01, TC-07, TC-09, TC-10, TC-11, TC-12, TC-15, TC-16, TC-17, TC-18, TC-19, TC-20 | Env var variants per IDE target (valid + invalid): E2E_IDE, E2E_IDE_BINARY_PATH, E2E_BASE_URL, E2E_HEADLESS, DISPLAY |

> Concrete env values are machine-specific (BR-01) — test-data-env.csv uses per-IDE example paths; QA sets actual values per machine/runner and NEVER commits them.

## 9. Notes

- **BRD AC mapping:** every BRD Story acceptance criterion maps to at least one test case — see STP §6.1 (US-01..07 → UC-01..07 → TC IDs, coverage 100%).
- **E2E-API scope:** no REST API in this epic — E2E-API cases run real npm/WDIO processes (spawn) and verify exit codes, console signals, and generated artifacts. IDE processes are never mocked at E2E-API/E2E-UI level; mock WDIO handles appear only at UT level (TC-03, TC-04).
- **SIT minimization:** only 2 manual cases remain (TC-13, TC-14) — visual layout and UX judgment that cannot be automated deterministically.
- **SPIKE dependencies:** TC-02, TC-15, TC-17, TC-18 depend on SPIKE-1..4 outputs (compatibility matrix, webview strategy, CI validation) — execute spikes first per TDD §11.
- **Fixtures:** all temporary fixtures (failing scenarios, fake workspaces) are created in the fixture workspace and removed after the test (BR-05).

*End of STC — SA4E-341 v1.0.*
