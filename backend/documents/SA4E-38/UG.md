# User Guide — Smart KB Ingest (SA4E-38)

## Overview

Smart KB Ingest uses a local LLM (Ollama) to semantically evaluate user messages before storing them in the Knowledge Base. Only messages with business or technical value are stored — greetings, chitchat, and commands are filtered out.

## Tools

### mem_smart_ingest

Evaluates a user message and ingests it if valuable.

**Input:**
```json
{ "message": "We decided to use Strategy pattern for transport layer" }
```

**Possible Responses:**

| Action | Meaning |
|--------|---------|
| `ingest` | Message stored with LLM-generated summary |
| `skip` | Message has no KB value (not stored) |
| `ingest_unfiltered` | Ollama unavailable — stored raw for later cleanup |
| `error` | Internal error (message not stored) |

### mem_smart_ingest_cleanup

Re-evaluates previously unfiltered entries in batch.

**Input:**
```json
{ "batch_size": 50, "dry_run": false }
```

**Parameters:**
- `batch_size` — 1 to 100, default 50
- `dry_run` — preview mode, no actual changes

**Response:**
```json
{ "processed": 5, "ingested": 3, "deleted": 2, "remaining": 10, "dry_run": false }
```

## Configuration

Uses the same LLM environment variables as the existing Memory module:

| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_PROVIDER` | `lmstudio` | LLM provider (ollama, lmstudio, openai) |
| `LLM_BASE_URL` | `http://localhost:1234/v1` | Provider API endpoint |
| `LLM_MODEL` | `qwen3-8b` | Model for classification |
| `LLM_TEMPERATURE` | `0.3` | Inference temperature |

For Ollama specifically: ensure Ollama is running on `localhost:11434`.

## Graceful Degradation

- If Ollama is unreachable, messages are stored with an `unfiltered` tag
- Run `mem_smart_ingest_cleanup` later when Ollama is back online
- The system never blocks or errors out — it always returns a valid response

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| All messages stored as `ingest_unfiltered` | Ollama not running | Start Ollama: `ollama serve` |
| Cleanup returns `llm_unavailable` | Ollama down at cleanup time | Start Ollama, retry |
| Message classified wrong | Model limitations | Try a larger model via `LLM_MODEL` |
| `action: error` returned | DB write failure | Check disk space, DB permissions |

## Architecture Notes

- **ClassifyService** — Strategy pattern, swappable LLM evaluation
- **OllamaAdapter** — Reused from existing Memory module (no new adapters)
- **Fire-and-forget** — Hook calls `mem_smart_ingest` without blocking user interaction
- **Duplicate detection** — Content-based dedup prevents storing same knowledge twice
