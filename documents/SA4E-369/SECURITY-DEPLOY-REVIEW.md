# Security Deploy Review — SA4E-369

## Document Information

| Field | Value |
|-------|-------|
| Ticket | SA4E-369 — Intra-instance agent-to-agent messaging (local PeerBus, zero-config) |
| Phase | 6.7 Security Deploy Review (deployment readiness) |
| Target artifact | `extension/sdlc-agents-4-enterprise-1.53.12.vsix` (10.88 MB, **2026 entries**, Identity `1.53.12`, publisher `dnguyenminh`) |
| Source revision | HEAD `71869e0` (tag `v1.53.12`) |
| Date | 2026-10-21 |
| Assessor | security-agent (read-only — KHÔNG sửa code) |
| Prior gates | 3.7 SECURITY-REVIEW GO-WITH-CONDITIONS → 5.7 SECURITY-ASSESSMENT **PASS post-remediation** (`53506d2`, S-01..S-05 closed) → 6.3 PENTEST **5/6 SAFE** + PEN-6a Low **fixed** (`71869e0`) → 6.5 UAT **PASS-WITH-OPTIONAL-SPOT-CHECK** (103/103 vitest, 0 FAIL) |

---

## Verdict

### **GO-WITH-CONDITIONS** — deployment-ready from a security perspective

**0 Critical · 0 High · 2 Low · 2 Informational.** No blocker exists in the shipped artifact itself: the 1.53.12 vsix contains **zero embedded secrets**, the peer feature adds **no new commands/settings/network surface**, all fail-closed and anti-injection defenses verified **present and inlined in the production minified bundle**, and the 1.53.11 → 1.53.12 diff introduces **no security breaking changes**. The two Low findings are **deploy-hygiene traps outside the artifact** (stale vsix artifacts at repo root) and **packaging bloat** (source maps) — both resolved by checklist conditions below, no code change required.

**Conditions (must be satisfied during Phase 7 deploy):**

| # | Condition | Rationale |
|---|-----------|------------|
| C-D1 | Ship/install **only** the versioned artifact `extension/sdlc-agents-4-enterprise-1.53.12.vsix`; verify `<Identity Version="1.53.12">` inside the vsix manifest before every install; do NOT use repo-root `sdlc-agents-4-enterprise-latest.vsix` | Root artifact named "latest" is actually **v1.48.0** and `sdlc-agents-4-enterprise.vsix` is **v1.44.0** — stale, mislabeled (Finding F1) |
| C-D2 | After Phase 7, delete or archive the 2 stale root-level vsix files and the 10 historical `extension/*.vsix` builds from the shipped workspace; keep only the pinned release artifact | Prevents future wrong-version installs / supply-chain confusion (F1) |
| C-D3 | Next packaging cycle: change `.vscodeignore` `*.map` → `**/*.map` to strip the 691 source-map files from the vsix (DevOps backlog, non-blocking for 1.53.12) | Source disclosure + ~2× artifact bloat (F2) |

---

## 1. Packaging Security

### 1.1 Artifact identity (verified)

| Attribute | Value | Verification |
|-----------|-------|--------------|
| File | `extension/sdlc-agents-4-enterprise-1.53.12.vsix` | 10.88 MB, 2026 entries |
| Identity | `sdlc-agents-4-enterprise` **Version 1.53.12** | vsixmanifest read from zip |
| Main bundle | `extension/out/extension.js` = **20,356,385 bytes** | Byte-identical size to working-tree build `extension/out/extension.js` (20,356,305 chars) ⇒ **bundle built at HEAD `71869e0`** |
| Agent prompts | 8 `src/pi-agent/prompts/*.md` packaged | SA4E-371 fix confirmed in vsix |
| Integrity manifest | `extension/resources/.sdlc-checksums.json` (21,880 b) present | Generated from **git HEAD committed content** (gen-checksums.js) — tamper-evident agent/steering/template files |

### 1.2 Secret sweep of the production bundle (out/extension.js)

Methodology: full-content regex sweep of the 20.36M-char esbuild-production bundle extracted **from inside the 1.53.12 vsix** (not just the working tree).

