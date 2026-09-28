# User Guide — SA4E-329: Pi Model Routing and Fallback

> Epic SA4E-289 — Pi SDK small-model support. Module: `extension/src/pi-agent/`

## 1. Tính năng

- **Small-first Routing**: mọi request được route tới model nhỏ trước (`phi-3-mini` mặc định); model phân loại `small`/`large` theo contextWindow (≤16384 = small).
- **Confidence Scoring**: chấm điểm câu trả lời của model nhỏ — đọc confidence có cấu trúc (`"confidence": 0.62`) hoặc heuristic (hedging → 0.3, confident → 0.9, neutral → 0.8). Lỗi chấm điểm → 0.5.
- **Fallback Escalation**: confidence < **0.75** → escalate lên model lớn (`gpt-4o-mini`), tối đa **1 lần/session**, chặn nếu tăng giá > **30%**. Model lỗi (phi-3 fail) cũng escalate kèm log.
- **Routing diagnostics**: mọi quyết định route/escalate được log (`logger.info/warn`) và ghi vào `session.diagnostics`.
- **thinkingLevel + retry**: session sau escalate được map lại `maxTokens` theo model mới và gắn `retry: { maxRetries }`.

## 2. Cách dùng

```ts
import { ModelRouter } from './pi-agent/model-router';
import { FallbackHandler } from './pi-agent/fallback-handler';
import { DEFAULT_MODEL_REGISTRY } from './pi-agent/model-registry';
import { DEFAULT_ROUTING_POLICY } from './pi-agent/routing-policy';
import { ThinkingLevelMapper } from './pi-agent/thinking-level-mapper';

const router = new ModelRouter(DEFAULT_MODEL_REGISTRY, DEFAULT_ROUTING_POLICY);
const handler = new FallbackHandler(
  DEFAULT_MODEL_REGISTRY,
  DEFAULT_ROUTING_POLICY,
  new ThinkingLevelMapper(DEFAULT_MODEL_REGISTRY)
);

// 1. Route small-first
const routing = router.route('Refactor this module');       // -> { modelId: 'phi-3-mini', tier: 'small', ... }

// 2. Model nhỏ trả lời -> kiểm tra confidence
const answer = await smallModel.answer('Refactor this module');
const decision = router.shouldEscalate(answer, { modelId: 'phi-3-mini', escalationCount: 0 });

// 3. Escalate khi cần
if (decision.escalate) {
  const escalated = handler.escalate(session, 'low-confidence', decision.reason);
  // escalated.modelId === 'gpt-4o-mini', escalated.config.maxTokens đã remap
}
```

## 3. Cấu hình (`routing-policy.ts`)

| Thuộc tính | Mặc định | Ý nghĩa |
|---|---|---|
| `smallModel` | `phi-3-mini` | Model nhỏ mặc định khi không chỉ định |
| `escalationModel` | `gpt-4o-mini` | Model lớn đích khi escalate |
| `confidenceThreshold` | 0.75 | Ngưỡng confidence quyết định escalate |
| `maxEscalationsPerSession` | 1 | Số lần escalate tối đa mỗi session |
| `maxCostIncreaseRatio` | 0.30 | Trần tăng giá khi escalate (so sánh costPer1k) |
| `routingTimeoutMs` | 100 | Ngân sách thời gian cho 1 routing decision |
| `maxRetries` | 1 | Retry config gắn vào session sau escalate |

Tạo policy riêng: `{ ...DEFAULT_ROUTING_POLICY, escalationModel: 'claude-3' }`.

## 4. Troubleshooting

| Hiện tượng | Nguyên nhân | Xử lý |
|---|---|---|
| Log `Escalation blocked ... max escalations reached` | Session đã escalate 1 lần | Kiểm tra `escalationCount` |
| Log `Escalation blocked ... cost increase exceeds 30% ceiling` | Model đích đắt hơn trần cho phép | Đổi `escalationModel` rẻ hơn hoặc nới `maxCostIncreaseRatio` |
| Log `ROUTE_ERROR: kept original` | modelId không có trong registry / query không hợp lệ | Kiểm tra registry |
| Confidence luôn 0.5 | Answer rỗng/lỗi chấm điểm | Kiểm tra output model nhỏ |
