---
name: backend-structure
description: Backend code structure standard — TypeScript + Hono backend/src/** layout, DI, zod validation
---

## Architecture Overview

Project uses TypeScript + Hono with a unified backend structure:
- `backend/src/` — TypeScript source, runs on Node.js
- `backend/src/server/` — Hono HTTP + MCP Streamable HTTP server (routes, middleware, mcpServer)
- `backend/src/modules/` — Business logic split by domain (code-intel, kb-graph, memory, orchestration, pega, analytics, web)
- `backend/src/di/` — Dependency Injection container
- `backend/src/shared/` — Shared types, utilities

## Code Division Between server and modules

### server module (`backend/src/server/`)
HTTP/MCP layer code, NO business logic:
- **Routes** — Hono route handlers (`HttpServer.ts`, `routes/`)
- **Middleware** — JWT auth, RBAC interceptors (`middleware/`)
- **MCP** — `mcpServer.ts`, `toolUsageTracker.ts`
- **Config** — Config reads env vars (from `backend/src/config/`)

### modules (`backend/src/modules/{domain}/`)
Business logic per domain, MUST NOT import from other modules directly (use DI):
- **Interfaces** — `AuthService`, `RBACEngine`, `KBRepository`, `AIOrchestrator`, `GraphEngine`
- **Data models** — zod schemas, interfaces, enums, types
- **Implementations** — Pure TypeScript logic, no framework-specific dependency
- **Services** — Business logic, validation, formatting, state management

### shared (`backend/src/shared/`)
- **Types** — Shared DTOs, interfaces, enums
- **Utils** — Pure utility functions (no side effects)

## Package Naming Convention

```
backend/src/shared/{domain}/
├── {Domain}Types.ts        # Interfaces, types, enums
├── {Domain}Schema.ts       # zod schemas (if many schemas)
├── {Domain}Service.ts      # Business logic implementation
└── index.ts                # Re-exports
```

Example:
```
backend/src/modules/kb-graph/
├── kbGraphTypes.ts          # Interfaces, types
├── kbGraphSchema.ts         # zod schemas
├── kbGraphService.ts        # Implementation
└── index.ts                 # Re-exports
```

## Per-Domain Module Rules

Each domain module MUST be separated:
- **Types/Schemas** in one file — `{Domain}Types.ts`, `{Domain}Schema.ts`
- **Service** in one file — `{Domain}Service.ts`
- **Controller/Handler** in one file (if needed) — `{Domain}Handler.ts`

DO NOT combine types + schemas + service in one file. Each file ≤ 200 lines.

## Server Routes Rules

Each route group MUST be in its own file at `backend/src/server/routes/`:
- File name: `{resource}-routes.ts` (e.g., `auth-routes.ts`, `project-routes.ts`)
- Export function: `export function authRoutes(app: Hono)` (e.g., `authRoutes`)
- Request/Response DTOs: Declare in same route file or separate `{resource}-dto.ts` if complex
- All routes MUST be mounted in `HttpServer.ts` via `configureRoutes(app)`

## Server Middleware Rules

- Each middleware in its own file at `backend/src/server/middleware/`
- Use Hono middleware pattern (`app.use('/api/*', handler)`)
- NO business logic in middleware — only call module services

## Dependency Injection

- Use DI container at `backend/src/di/`
- Modules register dependencies: services, repositories, clients
- Inject into routes/handlers via constructor injection or container lookup
- NO direct instance creation in routes — always inject via DI container

## Data Conventions

- All data passed via API/MCP MUST be validated with zod schemas
- Use `safeParse` for data from external sources
- Use shared schema instances — NO inline schema creation inside functions
- Enum values: `UPPER_SNAKE_CASE`
- Use TypeScript discriminated unions for polymorphic types (e.g., `AuthResult`, `AIResult`)

## Error Handling

- Routes: Throw validation errors (Hono error handler catches → 400/4xx)
- NO catch-all in routes — let the error handler middleware process
- Business logic: Return result objects (Success/Failure) instead of throwing when fallback handling is needed
- Logging: Use Pino logger (`backend/src/config/`) — `logger.error` for failures, `logger.info` for business events

## Testing Conventions

- Unit/Integration tests: `backend/src/**/__tests__/` using Vitest
- Test file name: `{Feature}.test.ts`
- Use property-style tests with `fast-check` when needed (in devDependencies)
- Fake/Spy implementations for dependencies (no complex mocking framework needed)
- In-memory SQLite (`better-sqlite3` `:memory:`) or DB mocks for DB tests
- E2E API: `vitest run --config vitest.e2e.config.ts`; E2E UI: `npx playwright test`

## UX Rules for Backend API

### Every API response MUST provide sufficient info for frontend UX

### NEVER return empty result without explanation

```typescript
// FORBIDDEN — Return empty list without explanation
if (issues.length === 0) return [];

// CORRECT — Return with message or log entry explaining
if (issues.length === 0) {
  logRepository.addEntry("No tickets found in project $projectKey");
  return { tickets: [], message: "No tickets found. Verify project has issues in Jira." };
}
```

### Error responses MUST have consistent structure

Every error response MUST use:
```json
{
    "error": "Brief error description",
    "details": "Technical details (optional)",
    "action": "Suggested user action (optional)"
}
```

### API MUST NOT fail silently

```typescript
// FORBIDDEN — Catch exception and return empty; frontend unaware of error
} catch (e) {
  return [];
}

// CORRECT — Log error and return informative response
} catch (e) {
  logger.error(`[Feature] Operation failed: ${e.message}`, e);
  return c.json({
    error: "Operation failed",
    details: e.message
  }, 500);
}
```

### Validation errors MUST be specific

```typescript
// FORBIDDEN — Generic message
throw new ValidationError("Invalid input");

// CORRECT — Field-specific message
throw new ValidationError("JIRA_HOST must be a valid URL starting with https://");
```

### Long operations MUST have status tracking

Every long-running operation (scan, analysis, sync) MUST:
1. Return status immediately (202 Accepted or status object)
2. Provide polling endpoint for frontend progress tracking
3. Log each step to database for frontend detail display
4. On completion with abnormal results (0 items, partial failure) → log entry explaining cause

### Jira API Integration

- NO use of `/rest/api/3/search` (deprecated, returns 410 Gone)
- Use `/rest/api/3/search/jql` for search queries
- Use `/rest/api/3/issue/{key}` for single issue
- Use `/rest/api/3/project` for project list
- Every Jira API call MUST log result (success count or error message)
- When Jira API returns error → return response with specific message for frontend, NO silent empty return