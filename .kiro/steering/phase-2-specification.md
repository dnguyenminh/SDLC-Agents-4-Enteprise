# Phase 2: Specification (BA + TA → FSD)

## Prerequisites

- BRD.md exists (or BRD ingested in KB)
- requirements.status = "done"

## Process

BA creates FSD draft (business sections), then TA reviews and enriches with technical sections.

## Workflow

### Step 2a: BA Creates FSD Draft

1. Update STATUS: `specification.status = "in_progress"`

2. Invoke BA agent:
```
invokeSubAgent(
  name: "ba-agent",
  prompt: "Tạo FSD cho {TICKET}. Đọc BRD từ KB trước (kb_search query '{TICKET} BRD'). Đọc code intelligence data. PHẢI tạo draw.io diagrams (system-context.drawio + sequence diagrams + state diagram) và export PNG. Không được bỏ qua Step 7.",
  contextFiles: [{ "path": ".kiro/steering/drawio.md" }]
)
```

3. Verify `documents/{TICKET}/FSD.md` exists
4. Verify diagrams in `documents/{TICKET}/diagrams/` (FSD-related)
   - If missing → invoke BA: "Tạo draw.io diagrams cho FSD {TICKET}."

### Step 2b: TA Reviews and Enriches FSD

5. Invoke TA agent:
```
invokeSubAgent(
  name: "ta-agent",
  prompt: "Review và bổ sung FSD cho {TICKET} tại documents/{TICKET}/FSD.md. Đọc BRD từ KB. Đọc code intelligence data (.analysis/code-intelligence/project-structure.md và modules/*.md). FSD đã có business sections. Bạn cần:
  1. Review Use Cases — bổ sung Alternative/Exception flows nếu thiếu
  2. Bổ sung/chi tiết hóa API Contracts — đảm bảo developer implement được
  3. Bổ sung Integration Requirements — API contracts đầy đủ với request/response schema
  4. Bổ sung pseudocode cho complex business logic
  5. Review Data Model — consistent với actual codebase
  6. Bổ sung Non-Functional Requirements nếu thiếu quantified targets
  7. Bổ sung Open Issues nếu có unresolved technical decisions
  KHÔNG tạo lại FSD — chỉ review và bổ sung vào file hiện có.
  Sau khi bổ sung, ingest FSD vào KB.",
  contextFiles: [{ "path": "documents/{TICKET}/FSD.md" }, { "path": ".analysis/code-intelligence/project-structure.md" }]
)
```

6. Verify FSD enriched (check for API contracts, integration specs)

### Step 2c: Finalize FSD

7. Update STATUS: `specification.status = "done"`, `specification.version = 1`

8. Attach to Jira (MANDATORY):
```
embed_images(file_path="documents/{TICKET}/FSD.md", output_path="documents/{TICKET}/FSD-embedded.md")
export_docx(file_path="documents/{TICKET}/FSD-embedded.md", file_name="FSD-v1-{TICKET}")
jira_update_issue(issue_key: "{TICKET}", fields: "{}", attachments: "documents/{TICKET}/FSD-v1-{TICKET}.docx")
```

Also attach all `.drawio` files.

9. Report:
```
✅ Phase 2 done — FSD.md created & attached to Jira (BA draft + TA enrichment).
- BA: Use Cases, Business Rules, Data Specs, Diagrams
- TA: API Contracts, Integration Specs, Pseudocode, Technical Review
Chuyển sang Phase 3 (Design)?
```

10. Wait for user confirmation.

## Quality Gate

| # | Check | If Missing |
|---|-------|------------|
| 1 | FSD.md exists | Re-invoke BA |
| 2 | Use Cases with Main/Alternative/Exception flows (UC- IDs) | Re-invoke BA |
| 3 | Business Rules table (BR- IDs) | Re-invoke BA |
| 4 | UI Specifications / Wireframes | Ask BA to add |
| 5 | System Context Diagram (.drawio + .png) | Invoke BA for diagrams |
| 6 | Sequence Diagram(s) (.drawio + .png) | Invoke BA for diagrams |
| 7 | State Diagram (.drawio + .png) | Invoke BA for diagrams |
| 8 | API Specifications (if applicable) | Ask BA to add |
| 9 | Error Handling section | Ask BA to add |

## Agent Data Access

**BA reads:** KB (BRD), code intelligence
**BA writes:** FSD.md draft → KB
**TA reads:** KB (BRD), code intelligence, FSD.md
**TA writes:** FSD.md (enriched) → KB (updated)
