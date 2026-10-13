# Các Chiến Lược Compact Context Cho Local LLM (32K/65K)

Khi làm việc với các local LLM có context window giới hạn (32K/65K) cho tính năng code review toàn bộ workspace, việc nạp toàn bộ mã nguồn là bất khả thi. Hệ thống cần chuyển sang kiến trúc "cung cấp theo độ phân giải đa cấp" (multi-resolution context) và tư duy Agentic.

Dưới đây là 5 chiến lược hiệu quả nhất:

## 1. Code Skeletonization (Trích xuất khung AST)
Sử dụng công cụ phân tích cú pháp (như Tree-sitter) để parse toàn bộ project thành một bộ khung (skeleton).
*   **Giữ lại:** Tên class, interface, method signatures, tham số (types), imports, và docstrings.
*   **Cắt bỏ:** Toàn bộ phần implementation (method body), comment rác, hoặc biến cục bộ.
*   **Lợi ích:** LLM nắm được toàn bộ bức tranh kiến trúc, pattern, và dependencies mà không bị tràn context.

## 2. Agentic Context Loading (Lazy Loading qua Tools/MCP)
Biến LLM thành một Agent có khả năng chủ động tìm kiếm thay vì nhồi nhét dữ liệu từ đầu.
*   **Bước 1:** Chỉ nạp vào context **Project Map** (Cấu trúc thư mục) và một bản đồ tóm tắt chức năng.
*   **Bước 2:** Cung cấp cho LLM các tools (thông qua function calling hoặc MCP Server) như `read_file(path)`, `read_method(class, method)`.
*   **Bước 3:** LLM tự đọc Project Map, suy luận xem cần review file nào, và chủ động gọi tool để kéo nội dung chi tiết của file đó.

## 3. Contextual RAG (Truy xuất mã nguồn kết hợp)
Sử dụng RAG nhưng tối ưu riêng cho code (không chunking theo số lượng ký tự thông thường).
*   **Semantic Chunking:** Chunking theo cấp độ AST (từng method hoặc từng class riêng biệt) để giữ nguyên vẹn logic.
*   **Hybrid Search:** Kết hợp BM25 (để tìm kiếm chính xác keyword, tên biến/hàm) và Vector Search (để tìm các logic tương đồng).
*   Hệ thống RAG sẽ chỉ bốc đúng top-K chunk code liên quan nhất nhồi vào context 32K/65K.

## 4. Call Graph & Dependency Pruning (Cắt tỉa đồ thị phụ thuộc)
Khi review một luồng dữ liệu hoặc chức năng cụ thể, LLM không cần biết các module khác.
*   Dùng các công cụ phân tích tĩnh (Static Analysis) để xây dựng **Call Graph**.
*   Khi cần review một service, hệ thống chỉ lấy code của service đó và các dependency trực tiếp ở mức Depth = 1.
*   Loại bỏ hoàn toàn các thư viện Utils, Configs hoặc các nhánh rẽ nhánh không liên quan.

## 5. Multi-Agent Map-Reduce (Review đa cấp)
Sử dụng kiến trúc đa tác vụ để chia để trị các workspace khổng lồ.
*   **Map Phase:** Cho một Agent nhỏ/nhanh đọc từng file/module độc lập và sinh ra một bản báo cáo tóm tắt (lỗ hổng, code smell, logic chính).
*   **Reduce Phase:** Tổng hợp các bản tóm tắt này (chiếm rất ít token) đưa vào context của **Main Reviewer Agent** để đưa ra nhận xét kiến trúc cuối cùng.

---

## Sơ đồ Kiến trúc Đề xuất

> **TA note (2026-10-13):** Mermaid vi phạm quy tắc dự án "Draw.io Only — Never Mermaid" (đã bị loại khỏi TDD v1.1 vì lý do tương tự). Đã thay bằng draw.io XML bên dưới. Mapping so với Mermaid gốc: "Agentic Fallback" = node `Filesystem MCP` (viền vàng) + 2 cạnh nét đứt.

