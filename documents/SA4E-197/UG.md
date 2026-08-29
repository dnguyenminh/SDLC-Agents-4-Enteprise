# User Guide (UG)

## SDLC-Agents-4-Enterprise — SA4E-197: execute_shell tool + pattern-based auto-approve

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-197 |
| Title | Add execute_shell tool with pattern-based auto-approve to chat agent |
| Author | DevOps Agent (user-guide documentation) |
| Version | 1.0 |
| Date | 2026-08-30 |
| Status | Draft |

---

## 1. What Is This Feature?

The chat agent can now run terminal commands for you (build, test, git, package manager) directly from the chat, and you can whitelist command families so you stop clicking "Allow" for every single command.

---

## 2. Running Shell Commands

When the agent decides a terminal command is needed, it calls the `execute_shell` tool:

- **Command** (required) — the shell command, e.g. `npm test`
- **cwd** (optional) — working directory; defaults to the workspace root
- **timeout** (optional) — max runtime in ms; default 120 000 (120 s)

Example you can type in chat:
> "Run the unit tests in the backend folder"

The agent will invoke `execute_shell` with `command: "npm test"`, `cwd: "./backend"`.

---

## 3. Approval & Auto-Approve

### 3.1 First time — you approve

A **PermissionGuard** modal appears (High risk = red badge for shell tools) with:

- **Allow** — run this one command
- **Deny** — cancel
- **Allow all {toolType} tools this session** — whitelist the pattern and run now

A 60-second countdown auto-denies if you do nothing.

### 3.2 Pattern auto-approve (session-scoped)

Click **"Allow all {pattern} commands this session"** (e.g. `npm *`) and:

- The pattern is stored **for this session only**.
- Future commands matching the pattern skip the modal and run immediately.
- Each auto-approved command is logged with the matched pattern (debug level).

Patterns use simple glob: `*` matches any characters, case-insensitive.

| You run | Suggested pattern | Future matches |
|---------|-------------------|----------------|
| `npm run test` | `npm *` | any `npm …` command |
| `git status` | `git status` | exactly `git status` |
| `vitest --run src/test.ts` | `vitest *` | any `vitest …` command |

> ⚠️ Patterns are **cleared when the extension reloads or the session resets** — this is by design (no persistence = safer).

---

## 4. Bug Fixes You'll Notice

- **Resume button** no longer hangs after any operation.
- **Tool result section** displays at full width (no collapse).
- **Long model names** are truncated with an ellipsis and shown in full on hover.

---

## 5. Safety Notes

- Every shell command still requires approval **unless** it matches a pattern you approved.
- Avoid overly broad patterns like `*` (would approve everything). The suggestion limits to `base *` format.
- Commands time out at 120 s by default; output is truncated at 50 KB before being returned to the agent.

---

## 6. Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Modal reappears for same command | Pattern not added / session reset | Re-click "Allow all" or pattern expired after reload |
| Command killed unexpectedly | Hit timeout | Increase `timeout` argument or run manually |
| Output looks cut off | >50 KB truncation | Run command manually for full output |
