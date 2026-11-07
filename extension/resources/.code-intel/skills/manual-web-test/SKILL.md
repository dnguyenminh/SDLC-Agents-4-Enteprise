---
name: manual-web-test
description: Mandatory manual web testing process — build, start server, test all pages, report
---

## When to Apply

When user requests "manual test", "QA test", "web test", "UI test", or any request related to web interface verification.

## Mandatory Process

### Step 1: DevOps — Build & Start Server

Agent MUST perform all steps below (no skipping, no asking user):

1. **Detect build system** — read project root to identify build tool:
   - `package.json` → `npm run build` (or build script in scripts section)
   - `pyproject.toml` / `setup.py` → build per README instructions
   - `Makefile` → `make build`
   - If unclear → read README, find "Build" or "Getting Started" section

2. **Run build** — use shell to execute detected build command:
   - MUST verify build success (exit code 0, no errors)
   - If build fails → fix errors and rebuild

3. **Deploy artifacts** (if needed) — copy output to run location:
   - dist/ or build/ → serve with static server
   - If project runs directly from source (Node.js, Python) → skip this step

4. **Detect start command** — determine how to start server:
   - `package.json` scripts → `npm start` or `npm run dev`
   - Python → `python main.py` or `uvicorn app:app`
   - If unclear → read README "Run" or "Usage" section

5. **Kill old process** (if any) — stop previously running server

6. **Start new server** — use background process control:
   - MUST use background process (server is long-running)
   - Read output to verify server ready (listen on port, "started" message)
   - If server does not start within 30s → check logs, fix, retry

7. **Verify server accessible** — navigate to root URL with browser:
   - Confirm page loads successfully (no connection refused)
   - Record base URL and port for QA use in Step 2

### Step 2: QA — Test All Screens

Use browser tools (`navigate_page`, `take_snapshot`, `take_screenshot`, `click`, `fill`) to:

1. **Open each page** and verify:
   - Page loads without errors (no 404, no blank)
   - Nav-bar displayed correctly (has links, has logout)
   - Content renders correctly (no "Loading..." stuck, no JSON error)

2. **Test main flows:**
   - Login → Profile → Logout → redirect correct
   - Navigate through all nav links
   - Create/Edit/Delete operations (if applicable)
   - Error states (invalid input, unauthorized)

3. **Discover and test ALL pages:**
   - Read source code (routes, controllers, static HTML files) to enumerate all endpoints
   - Or use nav-bar/sidebar links from homepage to discover pages
   - Test EVERY discovered page — skip none
   - Record results in checklist format:
     - [ ] `/<path>` — brief description — status

### Step 3: Dev — Fix Bugs

If QA finds bugs:
1. Dev fixes immediately (no need to ask user)
2. DevOps rebuilds + restarts
3. QA re-tests

### Step 4: Loop Until PASS

Loop: Fix → Build → Deploy → Test → until ALL pages PASS.

### Step 5: Report to User

Only report when ALL tests have PASSED. Format:

```
## Manual Web Test — PASSED

| Page | Status | Notes |
|------|--------|-------|
| /login | PASS | ... |
| /profile | PASS | ... |
| ... | ... | ... |

Server running at: localhost:{port}
```

## NEVER

- Report "restart server to test" — DevOps must restart automatically
- Report individual errors one by one — fix all before reporting
- Skip any test page — test ALL
- Leave "Loading..." or JSON parse errors — debug console

## Tools Required

- `navigate_page` — open page
- `take_snapshot` — read DOM
- `take_screenshot` — capture screen
- List console messages — check JS errors
- `click` — click elements
- `fill` — fill forms
- Process control — start/stop server process
- Shell execution — build, copy artifacts