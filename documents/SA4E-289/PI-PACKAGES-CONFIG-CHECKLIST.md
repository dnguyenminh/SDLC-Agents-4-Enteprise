# SA4E-289 — Pi Packages: Config Page + Pre-install 7 Packages (spec for the implementing AI)

Goal: add a **Packages** config page (like the LLM Provider page) where users install/enable/disable Pi packages, and **pre-install 7 packages** at this milestone.

> ⚠️ **Read this feasibility section first — this is NOT just a UI page.** There is an architecture gap that must be closed before packages do anything.

## The 7 packages to pre-install
| # | Package | Source | What it does (per pi.dev/GitHub) |
|---|---------|--------|----------------------------------|
| 1 | `pi-mcp-adapter` | npm/git | One proxy tool (~200 tokens) that exposes MCP servers on-demand instead of hundreds of tools |
| 2 | `pi-web-access` | npm/git | Web access/fetch tool for the agent |
| 3 | `@juicesharp/rpiv-todo` | npm | Todo/task tracking extension |
| 4 | `@juicesharp/rpiv-ask-user-question` | npm | Ask-user-question (human-in-the-loop prompt) extension |
| 5 | `pi-lens` | npm/git | (observability/inspection tooling — confirm on gallery) |
| 6 | `context-mode` | git `mksglu/context-mode` | Routes data-heavy tool outputs through a sandbox to protect the context window; enforces routing via hooks |
| 7 | `pi-subagents` | git `tintinweb/pi-subagents` or `nicobailon/pi-subagents` | Spawn specialized sub-agents in isolated sessions (own tools/prompt/model) |

**Confirm each exact spec** (npm name vs git repo, scope, version) from `https://pi.dev/packages/<name>` before pinning. Prefer version/ref-pinned specs (`npm:pkg@1.2.3`, `git:host/user/repo@vX`) for reproducibility.

## How Pi packages actually work (verified against pi.dev docs)
- A Pi package bundles **extensions (.ts/.js), skills (SKILL.md), prompts (.md), themes (.json)**, declared in `package.json` under a `pi` key (or conventional dirs `extensions/`, `skills/`, `prompts/`, `themes/`).
- Sources: `npm:@scope/pkg@ver`, `git:host/user/repo@ref`, `https://…`, or local path.
- The reference implementation stores installed packages in `settings.json` → `packages: [ "npm:…", { source, extensions, skills, prompts, themes } ]`, with enable/disable filters.
- **Loading + install/config is done by `@earendil-works/pi-coding-agent`** (the harness), which loads extensions and `loadSkills(...)` into an `AgentHarness`.

## ⛔ Architecture gap — INVESTIGATED, decision made

**PART 0 investigation is DONE (see findings below). Conclusion: OPTION A is required. Option B is not sufficient for these 7 packages.**

### What was verified
- Installed today: only `@earendil-works/pi-ai` + `@earendil-works/pi-agent-core`. **`@earendil-works/pi-coding-agent` (the Pi extension host) is NOT installed.**
- The extension runs the **bare `Agent`** (`pi-provider.ts` → `new Agent({ streamFn, getApiKey })`), NOT the harness. The bare `Agent` does **not** provide the Pi extension API (`pi.on(...)`, `pi.events`, `pi.registerTool`, slash commands) that these packages call.

### Per-package classification (from each package's README / pi.dev)
| Package | Type | Needs Pi extension host? | Notes |
|---------|------|--------------------------|-------|
| `pi-mcp-adapter` | **Pi extension** (+ bundles MCP config loading) | **YES** | Uses `pi.on('session_start')`, `pi.events` bus (`pi-mcp-adapter:runtime-register`, `MCP_STATUS_EVENT`), registers the `mcp` proxy tool + `/mcp` slash commands. `pi install npm:pi-mcp-adapter`. Not just an MCP config file. |
| `pi-web-access` | **Pi extension** | **YES** | Web fetch/search tool registered as a Pi tool. |
| `@juicesharp/rpiv-todo` | **Pi extension** | **YES** | Registers todo tools. |
| `@juicesharp/rpiv-ask-user-question` | **Pi extension** | **YES** | Registers an ask-user tool (needs UI + tool registration). |
| `pi-lens` | **Pi extension** | **YES** | Observability/inspection extension. |
| `context-mode` | **Pi extension + MCP server** | **YES for full value** | Full routing/session continuity needs the extension registering `tool_call`/`tool_result`/`session_start`/`session_before_compact` hooks. Its "MCP-only path" gives ~60% compliance via a rules file; the extension path gives ~98%. So MCP-only is a degraded fallback, not parity. |
| `pi-subagents` | **Pi extension** | **YES** | Spawns child agents with own tools/prompt/model; deeply tied to the harness. |

