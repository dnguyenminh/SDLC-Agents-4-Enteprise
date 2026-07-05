# Functional Specification Document (FSD)

## SA4E Memory / Knowledge Base — F1-MEMORY-KB

---

## Document Information

| Field | Value |
|-------|-------|
| Feature ID | F1-MEMORY-KB |
| Title | Memory / Knowledge Base Module |
| Author | BA Agent + TA Agent |
| Version | 1.0 |
| Date | 2025-07-03 |
| Status | Draft |
| Related BRD | BRD-v1-F1-MEMORY-KB.docx |
| Architecture Pattern | AI Agent System |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-07-03 | BA Agent | Initial FSD — BA draft |
| 1.0 | 2025-07-03 | TA Agent | Technical enrichment — API contracts, pseudocode |

---

## 1. Introduction

### 1.1 Purpose

This FSD specifies the functional behavior of the Memory / Knowledge Base module for the SA4E multi-agent system. It details use cases, business rules, data model, API contracts, and processing logic.

### 1.2 Scope

All 14+ MCP tools and background services for knowledge storage, hybrid search, scope management, and data masking.

### 1.3 Definitions & Acronyms

| Term | Definition |
|------|------------|
| BM25 | Best Match 25 — probabilistic ranking (FTS5) |
| FTS5 | Full-Text Search 5 — SQLite extension |
| ONNX | Open Neural Network Exchange |
| MCP | Model Context Protocol |
| Tier | WORKING / EPISODIC / SEMANTIC / PROCEDURAL |
| Scope | USER / PROJECT / SHARED |

### 1.4 References

| Document | Location |
|----------|----------|
| BRD | BRD-v1-F1-MEMORY-KB.docx |
| Source Code | backend/src/modules/memory/ |

---

## 2. System Overview

### 2.1 System Context Diagram

![System Context](diagrams/system-context.png)

The Memory module sits between AI agents (via MCP protocol) and persistent SQLite storage. It integrates with ONNX Runtime for embeddings and LLM Service for auto-summarization.

### 2.2 System Architecture

- **MemoryModule**: IModule implementation, lifecycle management
- **MemoryEngine**: Facade for all KB operations (CRUD, search, graph, sessions)
- **MemoryToolDispatcher**: Routes MCP tool calls to engine methods
- **ScopePromotionService**: Background hourly promotion scan
- **MaskingMiddleware**: PII/credential detection and role-based masking

---

## 3. Functional Requirements

### 3.1 Feature: Hybrid Search (mem_search)

**Source:** BRD Story 1

#### 3.1.1 Description

Agents search the KB using natural language queries. System executes three parallel retrieval strategies (BM25, vector similarity, graph expansion), merges results, applies scope filtering and masking, returns ranked results with progressive disclosure.

#### 3.1.2 Use Case

**Use Case ID:** UC-01
**Actor:** AI Agent
**Preconditions:** Memory module initialized, at least 1 entry exists in KB
**Postconditions:** Agent receives ranked results (may be empty)

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Sends mem_search(query, limit, filters) | | Agent submits search request |
| 2 | | Sanitize query (remove special chars) | Prepare FTS5-safe query string |
| 3 | | Execute BM25 FTS5 search | Full-text ranked by BM25 score |
| 4 | | Execute vector cosine similarity | If embeddings exist, find nearest vectors |
| 5 | | Execute graph neighbor expansion | Expand from top FTS hits via edges |
| 6 | | Merge and deduplicate results | Combine scores with configurable weights |
| 7 | | Apply scope filter | User sees own USER + all PROJECT + SHARED |
| 8 | | Apply masking pipeline | PII/credential masking per requester role |
| 9 | | Return ranked results | Summary only (or content if detail=true) |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-01 | No vector embeddings exist | Skip step 4, BM25 + graph only |
| AF-02 | detail=true | Include content preview in response |
| AF-03 | scope filter specified | Additional scope constraint |
| AF-04 | tier/type filter | WHERE clause narrows results |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-01 | Invalid FTS5 query | Fallback to wildcard, return empty |
| EF-02 | Empty query | Return empty results immediately |
| EF-03 | Database error | Retry once, then error message |

#### 3.1.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-01 | Query sanitization: remove all chars except word, space, quote, asterisk, colon, dot | BRD Story 1 |
| BR-02 | Default limit = 10 results | BRD Story 1 |
| BR-03 | Scope visibility: user sees own USER + all PROJECT + all SHARED | BRD Story 4 |
| BR-04 | Progressive disclosure: summary-only by default, content on detail=true | BRD Story 1 |
| BR-05 | FTS5 tokenizer: porter unicode61 (handles stemming) | Source code |

