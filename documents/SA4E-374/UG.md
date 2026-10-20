# User Guide (UG)

## SA4E-374 — Single Responsibility Violation Pega workspace indexing

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-374 |
| Title | Single Responsibility Violation Pega workspace indexing |
| Author | DEV Agent |
| Reviewer | BA Agent |
| Version | 1.0 |
| Date | 2026-10-20 |
| Status | Draft |
| Related BRD | documents/SA4E-374/BRD.md |
| Related FSD | documents/SA4E-374/FSD.md |
| Related TDD | documents/SA4E-374/TDD.md |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-20 | DEV Agent | Initial document |

---

## 1. Introduction

### 1.1 Purpose

This guide describes how to use the new indexing flow for Pega workspace that complies with the Single Responsibility Principle. The backend indexer handles only generic code intelligence; all Pega-specific files must be filtered and sent via the VS Code Extension to the Backend Pega API. This document is intended for Developers, System Administrators, and System Architects.

### 1.2 Audience

| Audience | What They Need |
|----------|---------------|
| Developer | How to trigger indexing, understand SRP flow, do not send .pega to /api/index/source |
| System Administrator | Configure backend excludes, verify extension flow |
| System Architect | Review API contract and business rules PEGA-001..PEGA-005 |

### 1.3 Prerequisites

| Prerequisite | Version | Required |
|-------------|---------|----------|
| VS Code Extension Pega Code Intel | >=1.0 | Yes |
| Backend Code Intelligence Server | >=1.0 | Yes |
| Pega Workspace with pega-project.json | - | Yes/Optional |

---

## 2. Getting Started

### 2.1 Quick Start

```bash
# 1. Verify extension is active and workspace has pega-project.json
code . --enable-proposed-api

# 2. Trigger Index Workspace from Command Palette
# Command: "Code Intel: Index Workspace"

# 3. Extension will:
# - Detect pega-project.json
# - Apply SRP_EXCLUDES [.pega/**, rules/**, .pega-cache/**, **/*.pega, **/*.pega.json]
# - Build manifest and POST /api/v1/pega/index-manifest
# - Poll GET /api/v1/pega/index-status/{jobId}

# 4. Verify backend logs
# Expected: "SRP guard passed" and "Manifest accepted" 
# No log "Direct .pega scan"
```

### 2.2 System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| Node.js | 18 | 20 |
| Memory | 4 GB | 8 GB |
| Disk | 10 GB free | 50 GB |
| OS | Windows/macOS/Linux | Windows 10+ |

### 2.3 Distribution Formats

| Format | How to Get | Use Case |
|--------|-----------|----------|
| VSIX Extension | Internal release | Pega SRP filtering |
| Docker Backend | docker pull codeintel/backend | Generic indexing |

### 2.4 Configuration Methods

| Method | Priority | Best For |
|--------|----------|----------|
| Config file backend/src/config/schema.ts | 1 | DEFAULT_EXCLUDE |
| Environment variables | 2 | Override port |
| Extension settings | 3 | SRP_EXCLUDES |

### 2.5 Verify Configuration

- Check 1: Backend config contains DEFAULT_EXCLUDE = [.pega, rules, .pega-cache]
- Check 2: Backend log startup: "Config validation passed - .pega excluded"
- Check 3: Trigger indexing, verify manifest POST to /api/v1/pega/index-manifest, not to /api/index/source
- Common issues: PEGA-005 if manifest contains rules/ path

---

## 3. Configuration

### 3.1 Configuration File

Backend config: `backend/src/config/schema.ts`
Extension config: `extension/src/indexer.ts`

### 3.2 Configuration Reference

#### Backend Indexer Settings

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| DEFAULT_EXCLUDE | array | [.pega, rules, .pega-cache] | Directories/files ignored by backend |
| UNIFIED_EXTENSIONS | array | ... | .pega removed |
| EXTENSION_LANGUAGE_MAP | object | ... | Does not contain .pega |
| SRP_GUARD_ENABLED | boolean | true | Required |

