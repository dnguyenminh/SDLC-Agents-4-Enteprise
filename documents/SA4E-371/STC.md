# Software Test Cases (STC)

## SDLC Agents 4 Enterprise — SA4E-371: Nâng cấp system prompt

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-371 |
| Title | Nâng cấp system prompt anti-hallucination |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-10-18 |
| Status | Draft |
| Related STP | STP-v1.0-SA4E-371.md |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-18 | QA Agent | Initiate test cases |

---

## Test Case Summary

| Category | ID Range | Count | Priority |
|----------|----------|-------|----------|
| Functional — Happy Path | TC-001 to TC-005 | 5 | High |
| Integration — Prompt Template Load | TC-006 | 1 | Medium |

---

## 1. Functional Test Cases — Happy Path

### TC-001: Prompt chứa KB-first instruction

| Field | Value |
|-------|-------|
| **ID** | TC-001 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | TEMPLATE-DESIGN §2 KB-FIRST, Guardrails |
| **Preconditions** | agent-configurator.ts loaded, getSystemPromptForRole exists |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call getSystemPromptForRole('BA') | Prompt returned |
| 2 | Check prompt contains keyword 'KB-first' or 'mem_search' | Keyword present |
| 3 | Repeat for roles SA, DEV, QA, DevOps, UI, Security | All contain KB-first instruction |

**Test Data:** Role = BA, SA, DEV, QA, DevOps, UI, Security
**Postconditions:** KB-first guardrail verified

---

### TC-002: Prompt chứa citation requirement

| Field | Value |
|-------|-------|
| **ID** | TC-002 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | TEMPLATE-DESIGN §2 CITATION |
| **Preconditions** | Prompt available |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Get prompt for role DEV | Prompt returned |
| 2 | Verify prompt contains 'citation' | Contains 'citation required' |
| 3 | Verify prompt mentions file:line format | Contains 'citation' |

**Test Data:** Role = DEV
**Postconditions:** Citation requirement verified

---

### TC-003: Prompt cấm claim resolved không có diff

| Field | Value |
|-------|-------|
| **ID** | TC-003 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | TEMPLATE-DESIGN §2 EVIDENCE-FIRST |
| **Preconditions** | Prompt loaded |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Get prompt for role DEV | Prompt returned |
| 2 | Check prompt contains 'evidence-first' and 'edit diff' or 'git diff' | Keyword present |
| 3 | Check prompt mentions cấm claim "fixed/resolved" without diff | Present |

**Test Data:** Role = DEV, SA
**Postconditions:** Evidence-first guardrail verified

---

### TC-004: Prompt chứa no workaround rule

| Field | Value |
|-------|-------|
| **ID** | TC-004 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | TEMPLATE-DESIGN §2 NO WORKAROUND |
| **Preconditions** | Prompt loaded |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Get prompt for role QA | Prompt returned |
| 2 | Verify prompt contains 'no workaround' | Contains phrase |
| 3 | Verify prompt mentions 'fix root cause' | Present |

**Test Data:** Role = QA, BA
**Postconditions:** No workaround rule verified

---

### TC-005: Prompt yêu cầu ingest kinh nghiệm

| Field | Value |
|-------|-------|
| **ID** | TC-005 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | TEMPLATE-DESIGN §2 INGEST KNOWLEDGE |
| **Preconditions** | Prompt loaded |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Get prompt for role BA | Prompt returned |
| 2 | Check prompt contains 'Ingest kinh nghiệm' or 'mem_ingest' | Keyword present |
| 3 | Repeat for all roles | All contain ingest instruction |

**Test Data:** Roles BA, SA, DEV, QA
**Postconditions:** Ingest requirement verified

---

### TC-006: Verify prompt load from file template after DEV refactor

| Field | Value |
|-------|-------|
| **ID** | TC-006 |
| **Priority** | Medium |
| **Type** | Integration |
| **Requirement** | PromptTemplateService load from `.pi/prompts` |
| **Preconditions** | Template files ba.md/ba.compressed.md exist in tmp dir |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create PromptTemplateService with tmpDir containing ba.md | Service discovers template |
| 2 | Call selectPrompt('phi-3-mini','BA',{templateService, templateName:'ba'}) | Returns compressed variant |
| 3 | Call selectPrompt('claude-3-opus','BA',{templateService, templateName:'ba'}) | Returns full variant |
| 4 | Verify prompt contains template content | Content present |

**Test Data:** tmpDir with `.pi/prompts/ba.md` and `ba.compressed.md`
**Postconditions:** Prompt load from file template verified

---

## 2. Requirements Traceability Matrix

| Requirement | Source | Test Cases | Status |
|-------------|--------|------------|--------|
| KB-first instruction | TEMPLATE-DESIGN §2 | TC-001 | Covered |
| Citation requirement | TEMPLATE-DESIGN §2 | TC-002 | Covered |
| Evidence-first no claim without diff | TEMPLATE-DESIGN §2 | TC-003 | Covered |
| No workaround rule | TEMPLATE-DESIGN §2 | TC-004 | Covered |
| Ingest kinh nghiệm | TEMPLATE-DESIGN §2 | TC-005 | Covered |
| Prompt load from file template | PromptTemplateService | TC-006 | Covered |

**Coverage Summary:**
| Category | Total | Covered | Coverage % |
|----------|-------|---------|------------|
| Guardrails | 5 | 5 | 100% |
| Integration | 1 | 1 | 100% |

---

## Appendix
Test data: agent-configurator.ts AGENT_PROMPTS