#### 3.1.4 Data Specifications

**Input Data:**

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| query | string | Yes | Non-empty after sanitization | Natural language search query |
| limit | number | No | 1-100, default 10 | Max results |
| tier | string | No | WORKING/EPISODIC/SEMANTIC/PROCEDURAL | Filter by tier |
| type | string | No | Valid entry type | Filter by type |
| scope | string | No | USER/PROJECT/SHARED/all | Override scope filter |
| detail | boolean | No | default false | Include content preview |

**Output Data:**

| Field | Type | Description |
|-------|------|-------------|
| results[] | array | Ranked search results |
| results[].id | number | Entry ID |
| results[].summary | string | Entry summary |
| results[].score | number | Relevance score (higher = better) |
| results[].matchType | string | fts / vector / graph |
| results[].type | string | Entry type |
| results[].tier | string | Entry tier |
| results[].content | string | Only if detail=true, may be masked |

#### 3.1.5 API Contract (MCP Tool)

**Tool:** `mem_search`
**Purpose:** Find relevant knowledge entries for agent's current task

**Input Parameters:**

| Parameter | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| query | string | Yes | BR-01 (sanitized) | Search query |
| limit | number | No | BR-02 (default 10) | Max results |
| tier | string | No | Valid tier enum | Filter |
| type | string | No | Valid type | Filter |
| scope | string | No | BR-03 | Scope override |
| detail | boolean | No | BR-04 | Progressive disclosure |

**Business Error Scenarios:**

| Scenario | Message | Trigger |
|----------|---------|---------|
| Empty query | "Query cannot be empty" | query="" or whitespace-only |
| Invalid tier | "Invalid tier: {value}" | tier not in valid enum |
| DB error | "Search failed: {error}" | SQLite exception |

---

### 3.2 Feature: Knowledge Ingestion (mem_ingest)

**Source:** BRD Story 2

#### 3.2.1 Description

Agents store knowledge entries into the KB with metadata classification. System generates embeddings, updates FTS5 index, and creates audit trail.

#### 3.2.2 Use Case

**Use Case ID:** UC-02
**Actor:** AI Agent
**Preconditions:** Memory module initialized
**Postconditions:** Entry stored, searchable via mem_search

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Sends mem_ingest(content, metadata) | | Agent submits entry |
| 2 | | Validate content non-empty | Basic validation |
| 3 | | Auto-generate summary if not provided | LLM summarization |
| 4 | | **AI Tag Analysis** (if tags not provided) | Call internal TagAnalyzer API |
| 5 | | Generate ONNX embedding (384-dim) | Vector creation |
| 6 | | Insert into knowledge_entries | SQLite INSERT |
| 7 | | FTS5 trigger fires (auto-index) | Search index updated |
| 8 | | Store vector in knowledge_vectors | Vector stored |
| 9 | | Record audit log (INGEST) | Audit trail |
| 10 | | Return entry ID | Confirmation |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-01 | Summary provided | Skip step 3 |
| AF-02 | ONNX model not loaded | Skip step 4+7, entry still searchable via FTS5 |
| AF-03 | scope=PROJECT/SHARED | Validate user has permission |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-01 | Empty content | Return error "Content cannot be empty" |
| EF-02 | DB insert fails | Return error, no partial state |

#### 3.2.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-06 | Default tier = WORKING | BRD Story 2 |
| BR-07 | Default scope = USER | BRD Story 2 |
| BR-08 | Audit log MUST record every ingest | BRD Story 2 |
| BR-09 | FTS5 index updated synchronously (trigger) | Source code |

---

### 3.3 Feature: File Ingestion (mem_ingest_file)

**Source:** BRD Story 3

#### 3.3.1 Use Case

**Use Case ID:** UC-03
**Actor:** AI Agent

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Sends mem_ingest_file(file_path) | | Path only (~80 tokens) |
| 2 | | Resolve path (relative to workspace) | Path resolution |
| 3 | | Read file from disk | Direct I/O |
| 4 | | Detect format (markdown/text) | Auto-detection |
| 5 | | Chunk by ## headers (if markdown) | Section splitting |
| 6 | | Ingest each chunk as separate entry | Batch insert |
| 7 | | Return count of entries created | Confirmation |

