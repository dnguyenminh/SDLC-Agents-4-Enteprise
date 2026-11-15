---
name: code-standards
description: Code quality standards — SOLID, OOP patterns, size limits, error handling
---

## Mandatory Size Limits
- **File**: max 200 lines (including comments and blank lines)
- **Function**: max 20 lines (excluding signature and closing brace)

## SOLID Principles
- **S** — Single Responsibility: Each class has ONE reason to change
- **O** — Open/Closed: Open for extension, closed for modification
- **L** — Liskov Substitution: Subclasses must be substitutable for parent
- **I** — Interface Segregation: Small, focused interfaces
- **D** — Dependency Inversion: Depend on abstractions, not concretions

## OOP Design Patterns
| Pattern | When to use |
|---------|-------------|
| Strategy | Multiple processing approaches for same data type |
| Observer | State change notifications |
| Factory | Complex object creation |
| Template Method | Common process with customizable steps |
| Facade | Simplify complex subsystem |

## Separate Model and Processing
| Layer | Responsibility |
|-------|---------------|
| `models/` | Data classes, DTOs, enums, interfaces, types |
| `pages/` or `views/` | Page controllers |
| `components/` | Reusable UI components |
| `api/` or `clients/` | HTTP client, API calls |
| `router/` | Navigation logic |
| `services/` | Business logic helpers |
| `utils/` | Pure utility functions (no side effects) |

## Exception Handling
1. NEVER swallow exceptions — every `catch` MUST have clear handling
2. ALWAYS inform user of exceptions
3. Log at appropriate levels: ERROR for failures, WARN for degraded, INFO for business events, DEBUG for technical details
