# User Guide (UG)

## SDLC Agents 4 Enterprise — SA4E-371: Nâng cấp system prompt của chatbox để thêm anti-hallucination và evidence-first guardrails

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-371 |
| Title | Nâng cấp system prompt của chatbox để thêm anti-hallucination và evidence-first guardrails |
| Author | DEV Agent |
| Reviewer | BA Agent |
| Version | 1.0 |
| Date | 2026-10-23 |
| Status | Draft |
| Related BRD | BRD-v1.0-SA4E-371.md |
| Related FSD | FSD-v1.0-SA4E-371.md |
| Related TDD | TDD-v1.0-SA4E-371.md |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-23 | DEV Agent | Initial document |

---

## 1. Introduction

### 1.1 Purpose

User Guide này mô tả cách sử dụng phiên bản v1.53.11 của SDLC Agents 4 Enterprise sau khi nâng cấp system prompt chatbox với guardrails anti-hallucination, KB-first, citation bắt buộc và evidence-first. Tài liệu dành cho người dùng chatbox, system administrator và developer muốn cấu hình prompt templates.

### 1.2 Audience

| Audience | What They Need |
|----------|---------------|
| End User / AI Agent User | Hiểu thay đổi hiển thị trong chatbox, cách nhận citations và evidence |
| System Administrator | Cài đặt extension, xác minh guardrails hoạt động, cấu hình prompt files |
| Developer | Mở rộng prompt template, thêm role/phase mới, tuân thủ No Workaround Rule |

### 1.3 Prerequisites

| Prerequisite | Version | Required |
|-------------|---------|----------|
| SDLC Agents 4 Enterprise Extension | v1.53.11 | Yes |
| Kiro IDE | latest | Yes |
| Knowledge Base service | enabled | Yes |
| Prompt template files | extension/src/pi-agent/prompts | Yes |

---

## 2. Getting Started

> **IMPORTANT:** Hướng dẫn cho người dùng tải release. Không bao gồm build from source.

### 2.1 Quick Start

```bash
# Step 1: Download the release
# VSIX: extension/sdlc-agents-4-enterprise-1.53.11.vsix

# Step 2: Install in Kiro
code --install-extension sdlc-agents-4-enterprise-1.53.11.vsix

# Step 3: Verify version
# Mở Command Palette → SDLC Agents: Show Version → 1.53.11

# Step 4: Verify
# Mở SDLC Agents chat, chọn role BA/SA/DEV/QA và gửi truy vấn test
# Kiểm tra response có chứa [Source: ...] và KB search log
```

### 2.2 System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| Extension | 1.53.11 | 1.53.11 |
| Memory | 2 GB | 4 GB |
| Disk | 100 MB | 500 MB |
| OS | Windows/macOS/Linux | Windows 11 |

### 2.3 Distribution Formats

| Format | How to Get | Use Case |
|--------|-----------|----------|
| VSIX | extension/sdlc-agents-4-enterprise-1.53.11.vsix | Cài đặt Kiro |

### 2.4 Configuration Methods

Prompt templates được load từ:

