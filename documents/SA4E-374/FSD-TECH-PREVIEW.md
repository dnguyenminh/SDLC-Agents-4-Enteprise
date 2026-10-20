# FSD Technical Preview — SA4E-374
## Single Responsibility Violation: Pega workspace indexing đi thẳng tới backend server, không qua extension

> **Status:** Technical Pre-Enrichment (Parallel Phase)
> **Ticket:** SA4E-374
> **Prepared by:** TA Agent (Technical Architect)
> **Date:** 2026-10-19
> **Related BRD:** Pending BA completion
> **Purpose:** Preliminary technical analysis to support FSD enrichment. Will be merged into official FSD.md after BRD draft.

---

## 1. Executive Summary

Backend indexer hiện tại xử lý trực tiếp .pega, rules/, .pega-cache → vi phạm Single Responsibility. Cần tách trách nhiệm indexing Pega qua extension layer.

**Findings from Code Intelligence:**
- `backend/src/config/schema.ts` — `DEFAULT_EXCLUDE` includes `rules`, `.pega-cache` but **không exclude `.pega` files** ở cấp file extension
- `backend/src/engine/indexer/project-type/resolver.ts` — `FALLBACK_EXCLUDES` mirrors rules & .pega-cache
- `backend/src/engine/indexer/file-scanner/languages.ts` — `.pega` NOT in `EXTENSION_LANGUAGE_MAP`; `detectLanguage('/a/R.pega')` → null (TC regression SA4E-223)
- `extension/src/code-intel/` — extension có `PegaRuleChecksumStrategy`, `BulkCheckClient`, code-intel scanner với incremental indexing
- Extension đã có REST client `knowledge-client.ts` và `remote-checkpointer.ts` cho backend communication

---

## 2. Technical Context & Current Flow

### 2.1 Current Architecture (Violation)
```
Workspace/
  .pega/           ← Backend scans trực tiếp
  rules/           ← Backend scans trực tiếp
  .pega-cache/     ← Backend scans trực tiếp
  src/             ← Code intelligence
```

Backend `file-scanner/traversal.ts`:
- `processFile()` gọi `detectLanguage()` → nếu null → skip
- Nhưng `.pega.json` files được xử lý bởi `PegaIndexerTool` trong `backend/src/modules/pega/__tests__`
- Không có abstraction layer qua extension để control discovery/filtering

### 2.2 Target Architecture (SRP Compliant)
```
Extension (Discovery & Filtering)
  └─ Pega Workspace Scanner
      ├─ Detect .pega-project.json
      ├─ Apply exclude patterns: .pega, rules/, .pega-cache
      ├─ Build Pega rule manifest
      └─ POST to Backend /api/v1/pega/index-manifest

Backend (Pure Code Intelligence)
  └─ Indexer chỉ scan extensions whitelist
  └─ Nhận manifest từ extension → index Pega rules theo contract
```

---

## 3. API Contracts — Extension ↔ Backend for Indexing

### 3.1 Contract 1: Pega Index Manifest Submission

**Endpoint:** `POST /api/v1/pega/index-manifest`
**Purpose:** Extension gửi danh sách Pega rules cần index, backend chỉ thực thi indexing, không tự discovery
**Implements:** BRD requirement — tách trách nhiệm indexing

**Request Headers:**
| Header | Required | Description |
|--------|----------|-------------|
| `Authorization: Bearer <JWT>` | Y | Workspace JWT |
| `X-Project-Id` | Y | Project identifier |
| `Content-Type: application/json` | Y | |

**Request Body Schema:**
```json
{
  "projectId": "string",
  "workspaceRoot": "string",
  "discoveryTime": "ISO-8601",
  "excludePatternsApplied": ["string"],
  "rules": [
    {
      "relativePath": "rules/Work-Claim...pega.json",
      "absolutePath": "C:/work/.pega/rules/...",
      "checksum": "sha256-16",
      "ruleClass": "Rule-Obj-Activity",
      "appliesTo": "Work-Claim",
      "ruleName": "DoSomething",
      "lastModified": "ISO-8601",
      "sizeBytes": 1234
    }
  ],
  "metadata": {
    "pegaProjectConfig": { "appName": "...", "appVersion": "..." },
    "extensionVersion": "string"
  }
}
```

**Response Schema:**
```json
{
  "manifestId": "uuid",
  "acceptedCount": 42,
  "rejectedCount": 3,
  "rejections": [
    {
      "relativePath": "...",
      "reason": "CHECKSUM_UNCHANGED | SIZE_EXCEEDS_LIMIT | LANGUAGE_NOT_SUPPORTED"
    }
  ],
  "indexingJobId": "uuid"
}
```

**Error Codes:**
| Code | HTTP | Message |
|------|------|---------|
| `PEGA-001` | 400 | Invalid manifest schema |
| `PEGA-002` | 403 | Workspace not authorized for Pega indexing |
| `PEGA-003` | 413 | Manifest too large (>10MB) |
| `PEGA-004` | 409 | Conflict with ongoing indexing job |

