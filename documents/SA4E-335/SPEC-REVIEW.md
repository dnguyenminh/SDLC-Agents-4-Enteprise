# Spec Compliance Review — SA4E-335

| Field | Value |
|-------|-------|
| Ticket | SA4E-335 — Review backend Dockerfile/docker-compose and create CI to build Docker image |
| Reviewer | qa-agent (Phase 6 — Spec Compliance axis) |
| Date | 2026-10-01 |
| Branch | SA4E-335 (diff vs `main`) |
| Specs | TDD.md v1.0, FSD.md v1.1 |
| Scope | Read-only review of implemented artifacts vs design contracts. No build/test suites re-run. |

---

## 1. Scope & Method

Reviewed `git diff main...SA4E-335` against TDD §3.2 (Dockerfile), §3.3 (docker-compose), §3.4 (CI workflow), §4 (config contracts), §6 (security design) and the FSD business rules (BR-01..BR-23). The three primary artifacts and their supporting files were read in full. This axis checks: all specified features implemented, missing features, scope creep, and whether Dockerfile/compose/CI match the design contracts.

Changed files on branch:
- `backend/Dockerfile`, `backend/docker-compose.yml`, `.github/workflows/build-push-backend.yml`
- `.gitignore`, `backend/.env.production.example`, `backend/secrets/{postgres_password,database_url}.example`
- `backend/package-lock.json` (lockfile prereq, DEV-documented)
- `documents/SA4E-335/*` (docs: BUILD-AND-REGISTRY, IMPL-VERIFICATION, RUN-LOG, STATUS)

---

## 2. Feature Coverage — all four stories implemented

| Story / Feature | Spec | Implemented? | Evidence |
|-----------------|------|--------------|----------|
| Story 1 — Containerization gap review & decisions | UC-01, BR-01..BR-06 | ✅ Yes | TDD §2.3 AD-1..AD-7 decisions recorded; BUILD-AND-REGISTRY §1 base-image decision + §2 runtime deps; Dockerfile comments trace each decision |
| Story 2 — Production-ready docker-compose | UC-02, BR-08..BR-13 | ✅ Yes | `docker-compose.yml` closes D-1..D-5 (see §4) |
| Story 3 — GitHub Actions CI build & push | UC-03, BR-14..BR-19 | ✅ Yes | `build-push-backend.yml` full job graph (see §5) |
| Story 4 — Build & registry documentation | UC-04, BR-20..BR-23 | ✅ Yes | `BUILD-AND-REGISTRY.md` covers local+CI build, targets, base-image decision, runtime deps, registry/tag scheme, pull command |

---

## 3. Dockerfile vs TDD §3.2 / §4

| Design contract | Required | Implemented | Match |
|-----------------|----------|-------------|-------|
| Base image (AD-1, BR-02) | `node:22-slim` (glibc) | `FROM node:22-slim@sha256:...` in base + production | ✅ (+ digest pin, SEC-02) |
| Six-stage layout (AD-2) | base/deps/build/production/development/test | All six stages present; `production` sole push target | ✅ |
| Non-root user (BR-05) | `sa4e` uid/gid 1001 in production/dev/test | `groupadd -g 1001 / useradd -u 1001`, `USER sa4e` in all three | ✅ |
| Runtime ENV (§4.2) | `NODE_ENV=production`, `PORT=48721` | Both set in `production` stage | ✅ |
| EXPOSE / CMD | `EXPOSE 48721`, `CMD ["node","dist/index.js"]` | Present | ✅ |
| Healthcheck (§4.3, BR-09) | `GET /health`, interval 30s/timeout 5s/start 10s/retries 3 | Present with exact params | ✅ (node http probe instead of wget — see Deviations) |
| Build args, default-off (AD-6, SEC-08) | `NODE_VERSION`, SA4E-44 items guarded, bare build must succeed | `NODE_VERSION`, `NODE_BASE_DIGEST`; AD-6 items documented default-OFF | ✅ |
| Hermetic deps (BR-03) | `npm ci` against lock | `npm ci --omit=dev` (deps), `npm ci` (build) | ✅ |
| No secrets in build args (BR-17) | — | No ARG/ENV carries credentials | ✅ |

---

## 4. docker-compose vs TDD §3.3 (discrepancy log D-1..D-5, D-11/12)

