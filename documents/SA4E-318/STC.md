# Software Test Cases (STC)

## SDLC Agents 4 Enterprise — SA4E-318: Add Prompt Templates + configure Settings/Models/Credentials

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-318 |
| Title | Add Prompt Templates + configure Settings/Models/Credentials |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-09-25 |
| Status | Draft |
| Related STP | STP-v1.0-SA4E-318.docx |
| Related FSD | FSD-v1.0-SA4E-318.docx |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-25 | QA Agent | Initiate document — auto-generated from FSD use cases and business rules |

---

## Test Case Summary

| Category | ID Range | Count | Priority |
|----------|----------|-------|----------|
| Functional — Happy Path | TC-001 to TC-099 | 3 | High |
| Functional — Alternative Flows | TC-100 to TC-199 | 2 | High |
| Functional — Exception/Error Flows | TC-200 to TC-299 | 5 | High |
| Business Rule Validation | TC-300 to TC-399 | 6 | High |
| Boundary & Negative Testing | TC-400 to TC-499 | 3 | Medium |
| UI/UX Testing | TC-500 to TC-599 | 2 | Medium |
| Non-Functional (Performance, Security) | TC-600 to TC-699 | 2 | Medium |
| Integration Testing | TC-700 to TC-799 | 2 | High |
| Regression Testing | TC-800 to TC-899 | 1 | Medium |

---

## 1. Functional Test Cases — Happy Path

### TC-001: Discover prompt template via slash command

| Field | Value |
|-------|-------|
| **ID** | TC-001 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-1, BR-1, BR-2, Story 1 |
| **Preconditions** | Prompt templates exist in .pi/prompts/brd.md, fsd.md |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | User types /brd in chat input | Autocomplete shows brd |
| 2 | Select /brd | ResourceLoader discovers template |
| 3 | Session injects prompt content | Prompt content loaded successfully |

**Test Data:** templateName=brd, templatePath=.pi/prompts/brd.md
**Postconditions:** Session ready with injected prompt

---

### TC-002: Model + thinkingLevel configuration creates session

| Field | Value |
|-------|-------|
| **ID** | TC-002 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-2, BR-3, BR-4, Story 2 |
| **Preconditions** | Supported model list available |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Configure model=gpt-4o-mini, thinkingLevel=medium | Validation passes |
| 2 | Call createAgentSession(params) | Session initializes with model |
| 3 | Verify session config | Model and thinkingLevel set correctly |

**Test Data:** model=gpt-4o-mini, thinkingLevel=medium
**Postconditions:** Session active with correct model

---

### TC-003: Settings and credentials load successfully

| Field | Value |
|-------|-------|
| **ID** | TC-003 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-3, BR-5, BR-6, Story 3 |
| **Preconditions** | Settings file valid JSON, credential env var exists |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Set settingsSource=file, credentialKey=openai_api_key | Config accepted |
| 2 | Load settings via settingsManager | Settings loaded without errors |
| 3 | Resolve credential reference env:OPENAI_KEY | Credential resolved, secret not hardcoded |

**Test Data:** settingsSource=file, credentialKey=openai_api_key, credentialValueRef=env:OPENAI_KEY
**Postconditions:** Session initialized with secure config

---

## 2. Functional Test Cases — Alternative Flows

### TC-100: promptsOverride merges additional templates

| Field | Value |
|-------|-------|
| **ID** | TC-100 |
| **Priority** | High |
| **Type** | Functional — Alternative Flow |
| **Requirement** | UC-1 AF-1 |
| **Preconditions** | Base templates exist, promptsOverride provided |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Provide promptsOverride with extra template | Override accepted |
| 2 | Call getPrompts() | List includes base + override templates |
| 3 | Invoke /overrideTemplate | Prompt injected correctly |

**Test Data:** promptsOverride={name:deploy, path:/custom/deploy.md}
**Postconditions:** Merged template list available

---

### TC-101: scopedModels passed to session

| Field | Value |
|-------|-------|
| **ID** | TC-101 |
| **Priority** | High |
| **Type** | Functional — Alternative Flow |
| **Requirement** | UC-2 |
| **Preconditions** | Session config supports scopedModels |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Configure scopedModels=[modelA, modelB] | Config accepted |
| 2 | Create session | Session contains scopedModels |
| 3 | Verify modelRuntime selection | Correct runtime used |

**Test Data:** scopedModels=["gpt-4o-mini","claude-3"]
**Postconditions:** Session scoped correctly

---

## 3. Functional Test Cases — Exception/Error Flows

### TC-200: Template not found shows error message

| Field | Value |
|-------|-------|
| **ID** | TC-200 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | UC-1 EF-1, Error NG-TEMPLATE-NOT-FOUND |
| **Preconditions** | No template with name nonexist |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | User types /nonexist | System searches templates |
| 2 | Template not found | Message "Template 'nonexist' không tồn tại" shown |
| 3 | Available list displayed | User sees existing templates |

**Test Data:** templateName=nonexist
**Postconditions:** System stable, no crash

---

### TC-201: Load error logs diagnostic and returns available list