### Conclusion: **OPTION A — adopt the Pi extension host**
All 7 are **Pi extensions** installed via `pi install` into the Pi Coding Agent host. They call `pi.on(...)` / `pi.events` / tool + slash-command registration APIs that live in `@earendil-works/pi-coding-agent`, NOT in `pi-agent-core`. Therefore:
- **Option B (MCP-first) is rejected** as the primary approach: only `pi-mcp-adapter` and `context-mode` even ship an MCP server, and for `context-mode` the MCP-only mode is an explicitly degraded (~60%) fallback. The other 5 packages have no MCP surface at all and will do nothing without the extension host.
- **Option A is mandatory:** integrate `@earendil-works/pi-coding-agent` (the extension host + package loader), or reimplement the subset of the Pi extension API these packages use, then run the Pi turn through the host so installed packages' extensions/tools/hooks/slash-commands load.

> This is a **significant architectural change** to the Pi run path (`PiProvider`/`PiWorkflowEngine` currently use bare `Agent`). Budget accordingly. The config UI is cheap; adopting the extension host is the real work and MUST land before any of the 7 packages function.

### Recommended sub-decision inside Option A
Do a focused spike to choose the integration shape and record it in `PI-PACKAGES-DECISION.md`:
- **A1 — Use `pi-coding-agent` harness directly:** replace/wrap the bare `Agent` with the coding-agent harness that already implements the extension API + package loader (`pi install`, `pi config`, `loadSkills`, `pi.on` hook dispatch). Least reinvention; larger dependency + surface change; verify it fits a VS Code webview host (it targets a terminal harness).
- **A2 — Embed only the extension-host runtime pieces:** pull in the package loader + `pi` extension event bus/tool-registration API and wire them onto the current `Agent` run, without the full terminal harness. More control, more work, must track upstream API.

Confirm which extension-host APIs each of the 7 packages actually require (`pi.on` events, `pi.registerTool`, `pi.events` custom channels, slash commands, `session_*` hooks) and make sure A1/A2 provides them. Then decide.

---

## CHECKLIST

### PART 0 — Decision spike — ✅ DONE (see "Architecture gap" above)
- [x] Classified all 7: **all are Pi extensions** requiring the Pi extension host (not bare `Agent`, not MCP-only).
- [x] Confirmed `pi-agent-core` alone CANNOT load them; `@earendil-works/pi-coding-agent` (or an equivalent extension-host runtime) IS required. Decision: **Option A**.
- [ ] Remaining spike: choose **A1 (use pi-coding-agent harness)** vs **A2 (embed extension-host runtime onto current Agent)**; verify the chosen shape provides the `pi.on`/`pi.events`/tool+slash registration APIs the 7 packages use in a VS Code webview host; write `PI-PACKAGES-DECISION.md`.

### PART 1 — Settings model + storage
- [ ] Extend the extension settings model (same layer as LLM provider config — `ProviderConfigService` / `SettingsMessageHandler`) with a `piPackages` list. Store in `vscode.workspace.getConfiguration('kiroSdlc')` (e.g. `kiroSdlc.piPackages`) as an array of `{ source, enabled, extensions?, skills?, prompts?, themes? }` mirroring pi's settings shape.
- [ ] Seed the 7 packages as defaults (enabled) at this milestone — but only after PART 0 confirms they're loadable.
- [ ] Package identity/dedup rules per pi docs: npm → package name; git → repo URL without ref; local → absolute path.

