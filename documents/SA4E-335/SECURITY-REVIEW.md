# 🔒 Security Design Review — SA4E-335

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-335 — Review backend Dockerfile/docker-compose and create CI to build the Docker image |
| Phase | 3.7 — Security Design Review (design-stage, pre-implementation) |
| Reviewed Artifacts | `documents/SA4E-335/TDD.md` (v1.0), `documents/SA4E-335/FSD.md` (v1.1), real `backend/Dockerfile`, real `backend/docker-compose.yml`, repo `.gitignore` |
| Assessor | Security Agent |
| Date | 2026-10-01 |
| Version | 1.0 |
| Scope | Design review only — secrets management (CI + compose), non-root runtime, image supply chain, dependency risks, network/port exposure. No code written or modified. |

---

## Executive Summary

This is a **design-stage** security review of the SA4E-335 containerization + CI design. The target artifact is a backend Docker image (`node:22-slim`, Hono + MCP SDK on port 48721), a production `docker-compose` (backend + `pgvector/pgvector:pg16`), and a GitHub Actions build/push workflow.

The **TDD design direction is sound**: it explicitly moves away from the current insecure baseline (plaintext credentials, `NODE_ENV=development`, no resource limits) toward Docker secrets (`*_FILE`), non-root runtime (`sa4e` uid/gid 1001 — already present and preserved), a hermetic build, and CI-secret-only registry auth with log masking. Many controls are correctly specified in TDD §6.

However, the review finds concrete gaps the **design must close before implementation**, driven by comparing the TDD's stated intent against the *actual* `.gitignore` and the *actual* `backend/docker-compose.yml`.

### ⛔ Critical findings the design MUST address before implementation

- **SEC-01 (Critical) — Secret files are NOT git-ignored.** The TDD (§3.3, §6.1) mounts Docker secrets from `./secrets/postgres_password` and `./secrets/database_url`, and TDD finding S-4 asserts "verify secret files are git-ignored." The actual repo `.gitignore` only ignores `.env` / `.env.*` — there is **no** `secrets/` or `backend/secrets/` rule. As designed, the first operator who creates those files can commit plaintext DB credentials. The design must mandate a `.gitignore` entry for the secret directory (and prefer external/injected secrets over on-disk files) as an explicit, verifiable implementation requirement — not a soft note.
- **SEC-02 (Critical) — Base image is pinned only by tag, not by digest.** The design pins the base to `node:22-slim` (a mutable tag). A moving tag breaks the hermetic/reproducible-build guarantee the design claims (BR-03/BR-04) and allows a changed upstream image to enter the supply chain silently. For a reproducible, verifiable supply chain the design must pin the base image by `sha256` digest (`node:22-slim@sha256:...`), with the tag kept as a human-readable comment.

Both are design decisions (not code bugs) and are cheap to fix in the Dockerfile/compose/`.gitignore` design before DEV starts. Everything else is High/Medium/Low and tracked below.

### Severity summary

| Severity | Count | IDs |
|----------|-------|-----|
| 🔴 Critical | 2 | SEC-01, SEC-02 |
| 🟠 High | 3 | SEC-03, SEC-04, SEC-05 |
| 🟡 Medium | 5 | SEC-06, SEC-07, SEC-08, SEC-09, SEC-10 |
| 🔵 Low | 3 | SEC-11, SEC-12, SEC-13 |

**Overall design risk (if findings addressed): Low–Medium. If shipped as-is (current baseline files): High** — because the live `backend/docker-compose.yml` still contains plaintext credentials and `NODE_ENV=development`.

---

## Findings Table