```xml
<mxfile>
  <diagram name="Context Compaction Architecture">
    <mxGraphModel dx="1100" dy="900" grid="1" gridSize="10" page="1" pageWidth="1100" pageHeight="900">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
        <mxCell id="user" value="User Request: Review Workspace" style="ellipse;whiteSpace=wrap;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="1">
          <mxGeometry x="390" y="20" width="240" height="50" as="geometry" />
        </mxCell>
        <mxCell id="api" value="Chatbox API" style="rounded=1;whiteSpace=wrap;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1">
          <mxGeometry x="410" y="110" width="200" height="50" as="geometry" />
        </mxCell>
        <mxCell id="route" value="Compaction Strategy Router" style="rhombus;whiteSpace=wrap;fillColor=#ffe6cc;strokeColor=#d79b00;" vertex="1" parent="1">
          <mxGeometry x="390" y="200" width="240" height="90" as="geometry" />
        </mxCell>
        <mxCell id="ws" value="Local Workspace" style="shape=cylinder3;whiteSpace=wrap;fillColor=#e1d5e7;strokeColor=#9673a6;" vertex="1" parent="1">
          <mxGeometry x="20" y="40" width="160" height="70" as="geometry" />
        </mxCell>
        <mxCell id="parse" value="Tree-sitter AST Parse (strip method bodies)" style="whiteSpace=wrap;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1">
          <mxGeometry x="20" y="170" width="160" height="50" as="geometry" />
        </mxCell>
        <mxCell id="skel" value="Code Skeleton" style="whiteSpace=wrap;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1">
          <mxGeometry x="20" y="270" width="160" height="40" as="geometry" />
        </mxCell>
        <mxCell id="cg" value="Call Graph Pruning (depth 1)" style="whiteSpace=wrap;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1">
          <mxGeometry x="20" y="360" width="160" height="40" as="geometry" />
        </mxCell>
        <mxCell id="ragdb" value="FTS5 + Vector Index (RAG)" style="shape=cylinder3;whiteSpace=wrap;fillColor=#e1d5e7;strokeColor=#9673a6;" vertex="1" parent="1">
          <mxGeometry x="20" y="450" width="160" height="60" as="geometry" />
        </mxCell>
        <mxCell id="chunks" value="Top-K Relevant Chunks" style="whiteSpace=wrap;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1">
          <mxGeometry x="20" y="560" width="160" height="40" as="geometry" />
        </mxCell>
        <mxCell id="map" value="Project Map (get_workspace_info)" style="whiteSpace=wrap;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1">
          <mxGeometry x="230" y="360" width="180" height="40" as="geometry" />
        </mxCell>
        <mxCell id="asm" value="Context Assembler + Budget Gate (BR-09)" style="rounded=1;whiteSpace=wrap;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1">
          <mxGeometry x="640" y="300" width="220" height="60" as="geometry" />
        </mxCell>
        <mxCell id="llm" value="Local LLM 32K / 65K" style="ellipse;whiteSpace=wrap;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="1">
          <mxGeometry x="670" y="420" width="160" height="60" as="geometry" />
        </mxCell>
        <mxCell id="resp" value="Review Output" style="ellipse;whiteSpace=wrap;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="1">
          <mxGeometry x="670" y="540" width="160" height="40" as="geometry" />
        </mxCell>
        <mxCell id="mcp" value="Filesystem MCP: read_file / read_method" style="whiteSpace=wrap;fillColor=#fff2cc;strokeColor=#d6b656;" vertex="1" parent="1">
          <mxGeometry x="380" y="620" width="220" height="50" as="geometry" />
        </mxCell>
        <mxCell id="e1" style="edgeStyle=orthogonalEdgeStyle;rounded=1;" edge="1" parent="1" source="user" target="api"><mxGeometry relative="1" as="geometry" /></mxCell>
        <mxCell id="e2" style="edgeStyle=orthogonalEdgeStyle;rounded=1;" edge="1" parent="1" source="api" target="route"><mxGeometry relative="1" as="geometry" /></mxCell>
        <mxCell id="e3" value="Parse" style="edgeStyle=orthogonalEdgeStyle;rounded=1;" edge="1" parent="1" source="ws" target="parse"><mxGeometry relative="1" as="geometry" /></mxCell>
        <mxCell id="e4" value="Static Analysis" style="edgeStyle=orthogonalEdgeStyle;rounded=1;" edge="1" parent="1" source="ws" target="cg"><mxGeometry relative="1" as="geometry" /></mxCell>
        <mxCell id="e5" value="Chunk + Embed" style="edgeStyle=orthogonalEdgeStyle;rounded=1;" edge="1" parent="1" source="ws" target="ragdb"><mxGeometry relative="1" as="geometry" /></mxCell>
        <mxCell id="e6" style="edgeStyle=orthogonalEdgeStyle;rounded=1;" edge="1" parent="1" source="parse" target="skel"><mxGeometry relative="1" as="geometry" /></mxCell>
        <mxCell id="e7" value="Top-K" style="edgeStyle=orthogonalEdgeStyle;rounded=1;" edge="1" parent="1" source="ragdb" target="chunks"><mxGeometry relative="1" as="geometry" /></mxCell>
        <mxCell id="e8" value="Architectural Review" style="edgeStyle=orthogonalEdgeStyle;rounded=1;" edge="1" parent="1" source="route" target="skel"><mxGeometry relative="1" as="geometry" /></mxCell>
        <mxCell id="e9" value="Specific Feature" style="edgeStyle=orthogonalEdgeStyle;rounded=1;" edge="1" parent="1" source="route" target="cg"><mxGeometry relative="1" as="geometry" /></mxCell>
        <mxCell id="e10" value="General Query" style="edgeStyle=orthogonalEdgeStyle;rounded=1;" edge="1" parent="1" source="route" target="chunks"><mxGeometry relative="1" as="geometry" /></mxCell>
        <mxCell id="e11" value="Agentic Loading" style="edgeStyle=orthogonalEdgeStyle;rounded=1;dashed=1;" edge="1" parent="1" source="route" target="map"><mxGeometry relative="1" as="geometry" /></mxCell>
        <mxCell id="e12" style="edgeStyle=orthogonalEdgeStyle;rounded=1;" edge="1" parent="1" source="skel" target="asm"><mxGeometry relative="1" as="geometry" /></mxCell>
        <mxCell id="e13" style="edgeStyle=orthogonalEdgeStyle;rounded=1;" edge="1" parent="1" source="cg" target="asm"><mxGeometry relative="1" as="geometry" /></mxCell>
        <mxCell id="e14" style="edgeStyle=orthogonalEdgeStyle;rounded=1;" edge="1" parent="1" source="chunks" target="asm"><mxGeometry relative="1" as="geometry" /></mxCell>
        <mxCell id="e15" style="edgeStyle=orthogonalEdgeStyle;rounded=1;" edge="1" parent="1" source="map" target="mcp"><mxGeometry relative="1" as="geometry" /></mxCell>
        <mxCell id="e16" value="within budget" style="edgeStyle=orthogonalEdgeStyle;rounded=1;" edge="1" parent="1" source="asm" target="llm"><mxGeometry relative="1" as="geometry" /></mxCell>
        <mxCell id="e17" style="edgeStyle=orthogonalEdgeStyle;rounded=1;" edge="1" parent="1" source="llm" target="resp"><mxGeometry relative="1" as="geometry" /></mxCell>
        <mxCell id="e18" value="tool call" style="edgeStyle=orthogonalEdgeStyle;rounded=1;dashed=1;strokeColor=#9673a6;" edge="1" parent="1" source="llm" target="mcp"><mxGeometry relative="1" as="geometry" /></mxCell>
        <mxCell id="e19" value="result" style="edgeStyle=orthogonalEdgeStyle;rounded=1;dashed=1;strokeColor=#9673a6;" edge="1" parent="1" source="mcp" target="asm"><mxGeometry relative="1" as="geometry" /></mxCell>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
```

