# Technical Design Document (TDD)

## {SYSTEM_NAME} — {TICKET_KEY}: {TICKET_SUMMARY}

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | {TICKET_KEY} |
| Title | {TICKET_SUMMARY} |
| Author | SA Agent |
| Version | 1.0 |
| Date | {CURRENT_DATE} |
| Status | Draft |
| Related BRD | BRD-v{VERSION}-{TICKET-KEY}.docx |
| Related FSD | FSD-v{VERSION}-{TICKET-KEY}.docx |

---

## Author Tracking

| Role | Name - Position | Responsibility |
|------|-----------------|----------------|
| Author | {AUTHOR_NAME} – Solution Architect | Create document |
| Peer Reviewer | {REVIEWER_NAME} – {REVIEWER_POSITION} | Review document |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | {CURRENT_DATE} | SA Agent | Initiate document — auto-generated from BRD and FSD |

---

## Sign-Off

| Name | Signature and date |
|------|--------------------|
| | ☐ I agree and confirm the technical design in this TDD |
| | ☐ I agree and confirm the technical design in this TDD |

---

## 1. Introduction

> **Scope Boundary:** This TDD specifies HOW to implement the requirements defined in the FSD. It does NOT repeat functional requirements, business rules, use cases, or UI specifications — refer to the FSD for those. This document focuses on: technology choices, architecture decisions, implementation patterns, and deployment concerns.

### 1.1 Purpose

{Describe the purpose of this TDD — what system/feature is being designed and why.}

### 1.2 Scope

{Technical scope — what components, services, and integrations are covered.}

### 1.3 Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Language | {Kotlin/Java/TypeScript} | {version} |
| Framework | {Spring Boot/NestJS/React} | {version} |
| Database | {PostgreSQL/MySQL/Oracle} | {version} |
| Build Tool | {Gradle/Maven/npm} | {version} |
| Container | {Docker} | {version} |
| CI/CD | {GitLab CI/Jenkins/GitHub Actions} | {version} |

### 1.4 Design Principles

- {Principle 1 — e.g., SOLID, DRY, KISS}
- {Principle 2}

### 1.5 Constraints

- {Technical constraint 1}
- {Technical constraint 2}

### 1.6 References

| Document | Location |
|----------|----------|
| BRD | BRD-v{VERSION}-{TICKET-KEY}.docx |
| FSD | FSD-v{VERSION}-{TICKET-KEY}.docx |

---

## 2. System Architecture

### 2.1 Architecture Overview

{High-level description of the system architecture.}

![Architecture Diagram](diagrams/architecture.png)

### 2.2 Component Diagram

{Description of internal components and their responsibilities.}

![Component Diagram](diagrams/component.png)

| Component | Responsibility | Technology |
|-----------|---------------|------------|
| {Component name} | {What it does} | {Tech used} |

### 2.3 Deployment Architecture

{Description of deployment topology — containers, servers, networks.}

![Deployment Diagram](diagrams/deployment.png)

### 2.4 Communication Patterns

| From | To | Protocol | Pattern | Description |
|------|----|----------|---------|-------------|
| {Service A} | {Service B} | {REST/gRPC/MQ} | {Sync/Async} | {Description} |

---

## 3. API Design

> **Prerequisite:** Functional API contracts (parameters, business errors, data flows) are defined in FSD §3.x.6. This section specifies the technical implementation: headers, authentication mechanism, rate limiting, request/response JSON schemas, HTTP status codes, and error code mapping.

### 3.1 API Overview

| # | Endpoint | Method | Description | Source |
|---|----------|--------|-------------|--------|
| 1 | {/api/v1/resource} | {GET/POST/PUT/DELETE} | {Description} | {UC-x} |

---

### 3.2 API: {Endpoint Name}

**Implements:** {UC-x, BR-y}

| Attribute | Value |
|-----------|-------|
| Method | {GET/POST/PUT/DELETE} |
| Path | {/api/v1/resource} |
| Auth | {Bearer Token / API Key / None} |
| Rate Limit | {requests/minute} |

**Request Headers:**

| Header | Required | Description |
|--------|----------|-------------|
| Authorization | Yes | Bearer {token} |
| Content-Type | Yes | application/json |

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| {param} | {type} | {Yes/No} | {Description} |

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| {param} | {type} | {Yes/No} | {default} | {Description} |

**Request Body:**

```json
{
  "field1": "string",
  "field2": 0
}
```

**Response — 200 OK:**

```json
{
  "data": {},
  "message": "Success"
}
```

**Error Responses:**

