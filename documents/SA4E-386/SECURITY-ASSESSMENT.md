# Security Assessment — SA4E-386

| Field | Value |
|---|---|
| Jira Ticket | SA4E-386 |
| Assessment version | 1.0 |
| Date | 2026-10-28 |
| Assessor | Security Agent |
| Verdict | APPROVED WITH CONDITIONS |

## 1. Scope

- Code diff under review: Node.js pin to 22.23.4 (`.nvmrc`, `engines`, lockfile, `backend/Dockerfile`, 15 workflows) and removal of legacy better-sqlite3 workflow (CR-01).
- Design inputs: `SECURITY-REVIEW.md` (design verdict APPROVED WITH CONDITIONS), `TDD.md` v1.1 (AD-11, gates G0–G8).

## 2. Findings

### Resolved in code (this assessment)

| Finding | Severity | Disposition | Evidence |
|---|---|---|---|
| SEC-CI-01 — image pushed before Trivy scan; push not PR-gated | High | **RESOLVED** | `backend/Dockerfile`-adjacent workflow `.github/workflows/build-push-backend.yml` now performs: Build (`push: false`, `load: true`) → Trivy scan (`exit-code: "1"`, severity CRITICAL/HIGH, runs on PR) → Push (`if: github.event_name != 'pull_request'`). Verified directly in the working tree (L107–L142). |
| SEC-SC-01 — digest pin authority | Medium | **RESOLVED AT DESIGN LEVEL** | `ARG NODE_VERSION=22.23.4`, `ARG NODE_BASE_DIGEST=sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d` (OCI index digest for `node:22.23.4-slim`, resolved from Docker Hub at 2026-10-28). Behavioral proof pending (E2E-API-05). |

### Conditions still open (runtime)

| Condition | Severity | Status | Blocking |
|---|---|---|---|
| C-1 — Trivy claim meaningful (M1∧M2∧M3 vs baseline) | Medium | Open — requires baseline + post-change scans (design EV-01…EV-16; SIT-07) | Before claiming CVE remediation. |
| C-2 — Rollback readiness (RB-1…RB-4) | Medium | Open — requires rollback rehearsal (SIT-04) | Before merge/deploy decision. |
| C-3 — Digest assertion behavioural | High | Open — requires E2E-API-05 (substituted digest must fail build) | Before UAT. |

## 3. Positive Security Controls Verified in Code

- No secret-shaped material in added lines (only standard `${{ secrets.* }}` / `${{ github.token }}` references): **CLEAN**.
- No security-relaxation flags (`--no-verify`, `--no-audit` active-control removals, `--force`, `--insecure`, `engine-strict`, `NODE_TLS_REJECT_UNAUTHORIZED`) in the diff: **CLEAN**.
- No privilege escalation (`USER root`, `chmod 777`, `--privileged`) added in `backend/Dockerfile`: **CLEAN**.
- Permissions cleanup: `contents: write` removal confined to deleted `build-native.yml`; live workflows unchanged apart from pin: **CLEAN**.
- AC-08 sweep: no dangling `build-native` / `better-sqlite3` references in `.github/workflows/`: **CLEAN**.

## 4. Verdict

**APPROVED WITH CONDITIONS** — all code-level security conditions for the pin and the CR-01 removal are resolved in source. Remaining conditions are runtime proofs (digest assertion behaviour, Trivy claim, rollback rehearsal, dynamic pentest, post-merge scan) and must be closed before UAT sign-off.

**Blocking conditions before UAT: C-3 (High) — behavioural proof of digest assertion (E2E-API-05) not yet executed.**
