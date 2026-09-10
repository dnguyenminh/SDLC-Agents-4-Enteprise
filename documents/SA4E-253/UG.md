# User Guide (UG)

## SDLC Agents 4 Enterprise — SA4E-253: Emit distinct symbol kinds per language so KB Graph node types are correct (all languages)

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-253 |
| Title | Emit distinct symbol kinds per language so KB Graph node types are correct (all languages) |
| Author | DEV Agent |
| Reviewer | BA Agent |
| Version | 1.0 |
| Date | 2026-09-09 |
| Status | Draft |
| Related BRD | BRD-v1.0-SA4E-253.docx |
| Related FSD | FSD-v1.0-SA4E-253.docx |
| Related TDD | TDD-v1.0-SA4E-253.docx |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-09 | DEV Agent | Initial document |

---

## 1. Introduction

### 1.1 Purpose
This guide describes how the code indexing pipeline now emits distinct, semantically-correct symbol kinds per language and how those kinds map to KB Graph node types. It is for developers, QA engineers, and system administrators working with Salesforce Metadata, Apex, and general language parsers.

### 1.2 Audience

| Audience | What They Need |
|----------|---------------|
| Developer | How to trigger indexing and verify node types |
| QA Engineer | How to verify KB Graph node types after re-index |
| System Admin | How to ensure backward compatibility with Pega data |

### 1.3 Prerequisites

| Prerequisite | Version | Required |
|-------------|---------|----------|
| Node.js | 20.x | Yes |
| Backend service | SA4E-253 | Yes |

---

## 2. Getting Started

### 2.1 Quick Start

```bash
# 1. Ensure backend is running
npm run dev

# 2. Trigger re-index for project
curl -H "Authorization: Bearer <JWT>" -X POST http://localhost:48721/api/projects/7b11cdc169de/reindex

# 3. Verify graph nodes
curl -H "Authorization: Bearer <JWT>" http://localhost:48721/api/graph/nodes?projectId=7b11cdc169de
```

Expected log: `graph-sync] Synced N code nodes for project 7b11cdc169de`

### 2.2 System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| Node.js | 20.x | 20.x |
| Memory | 2 GB | 4 GB |
| Disk | 10 GB | 20 GB |

### 2.3 Configuration Methods

Configuration is in-process; no external config file required for this feature.

---

## 3. Configuration

### 3.1 Configuration Reference

No runtime configuration for kind mapping. KIND_TO_TYPE is defined in `backend/src/modules/kb-graph/service/constants.ts`.

#### KIND_TO_TYPE

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| apex_class | string | APEX_CLASS | Maps Apex class kind to graph node type |
| trigger | string | TRIGGER | Maps Apex trigger kind |
| flow | string | FLOW | Maps Salesforce Flow |
| sf_object | string | SF_OBJECT | Maps Salesforce Custom Object |
| sf_field | string | SF_FIELD | Maps Salesforce Field |
| lwc_component | string | LWC_COMPONENT | Maps Lightning Web Component |
| aura_component | string | AURA_COMPONENT | Maps Aura Component |
| visualforce_page | string | VISUALFORCE_PAGE | Maps Visualforce Page |

### 3.2 CODE_KINDS

CODE_KINDS in `backend/src/engine/graph/graph-sync-service.ts` includes all new kinds for projection.

---

## 4. Usage

### 4.1 Emit Distinct Symbol Kinds

**Description:** Parser layer emits semantically correct kinds per language.

**How to use:**
Parser runs automatically during indexing.

**Example:**
Parsing `MyObject.object-meta.xml` emits symbol with `kind: 'sf_object'` and `kind: 'sf_field'` for fields.

**Expected Output:**
Graph node type `SF_OBJECT` and `SF_FIELD` appear in KB Graph.

### 4.2 Graph Mapping

**API:** `graphTypeForKind(kind: string): string`

Input: `apex_class` → Output: `APEX_CLASS`

### 4.3 Verify Node Types

**How to use:**
After re-index, query graph nodes.

```
GET /api/graph/nodes?projectId=7b11cdc169de
```

Expected: node types include `APEX_CLASS`, `FLOW`, `SF_OBJECT`, `LWC_COMPONENT`.

---

## 5. Administration

### 5.1 Re-index Project

1. Trigger re-index via API
2. Wait for completion log
3. Verify node distribution

### 5.2 Backward Compatibility

Pega kinds prefixed with `pega_` continue 1:1 mapping via `graphTypeForKind` fallback.

---

## 6. Troubleshooting

### 6.1 Common Issues

| Symptom | Cause | Solution |
|---------|-------|----------|
| Nodes still show CLASS for Flow | Old index | Re-index project |
| Unknown kind warning | Parser emitted unmapped kind | Add mapping to KIND_TO_TYPE |
| CODE_ENTITY fallback | Kind not in CODE_KINDS | Add kind to CODE_KINDS array |

### 6.2 Error Codes

| Code | Message | Action |
|------|---------|--------|
| WARN | Kind not mapped, using fallback | Check KIND_TO_TYPE |
| ERROR | Graph sync failed | Check DB connectivity |

### 6.3 Logs

| Log Location | Content |
|-------------|---------|
| stdout | graph-sync duration, unknown kinds |

---

## 7. API Reference

### 7.1 graphTypeForKind

**Name:** graphTypeForKind  
**Description:** Translate parser-emitted symbol kind to KB Graph node type.

**Input Schema:**
```json
{ "kind": "string" }
```

**Example Response:**
```json
{ "node_type": "APEX_CLASS" }
```

### 7.2 syncProjectSymbols

**Name:** syncProjectSymbols  
**Description:** Project code symbols into graph_nodes.

**Input:**
```json
{ "projectId": "7b11cdc169de" }
```

---

## 8. Appendix

### 8.1 Glossary

| Term | Definition |
|------|------------|
| Symbol Kind | Type of code entity emitted by parser |
| KB Graph | Knowledge Base Graph storing indexed entities |
| KIND_TO_TYPE | Mapping constant translating kinds to node types |

### 8.2 Related Documents

| Document | Location |
|----------|----------|
| BRD | documents/SA4E-253/BRD.md |
| FSD | documents/SA4E-253/FSD.md |
| TDD | documents/SA4E-253/TDD.md |

### 8.3 Version Compatibility

| System Version | Config Version | Breaking Changes |
|---------------|---------------|-----------------|
| 1.0.0 | v1 | Initial release |
