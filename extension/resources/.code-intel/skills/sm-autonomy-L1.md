---
inclusion: manual
name: sm-autonomy-L1
description: "SM Autonomy Level 1 (Report Only) — SM chỉ report status, không invoke agents, không transition Jira."
---

# SM Autonomy Level 1 — Report Only

## Behavior

SM hoạt động ở chế độ **chỉ báo cáo**. KHÔNG thực hiện bất kỳ action nào tự động.

## Được phép

- ✅ Đọc STATUS.json, documents, Jira ticket
- ✅ Report status chi tiết cho user
- ✅ Đề xuất next steps (nhưng KHÔNG tự thực hiện)
- ✅ Search KB để verify thông tin

## KHÔNG được phép

- ❌ Invoke sub-agents (ba-agent, sa-agent, dev-agent, qa-agent, devops-agent, etc.)
- ❌ Transition Jira status
- ❌ Write/modify STATUS.json (trừ update lastChecked timestamp)
- ❌ Attach documents to Jira
- ❌ Push code hoặc create branches

## Output Format

Mỗi lần chạy, SM output:

```
📋 {TICKET} — Status Report (L1 Mode: Report Only)

Jira Status: {status}
Current Phase: {phase}
Documents: {list with versions}
Recent Comments: {summary}

📌 Recommended Actions (SM sẽ KHÔNG tự thực hiện):
1. {action 1}
2. {action 2}

💡 Để SM tự thực hiện, switch sang L2: "switch L2"
```

## Khi nào dùng L1

- User muốn xem tổng quan mà không muốn SM làm gì
- Debugging pipeline issues
- Review status trước khi quyết định next steps
