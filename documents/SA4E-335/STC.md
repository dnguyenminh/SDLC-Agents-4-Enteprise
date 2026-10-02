# System Test Cases (STC)

## SDLC-Agents-4-Enterprise (Backend) — SA4E-335: Review backend Dockerfile/docker-compose and create CI to build Docker image

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-335 |
| Author | QA Agent |
| Version | 1.2 |
| Date | 2026-10-02 |
| Status | Revised after BA review; v1.2 = TC-INT-06 command amendment (retest iteration 2) — flagged for BA re-review at UAT gate |
| Related STP | STP.md |
| Total Test Cases | 50 (43 functional + 7 doc) |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-01 | QA Agent | Initial 38 test cases across 6 adapted levels (config/static, build, integration, smoke, CI pipeline, security) with full step-by-step detail, data references, and RTM back-links to BRD ACs / FSD BRs. |
| 1.1 | 2026-10-01 | QA Agent | Addressed BA review (STC-BA-REVIEW.md, CHANGES_REQUESTED). Added 5 cases closing all gaps: TC-CFG-08 (BR-03), TC-DOC-07 (BR-07 / UC-01 EF-1), TC-CI-08 (UC-03 EF-2), TC-INT-07 (UC-02 EF-3), TC-CI-09 (UC-03 EF-3). Updated level summary and totals (50 cases). RTM updated to reference the new cases. |
| 1.2 | 2026-10-02 | QA Agent | **TC-INT-06 steps 1/3 amended to explicit invocations** (expected-result semantics unchanged). Step 1 → two-file invocation `docker compose -f docker-compose.yml -f docker-compose.embeddings.yml --profile embeddings up -d`; step 3 → base-only `docker compose -f docker-compose.yml up -d`. Rationale: on Docker Compose v5.2.0 **profiles gate SERVICES only** — the `--profile` flag is invisible to `${...}` interpolation (verified: `docker compose --profile embeddings config` renders the sidecar service but cannot switch a service-level `environment` entry on/off), so `ONNX_RUNTIME_URL` can only be supplied by the overlay file while still satisfying the FSD §12.5 contract "present only when the embeddings profile is active". The single-file `--profile embeddings up -d` wording in v1.1 was therefore not implementable as written. Flagged prominently in TEST-REPORT.md v1.1 for BA re-review at the UAT gate. |

---

## Legend

- **Priority:** High / Medium / Low
- **Type:** Config, Build, Integration, Smoke, CI, Security, Doc
- **Status:** Not Run (default until execution phase)
- **Traces:** BRD acceptance criterion (Sx-ACy) and/or FSD business rule (BR-xx)

---

## Level 1 — Config / Static Validation

### TC-CFG-01 — Dockerfile lints clean and declares SA4E-44 decisions traceably

| Field | Value |
|-------|-------|
| Priority | High |
| Type | Config |
| Traces | S1-AC1, BR-01 |
| Preconditions | `backend/Dockerfile` present; `hadolint` installed |
| Test Data | `testdata/test-data-config-validation.csv` rows CFG-01..CFG-04 |

**Steps:**
1. Run `hadolint backend/Dockerfile`.
2. Confirm each SA4E-44 item (base image, draw.io CLI, cached model, `tree-sitter-jsp` strip, workspaces root) is either present with a build arg/stage or documented as deferred.
3. Cross-check the gap-analysis decision record exists for every item.

**Expected Result:** `hadolint` reports no error-level findings; every SA4E-44 item maps to a recorded decision (adopt/adapt/defer).

---

### TC-CFG-02 — compose defines a backend healthcheck

| Field | Value |
|-------|-------|
| Priority | High |
| Type | Config |
| Traces | S2-AC2, BR-09 |
| Preconditions | Production `backend/docker-compose.yml` present |

**Steps:**
1. Run `docker compose -f backend/docker-compose.yml config`.
2. Inspect the rendered `backend.healthcheck` block.
3. Assert `test` targets `http://localhost:48721/health`, with `interval=30s`, `timeout=5s`, `start_period=10s`, `retries=3`.

