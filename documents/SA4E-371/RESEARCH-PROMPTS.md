# Nghiên cứu hiện trạng System Prompt cho Chatbox – SA4E-371

**Ticket:** SA4E-371 "Nâng cấp system prompt của chatbox để thêm anti-hallucination và evidence-first guardrails"
**Phạm vi mở rộng:** Toàn bộ SDLC tasks – review code, fix bug, implement CR/feature, tạo document BRD/FSD/TDD/STP/STC/UG/DPG/RLN
**Ngày:** 2026-10-18
**Agent:** BA

## 1. Hiện trạng hệ thống prompt

### 1.1 Nguồn prompt hiện tại

**File chính:**
- `extension/src/pi-agent/agent-configurator.ts`
  - `AGENT_PROMPTS: Record<AgentRole, string>` – 8 role với mô tả 1 dòng
  - `getSystemPromptForRole(role)` trả về chuỗi ngắn
  - `selectPrompt(modelId, role, options)` → `rolePromptFor` → `withTierTemplate` → `appendSystemMd`

**Prompt mặc định:**
```ts
export const AGENT_PROMPTS: Record<AgentRole, string> = {
  SM: 'SDLC Scrum Master – Business Analyst – coordinate agents and enforce quality gates.',
  BA: 'SDLC BA Agent – Business Analyst – create BRD and FSD.',
  SA: 'SDLC SA Agent – Solution Architect – create TDD and design.',
  DEV: 'SDLC DEV Agent – Developer – implement code and tests.',
  QA: 'SDLC QA Agent – Quality Assurance – create STP/STC and test.',
  DevOps: 'SDLC DevOps Agent – Deployment and CI/CD.',
  UI: 'SDLC UI Agent – User Interface design.',
  Security: 'SDLC Security Agent – Security review and assessment.',
};
export const DEFAULT_AGENT_PROMPT = 'SDLC Agent – complete the assigned SDLC phase task and enforce quality gates.';
```

**Template loading:**
- `extension/src/pi-agent/prompt-template.service.ts`
  - `PromptTemplateService` discover templates từ:
    - workspace `.pi/prompts` nếu trusted
    - `agentDir/prompts`
  - Hỗ trợ variant `full` / `compressed` theo model tier
  - `getPromptForTier(name, tier)` → load content, ước tính token
- `extension/src/commands/template-provider.ts`
  - `getLlmPrompt(type)` cung cấp prompt cho agent/hook/steering/skill generation – không liên quan trực tiếp tới chatbox runtime prompt
- Flow load template: `collectTemplateFiles` → `readTemplateFile` với size cap 256KB, symlink containment

### 1.2 Cơ chế tích hợp hiện tại
- `selectPrompt` → role prompt + optional tier template + append SYSTEM.md (nếu replace mode & trusted)
- Không có pipeline kiểm tra evidence/citation
- Không có yêu cầu output format chuẩn hóa cho SDLC artifacts
- Không có guardrails chống hallucination, no-workaround, KB-first, ingest

### 1.3 Guardrails hiện có trong quy tắc
- `.opencode/rules/sdlc/guardrails.md`: KB-first, Memory sync, Code-index freshness
- `.opencode/rules/sdlc/agent-self-learning.md`: Search Memory → Documents → Code trước khi hành động, Tool Discovery, Ingest kinh nghiệm, Ingest document sau khi tạo
- **Vấn đề:** Các quy tắc này là steering files cho agent, không được nhúng bắt buộc vào system prompt của chatbox. Agent có thể bỏ qua nếu prompt runtime không yêu cầu.

## 2. Phân tích thiếu sót

| Khía cạnh | Hiện trạng | Thiếu sót |
|-----------|------------|-----------|
| Độ dài & chi tiết | Prompt 1 dòng, generic | Không định nghĩa workflow, output schema, quality gates |
| Evidence-first | Không yêu cầu | Không bắt buộc `mem_search` / `code_search` / `grep_search` trước khi trả lời |
| Citation | Không yêu cầu | Không yêu cầu trích dẫn nguồn ticket, file, KB entry ID |
| KB-first | Chỉ là steering | Không enforce trong prompt → dễ hallucinate |
| Edit diff | Không yêu cầu | DEV/SA không bắt buộc output diff/ patch thay vì mô tả |
| No-workaround rule | Chỉ trong steering | Không được nhắc trong system prompt runtime |
| Ingest kinh nghiệm | Chỉ trong steering | Không yêu cầu `mem_ingest` sau khi hoàn thành task |
| Anti-hallucination | Không có | Không yêu cầu verify facts với nguồn, không yêu cầu "I don't know" khi thiếu dữ liệu |
| Role boundaries | Có danh sách role | Không mô tả CANNOT DO, dễ role creep |
| Document traceability | Không yêu cầu | Không yêu cầu tham chiếu BRD→FSD→TDD→STP |
| Output validation | Không có | Không yêu cầu self-check checklist trước khi trả lời |
| Model tier adaptation | Có compress | Không có prompt variant evidence-first cho small model |

## 3. Gap theo từng phase SDLC

### Phase 1 – Requirements (BA → BRD)
- Thiếu: yêu cầu đọc ticket + linked tickets + attachments + comments trước khi viết BRD
- Thiếu: citation ticket key cho mỗi requirement
- Thiếu: kiểm tra KB đã tồn tại BRD tương tự chưa

