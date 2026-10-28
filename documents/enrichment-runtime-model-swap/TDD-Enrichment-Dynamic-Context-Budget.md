# TDD — Enrichment với Dynamic Context Budget & Runtime Model Swap

> Phạm vi: backend server, chức năng **enrich LLM cho code symbol**. Mục tiêu: xử lý đúng khi file/symbol cần enrich **lớn hơn context window** của model, trong điều kiện **model có thể bị thay đổi trong runtime**.

---

## 1. Bối cảnh & vấn đề

### 1.1 Enrichment làm gì

Enrichment dùng LLM sinh `summary`, `pseudo_code`, `llm_tags` cho **từng code symbol** (class / function / method / Pega rule / Salesforce metadata), lưu vào bảng `symbols`. Đơn vị công việc là **1 symbol / 1 task `CODE_ENRICHMENT`**, không phải cả file.

Luồng hiện tại (`CodeEnrichmentHandler.enrichSymbol`):

```
parse payload
  → loadSymbolContext(adapter, payload)        // đọc body từ DB
  → selectStrategy(kind, workspaceType)
  → promptBuilder.build(strategy, context)     // capTotalPrompt() cắt tĩnh
  → callLLMWithTimeout(messages)               // llmService.complete()
  → parseEnrichmentResponse(raw, strategy)
  → storeEnrichmentResults(...)
```

### 1.2 Cơ chế chống tràn hiện tại = cắt cụt tĩnh

| Thành phần | File | Giá trị |
|---|---|---|
| Cắt body từng symbol | `CodeEnrichmentPromptBuilder/prompts.ts` | `MAX_BODY_TOKENS = 4000` |
| Cắt tổng prompt | `CodeEnrichmentPromptBuilder/token-budget.ts` → `capTotalPrompt()` | `PROMPT_TOKEN_CAP = 24000` (env `LLM_ENRICH_PROMPT_TOKEN_CAP`) |
| Ước lượng token | `token-budget.ts` → `estimateTokens` | `len / 4` (char-based) |

Khi symbol > budget: `truncateToTokens` cắt prefix + thêm `...` → **phần đuôi của symbol không bao giờ được LLM đọc**. Không chunk, không map-reduce, không pass 2.

### 1.3 Vì sao "model thay runtime" làm vấn đề nghiêm trọng hơn

Mọi giá trị **tĩnh** và mọi config **chụp-một-lần-lúc-khởi-tạo** trở thành bug tiềm ẩn:

1. **`PROMPT_TOKEN_CAP = 24000` cố định, không gắn với model nào.**
   - Swap sang model **8k** → 24000 > 8192 → **tràn context** (`exceed_context_size_error`).
   - Swap sang model **128k** → phí ~80% window, enrich kém chất lượng vì cắt sớm.
2. **`LLMService` chụp `config` + `adapter` trong constructor.** Đổi model runtime nhưng handler vẫn giữ `llmService` cũ với `model`/`maxTokens`/`adapter` cũ.
3. **`ContextWindowDiscovery` có cache theo `modelKey` (tốt) nhưng:**
   - `LLM_CONTEXT_WINDOW` là **env global** → che window thật của *mọi* model. Swap sang model nhỏ vẫn báo window lớn → tràn.
   - Cache module-level **không TTL** → "cùng tên model, nạp lại cấu hình khác" runtime sẽ trả cache cũ.
4. **`ollama-adapter.ts` không set `num_ctx`** → Ollama dùng default window của nó, bất kể model/prompt.
5. **`ReductionPipeline.reduce()` là stub** ("Fail fast for now") → không có đường lui map-reduce khi model nhỏ thay vào.

### 1.4 Nguyên tắc thiết kế

> **Không giả định gì về model lúc khởi tạo. Mọi quyết định budget phải được resolve theo model đang active tại thời điểm gọi (per-call).**

---

## 2. Hạ tầng đã có (cần wire lại, không viết lại)

