# User Guide — SA4E-250 Knowledge Graph Edge Ingestion Fix

## 1. Installation

### Prerequisites
- Node.js >=18.14.1
- npm >=9
- SQLite (better-sqlite3) or PostgreSQL

### Install dependencies
```bash
cd backend
npm install
```

### Build
```bash
npm run build
```

### Run migrations
```bash
npm run db:migrate
```

## 2. Usage

### Ingest knowledge entry with automatic edge creation

POST `/api/knowledge/ingest`
```json
{
  "project_id": 123,
  "content": "This relates to SA4E-50 and modifies crud.ts",
  "source": "crud.ts",
  "tags": ["bugfix","memory"]
}
```

Response:
```json
{
  "node_id": 4567,
  "edges_created": 3,
  "status": "success"
}
```

Edge creation is performed **after** node upsert, using integer `source_id`/`target_id` in `knowledge_graph_edges`. Matching uses `content`, `source`, `tags` fields with project filter and pagination (default page size 1000).

### Manual edge creation

POST `/api/knowledge/graph/edges/create`
```json
{
  "source_node_id": 4567,
  "target_node_id": 8910,
  "edge_type": "semantic_similarity",
  "metadata": { "score": 0.87 }
}
```

## 3. Configuration

- `PAGE_SIZE` default 1000, max 5000
- Project filter applied automatically when `project_id` provided
- Edge types: `semantic_similarity`, `citation`, `reference`

## 4. Troubleshooting

### No edges created
- Verify `project_id` matches existing nodes
- Check content contains ticket keys, file paths, or PascalCase references
- Review logs for `edge_skipped_low_score` metric

### FK violation errors
- Ensure `source_id`/`target_id` exist in `knowledge_entries.id`
- Edge creation runs after upsert, preventing orphan edges

### Performance
- Pagination removes 2000 row limit; monitor `knowledge_graph_edges_insert_latency_ms`
- p95 latency target <500ms

### Common errors
- `VALIDATION_ERROR` 400: source/target missing or type mismatch
- `NODE_NOT_FOUND` 404: node_id does not exist
- `DUPLICATE_EDGE` 409: edge already exists, upserted
- `DB_ERROR` 500: FK constraint or deadlock

## 5. Monitoring

- Metric: `knowledge_graph_edges_insert_latency_ms` histogram
- Log: `edge_skipped_low_score` count
- Health check: `GET /api/knowledge/health`

## 6. Support

For issues, open ticket referencing SA4E-250.
