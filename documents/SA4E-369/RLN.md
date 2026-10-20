# Release Notes (RLN)

## SDLC Agents 4 Enterprise — SA4E-369: PeerBus — Intra-Instance Agent-to-Agent Messaging

---

## Release Information

| Field | Value |
|-------|-------|
| Release Version | **1.53.12** (from 1.53.11) |
| Release Date | 2026-10-21 |
| Jira Ticket | SA4E-369 |
| Artifact | `extension/sdlc-agents-4-enterprise-1.53.12.vsix` (10.88 MB, 2026 entries) |
| Source Revision | `71869e0` (tag `v1.53.12`) |
| Environment | PROD — Kiro / VS Code workstations |
| Author | DevOps Agent |
| Status | Draft — pending sign-off |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-21 | DevOps Agent | Initiate document — release 1.53.12 |

---

## 1. What's New

### 1.1 Feature Summary

Agents in separate SDLC Chat tabs can now **work together**. With release 1.53.12, each chat-tab agent can discover the other active agents in the same IDE window, delegate a task to them, and check on its status — all locally, with **zero setup**: no new settings, no commands to learn, nothing to enable.

You stay in control: when an agent working on a peer request wants to run a tool, a single approval prompt appears, and if you do not respond within 30 seconds the request is **automatically denied** (fail-closed by design). Built-in guardrails cap message volume, conversation length and message size, and every peer message travels in a tamper-evident envelope so one agent's text can never impersonate your instructions. Secret-shaped content (API keys, tokens, private keys) is automatically redacted before it crosses tabs.

### 1.2 User-Facing Changes

| # | Change | Description | Impact |
|---|--------|-------------|--------|
| 1 | Agent-to-agent messaging (PeerBus) | Chat-tab agents discover each other (`peer_list`), delegate tasks (`peer_send`), and check status (`peer_status`) — in-process, same extension host, same user | High |
| 2 | Fail-closed approval gate (Option A) | Peer-triggered tool calls show ONE approval prompt; no interaction ⇒ auto-deny after 30 s. Hardwired in code — cannot be disabled via settings | High |
| 3 | Built-in guardrails | 10 messages / 60 s per tab, 20-message inbound queue, 5-turn ping-pong cap per pair, 16,000-character message cap | Medium |
| 4 | Anti-injection envelope | Peer prompts are wrapped in marked envelopes with `turnOrigin`; forged markers are rejected (`PEER_010_FORGERY`); replies are wrapped again (2nd-order) | High |
| 5 | Tab lifecycle hygiene | Closing a tab cleanly cancels pending peer work (I-8: sender gets `PEER_009`, registry cleaned); user activity resets BR-9 counters | Medium |
| 6 | Secret-leak prevention (PEN-6a) | `curateReason` SECRET_PATTERNS auto-redact API keys, tokens and private keys crossing tabs | High |

### 1.3 New In-Session Tools

| Tool | Purpose |
|------|---------|
| `peer_list` | Discover active peer tabIds — call this FIRST before `peer_send` |
| `peer_send` | Send a task/message to another tab's agent (max 16,000 chars) |
| `peer_status` | Query a peer tab's state (idle / busy / closed) |

These are in-session LLM tools only — **no new VS Code commands, no new settings keys** (zero-config, AC7).

---

## 2. Technical Changes

### 2.1 Tool / API Surface

| Type | Item | Description |
|------|------|-------------|
| New | `peer_list` / `peer_send` / `peer_status` | 3 in-session LLM tools — in-process EventEmitter bus, **no sockets** (AC7 re-verified in pentest 6.3) |
| New | `PEER_001`..`PEER_010` error codes | Guardrail taxonomy: tab unavailable, self-send, task failed, anti-loop cap, queue overflow, blocking timeout, context-governance rejection, unknown task, target closed, size cap / forgery |
| Unchanged | VS Code commands / settings / activation events | Manifest diff 1.53.11 → 1.53.12 = **version bump only** |

### 2.2 Database Changes

**None.** Peer threads and registry state are in-memory only — nothing persists to disk or database.

### 2.3 Configuration Changes

**None.** Zero new settings keys (AC7/D5). Peer bounds are locked constants in `peer/constants.ts`, deliberately not user-tunable:

| Constant | Value | Role |
|----------|-------|------|
| `MAX_PINGPONG_TURNS` | 5 — LOCKED (AC3) | Anti-loop per pair (PEER_004) |
| `RATE_LIMIT_MAX` / `RATE_WINDOW_MS` | 10 / 60,000 ms | Per-tab inbound rate limit |
| `PEER_MESSAGE_MAX_CHARS` | 16,000 | Per-message size cap (PEER_010) |
| `INBOUND_QUEUE_CAP` | 20 | Inbound FIFO overflow → PEER_005 |
| `BLOCKING_TIMEOUT_MS` | 300,000 ms | Caller-side timeout (PEER_006) |
| `PEER_APPROVAL_TIMEOUT_MS` | 30,000 ms → auto-deny | Bounds the silent-stall surface (S-02d) |

### 2.4 Infrastructure Changes

| Component | Change | Description |
|-----------|--------|-------------|
| Extension bundle | Modified | 135 files, +14,929 / −2,283 (tag `v1.53.11`…`v1.53.12`); esbuild-production bundle 20,356,385 bytes |
| Activation model | Unchanged | Lazy activation on view/command — no new startup surface |
| Network surface | Unchanged | No sockets, no ports, no permissions added by PeerBus |

---

## 3. Security Fixes (S-01..S-05 + PEN-6a)

| ID | Remediation | Closed At |
|----|-------------|-----------|
| S-01 | Peer tab lifecycle wiring — `wirePeerTabLifecycle` wire-once guard + registry I-1 busy-stomp guard (a re-register can never downgrade busy→idle mid-turn) | `53506d2` (Phase 5.7 PASS) |
| S-02 | Approval bridge — fail-closed ToolApprovalGate for peer-triggered turns, 30 s auto-deny (D6 Option A, code-level, not bypassable via settings) | `53506d2` |
| S-03 | Single-flight peer dispatch — a tab processes one inbound peer task at a time; message size cap (16,000 chars, SEC-03/C2) enforced with PEER_010 | `53506d2` |
| S-04 | Envelope marker forgery detection — `PEER_010_FORGERY`; forged markers neutralized to an empty-message copy | `53506d2` |
| S-05 | 2nd-order reply wrapping — peer replies are wrapped again so peer-originated text can never re-enter a turn as instructions | `53506d2` |
| PEN-6a | `curateReason` SECRET_PATTERNS redaction — field-name pattern (`api[-_]?key|secret|token|password|passwd|credential|authorization|cookie`) + `AKIA…` + `gh[pou]_…` + `xox[bap]-…` + `BEGIN … PRIVATE KEY` stripped before crossing tabs | `71869e0` (Phase 6.3 fix-batch) |

All defenses were verified **present in the shipped minified production bundle** (Phase 6.7 §4) — fail-closed posture maintained end-to-end from source to artifact.

Additional hardening bundled in 1.53.12: **SA4E-373** `ide_launch` (realpath canonicalization, sandbox prefix for `userDataDir`, `--remote-debugging-address=127.0.0.1`, `ideBinaryPath` whitelist + path sanitization), SA4E-371 agent prompts packaging, SA4E-372 chat `chatHistory` GAP-7 fix (backward-compatible), SA4E-374 Pega indexing SRP fix, SA4E-375 server auto-upsert.

---

## 4. Test Coverage

| Level | Result |
|-------|--------|
| Automated tests (vitest) | **103 / 103 PASS**, 0 failed, `tsc` 0 errors |
| Pentest probes (Phase 6.3) | 18 probes; **5/6 SAFE**, PEN-6a fixed in `71869e0` → all findings closed |
| Security review | Phase 3.7 GO-WITH-CONDITIONS (C1–C3) → Phase 5.7 **PASS** post-remediation |
| Security deploy review (6.7) | **GO-WITH-CONDITIONS** — 0 Critical / 0 High / 2 Low / 2 Info; secret sweep of the shipped bundle: **0 secrets** |
| UAT (6.5) | **PASS-WITH-OPTIONAL-SPOT-CHECK** on installed 1.53.12 (real Kiro; MCP wrapper v1.11.0 responding on port 9183) |

### Defect Summary

| Severity | Found | Fixed | Open | Deferred |
|----------|-------|-------|------|----------|
| Critical | 0 | 0 | 0 | 0 |
| Major | 0 | 0 | 0 | 0 |
| Low (deploy hygiene) | 2 (F1, F2) | 0 — no code change required | 0 | 1 (F2 → next cycle) |

> F1 is resolved at deploy time via conditions C-D1/C-D2 (checklist DC-1/DC-11); F2 is deferred to the next packaging cycle (C-D3/DC-12).

---

## 5. Known Issues & Limitations

