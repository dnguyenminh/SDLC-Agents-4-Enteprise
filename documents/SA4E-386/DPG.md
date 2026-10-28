# Deployment Guide (DPG)

## SA4E-386: Pin Node.js to 22.23.4 and remove legacy better-sqlite3 workflow

---
## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-386 |
| Title | Pin Node.js to 22.23.4 to patch CVE-2026-111497 and retire legacy better-sqlite3 workflow |
| Author | DevOps Agent |
| Version | 1.0 |
| Date | 2026-10-28 |
| Status | Draft |
| Related TDD | TDD-v1.1-SA4E-386.docx |

---
## 1. Overview

### 1.1 Feature Summary
Pin all Node.js runtime declarations to 22.23.4 to remediate CVE-2026-111497 (Brotli RCE) and three related High findings. Simultaneously retire the dead `better-sqlite3` prebuild workflow and its consumer references per scope amendment CR-01.

### 1.2 Deployment Scope
| Item | Type | Description |
|------|------|-------------|
| CI Workflows | Modified | 15 workflows now use node-version 22.23.4; build-native.yml deleted |
| build-push-backend.yml | Modified | Trivy scan runs before Docker push and on PRs (AD-9) |
| auto-release.yml | Modified | Removed build-native trigger |
| scheduled-prebuild-scan.yml | Modified | Removed better-sqlite3 logic, kept ONNX Runtime only |
| DPG/RLN docs | New | Deployment guide and release notes |

### 1.3 Target Environments
| Environment | Deploy Order | Approval Required |
|-------------|-------------|-------------------|
| DEV | 1st | No |
| SIT | 2nd | No |
| UAT | 3rd | QA Sign-off |
| PROD | 4th | PM + Security Sign-off |

---
## 2. Prerequisites
- GitHub Actions runner with ubuntu-latest
- Docker Buildx available
- Trivy action pinned at ed142fd…
- Access to GHCR and Docker Hub secrets

---
## 3. Pre-Deployment Checklist
- [ ] PR merged to node-security-upgrade branch
- [ ] All CI jobs green on PR
- [ ] Trivy scan passes on PR build
- [ ] build-native.yml deleted
- [ ] auto-release.yml trigger list validated
- [ ] scheduled-prebuild-scan.yml simplified

---
## 4. CI/CD Changes Summary

### Node version pin
All 15 workflows now enforce `node-version: 22.23.4` via actions/setup-node.

### build-push-backend.yml AD-9
- Build step now does push:false, load:true with tag `sa4e-backend:candidate`
- Trivy scan runs on the candidate image **before** push and on pull_request
- Push step runs only after scan success and only on non-PR events
- Gates G0-G8 traceable:
  - G0: scope gate → workflow file census
  - G3: static config checks → setup-node version literals
  - G5: container build + Trivy → build-push-backend.yml steps
  - G6: PR scope → auto-release & scheduled-prebuild-scan changes

### Workflow removal CR-01
- Deleted `.github/workflows/build-native.yml`
- Removed entry from auto-release.yml workflow_run.workflows
- Removed BETTER_SQLITE3_VERSION, native scan/trigger from scheduled-prebuild-scan.yml
- ONNX Runtime scan/trigger preserved byte-identical

---
## 5. Application Deployment Steps
This ticket is configuration-only; no application code changes.

1. Merge PR to main
2. CI will build backend image with Dockerfile ARG NODE_VERSION=22.23.4 and digest pin
3. Trivy scan gates promotion
4. Image pushed to GHCR/Docker Hub with immutable digest
5. Verify `node -v` inside container returns v22.23.4

---
## 6. Post-Deployment Verification
- Health check: Docker image builds and runs `node -v` = v22.23.4
- Trivy report shows CVE-2026-111497 absent
- Workflow census: 15 workflow files, 28 node-version keys, 27 literals + 1 matrix
- `grep -rn "build-native\|better-sqlite3" .github/workflows/` returns empty

---
## 7. Rollback Plan
- Revert PR merge
- Re-apply previous node-version literals via git revert
- Re-create build-native.yml from backup if needed
- Re-push previous image digest

---
## 8. Environment-Specific Notes
- PROD deployment window: scheduled release train
- Approval required from Security for Trivy gate change
