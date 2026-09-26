# SA4E-289 — Pi Chat UI Layout Implementation Checklist

Based on the UI-SPEC mockups on `origin/SA4E-289` (`documents/SA4E-289/*.png/.drawio`). This turns those mockups into an implementation plan **on main**, mapped to the real Pi runtime + existing Svelte components. It also fixes the defects in the branch's draft code.

## Source mockups (embedded below; files in `documents/SA4E-289/`)

**Overall VS Code layout** — Activity Bar / Sidebar SDLC Agents / Editor / **Webview Panel: Dashboard+Chat+Approval** / Status Bar.

![Overall VS Code layout](vscode-ui-mockup.png)

**Webview flow** — Webview → {Dashboard/Worklist, Agent Chat, Approval Panel, Settings Pi Provider}.

![Webview flow](ui-flow.png)

**Chat 3-pane skeleton** — Toolbar / Left (History, Tool Calls, State Snapshot) / Center (Message Thread, Streaming, Markdown) / Right (Current State JSON, Checkpoint History, Approval Queue) / Input / Status Bar.

![Chat window internal](chat-window-internal.png)

**Chat 3-pane with real data** — Session SA4E-289, Worklist SA4E-290..292, Approval Request create_checkpoint [Approve][Reject].

![Chat screen detail](chat-screen-detail.png)

**Approval Panel** — Queue (pending list) + Detail (Tool, Parameters, Risk, Audit ID) + [Approve][Reject][Request Info].

![Approval detail](approval-detail.png)

**Dashboard / Worklist** — Worklist Epic SA4E-289: Filters, Table (ID|Title|Status|Phase|Last Checkpoint), Stats (8 Stories | 6 Done | 2 In Progress | Checkpoint Success 99%).

![Dashboard detail](dashboard-detail.png)

**Settings** — LLM Provider settings (already implemented on main; reference).

![Settings detail](settings-detail.png)

## Guiding principles
- **Reuse, don't rebuild.** Main already has: stores `chatStore`, `toolStore`, `connectionStore`, `contextStore`, `diffTrackerStore`, `agentStore`; components `ChatPanel`, `ChatHeader`, `ChatInput`, `ChatMessageList`, `ChatMessage`, `PermissionGuard`, `DiffSummaryPanel`; and the ext↔webview protocol in `extension/src/chat-panel/message-protocol.ts` + `message-routing.ts` + `message-handler.ts`.
- **Real data only.** Do NOT copy the branch's `piWorkflowStore.ts` — it hardcodes `sessionId:'sa4e-289-session'`, `phase:'implementation'`, `providerStatus:'connected'` (SEC-289-11). All state must come from the extension host via the message bridge.
- **UI-relative paths** per steering (no absolute `/...`).
- **Sequencing:** the runtime "Unknown provider" bug (provider registration) should be fixed FIRST — a pretty UI over a broken chat is pointless. This UI work is the next milestone after that.

---

## PHASE 0 — Import the spec + assets (do first)

- [ ] Copy the mockup set from the branch into main so the spec lives with the code:
  - `documents/SA4E-289/*.drawio` + `*.png` (vscode-ui-mockup, ui-flow, chat-window-internal, chat-screen-detail, approval-detail, dashboard-detail, settings-detail).
  - `documents/CHAT-MODULE-PARITY-DISCUSSION.md` (backlog: F1 compact, F2 diff viz, slash commands) — add a note "engine now Pi SDK; LangGraph sections historical".
- [ ] Do NOT import the branch's `LeftPane.svelte` / `piWorkflowStore.ts` as-is (reference only; see defects above).

## PHASE 1 — State plumbing (foundation for every panel)

- [ ] **New store `piWorkflowStore.ts` (main version, no hardcoding):** shape `{ sessionId, phase, providerStatus, providerName, model, tokens, latencyMs }`, all `undefined`/`disconnected` by default. Populated only from ext→webview messages.
- [ ] **Extend the message protocol** (`extension/src/chat-panel/message-protocol.ts`) with ext→webview events for the panels:
  - `pi:state` → `{ sessionId, phase, providerStatus, providerName, model }`
  - `pi:tokens` → `{ used, contextWindow, latencyMs }`
  - `pi:toolLog` → tool_execution_start/end entries (feed Left "Tool Calls Log")
  - `pi:approvalQueue` → pending approvals `[{ id, tool, session, agent, status, params, risk, auditId }]`
  - `pi:checkpointHistory` → `[{ threadId, phase, updatedAt }]`
  - `pi:worklist` → Jira subtasks `[{ key, title, status, phase, lastCheckpoint }]`
  - webview→ext: `pi:approvalDecision` `{ id, decision: 'approve'|'reject'|'requestInfo' }`
- [ ] **Emit these from `PiWorkflowAdapter`** (source of truth already exists): `piSessionId`, `pipelineStatus`/`currentPhase`, `sdkAvailable`→providerStatus, tool events (from `pi-event-mapper`), checkpoint saves (`KbRemoteCheckpointerStore`), token/context (`getDetectedContextWindow`). Route through the existing `onEvent(msg)` bridge.

## PHASE 2 — Chat 3-pane layout (chat-window-internal / chat-screen-detail)