**Expected Result:** Backend healthcheck is present and mirrors the Dockerfile `wget /health` contract (TDD §4.3).

---

### TC-CFG-03 — compose defines restart policy on backend and postgres

| Field | Value |
|-------|-------|
| Priority | High |
| Type | Config |
| Traces | S2-AC2, BR-10 |
| Preconditions | Production compose present |

**Steps:**
1. `docker compose -f backend/docker-compose.yml config`.
2. Assert `backend.restart` and `postgres.restart` are set to `unless-stopped` (or `always`).

**Expected Result:** Both services declare a restart policy suitable for unattended operation (closes D-5).

---

### TC-CFG-04 — compose defines CPU/memory resource limits

| Field | Value |
|-------|-------|
| Priority | Medium |
| Type | Config |
| Traces | S2-AC3, BR-11 |
| Preconditions | Production compose present |

**Steps:**
1. Render config with `docker compose config`.
2. Assert `backend.deploy.resources.limits.cpus` and `.memory` are defined and non-empty.
3. Assert the same for `postgres`.

**Expected Result:** CPU and memory limits defined for backend and database (closes D-4).

---

### TC-CFG-05 — Dockerfile preserves non-root user and healthcheck

| Field | Value |
|-------|-------|
| Priority | High |
| Type | Config |
| Traces | S1-AC3, BR-05 |
| Preconditions | `backend/Dockerfile` present |

**Steps:**
1. Grep the `production` stage for `USER sa4e` and a `useradd/addgroup` with uid/gid `1001`.
2. Grep for `HEALTHCHECK ... /health` and `EXPOSE 48721`.

**Expected Result:** `production` (and `development`/`test`) stages switch to `sa4e` (1001); healthcheck and `EXPOSE 48721` present.

---

### TC-CFG-06 — No plaintext credentials in committed compose

| Field | Value |
|-------|-------|
| Priority | High |
| Type | Config |
| Traces | S2-AC1, BR-08 |
| Preconditions | Production compose present |
| Test Data | `testdata/test-data-config-validation.csv` rows CFG-05..CFG-07 |

**Steps:**
1. Grep `backend/docker-compose.yml` for `POSTGRES_PASSWORD:` and `DATABASE_URL:` literal assignments.
2. Confirm credentials use `*_FILE` secret references and a top-level `secrets:` block.

**Expected Result:** No literal password/URL; secrets injected via `*_FILE` (closes D-2).

---

### TC-CFG-07 — Dev `embeddings` profile is guarded and inactive by default

| Field | Value |
|-------|-------|
| Priority | Medium |
| Type | Config |
| Traces | S2-AC5, BR-13 |
| Preconditions | Production compose present |

**Steps:**
1. `docker compose -f backend/docker-compose.yml config` (no profile).
2. Assert `onnx-runtime` is NOT rendered.
3. `docker compose --profile embeddings config` and assert it IS rendered.

**Expected Result:** `onnx-runtime` only appears when the `embeddings` profile is active; production default excludes it.

---

### TC-CFG-08 — `tree-sitter-jsp` stripped for hermetic build; decision recorded (BR-03)

| Field | Value |
|-------|-------|
| Priority | High |
| Type | Config |
| Traces | S1-AC1, BR-03 |
| Preconditions | `backend/Dockerfile` present; gap-analysis decision record present |
| Test Data | `testdata/test-data-config-validation.csv` rows CFG-17..CFG-19 |

**Steps:**
1. Open the SA4E-44 gap-analysis decision record and confirm the `tree-sitter-jsp` item has exactly one recorded decision (adopt / adapt / defer) with a written rationale (consistent with BR-01).
2. **If the decision is adopt/adapt:** grep the Dockerfile build stage for the strip/prune step (e.g., a dependency removal of `tree-sitter-jsp`, or `npm prune`/pruned install that excludes it), and assert the step is present.
3. **If the decision is adopt/adapt:** inspect the `production` image dependency tree (`docker run --rm sa4e-backend:test sh -c "ls node_modules | grep -i tree-sitter-jsp || echo ABSENT"`) and assert `tree-sitter-jsp` is **absent** from the production image.
4. **If the decision is defer:** assert only that the deferral and its rationale are recorded (no strip step is required this iteration).

