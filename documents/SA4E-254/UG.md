# User Guide v1.0 - SA4E-254 Advanced RAG Query Router + Summary Tree

## 1. Overview
Advanced RAG for tài liệu lớn 100+ trang với Query Router phân loại intent, Summary Tree pre-computed, Semantic Cache và Async Queue.

## 2. Installation
- Backend Node 20, Hono 4.x, PostgreSQL 15+ pgvector, Redis 7.x
- Build: `npm run build` trong `backend/`
- Start: `npm run dev`

## 3. Configuration
Env vars:
- RAG_ADVANCED_ROUTER_ENABLED=true
- RAG_ADVANCED_ASYNC_ENABLED=true
- REDIS_URL
- DATABASE_URL
- JWT_SECRET

## 4. Usage

### 4.1 Ingest document
POST `/api/rag/ingest`
Headers: Authorization: Bearer <token>
Body: `{ "doc_id": "uuid" }`
Response 202: `{ doc_id, status, summary_cost_estimate_tokens }`

### 4.2 Query RAG
POST `/api/rag/query`
Body:
```json
{
  "query_text": "tóm tắt tài liệu",
  "doc_id": "uuid",
  "async": false
}
```
Response 200:
```json
{
  "answer": "...",
  "intent": "GLOBAL",
  "confidence": 0.92,
  "source_layer": "document",
  "cache_hit": true
}
```
Nếu async true → 202 với job_id.

### 4.3 Intent types
- LOCAL: tra cứu chi tiết
- GLOBAL: tóm tắt, tổng hợp
- RELATIONAL: liên quan, so sánh giữa
- STRUCTURAL: mục lục, chương

## 5. Administration
- Health: GET `/health/rag`
- Cache TTL: GLOBAL 24h, STRUCTURAL 1h
- Invalidate cache khi re-ingest

## 6. Troubleshooting
- 401 ERR_AUTH: thiếu JWT
- 400 ERR_VALIDATION: query_text rỗng hoặc doc_id invalid UUID
- Cache key injection mitigated by SHA256 hash + sanitize
- Prompt injection prevented by Zod validation

## 7. Security
- JWT Bearer required
- IDOR protected by ownership check stub
- Logs mask doc_id, truncate query_text
