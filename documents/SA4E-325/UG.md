# User Guide (UG)

## SA4E-325: Pi Smart Context Retrieval for repos with thousands of files

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-325 |
| Version | 1.0 |
| Date | 2026-09-27 |
| Module | `extension/src/pi-agent/` |

## 1. Overview

Trước đây Pi agent nạp toàn bộ workspace vào context, làm kill các small model (~8k window) trên repo hàng nghìn file. Smart Context Retrieval chạy **trước khi tạo agent session**, chỉ nạp các file liên quan theo query, với token budget cứng **≤ 6000 tokens** và 3-tier progressive disclosure.

## 2. Features

1. **ContextRetriever** (`pi-agent/context-retriever.ts`) — entry point `retrieve(query, topK)`:
   - Gọi `code_search` + `mem_search` (MCP, topK ≤ 20), ranking symbols theo relevance.
   - Progressive disclosure 3 tiers: `symbol` (outline ~200 tok) → `chunk` (80 lines, ~800 tok) → `full`.
   - Hard cap token budget 6000; vượt budget thì truncate file rank thấp nhất.
2. **QueryRouter** (`pi-agent/query-router.ts`) — phân loại intent `LOCAL | GLOBAL | STRUCTURAL`; unknown → LOCAL.
3. **GLOBAL intent → summary-tree**: thay vì scan từng file, sinh cây thư mục depth ≤ 3 kèm số file, token-capped (default 1500).
4. **File exclusion + pagination**: `.git`, `node_modules`, `out`, `dist` không bao giờ vào context (case-insensitive); directory reads đều qua cursor pagination (page 100), không bao giờ load full directory.
5. **Fallback**: search timeout/fail (1 retry, backoff 200ms) → rơi về summary-tree; no results → empty context + warning. Session creation không bao giờ fail vì retrieval.
6. **Session integration**: `PiSessionFactory.createSession(sdk, { query, topK })` chạy retrieval trước `createAgentSession`, trả `contextFiles` (đường dẫn) + `context` (payload đầy đủ) trong `SessionResult`.

## 3. Usage

```ts
import { ContextRetriever } from './pi-agent/context-retriever';
import { createMcpSearchProvider } from './pi-agent/context-retrieval/search-provider';

const retriever = new ContextRetriever({
  searchProvider: createMcpSearchProvider(config), // MCP wrapper on http://127.0.0.1:9181/mcp
  rootDir: workspaceRoot,
});

const result = await retriever.retrieve('review auth flow', 20);
// result: { contextFiles: [{path, outline, tokens, tier}], totalTokens, tier, intent }
```

Với session factory:

```ts
const factory = new PiSessionFactory(resolver, retriever);
const session = await factory.createSession(sdk, { query: 'review auth flow', topK: 20 });
// session.contextFiles: ['src/auth/login.ts', ...] — passed into Pi SDK session config
```

## 4. Configuration

Constants trong `pi-agent/context-retrieval/types.ts` (`DEFAULT_RETRIEVAL_CONFIG`), override qua `config`:

| Property | Default | Description |
|----------|---------|-------------|
| `maxTopK` | 20 | Số candidates tối đa (BR-1: topK ≤ 20) |
| `tokenBudget` | 6000 | Token budget cứng (BR-2) |
| `symbolTierTokens` | 200 | Tier 1 — outline/signature per file |
| `chunkTierTokens` | 800 | Tier 2 — chunk per file |
| `chunkLines` | 80 | Số dòng của chunk |
| `searchTimeoutMs` | 2000 | Timeout cho mỗi MCP search call |
| `retryBackoffMs` | 200 | Backoff trước retry (1 retry) |
| `pageSize` | 100 | Page size cho directory listing |

Excluded dirs: `['.git', 'node_modules', 'out', 'dist']` (case-insensitive).

## 5. Error Handling

| Trường hợp | Hành vi |
|------------|---------|
| `topK` = 0 / không phải integer | `RetrievalValidationError` |
| Query rỗng/toàn whitespace | `RetrievalValidationError` |
| code_search timeout/fail sau 1 retry | Fallback summary-tree, log WARN |
| mem_search fail | Tiếp tục với code_search results |
| Không có kết quả | Empty context + `warning` field |

## 6. Performance (NFR)

- Retrieval < 500ms p95 với topK=20 (verified TC-802: 1000-file repo < 500ms).
- 1000-file repo: token usage ≤ 6000 (verified TC-303).
- Scalability 10k files nhờ pagination + exclusion.