| File | Trạng thái | Vai trò trong thiết kế mới |
|---|---|---|
| `modules/memory/llm/context-window.ts` — `ContextWindowDiscovery` | Hoàn chỉnh, **không ai gọi** | Resolve `WindowInfo` thật theo provider/model; cache theo `modelKey`; có `invalidateWindowCache()` |
| `engine/enrichment/budget-guard.ts` — `BudgetGuard` | Hoàn chỉnh, **không ai gọi** | `computeInputBudget(window, overhead)`, `check()` trả `BudgetDecision`, cảnh báo ở 80% |
| `modules/memory/llm/chunked-reduce.ts` — `chunkedReduce()` | Hoàn chỉnh, **không ai gọi** | Map-reduce generic với retry/degrade per-chunk |
| `engine/enrichment/reduction-pipeline.ts` — `ReductionPipeline` | **Stub** `reduce()` | Khung map-reduce (bounds `MAX_REDUCE_ROUNDS=3`, `MAX_CHUNKS_PER_RULE=32`) — cần cài đặt thật |
| `engine/context/token-budget-manager.ts` — `TokenBudgetManager.estimateTokens` | Có | Nguồn ước lượng token chuẩn (dùng chung) |

> Toàn bộ mảnh ghép đã nằm sẵn. Công việc chính là **nối dây** và chuyển quyết định từ "construct-time" sang "call-time".

---

## 3. Thiết kế mục tiêu

### 3.1 Sơ đồ luồng mới

```
enrichSymbol(task):
  payload   = parse(task)
  context   = loadSymbolContext(...)          // (3.5) đọc TẤT CẢ chunk, không chỉ chunk 0
  strategy  = selectStrategy(...)

  # --- Resolve theo MODEL ĐANG ACTIVE tại thời điểm này ---
  active    = llmService.resolveActive()        // { provider, model, baseUrl, maxTokens }
  window    = windowProvider.getContextWindow(active)   // WindowInfo (cache theo modelKey)

  # --- Tính budget động ---
  overhead  = estimateTokens(systemPrompt) + SAFETY_MARGIN
  budget    = BudgetGuard.computeInputBudget(window, overhead)   // = ctx - reservedOut - overhead

  # --- Quyết định: fit 1-shot hay map-reduce ---
  decision  = BudgetGuard.check({ digest: context.bodyText, window, promptOverheadTokens: overhead })
  if decision.withinBudget:
      messages = promptBuilder.build(strategy, context, budget)   # (3.4) budget động thay cap tĩnh
      raw      = llmService.complete(messages, active)             # (3.2) truyền model active
  else:
      raw      = mapReduceEnrich(context, strategy, budget, active) # (3.6)

  store(parse(raw))
```

### 3.2 `LLMService` model-aware tại runtime

**Vấn đề:** constructor chụp `config`/`adapter`. **Fix root cause:** tách "model đang active" ra khỏi state đóng băng.

Thêm vào `LLMConfig` (file `modules/memory/llm/types.ts`):

```ts
export interface LLMConfig {
  provider: LLMProvider;
  model: string;
  baseUrl: string;
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;        // output budget (num_predict)
  contextWindow?: number;    // MỚI: input window nếu biết trước (optional, discovery vẫn ưu tiên)
}
```

Thêm API runtime vào `LLMService`:

```ts
/** Trạng thái model hiện tại — đọc tại thời điểm gọi, KHÔNG chụp lúc new. */
resolveActive(): LLMConfig {
  // Ưu tiên: override runtime (setActiveModel) > env hiện tại > defaults
  return { ...this.config };
}

/** Đổi model runtime. Khi provider/model/baseUrl đổi → rebuild adapter + invalidate window cache. */
setActiveModel(next: Partial<LLMConfig>): void {
  const changed =
    next.provider !== undefined && next.provider !== this.config.provider ||
    next.model    !== undefined && next.model    !== this.config.model    ||
    next.baseUrl  !== undefined && next.baseUrl  !== this.config.baseUrl;
  this.config = { ...this.config, ...next };
  if (changed) {
    this.adapter = ADAPTERS[this.config.provider]?.() || new OllamaAdapter();
    this.onModelChanged?.(this.config);   // hook để invalidate window cache (3.3)
  }
}

/** complete() nhận override model cho CHÍNH call này (không đổi state toàn cục). */
async complete(messages: LLMMessage[], override?: Partial<LLMConfig>): Promise<LLMResponse> {
  const cfg = override ? { ...this.config, ...override } : this.config;
  const adapter = override?.provider && override.provider !== this.config.provider
    ? (ADAPTERS[override.provider]?.() || new OllamaAdapter())
    : this.adapter;
  return adapter.complete(messages, cfg);
}
```