| ID | Severity | Category | Finding | Recommendation |
|----|----------|----------|---------|----------------|
| **SEC-01** | 🔴 Critical | Secrets Management (compose) | TDD §3.3/§6.1 mounts secrets from `./secrets/postgres_password` and `./secrets/database_url`, but the repo `.gitignore` ignores only `.env`/`.env.*` — there is **no** rule for `secrets/` or `backend/secrets/`. Plaintext credentials can be committed. TDD S-4 only "flags" this instead of making it a hard design requirement. | Add a mandatory design requirement: `.gitignore` MUST contain `backend/secrets/` (and `secrets/`). Prefer **externally-injected** Docker secrets (`external: true`) or an orchestrator secret store over on-disk files; if on-disk files are used, create a committed `secrets/.gitkeep` + `*.example` template only, never real values. Make this a verifiable item in the implementation checklist. |
| **SEC-02** | 🔴 Critical | Image Supply Chain | Base image pinned by mutable tag `node:22-slim` only. This defeats the hermetic/reproducible-build claim (BR-03/BR-04): the tag can move to a different, unverified image. Same applies to `pgvector/pgvector:pg16` and `mcr.microsoft.com/onnxruntime/server:latest` (the ONNX image uses `:latest`). | Pin all base images by immutable digest: `node:22-slim@sha256:...` (both `base` and `production` `FROM`), `pgvector/pgvector:pg16@sha256:...`, and replace `onnxruntime/server:latest` with a pinned tag+digest. Keep the readable tag as a comment. Record the digest-update process (e.g., Dependabot/renovate) in the build docs. |
| **SEC-03** | 🟠 High | Secrets Management (compose) | The **current** `backend/docker-compose.yml` ships plaintext `POSTGRES_PASSWORD: sa4e_local_dev_password` and a full plaintext `DATABASE_URL` with embedded credentials, plus `NODE_ENV: development`. The TDD fixes this on paper (D-1, D-2) but the live file is the real attack surface until implementation lands. | Enforce the TDD design in implementation: replace `POSTGRES_PASSWORD`→`POSTGRES_PASSWORD_FILE`, `DATABASE_URL`→`DATABASE_URL_FILE`, `NODE_ENV`→`production`. Rotate `sa4e_local_dev_password` since it has been committed to git history (treat as compromised). Add fail-fast on missing secret (UC-02 EF-1) with no plaintext fallback. |
| **SEC-04** | 🟠 High | Dependency / Supply Chain | No automated dependency/CVE gate in the design. `npm ci --omit=dev` pins versions but nothing scans them. TDD lists Trivy only as an *optional* "Low" hardening item (S-2). The runtime pulls native modules (`onnxruntime-node`) and build tooling (python3/make/g++/git) — a non-trivial CVE surface. | Make an image + dependency vulnerability scan a **required** CI step (Trivy/Grype on the built `production` image, and `npm audit --omit=dev` or `osv-scanner` on the lockfile), failing the build on Critical/High CVEs (with an allow-list for accepted risks). Upgrade S-2 from "Low/optional" to a required gate. |
| **SEC-05** | 🟠 High | Build Toolchain Supply Chain | `git` is installed in the `production` runtime stage (`apk add git` today; `apt-get` after AD-1). A runtime image does not need git; it enlarges the attack surface (arbitrary fetch/exec primitive) and image size, weakening the "minimal runtime surface" claim (TDD §6.3). | Remove `git` from the `production` stage. Install build-only tooling (`python3 make g++ git`) exclusively in `base`/`build` stages (which are discarded from runtime). Verify `onnxruntime-node` and app start without git at runtime. |
| **SEC-06** | 🟡 Medium | Network / Port Exposure | PostgreSQL port is published to the host (`ports: 5432:5432` in the current compose). TDD §6.4/S-1 only notes "verify not published in production." Publishing 5432 exposes the DB to the host network / any binding interface. | Design the production compose to **not** publish the postgres port (remove the `ports:` mapping; rely on the internal `sa4e-network` bridge). If host access is needed for ops, bind to `127.0.0.1:5432:5432` only. Make this a hard checklist item, not a "verify" note. |
| **SEC-07** | 🟡 Medium | Network / Port Exposure | Backend publishes `48721:48721` to all host interfaces (`0.0.0.0`). The MCP server has no documented authn/authz on the Streamable HTTP endpoint in this design, so any host-reachable client can call it. | Bind the published port to the intended interface (`127.0.0.1:48721:48721` if only local, or front with a reverse proxy/network policy). Document that MCP endpoint access control / network segmentation is required at deploy time; capture it as a deployment-security requirement for Phase 6.7. |
| **SEC-08** | 🟡 Medium | Image Supply Chain | AD-6 (conditional-adopt) adds draw.io CLI + Electron + X11/xvfb to the runtime image. TDD S-3 flags this as Medium. Electron/X11 is a large, security-sensitive dependency set (Chromium CVE cadence) that materially enlarges the production attack surface. | Default to **NOT** adopting draw.io/Electron/xvfb in the `production` runtime unless a concrete runtime need exists; if diagram export is required, isolate it in a separate image/stage or a sidecar, not the MCP runtime. Record the adopt/defer decision explicitly (AD-6) with the attack-surface rationale. |
| **SEC-09** | 🟡 Medium | Container Hardening | The design preserves non-root `sa4e` (good) but does not specify defense-in-depth container hardening: no `read_only` root filesystem, no `cap_drop: [ALL]`, no `no-new-privileges`, no `tmpfs` for writable scratch. | Add to the production compose design: `read_only: true` (with explicit `tmpfs`/named-volume mounts for `/app/.code-intel` and any temp paths), `security_opt: [no-new-privileges:true]`, `cap_drop: [ALL]` (add back only required caps). These complement the non-root user with minimal cost. |
| **SEC-10** | 🟡 Medium | Secrets Management (build) | `DATABASE_URL` is composed from a mounted password at runtime, but the design does not forbid build-time secret leakage via `--build-arg` or docker build history. TDD states build args carry no secrets (good) but there is no enforcing control (e.g., `--secret` mounts, no `ENV` of credentials). | Explicitly require build-time secrets (if ever needed) to use BuildKit `--secret` mounts (never `ARG`/`ENV`); add a review/CI check that the built image's `history`/layers contain no credential strings. Keep the "no secret in ARG/ENV/COPY" rule as a verifiable gate. |
| **SEC-11** | 🔵 Low | Logging / Monitoring | Design relies on default runner log level + Pino with "no secret values logged," but there is no explicit secret-redaction control or security-event logging requirement for the MCP tool-execution path (MCP tool invocation audit). | Specify Pino redaction paths for known sensitive keys and require audit logging of MCP tool executions (who/what/when) as a monitoring requirement. Low because out of this ticket's core scope, but worth capturing for the deployment review. |
| **SEC-12** | 🔵 Low | Healthcheck Robustness | Healthcheck uses `wget --spider http://localhost:48721/health`. If the slim runtime trims `wget`, the healthcheck silently fails; also the probe is plain HTTP (acceptable for localhost loopback). | Confirm `wget` (or substitute `node`-based probe / `curl`) exists in the final `node:22-slim` production image; prefer a dependency-free `node -e` fetch probe to avoid relying on a trimmed binary. |
| **SEC-13** | 🔵 Low | CI / Permissions Hygiene | CI job permissions (`contents: read`, `packages: write`) are correct and least-privilege for GHCR. Minor: PR builds from forks should be prevented from accessing push secrets, and the workflow should pin third-party actions by SHA. | Pin all GitHub Actions (`checkout`, `metadata-action`, `setup-buildx`, `login`, `build-push`) to commit SHAs, not floating tags. Confirm `pull_request` builds never receive registry secrets (design already states build-only — enforce via `if:` guard on login/push steps). |