### Phase 2 – Specification (BA + UI + TA → FSD)
- Thiếu: yêu cầu trace từ BRD, trích dẫn BRD requirement ID
- Thiếu: yêu cầu verify data model với code-intelligence trước khi mô tả bảng/cột
- Thiếu: yêu cầu embed diagram PNG + drawio source

### Phase 3 – Design (SA → TDD)
- Thiếu: yêu cầu đọc code-intelligence project-structure + module analysis trước
- Thiếu: yêu cầu không phát minh tên bảng/cột, phải cite từ codebase
- Thiếu: yêu cầu discrepancy report nếu FSD thiếu

### Phase 4 – Test Planning (QA → STP/STC)
- Thiếu: yêu cầu phủ 100% BRD AC và FSD BR-XX
- Thiếu: yêu cầu citation BRD/FSD cho mỗi test case

### Phase 5 – Implementation (DEV → Code)
- Thiếu: yêu cầu edit diff / file patch, không mô tả văn bản
- Thiếu: yêu cầu search code trước khi viết mới
- Thiếu: yêu cầu tuân thủ code standards, lint, unit tests

### Phase 6 – Testing (QA → Execution)
- Thiếu: yêu cầu evidence từ test run log

### Phase 7 – Deployment (DevOps → DPG/RLN)
- Thiếu: yêu cầu cite CI/CD config hiện có

### Cross-cutting – Review code / Fix bug / Implement CR
- Thiếu: evidence-first: phải cung cấp file path + line numbers
- Thiếu: no-workaround: yêu cầu fix root cause, không bypass
- Thiếu: KB-first search trước khi đề xuất giải pháp

## 4. Đề xuất guardrails cho system prompt nâng cấp

### 4.1 Core Anti-Hallucination Guardrails – áp dụng cho mọi role
1. **Evidence-First**: Trước mọi kết luận, phải thực hiện:
   - `mem_search("<query>")`
   - `grep_search("<keyword>", includePattern="documents/**/*.md")`
   - `code_search("<symbol>")` nếu liên quan code
   - Chỉ đưa ra kết luận khi có nguồn
2. **Citation Bắt buộc**: Mọi statement phải kèm citation:
   - Ticket key: `SA4E-XXX`
   - File path + line
   - KB entry ID
   - Format: `[Source: ...]`
3. **Unknown Handling**: Nếu không tìm thấy nguồn, trả về `I don't have enough evidence` + danh sách nguồn đã tìm
4. **KB-First**: Không viết document mới nếu `mem_search` cho thấy đã tồn tại
5. **Ingest Sau Hoàn Thành**: Sau khi tạo document, phải `mem_ingest_file` và `mem_ingest` lesson learned
6. **No Workaround**: Không tạo wrapper/helper mới nếu hệ thống đã có mechanism; fix root cause
7. **Role Boundaries**: Luôn kiểm tra scope trước khi hành động; nếu ngoài scope → từ chối và chỉ định agent đúng

### 4.2 Guardrails theo role

**BA:**
- Phải đọc main ticket + linked issues + subtasks + comments + attachments
- Mọi User Story phải trace về Acceptance Criteria
- Ingest BRD/FSD vào KB sau khi tạo
- Không phát minh data field, phải cite từ ticket

**SA:**
- Phải đọc code-intelligence `project-structure.md` và module analysis trước khi viết TDD
- Data model phải cite tên bảng/cột thực tế từ code
- Nếu FSD thiếu thông tin → tạo DISCREPANCY.md

**DEV:**
- Output phải là edit diff / patch, không mô tả
- Phải search code trước khi tạo file mới
- Tuân thủ SOLID, 200 lines/file, 20 lines/function
- Sau code change → `mem_ingest`

**QA:**
- Test case phải map 1-1 với BRD AC và FSD BR-XX
- Expected result phải khớp business behavior

**DevOps:**
- Không được chạy `docker compose down -v` trên prod
- Phải backup DB trước thay đổi

**UI:**
- Wireframe phải cover tất cả User Story

### 4.3 Prompt template structure đề xuất
```
[ROLE IDENTITY]
[SDLC PHASE CONTEXT]
[EVIDENCE-FIRST PROTOCOL]
[KB-FIRST & INGEST PROTOCOL]
[ANTI-HALLUCINATION RULES]
[NO-WORKAROUND RULE]
[OUTPUT FORMAT & CITATION REQUIREMENTS]
[ROLE BOUNDARIES - CANNOT DO]
[QUALITY GATES]
[EXAMPLE]
```
Mỗi role có variant `full` và `compressed` cho small model.

## 5. Kiến nghị triển khai

1. Thay thế `AGENT_PROMPTS` bằng template có cấu trúc dài, evidence-first
2. Lưu templates trong `agentDir/prompts/{role}-{phase}.md` và `agentDir/prompts/{role}-{phase}.compressed.md`
3. Cập nhật `agent-configurator.ts` để `getSystemPromptForRole` load từ template thay vì hardcode
4. Thêm `PromptMode` mới `evidence` để enforce citation
5. Thêm pre-flight check trong `selectPrompt`: nếu prompt không chứa evidence guardrails → cảnh báo
6. Ingest báo cáo này vào KB để các agent tham khảo khi nâng cấp prompt

## 6. Kết luận

Hiện tại system prompt cho chatbox quá ngắn/generic, không enforce evidence-first, citation, KB-first, no-workaround, ingest. Cần nâng cấp toàn diện theo hướng anti-hallucination và evidence-first guardrails cho tất cả SDLC phases, đảm bảo mỗi output có thể trace về nguồn.

Báo cáo này là cơ sở cho task SA4E-371.