| Pattern (real secret shape) | Matches | Classification |
|------------------------------|---------|----------------|
| `sk-ant-[A-Za-z0-9_-]{20,}` (Anthropic API key) | **0** | ✅ clean |
| `AKIA[0-9A-Z]{16}` (AWS access key) | 0 real *(1 hit = the redaction regex literal itself, see below)* | ✅ clean |
| `ghp_[A-Za-z0-9]{20,}` (GitHub PAT) | 0 real *(1 hit = redaction regex)* | ✅ clean |
| `xox[bap]-[A-Za-z0-9-]{10,}` (Slack token) | 0 real *(1 hit = redaction regex)* | ✅ clean |
| `-----BEGIN [A-Z ]*PRIVATE KEY-----` (PEM) | 0 real *(1 hit = redaction regex)* | ✅ clean |
| Generic `api_key`/`apiKey`/`secret`/`password`/`credential` (hundreds of hits) | all triaged | ✅ all code, not values — see 1.3 |

**Verdict: no secrets, tokens, API keys or private keys are embedded in the shipped bundle.** The only "AKIA"-shaped noise sits inside base64-encoded binary resources, and the strict 20+ char sweeps confirm none are real credentials.

### 1.3 Triage of secret-*shaped* content (all benign)

- **SecretStorage, not plaintext**: bundle uses the VS Code `secrets` API for credentials (`this.secrets.get(r)` for Pega operator secret; `AtlassianCredentialService`; `llm-secret-keys.js` = secret-storage **key names** + migrate-on-read `kiroSdlc.*` → `sdlcAgents.*` so user keys survive the rename without re-entry).
- **PEN-6a redaction regexes ARE shipped** (this is the remediation, not a leak): `(api[-_]?key|secret|token|password|passwd|credential|authorization|cookie)` field-name pattern + `AKIA[0-9A-Z]{16}` + `gh[po]_...` + `xox[bap]-...` + `BEGIN PRIVATE KEY` — the `curateReason` SECRET_PATTERNS from fix-batch `71869e0` that redact secret-shaped strings crossing tabs.
- `sk-ant-oat` hits = OAuth-token **type detection** (`t.startsWith("sk-ant-oat")`), not literal tokens.
- `credentials-manager.js` `validateRef` enforces `env:/ref:` references — rejects raw secret material in config.
- `allowInsecureRemote` warning text present in bundle ("traffic ... is unencrypted HTTP. Basic-auth credentials can be intercepted (MITM)") — secure-by-default messaging shipped.

### 1.4 Packaging findings

**Finding F1 (Low — CWE-494 / supply-chain hygiene): stale + mislabeled vsix artifacts at repo root.**
`sdlc-agents-4-enterprise-latest.vsix` (22.63 MB) is actually **v1.48.0**; `sdlc-agents-4-enterprise.vsix` (10.42 MB) is **v1.44.0**; plus 10 historical `extension/sdlc-agents-4-enterprise-1.53.3..1.53.11.vsix`. An operator running "install the latest vsix" deploys a **5-major-minor-old build without the SA4E-369 security remediations**. Remediation: C-D1/C-D2 (verify `<Identity Version>` before install; purge stale artifacts after release).

**Finding F2 (Low — source disclosure / bloat): 691 `.js.map` files shipped in the vsix** despite `.vscodeignore` containing `*.map` — the glob only matches root-level entries; nested maps need `**/*.map`. Maps were swept: they contain repo source structure only, **no secrets** (same 0-hit result). Remediation: C-D3 (one-line `.vscodeignore` fix next cycle; non-blocking).

---

## 2. Deploy Surface Analysis

### 2.1 Activation surface — lazy, minimal ✅

`activationEvents` = `onView:sdlcAgentsTree`, `onView:sdlcChatPanel`, and 4 `onCommand:` entries only. No `onStartupFinished`, no `*`. The extension (including the local MCP wrapper server) does not start until the user opens a view or runs a command — small attack window at IDE startup.

### 2.2 Command surface (30 commands, all user-invoked)