**Expected Result:** The `tree-sitter-jsp` strip decision is recorded (adopt/adapt/defer with rationale); when the decision is adopt/adapt, the strip step is present in the build stage and the dependency is absent from the `production` image, keeping the build hermetic. The deferral branch requires only the documented decision.

---

### TC-CI-LINT-01 — GitHub Actions workflow lints clean

| Field | Value |
|-------|-------|
| Priority | High |
| Type | Config |
| Traces | S3-AC1, BR-14 |
| Preconditions | `.github/workflows/build-push-backend.yml` present; `actionlint` installed |

**Steps:**
1. Run `actionlint .github/workflows/build-push-backend.yml`.
2. Run `yamllint` on the file.
3. Assert triggers include `push:[main]`, `push:tags:[v*.*.*]`, `pull_request:[main]`.

**Expected Result:** No lint errors; all three triggers declared.

---

### TC-CI-LINT-02 — Tag-derivation logic matches the tag scheme (static)

| Field | Value |
|-------|-------|
| Priority | Medium |
| Type | Config |
| Traces | S3-AC3, BR-16 |
| Preconditions | Workflow present using `docker/metadata-action` |
| Test Data | `testdata/test-data-tag-scheme.csv` |

**Steps:**
1. For each row in `testdata/test-data-tag-scheme.csv`, evaluate the metadata-action tag rules against the input ref/event.
2. Compare produced tags to the expected tags column.

**Expected Result:** Every row's derived tags equal the expected set (sha-<short> always present; semver on tag; latest on main; none-push on PR).

---

## Level 2 — Build

### TC-BUILD-01 — Production image builds on node:22-slim

| Field | Value |
|-------|-------|
| Priority | High |
| Type | Build |
| Traces | S1-AC2, BR-02, BR-15 |
| Preconditions | Docker + Buildx available |

**Steps:**
1. Run `docker buildx build --target production -t sa4e-backend:test backend/`.
2. Confirm exit code 0.
3. `docker image inspect sa4e-backend:test` — confirm base is Debian slim (glibc).

**Expected Result:** `production` image builds successfully from `node:22-slim`.

---

### TC-BUILD-02 — All multi-stage targets build

| Field | Value |
|-------|-------|
| Priority | High |
| Type | Build |
| Traces | S3-AC1, BR-15 |
| Preconditions | Docker + Buildx |

**Steps:**
1. Build each target: `base`, `deps`, `build`, `production`, `development`, `test`.
2. Confirm each returns exit code 0.

**Expected Result:** Every documented target builds without error.

---

### TC-BUILD-03 — Bare build succeeds with default build args

| Field | Value |
|-------|-------|
| Priority | Medium |
| Type | Build |
| Traces | S1-AC1, BR-01 |
| Preconditions | Docker + Buildx |

**Steps:**
1. Run `docker build --target production backend/` with NO `--build-arg`.
2. Confirm success.

**Expected Result:** Default build args (`NODE_VERSION`, `DRAWIO_CLI_VERSION`, `TRANSFORMERS_CACHE`, `EMBEDDING_MODEL`) allow a bare build to succeed.

---

### TC-BUILD-04 — Image size recorded against NFR budget

| Field | Value |
|-------|-------|
| Priority | Medium |
| Type | Build |
| Traces | S1-AC4, BR-06 |
| Preconditions | `production` image built |

**Steps:**
1. `docker image inspect sa4e-backend:test --format '{{.Size}}'`.
2. Compare against the FSD §16 image-size budget.
3. Record delta vs the previous alpine baseline.

**Expected Result:** Image size captured; any budget regression flagged with its trade-off noted (not necessarily a failure, but must be reported).

---

### TC-BUILD-05 — No secret ARG/ENV in build

| Field | Value |
|-------|-------|
| Priority | High |
| Type | Build |
| Traces | S4-AC1, BR-17 |
| Preconditions | `backend/Dockerfile` present |

