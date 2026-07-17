# User Guide — SA4E-44: Persistent Task Queue + Async File Scanner

## Overview

SA4E-44 introduces two key improvements to the SA4E Code Intelligence Server:

1. **Persistent Task Queue** — KB ingest operations (tag enrichment, vector embedding) are now persisted as database tasks. If the server crashes mid-processing, tasks recover automatically on restart.
2. **Async File Scanner** — Workspace scanning no longer blocks the event loop. The server stays responsive during full indexing of large projects (1000+ files).

---

## Quick Start

No configuration changes are required. The task queue and async scanner activate automatically on server startup.

---

## Configuration Reference

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `TASK_WORKER_BASE_INTERVAL` | `2000` | Polling interval (ms) when tasks are available |
| `TASK_WORKER_MAX_INTERVAL` | `30000` | Max backoff interval (ms) when queue is empty |
| `TASK_WORKER_STALE_THRESHOLD` | `300000` | Time (ms) before a PROCESSING task is considered stale |
| `TASK_WORKER_MAX_RETRIES` | `3` | Maximum retry attempts per failed task |

### Example: Custom Worker Config

```bash
export TASK_WORKER_BASE_INTERVAL=1000
export TASK_WORKER_MAX_INTERVAL=15000
export TASK_WORKER_STALE_THRESHOLD=600000
export TASK_WORKER_MAX_RETRIES=5
```

---

## How It Works

### Task Queue Flow

1. User calls `mem_ingest` → entry + tasks are created in a **single atomic transaction**
2. TaskWorker polls for PENDING tasks via exponential backoff
3. Tasks are dispatched to TagAnalyzerService or EmbeddingService
4. On success → task marked COMPLETED
5. On failure → retry up to `max_retries`, then marked FAILED

### Async File Scanner

The `startBackgroundIndexing()` method now uses `scanWorkspaceAsync()` which:
- Reads files using `fs.promises` (non-blocking I/O)
- Yields to the event loop every 50 files via `setImmediate`
- Prevents HTTP server from becoming unresponsive during large scans

---

## Administration

### Diagnostic Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/internal/tasks/stats` | GET | Queue statistics (pending, processing, completed, failed) |
| `/internal/tasks/failed` | GET | List failed tasks (query: `?limit=20`) |
| `/internal/tasks/:id/retry` | POST | Reset a failed task back to PENDING |

**Note:** These endpoints are localhost-only (127.0.0.1). No authentication required.

### Example: Check Queue Stats

```bash
curl http://localhost:48721/internal/tasks/stats
```

Response:
```json
{
  "pending": 3,
  "processing": 1,
  "completed": 142,
  "failed": 2,
  "isRunning": true,
  "lastPollAt": "2026-07-17T10:30:00.000Z"
}
```

### Example: Retry a Failed Task

```bash
curl -X POST http://localhost:48721/internal/tasks/5/retry
```

Response:
```json
{ "ok": true, "new_status": "PENDING" }
```

---

## Troubleshooting

### Tasks stuck in PROCESSING

**Cause:** Server crashed while processing a task.
**Solution:** On restart, the TaskWorker automatically recovers stale tasks (older than `TASK_WORKER_STALE_THRESHOLD`). No manual intervention needed.

### High number of FAILED tasks

**Cause:** LLM service unavailable, or entries deleted after task creation.
**Solution:**
1. Check LLM connectivity: `curl http://localhost:1234/v1/models`
2. Review failed tasks: `GET /internal/tasks/failed`
3. Retry recoverable tasks: `POST /internal/tasks/:id/retry`

### Server unresponsive during indexing

**Cause (pre-SA4E-44):** Synchronous file scanner blocking the event loop.
**Solution:** This is fixed. The async scanner yields every 50 files. If still experiencing issues, check if the workspace has an extremely deep directory tree.

### TaskWorker not starting

**Cause:** Database migration failed.
**Solution:** Check server logs for migration errors. The `pending_tasks` table must exist. Verify with:
```sql
SELECT name FROM sqlite_master WHERE type='table' AND name='pending_tasks';
```

---

## Error Codes

| Error | Context | Meaning |
|-------|---------|---------|
| `entry_not_found` | Task processing | The KB entry was deleted after task creation |
| `invalid_json_payload` | Task processing | Task payload is corrupted |
| `unknown_task_type` | Task processing | Unrecognized task type (not TAG_ENRICHMENT or VECTOR_EMBEDDING) |
| `task_not_found` | Admin retry | Task ID does not exist |
| `task_not_failed` | Admin retry | Cannot retry a task that is not in FAILED status |

---

## Architecture Notes

- All task queue SQL uses the `DatabaseAdapter` interface (no direct better-sqlite3 calls)
- The worker uses `setTimeout` scheduling — never blocks the Node.js event loop
- Entry INSERT + task INSERTs are wrapped in `db.transaction()` for atomicity
- TagAnalyzerService and EmbeddingService are injected via setter (late binding) since LLM health checks are async
