---
paths: "**/*.kt"
---

# Kotlin Code Standards

## ⛔ Mandatory Size Limits

### File: max 200 lines
- Each `.kt` file MUST NOT exceed 200 lines (including comments, blank lines)
- If exceeds → split by responsibility (SRP)

### Function: max 20 lines
- Each function/method MUST NOT exceed 20 lines (excluding signature and closing brace)

## ⛔ Separate Model and Processing

Model classes (data classes, DTOs, enums) MUST be in separate package:
- `models/` — Data classes, DTOs, enums, sealed classes
- `pages/` — Page controllers
- `components/` — Reusable UI components
- `api/` — HTTP client, API calls
- `router/` — Navigation logic
- `services/` — Business logic helpers

## ⛔ OOP Design Patterns

| Pattern | When to use |
|---------|-------------|
| Strategy | Multiple processing for same data type |
| Observer | State change notifications |
| Factory | Complex object creation |
| Template Method | Common process with customizable steps |
| Facade | Simplify complex subsystem |

## ⛔ SOLID Principles

- **S** — Page controller only handles render + events, NO complex business logic
- **O** — Use interfaces/abstract classes instead of modifying existing code
- **L** — All Pages implement same interface/abstract class
- **I** — Small, focused interfaces (Renderable, Cleanable, Pollable)
- **D** — Depend on interfaces, not implementations

## ⛔ Serialization — kotlinx.serialization

- Protocol/API: MUST use `encodeDefaults = true`
- Use shared `Json` instance per module — don't create inline
- `ignoreUnknownKeys = true` for external sources

## No Workaround Rule

- NEVER use workaround/fallback/hack to bypass design issues
- MUST analyze root cause first
- MUST involve SA + TA + DEV for cross-module issues
- Fix must create single source of truth
