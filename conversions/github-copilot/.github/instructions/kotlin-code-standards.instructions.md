---
applyTo: "**/*.kt"
---

# Kotlin Code Standards

## Size Limits
- File: max 200 lines
- Function: max 20 lines

## Package Structure
- `models/` — Data classes, DTOs, enums, sealed classes
- `pages/` — Page controllers
- `api/` — HTTP client
- `services/` — Business logic

## Design Patterns
- Strategy, Observer, Factory, Template Method, Facade

## SOLID
- S: Page only render + events, no business logic
- O: Interfaces/abstract classes for extension
- I: Small interfaces (Renderable, Cleanable, Pollable)
- D: Inject via Koin, depend on interfaces

## Serialization
- `encodeDefaults = true` for protocol/API
- Shared Json instance per module

## No Workaround Rule
- Fix root cause, not symptoms
- Single source of truth
