# Software Test Cases (STC)

## Smart KB Ingest — SA4E-38: Local LLM Semantic Evaluation

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-38 |
| Title | Smart KB Ingest — Local LLM Semantic Evaluation |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-07-15 |
| Status | Draft |
| Related STP | STP-v1-SA4E-38.docx |
| Related FSD | FSD-v1-SA4E-38.docx |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-15 | QA Agent | Initiate document — auto-generated from FSD use cases and business rules |

---

## Test Case Summary

| Category | ID Range | Count | Priority |
|----------|----------|-------|----------|
| Property-Based Testing (PBT) | PBT-01 to PBT-05 | 5 | High |
| Unit Testing (UT) | UT-01 to UT-18 | 18 | High |
| Integration Testing (IT) | IT-01 to IT-08 | 8 | High |
| E2E API Testing | E2E-01 to E2E-12 | 12 | High |
| E2E UI Testing | — | 0 | N/A |
| System Integration Testing (SIT) | SIT-01 to SIT-05 | 5 | High |
| **Total** | | **48** | |

---

## 1. Property-Based Testing (PBT)

### PBT-01: Classify Response Parsing Invariant

| Field | Value |
|-------|-------|
| **ID** | PBT-01 |
| **Priority** | High |
| **Type** | Property-Based |
| **Requirement** | BR-02 |
| **Property** | For any valid JSON `{"verdict":"ingest","summary":"..."}`, parseResponse always returns ClassifyResult with verdict="ingest" |

**Generator:** Random JSON strings matching `{"verdict": "ingest"|"skip", "summary": arbString(0,200)}`
**Property:** `parseResponse(validJson).verdict ∈ ["ingest", "skip"]`
**Shrink:** Minimal failing input reported
**Runs:** 100

---

### PBT-02: Malformed JSON Always Triggers Fallback

| Field | Value |
|-------|-------|
| **ID** | PBT-02 |
| **Priority** | High |
| **Type** | Property-Based |
| **Requirement** | BR-02, EF-01 |
| **Property** | For any string that is NOT valid verdict JSON, parseResponse throws/returns null triggering fallback |

**Generator:** `fc.string()` filtered to exclude valid verdict JSON patterns
**Property:** `parseResponse(invalidStr) === null`
**Runs:** 100

---

### PBT-03: Summary Truncation Invariant

| Field | Value |
|-------|-------|
| **ID** | PBT-03 |
| **Priority** | High |
| **Type** | Property-Based |
| **Requirement** | BR-03 |
| **Property** | For any string of length N, truncateSummary(str) always returns string with length <= 200 |

**Generator:** `fc.string({minLength: 0, maxLength: 5000})`
**Property:** `truncateSummary(str).length <= 200`
**Runs:** 200

---

### PBT-04: Raw Message Truncation Invariant

| Field | Value |
|-------|-------|
| **ID** | PBT-04 |
| **Priority** | High |
| **Type** | Property-Based |
| **Requirement** | BR-08 |
| **Property** | For any string, truncateRaw(str) returns string with length <= 500 |

**Generator:** `fc.string({minLength: 0, maxLength: 20000})`
**Property:** `truncateRaw(str).length <= 500`
**Runs:** 200

---

### PBT-05: Validate Message Rejects Only Empty

| Field | Value |
|-------|-------|
| **ID** | PBT-05 |
| **Priority** | Medium |
| **Type** | Property-Based |
| **Requirement** | TC-07 |
| **Property** | validateMessage returns skip result only when message.trim() is empty |

**Generator:** `fc.string()`
**Property:** `validateMessage(str) !== null iff str.trim().length === 0`
**Runs:** 100

---
## 2. Unit Testing (UT)

### UT-01: Business Value Message — Verdict Ingest

| Field | Value |
|-------|-------|
| **ID** | UT-01 |
| **Priority** | High |
| **Type** | Unit |
| **Requirement** | UC-01, BR-01, BR-14, TC-01 |
| **Preconditions** | ClassifyService instantiated with mocked LLMService |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Mock LLMService.complete() to return {"verdict":"ingest","summary":"Architecture decision: Strategy pattern for transport"} | Mock configured |
| 2 | Call classifyService.classify("We decided to use Strategy pattern for transport layer") | Returns ClassifyResult |
| 3 | Assert result.verdict === "ingest" | Verdict is ingest |
| 4 | Assert result.summary === "Architecture decision: Strategy pattern for transport" | Summary extracted correctly |

**Test Data:** 	est-data/business-messages.csv row 1
**Postconditions:** No side effects

---

### UT-02: Social Message — Verdict Skip

| Field | Value |
|-------|-------|
| **ID** | UT-02 |
| **Priority** | High |
| **Type** | Unit |
| **Requirement** | UC-01 AF-01, BR-14, TC-02 |
| **Preconditions** | ClassifyService instantiated with mocked LLMService |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Mock LLMService.complete() to return {"verdict":"skip"} | Mock configured |
| 2 | Call classifyService.classify("ok") | Returns ClassifyResult |
| 3 | Assert result.verdict === "skip" | Verdict is skip |
| 4 | Assert result.summary === undefined | No summary for skip |

**Test Data:** 	est-data/social-messages.csv row 1
**Postconditions:** No side effects

---

### UT-03: Ollama Unavailable — isAvailable Returns False