**Steps:**
1. Grep the Dockerfile for `ARG`/`ENV` names matching `*PASSWORD*`, `*TOKEN*`, `*SECRET*`, `*KEY*`.

**Expected Result:** No credential-bearing build arg or ENV; registry credentials never appear as `ARG`/`ENV`.

---

## Level 3 — Integration

### TC-INT-01 — compose up starts backend + postgres with secret files

| Field | Value |
|-------|-------|
| Priority | High |
| Type | Integration |
| Traces | S2-AC1, BR-08 |
| Preconditions | Dummy `./secrets/postgres_password`, `./secrets/database_url` present |

**Steps:**
1. `docker compose -f backend/docker-compose.yml up -d`.
2. Wait for health; `docker compose ps`.

**Expected Result:** Both services reach healthy/running using secret files; no plaintext credential used.

---

### TC-INT-02 — Backend becomes healthy and reaches postgres

| Field | Value |
|-------|-------|
| Priority | High |
| Type | Integration |
| Traces | S2-AC2, BR-09 |
| Preconditions | Stack up (TC-INT-01) |
| Test Data | `testdata/test-data-healthcheck.csv` |

**Steps:**
1. Confirm `postgres` passes `pg_isready`.
2. Confirm `backend` healthcheck transitions to `healthy` after start-period.
3. Confirm backend connects to postgres (startup logs, no connection error).

**Expected Result:** Backend `healthy`; DB reachable over `sa4e-network`.

---

### TC-INT-03 — Named volume persists postgres data across restart

| Field | Value |
|-------|-------|
| Priority | High |
| Type | Integration |
| Traces | S2-AC4, BR-12 |
| Preconditions | Stack up |

**Steps:**
1. Write a marker row/table into postgres.
2. `docker compose restart postgres` (or `down` without `-v` then `up`).
3. Query the marker.

**Expected Result:** Marker survives; `postgres_data` volume persisted.

---

### TC-INT-04 — Named volume persists code-intel data across restart

| Field | Value |
|-------|-------|
| Priority | Medium |
| Type | Integration |
| Traces | S2-AC4, BR-12 |
| Preconditions | Stack up |

**Steps:**
1. Create a file under `/app/.code-intel` in the backend container.
2. Restart the backend container.
3. Confirm the file is still present.

**Expected Result:** `code_intel_data` volume persists across restart.

---

### TC-INT-05 — Fail-fast on missing secret

| Field | Value |
|-------|-------|
| Priority | High |
| Type | Integration |
| Traces | S2-AC1, BR-08 |
| Preconditions | Remove/rename `./secrets/postgres_password` |

**Steps:**
1. Delete the secret file.
2. `docker compose up` the backend/postgres.

**Expected Result:** Startup fails fast with a clear message naming the missing secret; no plaintext default fallback (UC-02 EF-1).

---

### TC-INT-07 — Missing/unmountable named volume fails startup visibly, no ephemeral fallback (UC-02 EF-3)

| Field | Value |
|-------|-------|
| Priority | Medium |
| Type | Integration |
| Traces | S2-AC4, BR-12 |
| Preconditions | Production compose present; ability to point a named volume at an unmountable/invalid source |

**Steps:**
1. Reconfigure the `postgres_data` (or `code_intel_data`) named volume to reference a missing/unmountable source (e.g., a bind to a non-existent host path, or a volume driver option that cannot mount).
2. Run `docker compose -f backend/docker-compose.yml up` for the affected service.
3. Observe startup behavior and logs.
4. Confirm the service does **not** silently continue writing to an ephemeral container layer.

**Expected Result:** Startup fails visibly with a clear error naming the volume/mount problem; the service does not silently fall back to ephemeral storage (UC-02 EF-3 / BR-12 negative path).

---

### TC-INT-06 — embeddings profile brings up onnx-runtime without weakening prod

| Field | Value |
|-------|-------|
| Priority | Medium |
| Type | Integration |
| Traces | S2-AC5, BR-13 |
| Preconditions | Stack definitions present |

