---
name: indexing-guide
description: Guide for indexing source code and documents into Knowledge Base
---

## Overview

Code Intelligence provides 2 types of indexing:
1. **Code Indexing** — automatic indexing of source code (classes, functions, interfaces) into SQLite FTS5
2. **Document Indexing** — manual indexing of documents (BRD, FSD, TDD, etc.) into Memory Knowledge Base

## 1. Code Indexing (Automatic)

MCP server auto-indexes on startup. Check status:

```
Tool: code_index_status
```

### Manual Re-index

```
Tool: code_index_status
Arguments: { "reindex": true }
```

### Sync Code Symbols into Memory Graph

After code is indexed, sync into memory for cross-reference search:

```
Tool: mem_sync_code
Arguments: {} (sync all classes + interfaces)
```

Or filter by kind:

```
Tool: mem_sync_code
Arguments: { "kind": "class", "limit": 500 }
```

## 2. Document Indexing (Manual)

### Index a Single Document

```
Tool: mem_ingest_file
Arguments: {
  "file_path": "documents/KSA-14/BRD.md",
  "type": "REQUIREMENT",
  "format": "markdown"
}
```

### Document Types

| Document | Type |
|----------|------|
| BRD | `REQUIREMENT` |
| FSD | `REQUIREMENT` |
| TDD | `ARCHITECTURE` |
| STP/STC | `PROCEDURE` |
| DPG/RLN | `PROCEDURE` |
| Decision records | `DECISION` |
| Error patterns | `ERROR_PATTERN` |
| Lessons learned | `LESSON_LEARNED` |

### Index Multiple Documents

Call `mem_ingest_file` for each file. Example indexing all docs for ticket KSA-14:

```
mem_ingest_file → documents/KSA-14/BRD.md (type: REQUIREMENT)
mem_ingest_file → documents/KSA-14/FSD.md (type: REQUIREMENT)
mem_ingest_file → documents/KSA-14/TDD.md (type: ARCHITECTURE)
```

## 3. Check Memory Status

```
Tool: mem_status
```

Returns: entry counts, tier breakdown, vector count.

## 4. Search in Knowledge Base

```
Tool: mem_search
Arguments: { "query": "authentication flow", "detail": true }
```

Filter by role:

```
Tool: mem_search
Arguments: { "query": "API design", "role": "SA" }
```

## 5. Best Practices

- **When to re-index code**: After adding/removing many files, or after large branch merge
- **When to index documents**: Immediately after creating/updating BRD, FSD, TDD
- **When to sync code**: After re-index, or when agents need cross-reference between code and documents
- **Consolidate memory**: Run `mem_consolidate` periodically to promote/demote entries by access patterns

## 6. Troubleshooting

| Problem | Solution |
|---------|----------|
| `code_index_status` returns 0 files | Check `--workspace` arg in mcp.json |
| `mem_search` cannot find document | Run `mem_ingest_file` for that document |
| Semantic search not working | Check Ollama is running + model pulled |
| Memory has too many old entries | Run `mem_consolidate` |