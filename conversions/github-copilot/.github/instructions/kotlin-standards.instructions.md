---
name: 'Kotlin Standards'
description: 'Coding conventions for Kotlin files in this project'
applyTo: '**/*.kt'
---

# Kotlin Code Standards

- Use Ktor framework for HTTP services
- kotlinx.serialization with `encodeDefaults = true` for protocol communication
- Coroutines for async operations (suspend functions)
- File max 200 lines, function max 20 lines
- SOLID principles mandatory
- Models/DTOs in separate `models/` package
- Services in `services/` package
- Use `sealed class` for error types
- Use `Result<T>` or custom sealed types for error handling
- NEVER swallow exceptions — always log + propagate
