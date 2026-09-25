---
name: frontend-structure
description: Frontend Architecture — Svelte 4 + Vite + TypeScript
---



# Frontend Architecture — Svelte 4 + Vite + TypeScript

## Tech Stack

- **Svelte 4** — Webview UI, components + reactive state
- **Vite** — Bundler + dev server
- **TypeScript** — Strong typing, tách biệt logic khỏi DOM
- **HTML/CSS** — Obsidian Kinetic design system, `resources/styles/`

## Core Rules (chi tiết xem #[[file:documents/frontend-rules-detail.md]])

### 1. TÁCH BIỆT MARKUP VÀ LOGIC
- **KHÔNG BAO GIỜ** tạo HTML string trong code (no innerHTML with HTML, no template literal HTML)
- **LUÔN** dùng Svelte component files `.svelte` + logic trong `<script>` block
- Logic thuần tách vào `.ts` modules (stores, actions, services)
- Dynamic repeated elements dùng `{#each}` block

### 2. VIEW / CONTROLLER Pattern
| Layer | Nơi đặt | Chứa gì |
|-------|---------|---------|
| **VIEW** | `extension/src/webview/**/*.svelte` + `resources/styles/*.css` | HTML structure, CSS classes, placeholders |
| **CONTROLLER** | `extension/src/webview/**/*.ts` (stores, actions) | Event binding, API calls, DOM manipulation |

### 3. KHÔNG TẠO FILE LEGACY
- Không tạo thư mục con HTML/CSS/JS tách rời UI
- Root `extension/src/webview/` chứa: components, stores, styles — theo component tree
- Webview asset bundle build bằng Vite (`extension/webview/`)

### 4. UX BẮT BUỘC
- Mọi thao tác PHẢI có feedback: Loading spinner, Empty state + action, Error message + fix action, Success confirmation
- KHÔNG BAO GIỜ fail silently — mọi catch block phải hiển thị lỗi cho user
- Mọi API call PHẢI handle 3 trạng thái: loading, success, error

### 5. BLOCKING OVERLAY
- Mọi async operation (SAVE, TEST, DELETE, START, STOP, SCAN...) PHẢI dùng `BlockingOverlay` component
- Show overlay TRƯỚC `await`, remove trong `finally`
- Message mô tả cụ thể: "Saving...", "Testing connection...", KHÔNG dùng "Please wait"

### 6. BROWSER MEMORY MANAGEMENT
- Dữ liệu tích lũy (logs, lists) dùng `sessionStorage` cho dedup IDs, cap DOM nodes (max 500 logs, 200 chat)
- Reset khi bắt đầu operation mới

### 7. NATIVE FORM ELEMENTS ON DARK THEME
- `<select>` PHẢI có `background: rgba(12,14,22,0.95)` + `color: var(--primary)`
- `<input>` LUÔN dùng class `.field-input`
- `-webkit-appearance: none; appearance: none;` cho custom styling

## API & Routing
- Svelte stores + MCP client (WebSocket/undici), JWT trong `sessionStorage`
- Hash-based routing: `#dashboard`, `#analysis`, etc.
- `apiClient.loadTemplate(name)` — fetch `/templates/$name.html`

## Build Commands
- Dev: `npm run esbuild-watch` hoặc `npm run watch` (Vite trong extension webview)
- Build: `npm run esbuild` / `npm run esbuild-production`

