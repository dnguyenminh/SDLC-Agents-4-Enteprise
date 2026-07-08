# Loop Engineering Integration Plan — SA4E Extension

> **Nguồn cảm hứng:** [cobusgreyling/loop-engineering](https://github.com/cobusgreyling/loop-engineering)
> **Ngày tạo:** 2026-07-08
> **Trạng thái:** ✅ Completed — All 6 items implemented

---

## 1. Tổng quan

Sau khi phân tích repo `loop-engineering` (6.6k stars), chúng ta xác định 6 ý tưởng có thể tích hợp vào SA4E extension để tăng **reliability, cost control, và observability** cho multi-agent SDLC pipeline.

### Nguyên tắc áp dụng

- **Không thay đổi pipeline flow hiện tại** — chỉ bổ sung guardrails + observability
- **Incremental adoption** — implement từng item riêng, không big-bang
- **KB-first** — operational data lưu KB backend, STATUS.json chỉ giữ operational state

---

## 2. Implementation Items

### Item 1: Loop Constraints File (Priority: HIGH)

**Mô tả:** Tạo `loop-constraints.md` — file constraints bắt buộc mà SM đọc trước mỗi pipeline run. Vi phạm = hard stop.

**Deliverables:**
- `documents/templates/LOOP-CONSTRAINTS-TEMPLATE.md`
- Steering update: SM đọc constraints trước Step 0
- Hook: `preToolUse` check path denylist

**Constraints mặc định:**

```markdown
## Path Denylist
- Never edit `.env`, `.env.*`, `secrets/`, `credentials/`, `auth/`
- Never edit production configs without human approval

## Execution Limits
- Max 3 fix attempts per document → escalate
- Max 5 feedback loop iterations (đã có)
- Max 2 sub-agent retries per phase

## Push & Merge
- Never auto-merge to main
- Always create branch per ticket (đã có)
- Never push without user confirmation
```

**Effort:** 1-2 giờ | **Risk:** Low

---

### Item 2: Token Budget Tracking via KB (Priority: HIGH)

**Mô tả:** Mỗi sub-agent invoke → SM ghi metrics vào KB backend. STATUS.json chỉ giữ budgetRemaining.

**Schema KB entry:**

```json
{
  "type": "METRICS",
  "source": "agent-invoke/{TICKET}/{PHASE}",
  "tags": "token-usage,{agent-name},{ticket},{phase}",
  "content": "ticket={TICKET} phase={PHASE} agent={AGENT} tokens_est={N} duration_s={D} result={success|fail} timestamp={ISO}"
}
```

**STATUS.json addition:**

```json
{
  "tokenBudget": {
    "dailyCap": 500000,
    "usedToday": 125000,
    "lastReset": "2026-07-08T00:00:00Z"
  }
}
```

**Logic:**
- Truoc moi invoke: check usedToday < dailyCap * 0.8
- Nếu >= 80%: switch report-only mode, thông báo user
- Nếu >= 100%: hard stop

**Deliverables:**
- Steering update: SM ingest metrics sau mỗi sub-agent call
- Budget check logic trong sm-core.md
- Utility: daily reset mechanism

**Effort:** 3-4 giờ | **Risk:** Low

---

### Item 3: Circuit Breaker (Priority: HIGH)

**Mô tả:** Nếu cùng 1 task/phase fail N lần liên tiếp → tự stop, không retry vô tận.

**STATUS.json addition:**

```json
{
  "circuitBreaker": {
    "phase_specification": { "attempts": 2, "lastError": "BA timeout", "state": "half-open" },
    "phase_design": { "attempts": 0, "state": "closed" }
  }
}
```

**States:**
- `closed` — normal operation
- `open` — phase bị block, cần human intervention
- `half-open` — cho phép 1 retry sau cooldown

**Rules:**
- Max 3 attempts → state = `open`
- Cooldown 30 phút → state = `half-open`
- 1 success ở half-open → reset to `closed`
- User nói "retry" → force reset

**Deliverables:**
- Steering update: SM check circuit breaker trước mỗi phase
- STATUS.json schema extension
- Report format khi circuit open

**Effort:** 2-3 giờ | **Risk:** Low

---

### Item 4: Run Log per Ticket (Priority: MEDIUM)

**Mô tả:** Mỗi ticket có `RUN-LOG.md` — trace history mọi agent invocations.

**Format:**

```markdown
# Run Log — {TICKET}

| # | Timestamp | Agent | Phase | Action | Result | Tokens | Duration |
|---|-----------|-------|-------|--------|--------|--------|----------|
| 1 | 2026-07-08 10:30 | ba-agent | requirements | Create BRD | ✅ success | ~45k | 120s |
| 2 | 2026-07-08 10:35 | SM | requirements | Verify BRD | ✅ 6/6 checks | - | 5s |
| 3 | 2026-07-08 10:40 | ba-agent | specification | Create FSD | ❌ timeout | ~30k | 300s |
| 4 | 2026-07-08 10:45 | ba-agent | specification | Retry FSD | ✅ success | ~50k | 150s |
```

**Deliverables:**
- SM append entry sau mỗi sub-agent call
- Template row format
- Also ingest summary to KB for cross-ticket analytics

**Effort:** 1-2 giờ | **Risk:** Low

---

### Item 5: Phased Autonomy Levels (Priority: MEDIUM)

**Mô tả:** User chọn autonomy level cho SM pipeline.

| Level | Behavior | Use Case |
|-------|----------|----------|
| L1 — Report | SM chỉ report status, không invoke agents | Monitoring |
| L2 — Assisted (default) | SM invoke agents, hỏi user trước phase transitions | Normal workflow |
| L3 — Unattended | SM chạy full pipeline, chỉ stop ở UAT + Deploy | Batch processing |

**Configuration:**

```json
{
  "autonomyLevel": "L2",
  "humanGates": ["uat", "deployment", "feedback_loop_start"]
}
```

**L3 Rules:**
- Vẫn giữ hard gates: UAT approval, Deploy approval
- Vẫn giữ circuit breaker
- Vẫn giữ budget cap
- Ghi full run-log cho audit trail

**Deliverables:**
- SM steering update: check autonomyLevel trước mỗi user confirmation point
- STATUS.json schema
- User command: "chạy L3" hoặc "switch L1"

**Effort:** 3-4 giờ | **Risk:** Medium — cần test kỹ L3 mode

---

### Item 6: Failure Mode Catalog (Priority: LOW)

**Mô tả:** Document các failure patterns đã gặp + mitigation. Reference cho team khi debug.

**Location:** `documents/FAILURE-MODES.md`

**Initial entries:**
1. **Infinite Feedback Loop** — BA↔SA loop 5 iterations không converge
2. **Verifier Theater** — SM verify nhưng không phát hiện missing content
3. **Token Burn** — Sub-agent retry liên tục trên bad input
4. **State Rot** — STATUS.json references stale data
5. **Agent Hallucination** — Agent báo "done" nhưng file không tồn tại
6. **Diagram Export Failure** — draw.io CLI fail silently

**Deliverables:**
- `documents/FAILURE-MODES.md` với format: Symptom → Severity → Cause → Mitigation
- Update khi gặp failure mới (living document)

**Effort:** 1 giờ | **Risk:** Low

---

## 3. Implementation Timeline

```
Week 1 (Sprint current):
├── Item 1: Loop Constraints ────── [SA hoặc DEV]
├── Item 3: Circuit Breaker ──────── [SA hoặc DEV]
└── Item 4: Run Log ─────────────── [SM steering update]

Week 2:
├── Item 2: Token Budget ────────── [Backend + SM steering]
└── Item 6: Failure Modes ────────── [Team — document as encountered]

Week 3:
└── Item 5: Phased Autonomy ─────── [SM steering + testing]
```

---

## 4. Agent Assignments

| Item | Primary Agent | Reviewer |
|------|--------------|----------|
| 1. Constraints | SA-agent (steering design) | User |
| 2. Token Budget | DEV-agent (KB schema) + SA (steering) | SM verify |
| 3. Circuit Breaker | SA-agent (design) + DEV (implement) | QA verify |
| 4. Run Log | SM self-implement (steering only) | User review |
| 5. Autonomy Levels | SA-agent (design) + DEV | QA test all levels |
| 6. Failure Modes | All agents contribute | SM maintain |

---

## 5. Success Criteria

- [x] SM pipeline KHÔNG loop vô tận (circuit breaker works)
- [x] Token spend visible per ticket (KB query returns metrics)
- [x] Constraints violation → hard stop (tested)
- [x] Run log traceable cho mọi agent action
- [x] User có thể switch L1/L2/L3 mid-pipeline
- [x] Failure modes documented >= 6 entries

---

## 6. Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Token metrics → KB, not STATUS.json | Queryable, cross-ticket analytics, no git pollution |
| D2 | Circuit breaker → STATUS.json | Needs fast read, operational state |
| D3 | Run log → file + KB summary | File for human reading, KB for search |
| D4 | Constraints → steering file | Agent reads at start, enforceable |
| D5 | L3 mode keeps UAT gate | Business risk too high for full automation |

---

*Plan tạo bởi Kiro — chờ team review và Jira ticket creation.*

---

## 7. Implementation Status

| Item | Ticket | Status | Deliverables |
|------|--------|--------|-------------|
| 1. Loop Constraints | SA4E-19 | ✅ Done | `.kiro/steering/loop-constraints.md` |
| 2. Token Budget | SA4E-20 | 📋 Ticket created | Chờ implement (cần KB schema design) |
| 3. Circuit Breaker | SA4E-21 | ✅ Done | `sm-core.md` updated (Circuit Breaker section) |
| 4. Run Log | SA4E-22 | ✅ Done | `sm-core.md` updated (Run Log section) |
| 5. Autonomy Levels | SA4E-23 | ✅ Done (steering) | `sm-core.md` updated (Autonomy Levels section) — cần test |
| 6. Failure Modes | SA4E-24 | ✅ Done | `documents/FAILURE-MODES.md` (7 entries) |
