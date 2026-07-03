# Phase 7: Deployment (DevOps → DPG/RLN + Deploy)

## Prerequisites

- All tests pass (testing.status = "done")
- UAT accepted (user confirmed)
- Jira status: UAT or Ready For Product

## ⛔ CHỈ THỰC HIỆN KHI USER XÁC NHẬN UAT PASS

## Workflow

### Step 7a: Create DPG & RLN

1. Update STATUS: `deployment.status = "in_progress"`

2. Invoke DevOps:
```
invokeSubAgent(
  name: "devops-agent",
  prompt: "Tạo Deployment Guide và Release Notes cho {TICKET}. PHẢI tạo draw.io diagrams (deployment-architecture.drawio + rollback-flow.drawio) và export PNG.",
  contextFiles: [{ "path": ".kiro/steering/drawio.md" }]
)
```

3. Verify `documents/{TICKET}/DPG.md` and `documents/{TICKET}/RLN.md` exist

### Step 7b: Deploy

4. Transition Jira: UAT → READY FOR PRODUCT (transition "Deploy")

5. DevOps deploys according to DPG steps

6. Run sanity test after deploy

7. If sanity PASS → proceed to release
8. If sanity FAIL → rollback → "Fix bugs" → IN PROGRESS → report user

### Step 7c: Release Process (MANDATORY)

**SM invoke DevOps with explicit instructions:**
```
invokeSubAgent(
  name: "devops-agent",
  prompt: "Release {TICKET} — Deploy đã thành công. Thực hiện release process:
  1. Merge branch {TICKET} vào master (--no-ff)
  2. Bump version — tạo git tag (semver: minor cho feature, patch cho bugfix)
  3. Cập nhật README.md — thêm entry mới vào changelog section
  4. Auto-promote KB: mem_promote(action='promote_on_merge', ticket_key='{TICKET}')
  Báo cáo kết quả từng bước."
)
```

**SM verify sau khi DevOps hoàn thành:**

| # | Bước | SM Verify |
|---|------|-----------|
| 1 | Merge to master | Confirm merge commit exists |
| 2 | Bump version | Confirm tag exists, semver valid |
| 3 | Update README | Confirm README changed, has new version |

- If any step missing → ask DevOps to redo
- Only when ALL 3 PASS → transition READY FOR PRODUCT → DONE

### Step 7d: Finalize

9. Transition Jira: READY FOR PRODUCT → DONE (transition "Complete")
   **⛔ ONLY after release process complete**

10. Attach DPG + RLN to Jira:
```
embed_images → export_docx → jira_update_issue
```

11. Update STATUS: `deployment.status = "done"`

12. Report: "✅ Phase 7 done — Deployed, released, DONE."

## Quality Gate — DPG

| # | Check | If Missing |
|---|-------|------------|
| 1 | DPG.md exists | Re-invoke DevOps |
| 2 | Deployment Steps section | Re-invoke DevOps |
| 3 | Rollback Plan section | Re-invoke DevOps |
| 4 | Deployment Flow Diagram (.drawio + .png) | Invoke DevOps for diagrams |
| 5 | Rollback Flow Diagram (.drawio + .png) | Invoke DevOps for diagrams |
| 6 | Pre-Deployment Checklist | Ask DevOps to add |
| 7 | Post-Deployment Verification | Ask DevOps to add |

## ⛔ Transitions SM KHÔNG ĐƯỢC tự động

| Transition | Condition |
|-----------|-----------|
| UAT → READY FOR PRODUCT | CHỈ sau user xác nhận UAT pass |
| READY FOR PRODUCT → DONE | CHỈ sau deploy + sanity + release process |

## Agent Data Access

**DevOps reads:** KB (TDD + FSD + BRD), source code (configs)
**DevOps writes:** DPG.md, RLN.md → KB
