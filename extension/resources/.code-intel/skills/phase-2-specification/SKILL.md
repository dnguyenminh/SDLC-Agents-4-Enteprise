---
name: phase-2-specification
description: Phase 2 workflow — BA creates FSD draft, TA enriches with technical sections
---

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
  prompt: "Create FSD for {TICKET}. Read BRD from KB first (kb_search query '{TICKET} BRD'). Read code intelligence data. MUST create draw.io diagrams (system-context.drawio + sequence diagrams + state diagram) and export PNG. Do not skip Step 7.",
  contextFiles: [{ "path": ".opencode/skills/drawio-diagrams/SKILL.md" }]
)
```

3. Verify `documents/{TICKET}/FSD.md` exists
4. Verify diagrams in `documents/{TICKET}/diagrams/` (FSD-related)
   - If missing → invoke BA: "Create draw.io diagrams for FSD {TICKET}."

### Step 2b: TA Reviews and Enriches FSD

5. Invoke TA agent:
```
invokeSubAgent(
  name: "ta-agent",
  prompt: "Review and enrich FSD for {TICKET} at documents/{TICKET}/FSD.md. Read BRD from KB. Read code intelligence data. FSD already has business sections. You need to:
  1. Review Use Cases — add Alternative/Exception flows if missing
  2. Add/detail API Contracts — ensure developer can implement
  3. Add Integration Requirements — complete API contracts with request/response schema
  4. Add pseudocode for complex business logic
  5. Review Data Model — consistent with actual codebase
  6. Add Non-Functional Requirements if missing quantified targets
  7. Add Open Issues if unresolved technical decisions
  Do NOT recreate FSD — only review and enrich the existing file.
  After enrichment, ingest FSD into KB.",
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
Phase 2 done — FSD.md created & attached to Jira (BA draft + TA enrichment).
- BA: Use Cases, Business Rules, Data Specs, Diagrams
- TA: API Contracts, Integration Specs, Pseudocode, Technical Review
Proceed to Phase 3 (Design)?
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