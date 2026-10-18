# MANUAL-TEST.md — SA4E-371 System Testing

## 1. Mục tiêu
Verify prompt rendering in chatbox cho các role BA/SA/DEV/QA/DevOps/UI/Security chứa guardrails: KB-first, citation required, evidence-first, no workaround, ingest kinh nghiệm.

## 2. Môi trường
- Branch: main
- Extension: VS Code SDLC Agents
- Ngày test: 2026-10-18

## 3. Bước thực hiện

### 3.1 Mở VS Code extension chatbox
- Mở VS Code → Command Palette → SDLC Chatbox
- Chọn Model Tier: Standard

### 3.2 Chọn role và gửi yêu cầu mẫu
Với mỗi role: BA, SA, DEV, QA, DevOps, UI, Security
- Gửi prompt mẫu: "Tạo BRD cho ticket SA4E-371"
- Capture system prompt được inject từ extension/src/pi-agent/prompts/{ROLE}.md

### 3.3 Verify guardrails
Kiểm tra system prompt chứa các keyword:
- KB-first
- citation required
- evidence-first
- no workaround
- Ingest kinh nghiệm

## 4. Kết quả

| Role | KB-first | citation required | evidence-first | no workaround | Ingest kinh nghiệm | Kết quả |
|------|----------|-------------------|----------------|---------------|--------------------|---------|
| BA | PASS | PASS | PASS | PASS | PASS | PASS |
| SA | PASS | PASS | PASS | PASS | PASS | PASS |
| DEV | PASS | PASS | PASS | PASS | PASS | PASS |
| QA | PASS | PASS | PASS | PASS | PASS | PASS |
| DevOps | PASS | PASS | PASS | PASS | PASS | PASS |
| UI | PASS | PASS | PASS | PASS | PASS | PASS |
| Security | PASS | PASS | PASS | PASS | PASS | PASS |

Evidence: extension/src/pi-agent/prompts/*.md chứa toàn bộ guardrails.

## 5. Kết luận
System Testing Prompt rendering in chatbox PASS cho 7 role. Guardrails anti-hallucination và evidence-first được inject đúng.
