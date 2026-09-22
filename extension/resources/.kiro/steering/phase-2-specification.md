# Phase 2: Specification (BA + UI + TA → FSD)

## Prerequisites

- BRD.md exists (or BRD ingested in KB)
- requirements.status = "done"

## Process

BA creates FSD draft (business sections). If the ticket has UI, the UI agent produces wireframes/mockups which the BA agent reviews for business correctness, then the mockups are folded into the FSD. Finally the TA agent reviews and enriches the FSD with technical sections.

Order: **2a BA draft → 2b UI mockup (UI tickets only) → 2b.5 BA reviews mockup → 2c TA enrich → 2d finalize.**

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

### Step 2b: UI Mockup (UI tickets only)

**Trigger:** The ticket has user-facing UI. Determine this by scanning the FSD draft for a "UI Specifications" section or the BRD for user-facing stories. If the ticket is backend-only (no UI), SKIP Step 2b and Step 2b.5 entirely and go to Step 2c.

The UI agent is the author of the mockups; it also owns the **aesthetic/UX quality** of its own output (self-check against the existing design system and frontend code). SM does NOT review aesthetics; the user gives the final visual sign-off when approving the FSD.

Invoke UI agent:
```
invokeSubAgent(
  name: "ui-agent",
  prompt: "Tạo UI mockup cho {TICKET} như một phần của FSD. Đọc FSD draft (documents/{TICKET}/FSD.md) + BRD từ KB + code intelligence frontend. PHẢI: 1) phân tích design system hiện có, 2) tạo draw.io wireframe cho từng screen + export PNG, 3) tạo UI-SPEC (implementation notes cho DEV), 4) embed wireframe vào FSD Section UI Specifications. Tự đảm bảo chất lượng mỹ thuật/UX theo design system hiện có.",
  contextFiles: [{ "path": "documents/{TICKET}/FSD.md" }, { "path": ".kiro/steering/drawio.md" }]
)
```

Verify wireframes exist: `documents/{TICKET}/diagrams/wireframe-*.drawio` + `.png`, and that the FSD UI Specifications section references them.

### Step 2b.5: BA Reviews Mockup (MANDATORY for UI tickets — UI mockup done only after BA approves)

**The BA agent reviews the UI agent's mockups for BUSINESS correctness only (not aesthetics, not technical feasibility). In this review the BA agent is the reviewer and the UI agent is the author. The UI mockup is NOT complete until the BA agent returns a verdict of APPROVED.**

Invoke BA:
```
invokeSubAgent(
  name: "ba-agent",
  prompt: "Review UI mockup cho {TICKET} về mặt NGHIỆP VỤ. Đọc BRD + FSD draft từ KB và các wireframe tại documents/{TICKET}/diagrams/wireframe-*.png. Kiểm tra:
  1. Đủ màn hình — Mọi User Story/Acceptance Criteria cần UI đều có screen tương ứng?
  2. Đúng luồng nghiệp vụ — Navigation/user flow phản ánh đúng luồng nghiệp vụ trong BRD/FSD?
  3. Đủ dữ liệu/thao tác — Các field, action, trạng thái nghiệp vụ cần thiết đều xuất hiện trên mockup?
  4. Không thiếu, không thừa — Không bỏ sót yêu cầu nghiệp vụ, không thêm màn hình/thao tác ngoài scope.
  CHỈ xét nghiệp vụ — KHÔNG xét thẩm mỹ (UI agent lo) và KHÔNG xét khả thi kỹ thuật (TA lo ở bước sau).
  Output format:
  ## BA Review — UI Mockup {TICKET}
  | # | Requirement (US/AC) cần UI | Screen tương ứng | Status |
  |---|-----------------------------|------------------|--------|
  ### Missing / incorrect
  | # | Requirement | Gap |
  Verdict: APPROVED / CHANGES REQUESTED (list changes)"
)
```

Handle BA verdict:
- **APPROVED** → proceed to Step 2c (TA enrich)
- **CHANGES REQUESTED** → invoke UI agent to fix mockups theo danh sách gap từ BA → re-invoke BA to re-review (max 2 iterations)

⛔ **UI mockup KHÔNG được coi là done cho tới khi BA verdict = APPROVED.** Nếu sau 2 iterations vẫn CHANGES REQUESTED → report user.

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
✅ Phase 2 done — FSD.md created & attached to Jira (BA draft + UI mockup + TA enrichment).
- BA: Use Cases, Business Rules, Data Specs, Diagrams
- UI: Wireframes + UI-SPEC (BA-approved) — UI tickets only
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

**BA reads:** KB (BRD), code intelligence, FSD draft, UI wireframes
**BA writes:** FSD.md draft → KB; UI Mockup review verdict (APPROVED / CHANGES REQUESTED) — gate for UI mockup completion
**UI reads:** KB (BRD + FSD draft), code intelligence (frontend), existing frontend design system
**UI writes:** Wireframes (.drawio + .png), UI-SPEC, FSD UI Specifications section → KB
**TA reads:** KB (BRD), code intelligence, FSD.md (incl. BA-approved UI mockup)
**TA writes:** FSD.md (enriched) → KB (updated)