| Field | Value |
|-------|-------|
| **ID** | UT-03 |
| **Priority** | High |
| **Type** | Unit |
| **Requirement** | UC-02, BR-06, TC-03 |
| **Preconditions** | ClassifyService with mocked LLMService where isAvailable() returns false |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Mock LLMService.isAvailable() to return false | Mock configured |
| 2 | Call classifyService.isAvailable() | Returns false |
| 3 | Verify isAvailable called with appropriate timeout context | Timeout = 3s |

**Test Data:** N/A
**Postconditions:** No LLM call made

---

### UT-04: Fallback Ingest — Unfiltered Tag Applied

| Field | Value |
|-------|-------|
| **ID** | UT-04 |
| **Priority** | High |
| **Type** | Unit |
| **Requirement** | UC-02, BR-07, TC-03 |
| **Preconditions** | handleSmartIngest with mocked engine, classifyService.isAvailable()=false |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Mock classifyService.isAvailable() to return false | Mock configured |
| 2 | Mock engine.insert() to return entry ID 42 | Mock configured |
| 3 | Call handleSmartIngest(engine, scopeCtx, classifyService, {message: "important decision"}) | Returns JSON |
| 4 | Parse response: assert action === "ingest_unfiltered" | Correct action |
| 5 | Verify engine.insert called with tags containing "unfiltered" | Unfiltered tag present |
| 6 | Verify reason === "llm_unavailable" | Correct reason |

**Test Data:** Any non-empty message
**Postconditions:** engine.insert called once

---

### UT-05: Parse Valid Ingest Response

| Field | Value |
|-------|-------|
| **ID** | UT-05 |
| **Priority** | High |
| **Type** | Unit |
| **Requirement** | BR-02 |
| **Preconditions** | ClassifyService.parseResponse method accessible |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call parseResponse('{"verdict":"ingest","summary":"Test summary"}') | Returns ClassifyResult |
| 2 | Assert result.verdict === "ingest" | Correct verdict |
| 3 | Assert result.summary === "Test summary" | Correct summary |

**Test Data:** Valid JSON verdict string
**Postconditions:** No side effects

---

### UT-06: Parse Malformed LLM Response — Returns Null

| Field | Value |
|-------|-------|
| **ID** | UT-06 |
| **Priority** | High |
| **Type** | Unit |
| **Requirement** | EF-01, TC-04 |
| **Preconditions** | ClassifyService.parseResponse method accessible |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call parseResponse("hello world") | Returns null |
| 2 | Call parseResponse('{"wrong_field": "value"}') | Returns null |
| 3 | Call parseResponse('') | Returns null |
| 4 | Call parseResponse('{"verdict":"unknown"}') | Returns null |

**Test Data:** Various malformed strings
**Postconditions:** No exceptions thrown

---

### UT-07: Fallback on LLM Timeout

| Field | Value |
|-------|-------|
| **ID** | UT-07 |
| **Priority** | High |
| **Type** | Unit |
| **Requirement** | EF-02, BR-06 |
| **Preconditions** | handleSmartIngest with LLM that times out |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Mock classifyService.isAvailable() to return true | Available but slow |
| 2 | Mock classifyService.classify() to throw timeout error | Simulates timeout |
| 3 | Call handleSmartIngest(engine, scopeCtx, classifyService, {message: "test"}) | Returns JSON |
| 4 | Assert response.action === "ingest_unfiltered" | Fallback triggered |
| 5 | Assert response.reason contains "timeout" or "llm_unavailable" | Reason recorded |

**Test Data:** Any message
**Postconditions:** Message ingested with unfiltered tag

---

### UT-08: Summary Truncated to 200 Characters

| Field | Value |
|-------|-------|
| **ID** | UT-08 |
| **Priority** | High |
| **Type** | Unit |
| **Requirement** | BR-03, TC-05, AF-02 |
| **Preconditions** | ClassifyService with mock LLM returning long summary |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Mock LLM to return summary of 300 chars | Long summary |
| 2 | Call classifyService.classify(message) | Returns ClassifyResult |
| 3 | Assert result.summary.length <= 200 | Truncated to 200 |

**Test Data:** Summary = "A".repeat(300)
**Postconditions:** Summary truncated, no data loss beyond limit

---

### UT-09: Raw Message Truncated to 500 Characters on Fallback

| Field | Value |
|-------|-------|
| **ID** | UT-09 |
| **Priority** | High |
| **Type** | Unit |
| **Requirement** | BR-08, TC-06 |
| **Preconditions** | handleSmartIngest in fallback mode |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Mock classifyService.isAvailable() to return false | Fallback mode |
| 2 | Call handleSmartIngest with message of 1000 chars | Processes message |
| 3 | Verify engine.insert called with content.length <= 500 | Content truncated |

**Test Data:** message = "X".repeat(1000)
**Postconditions:** Ingested content is exactly 500 chars

---

### UT-10: Batch Cleanup — Ingest Verdict Updates Entry

| Field | Value |
|-------|-------|
| **ID** | UT-10 |
| **Priority** | High |
| **Type** | Unit |
| **Requirement** | UC-03, TC-08 |
| **Preconditions** | handleSmartIngestCleanup with mock engine having unfiltered entries |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Mock engine.findFiltered() to return 1 entry with tags "unfiltered" | Entry found |
| 2 | Mock classifyService.classify() to return verdict "ingest" with summary | LLM says valuable |
| 3 | Call handleSmartIngestCleanup(engine, scopeCtx, classifyService, {}) | Returns JSON |
| 4 | Verify engine.updateEntry called with new content=summary | Entry updated |
| 5 | Verify tags changed from "unfiltered" to "smart-ingest" | Tags updated |
| 6 | Assert response.ingested === 1 | Count correct |