> **Gợi ý triển khai:** Kết hợp **Code Skeletonization** + **Agentic Context Loading** là chiến lược tối ưu nhất để bắt đầu. Nạp skeleton vào chunk ~15K token để LLM hiểu kiến trúc, và để dư ~40K token cho LLM chủ động gọi tool kéo các file cần thiết.

---

## TA Review — Đối chiếu SA4E-355 (TDD v1.3) & Corrections

<!-- TA enrichment (2026-10-13): phần dưới do TA agent bổ sung khi review proposal. Nội dung gốc phía trên được giữ nguyên. -->

### T1. Đối chiếu với SA4E-355 đã implement

SA4E-355 (TDD v1.3, Phase 6 PASS — 285 test files / 2,748 tests) là **governance plane**: quyết định "bao nhiêu token" được nạp. Proposal này là **content plane**: quyết định "cái gì" được nạp. Hai mặt **bổ sung cho nhau, KHÔNG trùng lặp** — nhưng mọi cơ chế trong proposal PHẢI vận hành BÊN TRONG budget của SA4E-355 (BR-01..BR-09), không thay thế.

| Cơ chế SA4E-355 (đã ship) | Liên quan proposal | Đánh giá |
|---|---|---|
| Budget resolver BR-01/02/03 (usable = nCtx − reserveOutput − 8% margin; split 70/30) | Token math "skeleton ~15K + dư ~40K" (Gợi ý triển khai) | ⚠️ Sai số — phải route qua `resolveContextBudget` (xem T2) |
| compressPrompt (UC-03, BR-15 non-worsening) | (proposal không đề xuất lại compression) | Đã có — skeleton/RAG output vẫn chịu compress khi cần |
| Tool loadout + schema cap + lean loadout (UC-04, BR-06) | Strategy 2 (cung cấp tools cho LLM) | Một phần: core tools + `get_workspace_info` đã luôn có sẵn; `read_method` là mới |
| Budget gate 3 điểm: turn-start legacy (auto-chunk), turn-start session (escalation ladder BR-08), intra-turn `streamFn` (TDD §13) | Strategy 2 (lazy loading → nhiều tool result) | Bổ sung: gate #3 + transcript compaction hấp thụ tăng trưởng intra-turn |
| Transcript compaction (trim-oldest tool-unit atomic, pin newest user — v1.3 `c11f461`) | Hệ quả tất yếu của agentic loading | Bổ sung trực tiếp — tool result lớn bị compress/drop an toàn |
| TurnBudgetGuard (4× identical tool+args → steer → abort) | Rủi ro tool-call loop của Strategy 2 | Bổ sung — anti-livelock đã có sẵn |
| Auto-split chunking (auto-chunk input prompt của 1 turn) | Strategy 5 (map-reduce) | Khác bản chất: auto-chunk chia INPUT; map-reduce chia WORKSPACE qua sub-agents → **mới** |

