---
name: kotlin-code-standards
description: Kotlin-specific code standards — size limits, packaging, SOLID, serialization
---

## Mandatory Size Limits

### File: max 200 lines
- Each `.kt` file MUST NOT exceed 200 lines (including comments and blank lines)
- If file exceeds 200 lines → split into multiple files by responsibility (SRP)
- Example: `IntegrationsPage.kt` (>200 lines) → split into `IntegrationsPage.kt` (render + events) + `IntegrationsConfigModal.kt` (modal logic) + `IntegrationsTestLink.kt` (test connection logic)

### Function: max 20 lines
- Each function/method MUST NOT exceed 20 lines (excluding signature and closing brace)
- If function exceeds 20 lines → split into smaller functions with clear descriptive names
- Example: `renderProviderCards()` (>20 lines) → split into `renderProviderCards()` + `createProviderCard(provider)` + `bindCardEvents(card, provider)`

## Separate Model and Processing

### Model classes (data classes, DTOs, enums) MUST be in separate package
```
// Model and logic in same file
object IntegrationsPage {
    @Serializable data class ProviderInfo(...)
    @Serializable data class TestResult(...)
    fun render() { ... }
}

// CORRECT — Model in separate package
// models/ProviderInfo.kt
package com.assistant.frontend.models
@Serializable data class ProviderInfo(...)

// pages/IntegrationsPage.kt
package com.assistant.frontend.pages
import com.assistant.frontend.models.*
object IntegrationsPage { ... }
```

### Package Rules
- `models/` — Data classes, DTOs, enums, sealed classes
- `pages/` — Page controllers (UI logic, event binding, DOM manipulation)
- `components/` — Reusable UI components (Shell, Sidebar, Navbar)
- `api/` — HTTP client, API calls
- `router/` — Navigation logic
- `charts/` — SVG chart renderers
- `services/` — Business logic helpers (validation, formatting, state management)

## OOP Design Patterns

| Pattern | When to Use | Example |
|---------|-------------|---------|
| Strategy | Multiple processing approaches for same data type | `ProviderConfigStrategy` for Ollama/Gemini/LMStudio config |
| Observer | State change notifications | `ScanStatusObserver` for polling updates |
| Factory | Complex object creation | `ProviderCardFactory.create(provider)` |
| Template Method | Common process with customizable steps | `BasePage.render()` → `onBind()` → `onLoad()` |
| Facade | Simplify complex subsystem | `ApiClient` facade for HTTP calls |

### Template Method Example for Pages
```kotlin
abstract class BasePage(private val templateName: String) {
    protected val scope = MainScope()
    protected val json = Json { ignoreUnknownKeys = true; isLenient = true }

    fun render(container: Element) {
        container.innerHTML = ""
        cleanup()
        scope.launch {
            val html = ApiClient.loadTemplate(templateName)
            container.innerHTML = html
            onBind()
            onLoad()
        }
    }

    open fun cleanup() {}
    protected abstract fun onBind()
    protected abstract fun onLoad()
}
```

## SOLID Principles

### S — Single Responsibility Principle
- Each class/object has ONE reason to change
- Page controller only handles render + events, NO complex business logic
- Business logic (validation, formatting, calculations) extracted to `services/`

### O — Open/Closed Principle
- Classes open for extension, closed for modification
- Use interfaces and abstract classes instead of modifying existing code
- Add new provider → implement interface, NOT modify switch/when block

### L — Liskov Substitution Principle
- Subclass must be substitutable for parent without changing behavior
- All Pages implement the same interface/abstract class

### I — Interface Segregation Principle
- Small, focused interfaces
- NO "god interfaces" with too many methods

```kotlin
// FORBIDDEN
interface PageController {
    fun render(); fun cleanup(); fun loadData()
    fun bindEvents(); fun handleError(); fun showToast()
    fun startPolling(); fun stopPolling()
}

// CORRECT
interface Renderable { fun render(container: Element) }
interface Cleanable { fun cleanup() }
interface Pollable { fun startPolling(); fun stopPolling() }
```

### D — Dependency Inversion Principle
- Depend on abstractions, not concretions
- Page controllers depend on interfaces (ApiClient interface), not implementations
- Easy to mock for testing

## Code Review Checklist

- [ ] File ≤ 200 lines?
- [ ] Each function ≤ 20 lines?
- [ ] Model classes in separate `models/` package?
- [ ] No business logic in page controllers?
- [ ] Appropriate design patterns used?
- [ ] SOLID principles followed?
- [ ] Interfaces for dependencies?

## Serialization — kotlinx.serialization

### ALWAYS use `encodeDefaults = true` when serializing for protocol/API communication

```kotlin
// FORBIDDEN — Default values dropped during serialization
private val json = Json { ignoreUnknownKeys = true }
// Result: {"id":1,"method":"initialize"} — MISSING "jsonrpc":"2.0"

// CORRECT — Default values always included
private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
// Result: {"jsonrpc":"2.0","id":1,"method":"initialize"} — COMPLETE
```

### Specific Rules

1. **Protocol communication** (JSON-RPC, MCP, WebSocket): MUST use `encodeDefaults = true` — protocol specs require all fields present
2. **API responses** (REST endpoints): SHOULD use `encodeDefaults = true` — frontend needs default values
3. **Internal serialization** (DB, cache): Can omit `encodeDefaults` to save space
4. **Data classes with default values**: If field has default and MUST appear in output → use `encodeDefaults = true`
5. **Shared Json instance**: Prefer 1 shared `Json` instance per module instead of creating new each time

### Json Serializer Checklist

- [ ] `encodeDefaults = true` if serializing for protocol/API?
- [ ] `ignoreUnknownKeys = true` if deserializing from external source?
- [ ] `isLenient = true` only when parsing non-standard JSON?
- [ ] No inline `Json { }` in functions — use companion object or top-level val?