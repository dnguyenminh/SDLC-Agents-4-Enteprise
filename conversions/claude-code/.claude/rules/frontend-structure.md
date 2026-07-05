---
paths: "frontend/**"
---

# Frontend Architecture — Kotlin/JS + HTML Templates

## Tech Stack
- **Kotlin/JS** — Frontend logic, compiles to JavaScript
- **HTML Templates** — Separate from Kotlin code, `src/jsMain/resources/templates/`
- **CSS Files** — Obsidian Kinetic design system, `src/jsMain/resources/styles/`
- **Vite** — Bundler + dev server
- **Kotlin Multiplatform shared module** — Shared data models, DTOs

## Core Rules

### 1. SEPARATE HTML AND LOGIC
- **NEVER** create HTML strings in Kotlin code (no innerHTML with HTML, no kotlinx.html DSL)
- **ALWAYS** use HTML template files from `resources/templates/`
- Kotlin code only manipulates DOM via `getElementById()`, `querySelector()`, `textContent`, `classList`

### 2. VIEW / CONTROLLER Pattern
| Layer | Location | Contains |
|-------|----------|----------|
| VIEW | `resources/templates/*.html` + `resources/*.css` | HTML structure, CSS classes |
| CONTROLLER | `kotlin/.../pages/*.kt` | Event binding, API calls, DOM manipulation |

### 3. UX MANDATORY
- Every action MUST have feedback: Loading spinner, Empty state, Error message, Success
- NEVER fail silently — every catch block must display error
- Every API call MUST handle: loading, success, error

### 4. BLOCKING OVERLAY
- Every async operation MUST use `BlockingOverlay`
- Show BEFORE launch, remove in `finally`

### 5. NATIVE FORM ELEMENTS ON DARK THEME
- `<select>`: `background: rgba(12,14,22,0.95)` + `color: var(--primary)`
- `<input>`: class `.field-input`
- `-webkit-appearance: none; appearance: none;`

## Build
- Dev: `./gradlew :frontend:jsBrowserDevelopmentRun` or `npx vite`
- Build: `./gradlew :frontend:jsBrowserProductionWebpack`
