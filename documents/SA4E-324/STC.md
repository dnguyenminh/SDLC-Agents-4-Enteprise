# Software Test Cases (STC)

## Pi Context Budget + Model Registry for small-context models — SA4E-324: Pi Context Budget + Model Registry for small-context models

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-324 |
| Title | Pi Context Budget + Model Registry for small-context models |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-09-26 |
| Status | Draft |
| Related STP | STP-v1.0-SA4E-324.docx |
| Related FSD | FSD-v1.0-SA4E-324.docx |

---

## Test Case Summary

| Category | ID Range | Count | Priority |
|----------|----------|-------|----------|
| Functional — Happy Path | TC-001 to TC-099 | 2 | High |
| Functional — Alternative Flows | TC-100 to TC-199 | 1 | High |
| Functional — Exception/Error Flows | TC-200 to TC-299 | 2 | High |
| Business Rule Validation | TC-300 to TC-399 | 2 | High |
| Boundary & Negative Testing | TC-400 to TC-499 | 1 | Medium |
| Non-Functional | TC-600 to TC-699 | 1 | Medium |

---

## 1. Functional Test Cases — Happy Path

### TC-001: Register and query small-context model in Model Registry

| Field | Value |
|-------|-------|
| **ID** | TC-001 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-01, BR-01, BR-02, BR-03, Story 1 |
| **Preconditions** | Model Registry schema unified, chat-models.ts editable |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Add model entry modelId=phi-3-mini, contextWindow=2048, maxOutput=512 | Entry accepted |
| 2 | SessionConfigurator loads registry on start | Registry loaded |
| 3 | Query registry by modelId phi-3-mini | Returns metadata with contextWindow=2048, maxOutput=512 |

**Test Data:** modelId=phi-3-mini, contextWindow=2048, maxOutput=512, costPer1k=0.0002, speed=fast
**Postconditions:** Model queryable for session creation

---

### TC-002: Context budget calculation within limit for small model

| Field | Value |
|-------|-------|
| **ID** | TC-002 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-02, BR-04, BR-05, Story 2 |
| **Preconditions** | Model phi-3-mini registered |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Request session with phi-3-mini, system~7500 chars, tool 500 tokens, retrieval 300, history 200 | Budget calculated |
| 2 | Verify estimatedTokens = system + tool + retrieval + history + reserve 2000 | Total ~ 2048*0.8 |
| 3 | Verify usagePercent < 85% | Decision ALLOW |

**Test Data:** systemPromptChars=7500, toolSchemaTokens=500, retrievalTokens=300, historyTokens=200, reserve=2000
**Postconditions:** Budget stored in session diagnostics

---

## 2. Functional Test Cases — Alternative Flows

### TC-101: Model not found fallback to default

| Field | Value |
|-------|-------|
| **ID** | TC-101 |
| **Priority** | High |
| **Type** | Functional — Alternative Flow |
| **Requirement** | UC-01 AF-1 |
| **Preconditions** | Registry contains phi-3-mini only |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Request session with modelId=unknown-model | |
| 2 | System attempts query | Model not found |
| 3 | Verify fallback to default model + diagnostics log | Fallback executed, log created |

**Test Data:** modelId=unknown-model
**Postconditions:** Session created with default model

---

## 3. Functional Test Cases — Exception/Error Flows

### TC-201: Budget >95% rejects session

| Field | Value |
|-------|-------|
| **ID** | TC-201 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | UC-03, BR-06, Story 3 |
| **Preconditions** | Model smollm2-360m contextWindow=1024 registered |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Request session with large history causing usage 98% | |
| 2 | System compares usagePercent | |
| 3 | Verify session rejected with message "usage 98% >95% threshold. Reduce history/retrieval." | Rejection message shown |

**Test Data:** estimatedTokens=1000, contextWindow=1024 → usage 97.6%
**Postconditions:** Session not created

---

### TC-202: Budget >85% shows warning

| Field | Value |
|-------|-------|
| **ID** | TC-202 |
| **Priority** | Medium |
| **Type** | Functional — Exception Flow |
| **Requirement** | UC-03, BR-07 |
| **Preconditions** | Model llama3.1 8k registered |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Request session with usage 90% | |
| 2 | Verify system returns decision WARN | Warning displayed |
| 3 | Verify session allowed after user ack | Session created |