<!-- TA enrichment -->

### 3.2 Contract 2: Indexing Status Query

**Endpoint:** `GET /api/v1/pega/index-status/{jobId}`
**Purpose:** Extension poll trạng thái indexing

**Response Schema:**
```json
{
  "jobId": "uuid",
  "status": "PENDING | PROCESSING | COMPLETED | FAILED",
  "progress": { "processed": 10, "total": 42 },
  "startedAt": "...",
  "completedAt": "...",
  "errors": []
}
```

### 3.3 Contract 3: Pega Rule Bulk Check

**Existing Endpoint:** `POST /api/v1/pega/rulecatalog/bulk-check`
- Already used by `extension/src/code-intel/delta/BulkCheckClient.ts`
- Extension gửi checksums → backend trả về changed rules
- **Enrichment:** Cần thêm filter `excludePatterns` vào request để backend biết extension đã filter

**Proposed Enhancement:**
```json
{
  "projectId": "string",
  "checksums": ["..."],
  "excludePatterns": [".pega", "rules/", ".pega-cache"],
  "source": "extension"
}
```

---

## 4. Integration Requirements

### 4.1 Exclude Patterns Enforcement

**Requirement:** Backend indexer phải **không** scan các pattern sau:
- `*.pega` files * (tất cả .pega và .pega.json)
- `rules/` directory tree
- `.pega-cache/` directory tree
- `.pega/` hidden directory

**Implementation Points:**
1. **Config Layer**
   - `backend/src/config/schema.ts` → `DEFAULT_EXCLUDE` bổ sung `'.pega'`, `'.pega/'`
   - `UNIFIED_EXTENSIONS_WITH_DOT` → đảm bảo `.pega` không có trong whitelist
   - Config validation khi load: nếu `includeExtensions` chứa `.pega` → reject

2. **File Scanner Layer**
   - `backend/src/engine/indexer/file-scanner/traversal.ts` → `shouldExclude()`:
     ```ts
     // Pseudocode
     function shouldExclude(relPath, name, excludes, ignoreParser): boolean {
       // 1. Hidden dot folders/files
       if (name.startsWith('.') && name !== '.') return true;
       // 2. Explicit exclude patterns
       for (pattern of excludes) {
         if (relPath.includes(pattern) || minimatch(relPath, pattern)) return true;
       }
       // 3. Pega-specific SRP guard
       if (relPath.endsWith('.pega') || relPath.endsWith('.pega.json')) return true;
       if (relPath.startsWith('rules/') || relPath.includes('/rules/')) return true;
       if (relPath.startsWith('.pega-cache/')) return true;
       // 4. .gitignore
       return ignoreParser.shouldIgnore(relPath);
     }
     ```

3. **Extension Discovery Layer**
   - `extension/src/code-intel/` → khi phát hiện `pega-project.json`:
     ```ts
     const PEGA_EXCLUDE = ['.pega', 'rules', '.pega-cache'];
     const scanResult = await discoverWorkspace(root, { exclude: [...BASE_EXCLUDE, ...PEGA_EXCLUDE] });
     ```
   - Extension build manifest gửi backend

### 4.2 Security Requirements

- Extension phải xác thực người dùng trước khi phát hiện Pega workspace
- Backend phải validate `X-Project-Id` match JWT `wid claim`
- Pega credentials (endpoint/username/password) **không** được gửi qua backend indexer path — chỉ qua extension → Pega Studio API
- Logging: backend log chỉ ghi manifestId, không log nội dung rule

### 4.3 Retry & Resilience

- Extension → Backend manifest submission: retry 3 lần với exponential backoff 500ms, 1s, 2s
- Timeout 30s cho manifest upload
- Nếu backend unreachable → extension lưu manifest vào local queue (`.code-intel/pega-queue/`) và retry sau

---

## 5. Pseudocode — Filtering Logic

### 5.1 Extension Side: Pega Discovery Filter

```ts
// extension/src/code-intel/pega/discovery.ts
export async function discoverPegaRules(root: string): Promise<PegaRuleManifest> {
  // Step 1: Validate project
  const projectConfig = await findPegaProjectConfig(root);
  if (!projectConfig) throw new Error('Not a Pega workspace');

  // Step 2: Define SRP exclude patterns
  const SRP_EXCLUDES = [
    '.pega/**',
    'rules/**',
    '.pega-cache/**',
    '**/*.pega',
    '**/*.pega.json'
  ];

  // Step 3: Walk filesystem with filters
  const candidates = await walk(root, {
    exclude: SRP_EXCLUDES,
    includeExtensions: ['.json'], // Pega rules are JSON
    maxDepth: 10
  });

  // Step 4: Classify Pega rules
  const rules = candidates
    .filter(f => isPegaRuleFile(f))
    .map(f => ({
      relativePath: relative(root, f.path),
      checksum: await computeChecksum(f.path),
      lastModified: f.mtime,
      ...parsePegaRuleHeader(f.path)
    }));

  return {
    projectId: await resolveProjectId(root),
    workspaceRoot: root,
    discoveryTime: new Date().toISOString(),
    excludePatternsApplied: SRP_EXCLUDES,
    rules
  };
}
```