### T2. Correction bắt buộc — token math

Con số "skeleton ~15K + dư ~40K cho tool calls" tính trên **gross window**, bỏ qua reserve + safety margin (BR-02):

| n_ctx | reserveOutput | margin 8% | usable | staticBudget (70%) | historyBudget (30%) |
|---|---|---|---|---|---|
| 32,768 (qwen) | 2,048 | 2,622 | 28,098 | 19,668 | 8,430 |
| 65,536 | 2,048 | 5,243 | 58,245 | 40,771 | 17,474 |

- Tại 32k: skeleton 15K chiếm **76% staticBudget** → chỉ còn ~4.7K cho steering + tool schemas → bắt buộc lean loadout hoặc skeleton nhỏ hơn. **Skeleton phải budget-aware: target ≤ 70% staticBudget (~13.8K @32k), KHÔNG cố định 15K.**
- Tại 65k: "dư ~40K cho tool calls" không đúng theo kế toán SA4E-355 — tool results tiêu **historyBudget 17,474** (chịu intra-turn compaction kéo dài hiệu dụng); static còn ~25.7K sau skeleton.
- Mọi skeleton/chunk PHẢI đo bằng `estimateTokenCount` và đo gate bằng `BudgetCalculator.calculateBudget` trước `createAgentSession`; persisting overflow → REJECT `PI_CONTEXT_BUDGET_EXCEEDED` (BR-09).

### T3. Đối chiếu với codebase — nền tảng đã có

