# IMPLEMENTATION-NOTES.md — SA4E-371

## Ticket
SA4E-371: Upgrade system prompts with anti-hallucination guardrails

## Thay đổi code

### 1. extension/src/pi-agent/agent-configurator.ts
- Tách AGENT_PROMPTS hardcode ra file template `extension/src/pi-agent/prompts/*.md` cho 8 role BA/SA/DEV/QA/DevOps/UI/Security/SM.
- Sửa `getSystemPromptForRole` để load dynamic từ file template thay vì hardcode, giữ guardrails.
- Giữ `SM` và `DEFAULT_AGENT_PROMPT` nguyên để đảm bảo tương thích.
- Prompt file chứa guardrails mở rộng: anti-hallucination, evidence-first, KB-first, citation required, tool usage, no workaround, Ingest kinh nghiệm.

### 1.1. File templates tạo mới
- `extension/src/pi-agent/prompts/SM.md`
- `extension/src/pi-agent/prompts/BA.md`
- `extension/src/pi-agent/prompts/SA.md`
- `extension/src/pi-agent/prompts/DEV.md`
- `extension/src/pi-agent/prompts/QA.md`
- `extension/src/pi-agent/prompts/DevOps.md`
- `extension/src/pi-agent/prompts/UI.md`
- `extension/src/pi-agent/prompts/Security.md`

### 2. extension/src/pi-agent/__tests__/agent-configurator.test.ts
- Import thêm `selectPrompt`.
- Thêm test `SA4E-371: prompt contains anti-hallucination guardrails` kiểm tra 7 role chứa 7 keywords guardrails.
- Thêm test `SA4E-371: selectPrompt returns prompt with guardrails` verify `selectPrompt` trả về prompt chứa anti-hallucination, evidence-first, kb-first.
- Tất cả 20 test pass.

### 3. Các file liên quan
- `prompt-template.service.ts` và `template-provider.ts` không cần thay đổi vì cơ chế load template hiện tại đã hỗ trợ. Nếu sau này chuyển sang template file, service có thể đọc từ `agentDir/prompts`.

## Commit
```bash
git commit -m "SA4E-371: refactor prompts to file templates"
```
Commit hash: 18de852

## Test
```bash
cd extension && npx vitest run src/pi-agent/__tests__/agent-configurator.test.ts
```
Kết quả: Test Files 1 passed, Tests 20 passed

## Tuân thủ
- Không tạo worktree mới, thực hiện trên branch main.
- Tuân thủ code standards, SOLID, không hardcode giá trị mới.
- Không tự viết BRD/FSD, chỉ cập nhật code theo thiết kế SA.
- Đọc TEMPLATE-DESIGN.md và RESEARCH-PROMPTS.md làm cơ sở thiết kế.

## Mem Ingest
- Implementation summary đã ingest vào KB với tags implementation, SA4E-371.
- Mem Ingest ID: TBD (cập nhật sau khi ingest)

## Diagram Index
| # | Diagram | File | Purpose |
|---|---------|------|---------|
| 1 | Prompt Template Architecture | PROMPT-TEMPLATE-ARCHITECTURE.drawio | Tổng quan kiến trúc prompt template với guardrails và luồng SDLC |

![Prompt Template Architecture](../PROMPT-TEMPLATE-ARCHITECTURE.png)

## Tóm tắt
System prompt của chatbox đã được refactor từ hardcode sang file templates `prompts/*.md` với guardrails evidence-first, KB-first, citation, tool usage, no workaround, ingest kinh nghiệm cho 8 role. Test tự động đảm bảo prompt luôn chứa guardrails keywords và load dynamic từ file.