#### 3.3.2 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-10 | Markdown chunking at ## level headers | BRD Story 3 |
| BR-11 | All chunks share source=file_path | BRD Story 3 |
| BR-12 | Token cost ~80 (path only, not content) | BRD Story 3 |

---

### 3.4 Feature: Scope Isolation and Promotion

**Source:** BRD Stories 4, 5

#### 3.4.1 Use Case: Scope Enforcement

**Use Case ID:** UC-04
**Trigger:** Every search/list operation

**Main Flow:**

| Step | System | Description |
|------|--------|-------------|
| 1 | Extract userId from request context | Identity |
| 2 | Build scope WHERE clause | SQL generation |
| 3 | Filter: scope IN ('PROJECT','SHARED') OR (scope='USER' AND user_id=?) | Visibility |

#### 3.4.2 Use Case: Scope Promotion

**Use Case ID:** UC-05
**Actor:** System (background), Admin (manual)

**Main Flow (Automatic):**

| Step | System | Description |
|------|--------|-------------|
| 1 | Hourly scan: find entries meeting criteria | ScopePromotionService |
| 2 | Evaluate: access_count>=5, confidence>=0.8, citations>=2 | Criteria check |
| 3 | Auto-promote USER->PROJECT (met criteria) | Direct promotion |
| 4 | Queue PROJECT->SHARED (requires approval) | Pending queue |
| 5 | Log promotion in consolidation_log | Audit |

**Main Flow (Manual - approve/reject):**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Admin calls mem_promote(approve, entryId, reviewerId) | | Approval |
| 2 | | Validate entry in pending queue | Check state |
| 3 | | Update scope PROJECT->SHARED | Promotion |
| 4 | | Log with reviewer comment | Audit |

#### 3.4.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-13 | Scope transitions: USER->PROJECT->SHARED only (no skip) | BRD Story 5 |
| BR-14 | USER->PROJECT: auto-approvable | BRD Story 5 |
| BR-15 | PROJECT->SHARED: requires manual approval | BRD Story 5 |
| BR-16 | promoteOnMerge: batch promote by ticket key | BRD Story 5 |

---

### 3.5 Feature: Data Masking

**Source:** BRD Story 6

#### 3.5.1 Use Case

**Use Case ID:** UC-06
**Actor:** System (applied on every search response)

**Main Flow:**

| Step | System | Description |
|------|--------|-------------|
| 1 | Check allowlist (exempt entries skip masking) | Allowlist |
| 2 | Classify sensitivity: detect PII + credentials | Detectors |
| 3 | Determine access level based on requester role | Role matrix |
| 4 | Apply masking (redact/hide/summary-only) | Masker |
| 5 | Audit log mask/hide/reveal action | Audit |

#### 3.5.2 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-17 | ADMIN: all levels, can reveal with flag | BRD Story 6 |
| BR-18 | DEVELOPER: PUBLIC only, PII/creds masked | BRD Story 6 |
| BR-19 | RESTRICTED entries: hidden for non-ADMIN | BRD Story 6 |
| BR-20 | CONFIDENTIAL: summary-only for non-ADMIN | BRD Story 6 |
| BR-21 | Every mask action audited | BRD Story 6 |

---

### 3.6 Feature: Knowledge Graph (mem_graph)

**Source:** BRD Story 7

#### 3.6.1 Use Case

**Use Case ID:** UC-07
**Actor:** AI Agent

**Main Flow (add_edge):**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Calls mem_graph(action=add_edge, source_id, target_id, relation) | | Create edge |
| 2 | | Validate both nodes exist | Referential check |
| 3 | | Insert edge with weight=1.0 | Store |
| 4 | | Return edge ID | Confirmation |

**Main Flow (neighbors):**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Calls mem_graph(action=neighbors, node_id) | | Query |
| 2 | | SELECT edges WHERE source_id=? OR target_id=? | Both directions |
| 3 | | Return edge list with related entries | Response |

#### 3.6.2 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-22 | Edges bidirectional in query (source OR target) | BRD Story 7 |
| BR-23 | ON DELETE CASCADE: edge deleted when node deleted | BRD Story 7 |
| BR-24 | auto_link limit: 50 orphans per invocation | BRD Story 7 |

---

### 3.7 Feature: AI-Assisted Tagging (Internal API)

**Source:** BRD Story 13

#### 3.7.1 Description

Server-side LLM-based tag analysis called internally during `mem_ingest` pipeline. NOT exposed as MCP tool — transparent to agents, zero context token cost. Analyzes content against business domain taxonomy and auto-assigns relevant tags.

#### 3.7.2 Use Case

