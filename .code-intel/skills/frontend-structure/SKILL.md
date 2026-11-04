---
name: frontend-structure
description: Frontend architecture — Svelte 4 + Vite + TypeScript webview UI
---

## Tech Stack

- **Svelte 4** — Webview UI, components and reactive state
- **Vite** — Bundler + dev server
- **TypeScript** — Strong typing, separates logic from DOM
- **HTML/CSS** — Obsidian Kinetic design system, `resources/styles/`

## Core Rules

### 1. SEPARATE MARKUP AND LOGIC
- **NEVER** create HTML strings in code (no innerHTML with HTML, no template literal HTML)
- **ALWAYS** use Svelte component files `.svelte` with logic in `<script>` block
- Pure logic goes into `.ts` modules (stores, actions, services)
- Dynamic repeated elements use `{#each}` block

### 2. VIEW / CONTROLLER Pattern
| Layer | Location | Contains |
|-------|----------|----------|
| **VIEW** | `extension/src/webview/**/*.svelte` + `resources/styles/*.css` | HTML structure, CSS classes, placeholders |
| **CONTROLLER** | `extension/src/webview/**/*.ts` (stores, actions) | Event binding, API calls, DOM manipulation |

### 3. NO LEGACY FILES
- No subdirectories separating HTML/CSS/JS UI
- Root `extension/src/webview/` contains: components, stores, styles — by component tree
- Webview asset bundle built with Vite (`extension/webview/`)

### 4. UX REQUIREMENTS (MANDATORY)
- Every operation MUST have feedback: Loading spinner, Empty state + action, Error message + fix action, Success confirmation
- NEVER fail silently — every catch block must display error to user
- Every API call MUST handle 3 states: loading, success, error

### 5. BLOCKING OVERLAY
- Every async operation (SAVE, TEST, DELETE, START, STOP, SCAN...) MUST use `BlockingOverlay` component
- Show the overlay BEFORE `await`, remove it in `finally`
- Specific message: "Saving...", "Testing connection...", NOT "Please wait"

### 6. BROWSER MEMORY MANAGEMENT
- Accumulated data (logs, lists) uses `sessionStorage` for dedup IDs, cap DOM nodes (max 500 logs, 200 chat)
- Reset when starting a new operation

### 7. NATIVE FORM ELEMENTS ON DARK THEME
- `<select>` MUST have `background: rgba(12,14,22,0.95)` + `color: var(--primary)`
- `<input>` ALWAYS uses class `.field-input`
- `-webkit-appearance: none; appearance: none;` for custom styling

## API & Routing
- Svelte stores + MCP client (WebSocket/undici), JWT in `sessionStorage`
- Hash-based routing: `#dashboard`, `#analysis`, etc.
- `apiClient.loadTemplate(name)` — fetch `/templates/$name.html`

## Build Commands
- Dev: `npm run esbuild-watch` or `npm run watch` (Vite in extension webview)
- Build: `npm run esbuild` / `npm run esbuild-production`