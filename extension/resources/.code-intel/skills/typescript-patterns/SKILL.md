---
name: typescript-patterns
description: "TypeScript strict-mode patterns used in this project. Use when writing new modules, types, or services in backend/src/ or extension/src/."
---

# typescript-patterns

Strict TypeScript conventions and patterns enforced across this codebase.

## Strict Mode Configuration

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": false,
    "moduleResolution": "bundler",
    "module": "ESNext",
    "target": "ES2022"
  }
}
```

All files use `.js` extensions in import paths (ESM requirement):
```typescript
import { MemoryEngine } from '../engine/core.js';
```

## Discriminated Unions

Use `type` or `action` field as discriminant for polymorphic results:

```typescript
type ToolResult =
  | { status: 'success'; data: unknown; isError: false }
  | { status: 'error'; message: string; isError: true };

// Narrow via status check
function handle(result: ToolResult): void {
  if (result.status === 'error') {
    logger.error(result.message); // TS knows .message exists
    return;
  }
  processData(result.data); // TS knows .data exists
}
```

## Type Guards

Custom type guards for runtime checks with compile-time narrowing:

```typescript
function isToolDefinition(obj: unknown): obj is ToolDefinition {
  return (
    typeof obj === 'object' && obj !== null &&
    'name' in obj && typeof (obj as any).name === 'string' &&
    'inputSchema' in obj
  );
}
```

## Generic Patterns

Constrained generics for repository/service patterns:

```typescript
interface Repository<T extends { id: number }> {
  findById(id: number): Promise<T | null>;
  create(params: Omit<T, 'id' | 'created_at'>): Promise<T>;
}

// Factory with generic constraint
function createHandler<TArgs extends Record<string, unknown>>(
  schema: z.ZodType<TArgs>,
  fn: (args: TArgs) => Promise<string>,
): ToolHandler {
  return async (raw) => {
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return errorResult(parsed.error.message);
    return fn(parsed.data);
  };
}
```

## Zod Integration

All external input validated with Zod schemas. Infer types from schemas:

```typescript
import { z } from 'zod';

export const IngestArgsSchema = z.object({
  content: z.string().min(1),
  type: z.enum(['CONTEXT', 'ARCHITECTURE', 'INSTINCT']).default('CONTEXT'),
  tags: z.string().default(''),
  source: z.string().optional(),
});

export type IngestArgs = z.infer<typeof IngestArgsSchema>;
```

Always use `safeParse` for external data, `parse` only for trusted internal data.

## Async Patterns

Prefer async/await over raw Promises. Use typed error handling:

```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try { return await fn(); }
    catch (e) { lastError = e instanceof Error ? e : new Error(String(e)); }
  }
  throw lastError!;
}
```

## Error Handling Types

Result pattern for operations that can fail without throwing:

```typescript
type Result<T, E = string> =
  | { ok: true; value: T }
  | { ok: false; error: E };

function parseConfig(raw: string): Result<AppConfig> {
  const parsed = ConfigSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) return { ok: false, error: parsed.error.message };
  return { ok: true, value: parsed.data };
}
```

## Barrel Exports

Each module uses `index.ts` to re-export public API:

```typescript
// backend/src/modules/memory/definitions/index.ts
export { TIER1_TOOLS } from './search.js';
export { TIER2_TOOLS } from './tier2.js';
export const MEMORY_TOOL_DEFINITIONS = [...TIER1_TOOLS, ...TIER2_TOOLS];
```

## Anti-Patterns

| ❌ Don't | ✅ Do |
|----------|------|
| Use `any` | Use `unknown` + type guard |
| Omit `.js` in imports | Always include `.js` suffix |
| `as Type` assertions | Type guards or Zod parse |
| Mutable shared state | `Object.freeze()` or readonly |
| Inline type annotations for complex types | Named type aliases |
| `JSON.parse()` without validation | `schema.safeParse(JSON.parse(...))` |