| Method | Priority | Best For |
|--------|----------|----------|
| extension/src/pi-agent/prompts/*.md | 1 | Role/phase prompt mặc định |
| .pi/prompts trong workspace trusted | 2 | Override user-specific |
| AGENT_PROMPTS fallback | 3 | Khi template missing |

**Minimal working example**

Prompt file mẫu nằm tại `extension/src/pi-agent/prompts/role-phase.md` với cấu trúc:
```
[ROLE IDENTITY]
[SDLC PHASE CONTEXT]
[EVIDENCE-FIRST PROTOCOL]
[KB-FIRST & INGEST PROTOCOL]
[ANTI-HALLUCINATION RULES]
[NO-WORKAROUND RULE]
[OUTPUT FORMAT & CITATION REQUIREMENTS]
```

### 2.5 Verify Configuration

- Check 1: Extension version hiển thị 1.53.11 trong status bar
- Check 2: Mở chatbox, chọn role BA → system prompt chứa "KB-FIRST" và "CITATION"
- Check 3: Truy vấn "Tạo BRD cho SA4E-371" → response kèm citation `[Source: documents/SA4E-371/BRD.md:...]`
- Common issues:
  - Prompt không load → kiểm tra file prompts tồn tại và extension trusted
  - Không có citation → mem_search thất bại, kiểm tra KB service

---

## 3. Configuration

### 3.1 Configuration File

Prompt templates là file markdown trong `extension/src/pi-agent/prompts/`. PromptTemplateService load variant `full`/`compressed` theo model tier.

### 3.2 Configuration Reference

#### Prompt Template Settings

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| tier | enum | full | full/compressed theo model size |
| role | enum | BA/SA/DEV/QA/DevOps/UI/Security/SM | Agent role |
| guardrails.enabled | boolean | true | Bật anti-hallucination guardrails |
| citation.required | boolean | true | Bắt buộc citation cho mọi claim |

### 3.3 Environment Variables

Không áp dụng cho user; cấu hình qua file.

### 3.4 Configuration Examples

#### Minimal Configuration
```yaml
# .pi/prompts/override.md
role: BA
tier: compressed
guardrails:
  kb_first: true
  citation: true
```

#### Full Configuration
```markdown
Bạn là BA Agent cho ticket {TICKET}.
GUARDRAILS BẮT BUỘC:
1. KB-FIRST: mem_search("{TICKET} BRD")
2. Citation: mọi requirement phải cite Jira field:line
3. Ingest: mem_ingest_file sau khi tạo
```

---

## 4. Usage

### 4.1 Sử dụng chatbox với guardrails evidence-first

**Description:** Khi người dùng gửi yêu cầu SDLC, system prompt được inject guardrails và agent phải search KB trước khi trả lời.

**How to use:**
```
1. Mở SDLC Agents chat
2. Chọn role phù hợp
3. Nhập yêu cầu: "Tạo TDD cho SA4E-371"
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| role | enum | Yes | BA/SA/DEV/QA... |
| query | string | Yes | Yêu cầu SDLC |
| ticket | string | No | Jira key để citation |

**Example:**
```
User: Tạo BRD cho SA4E-371
Agent: [Search KB...] [Read Jira SA4E-371] 
Output BRD với citation [Source: Jira SA4E-371:description]
```

**Expected Output:**
- Document kèm citation file:line
- Log mem_search đã thực hiện
- Cảnh báo nếu không tìm thấy evidence

### 4.2 Code Review anti-hallucination

**Description:** Prompt DEV review yêu cầu read file trước, trích file:line chính xác, cấm claim resolved không có diff.

**Example:**
```
Finding: extension/src/pi-agent/agent-configurator.ts:17 — biến agentId không khởi tạo
Evidence: git diff + test log
```

### 4.3 Prompt template customization

**Description:** Admin có thể thêm template mới trong `extension/src/pi-agent/prompts/`.

**Steps:**
1. Tạo file `role-phase.md`
2. Đảm bảo chứa keywords: citation, evidence, mem_search
3. Restart extension → PromptTemplateService tự phát hiện

---

## 5. User Interface Guide

### 5.1 Screen Overview

| # | Screen | Path | Purpose |
|---|--------|------|---------|
| 1 | SDLC Agents Chat | Command Palette → SDLC Agents: Open Chat | Giao tiếp với agent có guardrails |
| 2 | Prompt Config | extension/src/pi-agent/prompts | Xem/sửa template |

### 5.2 SDLC Agents Chat

**Key Elements:**
| # | Element | Type | Description |
|---|---------|------|-------------|
| 1 | Role selector | Dropdown | Chọn BA/SA/DEV/QA... |
| 2 | Message input | Text | Nhập yêu cầu SDLC |
| 3 | Response | Text | Output kèm citation [Source: ...] |
| 4 | Evidence log | Collapsible | mem_search / code_search log |

**User Actions:**
| Action | Steps | Expected Result |
|--------|-------|-----------------|
| Gửi yêu cầu có citation | 1. Chọn role 2. Nhập query | Response kèm [Source: file:line] |
| Kiểm tra guardrails | 1. Mở log evidence | Hiển thị mem_search đã chạy |

---

## 6. Administration

### 6.1 Thêm Prompt Template Mới

**Steps:**
1. Tạo file `extension/src/pi-agent/prompts/{role}-{phase}.md`
2. Áp dụng Common Guardrails: KB-FIRST, CITATION, EVIDENCE-FIRST, NO WORKAROUND, INGEST
3. Kiểm tra PromptTemplateService load thành công
4. Verify bằng cách start chat session với role tương ứng

### 6.2 Monitoring Health

- Kiểm tra DEPLOY-REPORT.md: version v1.53.11, commit 982bfc5
- Post-deploy test: PASS cho BA/SA/DEV/QA
- Log location: extension logs → prompt load events

### 6.3 Hot-Reload Configuration

Thay đổi file prompt trong `extension/src/pi-agent/prompts/` có hiệu lực sau khi reload window Kiro. Không cần rebuild VSIX.

---

## 7. Troubleshooting

### 7.1 Common Issues

| # | Symptom | Cause | Solution |
|---|---------|-------|----------|
| 1 | Response không có citation | Prompt template missing guardrails | Kiểm tra file prompt chứa từ khóa citation |
| 2 | Agent hallucinate khi KB thiếu | mem_search trả về empty và agent bịa | Guardrails yêu cầu trả về "I don't have enough evidence" |
| 3 | Prompt không load, fallback default | File template không tồn tại | Tạo file hoặc kiểm tra đường dẫn |
| 4 | Edit diff không hiển thị | DEV prompt không yêu cầu output diff | Sử dụng template T-DEV-01/02 đúng |

### 7.2 Error Codes

| Code | Message | Description | Action |
|------|---------|-------------|--------|
| TEMPLATE_MISSING | Prompt fallback to default | File không tồn tại | Tạo template |
| KB_SEARCH_FAIL | Evidence not found | mem_search lỗi | Kiểm tra KB service |

### 7.3 Logs

| Log Location | Content | Useful For |
|-------------|---------|------------|
| Extension Output | Prompt load events | Debug guardrails |
| POST-DEPLOY-TEST.md | Manual test results | Verify deploy |

### 7.4 FAQ

**Q: Người dùng thấy gì khác trong chatbox sau nâng cấp?**
A: Response luôn kèm citation [Source: file:line], log evidence search hiển thị, cảnh báo khi thiếu dữ liệu thay vì hallucinate.

**Q: Cách config prompt files?**
A: Sửa file markdown trong `extension/src/pi-agent/prompts/`. PromptTemplateService tự phát hiện full/compressed variant.

**Q: Guardrails có áp dụng cho mọi agent?**
A: Có, Common Guardrails áp dụng cho 8 role, phase-specific template bổ sung thêm.

---

## 8. API Reference

Không áp dụng API công khai. Prompt loading nội bộ qua `selectPrompt(modelId, role, options)`.

---

## 9. Appendix

### 9.1 Glossary

| Term | Definition |
|------|------------|
| Evidence-First | Mọi claim phải có citation và evidence từ source |
| Anti-Hallucination | Guardrails ngăn AI bịa thông tin |
| KB-FIRST | Bắt buộc search knowledge base trước khi hành động |
| No Workaround | Cấm tạo wrapper/helper mới, phải fix root cause |

### 9.2 Related Documents

| Document | Location |
|----------|----------|
| BRD | documents/SA4E-371/BRD.md |
| FSD | documents/SA4E-371/FSD.md |
| TDD | documents/SA4E-371/TDD.md |
| DEPLOY-REPORT | documents/SA4E-371/DEPLOY-REPORT.md |
| POST-DEPLOY-TEST | documents/SA4E-371/POST-DEPLOY-TEST.md |

### 9.3 Version Compatibility

| System Version | Config Version | Breaking Changes |
|---------------|---------------|-----------------|
| 1.53.11 | v1 | Nâng cấp prompt, không breaking code |
