# Functional Specification Document (FSD)

## Code Intelligence Indexer — SA4E-261: Indexer skips non-Java source files (JSP/XML/SQL/config) - index all supported source artifacts

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-261 |
| Title | Indexer skips non-Java source files (JSP/XML/SQL/config) - index all supported source artifacts |
| Author | BA Agent / TA Agent |
| Version | 1.0 |
| Date | 2026-09-11 |
| Status | Final |
| Related BRD | documents/SA4E-261/BRD.md |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1-draft | 2026-09-11 | BA Agent | Initial draft from BRD — Functional Specification, Data Requirements, Integration Points, NFR, Constraints. TA enrichment pending. |
| 1.0 | 2026-09-11 | TA Agent | Technical enrichment: technology choices, system constraints, performance, detailed API contracts, data flow, NFR quantification, system-context diagram. |

---

## 1. Introduction

### 1.1 Purpose

This FSD specifies the functional behavior required to extend the Code Intelligence indexer to handle non-Java source artifacts. The purpose is to align extension file selection and backend supported-extension handling under a single source of truth, enable Tier B full-text indexing for grammar-less files, and prevent silent drops of JSP/XML/SQL/config files.

### 1.2 Scope

Reference BRD §1.1 Scope. Technical scope clarification for FSD draft:
- Extension file discovery glob is unified with backend `FALLBACK_EXTENSIONS`.
- Backend validates incoming files against unified list; Tier A = tree-sitter parse, Tier B = full-text store in KB.
- No semantic JSP parser in this phase; reference extraction via regex/full-text is acceptable.
- Contract test guards divergence between extension glob and backend list.

Out of scope per BRD §1.2 remains unchanged.

### 1.3 Definitions & Acronyms

| Term | Definition |
|------|------------|
| Tier A | Symbol graph indexing via tree-sitter grammar |
| Tier B | Full-text content indexing without symbol graph |
| FALLBACK_EXTENSIONS | Backend default supported extension list |
| Unified Extension List | Single source of truth for extension whitelist used by Extension and Backend |

### 1.4 References

| Document | Location |
|----------|----------|
| BRD | documents/SA4E-261/BRD.md |
| IndexerHttpClient | extension/src/services/IndexerHttpClient.ts |
| Project Type Resolver | backend/src/engine/indexer/project-type/resolver.ts |

---

## 2. System Overview

### 2.1 System Context Diagram

System interacts with Developer via VS Code Extension; Extension uploads to Backend Indexer Service; Backend persists to Knowledge Base.

![System Context](diagrams/system-context.png)
*Source: `diagrams/system-context.drawio` — created by TA.*

<!-- TA enrichment -->

### 2.2 System Architecture

High-level components:
- **VS Code Extension**: file discovery via unified glob, upload to Backend `/api/index/source`
- **Backend Indexer Service**: validates extensions, routes to Tree-sitter parser or full-text indexer
- **Knowledge Base**: stores code nodes for Tier A and full-text documents for Tier B
- **Indexer Contract Test**: guards extension/backend sync

---

## 3. Functional Requirements

### 3.1 Feature: Unified Extension Whitelist & File Discovery

**Source:** BRD Story 1 & Story 3

#### 3.1.1 Description

Extension must discover files with extensions .jsp, .xml, .sql, .properties, .yml, .html, .css, .js in addition to existing Java extensions. Backend must accept these extensions without silent drop. Both sides share a single source of truth.

#### 3.1.2 Use Case

**Use Case ID:** UC-01
**Actor:** Developer
**Preconditions:** Workspace opened in VS Code; indexer enabled
**Postconditions:** Knowledge graph contains nodes for non-Java files

**Main Flow:**
| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Developer | | Triggers index |
| 2 | | Extension | findFiles using unified extension pattern, exclude vendor dirs |
| 3 | Extension | Backend | POST files to /api/index/source |
| 4 | Backend | | Validate extension against unified list |
| 5 | Backend | KB | Store Tier A/B artifacts |

**Alternative Flows:**
| ID | Condition | Steps |
|----|-----------|-------|
| AF-1 | File extension not in unified list | Reject with log entry; not indexed |

**Exception Flows:**
| ID | Condition | Steps |
|----|-----------|-------|
| EF-1 | Parse error on Tier A file | Fallback to full-text store Tier B |

#### 3.1.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-01 | Extension glob pattern must include .jsp, .xml, .sql, .properties, .yml, .html, .css, .js | BRD 2.3 Story 1 |
| BR-02 | Backend supported-extension list is identical to extension list | BRD 2.3 Story 3 |
| BR-03 | Unsupported extension must be rejected with log, not silently dropped | BRD 2.3 Story 1 |

#### 3.1.4 Data Specifications

**Input Data:**
| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| file_path | string | Y | Relative path | e.g., WEB-INF/views/adminHome.jsp |
| file_extension | string | Y | In unified list | jsp |
| content | text | Y | Size limit per file | File content |