**Test Data:** Mock entry: {id:1, content:"raw msg", tags:"chat,stream,user,unfiltered"}
**Postconditions:** Entry updated in mock

---

### UT-11: Batch Cleanup — Skip Verdict Deletes Entry

| Field | Value |
|-------|-------|
| **ID** | UT-11 |
| **Priority** | High |
| **Type** | Unit |
| **Requirement** | UC-03, TC-08 |
| **Preconditions** | handleSmartIngestCleanup with entry that LLM says skip |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Mock engine.findFiltered() to return 1 entry | Entry found |
| 2 | Mock classifyService.classify() to return verdict "skip" | LLM says not valuable |
| 3 | Call handleSmartIngestCleanup(engine, scopeCtx, classifyService, {}) | Returns JSON |
| 4 | Verify engine.deleteEntry called with entry ID | Entry deleted |
| 5 | Assert response.deleted === 1 | Count correct |

**Test Data:** Mock entry: {id:2, content:"ok thanks", tags:"chat,stream,user,unfiltered"}
**Postconditions:** Entry deleted in mock

---

### UT-12: Batch Cleanup — Batch Size Honored

| Field | Value |
|-------|-------|
| **ID** | UT-12 |
| **Priority** | High |
| **Type** | Unit |
| **Requirement** | BR-10, TC-08 |
| **Preconditions** | Engine has 20 unfiltered entries |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Mock engine.findFiltered() to return 5 entries (respecting limit) | 5 entries |
| 2 | Call handleSmartIngestCleanup with {batch_size: 5} | Processes 5 |
| 3 | Assert response.processed === 5 | Only 5 processed |
| 4 | Verify findFiltered called with LIMIT 5 | Batch size passed to query |

**Test Data:** batch_size=5
**Postconditions:** Only 5 entries processed

---

### UT-13: Batch Cleanup — Stops When LLM Fails Mid-Batch

| Field | Value |
|-------|-------|
| **ID** | UT-13 |
| **Priority** | High |
| **Type** | Unit |
| **Requirement** | BR-11, TC-09 |
| **Preconditions** | Engine has 10 entries, LLM fails after 3rd |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Mock engine.findFiltered() returns 10 entries | 10 entries |
| 2 | Mock classifyService.classify() to succeed 3 times then throw | LLM dies mid-batch |
| 3 | Call handleSmartIngestCleanup(engine, scopeCtx, classifyService, {}) | Returns partial |
| 4 | Assert response.processed === 3 | Only 3 processed |
| 5 | Assert response.remaining === 7 | Remaining counted |
| 6 | Assert response.reason === "llm_unavailable_mid_batch" | Reason correct |

**Test Data:** 10 mock entries
**Postconditions:** Only first 3 entries mutated

---

### UT-14: Ingest Entry Metadata Correct

| Field | Value |
|-------|-------|
| **ID** | UT-14 |
| **Priority** | High |
| **Type** | Unit |
| **Requirement** | BR-04, BR-05 |
| **Preconditions** | handleSmartIngest with successful classify |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Mock classify to return ingest + summary | Available, ingest verdict |
| 2 | Call handleSmartIngest | Processes |
| 3 | Capture engine.insert call arguments | Get insert params |
| 4 | Assert type === "CONTEXT" | Correct type |
| 5 | Assert source === "/chat-prompt" | Correct source |
| 6 | Assert tags === "chat,stream,user,smart-ingest" | Correct tags |

**Test Data:** message = "Decision: use Ollama for local eval"
**Postconditions:** Entry created with correct metadata

---

### UT-15: Handler Never Throws — Engine Failure

| Field | Value |
|-------|-------|
| **ID** | UT-15 |
| **Priority** | High |
| **Type** | Unit |
| **Requirement** | BR-09 |
| **Preconditions** | engine.insert throws Error |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Mock engine.insert() to throw new Error("DB locked") | Engine fails |
| 2 | Call handleSmartIngest(engine, scopeCtx, classifyService, {message: "test"}) | Does NOT throw |
| 3 | Assert response.action === "error" | Error action returned |
| 4 | Assert response.reason === "ingest_failed" | Reason correct |

**Test Data:** Any message
**Postconditions:** No unhandled exception

---

### UT-16: Handler Never Throws — Unexpected Error

| Field | Value |
|-------|-------|
| **ID** | UT-16 |
| **Priority** | High |
| **Type** | Unit |
| **Requirement** | BR-09 |
| **Preconditions** | classifyService throws unexpected TypeError |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Mock classifyService to throw TypeError | Unexpected crash |
| 2 | Call handleSmartIngest | Does NOT throw |
| 3 | Assert valid JSON response returned | Graceful degradation |
| 4 | Assert action === "error" or "ingest_unfiltered" | Fallback behavior |

**Test Data:** Any message
**Postconditions:** No unhandled exception

---

### UT-17: Dedup Prevents Duplicate Entries