### PART 2 — Config page UI (Settings panel new tab)
- [ ] Add a **Packages** tab to the existing Settings panel (next to "LLM Provider", "Server Settings", "Proxy"). Reuse the settings webview + `SettingsMessageHandler` pattern.
- [ ] List installed packages: name, source, type (extension/skill/mcp), enabled toggle, version/ref, remove button.
- [ ] Add package: input for `npm:…` / `git:…` / URL / local path + Install button (with BlockingOverlay per frontend-structure: "Installing…").
- [ ] Show the 7 curated packages as a gallery/quick-add list (name + short description from the table above).
- [ ] Follow `frontend-structure` steering: `.svelte` markup + `.ts` logic, `var(--vscode-*)`, native `<select>` styling, every async op has loading/success/error feedback, no silent catch, BlockingOverlay for install/remove.
- [ ] UI-relative paths only.

### PART 3 — Install mechanism
- [ ] Implement install/remove/list/enable-disable for the chosen source types. Reuse pi's conventions:
  - npm → `npm install` into a managed dir (per pi: user `~/.pi/agent/npm/`, project `.pi/npm/`; adapt to the extension's storage, e.g. globalStorage). Pin versions.
  - git → clone + `npm install` if `package.json` exists; pin ref.
  - local → reference path, no copy.
- [ ] SECURITY: pi packages run with full system access (extensions execute arbitrary code). Add a confirmation/warning before installing third-party packages, and prefer pinned versions/refs. Do not auto-run untrusted code silently.
- [ ] Persist installed set to the settings model (PART 1).

### PART 4 — Adopt the Pi extension host + load packages (Option A — the real work)
- [ ] Integrate the Pi extension host (A1: `@earendil-works/pi-coding-agent` harness, or A2: embed its extension-host runtime) into the Pi run path. This must provide, at minimum, the APIs these packages use:
  - `pi.on('tool_call' | 'tool_result' | 'session_start' | 'session_before_compact', …)` hook dispatch (context-mode, pi-subagents, pi-mcp-adapter).
  - `pi.events` custom event bus (pi-mcp-adapter runtime-register + status channels).
  - Tool registration (`registerTool`/`unregisterTool`) so extensions add tools to the agent's tool list.
  - Slash-command registration (`/mcp`, `/ctx …`, etc.).
  - Package/resource loader: read installed packages from settings, load their `extensions/`, `skills/`, `prompts/` per the `pi` manifest.
- [ ] Route the Pi turn through the host so loaded extensions' tools/hooks/slash-commands are active during `run`. Respect enable/disable filters from settings.
- [ ] Emit status to the UI (installed / loaded / failed per package) so the page reflects reality (no fake "connected").
- [ ] For `context-mode` specifically: prefer the extension path (hooks, ~98%) over the MCP-only rules-file fallback (~60%).

### PART 5 — Tests + verify
- [ ] Settings round-trip test: add/enable/disable/remove a package updates `kiroSdlc.piPackages`.
- [ ] Loader test (per chosen option): a package's tool/skill actually appears in the agent run (use a local fixture package, not network).
- [ ] `cd extension; npx tsc --noEmit` clean; `npx vitest run` green.
- [ ] Manual in Kiro: open Packages tab → the 7 seeded packages listed; install one → appears + its capability is usable in chat; disable → capability gone.

## Acceptance criteria
- [ ] Packages tab exists in Settings, lists installed + curated 7, supports install/remove/enable/disable with proper feedback.
- [ ] The 7 packages are pre-seeded and (for the covered types) actually loaded into the Pi agent.
- [ ] No silent failures; security warning before installing third-party code; pinned versions/refs.
- [ ] Decision doc (A vs B) committed; coverage of each of the 7 documented.

## Guardrails
- **Fix the model-resolution ordering bug FIRST** (`PI-MODEL-ORDERING-FIX-CHECKLIST.md`) — chat must actually run before packages matter.
- No-workaround: don't fake "installed/loaded" state; reflect real load status.
- Reuse the existing Settings panel + config service; don't fork settings.
- Verify each package's real source/name/type on `pi.dev/packages` before pinning; do not assume.
- Security: warn on third-party install; pin versions/refs; never execute untrusted extension code without user consent.
- Engine/provider stay UI-agnostic; the Packages UI + install live in the extension host layer.
- Out of scope: LangGraph removal = SA4E-297 (SA4E-307 does not exist); chat layout = separate spec.

## Reference
- Pi packages doc: https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md
- Gallery: https://pi.dev/packages
- Content above was rephrased/summarized from public pi.dev + GitHub sources for compliance.
