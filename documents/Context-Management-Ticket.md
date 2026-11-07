# SA4E Ticket: LLM Context Management & Hallucination Prevention

| Field | Value |
|-------|-------|
| **Ticket ID** | SA4E-339 |
| **Title** | Auto-Compact & LLM Summary Strategy to Prevent Hallucination on Small Context Windows |
| **Priority** | High |
| **Status** | To Do |
| **Assignee** | AI Agent Team |
| **Epic** | SA4E-355 (Context Management) / SA4E-369 (Token Budget) |

## 📝 Description

### Current State
- Context usage tracked via `IdeContextManager` with pulse/auto-suggest thresholds (BR-08, BR-09)
- `stream-loop-continuation.ts` handles loop detection but with `DEFAULT_STREAM_LOOP_MAX_CONTINUES = 1` (too restrictive)
- `intra-turn-budget-gate.ts` compacts when `totalTokens > usable`, but no auto-trigger at 95%
- `CompactService.ts` supports summarize/truncation but without structured summary format
- No mechanism to preserve critical information when compressing context

### Impact
- Users experience abrupt task completion without finishing
- LLM hallucination when critical constraints are lost during compaction
- Increased LLM requests due to re-processing lost information
- Unpredictable behavior across different context window sizes

---

## 🔍 Root Cause Analysis

| Component | Issue | Evidence |
|-----------|-------|----------|
| `stream-loop-continuation.ts` | `DEFAULT_STREAM_LOOP_MAX_CONTINUES = 1` | Only 1 continuation allowed; if continuation also loops, turn stops immediately |
| `intra-turn-budget-gate.ts` | No auto-compact at 95% | Only compacts when already exceeded; no proactive compression |
| `CompactService.ts` | Free-form summarization | No structured format → critical info (constraints, negations) easily lost |
| `pruningAlgorithm.ts` | Priority = age×size×relevance only | No importance scoring → old/low-relevance may contain critical task context |
| No review/continue mechanism | No way to reference previous summaries | Model has no "memory" of what was dropped |

---

## 💡 Proposed Solutions

### Solution 1: Increase `maxContinues` & Add Continuation Hints

**File:** `extension/src/pi-workflow/stream-loop-continuation.ts`

```ts
// From: const DEFAULT_STREAM_LOOP_MAX_CONTINUES = 1;
To: export const DEFAULT_STREAM_LOOP_MAX_CONTINUES = 3;

export function buildLoopContinuationPrompt(kind: StreamLoopKind, anchor: string): string {
  const where = kind === 'thinking' ? 'reasoning' : 'answer';
  const trimmed = (anchor || '').trim();
  return [
    '[SYSTEM NOTE] Your previous response was interrupted because it fell into a repetition loop',
    '(the same fragment was printed over and over). Last coherent point of your ' + where + ':',
    '"""',
    trimmed.length > 0 ? trimmed : '(nothing coherent captured — restart this step concisely)',
    '"""',
    'Do NOT repeat that ' + where + '.',
    'If the task is too large for one response, break it into smaller steps and',
    'complete ONLY the next concrete action now — do not try to finish everything.',
    'Based on it, proceed directly: give your final answer or take the next concrete action now.',
  ].join('\n');
}
```

**Impact**: Reduces premature stops; gives model 3 chances instead of 1.

---

### Solution 2: LLM Summary + Review Strategy (RECOMMENDED)

**Core Idea**: When auto-compact at 95% context window, use LLM to generate **structured summaries** of dropped content, then append summaries as "memory context" for continued processing.

**3-Phase Processing**:

#### Phase 1: Compact + Summarize (at 95% threshold)

```
Input: Chat history (80K tokens)
│
├── Identify P0 content (system prompt + current request + recent tool results)
│   → Keep 100% (≈ 20-30% of total)
│
├── Group remaining: P1 (recent tool results), P2 (code references), P3 (old messages)
│   → P1: Keep or brief summarize
│   → P2: LLM summarize with structured format
│   → P3: Aggressive summarize
│
├── LLM summarizes each group using STRUCTURED prompt
│   → Output: CompactSummary with: topic, constraints, references, state, criticalReminders
│
├── Assemble prompt:
│   [SYSTEM PROMPT] + [CURRENT REQUEST] + [KEPT TOOL RESULTS] + [SUMMARIES]
│   Total: ≈ 50-60% of original
│
└── Send to LLM for processing
```

#### Phase 2: Review/Continue with Summaries

