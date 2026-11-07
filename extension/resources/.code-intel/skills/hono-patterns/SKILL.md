---
name: hono-patterns
description: "Hono framework patterns for this project. Use when creating routes, middleware, or HTTP handlers in backend/src/server/."
---

# hono-patterns

Patterns and conventions for Hono usage in `backend/src/server/`. Follow these when writing HTTP routes, middleware, or API endpoints.

## Route Factory Pattern

Every route group is a function that returns a new Hono instance. Inject dependencies as parameters.

```typescript
// backend/src/server/routes/{resource}.ts
import { Hono } from 'hono';
import type { Logger } from 'pino';

export function createXxxRoute(registry: ModuleRegistry, logger: Logger): Hono {
  const app = new Hono();

  app.get('/endpoint', (c) => {
    return c.json({ data: 'result' });
  });

  return app;
}
```

Mount in `HttpServer.ts`:
```typescript
app.route('/api/v1', createXxxRoute(registry, logger));
```

## Middleware Chain Order

Applied in `HttpServer.createApp()`:

1. `securityHeaders` — all routes (CORS, XSS protection)
2. `bodyLimit` — 100MB max (exempt streaming endpoints)
3. `requestLogger` — Pino-based access logs
4. Path-specific auth:
   - `/api/admin/*` → `rateLimiter` + login rate limit
   - `/api/index/*` → `jwtAuth`
   - `/api/tags/*`, `/mcp/*` → `apiKeyAuth`
5. `app.onError(createErrorHandler(logger))` — global error boundary

## Writing Middleware

```typescript
import type { Context, Next } from 'hono';

export async function myMiddleware(c: Context, next: Next): Promise<Response | void> {
  // Pre-processing
  const start = Date.now();

  await next();

  // Post-processing
  c.header('X-Response-Time', `${Date.now() - start}ms`);
}
```

For configurable middleware, use factory pattern:
```typescript
export function createMyMiddleware(config: MyConfig): MiddlewareHandler {
  return async (c, next) => {
    // use config...
    await next();
  };
}
```

## Error Handling

Global error boundary catches ALL unhandled exceptions:
```typescript
// Never catch-all in routes — let errors propagate to the global handler
app.onError(createErrorHandler(logger));
```

For route-specific errors, throw or return directly:
```typescript
app.get('/resource/:id', (c) => {
  const item = service.find(c.req.param('id'));
  if (!item) return c.json({ error: 'Not found' }, 404);
  return c.json(item);
});
```

## Dependency Injection

Use `HttpServerOptions` for main dependencies:
```typescript
interface HttpServerOptions {
  registry: ModuleRegistry;  // access all modules
  logger: Logger;
  toolRouter?: ToolRouter;   // optional override for testing
}
```

Routes resolve services from registry:
```typescript
const module = registry.getModule('knowledge') as KnowledgeModule;
const service = module.getService();
```

## Request Validation (Zod)

Always validate external input with Zod safeParse:
```typescript
import { z } from 'zod';

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

app.get('/items', (c) => {
  const parsed = QuerySchema.safeParse(c.req.query());
  if (!parsed.success) return c.json({ error: parsed.error.message }, 400);
  // use parsed.data.limit, parsed.data.offset
});
```

## Streaming Responses

For large/streaming responses (MCP, NDJSON):
```typescript
app.post('/stream', (c) => {
  const stream = new ReadableStream({
    async start(controller) {
      for await (const chunk of source) {
        controller.enqueue(new TextEncoder().encode(JSON.stringify(chunk) + '\n'));
      }
      controller.close();
    }
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson' }
  });
});
```

Exempt streaming endpoints from body limit:
```typescript
app.use('*', async (c, next) => {
  if (c.req.path === '/api/v1/my-stream') return next();
  return bodyLimit({ maxSize: 100 * 1024 * 1024 })(c, next);
});
```

## MCP Integration (Streamable HTTP)

```typescript
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';

app.all('/mcp', async (c) => {
  const transport = new WebStandardStreamableHTTPServerTransport();
  registerTransport(transport);
  const server = getMcpServer(registry, logger);
  await server.connect(transport);
  return transport.handleRequest(c.req.raw);
});
```

## Testing with Hono

Use `app.fetch()` directly in Vitest (no HTTP server needed):
```typescript
import { describe, it, expect } from 'vitest';

describe('Health endpoint', () => {
  it('returns 200 with status', async () => {
    const app = createHealthRoute(mockRegistry, 'test');
    const res = await app.fetch(new Request('http://localhost/health'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('healthy');
  });
});
```

## File Organization

```
backend/src/server/
├── HttpServer.ts           # Main app creation + route mounting
├── mcpServer.ts            # MCP server + tool registration
├── middleware/
│   ├── api-key-auth.ts     # X-API-Key validation
│   ├── jwt-auth.ts         # JWT Bearer validation
│   ├── rate-limiter.ts     # IP-based sliding window
│   ├── request-logger.ts   # Pino access logging
│   ├── security-headers.ts # CORS + security headers
│   └── error-handler.ts    # Global error boundary
└── routes/
    ├── health.ts           # GET /health
    ├── admin.ts            # Admin CRUD
    ├── kb-api.ts           # Knowledge Base API
    ├── pega-api.ts         # Pega integration
    └── tools.ts            # Tool execution proxy
```

## Anti-Patterns

| ❌ Don't | ✅ Do |
|----------|------|
| Put business logic in routes | Routes call services from modules |
| Catch-all errors in routes | Let errors propagate to global handler |
| Create inline Hono instances in `HttpServer` | Use `createXxxRoute()` factory functions |
| Use `JSON.parse(body)` manually | Use `c.req.json()` + Zod validation |
| Hard-code auth checks in each route | Use middleware (`jwtAuth`, `apiKeyAuth`) |
| Import modules directly in routes | Resolve via `registry.getModule()` |
