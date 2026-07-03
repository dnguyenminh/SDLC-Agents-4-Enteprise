# Phase 3: Design (SA → TDD) + Feedback Loop

## Prerequisites

- FSD.md exists
- specification.status = "done"

## Workflow

### Step 3a: Create TDD

1. Update STATUS: `design.status = "in_progress"`

2. Invoke SA agent:
```
invokeSubAgent(
  name: "sa-agent",
  prompt: "Tạo TDD cho {TICKET}. Đọc code intelligence data và FSD. PHẢI tạo draw.io diagrams (architecture.drawio + component.drawio + class diagram) và export PNG. Không được bỏ qua Step 4 (Generate Diagrams).",
  contextFiles: [{ "path": ".kiro/steering/drawio.md" }]
)
```

3. Verify `documents/{TICKET}/TDD.md` exists
4. Verify diagrams: architecture.drawio, component.drawio + .png files
   - If missing → invoke SA: "Tạo draw.io diagrams cho TDD {TICKET}."

5. Check if `documents/{TICKET}/DISCREPANCY.md` exists
   - Yes → go to Step 3.5 (Feedback Loop)
   - No → proceed to finalize

### Step 3b: Finalize TDD

6. Update STATUS: `design.status = "done"`, `design.version = 1`

7. Attach to Jira (MANDATORY):
```
embed_images(file_path="documents/{TICKET}/TDD.md", output_path="documents/{TICKET}/TDD-embedded.md")
export_docx(file_path="documents/{TICKET}/TDD-embedded.md", file_name="TDD-v1-{TICKET}")
jira_update_issue(issue_key: "{TICKET}", fields: "{}", attachments: "documents/{TICKET}/TDD-v1-{TICKET}.docx")
```

Also attach all `.drawio` files.

8. Report: "✅ Phase 3 done — TDD.md created & attached to Jira. Chuyển sang Phase 4?"
9. Wait for user confirmation.
10. Đợi Jira ticket chuyển sang IN PROGRESS (transition "Implement" do reviewer/PO)

## Step 3.5: Feedback Loop (BA ↔ SA)

**Trigger:** `documents/{TICKET}/DISCREPANCY.md` exists

**Loop (max 5 iterations):**

```
iteration = 0
while DISCREPANCY.md exists AND iteration < 5:
    iteration++
    
    1. Read DISCREPANCY.md
    2. Count discrepancies by severity
    3. Report: "⚠️ Vòng {iteration}/5 — SA phát hiện {n} discrepancies"
    
    4. Invoke BA to fix FSD:
       invokeSubAgent(
         name: "ba-agent",
         prompt: "Đọc discrepancy report tại documents/{TICKET}/DISCREPANCY.md và cập nhật FSD cho {TICKET}. Chỉ fix FSD, không tạo lại BRD.",
         contextFiles: [{ "path": ".kiro/steering/drawio.md" }]
       )
    
    5. Verify FSD updated
    6. Update STATUS: specification.version++
    
    7. Invoke SA to review:
       invokeSubAgent(
         name: "sa-agent",
         prompt: "Review lại FSD đã cập nhật và tạo lại TDD cho {TICKET}. Kiểm tra discrepancies trước đó đã được fix chưa.",
         contextFiles: [{ "path": ".kiro/steering/drawio.md" }]
       )
    
    8. Check DISCREPANCY.md exists?
       - Yes → continue loop
       - No → break

if iteration >= 5 AND DISCREPANCY.md still exists:
    Report: "⚠️ Đã chạy 5 vòng feedback nhưng vẫn còn discrepancies. Cần review thủ công."
    Update STATUS: feedback_loop.status = "blocked"
else:
    Report: "✅ Feedback loop done — FSD v{version} và TDD consistent."
    Update STATUS: design.status = "done", feedback_loop.status = "done"
```

**Note:** Feedback loop runs automatically without asking user between iterations (but report progress).

## Quality Gate

| # | Check | If Missing |
|---|-------|------------|
| 1 | TDD.md exists | Re-invoke SA |
| 2 | Architecture Overview section | Re-invoke SA |
| 3 | API Design section (if applicable) | Ask SA to add |
| 4 | Class/Module Design | Re-invoke SA |
| 5 | Architecture Diagram (.drawio + .png) | Invoke SA for diagrams |
| 6 | Component Diagram (.drawio + .png) | Invoke SA for diagrams |
| 7 | Implementation Checklist | Ask SA to add |
| 8 | Error Handling section | Ask SA to add |
| 9 | Security Design section | Ask SA to add |

## Agent Data Access

**SA reads:** KB (BRD + FSD), code intelligence, source code, DB schema
**SA writes:** TDD.md → KB, DISCREPANCY.md (if issues found)