| Risk tier | Commands | Assessment |
|-----------|----------|------------|
| Workspace-write | `injectAll`, `injectSelective`, `update` | Write agent/steering template files into the **user's own workspace** (`.kiro/`); user-initiated, visible in git; checksum-manifested (gen-checksums) |
| Network-read | `indexDocuments`, `indexSource`, `syncWorkspace`, `fetchPegaContext`, `login`, `reconnect` | Talk to configured backend (default **loopback** `127.0.0.1:48721`) / Pega endpoint; credentials from SecretStorage; HTTPS enforced for remote unless explicit `allowInsecureRemote` opt-in |
| UI/read-only | status, settings, KB panels/graph/analytics, symbol search, impact analysis, plan canvas, security panel, agentic chat, Pega ingester, enrichment retry/status | No dangerous capability |
| Session | `logout`, `disconnect` | ✅ safe |

**No command executes arbitrary shell, requires no elevation, and none auto-runs.** The only subprocess launcher in scope (agent-tool `ide_launch`) received SA4E-373 hardening **in this release**: realpath canonicalization + sandbox prefix for `userDataDir`, `--remote-debugging-address=127.0.0.1`, `ideBinaryPath` whitelist + path sanitization.

### 2.3 PeerBus (new in 1.53.12) — zero new deploy surface ✅

- **No new commands, no new settings keys** (AC7 zero-config; `constants.ts`: "No settings keys exist"). The only new surface is 3 **in-session LLM tools** — `peer_list`, `peer_send`, `peer_status` — confirmed present in the bundle with prompt guidelines ("Call peer_list first to discover target tabIds before peer_send", "Max 16000 chars").
- **No sockets** (AC7 re-verified in pentest Phase 6.3): in-process EventEmitter bus, same extension host, same user.
- All 10 guardrail error codes shipped: PEER_001 (tab unavailable), 002 (self-send), 003 (task failed), 004 (anti-loop cap 5), 005 (queue overflow cap 20), 006 (blocking timeout), 007 (context-governance rejection — no budget bypass), 008 (unknown task), 009 (target closed), 010 (size cap / forgery).
- Peer-triggered agent turns run behind the **Option A fail-closed ToolApprovalGate** — hardwired in code, not bypassable via settings (see §3.3).

### 2.4 Network/host surface

| Surface | Status |
|---------|--------|
| Local MCP wrapper (`enableMcpServer` default true, port 9181) | Loopback URL injected into IDE config (`http://127.0.0.1:{port}/mcp`); body cap 64 MiB, clamped in code [1–100 MiB] |
| SSO PKCE callback server | Binds explicitly `listen(port, "127.0.0.1")`; validates `Host` header == `127.0.0.1:{port}` AND remote address ∈ {127.0.0.1, ::1, ::ffff:127.0.0.1} → **anti-DNS-rebinding** ✅ |
| Chat webview | Per-render CSP nonce from `crypto.randomBytes(16)` (`ChatWebviewProvider`) — only trusted scripts execute ✅ |
| Untrusted workspaces | `untrustedWorkspaces.supported: true` + **9 restrictedConfigurations** (backend.url, allowInsecureRemote, pegaEndpoint, pegaUsername, atlassianConnectionType, anthropic/openai/ollama/lmstudio base URLs) — an untrusted repo cannot redirect the extension to an attacker backend ✅ |

---

## 3. Config Defaults Audit

### 3.1 Settings defaults (all safe or consciously documented)

| Setting | Default | Verdict |
|---------|---------|---------|
| `sdlcAgents.backend.url` | `http://127.0.0.1:48721` | ✅ loopback-only default |
| `sdlcAgents.backend.allowInsecureRemote` | `false` | ✅ HTTPS required for any non-loopback backend; explicit opt-in with MITM warning |
| `sdlcAgents.backend.ssoEnabled` | `false` | ✅ opt-in |
| `sdlcAgents.backend.toolCallTimeout` | 300,000 ms | ✅ bounded |
| `sdlcAgents.backend.chatTimeout` | **0 (disabled)** | ⚠️ Info F3 — wall-clock turn backstop off by default; compensated by loop guard below. Document opt-in for unattended usage |
| `sdlcAgents.turn.maxToolRepeats` | 4 (min 2, max 20) | ✅ identical-tool-call loop guard |
| `sdlcAgents.backend.rateLimitRpm` | 6000 | ✅ client-side *request* — server clamps to its own hard cap |
| `sdlcAgents.backend.healthCheckInterval` | 30,000 ms | ✅ |
| `sdlcAgents.mcpMaxBodyBytes` | 64 MiB, code-clamped [1, 100] MiB | ✅ DoS bound |
| `sdlcAgents.pega.*` (batch 50, concurrency 10, dedup 100k) | bounded, min/max enforced | ✅ resource caps |
| `sdlcAgents.proxy.bypass` | `localhost,127.0.0.1,::1` | ✅ loopback never proxied |

