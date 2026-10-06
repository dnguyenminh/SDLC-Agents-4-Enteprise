# Reference Analysis — SA4E-338

**Pattern:** LLM Context Window Management — token budgeting, structural chunking, map-reduce fallback
**Date:** 2026-10-04

## Reference 1: LangChain — map-reduce summarization + SummarizationMiddleware
- URL: https://www.langchain.com/blog/llms-to-improve-documentation , https://github.com/langchain-ai/langchain/blob/master/libs/langchain_v1/langchain/agents/middleware/summarization.py
- Architecture: Split → Map (summarize each group sized to model context window) → Reduce (distill group summaries)
- Key patterns:
  - Map-reduce groups sized theo **context window thực của model** (GPT-3.5-16k, Claude-2 100k) — window phải biết trước
  - `SummarizationMiddleware` trigger theo `ContextFraction` (% of model max input tokens) hoặc `ContextTokens` — **canh ngưỡng trước khi overflow**, không đợi lỗi
  - `keep` policy bảo toàn message quan trọng khi compact
- Strengths: tunable per-group prompts, customizability cao; trigger threshold chủ động
- Trade-off: map-reduce tốn token hơn clustering (~500k vs ~80k) — chấp nhận được vì đây là one-shot enrichment

## Reference 2: context-window-manager (srathish) — budget pipeline
- URL: https://github.com/srathish/context-window-manager
- Architecture: `input_budget = model_context_limit − reserved_output_tokens`; ordered pipeline các reduction strategy
- Key patterns:
  - **Budget tính bằng token thật** (TokenCounter protocol — kể cả Anthropic count_tokens API), KHÔNG word-count
  - Pipeline composable: `compact → sliding → truncate` — strategy nào chạy trước tùy config; mỗi strategy trả về report
  - `PinnedPriority` invariant: nội dung bắt buộc KHÔNG BAO GIỜ bị drop
  - `BudgetError` fail-fast khi mọi strategy không giảm được — có cấu trúc, không im lặng
- Strengths: budget math minh bạch; strategy pipeline thay thế được; pinned = "không cắt logic" của chúng ta

## Reference 3: LlamaIndex — Context Window Optimization + Tree Summarize
- URL: https://www.llamaindex.ai/glossary/context-window-optimization , https://developers.llamaindex.ai/python/framework-api-reference/response_synthesizers/tree_summarize
- Architecture: Shared token budget cho system prompt + history + document + query
- Key patterns:
  - **Strategic chunking**: chunk theo token size + segment boundaries; high-leverage technique nhất
  - Layered: chunk → summarize history → compress system prompt → prioritize chunk gần query nhất
  - `TreeSummarize`: repack chunks lấp đầy window → summarize từng chunk → **recursive summarize các summary** (giảm dần tree)
  - `ChatSummaryMemoryBuffer` thay truncate bằng summarization — không mất information
- Strengths: tree summarization convergent (mỗi reduce step giảm dần token), tránh 1 reduce call quá lớn

## Reference 4: LangChain Context Engineering — compress context
- URL: https://github.com/langchain-ai/context_engineering
- Key patterns:
  - 4 kỹ thuật: Write / Select / **Compress** / Isolate context
  - Compress: token-heavy tool responses được summarize — demo giảm 115k → 60k tokens
  - Isolate: state nằm ngoài LLM context, expose có chọn lọc (tương tự AST digest: giữ structure bên ngoài, expose có kiểm soát)
- Strengths: framework thinking — "cái gì cần vào window, cái gì để ngoài"

## Patterns to adopt trong BRD/FSD/TDD của SA4E-338

- [ ] **Budget math**: `input_budget = context_window − reserved_output_tokens − prompt_overhead` (Ref 2)
- [ ] **Context window discovery động** từ provider + env override + fallback (đã chốt Plan A1; Ref 1 confirm window phải biết trước)
- [ ] **Trigger warning ở ContextFraction** (ví dụ 80% budget) — log/warn trước khi overflow, không đợi lỗi (Ref 1)
- [ ] **Ordered reduction pipeline**: AST digest (structural compress) → map-reduce theo AST sections → fail-fast BudgetError có cấu trúc (Ref 2)
- [ ] **Pinned/protected content**: logic nodes (steps, conditions, expressions) = pinned — KHÔNG BAO GIỜ bị drop; chỉ layout/HTML bulk được aggregated outline (Ref 2 PinnedPriority)
- [ ] **Tree/recursive reduce** khi summary cuối vẫn quá budget (Ref 3 TreeSummarize)
- [ ] **Structural chunking theo AST sections** thay character/token splitting (Ref 3 strategic chunking — boundaries = section/step nodes)
- [ ] **Token counting thật** (TokenBudgetManager.estimateTokens), KHÔNG word-count (Ref 2 TokenCounter protocol)
- [ ] **Report/telemetry** cho biết chunk nào bị compact, bao nhiêu token freed (Ref 2 structured report)
