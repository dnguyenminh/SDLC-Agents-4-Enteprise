---
name: phase-7-deployment
description: Phase 7 workflow — DevOps creates DPG/RLN, deploy, release process, finalize
---

## Prerequisites

- All tests pass (testing.status = "done")
- UAT accepted (user confirmed)
- Security Deployment Review done (security_deploy_review.status = "done") — Phase 6.7
- Jira status: UAT or Ready For Product

## ONLY EXECUTE WHEN USER CONFIRMS UAT PASS + SECURITY DEPLOY REVIEW PASS

## Workflow

### Step 7a: Create DPG & RLN

1. Update STATUS: `deployment.status = "in_progress"`

2. Invoke DevOps:
```
task(
  description: "Create Deployment Guide and Release Notes for {TICKET}",
  prompt: "Create Deployment Guide and Release Notes for {TICKET}. MUST create draw.io diagrams (deployment-architecture.drawio + rollback-flow.drawio) and export PNG — load the 'drawio-diagrams' skill via the skill tool.",
  subagent_type: "devops-agent"
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

**PIC: DevOps Agent — 100% responsible for version consistency during release.**

**SM invokes DevOps with explicit instructions:**
```
task(
  description: "Release {TICKET} — version sync and tagging",
  prompt: "Release {TICKET} — Deploy successful. Execute release process:
  1. Merge branch {TICKET} into master (--no-ff)
  2. Bump version — create git tag (semver: minor for feature, patch for bugfix)
  3. SYNC ALL VERSION REFERENCES (MANDATORY — your responsibility):
     a. Scan project for ALL version sources (package.json, pyproject.toml, version.txt, etc.)
     b. Scan README/docs for hardcoded version strings (badges, install commands, download links)
     c. Update ALL discovered sources to the new version
     d. Add changelog entry (README, CHANGELOG.md, or equivalent)
     e. Report list of updated files with version number
     Rule: All version references in the project MUST be consistent. Do not miss any.
  4. Auto-promote KB: mem_promote(action='promote_on_merge', ticket_key='{TICKET}')
  Report: list of updated files + applied version number.",
  subagent_type: "devops-agent"
)
```

**SM verify after DevOps completes:**

| # | Step | SM Verify |
|---|------|-----------|
| 1 | Merge to master | Confirm merge commit exists |
| 2 | Bump version | Confirm tag exists, semver valid |
| 3 | Version sources discovered | DevOps reports list of version files |
| 4 | All version sources updated | Grep version string in reported files — all match tag |
| 5 | Changelog/README updated | New entry exists with correct version |

- If ANY version mismatch → ask DevOps to fix BEFORE transition
- Only when ALL checks PASS → transition READY FOR PRODUCT → DONE

### Step 7d: Finalize

9. Transition Jira: READY FOR PRODUCT → DONE (transition "Complete")
   **ONLY after release process complete**

10. Attach DPG + RLN to Jira:
```
embed_images → export_docx → jira_update_issue
```

11. Update STATUS: `deployment.status = "done"`

12. Report: "Phase 7 done — Deployed, released, complete."

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

## Quality Gate — Version Sync (Release) — PIC: DevOps Agent

DevOps MUST scan project and report all version sources. SM verify:

| # | Check | If Fail |
|---|-------|---------|
| 1 | DevOps reports list of version files discovered | Re-invoke: "Scan again, report ALL version files" |
| 2 | All reported files contain same version = git tag | DevOps fix immediately |
| 3 | README/docs no longer contain old version string | DevOps fix immediately |
| 4 | Changelog has new entry with correct version | DevOps fix immediately |
| 5 | All consistent | BLOCK transition until fixed |

## Transitions SM MUST NOT Auto-Execute

| Transition | Condition |
|-----------|-----------|
| UAT → READY FOR PRODUCT | Only after user confirms UAT pass |
| READY FOR PRODUCT → DONE | Only after deploy + sanity + release process |

## Agent Data Access

**DevOps reads:** KB (TDD + FSD + BRD), source code (configs)
**DevOps writes:** DPG.md, RLN.md → KB