# Kiến trúc Code Agent 16K — Tài liệu tổng hợp

**Dự án:** SDLC-Agents-4-Enterprise (SA4E)  
**Phiên bản:** 1.0  
**Ngày:** 07 November 2026  
**Tác giả:** BA + SA + TA (AI-assisted)  
**Mục đích:** Tóm hợp ưu điểm từ hai đề xuất (review LLD + kiến trúc agent 16K) thành một tài liệu thiết kế thực thi cuối cùng.

---

## 1. Tóm tắt thực thi (Executive Summary)

- Hướng kiến trúc chính: xây dựng **Code Intelligence deterministic** đầu tiên, sau đó đè lên LLM chat/agent. Cách tiếp cận modular-monolith, local-first, retrieval hybrid, evidence có nhận biết phiên bản, workspace cô lập là nền tảng hợp lý.
- **LLD 1.0 chưa sẵn sàng để implement.** Cần: (a) redesign model repository/revision/snapshot; (b) sắp xếp lại thứ tự dependency-semantic; (c) thực thi snapshot-scoped retrieval; (d) persist plan/step/approval; (e) harden patch/isolation trước khi coding-agent mode.
- **Tóm hợp:** Đề xuất 1 cung cấp *nền tảng* (data model, ordering, retrieval, security, agent state). Đề xuất 2 cung cấp *trải nghiệm agent* (token budget, AST skeleton/body, dynamic repo map, tool compact, scratchpad eviction, incremental indexing).
- Lựa chọn engine: **SQLite** làm primary (local-first, reuse F2), không bắt buộc PostgreSQL/pgvector cho MVP. Chỉ dùng vector khi cần scaling multi-repo. Giữ Tree-sitter/FTS5 như cơ chế đã có.
- **Xác nhận hướng kiến trúc 8/10; readiness implement ~5/10.**

---

## 2. Ranh giới sản phẩm (Product Boundary)

| Câu hỏi | Giải quyết |
|---|---|
| Đây là sản phẩm mới hay enhancement? | Là module **Code Agent / Context Assembly** bên cạnh F2 Code Intelligence, reuse F2 + F4 + context-budget-governance. |
| Storage nào? | **SQLite** primary (single-user, local). Chỉ nâng PostgreSQL khi cần multi-team/server. |
| Scope ngôn ngữ MVP? | **Java + TypeScript** end-to-end. Các ngôn ngữ khác: syntax fallback chỉ. |
| Agent mode? | Read-only code intelligence trước; coding-agent (patch) chỉ sau security hardening. |

---

## 3. Nguyên tắc thiết kế

1. **Progressive disclosure:** tổng quan → skeleton → body (dòng cụ thể) từng cấp.
2. **Immutable snapshot:** mỗi generation index là boundary bất biến; session pin commit + snapshot.
3. **Token budget cứng:** ngân sách tính runtime theo model thực, không ước lượng chung.
4. **Security-first:** tool args có schema; không concat shell; sandbox; patch validate base hash.
5. **Traceable provenance:** mọi object nguồn trace được đến 1 repository + commit + snapshot + source_file_revision.
6. **Self-learning:** sau khi complete, ingest vào memory KB (mem_ingest_file) và sync.

---

## 4. Ngân sách Token (compute runtime, không bảng cố định)

Số liệu tham khảo (tổng 16,384 khi dùng model 16K):

| Thành phần | Ngân sách (tokens) | Chiến lược |
|---|---|---|
| System Prompt & Tool schemas | ~1,500 | Schema ngắn gọn; dùng tiktoken thực của model. |
| Dynamic Repository Map | ~1,500 | PageRank + binary-search pack. |
| Retrieved Code Context | ~8,000 | 5–8 chunks/skeleton; chỉ đọc body khi cần. |
| Chat History & Scratchpad | ~2,000 | 2–3 lượt + scratchpad; evict trong turn. |
| Output Generation | ~3,384 | Dành cho CoT + sinh patch. |

