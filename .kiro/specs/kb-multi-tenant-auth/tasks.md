# Tasks

## Backend — Auth and Routes

- [x] 1. Create `backend/src/server/middleware/jwt-auth.ts` — JWT validation middleware
- [x] 2. Update `backend/src/modules/memory/ProjectContext.ts` — add workspaceId field
- [x] 3. Update `backend/src/modules/memory/models.ts` — add WORKSPACE scope, workspace_id to KnowledgeEntry
- [x] 4. Update `backend/src/modules/memory/IsolationLayer.ts` — 4-level scope filter with workspace support
- [x] 5. Create `backend/src/server/routes/kb-api.ts` — REST API route handlers
- [x] 6. Update `backend/src/server/HttpServer.ts` — register /api/v1 routes
- [x] 7. Update `backend/src/modules/memory/MigrationRunner.ts` — v2 migration (workspace_id column)

## Extension — REST Client

- [x] 8. Create `extension/src/services/KBClient.ts` — REST client using AuthManager

## Cleanup and Migration

- [x] 9. Remove /mcp endpoint from HttpServer (returns 404 now)
- [ ] 10. Remove @modelcontextprotocol/sdk from backend — DEFERRED (still needed for McpClientManager orchestration)
- [ ] 11. Remove @modelcontextprotocol/sdk from extension — DEFERRED (still needed for local MCP wrapper)
- [x] 12. Created extension KBClient as REST replacement for MCP tool calls

## Testing

- [x] 13. Fix test helpers (add workspace_id to mock KnowledgeEntry)
- [ ] 14. Add unit tests for jwt-auth middleware
- [ ] 15. Add integration tests for /api/v1 endpoints
- [ ] 16. Add isolation layer tests for WORKSPACE scope

## Build Verification

- [x] 17. TypeScript compiles with 0 errors (backend)