| Status | Code | Message | Description |
|--------|------|---------|-------------|
| 400 | {ERR_CODE} | {Message} | {When this occurs} |
| 404 | {ERR_CODE} | {Message} | {When this occurs} |
| 500 | {ERR_CODE} | {Message} | {When this occurs} |

---

{Repeat Section 3.2 for each API endpoint}

---

## 4. Database Design

> **Prerequisite:** Logical data model (entities, relationships, business attributes) is defined in FSD §4. This section specifies the physical implementation: DDL scripts, indexes, migration plans, and query performance patterns.

### 4.1 Schema Overview

![Database Schema](diagrams/db-schema.png)

### 4.2 DDL Scripts

#### Table: {TABLE_NAME}

```sql
CREATE TABLE {table_name} (
    {column_name} {DATA_TYPE} {CONSTRAINTS},
    {column_name} {DATA_TYPE} {CONSTRAINTS},
    PRIMARY KEY ({pk_column}),
    CONSTRAINT {fk_name} FOREIGN KEY ({fk_column}) REFERENCES {ref_table}({ref_column})
);
```

#### Indexes

```sql
CREATE INDEX {idx_name} ON {table_name} ({column1}, {column2});
```

### 4.3 Migration Plan

| Order | Script | Description | Estimated Time | Rollback |
|-------|--------|-------------|----------------|----------|
| 1 | {V1__create_table.sql} | {Description} | {time} | {V1__rollback.sql} |

### 4.4 Query Patterns

| Operation | Query Pattern | Expected Performance |
|-----------|--------------|---------------------|
| {Operation name} | {SELECT/JOIN pattern} | {< X ms} |

---

## 5. Class / Module Design

### 5.1 Package Structure

```
{root.package}/
├── controller/          # API controllers
│   └── {FeatureController}
├── service/             # Business logic
│   ├── {FeatureService} (interface)
│   └── {FeatureServiceImpl}
├── repository/          # Data access
│   └── {FeatureRepository}
├── model/               # Domain entities
│   └── {Entity}
├── dto/                 # Request/Response DTOs
│   ├── {FeatureRequest}
│   └── {FeatureResponse}
├── config/              # Configuration
│   └── {FeatureConfig}
└── exception/           # Custom exceptions
    └── {FeatureException}
```

### 5.2 Key Interfaces

```kotlin
interface {ServiceInterface} {
    fun {methodName}({params}): {ReturnType}
}
```

### 5.3 Design Patterns

| Pattern | Where Used | Rationale |
|---------|-----------|-----------|
| {Repository} | Data access layer | {Why this pattern} |
| {Strategy} | {Component} | {Why this pattern} |

### 5.4 Error Handling

| Exception | HTTP Status | Error Code | When Thrown |
|-----------|-------------|------------|------------|
| {ExceptionClass} | {4xx/5xx} | {ERR_CODE} | {Condition} |

---

## 6. Integration Design

> **Prerequisite:** Business integration requirements (what systems, what data is exchanged, business rules) are defined in FSD §5. This section specifies the technical implementation: protocols, timeouts, retry policies, circuit breakers, and sequence diagrams.

### 6.1 External System: {System Name}

| Attribute | Value |
|-----------|-------|
| Protocol | {JDBC/REST/SFTP/MQ} |
| Endpoint | {URL or connection string} |
| Authentication | {Method} |
| Timeout | {seconds} |
| Retry Policy | {max retries, backoff} |
| Circuit Breaker | {threshold, reset time} |

**Data Mapping:**

| Source Field | Target Field | Transformation |
|-------------|-------------|----------------|
| {source} | {target} | {transformation} |

**Sequence Diagram:**

![API Sequence](diagrams/api-sequence-{name}.png)

---

## 7. Security Design

> **Prerequisite:** Business security requirements (roles, permissions, data classification, audit needs) are defined in FSD §7. This section specifies the technical implementation: authentication mechanism, token configuration, encryption algorithms, and input validation rules.

### 7.1 Authentication

{Describe authentication mechanism — JWT, OAuth2, session-based, etc.}

### 7.2 Authorization

| Role | Endpoints | Permissions |
|------|-----------|-------------|
| {Role} | {/api/...} | {READ/WRITE/ADMIN} |

### 7.3 Data Protection

| Data Type | At Rest | In Transit | In Logs |
|-----------|---------|------------|---------|
| {PII field} | {Encrypted/Plain} | {TLS 1.2+} | {Masked/Excluded} |

### 7.4 Input Validation