| Field | Value |
|-------|-------|
| **ID** | TC-201 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | UC-1 EF-2 |
| **Preconditions** | Template path inaccessible |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Trigger discovery with bad path | Load error caught |
| 2 | Check logs | Diagnostic logged |
| 3 | Verify response | Available templates list returned excluding bad one |

**Test Data:** templatePath=/invalid/path.md
**Postconditions:** Partial success, system stable

---

### TC-202: Invalid model fallback to default

| Field | Value |
|-------|-------|
| **ID** | TC-202 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | UC-2 EF-1 |
| **Preconditions** | Model 'unknown-model' not supported |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Configure model=unknown-model | Validation detects invalid |
| 2 | Create session | Fallback to default model |
| 3 | Check logs | Warning logged |

**Test Data:** model=unknown-model
**Postconditions:** Session created with default model

---

### TC-203: Missing credential blocks session init

| Field | Value |
|-------|-------|
| **ID** | TC-203 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | UC-3 EF-1 |
| **Preconditions** | credentialKey not found in store |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Set credentialKey=missing_key | Resolution attempted |
| 2 | Create session | Error "Credential key 'missing_key' not found" |
| 3 | Verify session not created | Init blocked |

**Test Data:** credentialKey=missing_key
**Postconditions:** System secure, no secret leak

---

### TC-204: Settings parse error uses default

| Field | Value |
|-------|-------|
| **ID** | TC-204 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | UC-3 EF-2 |
| **Preconditions** | Settings file contains invalid JSON |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Point settingsSource to invalid JSON file | Parse attempted |
| 2 | Parse fails | Default settings used |
| 3 | Check logs | Error logged |

**Test Data:** settings file with syntax error
**Postconditions:** Session created with defaults

---

## 4. Business Rule Validation

### TC-300: templateName validation lowercase hyphen

| Field | Value |
|-------|-------|
| **ID** | TC-300 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-1 |
| **Preconditions** | - |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create template with name 'BRD' | Rejected or normalized to lowercase |
| 2 | Create template with name 'my-template' | Accepted |

**Test Data:** templateName=BRD, my-template
**Postconditions:** Only valid names allowed

---

### TC-301: templatePath must exist

| Field | Value |
|-------|-------|
| **ID** | TC-301 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-2 |
| **Preconditions** | - |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Register template with non-existent path | Rejected |
| 2 | Register with existing path | Accepted |

**Test Data:** templatePath=.pi/prompts/missing.md
**Postconditions:** Path validation enforced

---

### TC-302: thinkingLevel enum validation

| Field | Value |
|-------|-------|
| **ID** | TC-302 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-3 |
| **Preconditions** | - |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Set thinkingLevel=high | Accepted |
| 2 | Set thinkingLevel=invalid | Rejected |

**Test Data:** thinkingLevel=low/medium/high/invalid
**Postconditions:** Enum enforced

---

### TC-303: model supported validation

| Field | Value |
|-------|-------|
| **ID** | TC-303 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-4 |
| **Preconditions** | - |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Set supported model | Accepted |
| 2 | Set unsupported model | Fallback/warning |

**Test Data:** model=gpt-4o-mini
**Postconditions:** Only supported models used

---

### TC-304: credentialValueRef reference only

| Field | Value |
|-------|-------|
| **ID** | TC-304 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-5 |
| **Preconditions** | - |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Set credentialValueRef=env:OPENAI_KEY | Accepted |
| 2 | Set credentialValueRef=sk-actual-secret | Rejected |

**Test Data:** credentialValueRef=env:OPENAI_KEY
**Postconditions:** No secret hardcoded

---

### TC-305: settings file valid JSON/YAML

| Field | Value |
|-------|-------|
| **ID** | TC-305 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-6 |
| **Preconditions** | - |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Load valid JSON settings | Success |
| 2 | Load invalid YAML | Error/default used |

**Test Data:** valid JSON/YAML file
**Postconditions:** Format validated

---

## 5. Boundary & Negative Testing

### TC-400: Empty template name

| Field | Value |
|-------|-------|
| **ID** | TC-400 |
| **Priority** | Medium |
| **Type** | Boundary / Negative |
| **Requirement** | Data validation |
| **Preconditions** | - |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Invoke / with empty name | Error handled gracefully |

**Test Data:** templateName=''
**Postconditions:** No crash

---

### TC-401: Thinking level invalid value

| Field | Value |
|-------|-------|
| **ID** | TC-401 |
| **Priority** | Medium |
| **Type** | Boundary / Negative |
| **Requirement** | BR-3 |
| **Preconditions** | - |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Set thinkingLevel=null | Defaults to medium or error |

**Test Data:** thinkingLevel=null
**Postconditions:** Safe handling

---

### TC-402: Credential value contains secret

| Field | Value |
|-------|-------|
| **ID** | TC-402 |
| **Priority** | Medium |
| **Type** | Boundary / Negative |
| **Requirement** | BR-5 |
| **Preconditions** | - |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Attempt to store actual secret | Rejected, static scan alert |

**Test Data:** credentialValueRef='sk-12345'
**Postconditions:** Security enforced

---

## 6. UI/UX Testing

### TC-500: Chat input accepts slash command