**Use Case ID:** UC-08
**Actor:** System (internal, during ingest pipeline)
**Preconditions:** LLM provider available, tag taxonomy configured
**Postconditions:** Entry receives business-domain-appropriate tags

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Ingest pipeline | | Entry content ready, tags not provided |
| 2 | | Load tag taxonomy | From kb-tag-taxonomy.json or KB |
| 3 | | Build LLM prompt | Content + taxonomy + few-shot examples |
| 4 | | Call LLM (chat model) | Structured output: tags + confidence |
| 5 | | Parse LLM response | Extract tag suggestions |
| 6 | | Filter by confidence >= 0.7 | Only high-confidence tags applied |
| 7 | | Validate against taxonomy | Reject unknown tags |
| 8 | | Assign tags to entry | Update tags field |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-01 | Tags already provided by agent | Skip entire UC-08 (agent tags preserved) |
| AF-02 | auto_tag=false in request | Skip tag analysis |
| AF-03 | LLM returns tags not in taxonomy | Map to closest match or discard |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-01 | LLM timeout (>10s) | Fallback: keyword extraction (regex heuristics) |
| EF-02 | LLM unavailable | Fallback: keyword extraction |
| EF-03 | LLM returns invalid JSON | Fallback: keyword extraction |
| EF-04 | Empty content | Skip tag analysis (no error) |

#### 3.7.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-25 | Tag analysis is server-side only — NOT an MCP tool | BRD Story 13 |
| BR-26 | Agent context NOT increased (0 extra tokens) | BRD Story 13 |
| BR-27 | Confidence threshold: >=0.7 for auto-apply | BRD Story 13 |
| BR-28 | Tags must belong to configured taxonomy | BRD Story 13 |
| BR-29 | LLM timeout: 10s, then fallback to keyword extraction | BRD Story 13 |
| BR-30 | Agent-provided tags always take precedence (no override) | BRD Story 13 |

#### 3.7.4 API Contract (Internal REST — NOT MCP)

**Endpoint:** `POST /api/tags/analyze` (internal, called by MemoryEngine during ingest)

**Request:**

```json
{
  "content": "Decision: Use OAuth2 PKCE for mobile auth with 1-hour token expiry",
  "taxonomy_categories": ["business-domain", "technical", "sdlc-phase", "document-type"],
  "threshold": 0.7
}
```

**Response:**

```json
{
  "applied_tags": ["authentication", "api-design", "decision", "security"],
  "suggested_tags": [
    {"tag": "mobile", "category": "business-domain", "confidence": 0.6, "reason": "mentions mobile auth"}
  ],
  "fallback_used": false
}
```

**Batch Endpoint:** `POST /api/tags/batch-analyze` (admin only)

```json
{ "entry_ids": [1, 2, 3], "force": false }
```

**Response:**

```json
{ "processed": 3, "tagged": 2, "skipped": 1 }
```

#### 3.7.5 Tag Taxonomy Categories

| Category | Example Tags |
|----------|-------------|
| Business Domain | authentication, payment, notification, reporting, user-management |
| Technical | architecture, api-design, database, security, performance, testing |
| SDLC Phase | requirements, design, implementation, testing, deployment |
| Document Type | decision, error-pattern, procedure, architecture-note |
| Priority | critical, high, medium, low |

#### 3.7.6 Keyword Extraction Fallback (when LLM unavailable)

```
function extractKeywordTags(content):
  tags = []
  // Match known domain keywords
  for keyword in KNOWN_KEYWORDS:
    if content.toLowerCase().includes(keyword): tags.push(keyword)
  // Match CamelCase identifiers
  camelCaseMatches = content.match(/[A-Z][a-z]+(?=[A-Z])/g)
  // Match common patterns
  if content.startsWith("Decision:"): tags.push("decision")
  if content.includes("error") || content.includes("fix"): tags.push("error-pattern")
  return tags.slice(0, 6)  // max 6 tags
```

---

## 4. Data Model

### 4.1 Entity Relationship Overview

The Memory KB uses SQLite with the following logical entities:

### 4.2 Logical Entities

#### Entity: knowledge_entries (Core)

