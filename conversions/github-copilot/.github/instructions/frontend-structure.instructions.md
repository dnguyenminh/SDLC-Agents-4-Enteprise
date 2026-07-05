---
applyTo: "frontend/**"
---

# Frontend Architecture — Kotlin/JS + HTML Templates

## Core Rules
1. NEVER create HTML in Kotlin code — use template files
2. VIEW/CONTROLLER: HTML=view, Kotlin=controller
3. Every action needs UX feedback (loading, success, error)
4. BlockingOverlay for ALL async operations

## Form Elements (Dark Theme)
- select: `background: rgba(12,14,22,0.95)`, `color: var(--primary)`
- input: class `.field-input`

## Build
- Dev: `./gradlew :frontend:jsBrowserDevelopmentRun` or `npx vite`
- Prod: `./gradlew :frontend:jsBrowserProductionWebpack`