**Output Data:**
| Field | Type | Description |
|-------|------|-------------|
| node_id | string | KB node identifier |
| tier | string | A or B |

#### 3.1.5 UI Specifications

N/A — no UI change per BRD.

#### 3.1.6 API Contract (Functional View)

**Endpoint:** POST /api/index/source
**Purpose:** Accept source files for indexing
**Input Parameters:**
| Parameter | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| file_path | string | Y | BR-01 | Relative path |
| file_extension | string | Y | BR-02 | Extension |
| content | string | Y | Size limit | File content |

**Business Error Scenarios:**
| Scenario | User Message | Trigger Condition |
|----------|-------------|-------------------|
| Unsupported extension | File skipped | Extension not in unified list |
| Parse error | Indexed as full-text | Tree-sitter failure |

### 3.2 Feature: Tier B Full-Text Indexing for Non-Grammar Files

**Source:** BRD Story 2

#### 3.2.1 Description

Files without tree-sitter grammar are stored as full-text in KB for search.

#### 3.2.2 Use Case
**Use Case ID:** UC-02
**Actor:** Developer
**Preconditions:** File with non-grammar extension indexed
**Postconditions:** File searchable in KB

**Main Flow:**
| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | | Backend | Detect no grammar for extension |
| 2 | | Backend | Store content full-text |
| 3 | Developer | KB | Search returns file path + snippet |

#### 3.2.3 Business Rules
| Rule ID | Rule | Source |
|---------|------|--------|
| BR-04 | Non-grammar files must be at least full-text searchable | BRD 2.3 Story 2 |

#### 3.2.4 Data Specifications

Input as above.

---

## 4. Data Model

**Note:** Logical data model. Physical DDL in TDD.

### 4.1 Logical Entities

#### Entity: IndexedFile

| Attribute | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| file_path | string | Y | | Relative path |
| file_extension | string | Y | BR-02 | Extension |
| content | text | Y | | Content |
| tier | enum | Y | | A/B |
| project_id | string | Y | | Project identifier |

**Relationships:**
| From Entity | To Entity | Cardinality | Description |
|-------------|-----------|-------------|-------------|
| IndexedFile | KBNode | 1:1 | File maps to KB node |

---

## 5. Integration Specifications

### 5.1 External System: Knowledge Base

| Attribute | Value |
|-----------|-------|
| Purpose | Persist indexed nodes and full-text |
| Direction | Outbound |
| Data Format | JSON |
| Frequency | On-demand |

**Data Exchange:**
| Our Data | External Data | Direction | Business Rule |
|----------|--------------|-----------|---------------|
| file_path, content | node_id | Send | BR-01 |

### 5.2 External System: Extension ↔ Backend

Shared extension list constant. Contract test guards divergence.

---

## 6. Processing Logic

### 6.1 Indexing Process

**Trigger:** Developer initiates index
**Input:** File list with unified extensions
**Output:** KB nodes Tier A/B

**Processing Steps:**
| Step | Description | Error Handling |
|------|-------------|----------------|
| 1 | Extension discovers files | Log missing glob |
| 2 | Upload to backend | Retry on network error |
| 3 | Validate extension | Reject unsupported |
| 4 | Parse or full-text | Fallback to Tier B on parse error |
| 5 | Update KB | Log failure |

---

## 7. Security Requirements

No new data exposure; files already accessible in workspace. Maintain existing auth for `/api/index/source`.

---

## 8. Non-Functional Requirements

| Category | Business Requirement | Acceptance Criteria |
|----------|---------------------|---------------------|
| Performance | Indexing time increase <20% for sample project | Measured on e-commerce Spring Boot |
| Availability | Indexer availability unchanged | No backend downtime |
| Scalability | Support 10k+ files across extensions | Batch upload with retry |

---

## 9. Error Handling (User-Facing)

| Scenario | Severity | User Message | Expected Behavior |
|----------|----------|-------------|-------------------|
| Unsupported extension | Warning | File skipped | Log entry |
| Parse error | Info | Indexed as text | Continue |

---

## 10. Testing Considerations

| ID | Scenario | Input | Expected Output | Priority |
|----|----------|-------|-----------------|----------|
| TC-01 | Index JSP file | file.jsp | Node created Tier B | High |
| TC-02 | Extension/backend divergence | Change glob | Contract test fails | High |

---

## 11. Appendix

### Constraints

- No semantic JSP parser in this phase.
- Unified extension list must be test-guarded.
- Full-text search satisfies immediate need.

**Change Log from BRD**
Draft based on BRD 1.0. TA to enrich with detailed API contracts, ER diagram, sequence diagrams, and UI notes if applicable.


<!-- TA enrichment -->
## 12. Technical Enrichment (TA)

> **Note:** Section added by Technical Architect to complement BA functional spec with implementation-ready details. All BA sections above are preserved unchanged.

### 12.1 Technology Choices & Architecture Alignment