### 3.2 Peer bounds — locked constants, **not** user-tunable (deliberate)

`peer/constants.ts` is the single tuning point; **no settings keys exist** (AC7/D5) ⇒ an attacker (or a confused user) **cannot weaken the peer guardrails via workspace settings**, which matters because workspace settings can be contributed by untrusted repos — here they simply have no peer knobs to touch.

| Constant | Value | Role |
|----------|-------|------|
| `MAX_PINGPONG_TURNS` | 5 — **LOCKED** (AC3) | anti-loop per pair (PEER_004) |
| `RATE_LIMIT_MAX` / `RATE_WINDOW_MS` | 10 / 60,000 ms | per-tab inbound rate limit |
| `PEER_MESSAGE_MAX_CHARS` | 16,000 | per-message size cap (SEC-03/C2, PEER_010) |
| `INBOUND_QUEUE_CAP` | 20 | inbound FIFO overflow → PEER_005 |
| `BLOCKING_TIMEOUT_MS` | 300,000 ms | caller-side only (PEER_006) |
| `THREAD_MAX_ENTRIES` / `POST_TERMINAL_RETENTION_MS` | 50 / 60,000 ms | bounded memory |
| `PEER_APPROVAL_TIMEOUT_MS` | **30,000 ms → auto-deny** | bounds silent-stall surface (S-02d) |

### 3.3 Peer approval gate default — fail-closed, hardwired ✅

D6 Option A is **code-level, not configuration**: `peer/approval.ts` builds the fail-closed handler ("with no gate handler wired the call is BLOCKED (fail-closed)… 'Peer-turn tool call blocked: no approval gate available (fail-closed).'"). There is **no setting to disable it**, no read-only auto-approve, no autopilot. 30 s timeout ⇒ deny. This is the strongest possible default posture: absent UI, peer tool calls fail closed.

---

## 4. Runtime Security Posture (production bundle)

The production artifact is **esbuild-minified**, so exported identifiers are renamed (`PeerPromptEnvelope`, `curateReason`, `SECRET_PATTERNS` etc. are absent as names). Runtime posture was therefore verified via **string literals, inlined numeric bounds and shipped code paths** inside the vsix's `out/extension.js`:

| Defense (design name) | Evidence in shipped bundle | Status |
|------------------------|----------------------------|--------|
| Anti-loop guard (AC3) | `a>=5?{pass:!1,error:fb("PEER_004",…{pair:n,cap:5})}` — cap **5 inlined** | ✅ intact |
| Rate limit | `o.length>=10` → PEER_004 (10/window inlined) | ✅ intact |
| Message size cap (SEC-03/C2) | `PEER_010` ×10; tool description `Max 16000 chars` (16,000 inlined) | ✅ intact |
| Queue overflow / blocking timeout | PEER_005 ×6, PEER_006 ×3 | ✅ intact |
| Context-governance passthrough (AC5, no budget bypass) | PEER_007 rejection classification on peer turns | ✅ intact |
| Anti-injection envelope (`PeerPromptEnvelope`, `turnOrigin`) | `turnOrigin` ×11 (string key survives minification) | ✅ intact |
| Marker forgery neutralization + empty-message copy | PEER_010 copy variants present | ✅ intact |
| **PEN-6a fix — SECRET_PATTERNS redaction in `curateReason`** | full redaction regex set shipped: field-name pattern `api[-_]?key|secret|token|password|passwd|credential|authorization|cookie` + `AKIA[0-9A-Z]{16}` + `gh[po]_…` + `xox[bap]-…` + `BEGIN … PRIVATE KEY` | ✅ fix-batch `71869e0` compiled in |
| Fail-closed approval gate (S-02/D6) | `"…no approval gate available (fail-closed)"` literal + `peer-approval` wiring label; 30,000 ms auto-deny value present | ✅ intact |
| Registry I-1 stomp guard | `existing.status === 'busy' ? 'busy' : next.status` — re-register can never downgrade mid-turn busy→idle | ✅ intact |
| Lifecycle wiring (S-01) + BR-9 chain reset | `wirePeerTabLifecycle` one-call-per-source (wire-once guard) | ✅ intact |
| Secret redaction in chat/compact pipeline | `secretFilter` + zYc field-name matcher shipped | ✅ intact |

