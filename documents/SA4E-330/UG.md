# User Guide — SA4E-330: Pi Session Compaction and Eval Harness

> Epic SA4E-289 — Pi SDK small-model support. Module: `extension/src/pi-agent/`

## 1. Tính năng

- **Session Monitor**: theo dõi usage của session (0..1) — `>= 0.95` triggers auto-compact, `>= 0.85` phát warning, dưới 0.85 không làm gì.
- **Session Compactor**: nén session khi usage ≥ 95% — tổng hợp **intent / tools đã dùng / last response** thành 1 message summary (`[compaction] intent: ... | tools: ... | lastResponse: ...`) + giữ lại 2 message gần nhất. usage sau nén mục tiêu ≤ 0.70, thời gian nén < 300ms, quality retention ≥ 90% (intent không mất qua nhiều lần nén nhờ merge summary cũ). Lỗi nén → fallback **truncate** (giữ 2 message cuối) kèm log, không throw.
- **Eval Harness**: đánh giá model trên **golden dataset** (5 case synthetics) — metrics `faithfulness` (keyword coverage trung bình), `taskSuccess` (tỷ lệ case đạt coverage ≥ 0.8), `avgLatencyMs`, `tokensSaved`, số case skip (EVAL_ERROR → skip case, không fail cả run). So sánh small vs large baseline: pass khi `taskSuccess(small) > 80% × taskSuccess(baseline)`.

## 2. Cách dùng

### Compaction (mid-session)

```ts
import { SessionCompactor } from './pi-agent/session-compactor';

const compactor = new SessionCompactor();
const result = compactor.compact({
  modelId: 'llama3.1',
  contextWindow: 8192,
  usage: 0.96,                          // >= 0.95 -> compact
  messages: [...history],
});
// result.action === 'compact'
// result.summary    = { intent, toolsUsed, lastResponse }
// result.tokensSaved, result.usageAfter, result.qualityScore, result.latencyMs
// result.truncated  = true khi fallback truncate (COMPACT_FAIL)
const nextSession = result.session;     // messages đã được thay bằng summary + 2 message gần nhất
```

### Eval Harness (real E2E)

```ts
import { EvalHarness, createSessionEvalRunner } from './pi-agent/eval-harness';

// Production: session là Pi AgentSession thật (có method prompt(query))
const harness = new EvalHarness(createSessionEvalRunner(piSession));
const small = await harness.runEval('phi-3-mini');
const baseline = await harness.runEval('gpt-4o-mini');
const verdict = EvalHarness.compareWithBaseline(small, baseline);
// verdict.pass === true khi small > 80% baseline (AC của ticket)
```

## 3. Cấu hình

| Hằng số | Giá trị | Ý nghĩa |
|---|---|---|
| `COMPACT_USAGE_THRESHOLD` | 0.95 | Ngưỡng auto-compact |
| `WARN_USAGE_THRESHOLD` | 0.85 | Ngưỡng warning |
| `COMPACT_TARGET_USAGE` | 0.70 | Usage mục tiêu sau compact |
| `RECENT_MESSAGES_KEPT` | 2 | Số message gần nhất được giữ |
| `QUALITY_RETENTION_FLOOR` | 0.90 | Chất lượng tối thiểu chấp nhận |
| `TASK_SUCCESS_COVERAGE` | 0.8 | Ngưỡng coverage để 1 case tính là success |
| `SMALL_BASELINE_RATIO` | 0.8 | AC: small > 80% baseline large |

- **Golden dataset**: sửa/bổ sung `DEFAULT_GOLDEN_DATASET` trong `eval-harness.ts` (mỗi case: `id`, `query`, `expectedIntent`, `expectedAnswerKeywords`). Có thể truyền dataset riêng qua constructor: `new EvalHarness(runner, myDataset)`.
- **Custom dataset phải được version** (FSD 12.6 — chống eval drift).

## 4. Troubleshooting

| Hiện tượng | Nguyên nhân | Xử lý |
|---|---|---|
| `result.action === 'warn'` | Usage 0.85–0.95 | Chưa compact; giám sát tiếp, giảm history chủ động |
| `result.truncated === true` (log `COMPACT_FAIL`) | Message không đọc được → fallback truncate | Kiểm tra dữ liệu messages |
| `metrics.skipped > 0` (log `EVAL_ERROR`) | Runner/model lỗi ở 1 số case | Xem log error từng case, chạy lại |
| `verdict.pass === false` | Small model < 80% baseline | Tune model/prompt hoặc giữ baseline cho task đó |