**Công thức runtime:**

```
available_input_tokens =
    model_context_limit
  - max_output_tokens
  - safety_margin

subtract: system_prompt + tool_definitions + summary/history
         + current_user_message + framing/special_tokens
         + tool_results_must_remain

evidence_budget = available after all above.
```

- Dùng **tokenizer thực** của model đã chọn (tiktoken/runtime endpoint), không dùng ước lượng chung.
- Frame budget theo **n_ctx thực** của model, không cố định.

---

## 5. AST Code Indexing (skeleton vs body)

- **Node cha (Skeleton):** lớp/interface, fields, toàn bộ signatures; ẩn body `{...}`.
- **Node con (Method Body):** nguồn đầy đủ + metadata vị trí + đồ thị phụ thuộc.
- **Thư viện bên:** chỉ trích xuất `.d.ts`/header/interface-signature, không index source toàn bộ.

**Schema zero-fat (ASTCodeChunk):**

```json
{
  "id": "PaymentService#processTransaction",
  "fp": "src/service/PaymentService.java",
  "type": "METHOD",
  "name": "processTransaction",
  "parent_id": "PaymentService",
  "rng": [45, 92],
  "sig": "@Transactional public Receipt processTransaction(OrderDto order)",
  "doc": "Thực hiện trừ tiền, gọi cổng thanh toán và lưu lịch sử.",
  "skeleton": "class PaymentService { ... }",
  "body": "public Receipt processTransaction(...) { ... }",
  "deps": {
    "imports": ["com.app.dto.OrderDto"],
    "calls": ["Validator#validate", "StripeClient#charge"],
    "refs_types": ["OrderDto", "Receipt", "PaymentException"]
  },
  "tokens": { "sig_tokens": 14, "skeleton_tokens": 0, "body_tokens": 420 }
}
```

- **Chỉ ghép chuỗi `[fp]+[sig]+[doc]+[deps.calls]` để embed** (không embed body).
- Giảm nhiễu ngữ nghĩa từ biến cục bộ; tăng tốc index.

---

## 6. Dynamic Repository Map (AST Graph + PageRank)

**Công thức trọng số:**

$$W(A \rightarrow B, s) = \text{Multiplier}(s) \times \sqrt{\text{freq}(A, s)} \times \ln\left(\frac{N}{\text{df}(s) + 1}\right)$$

- `Multiplier(s)`: ×10 nếu xuất hiện trong query; ×2 nếu CamelCase/snake_case len ≥ 8; ×0.2 nếu trong `test/`.
- `df`: số file chứa `s`; làm giảm trọng số cho utilities chung.

**Bước:** xây đồ thị gốc → Personalize vector (file khớp query = 100/len_matched, các file khác = 1/N) → PageRank(alpha=0.85) → chấm điểm chunk → binary-search pack vào 1,500 tokens.

**Đầu ra compact DSL:**

```
[REPOSITORY_MAP (Ranked by PageRank relevance)]
src/config/SecurityConfig.java:
  18-64: public class SecurityConfig
src/controller/PaymentController.java:
  15-95: @RestController public class PaymentController
```

---

## 7. Bộ công cụ Agent (OpenAI Function Calling — ~450 tokens)

| Công cụ | Mô tả | Input chính |
|---|---|---|
| `search_symbols` | Hybrid BM25 + vector, lightweight signature + line range. | `q`, `kind`, `path_filter`, `limit` |
| `get_file_skeleton` | Class structure, fields, signatures (không body). | `fp` |
| `read_code_block` | Đọc dòng cụ thể, max 120 dòng/turns. | `fp`, `start`, `end` |
| `query_call_graph` | CALLERS / CALLEES / IMPLEMENTATIONS. | `symbol_id`, `direction` |

**Điều kiện bổ sung:** mỗi công cụ phải nhận `repository_id`, `commit_id`, `index_snapshot_id` để **pin session** (không để chat di chuyển trung gian).

**Output rút gọn (DSL, không JSON thô):**

