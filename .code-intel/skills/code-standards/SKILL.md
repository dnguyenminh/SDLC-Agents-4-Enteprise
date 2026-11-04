---
name: code-standards
description: Code quality standards — SOLID, OOP patterns, size limits, comments, serialization, error handling
---

## Mandatory Size Limits
- **File**: max 200 lines (including comments and blank lines)
- **Function**: max 20 lines (excluding signature and closing brace)

## Code Comments (Required)
Comments explain **WHY**, not just **WHAT**.

### Required at:
| Location | Requirement | Example |
|----------|-------------|---------|
| File header | Purpose (1-3 lines) | `/** GraphSyncService. Projects code symbols into graph_nodes. */` |
| Class/Interface | TSDoc/JSDoc responsibility | `/** Manages provider lifecycle: connect, scan, disconnect. */` |
| Public function | TSDoc/JSDoc with @param, @returns, @throws | `/** Sync symbols to graph. @param projectId - tenant ID */` |
| Complex logic | Inline comment for WHY | `// Fibonacci sphere: distributes nodes evenly on 3D surface` |
| Business rules | Reference BR-ID / UC-ID | `// BR-03: Rate limit 100 req/min per API key` |
| Workarounds/Hacks | Why + TODO fix | `// HACK: SQLite doesn't support SKIP LOCKED, use busy timeout` |
| Magic numbers | Explain the constant | `const BATCH = 200; // Optimal batch for SQLite WAL throughput` |

### NOT needed (avoid noise):
- Simple getters/setters, self-describing code (e.g., `isUserLoggedIn()`), imports, closing braces

Format example:
```typescript
/**
 * Resolve available tools from all connected MCP servers.
 * Merges tools from child servers, deduplicates by name.
 * @param projectId - Tenant project identifier for scoping
 * @returns Array of tool definitions with server origin
 * @throws ConnectionError if orchestrator is unreachable
 */
export async function resolveTools(projectId: string): Promise<ToolDef[]> {
```

## SOLID Principles
- **S** — Single Responsibility: Each class has ONE reason to change
- **O** — Open/Closed: Open for extension, closed for modification
- **L** — Liskov Substitution: Subclasses must be substitutable for parent
- **I** — Interface Segregation: Small, focused interfaces (NO god interfaces)
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
| `models/` | Data classes, DTOs, enums, interfaces, types, zod schemas |
| `pages/` or `views/` | Page controllers (UI logic, event binding, DOM) |
| `components/` | Reusable UI components |
| `api/` or `clients/` | HTTP client, API calls |
| `router/` | Navigation logic |
| `services/` | Business logic helpers (validation, formatting, state) |
| `utils/` | Pure utility functions (no side effects) |

NO business logic (validation, calculations) in page controllers — extract into `services/`.

## Serialization — zod schemas

### ALWAYS validate data crossing protocol/API boundaries with zod
```typescript
// FORBIDDEN — unvalidated data
const data = JSON.parse(raw);

// CORRECT — validate with zod schema
const result = ProviderInfoSchema.safeParse(JSON.parse(raw));
if (!result.success) throw new Error(result.error.message);
```

### Rules
1. **Protocol communication** (JSON-RPC, MCP, WebSocket): MUST use zod schemas — all fields present
2. **API responses** (REST): SHOULD validate before use — frontend needs exact shape
3. **Internal data** (DB, cache): may skip validation to save overhead
4. **Default values**: use `z.optional()` / `z.default()`
5. **Shared schemas**: export from one shared module, not scattered declarations
6. NO inline schema inside functions — top-level export

## Exception Handling
1. NEVER swallow exceptions — every `catch` MUST have clear handling (log, rethrow, notify user)
2. ALWAYS inform the user of exceptions (toast, error message, error response)
3. Correct patterns: log + notify, or rethrow as a typed error
4. Allowed exceptions: cleanup in `finally` (but log), retry loops (but inform user when retries exhausted)
5. Log at appropriate levels: ERROR for failures, WARN for degraded, INFO for business events, DEBUG for technical details

## Database Transaction Error Handling (CRITICAL)

**PostgreSQL aborts the ENTIRE transaction when ANY query in it fails.** No further query can run — must ROLLBACK first.

1. FORBIDDEN: silent catch inside a transaction — tx already aborted, caller unaware
2. FORBIDDEN: try-fallback inside transaction (e.g., retry INSERT) — second query ALWAYS fails
3. MUST let the error propagate — `transactionAsync` ROLLBACKs automatically
4. Fallback logic → move OUTSIDE the transaction, or check schema first (IF EXISTS), never try/catch

```typescript
// FORBIDDEN — silent catch poisons the whole tx
await adapter.transactionAsync(async () => {
  try {
    await adapter.runAsync('INSERT ... RETURNING id', params);
  } catch {
    await adapter.runAsync('INSERT ...', params);  // ← ALWAYS FAILS (tx aborted)
  }
});

// CORRECT — let error propagate, transactionAsync auto-ROLLBACKs
await adapter.transactionAsync(async () => {
  await adapter.runAsync('INSERT ... RETURNING id', params);
  await taskRepo.create({ ... });
});

// CORRECT — DDL/schema changes OUTSIDE the transaction (autocommit)
await adapter.execAsync('CREATE TABLE IF NOT EXISTS ...');
await adapter.transactionAsync(async () => {
  await adapter.runAsync('INSERT ...', params);
});
```

### DB code checklist:
- [ ] No `try/catch` inside `transactionAsync()` that swallows errors?
- [ ] DDL (CREATE, ALTER) runs OUTSIDE the transaction?
- [ ] No fallback/retry logic inside a transaction?
- [ ] `safeExec()` only used outside transaction context?

## Code Review Checklist
- [ ] File ≤ 200 lines?
- [ ] Function ≤ 20 lines?
- [ ] Model classes/interfaces in separate folder?
- [ ] No business logic in page controllers?
- [ ] Appropriate design patterns used?
- [ ] SOLID followed?
- [ ] Interfaces/abstractions for dependencies?
- [ ] TSDoc/JSDoc on public classes/interfaces/methods?
- [ ] Complex logic has inline WHY comments?
- [ ] Magic numbers documented?
- [ ] Workarounds have TODO + explanation?
- [ ] Exceptions never swallowed, users always informed?