| Field | Value |
|-------|-------|
| **ID** | UT-17 |
| **Priority** | High |
| **Type** | Unit |
| **Requirement** | BR-13, TC-12 |
| **Preconditions** | isDuplicate function with engine containing existing entry |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Mock engine query to find existing entry with same content hash | Duplicate exists |
| 2 | Call handleSmartIngest with message that produces same summary | Processes |
| 3 | Assert response.action === "skip" | Skipped as duplicate |
| 4 | Assert response.reason === "duplicate" | Reason correct |
| 5 | Verify engine.insert NOT called | No duplicate created |

**Test Data:** message producing summary that already exists in KB
**Postconditions:** No new entry created

---

### UT-18: Empty Message Returns Skip

| Field | Value |
|-------|-------|
| **ID** | UT-18 |
| **Priority** | Medium |
| **Type** | Unit |
| **Requirement** | TC-07 |
| **Preconditions** | handleSmartIngest called |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call handleSmartIngest with {message: ""} | Returns skip |
| 2 | Assert response.action === "skip" | Skipped |
| 3 | Assert response.reason === "empty_message" | Correct reason |
| 4 | Call handleSmartIngest with {message: "   "} | Whitespace-only |
| 5 | Assert response.action === "skip" | Also skipped |

**Test Data:** "", "   ", "\n\t"
**Postconditions:** No LLM call made, no ingest

---
## 3. Integration Testing (IT)

### IT-01: ClassifyService Calls OllamaAdapter via LLMService

| Field | Value |
|-------|-------|
| **ID** | IT-01 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | BR-15, UC-01 |
| **Preconditions** | Real ClassifyService + LLMService with mocked HTTP (msw intercepting localhost:11434) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Configure msw to intercept POST /api/chat and return valid verdict JSON | HTTP mock ready |
| 2 | Instantiate real LLMService with real OllamaAdapter (HTTP mocked) | Real wiring |
| 3 | Instantiate ClassifyService with real LLMService | Integration ready |
| 4 | Call classifyService.classify("Architecture decision made") | Full chain executes |
| 5 | Verify HTTP request sent to /api/chat with correct model + messages | OllamaAdapter used |
| 6 | Assert ClassifyResult returned correctly | End-to-end parsing works |

**Test Data:** message = "Architecture decision: use event-driven pattern"
**Postconditions:** HTTP call made to mocked Ollama endpoint

---

### IT-02: End-to-End Classification — Skip Verdict

| Field | Value |
|-------|-------|
| **ID** | IT-02 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | BR-14, UC-01 AF-01 |
| **Preconditions** | Full ClassifyService chain with HTTP mock |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Configure msw to return {"message":{"content":"{\"verdict\":\"skip\"}"}} | Mock ready |
| 2 | Call classifyService.classify("thanks") | Chain executes |
| 3 | Assert result.verdict === "skip" | Skip returned through layers |

**Test Data:** message = "thanks"
**Postconditions:** No ingest triggered

---

### IT-03: Ollama Connection Refused — Fallback Triggered

| Field | Value |
|-------|-------|
| **ID** | IT-03 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | UC-02, BR-06 |
| **Preconditions** | msw configured to return network error for /api/tags (availability check) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Configure msw to reject connection to localhost:11434 | Simulates Ollama down |
| 2 | Call classifyService.isAvailable() | Returns false |
| 3 | Verify timeout behavior (3s max) | Does not hang |

**Test Data:** N/A
**Postconditions:** isAvailable returns false within 3s

---

### IT-04: LLM Returns Non-JSON — Fallback Chain

| Field | Value |
|-------|-------|
| **ID** | IT-04 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | EF-01, TC-04 |
| **Preconditions** | Full chain, msw returns plain text from LLM |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Configure msw availability check → success | Ollama appears available |
| 2 | Configure msw /api/chat → return {"message":{"content":"I think this is valuable"}} | Not JSON verdict |
| 3 | Call classifyService.classify("some message") | Parsing fails |
| 4 | Assert result is null (parse failure) | Triggers fallback in handler |

**Test Data:** LLM returns conversational text instead of JSON
**Postconditions:** No crash, null returned for handler to fallback

---

### IT-05: Cleanup Integration — Query + Classify + Update

| Field | Value |
|-------|-------|
| **ID** | IT-05 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | UC-03 |
| **Preconditions** | Real MemoryEngine (in-memory SQLite) with seeded unfiltered entries + mocked HTTP |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Seed DB with 3 entries tagged "unfiltered" | Data ready |
| 2 | Configure msw to return "ingest" for first 2, "skip" for 3rd | Varying verdicts |
| 3 | Call handleSmartIngestCleanup with real engine + real ClassifyService | Full flow |
| 4 | Query DB: verify first 2 entries updated (content=summary, tags=smart-ingest) | DB mutated correctly |
| 5 | Query DB: verify 3rd entry deleted | Cleaned up |
| 6 | Assert response.ingested===2, deleted===1, processed===3 | Counts correct |

**Test Data:** 3 seeded entries in SQLite
**Postconditions:** DB state reflects cleanup results

---

### IT-06: Cleanup — LLM Fails Mid-Batch (Integration)

| Field | Value |
|-------|-------|
| **ID** | IT-06 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | BR-11, TC-09 |
| **Preconditions** | Real engine with 5 entries, msw fails after 2 responses |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Seed DB with 5 unfiltered entries | Data ready |
| 2 | Configure msw: respond successfully twice, then return 500 error | LLM dies |
| 3 | Call handleSmartIngestCleanup | Partial processing |
| 4 | Assert response.processed === 2 | Stopped at failure |
| 5 | Assert response.remaining === 3 | Remaining calculated |
| 6 | Query DB: first 2 entries mutated, last 3 unchanged | Partial mutation |

