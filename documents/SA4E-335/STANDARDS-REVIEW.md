# Standards Review — SA4E-335 (Phase 6, Axis 1: Standards)

**Reviewer:** dev-agent (Standards axis)
**Date:** 2026-10-01
**Scope:** `git diff main...SA4E-335` — DevOps infrastructure changes only (CI workflow, Dockerfile, docker-compose, env/secret templates, .gitignore). No application source code (`.ts`) was changed on this branch.
**Standard:** `.kiro/steering/code-standards.md` (file/function size, SOLID where applicable, comments/headers; for YAML/Dockerfile: clarity, pinned versions, no secrets).
**Nature:** Read/review only — build and test suites were NOT re-run (already executed and verified in Phases 5/5.7, see RUN-LOG #19, #22).

---

## Changed Files Reviewed

| File | Type | Change |
|------|------|--------|
| `.github/workflows/build-push-backend.yml` | GitHub Actions YAML | New — build & push production image |
| `backend/Dockerfile` | Dockerfile | Modified — alpine→slim, 6-stage, digest-pinned, non-root |
| `backend/docker-compose.yml` | Compose YAML | Modified — production hardening (secrets, limits, read-only) |
| `backend/.env.production.example` | Env template | New — non-secret runtime defaults |
| `backend/secrets/database_url.example` | Secret template | New — placeholder only |
| `backend/secrets/postgres_password.example` | Secret template | New — placeholder only |
| `.gitignore` | Config | Modified — ignore real secrets, keep `*.example` |
| `backend/package-lock.json` | Lockfile | Modified — generated prereq (not hand-authored) |

> `documents/SA4E-335/*` (BUILD-AND-REGISTRY.md, IMPL-VERIFICATION.md, RUN-LOG.md, STATUS.json) are process artifacts, not deliverable code — excluded from standards scoring.

---

## Findings

### Clarity & Documentation — PASS

- Every file carries a clear header block stating purpose, the ticket (SA4E-335), and traceability to design decisions (AD-/BR-/SEC-/D- IDs). This satisfies the "file header comment" and "WHY not WHAT" requirements from code-standards.
- Each non-obvious step in the CI workflow, Dockerfile stage, and compose directive has an inline comment explaining the *reason* (e.g. "node:22-slim so onnxruntime-node links against glibc", "login gated to non-PR so fork PRs never see push credentials"). Comments explain intent, not restate syntax.
- No noise comments / no restating-the-obvious.

### Pinned Versions — PASS (with one minor doc inconsistency)

- Base images pinned by immutable `sha256` digest, not just mutable tags: `node:22-slim@sha256:43ac6c...` (Dockerfile) and `pgvector/pgvector:pg16@sha256:ccc6e8...` (compose). ✅
- Third-party GitHub Actions pinned by commit SHA with the human-readable tag in a trailing comment (`actions/checkout@692973...# v4.1.7`, etc.). ✅ Matches SEC-13.
- `npm ci` used for hermetic installs (locked versions) in all build stages. ✅

### No Secrets — PASS

- No real credentials committed. The only credential-shaped strings are `CHANGE_ME_PLACEHOLDER` in `*.example` templates, which are explicitly labelled "TEMPLATE ONLY".
- `.gitignore` ignores `backend/secrets/*` and `backend/.env.production` while whitelisting `*.example`, so real secret files cannot be committed. ✅ (SEC-01)
- Runtime secrets delivered via Docker secret files (`POSTGRES_PASSWORD_FILE`, `DATABASE_URL_FILE`) rather than plaintext env — consistent with code-standards "never commit real credentials". ✅
- Independently cross-checked against RUN-LOG #22 (security-agent): hardcoded-secret regex over the full diff returned no matches.

### SOLID / Size Limits — N/A (correctly)

- The 200-lines/file and 20-lines/function rules target application source code. These are declarative infra artifacts (YAML/Dockerfile), so the function-size and class-SRP rules do not apply. Each file nonetheless keeps a single clear responsibility (one Dockerfile per image, one compose per composition, one workflow per build-push concern), which is the spirit of SRP. ✅
- The CI workflow is a single cohesive job with sequential, well-named steps; no copy-paste duplication (DRY respected). The healthcheck probe logic is intentionally duplicated between Dockerfile `HEALTHCHECK` and compose `healthcheck` — this is justified and documented (D-3: compose mirrors the image probe so orchestration observes health even if the image probe is overridden), not an accidental DRY violation.

---

## Minor Issues (non-blocking)

| # | File | Issue | Severity |
|---|------|-------|----------|
| 1 | `backend/docker-compose.yml` | `onnx-runtime` comment reads "pin by tag+digest (replaces the previous mutable `:latest`)" but the image is still `mcr.microsoft.com/onnxruntime/server:latest` — comment does not match code. Service is dev-only (gated behind the `embeddings` profile, inactive in production per BR-13), so no production impact, but the comment is misleading. | Low |
| 2 | `backend/package-lock.json` | Committed as a generated prerequisite (RUN-LOG #19), not hand-authored. All version moves are within declared caret ranges (jose 6.2.3→6.2.12, pg 8.22.0→8.23.1, knex/sqlite3 added). No standards concern — noted for completeness. | Info |

Neither issue blocks the Standards gate. Issue #1 is a one-line comment correction that can be folded into a future touch of the compose file; it does not affect behavior, security, or buildability.

---

## Summary

- Headers/comments: **PASS** — thorough, WHY-focused, traceable to design IDs.
- Pinned versions: **PASS** — base images by digest, actions by SHA, `npm ci` hermetic.
- No secrets: **PASS** — placeholders only, real secrets git-ignored, Docker secret files at runtime.
- SOLID/size limits: **N/A** (infra artifacts) — single-responsibility and DRY respected in spirit.
- Minor: 1 Low (stale onnx comment), 1 Info (generated lockfile). Non-blocking.

VERDICT: PASS

Findings list:
- [PASS] File headers present on all changed infra files, explaining purpose + ticket + design-decision traceability.
- [PASS] Inline comments explain WHY (intent), not WHAT; no noise comments.
- [PASS] Base images pinned by immutable sha256 digest (node:22-slim, pgvector:pg16); GitHub Actions pinned by commit SHA; `npm ci` for hermetic installs.
- [PASS] No real secrets committed — only CHANGE_ME_PLACEHOLDER templates; `.gitignore` blocks real secret files and keeps `*.example`; runtime secrets via Docker secret files.
- [N/A] File/function size + class-SRP rules do not apply to YAML/Dockerfile; single-responsibility and DRY respected in spirit.
- [Low, non-blocking] `onnx-runtime` comment claims digest pinning but image is still `:latest` (dev-only service, no production impact).
- [Info] `backend/package-lock.json` is a generated prereq; version moves within declared caret ranges, no major bumps.