**Test Data:** usagePercent=90
**Postconditions:** Session created with warning logged

---

## 4. Business Rule Validation

### TC-301: Validate contextWindow >0 and maxOutput <= contextWindow

| Field | Value |
|-------|-------|
| **ID** | TC-301 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-01, BR-02 |
| **Preconditions** | Registry validation active |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Attempt to register model with contextWindow=0 | Validation error rejected |
| 2 | Attempt to register model with maxOutput=3000, contextWindow=2048 | Validation error rejected |
| 3 | Register valid model | Accepted |

**Test Data:** contextWindow=0; maxOutput=3000/contextWindow=2048
**Postconditions:** Invalid entries rejected

---

### TC-302: ThinkingLevel mapping respects maxOutput

| Field | Value |
|-------|-------|
| **ID** | TC-302 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | UC-04, BR-08, Story 4 |
| **Preconditions** | Model qwen-coder registered with maxOutput=1024 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Select thinkingLevel=high for qwen-coder | |
| 2 | Verify maxTokens mapped <= maxOutput | maxTokens capped at 1024 |
| 3 | Select low → maxTokens smaller | Mapping correct |

**Test Data:** thinkingLevel low/medium/high mapping table
**Postconditions:** maxTokens set per model

---

## 5. Boundary & Negative Testing

### TC-401: Reserve minimum 2000 tokens enforced

| Field | Value |
|-------|-------|
| **ID** | TC-401 |
| **Priority** | Medium |
| **Type** | Boundary / Negative |
| **Requirement** | BR-04 |
| **Preconditions** | Budget calculator active |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Calculate budget with reserve=1999 | Conservative estimate + warn |
| 2 | Verify reserve forced to 2000 | Reserve minimum enforced |

**Test Data:** reserve=1999
**Postconditions:** Budget calculation uses 2000

---

## 6. Non-Functional Testing

### TC-601: Budget calculation performance <100ms

| Field | Value |
|-------|-------|
| **ID** | TC-601 |
| **Priority** | Medium |
| **Type** | Non-Functional — Performance |
| **Requirement** | FSD 8 Performance |
| **Preconditions** | SIT environment |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Trigger budget calculation 100 times | |
| 2 | Measure avg duration | Avg <100ms per session |

**Acceptance Criteria:** Budget calculation <100ms per session

---

## 10. Requirements Traceability Matrix (RTM)

| Requirement | Source | Test Cases | Coverage |
|-------------|--------|------------|----------|
| UC-01 | FSD 3.1 | TC-001, TC-101, TC-301 | Covered |
| UC-02 | FSD 3.2 | TC-002, TC-401 | Covered |
| UC-03 | FSD 3.3 | TC-201, TC-202 | Covered |
| UC-04 | FSD 3.4 | TC-302 | Covered |
| BR-01 | FSD 3.1.3 | TC-301 | Covered |
| BR-02 | FSD 3.1.3 | TC-301 | Covered |
| BR-03 | FSD 3.1.3 | TC-001 | Covered |
| BR-04 | FSD 3.2.3 | TC-002, TC-401 | Covered |
| BR-05 | FSD 3.2.3 | TC-002 | Covered |
| BR-06 | FSD 3.3.3 | TC-201 | Covered |
| BR-07 | FSD 3.3.3 | TC-202 | Covered |
| BR-08 | FSD 3.4.3 | TC-302 | Covered |
| Story 1 AC-1 | BRD 2.3 | TC-001 | Covered |
| Story 2 AC-1 | BRD 2.3 | TC-002 | Covered |
| Story 3 AC-1 | BRD 2.3 | TC-201 | Covered |
| Story 4 AC-1 | BRD 2.3 | TC-302 | Covered |

**Coverage Summary:**

| Category | Total | Covered | Coverage % |
|----------|-------|---------|------------|
| Use Cases | 4 | 4 | 100% |
| Business Rules | 8 | 8 | 100% |
| Acceptance Criteria | 4 | 4 | 100% |
| **Overall** | **16** | **16** | **100%** |

---

## 11. Appendix

### Test Data Setup Scripts
Registry seed in chat-models.ts with models: phi-3-mini, smollm2-360m, llama3.1 8k, qwen-coder, lmstudio local.