> Lưu ý: `callLLMWithTimeout` trong `CodeEnrichmentHandler` phải truyền `active` xuống `complete(messages, active)`.

### 3.3 Window discovery per-call + invalidate khi swap

Bọc `ContextWindowDiscovery` trong một provider cache-aware, **tạo instance theo model active** (không giữ 1 instance cứng):

```ts
// windowProvider.getContextWindow(active)
const disc = new ContextWindowDiscovery(
  active.provider, active.model, active.baseUrl,
  active.maxTokens ?? 800,     // reservedOutputTokens = output budget
);
return disc.getContextWindow();   // cache nội bộ theo `${provider}:${model}:${baseUrl}`
```

`LLMService.onModelChanged` → gọi `disc.invalidateWindowCache()` (hoặc clear theo modelKey).

**Sửa bẫy env global (quan trọng cho runtime swap):** trong `context-window.ts`, `LLM_CONTEXT_WINDOW` đang override **mọi** model. Hai lựa chọn (fix root cause):

- **Khuyến nghị:** bỏ override global, chỉ tin provider discovery + fallback. An toàn tuyệt đối khi swap.
- Hoặc chuyển sang **per-model**: đọc `LLM_CONTEXT_WINDOW__<model>` trước, chỉ fallback `LLM_CONTEXT_WINDOW` khi không có bản per-model. Tránh một model nhỏ bị gán nhầm window lớn.

**TTL cache (chống "cùng tên, khác config"):** thêm `cachedAt` check — nếu `now - cachedAt > WINDOW_CACHE_TTL_MS` thì re-discover. `WindowInfo` đã có field `cachedAt`, chỉ cần dùng.

### 3.4 Prompt builder nhận budget động (bỏ cap tĩnh)

Đổi chữ ký `CodeEnrichmentPromptBuilder.build`:

```ts
build(strategy: EnrichmentStrategy, context: SymbolContext, inputBudget: number): LLMMessage[] {
  const messages = this.buildForStrategy(strategy, context);
  return capTotalPrompt(messages, inputBudget);   // budget truyền vào, KHÔNG dùng PROMPT_TOKEN_CAP tĩnh
}
```

Trong `token-budget.ts`:

- `capTotalPrompt(messages, budget)` — tham số `budget` thay cho hằng số `PROMPT_TOKEN_CAP`. Giữ `PROMPT_TOKEN_CAP` làm **fallback mặc định** chỉ khi caller không truyền (backward-compat).
- `MAX_BODY_TOKENS` tĩnh trong `prompts.ts`: thay bằng budget dẫn xuất từ `inputBudget` (ví dụ dành phần lớn `inputBudget` cho body sau khi trừ các thành phần khác). Có thể truyền `bodyBudget` xuống các `buildXxxUserPrompt`.

> `estimateTokens` giữ char-based `/4` làm mặc định (đồng bộ `TokenBudgetManager`). Có thể nâng cấp tokenizer thật ở bước sau (xem §7).

### 3.5 `loadBodyText` đọc tất cả chunk (sửa mất mát dữ liệu)

Hiện chỉ `WHERE chunk_index = 0`. Map-reduce cần toàn bộ body:

```ts
async function loadBodyText(adapter, symbolId): Promise<string | null> {
  const rows = await adapter.allAsync<{ embedding: Buffer; chunk_index: number }>(
    'SELECT embedding, chunk_index FROM body_embeddings WHERE symbol_id = ? ORDER BY chunk_index',
    [symbolId],
  );
  if (!rows.length) return null;
  return rows.map(r => Buffer.from(r.embedding).toString('utf-8')).join('');
}
```

