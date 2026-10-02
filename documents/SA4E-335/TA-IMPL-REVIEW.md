# TA Review — Implementation SA4E-335

| Field | Value |
|-------|-------|
| Reviewer | TA Agent (design-conformance, Phase 5) |
| Branch | SA4E-335 (base `main`) |
| Artifact commit | `70f35f1` — Docker/compose hardening + CI |
| Prereq commit | `8d4b173` — regenerate backend/package-lock.json |
| Verify commit | `70d39d6` — Phase 5 build+runtime verification evidence |
| Design inputs | TDD v1.0, FSD v1.1, SECURITY-REVIEW (SEC-01..SEC-13) |
| Verdict | **APPROVED** |

---

## 1. Scope reviewed

Three declarative artifacts + supporting files from `git diff main...SA4E-335`:

- `backend/Dockerfile` (multi-stage image)
- `backend/docker-compose.yml` (production composition)
- `.github/workflows/build-push-backend.yml` (CI build & push)
- `.gitignore`, `backend/secrets/*.example`, `backend/.env.production.example`
- `documents/SA4E-335/BUILD-AND-REGISTRY.md`, `IMPL-VERIFICATION.md`
- `backend/package-lock.json` (prereq, isolated commit)

Verification evidence recorded by the dev step (not re-run per instructions);
one narrow spot-check performed: `docker compose config` ⇒ exit 0.

---

## 2. Design-conformance matrix (TDD/FSD → implementation)

| # | Design Item (TDD/FSD) | Implemented | Conforms? | Note |
|---|-----------------------|-------------|-----------|------|
| 1 | AD-1 base `node:22-slim` (glibc) | `FROM node:22-slim@sha256:…` in base + production | ✅ | onnxruntime-node load verified at runtime (IMPL-VERIFICATION §2/3) |
| 2 | AD-2 six-stage layout, `production` sole push target | base/deps/build/production/development/test present; CI target=production | ✅ | — |
| 3 | §3.2 apt toolchain, build-only git/compilers | `apt-get --no-install-recommends python3 make g++ git` + cleanup in base/build only | ✅ | SEC-05: git absent at runtime (confirmed) |
| 4 | BR-05 non-root `sa4e` uid/gid 1001 | groupadd/useradd 1001 in production/development/test; `USER sa4e` | ✅ | `docker exec id` ⇒ uid=1001 |
| 5 | §4.2 runtime ENV `NODE_ENV=production`, `PORT=48721`, `EXPOSE 48721`, `CMD node dist/index.js` | present verbatim | ✅ | — |
| 6 | AD-6 SA4E-44 items (draw.io/model/workspaces) default-off | guarded, DEFAULT OFF (SEC-08); bare build succeeds | ✅ | — |
| 7 | §4.3 Healthcheck `GET /health`, interval/timeout/start/retries | node http probe (not wget), same timings & semantics | ✅ (justified deviation) | SEC-12: node:22-slim has no wget; node probe is functionally equivalent and correct. See §3. |
| 8 | D-1 compose `NODE_ENV=production` | set | ✅ | — |
| 9 | D-2/BR-08 `*_FILE` Docker secrets, no plaintext | `POSTGRES_PASSWORD_FILE`, `DATABASE_URL_FILE` + top-level `secrets:` | ✅ | — |
| 10 | D-3/BR-09 compose-level healthcheck mirrors probe | present (node probe, same values) | ✅ | — |
| 11 | D-4/BR-11 `deploy.resources.limits` cpus+memory (backend+postgres) | present, env-substituted (AF-2) | ✅ | — |
| 12 | D-5/BR-10 postgres `restart: unless-stopped` | present on both services | ✅ | — |
| 13 | BR-12 named volumes preserved | `postgres_data`, `code_intel_data` | ✅ | — |
| 14 | BR-13 `embeddings` profile dev-only | onnx-runtime under `profiles: [embeddings]`, excluded from config | ✅ | compose config confirms exclusion |
| 15 | D-11/D-12 cosmetic: fix comments, drop `version:` | comments corrected, `version:` omitted | ✅ | — |
| 16 | BR-14 CI triggers (push main / tag v*.*.* / PR) | push [main,master]+tags, pull_request, workflow_dispatch | ✅ | master alias added — harmless superset |
| 17 | BR-15 build `production` target | `target: production`, context `backend/` | ✅ | — |
| 18 | BR-16 semver + SHA tag scheme (+latest main only) | metadata-action: sha-, semver vX.Y.Z/X.Y/X, latest(main/master) | ✅ | matches §4.5 |
| 19 | AD-3 single buildx build+push | `docker/build-push-action` single invocation | ✅ | — |
| 20 | AD-7/BR-18 login+push gated non-PR, after build | `if: github.event_name != 'pull_request'` on login/push/scan/verify | ✅ | fork PRs never see push creds |
| 21 | BR-17 CI secrets only (GHCR GITHUB_TOKEN) | login via `secrets.GITHUB_TOKEN`; no build-arg secrets | ✅ | — |
| 22 | BR-19 fail-visible, verify digest (EF-3) | step 7 asserts digest, `::error::` on missing | ✅ | — |
| 23 | AD-4/BR-20 registry as repo vars default GHCR | `vars.REGISTRY \|\| ghcr.io`, `vars.IMAGE_NAME \|\| …/backend` | ✅ | — |
| 24 | SEC-01 secrets git-ignored, templates tracked | `.gitignore` `backend/secrets/*` + `!*.example`, `.env.production` ignored | ✅ | `git check-ignore` confirmed |
| 25 | §7 verification: build / non-root / /health=200 / compose config | all PASS (IMPL-VERIFICATION) | ✅ | TA spot-check: `docker compose config` exit 0 |

