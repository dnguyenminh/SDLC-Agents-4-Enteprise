# User Guide — SA4E-324: Pi Context Budget + Model Registry

> Epic SA4E-289 — Pi SDK small-model support. Module: `extension/src/pi-agent/`

## 1. Tính năng

- **Model Registry**: đăng ký metadata cho các model nhỏ-context (contextWindow, maxOutput, costPer1k, speed, thinkingMap) tại `model-registry.ts`. Seed sẵn: `gpt-4o-mini`, `gpt-4o`, `claude-3`, `claude-3-opus`, `phi-3-mini` (2k), `smollm2-360m` (1k), `llama3.1` (8k), `qwen2.5-coder`, `local-model` (lmstudio).
- **Context Budget Check**: ước tính token trước khi tạo session theo công thức `system (chars/4) + toolSchema + retrieval + history + reserve 2000`. Vượt **95%** contextWindow → **REJECT** (throw `ContextBudgetError`), vượt **85%** → **WARN** (vẫn tạo session), còn lại → ALLOW.
- **thinkingLevel → maxTokens**: map `low/medium/high` sang maxTokens per model, luôn ≤ `maxOutput` của model (BR-08).
- **Diagnostics**: budget + quyết định + fallback được lưu vào `session.diagnostics` và log qua `logger`.

## 2. Cách dùng

```ts
import { SessionConfigurator } from './pi-agent/session-configurator';

// Tạo session có budget gate (REJECT sẽ throw ContextBudgetError)
const session = SessionConfigurator.createAgentSession(sdk, cwd, {
  model: 'phi-3-mini',
  thinkingLevel: 'medium',
  contextBudget: {
    systemPromptChars: 7500,   // ~1875 tokens (1 token ~ 4 chars)
    toolSchemaTokens: 500,
    retrievalTokens: 300,
    historyTokens: 200,
    // reserveTokens mặc định 2000 (tối thiểu bắt buộc)
  },
});

// API tiện ích
SessionConfigurator.getModelMetadata('phi-3-mini'); // -> { contextWindow: 2048, maxOutput: 512, ... }
SessionConfigurator.calculateBudget('llama3.1', { systemPromptChars: 7500 }); // -> { estimatedTokens, usagePercent, ... }
SessionConfigurator.evaluateThreshold(90);          // -> { decision: 'WARN', message }
SessionConfigurator.mapThinkingLevel('qwen2.5-coder', 'high'); // -> 1024 (capped tại maxOutput)
```

Lưu ý: model 2k/1k (phi-3-mini, smollm2-360m) với system prompt ~7500 chars sẽ luôn REJECT — đây là cơ chế fail-safe chống OOM. Muốn chạy model nhỏ, giảm `systemPromptChars`/history hoặc chọn model 8k+.

## 3. Cấu hình

| Hằng số | Giá trị | Ý nghĩa |
|---|---|---|
| `CHARS_PER_TOKEN` | 4 | Heuristic chars → tokens |
| `MIN_RESERVE_TOKENS` | 2000 | Reserve tối thiểu bắt buộc (BR-04) |
| `REJECT_THRESHOLD_PERCENT` | 95 | Ngưỡng từ chối session |
| `WARN_THRESHOLD_PERCENT` | 85 | Ngưỡng cảnh báo |
| `DEFAULT_SYSTEM_PROMPT_CHARS` | 7500 | Fallback khi không cung cấp budget inputs |

**Thêm model mới**: thêm entry vào `DEFAULT_MODEL_REGISTRY_ENTRIES` trong `extension/src/pi-agent/model-registry.ts`. Ràng buộc: `contextWindow > 0`, `maxOutput <= contextWindow`, `modelId` unique, `thinkingMap` ≤ `maxOutput`. Entry vi phạm bị loại khỏi registry kèm log warn.

**Thresholds/instance riêng**: tạo `new ModelRegistry(entries)` + `new BudgetCalculator`/`ThresholdGate` là static nên tái sử dụng trực tiếp.

## 4. Troubleshooting

| Hiện tượng | Nguyên nhân | Xử lý |
|---|---|---|
| `ContextBudgetError: Session rejected: usage 98% >95% threshold...` | Budget vượt 95% contextWindow | Giảm history/retrieval/system prompt hoặc đổi model lớn hơn |
| Log `Model not found, using default` | modelId không có trong registry | Kiểm tra `DEFAULT_MODEL_REGISTRY.listModels()` |
| Log `conservative estimate used` | Input budget không hợp lệ (NaN/âm) | Kiểm tra `contextBudget` params |
