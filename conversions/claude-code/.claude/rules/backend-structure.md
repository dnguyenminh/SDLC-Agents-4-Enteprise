---
paths: "shared/**,server/**"
---

# Backend Code Structure Standard

## Architecture
- `shared/` — Business logic (interfaces, models, implementations KMP-compatible)
- `server/` — Ktor REST API (JVM-only, routes, middleware, DI)

## Code Placement

### shared/src/commonMain/
- Interfaces, @Serializable data classes, enums, sealed classes
- Business logic implementations (if no JVM deps)
- Koin modules

### shared/src/jvmMain/
- SQLDelight implementations (need JDBC)
- Code using java.*, javax.*

### server/src/jvmMain/
- Routes, Middleware, DI, JVM-only implementations

## Package Convention
```
com.assistant.{domain}/
├── {Domain}Interface.kt
├── {Domain}Impl.kt
├── {Domain}Models.kt
└── {Domain}Module.kt
```

## Rules
- Each domain: Interface + Models + Implementation in SEPARATE files
- Route groups: 1 file per resource
- DI: Always inject via Koin, never create instances in routes
- Data classes: `@Serializable`, use `JsonConfig.instance`
- Error handling: Throw `IllegalArgumentException` for validation (StatusPages → 400)

## ⛔ Backend API UX Rules
- NEVER return empty result without explanation
- Error responses: `{error, details, action}` structure
- NEVER fail silently
- Validation errors MUST be specific per field
- Long operations MUST have status tracking
- Jira API: Use `/rest/api/3/search/jql` (NOT deprecated `/rest/api/3/search`)
