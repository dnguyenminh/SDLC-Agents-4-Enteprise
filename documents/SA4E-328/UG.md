# User Guide (UG)

## SA4E-328: Pi Verification loop + Hallucination grader for small models

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-328 |
| Title | Pi Verification loop + Hallucination grader for small models |
| Author | DEV Agent |
| Version | 1.0 |
| Date | 2026-09-26 |
| Status | Draft |
| Related | BRD.md, FSD.md, TDD.md, STC.md (documents/SA4E-328/) |

---

## 1. Tính năng (Features)

1. **Hallucination grading** — chấm điểm faithfulness (0–1) của câu trả lời dựa trên các nguồn citation (file path + line + excerpt). Threshold mặc định **0.7**; grading timeout **<2s**/answer.
2. **Verification loop** — sau `execute_tools`: grade → nếu score < threshold → retry (1x, regenerate answer) → re-grade → fallback accept answer tốt nhất.
3. **Model-tier routing** — model `small` bỏ self-verify, dùng **direct routing + external grader**; medium/large giữ **self-verify** trong loop.
4. **Faithfulness metric trên golden set** — `evaluateGoldenSet` báo cáo mean faithfulness + pass rate cho eval harness.

## 2. Cách dùng (Usage)

### 2.1 Hook sau execute_tools (khuyến nghị)

```ts
import { verifyAfterExecuteTools } from './pi-agent/verification-loop';

const result = await verifyAfterExecuteTools({
  answer: 'The model has a 2k context window.',
  sources: [{ path: 'chat-models.ts', line: 12, excerpt: 'the model has a 2k context window' }],
  modelId: 'phi-3-mini',                 // small → external-grader strategy
  regenerate: async (prev) => generateAnswer(prev),  // optional — bật retry
});
// result: { verified, revisedAnswer, score, attempts, strategy }
```

### 2.2 Dùng HallucinationGrader trực tiếp

```ts
import { HallucinationGrader } from './pi-agent/hallucination-grader';

const grader = new HallucinationGrader();            // default: lexical grounding rubric
const { score, issues } = await grader.grade(answer, sources);

// Inject LLM grader (same/larger model) + custom config:
const llmGrader = new HallucinationGrader(myLlmGradeFn, { threshold: 0.8, timeoutMs: 1500 });
```

- `GRADE_ERROR` (grader throw/timeout/output vô hiệu) → trả `{ score: 0, issues: ['GRADE_ERROR: ...'] }`.

### 2.3 Dùng VerificationLoop trực tiếp

```ts
import { VerificationLoop } from './pi-agent/verification-loop';

const loop = new VerificationLoop(grader, {
  regenerate,                          // optional
  config: { maxRetries: 1, timeoutMs: 4000 },
});
const result = await loop.verify(answer, sources, 'small');  // tier: 'small'|'medium'|'large'|null
```

Hành vi:
- Score ≥ threshold → `verified: true`, không retry.
- Score < threshold → regenerate 1x → re-grade → chọn answer điểm cao nhất.
- Retry vẫn thấp → **fallback accept** (`verified: false`, trả answer tốt nhất).
- `VERIFY_TIMEOUT` (loop timeout) → trả **answer gốc**, `attempts: 0`.

### 2.4 Faithfulness metric trên golden set

```ts
import { evaluateGoldenSet } from './pi-agent/faithfulness-metrics';

const report = await evaluateGoldenSet(grader, [
  { id: 'case-1', answer: '...', sources: [...] },
]);
// report: { total, passed, meanFaithfulness, results: [{ id, score, passed }] }
```

## 3. Cấu hình (Configuration)

| Item | Mặc định | Mô tả |
|------|----------|-------|
| `FAITHFULNESS_THRESHOLD` | `0.7` | Ngưỡng pass/fail (FSD 12.3), override qua grader config |
| `GRADE_TIMEOUT_MS` | `2000` | Timeout mỗi lần grade (<2s — FSD 12.5) |
| `DEFAULT_VERIFY_CONFIG.maxRetries` | `1` | Số retry của verification loop |
| `DEFAULT_VERIFY_CONFIG.timeoutMs` | `4000` | Timeout toàn bộ loop (VERIFY_TIMEOUT → trả answer gốc) |
| `GROUNDING_MIN_TOKEN_COVERAGE` | `0.6` | Claim được coi grounded khi ≥60% significant tokens nằm trong sources |

### Faithfulness rubric mặc định (OI-328-01)

Deterministic lexical grounding (không tốn LLM call): tách answer thành claims (câu) → claim "grounded" khi ≥60% significant tokens (đã bỏ stopword) xuất hiện trong path/excerpt của sources → `score = grounded / total`. Để dùng LLM grading, inject `GradeFn` vào `HallucinationGrader`.

## 4. Troubleshooting

| Hiện tượng | Nguyên nhân | Xử lý |
|------------|-------------|-------|
| Score thấp dù trả lời đúng | Sources thiếu excerpt | Cung cấp excerpt chứa nội dung liên quan |
| Luôn `score: 0` + GRADE_ERROR | GradeFn throw/timeout/return sai shape | Kiểm tra GradeFn; đảm bảo trả `{ score, issues }` |
| Retry không chạy | Thiếu `regenerate` trong deps | Loop chỉ retry khi có `regenerate` |
| `attempts: 0` bất thường | Loop timeout (VERIFY_TIMEOUT) → trả answer gốc | Tăng `config.timeoutMs` hoặc kiểm tra grader chậm |
| Small model vẫn self-verify | `modelTier` truyền vào ≠ 'small' | Kiểm tra `detectModelTier(modelId)` từ model-tier.ts |