---

## 3. Deviations from design

| # | Design says | Code does | Severity | Justified? |
|---|-------------|-----------|----------|------------|
| 1 | §4.3 healthcheck via `wget --spider /health` | node built-in http probe (`node -e "require('http').get(...)"`) | Info | ✅ Yes — node:22-slim does not ship `wget`; a wget probe would silently fail. The node probe is dependency-free, hits the same `GET /health`, treats 200 as healthy, and keeps the identical interval/timeout/start-period/retries. Documented as SEC-12. This is a correct fix, not a regression. |
| 2 | §3.4 triggers `branches: [main]` | `branches: [main, master]` | Info | ✅ Yes — harmless superset; repo default branch is `main`, `master` alias is tolerant and does not alter push/tag semantics. |
| 3 | Base/image pinned by tag (TDD body) | pinned by tag **+ sha256 digest** | Info | ✅ Yes — strengthens reproducibility per SECURITY-REVIEW SEC-02; aligned with the security design review that is part of the design inputs. |

All deviations are justified hardening/correctness improvements that preserve the
design intent and the acceptance criteria. None weaken a requirement.

## 4. Added hardening beyond the TDD body (traceable to SECURITY-REVIEW, not scope creep)

read_only root FS + tmpfs (SEC-09), cap_drop ALL + no-new-privileges (SEC-09),
postgres port unpublished (SEC-06/S-1), backend bound to loopback via `PUBLISH_HOST`
(SEC-07), Trivy CRITICAL/HIGH gate (SEC-04), third-party actions pinned by commit
SHA (SEC-13). These close findings from the Phase 3.7 Security Design Review (a
documented design input) and sit squarely within the ticket's hardening objective
(FSD Story 2 / BRD). Not scope creep.

## 5. Missing items

None. Every TDD §7 implementation-checklist item for the three artifacts and the
documentation (Story 4, BUILD-AND-REGISTRY.md) is present. RTM-relevant BRs
(BR-01..BR-23) are satisfied by the artifacts as designed.

## 6. Prerequisite lockfile change

`backend/package-lock.json` was regenerated in an isolated commit (`8d4b173`) to
unblock the hermetic `npm ci` build. Deltas (jose patch, pg minor, knex/sqlite3
newly-declared direct deps, two transitive patch/minor) are all within declared
caret ranges — no major bumps, no intended runtime-behavior change. Correctly
separated from the artifact commit. Acceptable.

---

## Verdict: APPROVED

The implementation conforms to the technical design (TDD v1.0 / FSD v1.1): the
Dockerfile matches the multi-stage / node:22-slim design, docker-compose implements
the specified hardening (secrets, limits, healthcheck, restart) plus security-review
hardening, and the GitHub Actions workflow matches the CI job graph (production
target, semver+SHA tags, CI-secret auth, fail-visible). API/config contracts match
the FSD. Deviations are limited to justified, documented improvements; nothing is
missing and there is no scope creep. Build/runtime verification evidence (image
builds, non-root uid 1001, `/health`=200) is satisfactory and the compose config
spot-check passes.
