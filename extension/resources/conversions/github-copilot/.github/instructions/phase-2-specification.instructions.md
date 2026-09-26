---
name: 'Phase 2: Specification (BA + UI + TA → FSD)'
description: 'Phase 2: Specification (BA + UI + TA → FSD)'
applyTo: '**'
---

# Phase 2: Specification (BA + UI + TA → FSD)

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
  contextFiles: [{ "path": ".opencode/rules/sdlc/drawio.md" }]
)
```

3. Verify `documents/{TICKET}/FSD.md` exists
4. Verify diagrams in `documents/{TICKET}/diagrams/` (FSD-related)
   - If missing → invoke BA: "Tạo draw.io diagrams cho FSD {TICKET}."

### Step 2b: UI Mockup (UI tickets only)

**Trigger:** The ticket has user-facing UI (scan the FSD draft "UI Specifications" or the BRD user-facing stories). If backend-only, SKIP Step 2b and Step 2b.5 and go to Step 2c.

The UI agent authors the mockups and owns the aesthetic/UX quality of its own output (self-check against the existing design system + frontend code). SM does NOT review aesthetics; the user gives the final visual sign-off when approving the FSD.

Invoke UI agent:
```
invokeSubAgent(
  name: "ui-agent",
  prompt: "Tao UI mockup cho {TICKET} nhu mot phan cua FSD. Doc FSD draft + BRD tu KB + code intelligence frontend. PHAI: 1) phan tich design system hien co, 2) tao draw.io wireframe cho tung screen + export PNG, 3) tao UI-SPEC (implementation notes cho DEV), 4) embed wireframe vao FSD Section UI Specifications. Tu dam bao chat luong my thuat/UX theo design system hien co."
)
```

Verify `documents/{TICKET}/diagrams/wireframe-*.drawio` + `.png` exist and the FSD UI Specifications section references them.

### Step 2b.5: BA Reviews Mockup (MANDATORY for UI tickets — mockup done only after BA approves)

The BA agent reviews the UI agent's mockups for BUSINESS correctness only. In this review the BA agent is the reviewer and the UI agent is the author. The UI mockup is NOT complete until the BA agent returns a verdict of **APPROVED**.

Invoke BA:
```
invokeSubAgent(
  name: "ba-agent",
  prompt: "Review UI mockup cho {TICKET} ve mat NGHIEP VU. Doc BRD + FSD draft tu KB va wireframe tai documents/{TICKET}/diagrams/wireframe-*.png. Kiem tra: 1) Du man hinh cho moi User Story/AC can UI, 2) Navigation dung luong nghiep vu, 3) Du field/action/trang thai nghiep vu, 4) Khong thieu khong thua. CHI xet nghiep vu — KHONG xet tham my (UI agent lo) va KHONG xet kha thi ky thuat (TA lo). Verdict: APPROVED / CHANGES REQUESTED (list gaps)."
)
```

Handle BA verdict:
- **APPROVED** → proceed to Step 2c (TA enrich)
- **CHANGES REQUESTED** → invoke UI agent to fix mockups per BA's gap list → re-invoke BA to re-review (max 2 iterations)

⛔ The UI mockup is NOT done until the BA agent's verdict is APPROVED. If still CHANGES REQUESTED after 2 iterations → report user.

### Step 2c: TA Reviews and Enriches FSD

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

### Step 2d: Finalize FSD

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
| 4 | UI Specifications / Wireframes (UI tickets) | Invoke UI agent (Step 2b) |
| 5 | System Context Diagram (.drawio + .png) | Invoke BA for diagrams |
| 6 | Sequence Diagram(s) (.drawio + .png) | Invoke BA for diagrams |
| 7 | State Diagram (.drawio + .png) | Invoke BA for diagrams |
| 8 | API Specifications (if applicable) | Ask BA to add |
| 9 | Error Handling section | Ask BA to add |
| 10 | UI mockup wireframes (.drawio + .png) exist — UI tickets only | Invoke UI agent (Step 2b) |
| 11 | BA review of UI mockup = APPROVED — UI tickets only | Invoke BA (Step 2b.5) — UI mockup not done until BA approves |

## Agent Data Access

**BA reads:** KB (BRD), code intelligence
**BA writes:** FSD.md draft → KB
**TA reads:** KB (BRD), code intelligence, FSD.md
**TA writes:** FSD.md (enriched) → KB (updated)