| Attribute | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| id | INTEGER PK | Yes | Auto-increment | Unique entry ID |
| content | TEXT | Yes | BR-06 | Full knowledge content |
| summary | TEXT | Yes | Auto-generated if empty | Brief summary |
| type | TEXT | Yes | Valid type enum | DECISION, ERROR_PATTERN, ARCHITECTURE, etc. |
| tier | TEXT | Yes | BR-06 (default WORKING) | Memory tier |
| scope | TEXT | Yes | BR-07 (default USER) | Visibility scope |
| user_id | TEXT | Conditional | Required for USER scope | Owner identifier |
| source | TEXT | No | | Source reference (file path, ticket) |
| tags | TEXT | No | Comma-separated | Searchable tags |
| confidence | REAL | Yes | Default 1.0, range 0-1 | Entry reliability score |
| access_count | INTEGER | Yes | Default 0, incremented on access | Usage tracking |
| pinned | INTEGER | No | 0 or 1 | Core memory flag |
| quality_score | INTEGER | No | 0-100 | Quality assessment |
| archived | INTEGER | Yes | 0 or 1 | Soft delete |

#### Entity: knowledge_vectors

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| entry_id | INTEGER FK | Yes | Links to knowledge_entries.id |
| vector | BLOB | Yes | 384-dim float32 embedding |
| model | TEXT | Yes | Model name (default: paraphrase-multilingual-MiniLM-L12-v2) |
| dimensions | INTEGER | Yes | Vector dimensions (384) |

#### Entity: knowledge_graph_edges

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| source_id | INTEGER FK | Yes | Source entry ID |
| target_id | INTEGER FK | Yes | Target entry ID |
| relation | TEXT | Yes | RELATES_TO, DEPENDS_ON, IMPLEMENTS, etc. |
| weight | REAL | Yes | Edge weight 0.0-1.0 |

**Relationships:**

| From | To | Cardinality | Description |
|------|-----|-------------|-------------|
| knowledge_entries | knowledge_vectors | 1:1 | Each entry has one embedding |
| knowledge_entries | knowledge_graph_edges | 1:N | Entry can have many edges |
| knowledge_entries | citations | 1:N | Entry can be cited many times |
| knowledge_entries | attachments | 1:N | Entry can have many files |
| knowledge_entries | feedback | 1:N | Entry can have many ratings |
| knowledge_entries | tags (via entry_tags) | M:N | Many-to-many via junction |

---

## 5. Integration Specifications

### 5.1 ONNX Runtime

| Attribute | Value |
|-----------|-------|
| Purpose | Generate text embeddings locally (no external API call) |
| Direction | Outbound (system calls ONNX) |
| Data Format | Float32 tensor |
| Frequency | On every ingest (real-time) |

### 5.2 LLM Service (Optional)

| Attribute | Value |
|-----------|-------|
| Purpose | Auto-generate summary when not provided |
| Direction | Outbound |
| Data Format | Text prompt/response |
| Frequency | On ingest when summary missing |

### 5.3 MCP Protocol

| Attribute | Value |
|-----------|-------|
| Purpose | Tool registration and invocation by AI agents |
| Direction | Inbound (agents call tools) |
| Data Format | JSON-RPC 2.0 |
| Frequency | Real-time, per agent request |

---

## 6. Processing Logic

### 6.1 Hybrid Search Algorithm

**Trigger:** Agent calls mem_search
**Input:** query string + optional filters
**Output:** Ranked results array

**Pseudocode:**

```
function hybridSearch(query, limit, tier, type, scopeCtx):
    sanitized = query.replace(/[^\w\s*":.]/g, ' ').trim() || '*'
    
    // Step 1: BM25 FTS5 search
    ftsResults = db.prepare("""
        SELECT ke.*, rank FROM knowledge_fts
        JOIN knowledge_entries ke ON knowledge_fts.rowid = ke.id
        WHERE knowledge_fts MATCH ? AND ke.archived = 0
        AND {scopeClause} AND {tierClause} AND {typeClause}
        ORDER BY rank LIMIT ?
    """).all(sanitized, scopeParams, limit * 2)
    
    // Step 2: Vector search (if embeddings available)
    if vectorIndex.loaded:
        queryVector = onnx.encode(query)
        vectorResults = vectorIndex.nearest(queryVector, limit * 2)
    
    // Step 3: Graph expansion (from top FTS hits)
    graphResults = []
    for top3 in ftsResults[0:3]:
        neighbors = getNeighbors(top3.id)
        graphResults.append(neighbors)
    
    // Step 4: Merge, deduplicate, rank
    merged = mergeByScore(ftsResults, vectorResults, graphResults)
    unique = deduplicate(merged)
    ranked = unique.sort(score DESC).slice(0, limit)
    
    return ranked
```

### 6.2 Scope Promotion Cycle

