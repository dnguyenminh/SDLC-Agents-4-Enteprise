# UG Evidence & Running-App Policy

> Applies to all agents whenever they produce, review, verify, or consume evidence about application behavior: UG, DPG, RLN, TEST-REPORT, security findings, and phase reports.

## 1. Core rule

**Evidence must come from the actual running build.** Wireframes, design mockups, Stitch screens, draw.io mockups, test fixtures, and placeholder images are **NOT** valid evidence for a User Guide or test/security report. They belong to the Specification phase only.

## 2. Reuse a running instance

Before starting an app:

1. Resolve the runtime profile from the project: README, `package.json`, `build.gradle.kts`, `pyproject.toml`, `docker-compose.yml`, or TDD Deployment section.
2. Detect an existing instance using, in order:
   - health endpoint (`/health`, `/actuator/health`, `/api/health`, MCP `initialize`)
   - port / process / container (`Get-NetTCPConnection`, `lsof`, `docker compose ps`)
   - PID file, if the project uses one
3. If an instance is already running, **reuse it** and do **not** start a second instance.
4. Never hardcode `npm start` or a fixed port.

## 3. Verify feature freshness

The running instance must contain the feature just implemented.

| Deliverable | Freshness check |
|---|---|
| API / backend | Call the new endpoint; validate response schema; check OpenAPI/Swagger |
| MCP server | `tools/list` contains the new tool; invoke it once |
| Web UI | Open the new route; assert the new element/text in the DOM |
| CLI | Run the new subcommand or `--help` entry |
| Desktop / mobile | Open the new screen; check in-app build/version info |
| Data pipeline | Run a smoke input; validate the new output |

If build/commit info is exposed (`/version`, commit hash, image tag), compare it with the current branch.

**If stale:** restart that same instance, record the reason (`Running app is stale: missing route X`), then re-check. Do not start a duplicate instance. If the instance belongs to someone else and cannot be restarted, report to SM instead of killing it.

## 4. Capture by deliverable type

| Deliverable | Required evidence |
|---|---|
| Web UI | Browser automation screenshot of each primary screen/route |
| Electron | Automated app-window screenshot |
| Native desktop | OS-level screenshot or app screenshot harness |
| Mobile | Emulator/device screenshot (`adb`, `xcrun simctl`) |
| CLI | Real terminal transcript + expected output |
| API / MCP | Real request/response examples |
| Data pipeline | Real input/output sample + logs |

## 5. Storage and embedding

- Store images at `documents/{TICKET}/diagrams/{kind}-{screen}.png`.
- Embed inline: `![{screen}](diagrams/{kind}-{screen}.png)`.
- For UI deliverables, UG Section 5 requires, per primary screen:
  - the actual screenshot
  - a Key Elements table
  - a User Actions table (steps + expected result)

## 6. Role responsibilities

| Agent | Responsibility |
|---|---|
| **SM** | Block Phase 5.5 completion if a UI deliverable lacks actual screenshots, freshness evidence, or BA/QA verification. |
| **BA** | Reject wireframes/mockups/placeholders in UG; verify screenshots match the real app and BRD/FSD use cases. |
| **TA** | Verify implementation evidence comes from the current build; if FSD/TDD lacks a runtime profile or screen inventory, send it back to BA/SA. |
| **SA** | TDD must define Runtime Profile, Screen Inventory, and Feature Verification points for UG evidence. |
| **QA** | Run the real app, compare screenshots with the current build, and reject stale or mockup evidence. |
| **DEV** | Own UG evidence: detect app type, reuse a running instance, verify freshness, capture actual screenshots or real CLI/API output, then write UG. |
| **DevOps** | DPG/RLN runbooks and deployment evidence must use verified commands and the deployed build. |
| **UI** | Provide wireframes/mockups for FSD only; they are NOT UG screenshots. Assist with native/mobile capture only when DEV cannot. |
| **Security** | Security evidence must come from a fresh, feature-verified instance; stale instances invalidate findings. |

## 7. Dev-agent procedure (extends UG Step 9)

1. Detect deliverable type from TDD/FSD and source tree.
2. Resolve the runtime profile; never assume `npm start`.
3. Detect an existing instance; reuse it if running.
4. Verify feature freshness (table above); restart only if stale and record why.
5. Capture evidence from the actual build using the method for that deliverable type.
6. Store under `documents/{TICKET}/diagrams/` and embed in UG Section 5 (UI) or Usage (non-UI).
7. If capture is impossible, write `[SCREENSHOT REQUIRED: reason]` and report the gap to SM.
8. Re-capture after code changes; stale screenshots are a UG defect.

## 8. Hard failures

A UG is **NOT complete** if any of the following is true:

- UI deliverable and Section 5 is missing.
- Section 5 contains wireframes, mockups, Stitch screens, or placeholders.
- Screenshots are from an older build that does not contain the ticket feature.
- The app was started twice because the agent did not check the existing instance.
- Start commands are hardcoded or unverified.
- A capture gap is omitted silently.
