---
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.kt"
  - "**/*.java"
  - "**/*.py"
---

# Code Standards

## Size Limits
- File: max 200 lines (including comments, blank lines)
- Function/method: max 20 lines (not counting signature/closing brace)
- If exceeded → split by responsibility (SRP)

## Structure
- `models/` — Data classes, DTOs, enums, interfaces, types
- `pages/` or `views/` — Page controllers (UI logic, event binding)
- `components/` — Reusable UI components
- `api/` or `clients/` — HTTP client, API calls
- `services/` — Business logic (validation, formatting, state)
- `utils/` — Pure utility functions (no side effects)

## SOLID Principles (Mandatory)
- S: Each class/module has ONE reason to change
- O: Open for extension, closed for modification
- L: Subclass must substitute parent without behavior change
- I: Small, focused interfaces (no god interfaces)
- D: Depend on abstractions, not concretions

## Design Patterns Required
| Pattern | When |
|---------|------|
| Strategy | Multiple ways to handle same data type |
| Observer | Notify state changes |
| Factory | Complex object creation |
| Template Method | Common process with customizable steps |
| Facade | Simplify complex subsystem |

## Exception Handling
- NEVER swallow exceptions (empty catch blocks)
- ALWAYS notify user on error (toast, alert, error response)
- Rethrow with context if caller should handle

## Serialization
- Protocol communication (JSON-RPC, MCP): serialize ALL fields
- API responses: include default values
- Prefer shared serializer instance per module
