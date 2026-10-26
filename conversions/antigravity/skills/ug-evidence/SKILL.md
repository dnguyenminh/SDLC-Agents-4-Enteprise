---
name: ug-evidence
description: UG evidence rules — actual screenshots from the running build, reuse running apps, verify feature freshness
---

## Core Rule

UG/Test/Security screenshots MUST come from the actual running build — never wireframes, mockups, Stitch screens, or placeholders.

## Running App

- Detect an existing instance via health endpoint, port, process, container, or PID file.
- If running, reuse it and do NOT start a second instance.
- Verify the running build contains the ticket feature (new route/tool/command/UI element or build/commit info).
- If stale, restart that same instance and record why.
- Resolve start commands from the project — never hardcode `npm start`.

## Capture by Deliverable Type

| Deliverable | Evidence |
|---|---|
| Web UI | Browser automation screenshot per primary screen/route |
| Electron | Automated app-window screenshot |
| Native desktop | OS-level screenshot or app screenshot harness |
| Mobile | Emulator/device screenshot (`adb`, `xcrun simctl`) |
| CLI | Real terminal transcript + expected output |
| API / MCP | Real request/response examples |
| Data pipeline | Real input/output sample + logs |

If capture is impossible, write `[SCREENSHOT REQUIRED: reason]` and report the gap. Never fabricate or reuse a mockup.