**Steps:**
1. From `backend/`, run the two-file (overlay) invocation: `docker compose -f docker-compose.yml -f docker-compose.embeddings.yml --profile embeddings up -d` — the overlay file supplies `ONNX_RUNTIME_URL` (profiles gate services only, see Revision History v1.2).
2. Confirm `onnx-runtime` runs and `ONNX_RUNTIME_URL` is set for backend.
3. Tear down the profile stack with the same two-file invocation (`... -f docker-compose.yml -f docker-compose.embeddings.yml --profile embeddings down` — a plain `down` does not remove a profile-disabled sidecar container), then run base-only `docker compose -f docker-compose.yml up -d` (no overlay, no profile) and confirm `onnx-runtime` absent and production config unchanged.

**Expected Result:** Profile adds the sidecar on demand; default production run excludes it and is unaffected.

---

## Level 4 — Smoke

### TC-SMOKE-01 — Container starts from the production image

| Field | Value |
|-------|-------|
| Priority | High |
| Type | Smoke |
| Traces | S3-AC1, BR-15 |
| Preconditions | `production` image built; DB reachable or mocked |

**Steps:**
1. `docker run -d -p 48721:48721 --name sa4e-smoke sa4e-backend:test`.
2. `docker ps` — confirm Up.

**Expected Result:** Container starts and stays up (no crash loop).

---

### TC-SMOKE-02 — /health responds 200 on 48721

| Field | Value |
|-------|-------|
| Priority | High |
| Type | Smoke |
| Traces | S2-AC2, BR-09 |
| Preconditions | Container running (TC-SMOKE-01) |
| Test Data | `testdata/test-data-healthcheck.csv` |

**Steps:**
1. `curl -i http://localhost:48721/health`.
2. Assert HTTP 200.

**Expected Result:** `/health` returns 200 on port 48721.

---

### TC-SMOKE-03 — Runtime process is non-root sa4e (uid/gid 1001)

| Field | Value |
|-------|-------|
| Priority | High |
| Type | Smoke |
| Traces | S1-AC3, BR-05 |
| Preconditions | Container running |

**Steps:**
1. `docker exec sa4e-smoke id`.
2. Assert `uid=1001 gid=1001` and user `sa4e`.

**Expected Result:** Process runs as non-root `sa4e` (1001).

---

### TC-SMOKE-04 — Runtime is hermetic (no network fetch at startup)

| Field | Value |
|-------|-------|
| Priority | High |
| Type | Smoke |
| Traces | S1-AC2, BR-04 |
| Preconditions | `production` image built |

**Steps:**
1. `docker run --network none -p 48721:48721 sa4e-backend:test` (DB-independent health path, or point health at liveness).
2. Confirm startup does not attempt to download the embedding model.

**Expected Result:** Server starts offline; model served from `TRANSFORMERS_CACHE`; no runtime network fetch.

---

### TC-SMOKE-05 — onnxruntime-node loads on slim image

| Field | Value |
|-------|-------|
| Priority | High |
| Type | Smoke |
| Traces | S1-AC2, BR-02 |
| Preconditions | `production` image built |

**Steps:**
1. In the running container, invoke the code path (or a one-liner) that `require`s `onnxruntime-node`.
2. Confirm no `GLIBC`/`musl` load error.

**Expected Result:** `onnxruntime-node` loads cleanly (glibc), confirming the slim base-image decision.

---

## Level 5 — CI Pipeline (E2E)

### TC-CI-01 — Workflow triggers on push to main

| Field | Value |
|-------|-------|
| Priority | High |
| Type | CI |
| Traces | S3-AC1, BR-14 |
| Preconditions | Sandbox branch or `act` |

**Steps:**
1. Simulate `push` to `main` (`act push` or sandbox merge).
2. Confirm the `build-and-push` job runs and selects `--target production`.

**Expected Result:** Pipeline runs on merge to main and builds the production target.

---

### TC-CI-02 — Workflow triggers on semver tag

| Field | Value |
|-------|-------|
| Priority | High |
| Type | CI |
| Traces | S3-AC1, BR-14 |
| Preconditions | Sandbox tag `v9.9.9` |
| Test Data | `testdata/test-data-tag-scheme.csv` |

