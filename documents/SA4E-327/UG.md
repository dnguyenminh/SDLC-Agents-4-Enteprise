# User Guide (UG)

## SA4E-327: Pi Task Decomposition + Map-Reduce for large repo queries

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-327 |
| Version | 1.0 |
| Date | 2026-09-27 |
| Module | `extension/src/pi-agent/` (depends on SA4E-325) |

## 1. Overview

Với các query GLOBAL/STRUCTURAL trên repo lớn ("explain architecture"), một small model không đọc hết được toàn bộ codebase. Tính năng này decompose query thành các **batch 20 files**, mỗi batch được summarize song song bởi sub-agent (small model, ≤ 4000 tokens/batch), sau đó reduce tổng hợp thành answer cuối — không OOM, chất lượng so sánh được với 1-shot large model.

## 2. Features

1. **TaskDecomposer** (`pi-agent/task-decomposer.ts`) — `decompose(query, files, {batchSize})`:
   - Chia files thành batch 20 files, deduplicate (case-insensitive, normalize `\` → `/`).
   - `subQuery` per batch: `"{query} [batch i/n: k files]"`; `maxTokens` = 4000/batch.
   - `DECOMPOSE_FAIL` → fallback single batch. Decomposition < 200ms.
2. **MapReduceOrchestrator** (`pi-agent/map-reduce/map-reduce-orchestrator.ts`):
   - `map(query, batches)`: chạy song song với **p-limit 5** concurrent sub-agents, **timeout 30s/batch**, **1 retry/batch**. Batch fail hết retry → ghi vào `timedOutBatches`, các partial result khác vẫn dùng.
   - `reduce(query, partials)`: synthesize answer qua sub-agent; `REDUCE_FAIL` → fallback concat các partial summary.
   - `run(query, files)`: full flow decompose → map → reduce, trả `MapReduceResult` (answer, batches, partials, timedOut/skipped, elapsedMs).
3. **CircuitBreaker** (`map-reduce/circuit-breaker.ts`) — bảo vệ sub-agent: 3 failure liên tiếp → OPEN (skip batch), cooldown 60s → HALF-OPEN trial.
4. **LargeQueryProcessor** (`map-reduce/large-query-processor.ts`) — tích hợp với SA4E-325:
   - Chỉ kích hoạt khi intent `GLOBAL|STRUCTURAL` và số file quét được ≥ `minFiles` (default 21).
   - Scan files qua FileScanner (exclusion + pagination + `maxFiles` 200) → decompose → map-reduce.
   - Kết quả map vào `RetrievalResult` tier `map-reduce` (summary = answer, contextFiles = partial summaries), token cap 6000.
   - Không đủ file / không có partials / orchestrator fail → trả `null`, ContextRetriever fallback về summary-tree.

## 3. Usage

```ts
import { TaskDecomposer } from './pi-agent/task-decomposer';
import { MapReduceOrchestrator } from './pi-agent/map-reduce/map-reduce-orchestrator';
import { LargeQueryProcessor } from './pi-agent/map-reduce/large-query-processor';
import { ContextRetriever } from './pi-agent/context-retriever';

const orchestrator = new MapReduceOrchestrator({ subAgent, decomposer: new TaskDecomposer() });
const processor = new LargeQueryProcessor({ orchestrator, scanner, rootDir });

const retriever = new ContextRetriever({
  searchProvider, rootDir, largeQueryProcessor: processor,
});
// Query GLOBAL "explain the architecture" giờ đi qua map-reduce thay vì summary-tree
const result = await retriever.retrieve('explain the architecture');
```

Standalone:

```ts
const result = await orchestrator.run('explain architecture', files);
// { answer, batches, partials, timedOutBatches, skippedBatches, elapsedMs }
```

## 4. Configuration

`DEFAULT_MAP_REDUCE_CONFIG` trong `pi-agent/map-reduce/types.ts`, override qua `config`:

| Property | Default | Description |
|----------|---------|-------------|
| `batchSize` | 20 | Số files mỗi batch |
| `parallelism` | 5 | Số sub-agent chạy concurrent (p-limit) |
| `batchTimeoutMs` | 30000 | Timeout mỗi batch |
| `retriesPerBatch` | 1 | Retry mỗi batch (backoff 200ms) |
| `maxFiles` | 200 | Số files tối đa quét cho map-reduce |
| `subAgentTokenCap` | 4000 | Token tối đa mỗi sub-agent |
| `minFiles` (deps) | batchSize + 1 | Ngưỡng tối thiểu để dùng map-reduce |

## 5. SubAgentClient Contract

Sub-agent (small model) inject qua interface:

```ts
interface SubAgentClient {
  summarizeBatch(query: string, batch: Batch): Promise<{ summary; tokens; confidence }>;
  synthesize(query: string, partials: PartialSummary[]): Promise<string>;
}
```

## 6. Error Handling

| Trường hợp | Hành vi |
|------------|---------|
| Batch timeout sau retry | Batch vào `timedOutBatches`, partials khác vẫn reduce |
| 3 batch fail liên tiếp | Circuit breaker OPEN, các batch sau vào `skippedBatches` |
| Reduce fail | Fallback concat partial summaries |
| Decompose fail | Single batch |
| Orchestrator/processor fail | ContextRetriever fallback summary-tree |

## 7. Performance (NFR)

- Decomposition < 200ms (verified).
- 100 files (5 batches) end-to-end < 60s (verified TC-301).
- Token per sub-agent ≤ 4k; context payload ≤ 6k (BR-2 SA4E-325).
- Parallelism bounded tại 5 — không quá tải provider.
