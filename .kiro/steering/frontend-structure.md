---
inclusion: fileMatch
fileMatchPattern: "frontend/**"
---

# Frontend Architecture — Kotlin/JS + HTML Templates

## Tech Stack

- **Kotlin/JS** — Frontend logic, compile sang JavaScript
- **HTML Templates** — Tách biệt khỏi Kotlin code, `src/jsMain/resources/templates/`
- **CSS Files** — Obsidian Kinetic design system, `src/jsMain/resources/styles/`
- **Vite** — Bundler + dev server, `publicDir: 'src/jsMain/resources'`
- **Kotlin Multiplatform shared module** — Shared data models, DTOs

## Core Rules (chi tiết xem #[[file:documents/frontend-rules-detail.md]])

### 1. TÁCH BIỆT HTML VÀ LOGIC
- **KHÔNG BAO GIỜ** tạo HTML string trong Kotlin code (no innerHTML with HTML, no kotlinx.html DSL)
- **LUÔN** dùng HTML template files từ `resources/templates/`
- Kotlin code chỉ thao tác DOM qua `getElementById()`, `querySelector()`, `textContent`, `classList`
- Dynamic repeated elements dùng `<template>` clone pattern

### 2. VIEW / CONTROLLER Pattern
| Layer | Nơi đặt | Chứa gì |
|-------|---------|---------|
| **VIEW** | `resources/templates/*.html` + `resources/*.css` | HTML structure, CSS classes, placeholders |
| **CONTROLLER** | `kotlin/.../pages/*.kt` | Event binding, API calls, DOM manipulation |

### 3. KHÔNG TẠO FILE LEGACY
- Không tạo thư mục con HTML/CSS/JS trong `frontend/` (e.g., `frontend/dashboard/index.html`)
- Root `frontend/` chỉ chứa: `build.gradle.kts`, `index.html`, `package.json`, `vite.config.js`, `src/`, `build/`

### 4. UX BẮT BUỘC
- Mọi thao tác PHẢI có feedback: Loading spinner, Empty state + action, Error message + fix action, Success confirmation
- KHÔNG BAO GIỜ fail silently — mọi catch block phải hiển thị lỗi cho user
- Mọi API call PHẢI handle 3 trạng thái: loading, success, error

### 5. BLOCKING OVERLAY
- Mọi async operation (SAVE, TEST, DELETE, START, STOP, SCAN...) PHẢI dùng `BlockingOverlay`
- `BlockingOverlay.show()` TRƯỚC `scope.launch`, `BlockingOverlay.remove()` trong `finally`
- Message mô tả cụ thể: "Saving...", "Testing connection...", KHÔNG dùng "Please wait"

### 6. BROWSER MEMORY MANAGEMENT
- Dữ liệu tích lũy (logs, lists) dùng `sessionStorage` cho dedup IDs, cap DOM nodes (max 500 logs, 200 chat)
- Reset khi bắt đầu operation mới

### 7. NATIVE FORM ELEMENTS ON DARK THEME
- `<select>` PHẢI có `background: rgba(12,14,22,0.95)` + `color: var(--primary)`
- `<input>` LUÔN dùng class `.field-input`
- `-webkit-appearance: none; appearance: none;` cho custom styling

## API & Routing
- `ktor-client-js`, JWT trong `sessionStorage`
- Hash-based routing: `#dashboard`, `#analysis`, etc.
- `ApiClient.loadTemplate(name)` — fetch `/templates/$name.html`

## Build Commands
- Dev: `./gradlew :frontend:jsBrowserDevelopmentRun` hoặc `npx vite`
- Build: `./gradlew :frontend:jsBrowserProductionWebpack`