**Steps:**
1. Push a `v*.*.*` tag to the sandbox.
2. Confirm the job runs.

**Expected Result:** Pipeline runs on a semver tag push.

---

### TC-CI-03 — Pushed image carries sha-<short> tag

| Field | Value |
|-------|-------|
| Priority | High |
| Type | CI |
| Traces | S3-AC3, BR-16 |
| Preconditions | Push dry-run to sandbox/local registry |
| Test Data | `testdata/test-data-tag-scheme.csv` |

**Steps:**
1. Run the push on a sandbox commit.
2. Inspect registry tags.

**Expected Result:** Image is tagged `sha-<short>` mapping to the exact commit.

---

### TC-CI-04 — Semver + convenience tags applied on tag build

| Field | Value |
|-------|-------|
| Priority | Medium |
| Type | CI |
| Traces | S3-AC3, BR-16 |
| Preconditions | Sandbox semver tag build |
| Test Data | `testdata/test-data-tag-scheme.csv` |

**Steps:**
1. Build+push on tag `v1.4.0`.
2. Inspect registry tags.

**Expected Result:** Tags `v1.4.0`, `1.4`, `1`, and `sha-<short>` present; `latest` NOT applied from a tag.

---

### TC-CI-05 — Push uses CI secrets only (no committed credential)

| Field | Value |
|-------|-------|
| Priority | High |
| Type | CI |
| Traces | S3-AC2, BR-17 |
| Preconditions | Workflow present |

**Steps:**
1. Grep the repo for any registry credential literal.
2. Confirm login uses `secrets.*` / `GITHUB_TOKEN` via `--password-stdin`.

**Expected Result:** Credentials come only from the CI secret store; nothing committed.

---

### TC-CI-06 — Failed build fails pipeline red (fail-visible)

| Field | Value |
|-------|-------|
| Priority | High |
| Type | CI |
| Traces | S3-AC4, BR-19 |
| Preconditions | Sandbox; a forced build break |

**Steps:**
1. Introduce a build error on a sandbox branch (e.g., bad `COPY`).
2. Run the workflow.

**Expected Result:** Job ends red, no image pushed, failing step surfaced on commit/PR.

---

### TC-CI-07 — PR build is build-only (no push, no secrets)

| Field | Value |
|-------|-------|
| Priority | High |
| Type | CI |
| Traces | S3-AC4, BR-18, BR-19 |
| Preconditions | Sandbox PR to main |

**Steps:**
1. Open a PR against main.
2. Confirm the job builds `production` but `push=false`.
3. Confirm no `docker login` / secret step runs.

**Expected Result:** PR validates the build without pushing or touching push secrets (AD-7).

---

### TC-CI-08 — Registry authentication failure fails red without printing the credential (UC-03 EF-2)

| Field | Value |
|-------|-------|
| Priority | High |
| Type | CI |
| Traces | S3-AC2, S3-AC5, BR-17, BR-18, BR-19 |
| Preconditions | Sandbox workflow run; a deliberately invalid registry credential supplied via the CI secret store |

**Steps:**
1. On a sandbox branch/tag that triggers a push, set the registry credential secret to an invalid value (wrong token/password).
2. Run the workflow so it reaches the `docker login` step.
3. Confirm the login/push step fails and the job ends red.
4. Confirm no image (and no tag) is pushed to the registry.
5. Download the run log and `grep` for the dummy credential value and common secret patterns.

**Expected Result:** Authentication failure aborts the push and fails the pipeline red (surfaced on the commit/PR); no image is pushed; the credential value is **never printed** in the log (masked) — matches UC-03 EF-2 and BR-17/BR-18/BR-19.

---

### TC-CI-09 — Push failure (network/registry error) fails red with no partial success (UC-03 EF-3)

| Field | Value |
|-------|-------|
| Priority | Low |
| Type | CI |
| Traces | S3-AC4, BR-19 |
| Preconditions | Sandbox workflow run authenticated successfully, but the push target is made unreachable (e.g., invalid/unreachable registry host or a registry rejecting the push) |

