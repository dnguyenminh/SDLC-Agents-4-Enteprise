# User Guide — SA4E-297 Testing QA & LangGraph Cleanup

## 1. Installation

No new packages required. Backend runs with existing dependencies:
- Node.js 20+
- TypeScript 5.5.0
- Hono 4.0.0
- Vitest 4.1.9

## 2. Configuration Reference

Environment variables:
- `PI_WORKFLOW_CLEANUP_ENABLED=true` — enable PiWorkflow cleanup mode
- `E2E_PORT` — port for E2E tests (default 48721)

## 3. Usage

### Trigger test execution
```bash
curl -X POST http://localhost:48721/api/v1/tests/execute \
  -H "Content-Type: application/json" \
  -d '{"ticketKey":"SA4E-297","scope":"unit"}'
```
Response:
```json
{
  "executionId": "uuid",
  "summary": {"passCount":42,"failCount":0,"skippedCount":0}
}
```

### Test scopes
- `unit` — unit tests for pi-workflow modules
- `integration` — 7-phase SDLC pipeline
- `regression` — full regression suite

## 4. Administration

LangGraph cleanup:
1. Verify prerequisites SA4E-290..SA4E-296 merged
2. Run tests: `npm run test:e2e-api`
3. Remove LangGraphEngine references; class marked `@deprecated`
4. Build succeeds without LangGraph workflow dependencies

## 5. Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| Prerequisite missing | SA4E-29x not merged | Merge prerequisite stories |
| RemoteCheckpointer unavailable | Backend down | Check RemoteCheckpointer service |
| Build failed after cleanup | Residual import | Remove imports from src/pi-workflow/ |

Error codes:
- `INVALID_INPUT` — validation failed
- `INTERNAL_ERROR` — execution failure

## 6. API Reference

**POST /api/v1/tests/execute**
- Auth: Bearer JWT
- Request: `{ ticketKey:string, scope:'unit'|'integration'|'regression', modules?:string[] }`
- Response: `{ executionId:string, summary:{passCount, failCount, skippedCount} }`

## 7. FAQ

Q: Can LangGraphEngine still be used?
A: Deprecated in SA4E-297. Use PiWorkflow Engine.

Q: State fields preserved?
A: Yes: ticketKey, threadId, currentPhase, pipelineStatus.