| Field | Value |
|-------|-------|
| **ID** | TC-500 |
| **Priority** | Medium |
| **Type** | UI/UX |
| **Requirement** | FSD 3.1.5 UI Spec |
| **Preconditions** | Chat UI loaded |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click chat input | Input focused |
| 2 | Type '/' | Autocomplete panel opens |
| 3 | Type 'brd' | Suggest /brd appears |

**Test Data:** -
**Postconditions:** UX smooth

---

### TC-501: Prompt list displays discovered templates

| Field | Value |
|-------|-------|
| **ID** | TC-501 |
| **Priority** | Medium |
| **Type** | UI/UX |
| **Requirement** | FSD 3.1.5 UI Spec |
| **Preconditions** | Templates discovered |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open prompt list | List shows brd, fsd, tdd |
| 2 | Verify order | Alphabetical |

**Test Data:** -
**Postconditions:** List accurate

---

## 7. Non-Functional Testing

### TC-600: Prompt discovery performance <500ms

| Field | Value |
|-------|-------|
| **ID** | TC-600 |
| **Priority** | Medium |
| **Type** | Non-Functional — Performance |
| **Requirement** | NFR Performance |
| **Preconditions** | 100 templates present |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Measure getPrompts() duration | <500ms |

**Acceptance Criteria:** Response time ≤500ms

---

### TC-601: Credentials not hardcoded in logs

| Field | Value |
|-------|-------|
| **ID** | TC-601 |
| **Priority** | Medium |
| **Type** | Non-Functional — Security |
| **Requirement** | NFR Security |
| **Preconditions** | Session init with credentials |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Check logs after session init | No secret values present |
| 2 | Verify reference only | Logs contain key name only |

**Acceptance Criteria:** No secret leakage

---

## 8. Integration Testing

### TC-700: Pi SDK session creation with all configs

| Field | Value |
|-------|-------|
| **ID** | TC-700 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | FSD 5.1 |
| **Preconditions** | Pi SDK installed |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call createAgentSession with model, settings, credentials, prompts | Session created successfully |
| 2 | Verify integration | Agent responds with injected prompt |

**Test Data:** Full config
**Postconditions:** Integrated flow works

---

### TC-701: File system discovery integration

| Field | Value |
|-------|-------|
| **ID** | TC-701 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | FSD 5.2 |
| **Preconditions** | .pi/prompts folder exists |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Place template file in cwd/.pi/prompts | Discovery finds it |
| 2 | Place template in ~/.pi/agent/prompts | Discovery finds it |
| 3 | Verify merge | Both sources combined |

**Test Data:** Files in both locations
**Postconditions:** Discovery works across paths

---

## 9. Regression Testing

### TC-800: Existing session creation without templates still works

| Field | Value |
|-------|-------|
| **ID** | TC-800 |
| **Priority** | Medium |
| **Type** | Regression |
| **Requirement** | Existing feature |
| **Preconditions** | Session without prompts |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create session with model only | Success, no regression |

**Test Data:** model only
**Postconditions:** Backward compatible

---

## 10. Requirements Traceability Matrix (RTM)

| Requirement | Source | Test Cases | Status |
|-------------|--------|------------|--------|
| UC-1 | FSD 3.1 | TC-001, TC-100, TC-200, TC-201, TC-300, TC-301, TC-500, TC-501 | Covered |
| UC-2 | FSD 3.2 | TC-002, TC-101, TC-202, TC-302, TC-303, TC-401 | Covered |
| UC-3 | FSD 3.3 | TC-003, TC-203, TC-204, TC-304, TC-305, TC-402, TC-601 | Covered |
| BR-1 | FSD 3.1.3 | TC-300 | Covered |
| BR-2 | FSD 3.1.3 | TC-301 | Covered |
| BR-3 | FSD 3.2.3 | TC-302, TC-401 | Covered |
| BR-4 | FSD 3.2.3 | TC-303, TC-202 | Covered |
| BR-5 | FSD 3.3.3 | TC-304, TC-402, TC-601 | Covered |
| BR-6 | FSD 3.3.3 | TC-305, TC-204 | Covered |
| NFR Performance | FSD 8 | TC-600 | Covered |
| NFR Security | FSD 8 | TC-601, TC-304 | Covered |

**Coverage Summary:**
| Category | Total | Covered | Coverage % |
|----------|-------|---------|------------|
| Use Cases | 3 | 3 | 100% |
| Business Rules | 6 | 6 | 100% |
| Acceptance Criteria | 7 | 7 | 100% |
| Error Codes | 5 | 5 | 100% |
| **Overall** | **21** | **21** | **100%** |

---

## 11. Appendix

### Test Data Setup Scripts
```bash
mkdir -p .pi/prompts
echo "Create BRD..." > .pi/prompts/brd.md
echo "Create FSD..." > .pi/prompts/fsd.md
echo '{"model":"gpt-4o-mini","thinkingLevel":"medium"}' > settings.json
```

### Environment Configuration
- Pi SDK @earendil-works/pi-agent-core installed
- File system access to .pi/prompts
- Environment variable OPENAI_KEY set for tests