- [ ] **Toolbar** (top): Session ID | Phase | PiProvider Status | Settings button. Bind to `piWorkflowStore`. Reuse/extend `ChatHeader.svelte`.
- [ ] **Center Pane** (primary): Message Thread + Streaming + Markdown. **Already exists** — `ChatMessageList` + `ChatMessage` (+ `DiagramBlock`). Just place it in the center column. Streaming tokens already arrive via `emitToken('pi',…)`.
- [ ] **Left Pane** (collapsible, ~280px): 3 sections — Conversation History (from `chatStore`), Tool Calls Log (from `toolStore`/`pi:toolLog`), State Snapshot (from `piWorkflowStore`). Use the branch `LeftPane.svelte` markup/CSS as visual reference; wire to real stores.
- [ ] **Right Pane** (collapsible): Current State JSON (pretty-printed `PipelineState`), Checkpoint History (`pi:checkpointHistory`), Approval Queue (summary; full panel in Phase 3).
- [ ] **Input Area** (bottom): Textarea, Attach File, Send / **Stop Streaming**. **Reuse `ChatInput.svelte`**; add Stop-streaming wired to `PiProvider.abort()`.
- [ ] **Status Bar** (bottom strip): `Connected WebSocket | Tokens N | Latency Nms` from `connectionStore` + `pi:tokens`. (Latency needs measuring in the adapter — small addition.)
- [ ] Layout container: extend `ChatPanel.svelte` (or a new `PiChatLayout.svelte`) with a 3-column CSS grid + collapsible side panes; use `var(--vscode-*)` tokens.

## PHASE 3 — Approval Panel (highest value; backend already exists)

Backend is ready: `ApprovalAdapter` + `pi-workflow-gate.ts` (human-in-the-loop). Today there is NO UI to approve/reject — this is the biggest functional win.
- [ ] Component `ApprovalPanel.svelte` per `approval-detail.png`:
  - **Queue**: pending list `tool – session – status(Pending)`.
  - **Detail**: Tool, Parameters `{...}`, Risk, Audit ID.
  - **Actions**: `[Approve] [Reject] [Request Info]` → send `pi:approvalDecision`.
- [ ] Wire decision back into the gate: `PiWorkflowAdapter` handles `pi:approvalDecision` → resolves the pending `ToolApprovalGate` request (approve/reject). Reuse/replace the placeholder `handleApproval()` in the adapter.
- [ ] Reuse `PermissionGuard.svelte` if its shape fits; otherwise model the new panel on it.
- [ ] Show the approval inline in Center Pane too (like `chat-screen-detail.png` yellow box) AND in the Right Pane queue.

## PHASE 4 — Dashboard / Worklist (dashboard-detail)

- [ ] Component `WorklistPanel.svelte`: Filters (Story/Status/Assignee/Phase), Table (ID|Title|Status|Phase|Last Checkpoint), Stats (counts + Checkpoint Success %).
- [ ] Data source: Jira subtasks of the epic (SA4E-290..297) via the existing Jira MCP path + checkpoint metadata from `KbRemoteCheckpointerStore`. Feed via `pi:worklist`. (This is the one panel with no current backing — needs a small data provider.)
- [ ] This can be a separate webview view (per `ui-flow.png` it's a sibling of Agent Chat), or a tab within the panel. Prefer a tab to avoid a second webview.

## PHASE 5 — Tests + verify

- [ ] Svelte component tests (follow existing `webview/__tests__/*` patterns): store→render for Toolbar, Left/Right panes, ApprovalPanel actions emit `pi:approvalDecision`, Worklist renders rows.
- [ ] Message-protocol round-trip test: adapter emits `pi:state`/`pi:approvalQueue`/`pi:worklist` → store updates → component renders. No hardcoded state anywhere (assert defaults are empty/disconnected).
- [ ] `cd extension; npx tsc --noEmit` clean; `npx vitest run src/webview` green.
- [ ] Manual: send a message → streamed tokens in Center; trigger a tool → Approval Panel shows request → Approve → tool proceeds; Worklist shows SA4E-290..297 with real statuses.

---

## Defect carry-overs to fix while implementing
- ❌ `piWorkflowStore` hardcoded state (SEC-289-11) → real data via bridge.
- ❌ Branch `LeftPane` imports assume stores that may differ on main — verify against `chatStore`/`toolStore` actual exports.
- ❌ No Stop-streaming / abort in current input → wire `PiProvider.abort()`.
- ❌ No latency metric → add timing in adapter for Status Bar.

## Priority order
1. **Phase 1** (state plumbing) — nothing works without real data.
2. **Phase 3** (Approval Panel) — highest functional value, backend ready, currently missing entirely.
3. **Phase 2** (3-pane chat) — mostly reuses existing components.
4. **Phase 4** (Worklist) — nice-to-have; needs a new Jira data provider.
5. **Phase 5** — tests throughout, not at the end.

## Guardrails
- Runtime "Unknown provider" fix (provider registration) comes BEFORE this UI work.
- Reuse existing components/stores; don't fork the chat UI.
- No hardcoded session/provider/model — all from the bridge.
- UI-relative paths only.
- Out of scope: SA4E-297 LangGraph removal (SA4E-307 does not exist).

## Files (new/changed) — indicative
| File | Change |
|------|--------|
| `documents/SA4E-289/*.png/.drawio`, `documents/CHAT-MODULE-PARITY-DISCUSSION.md` | Import spec/assets from branch |
| `extension/src/webview/stores/piWorkflowStore.ts` | NEW (real data, no hardcode) |
| `extension/src/chat-panel/message-protocol.ts` | Add pi:state/tokens/toolLog/approvalQueue/checkpointHistory/worklist + pi:approvalDecision |
| `extension/src/pi-workflow/pi-workflow-adapter.ts` | Emit the above events; handle approvalDecision; measure latency; expose abort |
| `extension/src/webview/components/PiChatLayout.svelte` (or extend ChatPanel) | 3-pane + toolbar + status bar |
| `extension/src/webview/components/LeftPane.svelte`, `RightPane.svelte`, `ApprovalPanel.svelte`, `WorklistPanel.svelte` | NEW panels wired to stores |
| `extension/src/webview/__tests__/*` | Component + protocol tests |