| Component | Technology | Rationale | Source |
|-----------|------------|-----------|--------|
| Backend API | TypeScript + Hono | Existing backend core uses Hono app factory; all indexing routes registered via `registerIndexRoutes` | `backend/src/server/routes/api-index.ts` |
| Extension | TypeScript + VS Code API | Extension already uses `IndexerHttpClient` with `utilHttpPostJson`; file discovery via `vscode.workspace.findFiles` | `extension/src/services/IndexerHttpClient.ts` |
| Indexing Strategy | `IndexingStrategyResolver` | Central resolver defines `FALLBACK_EXTENSIONS`; single source of truth for project type mapping | `backend/src/engine/indexer/project-type/resolver.ts` |
| Knowledge Store | SQLite `better-sqlite3` + Code-Intel MCP memory | KB persistence via `KnowledgeDb.ts`; MCP `mem_ingest` for Tier B full-text | `.analysis/code-intelligence/project-structure.md` |
| Supported Extensions | Unified constant | Extension glob must mirror backend `FALLBACK_EXTENSIONS`; contract test guards drift | BRD Story 3 |
| Tier A Parsing | tree-sitter | Existing for Java/TS/Python etc.; no new grammars added for JSP/XML | BRD §1.2 Out of Scope |
| Tier B Indexing | Full-text store in KB | Grammar-less files stored as content + path for search | BRD Story 2 |

**System Constraints**
- No semantic JSP parser in this phase; regex reference extraction acceptable.
- Extension and backend extension whitelist must remain identical; test `ContractGuard` must fail on divergence.
- Batch upload size limited to 20 files per request to avoid PG pool exhaustion (SA4E-99).
- Auth enforced via JWT middleware `requireAuth`; header `Authorization: Bearer <token>` + `X-Project-Id` mandatory.
- Backpressure: `/api/index/source` concurrency limit 3 requests; 429 response with `Retry-After`.

**Performance Considerations**
- Indexing time increase <20% for e-commerce Spring Boot sample project (projectId 97c72f0c2366).
- Tier B full-text does not trigger tree-sitter parse; CPU cost negligible.
- Batch delay 500ms between uploads + exponential backoff on 429/5xx.
- Large XML/SQL files >5MB should be excluded via config to avoid memory spikes.

### 12.2 Detailed API Contracts

> **Endpoint: POST /api/index/source**
> Implements UC-01, BR-01/02/03

**Request Headers**
| Header | Type | Required | Validation |
|--------|------|----------|------------|
| Authorization | string | Y | Bearer JWT, validated via `validateSession` |
| X-Project-Id | string | Y | `requireProjectId` enforced |
| X-Workspace-Root | string | N | Used for relative path resolution |
| Content-Type | string | Y | application/json |

**Request Body Schema**
```json
{
  "files": [
    {
      "path": "string",
      "content": "string",
      "gitHash": "string?",
      "checksum": "string?"
    }
  ]
}
```

**Validation Rules**
- `path` must be safe (no `..` traversal). Rejected files logged with `rejected` array.
- `file_extension` derived from `path`; must be in unified list.
- Unsupported extension → file rejected, response `rejected[]` populated.

**Response Schema 200**
```json
{
  "written": 12,
  "skipped": 0,
  "rejected": ["../etc/passwd"],
  "deps": [],
  "projectId": "97c72f0c2366"
}
```

**Error Codes**
| Code | Condition |
|------|-----------|
| 401 | Missing/invalid JWT |
| 400 | Body not array |
| 429 | activeIndexRequests >=3 |
| 400 | X-Project-Id missing |
| 500 | Write error |

**Pseudocode**
```typescript
function handleIndexSource(req) {
  assertAuth(req.headers.authorization);
  const projectId = requireProjectId(req.headers['x-project-id']);
  const files = req.body.files;
  for each file in files {
    if (!isSafePath(file.path)) { rejected.push(file.path); continue; }
    const ext = getExtension(file.path);
    if (!UNIFIED_EXTENSIONS.includes(ext)) { rejected.push(file.path); continue; }
    writeFileToTemp(projectId, file.path, file.content);
  }
  return { written, rejected };
}
```

### 12.3 Data Flow

System context diagram: `documents/SA4E-261/diagrams/system-context.drawio`

Steps: Developer → Extension findFiles → POST /api/index/source → Backend validate → write temp → POST /api/index/full → Tier A/B indexing → KB.

### 12.4 Non-Functional Requirements – Quantified

| Category | Target |
|----------|--------|
| Performance | Indexing time increase <20% |
| Availability | 99.9% uptime |
| Scalability | 10k+ files |
| Response Time | POST /api/index/source p95 <500ms |
| Security | JWT + path sanitization |

### 12.5 Open Issues

| ID | Issue | Owner | Target |
|----|-------|-------|--------|
| OI-01 | Define unified extension constant location | TA/SA | 2026-09-15 |
| OI-02 | Contract test implementation | DEV | 2026-09-20 |
| OI-03 | Large file exclusion threshold | BA | 2026-09-18 |

<!-- End TA enrichment -->
