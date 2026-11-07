# User Guide (UG)

## SA4E-410 — Context Usage UI Enhancements & Small-Context Compaction Guard

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-410 |
| Title | Context Usage UI Enhancements & Small-Context Compaction Guard |
| Author | DEV Agent |
| Reviewer | BA Agent |
| Version | 1.0 |
| Date | 2026-11-07 |
| Status | Draft |
| Related BRD | BRD-v1.0-SA4E-410.docx |
| Related FSD | FSD-v1.0-SA4E-410.docx |
| Related TDD | TDD-v1.0-SA4E-410.docx |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-11-07 | DEV Agent | Initial document |

---

## 1. Introduction

### 1.1 Purpose

This guide explains the context usage UI enhancements and small-context compaction guard delivered in SA4E-410. These features help developers monitor token consumption in the chat panel and prevent aggressive auto-compaction on models with small context windows (4k, 8k).

**Audience:** End users (developers using the VS Code extension chat panel).

### 1.2 Features Overview

| Feature | Description |
|---------|-------------|
| **Context Usage Arc Gauge** | Circular progress indicator in the chat header showing real-time token usage percentage with color coding (green → amber → red → dark red). |
| **Click for Detailed Breakdown** | Click the arc gauge to see absolute token counts, percentage, 4% window reference value, and category breakdown (Conversation / MCP Tools / Steering). |
| **MCP Server Status Click** | Click any MCP server in the right sidebar to see its name and connection status (Connected/Disconnected/Failed/Unknown) without triggering tool calls. |
| **Small-Context Compaction Guard** | Automatic protection for models with `< 16,384` token windows: raises compaction threshold from 95% → 97% and requires minimum 6 messages (vs. 2) before compaction triggers. |

### 1.3 Prerequisites

| Prerequisite | Version | Required |
|--------------|---------|----------|
| VS Code | 1.80+ | Yes |
| Extension (this project) | Built from source | Yes |
| llama-server / LLM Gateway | Running with model registry | Yes |

---

## 2. Getting Started

These features are automatically active when you use the chat panel. No configuration is required.

### 2.1 Quick Verification

1. Open the Chat Panel (Cmd/Ctrl+Shift+P → "Open Chat Panel" or click the chat icon in the activity bar)
2. Start a conversation with an LLM
3. Observe the **context usage arc gauge** in the chat header (top-right area)
4. Click the gauge — a detail toast should appear
5. Open the right sidebar (if not visible) and click an MCP server entry — a status toast should appear

---

## 3. Context Usage Arc Gauge

### 3.1 Visual Indicators

The arc gauge is a circular progress indicator that fills clockwise as token usage increases:

