# Deployment Guide (DPG)

## SDLC Agents 4 Enterprise — SA4E-369: Intra-Instance Agent-to-Agent Messaging (Local PeerBus, Zero-Config)

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-369 |
| Title | Intra-instance agent-to-agent messaging (local PeerBus, zero-config) |
| Author | DevOps Agent |
| Version | 1.0 |
| Date | 2026-10-21 |
| Status | Draft |
| Release Artifact | `extension/sdlc-agents-4-enterprise-1.53.12.vsix` (10.88 MB, 2026 entries) |
| Source Revision | HEAD `71869e0` (tag `v1.53.12`, branch `SA4E-369`) |
| Related TDD | TDD-v1.0-SA4E-369 |
| Security Gate | Phase 6.7 SECURITY-DEPLOY-REVIEW — GO-WITH-CONDITIONS (C-D1..C-D3) |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-21 | DevOps Agent | Initiate document — generated from TDD, SECURITY-DEPLOY-REVIEW (6.7), UAT-RESULTS (6.5), CICD-SETUP and the extension manifest |

---

## Sign-Off

| Name | Role | Signature and date |
|------|------|--------------------|
| | Dev Lead | ☐ Approved for deployment |
| | QA Lead | ☐ Testing completed |
| | Ops Lead | ☐ Infrastructure ready |
| | Security Lead | ☐ Deploy conditions C-D1..C-D3 acknowledged |

---

## 1. Overview

### 1.1 Feature Summary

SA4E-369 ships **PeerBus** — intra-instance, in-process agent-to-agent messaging between SDLC Chat tabs. Agents running in separate chat tabs can discover each other (`peer_list`), delegate tasks (`peer_send`), and check status (`peer_status`) with **zero configuration**: no new commands, no new settings keys, no sockets — an in-process EventEmitter bus inside the same extension host and the same user session (AC7).

Peer-triggered agent turns run behind a **fail-closed ToolApprovalGate** (D6 Option A, code-level — cannot be disabled via settings): with no approval UI wired, peer tool calls are BLOCKED, and an unanswered approval prompt auto-denies after 30 seconds.

This release also carries security remediations **S-01..S-05** (lifecycle wiring, approval bridge, single-flight dispatch, envelope marker forgery detection, 2nd-order reply wrapping) and the **PEN-6a** fix (`curateReason` SECRET_PATTERNS — secret-shaped strings are redacted before crossing tabs).

### 1.2 Deployment Scope

| Item | Type | Description |
|------|------|-------------|
| Extension bundle (`out/extension.js`) | Modified | PeerBus + fail-closed gate + PEN-6a redaction compiled into the esbuild-production bundle (20,356,385 bytes at HEAD `71869e0`) |
| Extension manifest (`extension/package.json`) | Modified | **Version bump 1.53.11 → 1.53.12 only** — zero new commands, settings, activation events or permissions |
| Agent prompts (8 × `src/pi-agent/prompts/*.md`) | Packaged | SA4E-371 fix confirmed present in the vsix |
| Integrity manifest (`resources/.sdlc-checksums.json`) | Regenerated | Tamper-evident checksums generated from git HEAD committed content (`gen-checksums.js`) |
| Database | **None** | No schema migration — peer threads/registry are in-memory only |
| Settings / configuration | **None** | Zero-config (AC7/D5) — peer bounds are locked constants in `peer/constants.ts`, not user-tunable |

### 1.3 Target Environments

This is a desktop IDE extension — "deployment" means installing one versioned vsix per workstation.