### 5.2 Backend Side: Manifest Validation

```ts
// backend/src/modules/pega/IndexManifestValidator.ts
export function validateManifest(manifest: PegaManifest, config: AppConfig): ValidationResult {
  // 1. Schema validation
  if (!manifest.projectId || !manifest.rules) return { valid: false, error: 'PEGA-001' };

  // 2. SRP enforcement: reject if any rule path violates exclude
  for (const rule of manifest.rules) {
    if (rule.relativePath.match(/\.pega$/i) || rule.relativePath.startsWith('rules/')) {
      return { valid: false, error: 'PEGA-005', details: `Rule violates SRP exclude: ${rule.relativePath}` };
    }
  }

  // 3. Size limit
  if (manifest.rules.length > config.maxPegaRulesPerManifest) {
    return { valid: false, error: 'PEGA-006' };
  }

  return { valid: true };
}
```

---

## 6. Data Model Impacts

### 6.1 Current Entities

- `files` table in code-intel DB: lưu `relative_path`, `language`, `checksum`
- `pega_rule_catalog` table: lưu rule metadata từ Pega workspace

### 6.2 Proposed Changes

**New Entity: `pega_index_manifests`**
| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| manifest_id | UUID | Y | Primary key |
| project_id | string | Y | FK to projects |
| submitted_by | string | Y | Extension instance id |
| submitted_at | datetime | Y | |
| rule_count | int | Y | |
| exclude_patterns | JSON | Y | Patterns applied by extension |
| status | enum | Y | PENDING/ACCEPTED/REJECTED |
| indexing_job_id | UUID | N | FK to indexing jobs |

**Impact on Existing Tables:**
- `files` table: thêm column `source` enum `['code-intel', 'pega-manifest']` để phân biệt nguồn
- `indexing_jobs` table: thêm `source_type` để track Pega manifest jobs

**Migration Notes:**
- Zero-downtime: thêm columns nullable
- Backfill: không cần vì dữ liệu cũ không có manifest

---

## 7. Non-Functional Requirements

### 7.1 Performance

| Metric | Target | Notes |
|--------|--------|-------|
| Extension discovery time for 10k Pega rules | < 5s | Incremental, checksum cache |
| Manifest upload (1MB payload) | < 2s p95 | Extension → Backend HTTP |
| Backend manifest validation | < 100ms | Sync validation |
| Indexing job start latency | < 500ms | After manifest accepted |

**Optimization:**
- Extension sử dụng `HashCache` để chỉ gửi changed rules
- Backend dùng bulk insert cho manifest rules

### 7.2 Security

- Pega credentials không transit qua backend indexer
- Manifest payload encrypted in transit (TLS 1.3)
- Backend validate `X-Project-Id` matches JWT workspace
- Rate limiting: 10 manifest submissions/min/project
- Audit log: log manifest submission events với projectId, timestamp, rule count

### 7.3 Reliability

- Extension queue persistence for offline scenarios
- Backend idempotency key: `manifestId` + `projectId` → prevent duplicate processing
- Circuit breaker for Pega discovery API calls

---

## 8. Open Issues & Recommendations

| ID | Issue | Owner | Target |
|----|-------|-------|--------|
| OI-374-01 | Quyết định final API contract cho manifest: REST vs gRPC? | SA/TA | FSD review |
| OI-374-02 | Extension cần thêm config flag `pega.indexing.enabled` để opt-in | DEV | TDD |
| OI-374-03 | Migration script cho existing Pega indexed files trong DB | DevOps | Phase 5 |
| OI-374-04 | Test data cho 10k Pega rules manifest | QA | STP |

**TA Recommendation:**
- Dùng REST cho manifest submission để đơn giản, tương thích với existing `knowledge-client.ts` pattern
- Thêm middleware `pega-srp-guard` ở backend để reject bất kỳ file scan nào match `.pega/rules/.pega-cache`
- Extension nên implement `PegaDiscoveryService` riêng, tách khỏi `CodeIntelScanner`

---

## 9. References

- Jira: SA4E-374
- Code Intelligence:
  - `backend/src/config/schema.ts`
  - `backend/src/engine/indexer/file-scanner/languages.ts`
  - `backend/src/engine/indexer/project-type/resolver.ts`
  - `extension/src/code-intel/`
- Related Tickets: SA4E-223 (Salesforce extensions), SA4E-85 (Knowledge Service)

---

**Next Step:** Merge sections này vào FSD.md chính thức khi BA hoàn thành BRD draft. TA sẽ enrich API contracts Section 3.x.6, Integration Specs Section 5.x, và Data Model Section 4.x.
