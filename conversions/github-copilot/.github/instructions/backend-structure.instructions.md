---
applyTo: "shared/**,server/**"
---

# Backend Code Structure

## Architecture
- `shared/` — KMP business logic (interfaces, models, implementations)
- `server/` — Ktor REST API (routes, middleware, DI)

## Rules
- Each domain: Interface + Models + Impl in SEPARATE files
- Routes: 1 file per resource group
- DI: Koin injection, never create instances in routes
- Data classes: @Serializable, shared JsonConfig.instance

## API UX Rules
- NEVER return empty without explanation
- Error format: {error, details, action}
- NEVER fail silently
- Long ops: 202 + polling
- Jira: /rest/api/3/search/jql (not deprecated /search)