```
[FOUND 3 SYMBOLS | BUDGET_USED: 82 tokens]
1. [METHOD] PaymentService#processTransaction | src/service/PaymentService.java:45-92 (body: 420 tok)
   Sig: @Transactional public Receipt processTransaction(OrderDto order)
```

**Kích thước công cụ trả về:** result ID, summary, selected snippets, evidence IDs, truncation flag, next-page cursor.

---

## 8. Scratchpad & Context Eviction

**Định dạng scratchpad bắt buộc trước mỗi tool call:**

```xml
<scratchpad>
- Goal: [1-sentence objective]
- DeadEnds: [file:lines -> ngắn gọn lý do không liên quan]
- Facts: [file:lines -> logic/bug trọng yếu + 1-3 dòng mã]
- Plan: [next tool call + lý do]
</scratchpad>
```

**Công thức ưu tiên evict:**

$$S_{\text{evict}} = (\text{Age\_in\_Turns} \times 200) + \text{Token\_Count} - (\text{Is\_Referenced\_In\_Last\_Thought} \times 1000)$$

- Evict lịch trình (ở vị trí) thành **tombstone** để giữ `tool_call_id`.
- **Miễn trừ:** evidence IDs được tham chiếu rõ ràng trong scratchpad.
- Không xóa code đang dùng; batch evict khi chạm ~75% ngân sách.

---

## 9. Indexing Pipeline (dependency trước semantic)

```text
A. Repo & revision discovery     B. File inventory & immutable revisions
C. Build/module config discovery D. Syntax indexing (Tree-sitter)
E. Dependency & toolchain res.   F. Semantic indexing (compiler/LSP)
G. Graph reconciliation          H. Chunk & embedding
I. Validation                    J. Atomic publication
```

- Syntax-level symbol extraction có thể chạy trước dependency resolution; binding semantic phải sau environment chuẩn bị.
- **Không block** retrieval vì một ngôn ngữ resolver thất bại; publish capability/coverage metadata.

---

## 10. Data Model — Redesign phức quyền (CR-01..CR-06)

### 10.1 Repository / Commit
```text
repository
  └── git_commit (id, repository_id, commit_sha, author, committer, committed_at)
       └── git_commit_parent (commit_id, parent_commit_id, parent_order)
       └── git_ref (repository_id, ref_name, ref_type BRANCH/TAG, target_commit_id, updated_at)
```
- Commit bất biến, có nhiều parent; branch/tag là ref mutable. Session **pin commit + snapshot**, branch chỉ metadata hiển thị.

### 10.2 Source revisions
```text
source_file_revision (id, repository_id, commit_id, relative_path, content_hash,
                      object_path, language, file_type, is_generated, is_binary, line_count)
UNIQUE(commit_id, relative_path)
```
- Path thuộc về 1 revision, không mutable `repository_file`. Đợi rename detection heuristic; không giả định identity vĩnh viễn hoàn hảo.

### 10.3 Code index snapshot
```text
code_index_snapshot (repository_id, commit_id, config_fingerprint, code_model_version,
                     adapter/toolchain manifest, status, diagnostics, created_at)
```
- Tất cả artifacts sau thuộc vào 1 snapshot bất biến:
  `code_symbol`, `symbol_occurrence`, `symbol_occurrence_resolution`, `symbol_relationship`, `relationship_evidence`, `code_chunk`, `dependency_resolution_snapshot`.

### 10.4 Embedding set (tách khỏi snapshot)
```text
embedding_set (code_index_snapshot_id, model_key, model_version, dimensions,
               preprocessing_version, tokenizer_version, chunker_version)
└── code_embedding (embedding_set_id, chunk_id, embedding)
```
- Thay đổi model embedding **không reparse** lại.

### 10.5 Active pointer (ref → snapshot)
```text
repository_ref_index_state (repository_id, ref_name, active_code_index_snapshot_id, generation)
```