---

## Coverage Against Required Review Areas

| Required Area | Verdict | Key Findings |
|---------------|---------|--------------|
| Secrets management — CI | ✅ Design sound (CI-secret-only, `--password-stdin`, masked, GHCR `GITHUB_TOKEN`) | SEC-10 (build-time secret enforcement), SEC-13 (action pinning) |
| Secrets management — docker-compose | ⚠️ Design intent correct, but gaps | **SEC-01 (Critical)**, SEC-03 (High), SEC-10 |
| Non-root runtime (`sa4e` uid/gid 1001) | ✅ Preserved in production/development/test stages | Hardened further by SEC-09 (read-only FS, cap_drop, no-new-privileges) |
| Image supply chain (pinning, provenance, minimal runtime) | ⚠️ Multi-stage minimal runtime good; pinning weak | **SEC-02 (Critical)**, SEC-05 (High), SEC-08 (Medium) |
| Dependency risks | ⚠️ Pinned via `npm ci` but no CVE gate | SEC-04 (High) |
| Network / port exposure (48721, postgres) | ⚠️ Internal bridge good; host exposure not locked down | SEC-06, SEC-07 (Medium) |

---

## Notes on TDD Self-Identified Findings (§6.5)

The TDD already surfaced S-1..S-4. This review's disposition:

| TDD Item | TDD Severity | This Review | Reason |
|----------|--------------|-------------|--------|
| S-1 (postgres port not published) | Medium | → SEC-06 (keep Medium, make it a **hard** requirement, not a "verify" note) | Current compose actively publishes 5432. |
| S-2 (add Trivy scan) | Low | → **SEC-04 (High), required** | Dependency/CVE gating is a core supply-chain control, not optional. |
| S-3 (draw.io/Electron surface) | Medium | → SEC-08 (Medium, default-defer) | Agreed; add explicit default-off decision. |
| S-4 (secret files git-ignored) | High | → **SEC-01 (Critical)** | `.gitignore` verification confirms the rule is **absent** today → committable plaintext secrets. |

---

## Decision for Pipeline

- **2 Critical findings (SEC-01, SEC-02)** must be addressed in the design/implementation **before** the image is built and pushed. These are low-effort Dockerfile/compose/`.gitignore` changes.
- **3 High findings (SEC-03, SEC-04, SEC-05)** should be fixed during implementation (Phase 5) and verified before testing.
- Medium/Low findings are hardening items to fold into implementation and the Phase 6.7 security deployment review.

Per role boundaries, this agent only **reports** findings. Fixing the design is SA work (TDD update) and fixing the files is DEV/DevOps work.

---

## Appendix — Methodology & Scope Limitations

- **Method:** static review of design documents (TDD, FSD) and the current real `backend/Dockerfile`, `backend/docker-compose.yml`, and repo `.gitignore`. OWASP container/supply-chain best practices (CIS Docker Benchmark, OWASP Top 10 A05 Security Misconfiguration, A06 Vulnerable Components, A08 Software/Data Integrity).
- **Not tested:** runtime/dynamic behavior, actual CI execution, actual registry push, running-container scanning (reserved for Phase 5.7 code review and Phase 6.3 pentest). No image was built or scanned — digest/CVE assertions are design recommendations, not scan results.
- **No fabrication:** every finding references a specific artifact location (TDD section, compose/Dockerfile line, or `.gitignore` content). SEC-01's absence of a `secrets/` ignore rule was verified against the actual `.gitignore`.
