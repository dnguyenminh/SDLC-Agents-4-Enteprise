---
name: context-compaction
description: Context Compaction & Model Tiering
---


# Context Compaction & Model Tiering

## Mục đích

Quản lý context window thông minh thay vì ước tính token tĩnh. SM theo dõi usage theo phase, compact tại breakpoints hợp lý, và chọn model phù hợp cho từng task.

---

## 1. Quy tắc giám sát context

SM PHẢI track token usage ước tính theo phase trong STATUS.json:

```json
{
  "contextMetrics": {
    "currentSessionTokens": 0,
    "phaseTokensUsed": {},
    "lastCompactionAt": null,
    "warningLevel": "normal"
  }
}
```

### Ngưỡng cảnh báo

| Mức | % Context Window | Hành động |
|-----|-----------------|-----------|
| `normal` | 0–60% | Tiếp tục bình thường |
| `warn` | 60–80% | ⚠️ Báo user, suggest compact |
| `critical` | 80–90% | 🟠 Force compact trước khi tiếp tục |
| `emergency` | 90%+ | 🔴 Force compact ngay, chỉ giữ essential context |

---

## 2. Breakpoints — Khi nào compact

### Sau mỗi phase hoàn thành (MANDATORY)

| Phase vừa xong | Context cần giữ | Context compact (tóm tắt) |
|---------------|-----------------|---------------------------|
| BRD done | User stories IDs, NFRs | Bỏ Jira raw, intermediate reasoning |
| FSD done | Use case IDs, BR-IDs, API contracts | Bỏ BRD full text (đã ingest KB) |
| TDD done | Architecture decisions, API specs | Bỏ FSD full text (đã ingest KB) |
| STP/STC done | Test case IDs, coverage matrix | Bỏ TDD full text |
| Code done | File paths changed, commit hash | Bỏ full source code context |

### Compact template

Sau mỗi phase, SM tạo summary block:

```
📋 Phase Summary — {PHASE_NAME}
- Key decisions: {list 3-5 decisions}
- Artifacts: {file list}
- Open issues: {if any}
- Next: {what comes next}
```

Rồi drop intermediate context (reasoning, drafts, failed attempts).

---

## 3. Model Tiering — Chọn model theo task complexity

### Bảng phân loại

| Task Type | Complexity | Model Recommendation | Sub-agent |
|-----------|-----------|---------------------|-----------|
| File reads, lookups, search | Low | Lighter/faster model | `general-task-execution` |
| Status check, Jira transition | Low | Lighter/faster model | `general-task-execution` |
| BRD → FSD reasoning | High | Full reasoning model | `ba-agent` |
| TDD design, architecture | High | Full reasoning model | `sa-agent` |
| Code review (standards) | Medium | Full reasoning model | `dev-agent` |
| Code implementation | High | Full reasoning model | `dev-agent` |
| Security review | High | Full reasoning model | `security-agent` |
| Diagram generation | Medium | Full reasoning model | SA/BA agent |
| DOCX export, attach | Low | Lighter/faster model | `general-task-execution` |
| Test execution (run commands) | Low | Lighter/faster model | `general-task-execution` |

### Quy tắc chọn sub-agent

```
IF task chỉ cần:
  - Đọc file + trả về nội dung
  - Chạy command đơn giản
  - Transition Jira
  - Export DOCX
→ Dùng general-task-execution (lighter model)

IF task cần:
  - Phân tích, reasoning phức tạp
  - Viết document mới (BRD/FSD/TDD)
  - Code review có judgment
  - Security audit
  - Code implementation
→ Dùng specialized agent (full model)
```

---

## 4. Budget Advisor — Cảnh báo proactive

### Pre-invoke estimation (cập nhật từ experience thực tế)

| Action | Estimated Tokens | Confidence |
|--------|-----------------|-----------|
| BA → BRD | 40,000–60,000 | Medium |
| BA → FSD draft | 50,000–80,000 | Medium |
| TA → FSD enrichment | 30,000–50,000 | Medium |
| SA → TDD | 60,000–90,000 | Low (varies by complexity) |
| QA → STP/STC | 50,000–70,000 | Medium |
| DEV → Implementation | 80,000–150,000 | Low (varies by scope) |
| DEV → UG | 30,000–50,000 | High |
| Security review | 20,000–40,000 | High |
| SM → Verify | 10,000–20,000 | High |
| Simple lookup/transition | 3,000–8,000 | High |

### Advisor messages

```
💡 Context Advisor:
- Estimated next action: ~{N}k tokens
- Current usage: {used}/{cap} ({percent}%)
- Recommendation: {proceed / compact first / switch to lighter model}
```

---

## 5. Tool Count Awareness

### Quy tắc khi tool count cao

| Điều kiện | Hành động |
|-----------|-----------|
| >30 tools loaded | Suggest `toggle_tool` để disable unused |
| >50 tools loaded | ⚠️ WARN: tool descriptions chiếm significant context |
| Session chỉ cần subset | List tools cần thiết, disable rest |

### Tool groups theo phase

| Phase | Tools cần thiết | Có thể disable |
|-------|----------------|----------------|
| Requirements | jira_*, mem_*, find_tools | drawio_*, code_* |
| Design | mem_*, code_*, find_tools | jira_* (trừ transitions) |
| Implementation | code_*, mem_*, git | drawio_*, jira_* |
| Testing | code_*, test runners | drawio_*, jira_* |
| Deployment | jira_*, mem_*, git | code_search |

---

## 6. Anti-patterns — Tránh lãng phí context

| ❌ Anti-pattern | ✅ Cách đúng |
|----------------|-------------|
| Gửi full file khi chỉ cần snippet | Dùng line range hoặc grep trước |
| Load tất cả tools khi chỉ cần 3 | Toggle off unused tools |
| Giữ full BRD trong context khi đang code | Compact sau phase, reference KB |
| Retry cùng prompt 3 lần không thay đổi | Diagnose root cause, thay đổi approach |
| Include full RUN-LOG trong mỗi invoke | Chỉ include latest 5 entries |
| Đọc toàn bộ TDD khi chỉ cần 1 section | Đọc specific section bằng line range |