| # | Issue | Impact | Workaround | Target Fix |
|---|-------|--------|------------|------------|
| F1 (Low) | Stale, mislabeled vsix artifacts at repo root: `sdlc-agents-4-enterprise-latest.vsix` is actually v1.48.0 and `sdlc-agents-4-enterprise.vsix` is v1.44.0 | Installing "latest" deploys a 5-versions-old build without the security remediations | Install ONLY the versioned artifact and verify `<Identity Version="1.53.12">` before every install (C-D1/DC-1); purge stale artifacts after release (C-D2/DC-11) | Resolved during 1.53.12 deployment |
| F2 (Low) | 691 `.js.map` source maps shipped inside the vsix (`.vscodeignore` `*.map` glob only matches root-level entries) | ~2× artifact size; source-structure disclosure (maps swept — no secrets found) | Non-blocking; `.vscodeignore` fix `**/*.map` | Next packaging cycle (C-D3/DC-12) |
| F3 (Info) | `chatTimeout` wall-clock backstop defaults to 0 (disabled); the loop guard compensates | Unattended automation turns have no time cap | Set `sdlcAgents.backend.chatTimeout` > 0 on automation hosts (DC-10) | Documented guidance |
| F4 (Info) | Client `rateLimitRpm` default 6000 is advisory only | None — the server clamps to its own hard cap | Server-side cap authoritative (DC-13) | Documented guidance |

---

## 6. Breaking Changes

**None.** 1.53.12 is **additive-only** from 1.53.11:

- `extension/package.json` diff = version bump only — zero new settings, commands, activation events or permissions ⇒ **no configuration migration**
- PeerBus is in-process and in-memory — no ports, no sockets, no workspace file changes
- The chat protocol GAP-7 fix (SA4E-372) is backward-compatible
- No control removed, no default weakened — the security diff is net-positive

**Fully backward compatible.**

---

## 7. Upgrade Path

```powershell
# Safe in-place upgrade — no config migration, no data migration, secrets preserved
kiro --install-extension "extension/sdlc-agents-4-enterprise-1.53.12.vsix"
# then Reload Window (Kiro keeps the old version in RAM until reload)
```

- **No configuration migration needed** — defaults unchanged (see Section 2.3).
- **Credentials survive the upgrade** — SecretStorage migrate-on-read (`kiroSdlc.*` → `sdlcAgents.*`); users are NOT re-prompted for API keys (verify per DC-8).
- **Downgrade-safe** — rolling back to the 1.53.11 vsix is clean; peer state never touches disk.
- **Distribution rule:** ship only the versioned vsix — never the repo-root `*-latest.vsix` (C-D1).

---

## 8. Deployment Instructions

See the [Deployment Guide](DPG.md) (DPG-v1.0-SA4E-369) for full steps, including the DC-1..DC-14 security deploy checklist and the C-D1..C-D3 deploy conditions.

### Quick Reference

| Step | Action | Estimated Time |
|------|--------|---------------|
| 1 | Build & package (`npm ci` → `esbuild-production` → `package:prod`) | ~5 min |
| 2 | Artifact verification (Identity 1.53.12, SHA-256, secret sweep) | ~5 min |
| 3 | Install (`kiro --install-extension`) + Reload Window | ~2 min |
| 4 | Verification (health checks, peer smoke, DC-5..DC-8) | ~10 min |
| **Total** | | **~25 min** |

*No database migration is required in this release.*

---

## 9. Rollback Plan

See DPG Section 9 for full steps. Summary:

**Rollback Decision Criteria:**

- Extension fails to activate, MCP wrapper unresponsive, or ≥ 3 peer smoke scenarios fail → immediate rollback
- Users re-prompted for credentials (DC-8 violated) → immediate rollback
- Minor UI-only issue → hotfix, no rollback

**Rollback:** `kiro --uninstall-extension dnguyenminh.sdlc-agents-4-enterprise` → install `extension/sdlc-agents-4-enterprise-1.53.11.vsix` → Reload Window. **Estimated Rollback Time: ~5 min.** No database or settings rollback required (peer state is in-memory only).

---

## 10. Contacts

| Role | Name | Contact | Responsibility |
|------|------|---------|----------------|
| Release Manager | {SM name} | {email} | Release coordination |
| Dev Lead | {name} | {email} | Technical issues |
| QA Lead | {name} | {email} | Testing sign-off |
| DevOps | {name} | {email} | Deployment execution |
| Security Lead | {name} | {email} | Deploy conditions C-D1..C-D3 |

---

## 11. Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Dev Lead | | | ☐ Approved |
| QA Lead | | | ☐ Approved |
| Security Lead | | | ☐ Approved |
| Release Manager | | | ☐ Approved |

*End of Release Notes — SA4E-369, release v1.53.12 (2026-10-21). Author: DevOps Agent.*