**Test Data:** 5 seeded entries
**Postconditions:** Partial DB mutation, no corruption

---

### IT-07: Handler Catches All Errors — No Unhandled Rejection

| Field | Value |
|-------|-------|
| **ID** | IT-07 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | BR-09 |
| **Preconditions** | Real wiring with deliberately broken config |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Pass null engine to handleSmartIngest | Bad input |
| 2 | Verify no unhandled promise rejection | Caught internally |
| 3 | Assert valid JSON response with action "error" | Graceful response |

**Test Data:** null/undefined dependencies
**Postconditions:** Process continues, no crash

---

### IT-08: Dedup Check with Real DB

| Field | Value |
|-------|-------|
| **ID** | IT-08 |
| **Priority** | Medium |
| **Type** | Integration |
| **Requirement** | BR-13, TC-12 |
| **Preconditions** | Real MemoryEngine with existing entry |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Seed DB with entry: content="Decision: use Strategy pattern", source="/chat-prompt" | Existing entry |
| 2 | Configure msw to return same summary "Decision: use Strategy pattern" | Same content |
| 3 | Call handleSmartIngest with message that produces same summary | Dedup check |
| 4 | Assert response.action === "skip" and reason === "duplicate" | Duplicate detected |
| 5 | Query DB: still only 1 entry with that content | No duplicate |

**Test Data:** Duplicate content scenario
**Postconditions:** No duplicate entry in DB

---
## 4. E2E API Testing (E2E-API)

### E2E-01: mem_smart_ingest — Business Message Ingested

| Field | Value |
|-------|-------|
| **ID** | E2E-01 |
| **Priority** | High |
| **Type** | E2E API |
| **Requirement** | UC-01, TC-01, BR-04, BR-05 |
| **Preconditions** | MCP server running, Ollama mocked via msw, empty KB |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Send MCP tool call: mem_smart_ingest({message: "We decided to use Strategy pattern for the transport layer"}) | Tool executes |
| 2 | Assert response.action === "ingest" | Ingested |
| 3 | Assert response.summary is non-empty string | Summary present |
| 4 | Query KB for entries with source="/chat-prompt" and tags containing "smart-ingest" | Entry found |
| 5 | Verify entry.type === "CONTEXT" | Correct type |

**Test Data:** 	est-data/business-messages.csv row 1
**Postconditions:** 1 new entry in KB

---

### E2E-02: mem_smart_ingest — Social Message Skipped

| Field | Value |
|-------|-------|
| **ID** | E2E-02 |
| **Priority** | High |
| **Type** | E2E API |
| **Requirement** | UC-01 AF-01, BR-14, TC-02 |
| **Preconditions** | MCP server running, Ollama mocked to return skip, empty KB |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Send MCP tool call: mem_smart_ingest({message: "ok"}) | Tool executes |
| 2 | Assert response.action === "skip" | Skipped |
| 3 | Assert response.reason === "no business/technical value" | Reason present |
| 4 | Query KB: no new entries created | KB unchanged |

**Test Data:** 	est-data/social-messages.csv row 1
**Postconditions:** KB unchanged

---

### E2E-03: mem_smart_ingest — Ollama Down Triggers Fallback

| Field | Value |
|-------|-------|
| **ID** | E2E-03 |
| **Priority** | High |
| **Type** | E2E API |
| **Requirement** | UC-02, TC-03, BR-07 |
| **Preconditions** | MCP server running, Ollama endpoint unreachable |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Disable Ollama mock (connection refused) | LLM unavailable |
| 2 | Send MCP tool call: mem_smart_ingest({message: "Important architecture decision"}) | Tool executes |
| 3 | Assert response.action === "ingest_unfiltered" | Fallback triggered |
| 4 | Assert response.reason === "llm_unavailable" | Reason correct |
| 5 | Query KB: entry exists with tags containing "unfiltered" | Entry created |

**Test Data:** Any business message
**Postconditions:** Entry in KB with "unfiltered" tag

---

### E2E-04: mem_smart_ingest — Multiple Messages During Outage

| Field | Value |
|-------|-------|
| **ID** | E2E-04 |
| **Priority** | High |
| **Type** | E2E API |
| **Requirement** | Story 3 AC-5 |
| **Preconditions** | Ollama down |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Send 3 different messages while Ollama is down | 3 tool calls |
| 2 | Assert all 3 return action "ingest_unfiltered" | All fallback |
| 3 | Query KB: 3 entries with "unfiltered" tag | All captured |
| 4 | Verify each entry has different content | No data loss |

**Test Data:** 3 distinct messages from 	est-data/business-messages.csv
**Postconditions:** 3 unfiltered entries in KB

---

### E2E-05: mem_smart_ingest — Summary Truncation at 200 chars

| Field | Value |
|-------|-------|
| **ID** | E2E-05 |
| **Priority** | Medium |
| **Type** | E2E API |
| **Requirement** | BR-03, TC-05 |
| **Preconditions** | Ollama mock returns summary > 200 chars |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Configure Ollama mock to return summary of 300 chars | Long summary |
| 2 | Send mem_smart_ingest with business message | Tool executes |
| 3 | Assert response.summary.length <= 200 | Truncated in response |
| 4 | Query KB entry: verify content.length <= 200 | Truncated in DB |