| Thành phần cần cho proposal | Đã có sẵn tại | Trạng thái |
|---|---|---|
| AST parse (Strategy 1) | `backend/src/engine/parsers/tree-sitter-indexer.ts` + 16 grammar `.wasm` bundle (ts, js, py, go, java, kotlin, c, cpp, c#, php, ruby, rust, scala, swift, apex, jsp) + deps `tree-sitter`/`web-tree-sitter` đã có | ✅ Có — **KHÔNG cần dependency Tree-sitter mới** |
| Trích signatures (Strategy 1) | `backend/src/engine/parsers/signature-extractor.ts` (regex multi-language — fallback cho grammar thiếu, vd Svelte) + bảng `symbols` (name, kind, signature, startLine, endLine, docComment) | ✅ Có |
| Skeleton renderer | `extension/src/pi-agent/context-retrieval/symbol-outline-extractor.ts` — `extractOutline(file, symbols, maxTokens)` | ✅ Có — dormant (tests-only) |
| Project Map (Strategy 2) | `extension/src/pi-workflow/workspace-info-tool.ts` — `get_workspace_info` (layout cached 60s), luôn trong toolset qua `pi-coding-tools.ts` | ✅ Wired production |
| Tool supply (Strategy 2) | BR-06 core tools + `find_tools` → `code_search` / `mem_search` / `execute_dynamic_tool` | ✅ Wired; thiếu `read_method(class, method)` |
| RAG hybrid (Strategy 3) | `mem_search` BM25+vector+graph; `code_search` FTS5; `engine/context/rrf-merger.ts` + `curated-context-service.ts` (KSA-160: NL query → parallel search → RRF → budget allocation); `EmbeddingService` | ✅ Backend đủ; extension `McpSearchProvider` gọi được; **pipeline `ContextRetriever` đã build + test nhưng KHÔNG wire vào chat path** |
| Routing theo loại review | `extension/src/pi-agent/query-router.ts` (intent classification) | ✅ Có — dùng làm Router, KHÔNG viết router mới |
| Call graph (Strategy 4) | `engine/graph/` + analyzers (`HotPathAnalyzer`, `CircularDepDetector`, `ModuleSummarizer`, `dependency-resolver.ts`) | ⚠️ Một phần — chất lượng call-edge cho TS/JS chưa được chứng minh cho mục đích review |
| Map-Reduce (Strategy 5) | `extension/src/pi-agent/map-reduce/` — `MapReduceOrchestrator` + `TaskDecomposer` + `CircuitBreaker` (SEC-327-01) + `p-limit` + `withTimeout` | ✅ Đã build + test — dormant, chưa wire |

### T4. Đánh giá 5 chiến lược

| # | Chiến lược | Trạng thái vs hiện trạng | Effort | Giá trị cho "review toàn bộ workspace trên 32K/65K" | Rủi ro chính |
|---|---|---|---|---|---|
| 1 | Skeletonization | Mới (nền có đủ, chưa wire) | TB ~2-3 ngày: skeleton renderer budget-aware + inject static context qua `createHost` overrides | CAO — architectural review toàn workspace | Skeleton size biến động theo workspace → bắt buộc truncation theo module priority; grammar thiếu (Svelte) → regex fallback |
| 2 | Agentic Loading | **Đã có phần lớn** | THẤP ~1-2 ngày: thêm `read_method` (từ symbols startLine/endLine) + map chức năng từ `SummaryTreeBuilder` (dormant) | CAO | Tool-call loop → TurnBudgetGuard đã che; tool result growth → §13 compaction đã che |
| 3 | Contextual RAG | Nền tảng đầy đủ, **chưa wire** (`ContextRetriever` tests-only) | TB ~3-5 ngày: wire retrieval pre-turn + RRF + đo gate | TB-CAO cho review theo query cụ thể | Latency hybrid (embedding round-trip); index stale; chunk không liên quan |
| 4 | Call Graph Pruning | Một phần (graph engine có, edge chất lượng chưa chứng minh) | CAO ~5-8 ngày | TB — chỉ hợp use case "review 1 luồng/feature", KHÔNG phải whole-workspace review | Edge coverage sai → prune mất code liên quan → review sót lỗi |
| 5 | Map-Reduce | Orchestrator đã build, chưa wire | TB-CAO ~5 ngày + chi phí sub-agent sessions | CAO chỉ khi workspace rất lớn (skeleton > staticBudget); **overkill cho workspace nhỏ/vừa** | Summary mất chi tiết code → chất lượng review thấp hơn skeleton + targeted reads; mỗi sub-agent tiêu thêm tokens |

### T5. Thiếu trong doc — bổ sung bắt buộc trước khi promote thành BRD/FSD

1. **Success metrics (định lượng):**
   - Turn-1 review trên qwen 32k: 0 × `exceed_context_size_error` (kế thừa BR-09).
   - Skeleton coverage ≥ 95% exported symbols (đối chiếu bảng `symbols`).
   - Skeleton tokens ≤ 70% staticBudget (~13.8K @32k).
   - Retrieval hit-rate ≥ 80% top-5 trên golden query set; p95 latency FTS5 ≤ 300ms, hybrid ≤ 1.5s.
   - Findings parity ≥ 80% so với baseline full-read trên subset 10 files.
2. **Failure modes & mitigation:**
   - Index stale → mtime check + re-index on-demand (guardrail "code-index freshness").
   - Ngôn ngữ không có grammar (Svelte...) → regex fallback `signature-extractor` / raw head-of-file.
   - Skeleton vượt staticBudget → truncation theo module priority (dùng metrics từ `ModuleSummarizer`).
   - Retrieval rỗng/kém → fallback workspace map + steer LLM dùng `find_tools`/`read_method`.
   - Tool-call loop đọc lặp file → TurnBudgetGuard (4× identical → steer → abort) — đã có.
   - Compaction cắt tool result cần thiết → pin rule + atomic tool-unit (v1.3) + `read_method` giảm kích thước result ngay từ đầu.
3. **Tích hợp budget gate (3 điểm thực thi):** mọi assembled content là static context → đo bằng `BudgetCalculator` tại turn-start gate (điểm #2, `createHost`); lazy-load tool calls → gate intra-turn (điểm #3, §13 `streamFn`); sub-agents map-reduce → mỗi sub-session tự qua cả 3 điểm gate; Router = `QueryRouter` hiện có (no-workaround rule: không viết router mới).
4. **Traceability:** doc chưa tham chiếu SA4E-355 — phải ghi rõ quan hệ bổ sung (governance vs content plane) + ticket kế tiếp (đề xuất SA4E-358).
5. **Mermaid → draw.io:** quy tắc dự án "Draw.io Only — Never Mermaid" — đã thay ở phần Sơ đồ bên trên.

### T6. Roadmap ưu tiên (đề xuất cho SM)

| Ưu tiên | Scope | Ticket đề xuất | Tiền điều kiện |
|---|---|---|---|
| **P1** | Strategy 2 completion (`read_method`, functional map) + Strategy 1 (budget-aware skeleton inject static context) | **SA4E-358** | code-intel index fresh; wire qua `createHost` overrides; đo gate trước `createAgentSession` |
| **P2** | Strategy 3: wire `ContextRetriever` (McpSearchProvider → RRF) pre-turn cho review theo query | SA4E-359 | P1 đo xong hit-rate baseline |
| **P3** | Strategy 5: wire `MapReduceOrchestrator` khi workspace lớn (skeleton > staticBudget hoặc vượt ngưỡng file count) | SA4E-360 | Metrics P1/P2 chứng minh skeleton + targeted reads chưa đủ |
| **P4** | Strategy 4 (call-graph pruning depth=1) | Defer | Chỉ mở khi có yêu cầu feature-flow review riêng |

### Verdict cho SM

- **Hướng đề xuất ĐÚNG và bổ sung (không trùng) SA4E-355**: SA4E-355 = governance plane ("bao nhiêu token"), proposal = content plane ("cái gì vào context").
- **Doc hiện tại CHƯA đủ điều kiện promote** thành BRD/FSD: cần sửa token math (T2), bổ sung metrics + failure modes + integration (T5); Mermaid đã sửa.
- **Khuyến nghị**: tạo **SA4E-358 scope P1** (Skeletonization + Agentic Loading completion) — giá trị cao nhất, effort thấp nhất, tận dụng ~80% nền tảng có sẵn; P2/P3 quyết định bằng metrics đo được; P4 defer. KHÔNG duyệt triển khai Strategy 5 ở bước đầu (over-engineering cho use case hiện tại); KHÔNG yêu cầu dependency Tree-sitter mới (đã bundle ở backend).
