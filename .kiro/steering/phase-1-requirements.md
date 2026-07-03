# Phase 1: Requirements (BA → BRD)

## Prerequisites

- Jira ticket exists
- Jira status: To Do or Docs Review

## Workflow

### Step 1: Transition Jira

```
transition_issue(issue_key: "{TICKET}", transition_name: "Review Docs")
```
→ TO DO → DOCS REVIEW

### Step 2: Update Status

```json
{ "requirements": { "status": "in_progress" } }
```

### Step 3: Invoke BA Agent

```
invokeSubAgent(
  name: "ba-agent",
  prompt: "Tạo BRD cho {TICKET}. PHẢI tạo draw.io diagrams (use-case.drawio + business-flow.drawio) và export PNG. Không được bỏ qua Step 7 (Generate Diagrams).",
  contextFiles: [{ "path": ".kiro/steering/drawio.md" }]
)
```

### Step 4: Verify Output

1. Check `documents/{TICKET}/BRD.md` exists
2. Check `documents/{TICKET}/diagrams/use-case.drawio` + `.png`
3. Check `documents/{TICKET}/diagrams/business-flow.drawio` + `.png`

If diagrams missing → invoke BA again:
```
"Tạo draw.io diagrams cho BRD {TICKET}. Chỉ tạo diagrams, không tạo lại BRD."
```

### Step 5: Update Status

```json
{ "requirements": { "status": "done", "file": "BRD.md", "version": 1, "completedAt": "..." } }
```

### Step 6: Attach to Jira (MANDATORY)

```
embed_images(file_path="documents/{TICKET}/BRD.md", output_path="documents/{TICKET}/BRD-embedded.md")
export_docx(file_path="documents/{TICKET}/BRD-embedded.md", file_name="BRD-v1-{TICKET}")
jira_update_issue(issue_key: "{TICKET}", fields: "{}", attachments: "documents/{TICKET}/BRD-v1-{TICKET}.docx")
```

Also attach all `.drawio` files from `documents/{TICKET}/diagrams/`.

### Step 7: Report

```
✅ Phase 1 done — BRD.md created & attached to Jira.
Chuyển sang Phase 2 (Specification)?
```

Wait for user confirmation.

## Quality Gate (from shared-quality-gates.md)

| # | Check | If Missing |
|---|-------|------------|
| 1 | BRD.md exists | Re-invoke BA |
| 2 | ≥3 User Stories with Acceptance Criteria | Re-invoke BA |
| 3 | Business Flow Diagram (.drawio + .png) | Invoke BA for diagrams |
| 4 | Use Case Diagram (.drawio + .png) | Invoke BA for diagrams |
| 5 | Dependencies section | Ask BA to add |
| 6 | Non-Functional Requirements | Ask BA to add |

## Agent Data Access

**BA reads:** Jira ticket description, code intelligence (Step 9.5)
**BA writes:** BRD.md → ingest to KB (FULL content)

## Template

Default: `documents/templates/BRD-TEMPLATE.md`
Override: user provides `template:path/to/custom.md`

Thông báo template rồi tiếp tục (không dừng hỏi):
```
📄 Template: documents/templates/BRD-TEMPLATE.md (mặc định)
💡 Muốn dùng template khác? Interrupt và gọi lại với template:path
▶️ Tiếp tục tạo BRD...
```