```
After Phase 1 LLM response:
│
├── Check if task needs continuation
│   → Look for: "REMEMBER FROM PREVIOUS", "AS MENTIONED", "PER PREVIOUS SUMMARY"
│
├── If yes: Append summaries as structured context
│   → "PREVIOUS CONTEXT SUMMARY: Topic X, Constraints: a,b,c, Critical: ⚠️do NOT..."
│
├── If no: Use summaries for verification/audit
│
└── Store summaries in KB for future turns
```

#### Phase 3: Structured Summary Format (CRITICAL)

```markdown
# Summary: Old Tool Results (Dropped)

## Topic
Review of claim processing steps from 3 turns ago.

## Constraints (preserved)
- Must validate income ≥ 2x monthly payment
- Requires property appraisal before approval
- Maximum LTV ratio 80%

## Critical References
```python
# Income calculation function
function calcIncome(eligibility) {
  return eligibility.gross * 0.85;
}
```

## State Summary
- User was approving Claim #12345
- Initial review completed, pending final validation
- No red flags identified in initial review

## Critical Reminders
- ⚠️ Do NOT approve without property appraisal
- ⚠️ Check income verification status
- 📋 Next step: Final approval decision
```

---

## 📋 Implementation Roadmap

| # | Task | File(s) | Estimate | Dependencies |
|---|------|---------|----------|--------------|
| 1 | Increase `maxContinues` from 1 → 3 | `stream-loop-continuation.ts` | 0.5 day | None |
| 2 | Add continuation hints to prompt | `stream-loop-continuation.ts` | 0.5 day | 1 |
| 3 | Create `CompactSummary` interface | `CompactService.ts` | 0.5 day | None |
| 4 | Build structured summarization prompt + parser | `CompactService.ts` | 1 day | 3 |
| 5 | Add `generateSummary()` method | `CompactService.ts` | 1 day | 4 |
| 6 | Auto-compact trigger at 95% | `intra-turn-budget-gate.ts` | 1 day | 5 |
| 7 | Enhance `pruningAlgorithm.ts` with importance scoring | `pruningAlgorithm.ts` | 1 day | None |
| 8 | Integrate importance into `IdeContextManager` | `IdeContextManager.ts` | 1 day | 7 |
| 9 | Add review/continue logic in `turn-executor.ts` | `turn-executor.ts` | 1 day | 2, 6 |
| 10 | Test & validate with UAT scenarios | All | 2 days | 1-9 |

**Total**: ~8.5 person-days

---

## ✅ Acceptance Criteria

- [ ] `maxContinues` ≥ 3 (default configurable)
- [ ] Continuation prompt includes "break into smaller steps" hint
- [ ] `CompactSummary` interface with: topic, constraints, references, state, criticalReminders
- [ ] Structured summarization prompt enforces exact format (no deviations)
- [ ] Auto-compact triggered at 95% context usage (before exceed)
- [ ] Summaries preserved and appended as "PREVIOUS CONTEXT SUMMARY" when continuing
- [ ] Critical reminders (negations, constraints) always preserved in summaries
- [ ] Code references kept verbatim (not summarized away)
- [ ] Importance scoring integrated into pruning (age/size/relevance × importance)
- [ ] UAT: Task completion rate ≥ 90% compared to full-context baseline
- [ ] UAT: Hallucination rate (missing constraints) reduced ≥ 60%

---

## 📊 Success Metrics (Post-Implementation)

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Context reduction** | 40-50% tokens freed | Before/after usagePercent |
| **Task completion rate** | ≥ 90% (vs current ~70%) | UAT test cases |
| **Hallucination rate** | ↓ 60-70% | Missing constraints in output |
| **LLM requests per task** | ↓ 30% | Fewer re-runs needed |
| **User-perceived quality** | ↑ 15-20% | Survey/feedback |
| **Auto-compact trigger rate** | ≥ 80% of turns at 90%+ | Log analysis |

---

## 🏷️ Labels / Tags

```
#sa4e #llm #context-management #hallucination-prevention #token-budget #auto-compact #structured-summary
```

---

## 📌 Related Tickets

| Ticket | Relationship |
|--------|--------------|
| SA4E-355 | Original context budget UAT fix |
| SA4E-369 | Output token limit SEC-01 fix |
| SA4E-334 | Session host architecture |
| SA4E-323 | Provider configuration |
| SA4E-85 | IdeContextManager (token tracking) |

---

## 👤 Comments / Notes

- **Priority**: High - blocks user tasks when context exhausted
- **Risk**: Low - all changes are additive (new features, not removing existing)
- **Testing**: Requires UAT with real user scenarios; cannot test fully in isolation
- **Dependencies**: Requires LLM provider support for structured output (most modern models support)
- **Rollback**: All changes are opt-in via thresholds; can disable by setting `maxContinues = 1` and skipping auto-compact trigger

---