> Với symbol nhỏ (1 chunk) hành vi không đổi. Với symbol lớn, `context.bodyText` giờ là full body để chia chunk đúng.

### 3.6 Map-reduce thật (thay stub) — path khi vượt budget

Cài đặt `ReductionPipeline.reduce()` (hoặc 1 orchestrator mới dùng `chunkedReduce`):

```
mapReduceEnrich(context, strategy, budget, active):
  chunks = splitByBudget(context.bodyText, perChunkBudget)   # perChunkBudget ≤ budget
  guard  = chunks.length > MAX_CHUNKS_PER_RULE → BudgetError (log rõ, KHÔNG fail silently)

  # MAP: mỗi chunk → partial summary
  partials = chunkedReduce({
    chunks,
    mapFn:  chunk => llmService.complete(buildChunkPrompt(strategy, chunk, budget), active),
    mergeFn: results => results,           # giữ danh sách để reduce
    maxRetriesPerChunk: 2,
    onChunkFailure: () => 'degrade',       # chunk fail → bỏ qua, không chặn toàn bộ (UX rule)
  })

  # REDUCE: gộp partial → 1 summary cuối, tối đa MAX_REDUCE_ROUNDS vòng
  round = 0
  while estimateTokens(join(partials)) > budget and round < MAX_REDUCE_ROUNDS:
    partials = regroup(partials) rồi reduce từng nhóm qua LLM
    round++

  if estimateTokens(join(partials)) > budget:   # vẫn không vừa
     log BudgetError(report) ; return best-effort summary từ vòng cuối
  return finalReduce(partials, strategy, active)
```

Tận dụng sẵn: `chunkedReduce` (retry/degrade), `ReductionPipeline.MAX_REDUCE_ROUNDS/MAX_CHUNKS_PER_RULE`, `BudgetGuard.check` cho mỗi vòng, `MapReduceReport` để log.

### 3.7 Ollama set `num_ctx` theo window đã resolve

Trong `ollama-adapter.ts`, thêm `num_ctx` vào `options` khi biết window:

```ts
options: {
  temperature: config.temperature ?? 0.3,
  num_predict: config.maxTokens ?? 200,
  ...(config.contextWindow ? { num_ctx: config.contextWindow } : {}),
}
```

> Giúp Ollama nạp đúng window của model mới sau swap, thay vì default. `config.contextWindow` được set từ `WindowInfo` đã discover ở §3.3.

---

## 4. Thay đổi theo file (checklist implement)

| # | File | Thay đổi | Mức rủi ro |
|---|---|---|---|
| 1 | `modules/memory/llm/types.ts` | Thêm `contextWindow?` vào `LLMConfig` | Thấp |
| 2 | `modules/memory/llm/LLMService.ts` | `resolveActive()`, `setActiveModel()`, `complete(messages, override?)`, hook `onModelChanged` | Trung bình |
| 3 | `modules/memory/llm/context-window.ts` | Env override **per-model** (hoặc bỏ global); dùng TTL với `cachedAt` | Trung bình |
| 4 | `modules/memory/llm/ollama-adapter.ts` | Set `num_ctx` từ `config.contextWindow` | Thấp |
| 5 | `engine/enrichment/symbol-context-loader.ts` | `loadBodyText` đọc **tất cả** chunk theo `chunk_index` | Trung bình (ảnh hưởng data vào prompt) |
| 6 | `engine/enrichment/CodeEnrichmentPromptBuilder.ts` | `build(strategy, context, inputBudget)` | Trung bình |
| 7 | `engine/enrichment/CodeEnrichmentPromptBuilder/token-budget.ts` | `capTotalPrompt(messages, budget)`; `PROMPT_TOKEN_CAP` chỉ còn fallback | Trung bình |
| 8 | `engine/enrichment/CodeEnrichmentPromptBuilder/prompts.ts` | `MAX_BODY_TOKENS` → `bodyBudget` truyền vào | Trung bình |
| 9 | `engine/enrichment/reduction-pipeline.ts` | Cài đặt map-reduce thật thay stub (dùng `chunkedReduce`) | Cao |
| 10 | `engine/enrichment/CodeEnrichmentHandler.ts` | Resolve `active`+`window`+`budget` per-call; route 1-shot vs map-reduce; truyền `active` xuống `complete` | Cao |