| Item | Required | Implemented | Match |
|------|----------|-------------|-------|
| D-1 — backend NODE_ENV | `production` | `NODE_ENV: production` | ✅ |
| D-2 / BR-08 — secrets | `DATABASE_URL_FILE`, `POSTGRES_PASSWORD_FILE` via Docker secrets | Both via `/run/secrets/*`; top-level `secrets:` file-backed | ✅ |
| D-3 / BR-09 — compose healthcheck | mirror §4.3 | Present, mirrors Dockerfile node probe | ✅ |
| D-4 / BR-11 — resource limits | cpus+memory on backend & postgres | `deploy.resources.limits` (env-substituted) on both | ✅ |
| D-5 / BR-10 — postgres restart | `unless-stopped` | Present on postgres; backend also `unless-stopped` | ✅ |
| BR-12 — named volumes | `postgres_data`, `code_intel_data` | Both retained | ✅ |
| BR-13 — embeddings dev-only | `profiles: [embeddings]` | `onnx-runtime` guarded by profile | ✅ |
| D-12 — drop `version:` | removed | No `version:` key | ✅ |
| pgvector image | `pgvector/pgvector:pg16` | Retained (+ digest pin) | ✅ |

Security hardening beyond baseline (traces to TDD §6 S-1/S-4 + Security Review): postgres port unpublished (SEC-06), backend bound to loopback via `PUBLISH_HOST` (SEC-07), `read_only`+`tmpfs`+`cap_drop: ALL`+`no-new-privileges` (SEC-09). These implement documented design notes — not scope creep.

---

## 5. CI workflow vs TDD §3.4 / §4.4

| Step / contract | Required | Implemented | Match |
|-----------------|----------|-------------|-------|
| Triggers (BR-14) | push main, tags `v*.*.*`, PR build-only | `push [main,master]` + tags `v*.*.*` + `pull_request` + `workflow_dispatch` | ✅ (master = superset) |
| Permissions | `contents: read`, `packages: write` | Present | ✅ |
| Checkout | `fetch-depth: 0` | Present | ✅ |
| Tag derivation (BR-16) | sha-short + semver + latest(main only) | `metadata-action` with sha/semver/latest-gated-to-default-branch | ✅ |
| Buildx (AD-3) | single build+push invocation | `build-push-action`, `push=${{ event != PR }}` | ✅ |
| Registry login gated (AD-7, BR-17/18) | login push-events only, CI secrets, masked | `if: event != pull_request`, GHCR `GITHUB_TOKEN` | ✅ |
| Build target (BR-15) | `production`, context `backend/` | `target: production`, `context: backend` | ✅ |
| Verify digest (EF-3) | assert digest present | Step 7 fails red if digest empty | ✅ |
| Fail-visible (BR-19) | any non-zero → red, no push | Honored; PRs never push | ✅ |
| Registry as config (AD-4, BR-20) | `REGISTRY`/`IMAGE_NAME` repo vars | `vars.REGISTRY || 'ghcr.io'`, `vars.IMAGE_NAME || ...` | ✅ |
| Supply-chain (SEC-04/13) | CVE scan gate, actions SHA-pinned | Trivy CRITICAL/HIGH gate; all actions pinned by commit SHA | ✅ |

---

## 6. Missing Features

None. All UC-01..UC-04 and BR-01..BR-23 obligations map to implemented artifacts or recorded design decisions.

## 7. Scope Creep

None material. Added hardening (`read_only`, `tmpfs`, `cap_drop`, `no-new-privileges`, loopback publish, Trivy scan) are all traceable to TDD §6 security design and the Security Review findings (SEC-04/06/07/09/13) — in-scope defense-in-depth, not unrequested features. The `backend/package-lock.json` change is a documented build prerequisite (within declared caret ranges, no major bumps) committed separately per DEV log #19 — justified, not scope creep.

## 8. Minor Observations (non-blocking)

- **Healthcheck probe technique deviation:** TDD §4.3 wrote a `wget`-based probe; implementation uses a node built-in `http` probe. Justified — `node:22-slim` ships no `wget`, so wget would silently fail (SEC-12). Behavior-equivalent (`GET /health`, 200⇒healthy) with identical interval/timeout/retries. Acceptable.
- **`onnx-runtime` image tag:** compose comment claims digest-pin but the value is still `:latest`. Dev-only, behind `embeddings` profile, inactive in production (SCR-01, accepted). No production impact.
- **Trigger superset:** workflow adds `master` + `workflow_dispatch` beyond the TDD's `main`-only list. Harmless superset, improves operability.

---

## 9. Findings List

1. ✅ Story 1 (gap review & decisions) — fully documented (AD-1..AD-7, BUILD-AND-REGISTRY §1/§2).
2. ✅ Story 2 (production compose) — D-1..D-5, BR-08..BR-13 all satisfied.
3. ✅ Story 3 (CI build & push) — BR-14..BR-19, AD-3/AD-4/AD-7 all satisfied.
4. ✅ Story 4 (documentation) — BR-20..BR-23 all satisfied.
5. ✅ Security contracts (SEC-01..SEC-13) implemented and traceable.
6. ⚠️ Minor: healthcheck uses node http probe vs spec's wget — justified (SEC-12), behavior-equivalent.
7. ⚠️ Minor: `onnx-runtime` still `:latest` despite digest-pin comment — dev-only, accepted (SCR-01).
8. ✅ No missing features; no material scope creep.

---

VERDICT: PASS
