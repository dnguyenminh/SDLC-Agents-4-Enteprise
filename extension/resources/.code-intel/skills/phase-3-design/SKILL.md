---
name: phase-3-design
description: Phase 3 workflow — SA creates TDD with feedback loop and security design review
---

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
  prompt: "Create TDD for {TICKET}. Read code intelligence data and FSD. MUST create draw.io diagrams (architecture.drawio + component.drawio + class diagram) and export PNG. Do not skip Step 4 (Generate Diagrams).",
  contextFiles: [{ "path": ".opencode/skills/drawio-diagrams/SKILL.md" }]
)
```

3. Verify `documents/{TICKET}/TDD.md` exists
4. Verify diagrams: architecture.drawio, component.drawio + .png files
   - If missing → invoke SA: "Create draw.io diagrams for TDD {TICKET}."

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

8. Report: "Phase 3 done — TDD.md created & attached to Jira. Proceed to Phase 3.7 (Security Design Review)?"
9. Wait for user confirmation.

### Step 3.7: Security Design Review (MANDATORY)

**After TDD is finalized, Security Agent reviews the design for security concerns.**

1. Update STATUS: `security_design_review.status = "in_progress"`

2. Invoke Security agent:
```
invokeSubAgent(
  name: "security-agent",
  prompt: "Security Design Review for {TICKET}. Read TDD.md at documents/{TICKET}/TDD.md. Review:
  1. Authentication/Authorization design
  2. Data protection — encryption at rest/transit, PII handling
  3. API security — rate limiting, input validation, CORS
  4. Dependency risks
  5. Infrastructure security — network policies, secrets management
  6. Injection risks — SQL, command, LDAP injection vectors
  7. Session management — token lifetime, refresh, revocation
  Output: documents/{TICKET}/SECURITY-REVIEW.md with findings table (Critical/High/Medium/Low)."
)
```

3. Verify `documents/{TICKET}/SECURITY-REVIEW.md` exists

4. Read findings:
   - **No Critical/High** → proceed to Phase 4
   - **Critical findings** → invoke sa-agent to update TDD
   - **High findings** → log as DEV requirements, proceed with warning

5. Update STATUS: `security_design_review.status = "done"`

6. Report: "Phase 3.7 done — Security Design Review complete. Proceed to Phase 4?"
7. Wait for user confirmation.
8. Wait for Jira ticket to transition to IN PROGRESS (transition "Implement" by reviewer/PO)

## Step 3.5: Feedback Loop (BA ↔ SA)

**Trigger:** `documents/{TICKET}/DISCREPANCY.md` exists

**Loop (max 5 iterations):**

```
iteration = 0
while DISCREPANCY.md exists AND iteration < 5:
    iteration++
    
    1. Read DISCREPANCY.md
    2. Count discrepancies by severity
    3. Report iteration progress
    
    4. Invoke BA to fix FSD
    5. Verify FSD updated
    6. Update STATUS: specification.version++
    
    7. Invoke SA to review and recreate TDD
    8. Check DISCREPANCY.md exists?
       - Yes → continue loop
       - No → break

if iteration >= 5 AND DISCREPANCY.md still exists:
    Report feedback loop blocked, need manual review
    Update STATUS: feedback_loop.status = "blocked"
else:
    Report feedback loop done, FSD and TDD consistent
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