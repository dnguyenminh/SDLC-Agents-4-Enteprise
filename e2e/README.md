# E2E Testing Framework (SA4E-341)

BDD E2E testing framework for VSCode-based IDEs (VSCode, Kiro, Antigravity IDE, Kilo) using **WebdriverIO v9 + wdio-vscode-service + Serenity/JS 3 (Cucumber + Screenplay Pattern)**.

Standalone private npm package — deliberately NOT part of the root npm workspaces (TDD §2.1), so a blanket `npm install` / `npm test` at the repo root never installs E2E dependencies or launches IDEs.

## Setup

```bash
# 1. Install E2E dependencies (explicit opt-in — heavy WDIO/Serenity stack)
npm --prefix e2e install

# 2. Set environment variables (never committed — BR-01/BR-02)
#    E2E_IDE             target IDE type: kiro | code | antigravity | kilo
#    E2E_IDE_BINARY_PATH path to the IDE executable (must exist — fail fast, BR-01)
#    E2E_BASE_URL        (optional) workspace folder opened by the IDE under test
#    E2E_HEADLESS        true | false (true required in CI)
#    E2E_FAIL_FAST       true | false (optional — stop on first failure)
```

PowerShell example:

```powershell
$env:E2E_IDE = "code"
$env:E2E_IDE_BINARY_PATH = "<path-to-ide-executable>"
$env:E2E_HEADLESS = "false"
```

## Run

| Script (root or `--prefix e2e`) | Purpose |
|--------------------------------|---------|
| `npm run test:e2e` | One-command E2E run: validates env (fail fast, BR-01), launches the IDE, executes Gherkin scenarios via Screenplay, generates the Serenity report to `e2e/target/site/serenity/` (FSD §6.4) |
| `npm run test:e2e:report` | Opens `e2e/target/site/serenity/index.html` standalone in the default browser (FSD §6.4; on Linux/macOS use `xdg-open`/`open` instead) |
| `npm run test:e2e:clean` | Removes `e2e/target/` before a fresh run |
| `npm run test:unit` (e2e/) | UT/PBT unit tests (vitest + fast-check) — no IDE required |
| `npm run typecheck` (e2e/) | TypeScript strict check for the e2e code |
| `npm run lint` (e2e/) | ESLint (typescript-eslint flat config) |

The Serenity BDD HTML report is rendered by the `serenity-bdd` service after every run — it requires a Java runtime on the machine/runner (TDD OI-4). Raw results are retained at `e2e/target/site/serenity/serenity-summary.json` as fallback evidence (UC-06 AF-1).

## Layout

```
e2e/
├── wdio.conf.ts                  # configuration contract (TDD §5.1 / FSD §5.2)
├── features/
│   ├── smoke/launch.feature              # IDE launch smoke (UC-01/UC-03 evidence)
│   ├── workbench/open-editor.feature     # core workbench/editor journey (UC-04)
│   ├── commands/run-extension-command.feature  # extension command journey (UC-04)
│   └── webview/chat-panel.feature        # AI chat panel journey (UC-05)
│   └── step_definitions/*.steps.ts       # glue — delegation only (BR-04)
├── src/
│   ├── cast.ts                   # Serenity cast — actor roster + abilities (TDD §5.2)
│   ├── support/env.ts            # env var schema + fail-fast validation (BR-01)
│   ├── screenplay/tasks/         # reusable composite interactions (verb naming)
│   ├── screenplay/questions/     # state questions for assertions (noun-phrase naming)
│   └── screenplay/interactions/  # low-level interactions shared by tasks
└── target/site/serenity/         # GENERATED (gitignored): Serenity BDD report artifacts
```

## Authoring

Features are declarative Gherkin (Given/When/Then). 100% of step logic is Serenity/JS Screenplay Tasks/Questions; step definitions delegate only — no raw WebdriverIO commands inside step definitions (BR-04). Recommended editor extensions per SA4E-340: `Cucumber for VSCode` + `CucumberJS Test Runner`.

Retry policy: `cucumberOpts.retry: 2` (BR-03). Persistent flakiness is raised as a defect ticket, never masked by retries.

Spike actuals are recorded in `documents/SA4E-341/spikes/` (TDD §11 — every go/no-go conclusion references committed evidence, BR-07).