#### Extension Settings

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| SRP_EXCLUDES | array | [.pega/**, rules/**, .pega-cache/**, **/*.pega, **/*.pega.json] | Pega filter patterns |
| PEGA_INDEX_API | string | /api/v1/pega/index-manifest | Backend endpoint |
| RETRY_COUNT | int | 3 | Retry manifest POST |

### 3.3 Environment Variables

| Variable | Description | Required | Example |
|----------|-------------|----------|---------|
| CODE_INTEL_BACKEND_URL | Backend base URL | Yes | http://localhost:48721 |
| PEGA_EXT_API_KEY | API key cho Pega API | No | ***** |

### 3.4 Configuration Examples

#### Minimal Configuration

```yaml
backend:
  DEFAULT_EXCLUDE:
    - .pega
    - rules
    - .pega-cache
  UNIFIED_EXTENSIONS_WITH_DOT:
    - .ts
    - .js
    # .pega removed
```

#### Full Configuration

```yaml
extension:
  SRP_EXCLUDES:
    - ".pega/**"
    - "rules/**"
    - ".pega-cache/**"
    - "**/*.pega"
    - "**/*.pega.json"
  PEGA_INDEX_API: "/api/v1/pega/index-manifest"
  RETRY_COUNT: 3

backend:
  DEFAULT_EXCLUDE:
    - .pega
    - rules
    - .pega-cache
  FALLBACK_EXCLUDES:
    - rules
    - .pega-cache
  SRP_GUARD_ENABLED: true
```

---

## 4. Usage

### 4.1 Indexing Pega Workspace with SRP

**Description:** Extension performs discovery and filtering, backend receives only manifest.

**How to use:**

```
1. Open workspace containing pega-project.json
2. Run command "Code Intel: Index Workspace"
3. Extension auto-detects and filters
```

**Parameters:**
No manual parameters required.

**Example flow:**
Extension detects 10,000 rules, filters out 2,000 .pega/rules files, builds manifest with 8,000 rules → POST /api/v1/pega/index-manifest

**Expected Output:**
```json
{
  "manifestId": "uuid",
  "acceptedCount": 8000,
  "rejectedCount": 0,
  "indexingJobId": "uuid"
}
```

### 4.2 API Reference

#### POST /api/v1/pega/index-manifest

| Attribute | Value |
|-----------|-------|
| Name | Pega Index Manifest |
| Description | Extension submits filtered Pega rules |

**Input Schema:**
```json
{
  "projectId": "string (UUID)",
  "workspaceRoot": "string",
  "discoveryTime": "ISO timestamp",
  "excludePatternsApplied": ["array of string"],
  "rules": [
    {
      "relativePath": "string",
      "checksum": "string",
      "size": "number"
    }
  ],
  "metadata": "object"
}
```

**Example Request:**
```json
{
  "projectId": "a1b2c3d4",
  "workspaceRoot": "/workspace/pega",
  "excludePatternsApplied": [".pega/**", "rules/**"],
  "rules": [{"relativePath": "src/rules/Activity.p749.json", "checksum": "abc123"}]
}
```

**Example Response:**
```json
{
  "manifestId": "m-123",
  "acceptedCount": 1,
  "rejectedCount": 0,
  "indexingJobId": "j-456"
}
```

#### GET /api/v1/pega/index-status/{jobId}

| Attribute | Value |
|-----------|-------|
| Name | Index Status |
| Description | Poll indexing job status |

**Example Request:**
```
GET /api/v1/pega/index-status/j-456
Authorization: Bearer <JWT>
```

**Example Response:**
```json
{
  "jobId": "j-456",
  "status": "COMPLETED",
  "progress": 100
}
```

> **IMPORTANT:** Never send .pega files to `/api/index/source`. Correct flow: Extension → POST /api/v1/pega/index-manifest → Backend Pega API. Backend indexer `/api/index/source` accepts only filtered generic files.

---

## 5. Administration

### 5.1 Verify SRP Compliance

1. Check backend config DEFAULT_EXCLUDE contains .pega, rules, .pega-cache
2. Check extension logs: "Applied SRP_EXCLUDES"
3. Check backend logs: "SRP guard active"

### 5.2 Monitoring Health

```
curl http://localhost:48721/api/health
```

Expected: `{"status":"ok","srp_guard":"enabled"}`

---

## 7. Troubleshooting

### 7.1 Common Issues

| # | Symptom | Cause | Solution |
|---|---------|-------|----------|
| 1 | Backend log "Direct .pega scan" | Config does not exclude .pega | Update DEFAULT_EXCLUDE |
| 2 | Manifest rejected PEGA-005 | Extension sends rules/ path | Check SRP_EXCLUDES in extension |
| 3 | /api/index/source returns error | Sending .pega file to wrong endpoint | Use /api/v1/pega/index-manifest |

### 7.2 Error Codes

| Code | Message | Description | Action |
|------|---------|-------------|--------|
| PEGA-001 | Invalid manifest | Schema validation fails | Check projectId, rules[] |
| PEGA-002 | Unauthorized | JWT project mismatch | Verify X-Project-Id header |
| PEGA-003 | Too large | Payload >10MB | Split manifest |
| PEGA-004 | Extension not found | No pega-project.json | Skip Pega flow |
| PEGA-005 | SRP violation | Path matches .pega/rules | Extension filtering incorrect, backend rejects |

### 7.3 Logs

| Log Location | Content | Useful For |
|-------------|---------|------------|
| backend/logs/indexer.log | SRP guard decisions | Debug exclude |
| extension/logs/indexer.log | Manifest build | Debug filtering |

### 7.4 FAQ

**Q: Can .pega files be sent directly to backend?**
A: No. Backend has removed .pega from DEFAULT_EXTENSIONS. Any direct request will be rejected by SRP guard with PEGA-005.

**Q: Why doesn't backend index rules/?**
A: Per SRP, rules/ is Pega-specific. Extension must filter and send via Pega API.

**Q: How to know the flow works correctly?**
A: Check extension logs "POST /api/v1/pega/index-manifest 202 Accepted" and backend "Manifest accepted".

---

## 8. API Reference

See section 4.2.

---

## 9. Appendix

### 9.1 Glossary

| Term | Definition |
|------|------------|
| SRP | Single Responsibility Principle |
| Extension Layer | VS Code extension mediating workspace access |
| Backend Indexer | Server-side code intelligence indexing service |
| Manifest | JSON payload listing Pega rules to index |

### 9.2 Related Documents

| Document | Location |
|----------|----------|
| BRD | documents/SA4E-374/BRD.md |
| FSD | documents/SA4E-374/FSD.md |
| TDD | documents/SA4E-374/TDD.md |

### 9.3 Version Compatibility

| System Version | Config Version | Breaking Changes |
|----------------|----------------|------------------|
| 1.0.0 | v1 | SRP separation, .pega removed from backend |