**Test Data:** Mock summary = "A".repeat(300)
**Postconditions:** Entry stored with truncated summary

---

### E2E-06: mem_smart_ingest — Raw Truncation at 500 chars (Fallback)

| Field | Value |
|-------|-------|
| **ID** | E2E-06 |
| **Priority** | Medium |
| **Type** | E2E API |
| **Requirement** | BR-08, TC-06 |
| **Preconditions** | Ollama down, long message |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Disable Ollama mock | Fallback mode |
| 2 | Send mem_smart_ingest with 1000-char message | Tool executes |
| 3 | Assert response.action === "ingest_unfiltered" | Fallback |
| 4 | Query KB entry: verify content.length <= 500 | Content truncated |

**Test Data:** message = "Important decision ".repeat(100) (>500 chars)
**Postconditions:** Entry stored with 500-char content

---

### E2E-07: mem_smart_ingest_cleanup — Full Batch Processing

| Field | Value |
|-------|-------|
| **ID** | E2E-07 |
| **Priority** | High |
| **Type** | E2E API |
| **Requirement** | UC-03, TC-08 |
| **Preconditions** | KB seeded with 5 unfiltered entries, Ollama mocked |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Seed KB with 5 entries tagged "unfiltered" | Data ready |
| 2 | Configure Ollama mock: 3 "ingest", 2 "skip" | Varying verdicts |
| 3 | Send MCP tool call: mem_smart_ingest_cleanup({}) | Tool executes |
| 4 | Assert response.processed === 5 | All processed |
| 5 | Assert response.ingested === 3 | 3 updated |
| 6 | Assert response.deleted === 2 | 2 removed |
| 7 | Query KB: 3 entries now have "smart-ingest" tag | Updated correctly |
| 8 | Query KB: 0 entries with "unfiltered" tag | All cleaned |

**Test Data:** 5 seeded entries
**Postconditions:** KB cleaned — no more unfiltered entries

---

### E2E-08: mem_smart_ingest_cleanup — Batch Size Limit

| Field | Value |
|-------|-------|
| **ID** | E2E-08 |
| **Priority** | Medium |
| **Type** | E2E API |
| **Requirement** | BR-10 |
| **Preconditions** | KB seeded with 20 unfiltered entries |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Seed KB with 20 unfiltered entries | Data ready |
| 2 | Send: mem_smart_ingest_cleanup({batch_size: 5}) | Limited batch |
| 3 | Assert response.processed === 5 | Only 5 processed |
| 4 | Assert response.remaining === 15 | Remaining reported |
| 5 | Query KB: 15 entries still have "unfiltered" tag | Not over-processed |

**Test Data:** batch_size=5, 20 entries
**Postconditions:** Only 5 entries mutated

---

### E2E-09: mem_smart_ingest_cleanup — LLM Fails Mid-Batch

| Field | Value |
|-------|-------|
| **ID** | E2E-09 |
| **Priority** | High |
| **Type** | E2E API |
| **Requirement** | BR-11, TC-09 |
| **Preconditions** | KB with 10 entries, Ollama mock fails after 3 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Seed KB with 10 unfiltered entries | Data ready |
| 2 | Configure Ollama mock: succeed 3 times, then 500 error | LLM dies |
| 3 | Send: mem_smart_ingest_cleanup({}) | Partial result |
| 4 | Assert response.processed === 3 | Stopped at failure |
| 5 | Assert response.remaining === 7 | Correct remaining |
| 6 | Assert response.reason contains "llm_unavailable" | Reason reported |

**Test Data:** 10 entries, LLM fails at request 4
**Postconditions:** First 3 entries mutated, rest unchanged

---

### E2E-10: mem_smart_ingest_cleanup — Dry Run

| Field | Value |
|-------|-------|
| **ID** | E2E-10 |
| **Priority** | Medium |
| **Type** | E2E API |
| **Requirement** | AF-04, TC-10 |
| **Preconditions** | KB with 5 unfiltered entries |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Seed KB with 5 unfiltered entries | Data ready |
| 2 | Send: mem_smart_ingest_cleanup({dry_run: true}) | Preview mode |
| 3 | Assert response.dry_run === true | Flag echoed |
| 4 | Assert response.processed === 5 | All evaluated |
| 5 | Query KB: all 5 entries UNCHANGED (still "unfiltered") | No mutations |

**Test Data:** dry_run=true, 5 entries
**Postconditions:** KB completely unchanged

---

### E2E-11: Hook Fails Silently When Tool Unavailable

| Field | Value |
|-------|-------|
| **ID** | E2E-11 |
| **Priority** | High |
| **Type** | E2E API |
| **Requirement** | UC-04 EF-07, TC-11 |
| **Preconditions** | MCP server running WITHOUT mem_smart_ingest registered |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Attempt tool call to unregistered "mem_smart_ingest" | Tool not found |
| 2 | Verify error response is graceful (not crash) | MCP error response |
| 3 | Verify no unhandled exception in server logs | No crash |
| 4 | Verify server still operational (call another tool) | Server alive |

**Test Data:** N/A
**Postconditions:** Server continues running normally

---

### E2E-12: Dedup Prevents Duplicate Entry