| Environment | Host | Deploy Order | Approval Required | Status |
|-------------|------|--------------|-------------------|--------|
| DEV | Developer workstation — `--extension-development-path` | 1st | No | Complete |
| UAT | Pilot Kiro install (vsix) | 2nd | QA sign-off | Complete — PASS (2026-10-20, RUN-LOG #50) |
| PROD | All user workstations (Kiro / VS Code, engine `^1.85.0`) | 3rd | Dev Lead + Security (after C-D1..C-D3) | This guide |

---

## 2. Prerequisites

### 2.1 Host & IDE Requirements

| Requirement | Version | Needed By | Notes |
|-------------|---------|-----------|-------|
| Kiro (primary host) or VS Code | Engine `^1.85.0` (`engines.vscode`) | Build host + end users | Extension ID `dnguyenminh.sdlc-agents-4-enterprise` |
| Node.js | 22.x (root `engines.node`) | Build host only | Not required on end-user machines |
| npm | ≥ 10 (bundled with Node 22) | Build host | `npm ci` for reproducible install |
| `@vscode/vsce` | ^2.24.0 (devDependency) | Build host | Packaging with `--no-dependencies` |
| esbuild | 0.28.2 (root override) | Build host | Production bundle + minification |

### 2.2 Runtime Dependencies (end-user workstation)

| Dependency | Default | Notes |
|-----------|---------|-------|
| Code-Intelligence backend | `http://127.0.0.1:48721` (`sdlcAgents.backend.url`) | Loopback default; HTTPS required for any non-loopback backend (`allowInsecureRemote = false`) |
| Local MCP wrapper | In-process HTTP server; `sdlcAgents.mcpServerPort` (default 9181; **this deployment serves on 9183**) | Starts with the extension (`enableMcpServer = true`); runtime URL recorded in `.code-intel/settings.json` → `mcpUrl` |
| LLM provider credentials | VS Code SecretStorage | anthropic / openai / ollama / lmstudio / openrouter / onnx / kiro — keys survive the upgrade via migrate-on-read |

### 2.3 Access Requirements

| Access | Type | Who Needs It |
|--------|------|--------------|
| Git repo — branch `SA4E-369`, tag `v1.53.12` | Key-based | DevOps (build host) |
| Backend server (48721) | SecretStorage credentials | End users |
| LLM provider API key | SecretStorage | End users |

### 2.4 Backup Requirements

- [ ] Previous release vsix retained as rollback artifact: `extension/sdlc-agents-4-enterprise-1.53.11.vsix`
- [ ] User `settings.json` copy retained (no changes expected — version-bump-only diff)
- [ ] No database backup required (the extension holds no database)

---

## 3. Pre-Deployment Checklist

| # | Item | Responsible | Status |
|---|------|-------------|--------|
| 1 | Code merged; HEAD `71869e0` == tag `v1.53.12` (DC-4) | Dev Lead | ☐ |
| 2 | Unit/integration tests: 103/103 vitest PASS, `tsc` 0 errors | DEV | ☐ Verified in CI |
| 3 | Security review 3.7 GO-WITH-CONDITIONS → 5.7 PASS post-remediation (`53506d2`) | Security | ☐ Verified |
| 4 | Pentest 6.3: 18 probes, 5/6 SAFE, PEN-6a fixed in `71869e0` | Security | ☐ Verified |
| 5 | UAT 6.5 PASS-WITH-OPTIONAL-SPOT-CHECK on installed 1.53.12 (real Kiro) | QA + BA | ☐ Verified |
| 6 | Security deploy review 6.7 GO-WITH-CONDITIONS (0 Critical / 0 High / 2 Low) | Security | ☐ Verified |
| 7 | Rollback artifact `sdlc-agents-4-enterprise-1.53.11.vsix` available | DevOps | ☐ |
| 8 | Security deploy checklist DC-1..DC-14 + conditions C-D1..C-D3 reviewed (Section 4) | DevOps | ☐ |

---

## 4. Security Deploy Checklist (DC-1..DC-14) and Deploy Conditions (C-D1..C-D3)

> Source: `documents/SA4E-369/SECURITY-DEPLOY-REVIEW.md` (Phase 6.7). The three deploy conditions are **mandatory**; all fourteen checklist items must be executed and ticked during Phase 7.

### 4.1 Deploy Conditions from Phase 6.7 (MUST be satisfied during this deployment)

| # | Condition | Rationale | Status |
|---|-----------|-----------|--------|
| C-D1 | Ship/install **only** the versioned artifact `extension/sdlc-agents-4-enterprise-1.53.12.vsix`; verify `<Identity Version="1.53.12">` in the vsix manifest before **every** install; do NOT use the repo-root `sdlc-agents-4-enterprise-latest.vsix` | Root `*-latest.vsix` is actually **v1.48.0** and `sdlc-agents-4-enterprise.vsix` is **v1.44.0** — stale, mislabeled (Finding F1) | ☐ |
| C-D2 | After Phase 7, delete or archive the 2 stale root-level vsix files and the 10 historical `extension/*.vsix` builds (1.53.3–1.53.11) from the distribution workspace; keep only the pinned release artifact (retain 1.53.11 as the rollback artifact during the stability window) | Prevents future wrong-version installs / supply-chain confusion (F1) | ☐ |
| C-D3 | Next packaging cycle: change `.vscodeignore` `*.map` → `**/*.map` to strip the 691 source-map files from the vsix (DevOps backlog — **non-blocking for 1.53.12**) | Source disclosure + ~2× artifact bloat (F2) | ☐ Backlog |

### 4.2 Pre-Install

- [ ] **DC-1** Install only `extension/sdlc-agents-4-enterprise-1.53.12.vsix`; read the manifest and confirm `<Identity … Version="1.53.12">` — never trust the mislabeled root `*-latest.vsix` (F1)
- [ ] **DC-2** Optional 10-second secret re-sweep of the exact artifact to be shipped: extract `extension/out/extension.js` and sweep `sk-ant-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{20,}|xox[bap]-[A-Za-z0-9-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----` → expect **0** real hits (1 hit per pattern inside the redaction-regex literal is expected for AKIA/ghp/xox)
- [ ] **DC-3** Verify the SHA-256 of the vsix matches the CI-built artifact; record the hash in the release ticket (supply-chain pinning)
- [ ] **DC-4** Verify git tag `v1.53.12` == HEAD `71869e0` == the commit CI packaged (no post-tag drift)

### 4.3 Install

- [ ] **DC-5** Install via Kiro/VS Code UI or `code --install-extension <vsix>`; confirm the extension activates **only** on view/command (lazy activation — `onView` ×2, `onCommand` ×4, no `onStartupFinished`, no `*`)
- [ ] **DC-6** Post-install, confirm settings defaults on a clean profile: `sdlcAgents.backend.allowInsecureRemote = false`, backend URL = `http://127.0.0.1:48721`, `sdlcAgents.mcpMaxBodyBytes = 67108864`
- [ ] **DC-7** Spot-check peer fail-closed: open 2 chat tabs, trigger a peer tool call, verify the approval prompt appears and **auto-denies after ~30 s** without interaction
- [ ] **DC-8** Verify secrets continuity after upgrade: existing Anthropic/Jira/Pega credentials still resolve (migrate-on-read `kiroSdlc.*` → `sdlcAgents.*`) — the user must NOT be re-prompted

### 4.4 Post-Install / Hardening

- [ ] **DC-9** Enterprise managed-settings policy: pin `sdlcAgents.backend.allowInsecureRemote: false` and restrict the 9 loopback/URL settings via the `untrustedWorkspaces.restrictedConfigurations` semantics already declared by the extension
- [ ] **DC-10** For unattended/automation machines, set `sdlcAgents.backend.chatTimeout` to a positive wall-clock backstop (default 0 = disabled, loop-guard only) — Info F3
- [ ] **DC-11** Purge stale artifacts: remove root `sdlc-agents-4-enterprise.vsix` (v1.44.0), `sdlc-agents-4-enterprise-latest.vsix` (v1.48.0) and the superseded `extension/*.1.53.3–11.vsix` from the distribution workspace (executes C-D2)
- [ ] **DC-12** Next cycle: apply `.vscodeignore` `**/*.map` so future vsix stop shipping 691 source maps (executes C-D3)
- [ ] **DC-13** Backend (server) side of the deploy (port 48721) uses its own hardening + web-admin rate cap; the client `rateLimitRpm` cannot exceed it — confirm the server cap in the web admin during Phase 7
- [ ] **DC-14** Keep the 6.3 pentest regression probes (103-test suite incl. SEC-01/03 cases) in CI so future bundles keep these defenses green

---

## 5. Build & Package

### 5.1 Build Steps (build host — Node.js 22.x)

```powershell
# 0. Confirm source revision (DC-4)
git rev-parse --abbrev-ref HEAD     # expect: SA4E-369
git rev-parse HEAD                  # expect: 71869e0...
git describe --tags                 # expect: v1.53.12

# 1. Clean, reproducible dependency install (monorepo workspaces: backend + extension)
npm ci

# 2. Production bundle (esbuild --production → minified single-file bundle)
npm run esbuild-production --workspace=extension

# 3. Verify the bundle exists and matches the reviewed size
Get-Item extension/out/extension.js | Select-Object Name,Length
# expect Length = 20356385 bytes (~20.36 MB — byte-size-identical to the bundle inside the reviewed vsix)

# 4. Package the release vsix
npm run package:prod --workspace=extension
# → extension/sdlc-agents-4-enterprise-1.53.12.vsix (~10.88 MB, 2026 entries)
```

> Note: `vsce package` automatically runs the `vscode:prepublish` hook (`esbuild-production` → `copy-resources` → `gen-checksums`), so `resources/.sdlc-checksums.json` is refreshed from git HEAD content on every package. `vsce publish` is never invoked (no marketplace publish).

### 5.2 Artifact Verification (DC-1 / DC-2 / DC-3)

| Output | Expected | Gate |
|--------|----------|------|
| `extension/out/extension.js` | 20,356,385 bytes — bundle built at HEAD `71869e0` | Bundle parity with reviewed vsix |
| `extension/sdlc-agents-4-enterprise-1.53.12.vsix` | ~10.88 MB, 2026 entries | Release artifact |
| vsixmanifest Identity | `<Identity Id="dnguyenminh.sdlc-agents-4-enterprise" Version="1.53.12" …/>` | DC-1 |
| Secret sweep of extracted `out/extension.js` | 0 real hits (regex-literal self-hits for AKIA/ghp/xox expected) | DC-2 |
| SHA-256 of the vsix | Matches CI artifact; recorded in the release ticket | DC-3 |

```powershell
# DC-1 — manifest identity check (Windows 10+ bsdtar reads zip entries without extracting)
tar -xOf extension/sdlc-agents-4-enterprise-1.53.12.vsix extension.vsixmanifest
# bash equivalent:
#   unzip -p extension/sdlc-agents-4-enterprise-1.53.12.vsix extension.vsixmanifest
# expect: <Identity Id="dnguyenminh.sdlc-agents-4-enterprise" Version="1.53.12" Publisher="dnguyenminh" .../>

# DC-3 — supply-chain pinning
Get-FileHash extension/sdlc-agents-4-enterprise-1.53.12.vsix -Algorithm SHA256
```

---

## 6. Installation

### 6.1 Method A — Kiro CLI (recommended; verified working — RUN-LOG #50)

```powershell
# Install the versioned release artifact (C-D1)
kiro --install-extension "extension/sdlc-agents-4-enterprise-1.53.12.vsix"

# Verify the installed version
kiro --list-extensions --show-versions | findstr sdlc-agents
# expect: dnguyenminh.sdlc-agents-4-enterprise@1.53.12
```

Notes:

- If Kiro is already running, the previous version stays in RAM until **Reload Window** — instruct users to reload after install.
- `--force` reinstalls (or downgrades) over an existing copy.
- VS Code host: identical flow with `code --install-extension "extension/sdlc-agents-4-enterprise-1.53.12.vsix"`.

### 6.2 Method B — Extensions Panel UI

1. Open the Extensions view (`Ctrl+Shift+X`).
2. Views and More Actions (`…`) → **Install from VSIX…**
3. Select `extension/sdlc-agents-4-enterprise-1.53.12.vsix` → **Reload** when prompted.

### 6.3 Method C — Development Host (DEV only — never for release installs)

```powershell
# Runs the unpacked working tree in a Dev Host window — development/debugging only
kiro --extension-development-path=extension
```

### 6.4 Activation Model (DC-5)

Lazy activation — the extension (including the local MCP wrapper) starts **only** when the user opens a view or runs a command:

| Activation event | Trigger |
|-----------------|---------|
| `onView:sdlcAgentsTree` | SDLC Agents tree opened |
| `onView:sdlcChatPanel` | SDLC Chat panel opened |
| `onCommand:sdlcAgents.injectAll` / `.status` / `.openSettings` / `.openPegaIngester` | Command invoked |

No `onStartupFinished` and no `*` — small attack window at IDE startup.

---

## 7. Configuration

### 7.1 Settings to Verify / Set (per workstation)

| Setting | Default | PROD Guidance | Notes |
|---------|---------|----------------|-------|
| `sdlcAgents.llmProvider` | `anthropic` | Per team — enum: `anthropic`, `openai`, `ollama`, `lmstudio`, `openrouter`, `onnx`, `kiro` | Active LLM provider |
| `sdlcAgents.backend.url` | `http://127.0.0.1:48721` | Keep loopback, or an HTTPS remote | HTTP remote is rejected unless `allowInsecureRemote` is explicitly enabled |
| `sdlcAgents.backend.allowInsecureRemote` | `false` | **Pin `false`** via managed settings (DC-9) | HTTPS enforced for non-loopback backends |
| `sdlcAgents.mcpServerPort` | `9181` | **This deployment: 9183** | Local MCP wrapper port — after activation verify `.code-intel/settings.json` → `mcpUrl` (e.g. `http://127.0.0.1:9183/mcp`) |
| `sdlcAgents.enableMcpServer` | `true` | Keep `true` | Wrapper starts with the extension |
| `sdlcAgents.mcpMaxBodyBytes` | `67108864` (64 MiB) | Keep default (code-clamped [1, 100] MiB) | DoS bound (DC-6) |
| `sdlcAgents.backend.chatTimeout` | `0` (disabled) | Set a positive value on unattended hosts (DC-10) | Loop guard (`turn.maxToolRepeats = 4`) compensates by default |
| `sdlcAgents.turn.maxToolRepeats` | `4` (min 2, max 20) | Keep default | Identical-tool-call loop guard |
| `sdlcAgents.backend.rateLimitRpm` | `6000` | Keep default — advisory | Server-side cap is authoritative (DC-13) |

**PeerBus adds ZERO new settings keys (AC7/D5).** Peer bounds are locked constants in `peer/constants.ts` and deliberately not user-tunable — an untrusted repo's workspace settings have no peer knobs to weaken.

### 7.2 No Configuration Migration Required

The 1.53.11 → 1.53.12 manifest diff is a **version bump only** — zero new settings, commands, activation events or permissions. User API keys survive the upgrade via SecretStorage migrate-on-read (`kiroSdlc.*` → `sdlcAgents.*`); no re-entry (verify per DC-8).

---

## 8. Post-Deployment Verification

### 8.1 Health Checks

| # | Check | Command / Action | Expected Result | Timeout |
|---|-------|-------------------|-----------------|---------|
| 1 | Installed version | `kiro --list-extensions --show-versions` (or Extensions panel) | `dnguyenminh.sdlc-agents-4-enterprise@1.53.12` | 10 s |
| 2 | MCP wrapper health | POST a JSON-RPC `initialize` request to the wrapper URL (read `.code-intel/settings.json` → `mcpUrl`; this deployment: `http://127.0.0.1:9183/mcp`) | HTTP 200 + `result.serverInfo` (wrapper v1.11.0, ≥ 12 tools incl. `mem_ingest_file`) | 10 s |
| 3 | Extension activation | Open the SDLC Agents view → run `SDLC Agents: Show Status` | Status panel renders; backend connected | 30 s |
| 4 | Settings defaults (DC-6) | On a clean profile check: `allowInsecureRemote=false`, backend URL `http://127.0.0.1:48721`, `mcpMaxBodyBytes=67108864` | All defaults present | 2 min |
| 5 | Peer fail-closed gate (DC-7) | Open 2 chat tabs → trigger a peer tool call → do not interact | Approval prompt appears; **auto-deny after ~30 s** | 40 s |
| 6 | Secrets continuity (DC-8) | Use existing Anthropic/Jira/Pega credentials | Resolve without re-prompting | 2 min |

### 8.2 Peer Smoke Tests

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| 1 | Peer discovery | Open 2 Agentic Chat tabs; ask an agent to call `peer_list` | Both tabIds listed |
| 2 | Message delivery | `peer_send` from tab A to tab B | Envelope delivered; reply 2nd-order wrapped; `turnOrigin` marked |
| 3 | Rate limit | Send > 10 peer messages within 60 s | `PEER_004` rate-limit error |
| 4 | Size cap | `peer_send` with > 16,000 chars | `PEER_010` size-cap error |
| 5 | Anti-forgery | Include a forged envelope marker in the message body | `PEER_010_FORGERY` — forged marker neutralized to empty-message copy |
| 6 | Tab-close cleanup (I-8) | Close the target tab mid-conversation | Sender receives `PEER_009`; registry cleaned; no leaked state |
| 7 | Queue overflow | Flood a target beyond 20 queued messages | `PEER_005` queue-overflow error |
| 8 | Context governance | Peer message exceeding the target's context budget | `PEER_007` rejection — no budget bypass |

### 8.3 CI Regression (DC-14)

```powershell
npm test --workspace=extension      # expect: 103/103 PASS, 0 failed
npm run lint --workspace=extension  # eslint clean
```

### 8.4 Log Verification

| Log Entry | Level | Expected | Location |
|-----------|-------|----------|----------|
| Extension activated (on view/command) | INFO | Only after the user opens an SDLC view or runs a command | Output → SDLC Agents 4 Enterprise |
| MCP wrapper started (port 9181/9183) | INFO | After activation | Output panel |
| ERROR / FATAL after install | — | **None expected** | Extension host log |

---

## 9. Rollback Plan

### 9.1 Rollback Decision Criteria

| Condition | Action |
|-----------|--------|
| Extension fails to activate after install + reload | Immediate rollback |
| MCP wrapper unresponsive (health check 2 fails) | Immediate rollback |
| ≥ 3 peer smoke scenarios fail | Immediate rollback |
| Credential resolution broken — users re-prompted (DC-8 violated) | Immediate rollback |
| ERROR/FATAL entries in the extension host log post-install | Immediate rollback |
| Minor UI-only issue | Hotfix — no rollback |

### 9.2 Rollback Steps

| Step | Action | Command | Verification |
|------|--------|---------|--------------|
| 1 | Uninstall 1.53.12 | `kiro --uninstall-extension dnguyenminh.sdlc-agents-4-enterprise` | Extension no longer listed |
| 2 | Install previous version | `kiro --install-extension "extension/sdlc-agents-4-enterprise-1.53.11.vsix"` | `@1.53.11` listed |
| 3 | Reload window | Kiro → Reload Window | Extension activates on view/command |
| 4 | Health check | Repeat Section 8.1 checks 1–3 | Wrapper responds; status OK |
| 5 | Confirm no residue | Reopen chat tabs | Peer state was in-memory only — nothing persists on disk |

### 9.3 What Does NOT Need Rollback

| Layer | Why |
|-------|-----|
| Database | None — no schema/data changes in 1.53.12 |
| Settings | Manifest diff = version bump only; defaults unchanged |
| Secrets | SecretStorage untouched; migrate-on-read works on both versions |
| Peer artifacts | In-memory only — 1.53.12 created nothing on disk (verified in Phase 6.7 §5) |

### 9.4 Rollback Time Estimate

| Action | Estimated Time |
|--------|---------------|
| Uninstall + reinstall previous vsix | ~2 min |
| Reload + activation | ~1 min |
| Verification (health + smoke) | ~2 min |
| **Total** | **~5 min** |

---

## 10. Environment-Specific Notes

### 10.1 DEV

- Run unpacked via `kiro --extension-development-path=extension`; bundle watch: `npm run esbuild-watch --workspace=extension`.
- CI gate per CICD-SETUP.md: build → lint → test (103) → bundle → `smoke:bundle` → vsix package (no `vsce publish`).

### 10.2 UAT

- Completed 2026-10-20 (RUN-LOG #50): `package:prod` → `sdlc-agents-4-enterprise-1.53.12.vsix` (10.88 MB, 2026 entries) → `kiro --install-extension` → verified `dnguyenminh.sdlc-agents-4-enterprise@1.53.12` → reload → UAT checklist.
- UAT 6.5 result: **PASS-WITH-OPTIONAL-SPOT-CHECK** (103/103 vitest, 0 FAIL); MCP wrapper v1.11.0 responding on port 9183.

### 10.3 PROD

- **Deployment Window:** Any time, per workstation (desktop extension — no server downtime).
- **Approval Required From:** Dev Lead + Security Lead (after C-D1..C-D3 are acknowledged).
- **Communication Plan:** Notify users to Reload Window after install; distribute **only** the versioned vsix.
- **On-Call Contact:** DevOps Lead.
- **Distribution hygiene:** Execute DC-11 (purge stale root vsix) after the stability window, per C-D2.

---

## 11. Appendix

### Related Tickets (bundled in 1.53.12)

| Ticket | Summary | Relationship |
|--------|---------|--------------|
| SA4E-369 | PeerBus intra-instance agent messaging + S-01..S-05 + PEN-6a | Main ticket |
| SA4E-371 | Agent prompts packaging (8 × `src/pi-agent/prompts/*.md`) + backcompat | Included |
| SA4E-372 | Chat `chatHistory` GAP-7 fix (backward-compatible) | Included |
| SA4E-373 | `ide_launch` hardening (realpath canonicalization, sandbox prefix, loopback debug address, binary whitelist) | Included |
| SA4E-374 | Pega indexing SRP fix | Included |
| SA4E-375 | Server auto-upsert | Included |

### References

- `documents/SA4E-369/SECURITY-DEPLOY-REVIEW.md` — Phase 6.7 verdict, DC-1..DC-14, C-D1..C-D3
- `documents/SA4E-369/UAT-RESULTS.md` — Phase 6.5 · `PENTEST-REPORT.md` — Phase 6.3 · `SECURITY-ASSESSMENT.md` — Phase 5.7
- `documents/SA4E-369/CICD-SETUP.md` — pipeline gates · `TDD.md` §7.6/§8.2 — peer security design
- `extension/package.json` — manifest, scripts, settings schema
- `documents/SA4E-369/RUN-LOG.md` #50 — install verification on real Kiro

*End of Deployment Guide — SA4E-369 (2026-10-21). Author: DevOps Agent.*