**Steps:**
1. On a sandbox run, authenticate successfully but point the push at an unreachable or rejecting registry endpoint (network/registry error after login).
2. Run the workflow through the push step.
3. Observe the push step result and the final job status.
4. Inspect the registry for any partially-pushed tag.

**Expected Result:** The push step fails, the registry error is surfaced, and the pipeline ends red; no partial "success" is reported and no complete tag set is left in the registry (UC-03 EF-3 / BR-19).

---

## Level 6 — Security / SIT

### TC-SEC-01 — No secret value in build logs

| Field | Value |
|-------|-------|
| Priority | High |
| Type | Security |
| Traces | S3-AC5, BR-18 |
| Preconditions | A completed CI run log (sandbox) |

**Steps:**
1. Download the workflow run log.
2. `grep` for the known dummy secret value and common patterns.

**Expected Result:** No secret value appears; values masked.

---

### TC-SEC-02 — No secret in image layers

| Field | Value |
|-------|-------|
| Priority | High |
| Type | Security |
| Traces | S3-AC5, BR-18 |
| Preconditions | `production` image built |

**Steps:**
1. `docker history --no-trunc sa4e-backend:test`.
2. `dive sa4e-backend:test` (or export layers) and scan for credential files.

**Expected Result:** No credential file or secret value in any layer.

---

### TC-SEC-03 — Minimal runtime surface + non-root

| Field | Value |
|-------|-------|
| Priority | Medium |
| Type | Security |
| Traces | S1-AC3, BR-05 |
| Preconditions | `production` image built |

**Steps:**
1. Inspect installed packages (`apt list --installed` in container).
2. Confirm only required runtime packages; confirm `USER sa4e`.

**Expected Result:** Minimal package set; runs non-root.

---

### TC-SEC-04 — Secret files are git-ignored

| Field | Value |
|-------|-------|
| Priority | High |
| Type | Security |
| Traces | S2-AC1, BR-08 |
| Preconditions | `.gitignore` present; `./secrets/` referenced by compose (addresses SEC-01) |

**Steps:**
1. Create `./secrets/postgres_password`.
2. Run `git check-ignore ./secrets/postgres_password`.
3. Run `git status --porcelain` and confirm the file is not tracked.

**Expected Result:** `./secrets/*` is git-ignored and never staged (closes SECURITY-REVIEW SEC-01).

---

### TC-SEC-05 — CVE / dependency scan gate present

| Field | Value |
|-------|-------|
| Priority | Medium |
| Type | Security |
| Traces | S3-AC5, BR-18 |
| Preconditions | `production` image built; `trivy` available |

**Steps:**
1. Run `trivy image sa4e-backend:test`.
2. Review Critical/High CVEs.

**Expected Result:** Scan runs and reports; Critical/High findings triaged (recommended CI gate per SEC-04/S-2).

---

### TC-SEC-06 — postgres port not published to host in production

| Field | Value |
|-------|-------|
| Priority | Medium |
| Type | Security |
| Traces | S2-AC1, BR-08 |
| Preconditions | Production compose present |

**Steps:**
1. `docker compose -f backend/docker-compose.yml config`.
2. Confirm `postgres` has no host `ports:` mapping in the production configuration.

**Expected Result:** postgres is reachable only on `sa4e-network`, not published externally (TDD S-1).

---

## Documentation Verification

### TC-DOC-01 — New engineer can build locally from docs

| Field | Value |
|-------|-------|
| Priority | Medium |
| Type | Doc |
| Traces | S4-AC1, BR-21 |

**Steps:** Follow the documented local build commands verbatim and confirm the image builds.
**Expected Result:** Docs are sufficient to build each relevant target locally.

---

### TC-DOC-02 — Gap-analysis decision record documented

| Field | Value |
|-------|-------|
| Priority | Medium |
| Type | Doc |
| Traces | S1-AC1, BR-01 |

**Steps:** Confirm a decision record exists listing adopt/adapt/defer + rationale per SA4E-44 item.
**Expected Result:** Record present and complete.

---