| Field | Value |
|-------|-------|
| **ID** | E2E-12 |
| **Priority** | Medium |
| **Type** | E2E API |
| **Requirement** | BR-13, TC-12 |
| **Preconditions** | Ollama mocked to return same summary for same message |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Send mem_smart_ingest({message: "Use Strategy pattern"}) first time | Ingested |
| 2 | Assert response.action === "ingest" | First succeeds |
| 3 | Send same message again: mem_smart_ingest({message: "Use Strategy pattern"}) | Duplicate |
| 4 | Assert response.action === "skip" and reason === "duplicate" | Dedup works |
| 5 | Query KB: only 1 entry with that content | No duplicate |

**Test Data:** Same message sent twice
**Postconditions:** Only 1 entry in KB

---
## 5. E2E UI Testing

N/A — This feature has no UI components. All interaction is via MCP tool calls (backend-only).

---

## 6. System Integration Testing (SIT)

### SIT-01: Full Flow — Real Ollama Classification

| Field | Value |
|-------|-------|
| **ID** | SIT-01 |
| **Priority** | High |
| **Type** | System Integration |
| **Requirement** | UC-01, Story 1 AC-1, AC-2, AC-3 |
| **Preconditions** | Backend MCP server running, real Ollama with qwen3:1.7b, empty KB |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Verify Ollama is running: curl http://localhost:11434/api/tags | Returns model list |
| 2 | Send MCP tool call: mem_smart_ingest({message: "We decided to use Strategy pattern for transport"}) | Tool executes |
| 3 | Measure response time | < 3 seconds |
| 4 | Assert response.action === "ingest" | LLM classifies correctly |
| 5 | Send: mem_smart_ingest({message: "ok"}) | Social message |
| 6 | Assert response.action === "skip" | Correctly skipped |
| 7 | Query KB: verify only 1 entry created (business msg only) | Correct filtering |

**Test Data:** Real messages sent to real LLM
**Postconditions:** 1 entry in KB with smart-ingest tag

---

### SIT-02: Full Flow — Ollama Stopped Triggers Fallback

| Field | Value |
|-------|-------|
| **ID** | SIT-02 |
| **Priority** | High |
| **Type** | System Integration |
| **Requirement** | UC-02, Story 3 AC-1 |
| **Preconditions** | Backend running, Ollama STOPPED |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Stop Ollama service: ollama stop or kill process | Ollama down |
| 2 | Send: mem_smart_ingest({message: "Important decision about architecture"}) | Tool executes |
| 3 | Measure response time | < 100ms (fallback is instant) |
| 4 | Assert response.action === "ingest_unfiltered" | Fallback triggered |
| 5 | Query KB: entry exists with "unfiltered" tag | Message preserved |
| 6 | Restart Ollama | Recovery |

**Test Data:** Business message + Ollama down
**Postconditions:** Unfiltered entry in KB, Ollama restarted

---

### SIT-03: Full Flow — Batch Cleanup with Real Ollama

| Field | Value |
|-------|-------|
| **ID** | SIT-03 |
| **Priority** | High |
| **Type** | System Integration |
| **Requirement** | UC-03, Story 4 AC-1 |
| **Preconditions** | Real Ollama running, KB seeded with 3 unfiltered entries |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Seed KB with entries: "Architecture: use CQRS" (valuable), "ok" (not), "Design decision: event sourcing" (valuable) | 3 unfiltered |
| 2 | Send: mem_smart_ingest_cleanup({batch_size: 10}) | Cleanup runs |
| 3 | Assert response.processed === 3 | All processed |
| 4 | Query KB: verify valuable entries updated with LLM summaries | Summaries generated |
| 5 | Query KB: verify "ok" entry deleted | Non-valuable removed |
| 6 | Verify no entries with "unfiltered" tag remain | All cleaned |

**Test Data:** 3 entries of varying value
**Postconditions:** KB cleaned, only valuable entries remain

---

### SIT-04: Hook Integration — Fire-and-Forget Pattern

| Field | Value |
|-------|-------|
| **ID** | SIT-04 |
| **Priority** | High |
| **Type** | System Integration |
| **Requirement** | UC-04, BR-12, Story 5 AC-1, AC-2, AC-4 |
| **Preconditions** | Full system running: hook configured, backend, Ollama |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Verify hook file exists and is <= 20 lines | BR-12 met |
| 2 | Verify hook calls xecute_dynamic_tool("mem_smart_ingest", ...) | Correct tool call |
| 3 | Simulate user prompt submission triggering hook | Hook fires |
| 4 | Verify tool call completes without blocking user session | Fire-and-forget |
| 5 | Verify NO chat LLM context window entries for evaluation | No context pollution |
| 6 | Verify NO cloud API calls logged | Data stays local |

**Test Data:** Normal user prompt
**Postconditions:** Message evaluated without affecting user session

---

### SIT-05: Hook Graceful Failure — Backend Unreachable

| Field | Value |
|-------|-------|
| **ID** | SIT-05 |
| **Priority** | High |
| **Type** | System Integration |
| **Requirement** | UC-04 EF-07, EF-08, TC-11 |
| **Preconditions** | Hook configured, backend MCP server STOPPED |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Stop backend MCP server | Backend unreachable |
| 2 | Simulate user prompt submission triggering hook | Hook fires |
| 3 | Verify NO error shown to user | Silent failure |
| 4 | Verify user can continue chatting normally | No disruption |
| 5 | Verify hook does not retry indefinitely | Graceful timeout |

**Test Data:** Normal user prompt with backend down
**Postconditions:** User session unaffected

---
## 7. Requirements Traceability Matrix (RTM)