### 10.6 Chat session & agent run
```text
chat_session (repository_id, commit_id, pinned_code_index_snapshot_id, model_config_snapshot)

agent_run
  ├── agent_plan (version, objective, acceptance_criteria, status)
  ├── agent_step (step_id, dependency_ids, input/output refs, attempts, status, timestamps)
  ├── agent_state_transition (old_state, new_state, reason, timestamp)
  ├── agent_tool_execution
  ├── retrieval_evidence
  ├── agent_workspace
  ├── change_set
  ├── approval_request (action, scope, proposed_changeset, requested_user, decision, decision_time)
  └── execution_run
```

### 10.7 Composite FK / CHECK invariants
- `code_symbol.parent_id`, `module_id`, `code_chunk.symbol_id`, `relationship_evidence` — cùng ownership snapshot.
- `chat_session.repository_id + commit_id = pinned_code_index_snapshot_id`.
- `dependency_resolution_snapshot.repository_id + commit_id + module_id` cùng bộ.
- CHECK: `start_line <= end_line`; offsets ≥ 0; `confidence ∈ [0,1]`; status được phép; ownership đúng.

---

## 11. Retrieval & Ranking (snapshot-scoped)

- **`code_index_snapshot_id` là primary filter** cho tất cả retrieval.
- Khầy cùng filter: exact symbol, occurrence, graph, lexical, vector.
- Giữ unresolved/approximate results, hiển thị rõ ràng.
- Tách **direct evidence** (proven) khỏi **inferred/heuristic** evidence.
- Build/config + test discovery làm first-class retrieval category.
- Rank exact definition/proven reference trước text tương tự cho symbol questions.
- Graph query: `source_symbol_id = caller`, `target_symbol_id = callee`; **cycle guard**, node cap, snapshot filter, stable ordering; phân biệt static call vs dynamic dispatch.

**Vector query mẫu:**

```sql
SELECT c.id, c.content, c.source_file_revision_id,
       e.embedding <=> :query_embedding AS distance
FROM code_embedding e
JOIN code_chunk c ON c.id = e.chunk_id
JOIN embedding_set es ON es.id = e.embedding_set_id
WHERE es.index_snapshot_id = :index_snapshot_id
  AND es.model_key = :embedding_model_key
ORDER BY e.embedding <=> :query_embedding
LIMIT :candidate_limit;
```
- Benchmark HNSW vs exact prefilter; không giả định single HNSW + WHERE tự đủ filtered.

---

## 12. Trải nghiệm Agent & Patch Protocol

- Chunk code: skeleton/body; tool output nén; scratchpad + eviction (§4–§8).
- **Patch protocol (structured):**
  - workspace_id, base_revision, file path, original content hash, patch/diff, expected new hash.
  - Validate base hash thay đổi, target path, symlinks, patch size, workspace ownership.
  - Apply atomic; reject stale-base patch ngoại trừ deliberate rebase/merge.

---

## 13. Bảo mật & Sandbox

- Tool args: schema + validate type/length/allowed chars/semantic; **không concat shell**.
- Execute fixed executable với argument vector có cấu trúc (`--` separator).
- Từ chối absolute path, `..`, symlink escape, path ngoài workspace.
- Không mount Docker daemon socket; container rootless/non-root; hạn chế capabilities/mounts/processes/memory/CPU/disk.
- Network: permission riêng, allowlist dependency registries.
- Patch: validate base hash/path/symlink/size/ownership; atomic apply; reject stale-base.

---

## 14. Model Capability Matrix (ngôn ngữ)

| Capability | Mô tả |
|---|---|
| syntax parsing | Tree-sitter/native parser. |
| declaration extraction | Signatures / types. |
| local symbol resolution | scope-local. |
| cross-file resolution | thông qua dependency graph. |
| references | exact refs. |
| call graph | static + dynamic candidates. |
| inheritance/implementations | type hierarchy. |
| dependency resolution | declared vs resolved + config. |
| test discovery | map tests ↔ source. |
| confidence & limitations | để Agent biết độ tin cậy. |