| Field | Validation | Sanitization |
|-------|-----------|--------------|
| {field} | {rules} | {method} |

---

## 8. Performance & Scalability

> **Prerequisite:** Business NFR targets (response time, availability, scalability expectations) are defined in FSD §8. This section specifies how to achieve those targets: caching strategy, connection pooling, and technical performance benchmarks.

### 8.1 Caching Strategy

| Cache | What | TTL | Eviction | Technology |
|-------|------|-----|----------|------------|
| {cache name} | {what is cached} | {duration} | {LRU/TTL} | {Redis/In-memory} |

### 8.2 Connection Pooling

| Resource | Min | Max | Timeout | Idle Timeout |
|----------|-----|-----|---------|-------------|
| {Database} | {min} | {max} | {ms} | {ms} |

### 8.3 Performance Targets

| Operation | Target | Measurement |
|-----------|--------|-------------|
| {API endpoint} | {< X ms p95} | {How to measure} |

---

## 9. Monitoring & Observability

### 9.1 Logging

| Log Event | Level | Fields | Destination |
|-----------|-------|--------|-------------|
| {event} | {INFO/WARN/ERROR} | {fields to log} | {destination} |

### 9.2 Metrics

| Metric | Type | Description | Alert Threshold |
|--------|------|-------------|-----------------|
| {metric name} | {Counter/Gauge/Histogram} | {Description} | {threshold} |

### 9.3 Health Checks

| Endpoint | Checks | Expected Response |
|----------|--------|-------------------|
| /actuator/health | {DB, external services} | 200 OK |

---

## 10. Deployment Considerations

### 10.1 Environment Configuration

| Property | DEV | SIT | UAT | PROD |
|----------|-----|-----|-----|------|
| {property} | {value} | {value} | {value} | {value} |

### 10.2 Feature Flags

| Flag | Default | Description |
|------|---------|-------------|
| {flag name} | {true/false} | {What it controls} |

### 10.3 Rollback Strategy

{Describe how to rollback this change if issues are found in production.}

---

## 11. Appendix

### Glossary

| Term | Definition |
|------|------------|
| {Term} | {Definition} |

### Open Questions

| # | Question | Status | Answer |
|---|----------|--------|--------|
| 1 | {Question} | {Open/Resolved} | {Answer if resolved} |

---

## ⛔ MANDATORY: Diagram Requirements

**Every diagram referenced in this TDD MUST exist as a draw.io file (.drawio) AND be exported to PNG (.png).** Mermaid diagrams inline in markdown are supplementary — they do NOT replace draw.io files.

### Required draw.io Diagrams

| # | Diagram | File | Section | Required |
|---|---------|------|---------|----------|
| 1 | Architecture Overview | `diagrams/architecture.drawio` + `.png` | §2.1 | ✅ MANDATORY |
| 2 | Component Diagram | `diagrams/component.drawio` + `.png` | §2.2 | ✅ MANDATORY |
| 3 | Deployment Diagram | `diagrams/deployment.drawio` + `.png` | §2.3 | ✅ MANDATORY |
| 4 | API Sequence (per key flow) | `diagrams/api-sequence-{name}.drawio` + `.png` | §3.x | ✅ MANDATORY (≥1) |
| 5 | Database/Data Schema | `diagrams/db-schema.drawio` + `.png` | §4.1 | ✅ MANDATORY |
| 6 | Class Diagram | `diagrams/class-diagram.drawio` + `.png` | §5.x | ✅ MANDATORY |
| 7 | State Diagram (if applicable) | `diagrams/state-{entity}.drawio` + `.png` | §5.x or §6.x | OPTIONAL |
| 8 | Integration Sequence | `diagrams/integration-{name}.drawio` + `.png` | §6.x | OPTIONAL |

### Rules

1. **Every `![...](diagrams/....png)` reference in TDD MUST have a corresponding `.drawio` + `.png` file**
2. **Mermaid diagrams are IN ADDITION to draw.io** — they make the markdown readable without opening draw.io, but draw.io files are the authoritative visual artifacts
3. **Export command**: `& "C:\Program Files\draw.io\draw.io.exe" -x -f png -b 10 -o "documents/{TICKET-KEY}/diagrams/{name}.png" "documents/{TICKET-KEY}/diagrams/{name}.drawio"`
4. **draw.io XML format**: Use bare `<mxGraphModel>` — no `<mxfile>` wrapper. Every edge must have `<mxGeometry>` child (not self-closing).
5. **Minimum 6 draw.io diagrams** for a complete TDD: architecture + component + deployment + api-sequence + db-schema + class-diagram