| Requirement | Source | Test Cases | Status |
|-------------|--------|------------|--------|
| UC-01 | FSD 3.1.2 | PBT-01, UT-01, UT-02, UT-05, UT-08, UT-14, IT-01, IT-02, E2E-01, E2E-02, E2E-05, SIT-01 | Covered |
| UC-02 | FSD 3.1.2 | UT-03, UT-04, UT-07, UT-09, IT-03, IT-04, E2E-03, E2E-04, E2E-06, SIT-02 | Covered |
| UC-03 | FSD 3.1.2 | UT-10, UT-11, UT-12, UT-13, IT-05, IT-06, E2E-07, E2E-08, E2E-09, E2E-10, SIT-03 | Covered |
| UC-04 | FSD 3.1.2 | E2E-11, SIT-04, SIT-05 | Covered |
| BR-01 | FSD 3.1.3 | UT-01, UT-02, IT-01, E2E-01, E2E-02, SIT-01 | Covered |
| BR-02 | FSD 3.1.3 | PBT-01, PBT-02, UT-05, UT-06 | Covered |
| BR-03 | FSD 3.1.3 | PBT-03, UT-08, E2E-05 | Covered |
| BR-04 | FSD 3.1.3 | UT-14, E2E-01 | Covered |
| BR-05 | FSD 3.1.3 | UT-14, E2E-01 | Covered |
| BR-06 | FSD 3.1.3 | UT-03, IT-03, E2E-03 | Covered |
| BR-07 | FSD 3.1.3 | UT-04, UT-07, E2E-03, E2E-04 | Covered |
| BR-08 | FSD 3.1.3 | PBT-04, UT-09, E2E-06 | Covered |
| BR-09 | FSD 3.1.3 | UT-15, UT-16, IT-07, E2E-12 | Covered |
| BR-10 | FSD 3.1.3 | UT-12, E2E-08 | Covered |
| BR-11 | FSD 3.1.3 | UT-13, IT-06, E2E-09 | Covered |
| BR-12 | FSD 3.1.3 | SIT-04 | Covered |
| BR-13 | FSD 3.1.3 | UT-17, IT-08, E2E-12 | Covered |
| BR-14 | FSD 3.1.3 | UT-02, IT-02, E2E-02, SIT-01 | Covered |
| BR-15 | FSD 3.1.3 | IT-01 | Covered |
| TC-01 (FSD) | FSD 10.1 | UT-01, E2E-01, SIT-01 | Covered |
| TC-02 (FSD) | FSD 10.1 | UT-02, E2E-02, SIT-01 | Covered |
| TC-03 (FSD) | FSD 10.1 | UT-03, UT-04, E2E-03, SIT-02 | Covered |
| TC-04 (FSD) | FSD 10.1 | UT-06, IT-04, E2E-03 | Covered |
| TC-05 (FSD) | FSD 10.1 | UT-08, PBT-03, E2E-05 | Covered |
| TC-06 (FSD) | FSD 10.1 | UT-09, PBT-04, E2E-06 | Covered |
| TC-07 (FSD) | FSD 10.1 | PBT-05, UT-18 | Covered |
| TC-08 (FSD) | FSD 10.1 | UT-10, UT-11, UT-12, IT-05, E2E-07 | Covered |
| TC-09 (FSD) | FSD 10.1 | UT-13, IT-06, E2E-09 | Covered |
| TC-10 (FSD) | FSD 10.1 | E2E-10 | Covered |
| TC-11 (FSD) | FSD 10.1 | E2E-11, SIT-05 | Covered |
| TC-12 (FSD) | FSD 10.1 | UT-17, IT-08, E2E-12 | Covered |

**Coverage Summary:**

| Category | Total | Covered | Coverage % |
|----------|-------|---------|------------|
| Use Cases | 4 | 4 | 100% |
| Business Rules | 15 | 15 | 100% |
| FSD Test Scenarios | 12 | 12 | 100% |
| Alternative Flows | 5 | 5 | 100% |
| Exception Flows | 8 | 8 | 100% |
| **Overall** | **44** | **44** | **100%** |

---

## 8. Test Data Files

| File | Purpose | Location |
|------|---------|----------|
| business-messages.csv | Messages with business/technical value | 	est-data/business-messages.csv |
| social-messages.csv | Social/confirmatory messages (expected: skip) | 	est-data/social-messages.csv |
| edge-case-messages.csv | Edge cases: empty, long, unicode, special chars | 	est-data/edge-case-messages.csv |
| unfiltered-entries-seed.csv | DB seed for batch cleanup tests | 	est-data/unfiltered-entries-seed.csv |
| llm-mock-responses.csv | Mock LLM responses for deterministic testing | 	est-data/llm-mock-responses.csv |

---

## 9. Appendix

### Test Environment Setup

`ash
# Start Ollama (SIT only)
ollama serve &
ollama pull qwen3:1.7b

# Run unit + integration tests
npx vitest run --coverage

# Run E2E API tests
npx vitest run --config vitest.e2e.config.ts

# Run SIT (requires real Ollama)
npx vitest run --config vitest.sit.config.ts
`

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Test Coverage | [test-coverage.png](diagrams/test-coverage.png) | [test-coverage.drawio](diagrams/test-coverage.drawio) |
| 2 | Test Execution Flow | [test-execution-flow.png](diagrams/test-execution-flow.png) | [test-execution-flow.drawio](diagrams/test-execution-flow.drawio) |
