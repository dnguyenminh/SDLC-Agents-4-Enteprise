# Release v1.55.9

## Summary
Node.js security upgrade to 22.23.4 + CR-01 scope amendment (SA4E-386).

## Changes Included

### 🔒 Security
- Node.js pinned to 22.23.4 across 4 layers: `.nvmrc` (8B), `engines` (root+backend+lockfile), `Dockerfile ARG NODE_VERSION + NODE_BASE_DIGEST`, 27 workflow literals
- CR-01: delete `build-native.yml`; ONNX workflow preserved; update `auto-release.yml` + `scheduled-prebuild-scan.yml`

### 📄 SDLC docs
- BRD v1.0 (English per template), FSD v1.3, TDD v1.1 (AD-11, all discrepancies closed)
- TEST-REPORT.md (5/7 PASS, IT-06 FAIL: trailing newline in build-onnxruntime.yml)
- UG.md with §7 Manual Test Procedure (UAT)
- STATUS.json → uat / ready_for_uat; RUN-LOG.md appended
- Jira SA4E-386: comment 12266 posted; status In Review → In Progress (31)

### 🏷️ Version & Tag
- Version: **1.55.9** (bumped from 1.55.9)
- Synced across root / `backend` / `extension`

### 📁 Modified Files
- `package.json` (root) - Version 1.55.9
- `backend/package.json` - Version 1.55.9
- `extension/package.json` - Version 1.55.9 (updated inline)
- `README.md` - version badge + changelog v1.55.9
- `TEST-REPORT.md` - IT-06 FAIL record, scope allow-list IT-01 PASS
- `documents/SA4E-386/` - full SDLC deliverables (BRD/FSD/TDD/TEST-REPORT/UAT-READINESS/UG + diagrams)