Mỗi capability: `SUPPORTED / PARTIAL / UNSUPPORTED / FAILED_FOR_THIS_REVISION`.

---

## 15. Agent State Persistence

- `agent_plan`: objective + acceptance criteria + status.
- `agent_step`: dependency refs + attempts + status + timestamps.
- `agent_state_transition`: old/new state, reason, time.
- `approval_request`: scope + proposed changeset + decision + time.
- Luôn **durable event log** trước khi publish SSE (replay `Last-Event-ID`).
- Bỏ copy payload lớn vào step JSON; chỉ lưu **references**.

---

## 16. Local Deployment (Docker Compose skeleton)

- Indexing worker; semantic worker + native toolchains; build/test sandbox.
- Volume mounts: source + workspace + cache; persistent object store.
- Health checks & readiness; job claiming/recovery; resource limits + log rotation.
- Backup/restore meta + index.
- Redis optional for single-user; PostgreSQL job table with leases + `FOR UPDATE SKIP LOCKED` đủ ban đầu.

---

## 17. API Scope

- Chat/search API **phải nhận pinned `index_snapshot_id`**. Không cho chat nhanh chuyển sang latest branch head giữa một hội thoại.

---

## 18. Tích hợp với SA4E hiện có

- **F2 indexer:** reuse SQLite + Tree-sitter + FTS5 + graph services + incremental hashing + WAL.
- **F4 context assembly:** `get_ai_context`/edit/curated giữ; thêm `query_call_graph` thôi (tránh duplication).
- **context-budget-governance:** wire `BudgetCalculator`/`ThresholdGate`/`tentiser`/tiering; **KHÔNG viết nhiều hơn**.
- **Steering/AGENTS.md:** subject to budget gate (có đúng điểm wire `DefaultResourceLoader`).

---

## 19. Acceptance Criteria (nghiệm thu bắt buộc)

1. Re-index cùng commit với adapter mới không làm hỏng snapshot cũ.
2. Hỗ trợ 2 embedding models cho cùng snapshot mà không trộn vector.
3. Chat pin commit cũ vẫn query sau khi branch di chuyển.
4. Rename file: cả old & new path đúng tại commit tương ứng.
5. Xóa file: vẫn queryable ở commit cũ, không ở commit mới.
6. Index merge commit nhiều parent.
7. Mọi symbol/occurrence/edge/chunk/embedding đều thuộc snapshot yêu cầu.
8. Vector query không trả về chunk từ repo/snapshot khác.
9. Filtered ANN recall + result-count trên multi-snapshot dataset.
10. Semantic re-run sau dependency/classpath thay đổi (source không đổi).
11. Dependency failure không lan sang semantic coverage giả.
12. Resume agent sau restart từ plan/step persist.
13. Patch reject stale base hash hoặc path traversal.
14. Original working tree không đổi trước khi approval.
15. Sandbox không ghi ngoài workspace / không mạng không hạn chế.
16. SSE reconnect + replay không trùng/dư thừa.
17. Đếm prompt/tool thật với tokenizer & dưới ngân sách runtime.

**Cùng SA4E:** không làm mất regression SM full pipeline; build xanh (`tsc`/vitest); không sửa production config trái phép.

---

## 20. Roadmap triển khai

| Phase | Mục tiêu | Phụ thuộc |
|---|---|---|
| 0 | Quyết định scope (SQLite vs Postgres, Java+TS MVP?) | — |
| 1 | CR-01..06: snapshot/revision model + ordering = done. | — |
| 2 | Agent UX: PageRank repo map, skeleton/body, 4 tools, scratchpad/eviction. | phase 1 |
| 3 | Hardening: persistence, security, SSE, API pinned. | phase 2 |
| 4 | Validation: 17 acceptance criteria + token/eviction tests + SA4E regression. | phase 3 |

**Sau khi hoàn tất:** ingest document vào memory (`mem_ingest_file`) và tổng hợp lesson learned nếu có.