### TC-DOC-03 — Base-image decision + rationale documented

| Field | Value |
|-------|-------|
| Priority | Medium |
| Type | Doc |
| Traces | S1-AC2, S4-AC3, BR-02, BR-22 |

**Steps:** Confirm docs state alpine→slim with the glibc/`onnxruntime-node` justification.
**Expected Result:** Decision + rationale documented.

---

### TC-DOC-04 — Runtime deps + size trade-offs documented

| Field | Value |
|-------|-------|
| Priority | Low |
| Type | Doc |
| Traces | S1-AC4, S4-AC3, BR-06, BR-22 |

**Steps:** Confirm docs list required runtime deps (draw.io CLI, cached model) and note size/build-time trade-offs.
**Expected Result:** Deps and trade-offs documented.

---

### TC-DOC-05 — Registry name + image path + tagging convention documented

| Field | Value |
|-------|-------|
| Priority | Medium |
| Type | Doc |
| Traces | S4-AC2, BR-20, BR-23 |

**Steps:** Confirm docs state the registry (GHCR default), full image path, and the semver+SHA tagging convention.
**Expected Result:** Registry and tagging convention documented.

---

### TC-DOC-06 — Pull instructions documented

| Field | Value |
|-------|-------|
| Priority | Medium |
| Type | Doc |
| Traces | S4-AC2, BR-23 |

**Steps:** Follow the documented `docker pull` command for a released image.
**Expected Result:** A released image can be pulled using the docs alone.

---

### TC-DOC-07 — Unavailable SA4E-44 baseline is blocked/escalated, no fabricated decisions (BR-07 / UC-01 EF-1)

| Field | Value |
|-------|-------|
| Priority | High |
| Type | Doc |
| Traces | S1-AC1, BR-07 |
| Test Data | `testdata/test-data-config-validation.csv` row CFG-20 |

**Steps:**
1. Inspect the gap-analysis decision record / review process evidence for the case where the SA4E-44 proposal reference is unavailable.
2. Confirm that when the baseline is unavailable, the review is recorded as **blocked** with an escalation note (request to obtain the baseline), rather than proceeding.
3. Confirm that **no** adopt/adapt/defer decision is fabricated for any item while the baseline is unavailable (every recorded decision must trace to an available baseline item per BR-01/BR-07).

**Expected Result:** When the SA4E-44 baseline is unavailable the review is recorded as blocked and escalated, and no decisions are fabricated — matching UC-01 EF-1 and BR-07.

---

## Test Case Summary by Level

| Level | Test Cases | Count |
|-------|-----------|-------|
| L1 Config/Static | TC-CFG-01..08, TC-CI-LINT-01..02 | 10 |
| L2 Build | TC-BUILD-01..05 | 5 |
| L3 Integration | TC-INT-01..07 | 7 |
| L4 Smoke | TC-SMOKE-01..05 | 5 |
| L5 CI pipeline | TC-CI-01..09 | 9 |
| L6 Security | TC-SEC-01..06 | 6 |
| Doc verification | TC-DOC-01..07 | 7 (overlaps counted once in RTM) |
| **Total unique** | | **43 functional + 7 doc = 50 cases** |

> Note: The STP headline count of 43 covers L1–L6 technical cases; the 7 TC-DOC cases are documentation-verification cases that also appear in the RTM. All 17 BRD acceptance criteria map to ≥1 case, and all 23 FSD business rules (BR-01..BR-23) — including BR-03 and BR-07 — plus the UC-02 EF-3 and UC-03 EF-2/EF-3 exception flows are now covered (see STP §7 RTM — 100% coverage).

> v1.1 additions (BA review STC-BA-REVIEW.md): TC-CFG-08 (BR-03 tree-sitter-jsp strip + recorded decision), TC-DOC-07 (BR-07 / UC-01 EF-1 blocked-and-escalated baseline), TC-CI-08 (UC-03 EF-2 registry auth failure → red, no credential printed), TC-INT-07 (UC-02 EF-3 missing volume fails visibly), TC-CI-09 (UC-03 EF-3 push failure → red, no partial success).