| Usage Range | Color | Label | Meaning |
|-------------|-------|-------|---------|
| 0–59% | Green (#4caf50) | Safe | Plenty of headroom |
| 60–79% | Amber (#ff9800) | Warning | Approaching limits |
| 80–94% | Red (#f44336) | Critical | Near capacity — pulse animation triggers at 80% boundary |
| 95–100% | Dark Red | Full | Context window nearly exhausted — auto-toast suggests new tab |

### 3.2 Hover Tooltip

Hover over the arc gauge to see a Kiro-style tooltip with:
- Overall usage percentage
- Conversation percentage
- MCP tools percentage
- Steering files percentage

### 3.3 Click for Detailed Breakdown

**Action:** Click the arc gauge (`#context-usage-icon`)

**Result:** A toast notification appears for 4 seconds with:

```
Context Details
45,231 / 128,000 tokens (35%)
4% of window = 5,120 tokens
Conversation: 20%
MCP tools: 10%
Steering: 5%
```

**Fields explained:**

| Field | Description |
|-------|-------------|
| `X / Y tokens (Z%)` | Total tokens used / model's max context window / usage percentage (capped at 100%) |
| `4% of window = N tokens` | Mental reference value: `round(maxTokens × 0.04)`. Helps you gauge "how much is 4% of my context window?" — useful for estimating headroom for a few more turns. |
| Conversation % | Percentage of context window consumed by conversation history |
| MCP tools % | Percentage consumed by MCP tool definition schemas (sent on every request) |
| Steering % | Percentage consumed by injected steering content (system prompt + steering files, ~1875 tokens counted once per session) |

**Debounce behavior:** Rapid clicks without data changes won't spawn duplicate toasts. The toast only updates when `tokenCount` or `maxTokens` changes.

### 3.4 4% Window Reference — Mental Headroom

The "4% of window" value is a **reference calculation**, not available space. It helps you answer:

> "If I have 128,000 tokens total, 4% = 5,120 tokens. That's roughly 3–4 more typical turns before I hit the warning zone."

**Examples by model size:**

| Model Context Window (maxTokens) | 4% Window Value | Practical Meaning |
|----------------------------------|-----------------|-------------------|
| 4,096 (4k) | 164 tokens | Very tight — ~1 short turn |
| 8,192 (8k) | 328 tokens | Tight — ~1–2 turns |
| 16,384 (16k) | 655 tokens | Moderate — ~3–4 turns |
| 32,768 (32k) | 1,311 tokens | Comfortable — ~6–8 turns |
| 128,000 (128k) | 5,120 tokens | Generous — ~25+ turns |

### 3.5 Auto-Toast at 95%

When usage reaches 95%, an automatic toast appears: *"Context usage at 95% — consider starting a new tab"*. This is proactive guidance, not an error.

### 3.6 Full Warning at 100%

When usage hits 100%, a persistent warning banner appears in the input area with a "New Tab" link. Click it to start a fresh conversation with a clean context window.

---

## 4. MCP Server List (Right Sidebar)

### 4.1 Overview

The right sidebar shows:
- Session title
- Context token usage summary (tokens + percentage)
- **MCP Server List** — each server with a status indicator

### 4.2 Status Indicators

| Status | Badge Color | Meaning |
|--------|-------------|---------|
| Connected | Green | MCP server is active and responsive |
| Disconnected | Gray | Server was connected but lost connection |
| Failed | Red | Connection attempt failed or server error |
| Unknown | Gray | Status not yet determined |

### 4.3 Click for Server Details

**Action:** Click any MCP server row (`.oc-mcp-item`)

**Result:** A toast notification appears for 4 seconds with:

```
MCP Server: code-intel
Status: Connected
Details shown client-side to avoid tool-call loops.
```

**Key points:**
- **Purely client-side** — no host round-trip, no tool calls, no latency
- Reads status from locally cached server list (updated via `chat:mcpServers` and `serverStatus` events from host)
- The note "Details shown client-side to avoid tool-call loops" confirms this design choice

---

## 5. Small-Context Compaction Guard

### 5.1 What Is It?

Auto-compaction summarizes conversation history when token usage crosses a threshold. For **small-context models** (context window `< 16,384` tokens, e.g., 4k, 8k models), aggressive compaction causes problems:
- Summarization loses disproportionate context on short conversations
- Frequent compaction loops waste tokens and CPU
- Users experience "thrashing" — context keeps getting compacted

**The guard changes two parameters for small-context models:**

| Parameter | Large Context (≥16k) | Small Context (<16k) |
|-----------|---------------------|----------------------|
| Compaction Threshold | 95% (0.95) | **97% (0.97)** |
| Minimum Messages | 2 | **6** |

### 5.2 Behavior Examples

| Scenario | maxTokens | Usage | Messages | Compaction? |
|----------|-----------|-------|----------|-------------|
| 8k model, 96% usage, 7 messages | 8,192 | 96% | 7 | **No** (threshold is 97%) |
| 8k model, 97% usage, 5 messages | 8,192 | 97% | 5 | **No** (min 6 messages) |
| 8k model, 97% usage, 7 messages | 8,192 | 97% | 7 | **Yes** |
| 32k model, 95% usage, 3 messages | 32,768 | 95% | 3 | **Yes** (standard behavior) |
| 16k model (boundary), 95% usage, 2 messages | 16,384 | 95% | 2 | **Yes** (≥16k = large context) |

### 5.3 Fail-Safe

If `maxTokens` cannot be resolved (returns 0 or undefined), the guard **defaults to large-context behavior** (95% threshold, 2 messages). This ensures compaction never gets blocked entirely.

### 5.4 No User Action Required

This is an automatic background protection. You don't need to configure anything — it activates based on the resolved model's context window from the registry (llama-server `-c` flag) or probe fallback.

---

## 6. Troubleshooting

### 6.1 Click Does Nothing (No Toast Appears)

**Symptom:** Clicking the context arc gauge or MCP server row produces no visible toast.

**Cause:** The `S.showToast` function is not implemented in the webview codebase (known issue tracked in SECURITY-REVIEW.md Finding #1).

**Workaround:** 
- Hover over the arc gauge to see the tooltip breakdown (works without `showToast`)
- Check the browser DevTools console (F12) — no errors should appear due to optional chaining (`S.showToast && S.showToast(...)`)
- This will be fixed in a follow-up patch by implementing `S.showToast` in `chat-core.js`

**Expected fix:**
```javascript
// In chat-core.js
S.showToast = function(html, durationMs = 4000) {
  if (!S.contextToast || !S.toastText) return;
  S.toastText.innerHTML = html;
  S.contextToast.classList.add('visible');
  setTimeout(() => {
    S.contextToast.classList.remove('visible');
  }, durationMs);
};
```

### 6.2 Tooltip Shows Raw HTML / Strange Characters

**Symptom:** Hover tooltip displays HTML tags or encoded entities instead of clean text.

**Cause:** XSS protection not applied to `breakdown` values in `updateContextIcon` (SECURITY-REVIEW.md Finding #2).

**Status:** Known issue — remediation is to apply `S.escapeHtml` to all dynamic values in `chat-context-usage.js`.

### 6.3 Compaction Triggers Too Aggressively on 4k/8k Models

**Symptom:** Conversation gets compacted after only 2–3 messages on a 4k model.

**Cause:** Small-context guard not working — verify `maxTokens` is correctly resolved from model registry.

**Check:**
1. Model registry must expose correct context window via `getModelContextWindow()` (llama-server `-c` flag)
2. Probe fallback `getDetectedContextWindow()` (`meta.n_ctx`) used if registry unavailable
3. Hardcoded 128,000 is **never** used as source (SA4E-369 registry-first design)

### 6.4 MCP Server Status Shows "Unknown"

**Symptom:** All MCP servers show "Unknown" status in sidebar.

**Cause:** Host hasn't sent `chat:mcpServers` message yet, or `serverStatus` events not firing.

**Check:**
- MCP servers configured and running
- Extension host logs show MCP bridge connection attempts
- Sidebar updates via `S.updateSidebarServerStatus()` as fallback for `code-intel` server

---

## 7. Configuration Reference

These features have **no user-configurable settings**. Thresholds are hardcoded based on UX research:

| Parameter | Value | Location |
|-----------|-------|----------|
| Small-context boundary | 16,384 tokens | `context-compaction.ts:108` |
| Small-context compaction threshold | 0.97 (97%) | `context-compaction.ts:110` |
| Small-context minimum messages | 6 | `context-compaction.ts:109` |
| Large-context compaction threshold | 0.95 (95%) | `session-compactor.ts` (`COMPACT_USAGE_THRESHOLD`) |
| Large-context minimum messages | 2 | `context-compaction.ts:109` (else branch) |
| Toast auto-dismiss duration | 4,000 ms | `chat-context-usage.js:107`, `chat-sidebar.js:60` |
| 4% window multiplier | 0.04 | `chat-context-usage.js:95` |
| Arc gauge color thresholds | 60%/80%/95% | `chat-context-usage.js:31-34` |

> To customize thresholds, modify the source files and rebuild the extension.

---

## 8. API Reference (Internal)

### 8.1 Host → Webview: `tab:contextUpdate`

**Purpose:** Delivers per-tab context usage for arc gauge and click detail.

**Payload:**
```typescript
interface TabContextUpdatePayload {
  tabId: string;
  tokenCount: number;           // total tokens used
  maxTokens: number;            // model context window (from registry/probe)
  breakdown: {
    conversation: number;       // conversation tokens %
    mcpTools: number;           // MCP tool definition tokens %
    steering: number;           // steering content tokens %
  };
}
```

**Example:**
```json
{
  "tabId": "tab-1",
  "tokenCount": 45231,
  "maxTokens": 128000,
  "breakdown": {
    "conversation": 20,
    "mcpTools": 10,
    "steering": 5
  }
}
```

### 8.2 Host → Webview: `chat:mcpServers`

**Purpose:** Populates MCP server list in sidebar.

**Payload:**
```typescript
interface McpServersPayload {
  servers: Array<{
    name: string;               // e.g., "code-intel"
    status: string;             // "connected" | "disconnected" | "failed" | "unknown"
  }>;
}
```

### 8.3 Host → Webview: `serverStatus` Event

**Purpose:** Incremental status update for a single server.

**Payload:**
```typescript
interface ServerStatusEvent {
  type: 'serverStatus';
  status: string;               // same enum as above
}
```

---

## 9. Appendix

### 9.1 Glossary

| Term | Definition |
|------|------------|
| Context Window | Maximum tokens (input + output) a model processes per request. Also called `n_ctx` or `maxTokens`. |
| Compaction Threshold | Usage percentage (fraction 0.0–1.0) triggering auto-compaction. Standard: 0.95; Small-context: 0.97. |
| Token Budget | Allocated token limit for a category or total usable prompt tokens (`nCtx - reserveOutput - reserveTools`). |
| Steering Tokens | Tokens from injected steering content (system prompt + steering files, ~7500 chars ≈ 1875 tokens), counted once per session. |
| MCP Tool Definitions | Token cost of JSON schemas for all MCP tools sent to LLM on every request. Counted once after tool discovery. |
| Small-Context Model | Model with resolved `maxTokens < 16,384` (e.g., 4k, 8k). Triggers raised compaction threshold (97%) and message guard (6). |
| Large-Context Model | Model with resolved `maxTokens >= 16,384` (e.g., 32k, 64k, 128k). Uses standard compaction threshold (95%) and message guard (2). |
| Registry-First Context Window | SA4E-369 pattern: resolve `maxTokens` from model registry (llama-server `-c` value) first, fallback to probe `meta.n_ctx`, last resort undefined (never hardcoded 128000 as source). |
| 4% Window Value | Mental reference: `round(maxTokens × 0.04)`. Shown in context detail toast to help gauge headroom. |
| Session Compaction | Automatic summarization when usage threshold crossed, keeping summary + N recent messages (default 2). |

### 9.2 Related Documents

| Document | Location |
|----------|----------|
| BRD | `documents/SA4E-410/BRD.md` |
| FSD | `documents/SA4E-410/FSD.md` |
| TDD | `documents/SA4E-410/TDD.md` |
| STC | `documents/SA4E-410/STC.md` |
| Security Design Review | `documents/SA4E-410/SECURITY-REVIEW.md` |
| Security Code Review | `documents/SA4E-410/SECURITY-CODE-REVIEW.md` |

### 9.3 Version Compatibility

| System Version | Features | Notes |
|----------------|----------|-------|
| SA4E-410 (this release) | Context click detail, MCP click detail, Small-context guard | Requires SA4E-339 (auto-compaction) and SA4E-369 (registry-first maxTokens) |
| SA4E-339 | Auto-compaction, SessionCompactor, SessionMonitor | Foundation |
| SA4E-369 | Registry-first context window resolution | Foundation |

---

*End of User Guide*