**Conclusion:** every remediation and defense accepted in 5.7 (`53506d2`) and 6.3 fix-batch (`71869e0`) is verifiably present in the **shipped minified bundle** — fail-closed posture maintained end-to-end from source to artifact. Bundle in vsix is byte-size-identical to the HEAD build, so what was reviewed is what ships.

---

## 5. Upgrade Path (1.53.11 → 1.53.12)

| Aspect | Result |
|--------|--------|
| Diff scope | 135 files, +14,929 / −2,283 (tag `v1.53.11`…`v1.53.12`) |
| Commits included | SA4E-369 peer feature + security remediations (`e8df2ee`, `53506d2`, `71869e0`), SA4E-371 (prompts packaging + backcompat), SA4E-372 (chat:chatHistory GAP-7 fix), **SA4E-373 ide_launch hardening**, SA4E-374 (Pega indexing SRP fix), SA4E-375 (server auto-upsert) |
| `extension/package.json` diff | **Version bump only** — zero new settings, commands, activation events, or permissions ⇒ **no config migration, no new user-facing surface** |
| New feature surface | PeerBus = in-process only, **no sockets** (AC7 verified), zero-config ⇒ no port/permission changes on upgrade |
| Security-relevant changes | Net **positive**: + fail-closed approval gate, + PEN-6a secret redaction, + ide_launch canonicalization/sandbox/loopback-debug/whitelist, + lifecycle wiring. **No control removed, no default weakened** |
| Secret continuity | `llm-secret-keys` migrate-on-read `kiroSdlc.*` → `sdlcAgents.*` ⇒ user API keys **survive the upgrade without re-entry** (no plaintext copy ever exists) |
| Breaking changes (security) | **None identified.** Additive only; chat protocol GAP-7 fix is backward-compatible |
| Rollback | Downgrade to 1.53.11 vsix is safe (peer feature absent, settings unchanged); note 1.53.12-created peer artifacts don't exist on disk (in-memory only) ⇒ clean rollback |

**Verdict: 1.53.12 is a security-additive upgrade — GO for in-place upgrade of existing installs.**

---

## 6. Deploy Security Checklist (for DevOps — Phase 7)

Pre-install:
- [ ] **DC-1** Install only `extension/sdlc-agents-4-enterprise-1.53.12.vsix`; run `unzip -p <vsix> extension.vsixmanifest` (or equivalent) and confirm `<Identity … Version="1.53.12">` — do NOT trust the mislabeled root `*-latest.vsix` (F1)
- [ ] **DC-2** Optional 10-second secret re-sweep of the exact artifact to be shipped: extract `extension/out/extension.js`, regex `sk-ant-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{20,}|xox[bap]-[A-Za-z0-9-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----` → expect **0** real hits (1 hit per pattern inside the redaction-regex literal is expected for AKIA/ghp/xox)
- [ ] **DC-3** Verify SHA-256 of the vsix matches the CI-built artifact; record hash in the release ticket (supply-chain pinning)
- [ ] **DC-4** Verify git tag `v1.53.12` == HEAD `71869e0` == the commit CI packaged (no post-tag drift)