---

## 5. Hành vi khi model swap runtime (ma trận)

| Tình huống | Hành vi cũ | Hành vi mới |
|---|---|---|
| Swap 32k → **8k**, symbol 20k token | Gửi prompt ~24k → **tràn / lỗi API** | Discovery thấy 8k → budget nhỏ → **map-reduce**, phủ toàn bộ symbol |
| Swap 32k → **128k**, symbol 60k token | Cắt còn ~24k → mất 60% nội dung | Budget ~128k → **1-shot full body**, chất lượng cao |
| Swap nhưng `LLM_CONTEXT_WINDOW` đang set global | Mọi model dùng window đó → sai | Env **per-model** / bỏ → dùng window thật của model mới |
| Swap sang model cùng tên, config khác | Trả **cache cũ** → sai | TTL hết hạn → **re-discover** |
| Symbol > `MAX_CHUNKS_PER_RULE` chunk | Cắt âm thầm | `BudgetError` + **log rõ** (UX rule), trả best-effort |

---

## 6. Test plan

**Unit**
- `BudgetGuard.computeInputBudget`: ctx=8192, reserved=2048, overhead=500 → 5644; non-positive → `non_positive_budget`.
- `capTotalPrompt(messages, budget)`: tổng ≤ budget giữ nguyên; vượt → chỉ cắt `user`, giữ `system`.
- `loadBodyText`: nhiều chunk → nối đúng thứ tự `chunk_index`; 1 chunk → không đổi.
- `context-window.ts`: env per-model override đúng model; TTL hết hạn → re-discover (mock fetch); provider fail → fallback 8192.

**Integration (fake LLMService + in-memory SQLite)**
- Symbol vừa budget → đúng 1 lần `complete`.
- Symbol vượt budget → đi map-reduce, số `complete` = số chunk + số reduce round, kết quả gộp hợp lệ.
- `setActiveModel` đổi provider → adapter rebuild + window cache invalidate (spy `invalidateWindowCache`).

**Property / regression**
- Với mọi body size & mọi window ∈ {8k,32k,128k}: prompt gửi đi **luôn ≤ budget** (không bao giờ tràn).
- Model swap giữa 2 lần enrich liên tiếp → lần 2 dùng window của model mới (không dùng lại budget cũ).

**Edge**
- `num_ctx` được set đúng cho Ollama sau swap.
- Chunk fail giữa chừng → `degrade`, pipeline không chặn, log entry xuất hiện.

---

## 7. Mở rộng tương lai (không bắt buộc đợt này)

- **Tokenizer thật** thay `len/4` (tiktoken / model-specific) cho biên an toàn với CJK/dense JSON.
- **Context chain** giữa các chunk (đã có `ContextChainInput` trong `types.ts`) để partial summary sau biết ngữ cảnh partial trước.
- **Metric**: log `windowSource` (env/provider/fallback), `budgetUtilization`, số chunk, số reduce round vào analytics để theo dõi chất lượng enrichment theo model.

---

## 8. Rủi ro & lưu ý

- **`loadBodyText` đổi sang đọc full** làm prompt dài hơn trước cho symbol lớn → bắt buộc đi kèm budget động + map-reduce, nếu không sẽ tràn. Hai thay đổi này phải **vào cùng nhau**.
- **`ReductionPipeline` cài đặt thật là phần rủi ro cao nhất** — cần test kỹ bounds (`MAX_REDUCE_ROUNDS`, `MAX_CHUNKS_PER_RULE`) và đường `budget_error`.
- Giữ `PROMPT_TOKEN_CAP` làm **fallback** để không vỡ các caller chưa kịp truyền budget trong giai đoạn chuyển tiếp.
- Tuân thủ **no-workaround**: không catch-nuốt lỗi tràn rồi trả rỗng; mọi `budget_error` phải log có thông tin cho downstream.
```