**Trigger:** Hourly interval (setInterval)
**Input:** All USER-scoped entries
**Output:** Promoted entries count

**Pseudocode:**

```
function runPromotionCycle():
    candidates = scanForPromotionCandidates(limit=50)
    
    for candidate in candidates:
        criteria = evaluateCriteria(candidate)
        if criteria.score >= THRESHOLD:
            if candidate.scope == 'USER':
                autoPromote(candidate, 'PROJECT')
            elif candidate.scope == 'PROJECT':
                queueForApproval(candidate, 'SHARED')
    
    return summary
```

---

## 7. Security Requirements

### 7.1 Authentication and Authorization

| Role | Permissions | Features |
|------|-------------|----------|
| ADMIN | Full access, reveal masked content | All tools + promotion approval |
| DEVELOPER | Read/write own USER, read PROJECT/SHARED | mem_search, mem_ingest, mem_graph |
| USER | Read/write own USER, read PROJECT/SHARED | mem_search, mem_ingest |
| EXTERNAL | Read SHARED only (PUBLIC sensitivity) | mem_search (limited) |

### 7.2 Data Sensitivity Classification

| Data Type | Classification | Requirement |
|-----------|---------------|-------------|
| API keys, tokens | RESTRICTED | Hidden for non-ADMIN |
| Emails, phones, SSN | INTERNAL | Masked for non-ADMIN |
| Business decisions | PUBLIC | Visible to all with scope access |
| Architecture patterns | PUBLIC | Visible to all with scope access |

### 7.3 Audit Trail

| Event | Logged Fields | Retention |
|-------|--------------|-----------|
| INGEST | entry_id, session_id, agent_name | Indefinite |
| SEARCH | query, result_count | 30 days |
| DELETE | entry_id, session_id | Indefinite |
| PROMOTE | entry_id, from_scope, to_scope | Indefinite |
| MASK/HIDE/REVEAL | entry_id, requester_id, role, action | Indefinite |

---

## 8. Non-Functional Requirements

| Category | Business Requirement | Acceptance Criteria |
|----------|---------------------|---------------------|
| Performance | Search returns quickly | BM25: <50ms, Hybrid: <200ms for 10K entries |
| Performance | Ingest does not block agent | <500ms including embedding |
| Scalability | KB grows with project | Support 100K entries, 500K edges |
| Reliability | No data loss | SQLite WAL mode |
| Availability | Module starts fast | <2s including migrations |
| Token Efficiency | File ingest saves tokens | ~80 tokens for mem_ingest_file |

---

## 9. Error Handling

### 9.1 Error Scenarios

| Scenario | Severity | Message | Recovery |
|----------|----------|---------|----------|
| Empty search query | Warning | "Query cannot be empty" | Agent provides query |
| File not found (ingest_file) | Error | "File not found: {path}" | Agent corrects path |
| Invalid scope transition | Error | "Cannot promote USER directly to SHARED" | Use correct transition |
| DB locked | Critical | "Database busy, retry" | Auto-retry once |
| ONNX model not loaded | Warning | "Embeddings unavailable, using FTS only" | Graceful degradation |

---

## 10. Testing Considerations

### 10.1 Key Test Scenarios

| ID | Scenario | Input | Expected | Priority |
|----|----------|-------|----------|----------|
| TC-01 | BM25 search finds entry | query="auth decision" | Entry with "auth" returned | High |
| TC-02 | Scope isolation enforced | User A searches, User B's USER entries | Not visible | High |
| TC-03 | File ingest chunks markdown | 3-section markdown file | 3 entries created | High |
| TC-04 | Promotion auto-triggers | Entry meets criteria | Promoted USER->PROJECT | High |
| TC-05 | Masking hides credentials | Entry with API key, role=DEV | Key masked | High |
| TC-06 | Graph neighbors returns edges | Entry with 2 edges | 2 neighbors returned | Medium |
| TC-07 | Pin respects token budget | 5 entries pinned, total>2000 tokens | Truncated at budget | Medium |

---

## 11. Appendix

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | System Context | [system-context.png](diagrams/system-context.png) | [system-context.drawio](diagrams/system-context.drawio) |
| 2 | Sequence: Hybrid Search | [sequence-search.png](diagrams/sequence-search.png) | [sequence-search.drawio](diagrams/sequence-search.drawio) |
| 3 | State: Entry Lifecycle | [state-entry-lifecycle.png](diagrams/state-entry-lifecycle.png) | [state-entry-lifecycle.drawio](diagrams/state-entry-lifecycle.drawio) |