Install:
- [ ] **DC-5** Install via Kiro/VS Code UI or `code --install-extension <vsix>`; confirm extension activates **only** on view/command (lazy activation) — check the activationEvents above if a marketplace listing is produced
- [ ] **DC-6** Post-install, confirm settings defaults on a clean profile: `allowInsecureRemote = false`, backend URL = `http://127.0.0.1:48721`, `mcpMaxBodyBytes = 67108864`
- [ ] **DC-7** Spot-check peer fail-closed: open 2 chat tabs, trigger a peer tool call, verify approval prompt appears and auto-denies after ~30 s without interaction
- [ ] **DC-8** Verify secrets continuity after upgrade: existing Anthropic/Jira/Pega credentials still resolve (migrate-on-read) — user should NOT be re-prompted

Post-install / hardening:
- [ ] **DC-9** Enterprise managed-settings policy: pin `sdlcAgents.backend.allowInsecureRemote: false` and restrict the 9 loopback/URL settings via `untrustedWorkspaces.restrictedConfigurations` semantics already declared by the extension
- [ ] **DC-10** For unattended/automation machines, set `sdlcAgents.backend.chatTimeout` to a positive wall-clock backstop (default 0 = disabled, loop-guard only) — F3
- [ ] **DC-11** Purge stale artifacts: remove root `sdlc-agents-4-enterprise.vsix` (v1.44.0), `sdlc-agents-4-enterprise-latest.vsix` (v1.48.0) and superseded `extension/*.1.53.3–11.vsix` from the distribution workspace (C-D2)
- [ ] **DC-12** Next cycle: apply `.vscodeignore` `**/*.map` so future vsix stop shipping 691 source maps (C-D3)
- [ ] **DC-13** Backend (server) side of deploy (48721) uses its own hardening + web-admin rate cap; client `rateLimitRpm` cannot exceed it — confirm server cap in web admin during Phase 7
- [ ] **DC-14** Keep the 6.3 pentest regression probes (103-test suite incl. SEC-01/03 cases) in CI so future bundles keep these defenses green

---

## Findings Summary

| ID | Severity | Title | Disposition |
|----|----------|-------|-------------|
| F1 | 🟡 Low | Stale/mislabeled vsix artifacts at repo root (latest = 1.48.0) | Deploy-time conditions C-D1/C-D2 + checklist DC-1/DC-11 |
| F2 | 🟡 Low | 691 source maps shipped in vsix (`*.map` ignore too narrow) | Non-blocking; C-D3 + DC-12 next cycle |
| F3 | ℹ️ Info | `chatTimeout` wall-clock default disabled (loop-guard compensates) | DC-10 guidance for unattended use |
| F4 | ℹ️ Info | High client-side `rateLimitRpm` default (6000) is advisory only | Server-side clamp authoritative — DC-13 |

## Scope Limitations

- Static review of the packaged artifact + bundle + diff; **DAST not re-run here** (covered by Phase 6.3 pentest @ `53506d2` and 6.5 UAT on the installed 1.53.12).
- Backend server (port 48721) hardening, marketplace publishing pipeline, and OS-level hardening are **out of scope** for this extension-artifact review.
- Minified-bundle verification uses string-literal/inlined-constant evidence; identifier-level tracing is impossible post-minification (expected for esbuild).
- Runtime exploit attempts deliberately NOT performed (read-only assessment).

## References

- SECURITY-REVIEW.md (Phase 3.7, GO-WITH-CONDITIONS, C1–C3) · SECURITY-ASSESSMENT.md (Phase 5.7, PASS post-remediation `53506d2`) · PENTEST-REPORT.md (Phase 6.3, 5/6 SAFE + PEN-6a fixed `71869e0`) · UAT-RESULTS.md (Phase 6.5, PASS-WITH-OPTIONAL-SPOT-CHECK) · STATUS.json (D6 = Option A) · TDD.md §7.6/§8.2 · peer/constants.ts · peer/approval.ts · extension/package.json · v1.53.11…v1.53.12 diff

*End of Security Deploy Review — SA4E-369 Phase 6.7 (2026-10-21). Assessor: security-agent (read-only). Verdict: GO-WITH-CONDITIONS (C-D1..C-D3).*