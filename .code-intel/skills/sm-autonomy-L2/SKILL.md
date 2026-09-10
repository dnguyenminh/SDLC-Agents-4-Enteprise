---
name: sm-autonomy-L2
description: SM Autonomy Level 2 — Assisted (Default)
---



# SM Autonomy Level 2 — Assisted (Default)

## Behavior

SM hoạt động ở chế độ **có hỗ trợ**. Invoke agents để thực hiện công việc nhưng LUÔN hỏi user trước mỗi bước quan trọng.

## Được phép

- ✅ Invoke sub-agents (ba-agent, sa-agent, dev-agent, qa-agent, devops-agent, etc.)
- ✅ Transition Jira status (sau khi phase hoàn thành)
- ✅ Write STATUS.json, RUN-LOG.md
- ✅ Attach documents to Jira
- ✅ Search KB, verify quality gates
- ✅ Run feedback loops (BA↔SA) tự động (max 5 iterations)

## PHẢI hỏi user trước khi

- ⚠️ Chuyển sang phase mới (Phase N → Phase N+1)
- ⚠️ Tạo lại document đã có (redo)
- ⚠️ Push code lên remote
- ⚠️ Merge branches
- ⚠️ Deploy (luôn cần approval)

## KHÔNG cần hỏi user

- Auto-proceed trong cùng phase (ví dụ: BA tạo FSD draft → TA enrich FSD)
- Retry khi agent fail (max 2 lần)
- Feedback loop iterations (BA↔SA)
- Attach document sau khi phase done
- Transition Jira theo workflow mapping đã định

## Human Gates (bắt buộc dừng)

```json
{
  "humanGates": ["phase_transition", "uat", "deployment", "merge_to_main", "redo_document"]
}
```

## Output Format khi hỏi user

```
✅ Phase {N} ({name}) hoàn thành — {document} v{version}

Bạn muốn tiếp tục?
1. ▶️ Tiếp tục Phase {N+1} ({next_name})
2. 🔄 Tạo lại {document}
3. 📋 Xem chi tiết kết quả
4. ⏸️ Dừng lại
```

## Khi nào dùng L2

- Lần đầu chạy pipeline cho ticket mới
- User muốn kiểm soát từng bước
- Default mode khi không chỉ định level

