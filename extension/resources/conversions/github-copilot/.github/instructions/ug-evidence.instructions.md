---
name: 'UG Evidence & Running-App Policy'
description: 'Screenshots must come from the actual running build; reuse running apps and verify feature freshness'
applyTo: '**'
---

# UG Evidence & Running-App Policy

- UG/Test/Security screenshots MUST come from the actual running build — never wireframes, mockups, or placeholders.
- Reuse a running app; do NOT start a second instance.
- Verify the running build contains the ticket feature before capturing evidence; restart only if stale, and record why.
- Resolve start commands from the project — never hardcode `npm start`.
- Capture by deliverable type: Web/Electron → browser automation; native desktop → OS screenshot; mobile → adb/simctl; CLI/API/pipeline → real terminal or request/response evidence.
- If capture is impossible, write `[SCREENSHOT REQUIRED: reason]` and report the gap.
- Full policy: `.kiro/steering/ug-evidence.md` (or the platform equivalent).
