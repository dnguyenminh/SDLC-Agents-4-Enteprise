# 🔒 Security Code Review — SA4E-335 (Phase 5.7)

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-335 — Review backend Dockerfile/docker-compose and create CI to build & push the Docker image |
| Phase | 5.7 — Security Code Review (post-implementation, static/SAST + supply-chain) |
| Branch | `SA4E-335` (reviewed `git diff main...SA4E-335`) |
| Reviewed Commits | `70f35f1` (Docker/compose/CI artifacts), `8d4b173` (standalone lockfile prereq), `70d39d6` (build+runtime verify evidence) |
| Reviewed Artifacts | `backend/Dockerfile`, `backend/docker-compose.yml`, `.github/workflows/build-push-backend.yml`, `.gitignore`, `backend/secrets/*.example`, `backend/.env.production.example`, `backend/package-lock.json` |
| Assessor | Security Agent |
| Date | 2026-10-01 |
| Version | 1.0 |
| Scope | Static code review of the committed implementation: hardcoded-secret scan, Dockerfile/compose/CI security, image supply chain, dependency CVEs. No code modified (DEV fixes). No dynamic/pentest (Phase 6.3). |

---

## Executive Summary

SA4E-335 is a **DevOps/containerization + CI ticket** (no application business logic changed). The implementation hardens the backend Docker image, the production `docker-compose`, and adds a GitHub Actions build-and-push workflow for the `production` image target.

This Phase 5.7 review audits the committed code on branch `SA4E-335` and **verifies that every Critical and High finding from the Phase 3.7 Security Design Review (SECURITY-REVIEW.md) has been correctly implemented**, then performs an independent SAST / supply-chain / secret pass over the diff.

**Result: all 2 Critical and all 3 High design findings are resolved in code.** A hardcoded-secret scan of the full diff found **no committed credentials** — only `*.example` templates carrying `CHANGE_ME_PLACEHOLDER`, and `git check-ignore` confirms real secret files are ignored. `npm audit --omit=dev` reports **0 vulnerabilities** across 440 production dependencies. The lockfile diff introduces no `http://` registry URLs and no git-based dependencies.

**Overall Risk Rating: Low.** No unresolved Critical/High findings. Residual items are Medium/Low hardening notes accepted for later phases (deployment review / pentest).

### Severity Summary

| Severity | Count | IDs |
|----------|-------|-----|
| 🔴 Critical | 0 | — |
| 🟠 High | 0 | — |
| 🟡 Medium | 2 | SCR-01, SCR-02 |
| 🔵 Low | 2 | SCR-03, SCR-04 |
| ℹ️ Informational / Verified | 5 | V-01 … V-05 |

### Gate Decision

**APPROVED** — no unresolved Critical or High finding. The 2 Medium + 2 Low items are logged as accepted (tracked for Phase 6.7 deployment-security review); none blocks progression to Testing.

---

## Part A — Verification of Phase 3.7 Design Findings (Critical / High)

Each Critical/High finding from `SECURITY-REVIEW.md` is re-checked against the committed code.

| Design ID | Sev | Requirement | Code Evidence | Status |
|-----------|-----|-------------|---------------|--------|
| **SEC-01** | 🔴 Critical | Secret files MUST be git-ignored; only `*.example` committed | `.gitignore` adds `backend/secrets/*`, `secrets/*`, `/backend/.env.production` with `!*.example` / `!*.example` negations. `git ls-files backend/secrets/*` returns **only** `database_url.example` + `postgres_password.example`. `git check-ignore backend/secrets/postgres_password backend/secrets/database_url backend/.env.production` → all three ignored. | ✅ Resolved |
| **SEC-02** | 🔴 Critical | Pin base images by immutable digest | `Dockerfile` `ARG NODE_BASE_DIGEST=sha256:43ac6c…`; both `FROM node:${NODE_VERSION}-slim@${NODE_BASE_DIGEST}` (base + production). `docker-compose.yml` postgres `pgvector/pgvector:pg16@sha256:ccc6e8…`. | ✅ Resolved (prod paths) |
| **SEC-03** | 🟠 High | Replace plaintext compose creds with `*_FILE` secrets; `NODE_ENV=production`; fail-fast on missing secret | `docker-compose.yml`: `NODE_ENV: production`, `POSTGRES_PASSWORD_FILE: /run/secrets/postgres_password`, `DATABASE_URL_FILE: /run/secrets/database_url`, `secrets:` block file-backed from `./secrets/*`. No plaintext `POSTGRES_PASSWORD`/`DATABASE_URL` literals remain. | ✅ Resolved |
| **SEC-04** | 🟠 High | Required CI CVE/dependency gate (fail on Critical/High) | `build-push-backend.yml` step 6: `aquasecurity/trivy-action` with `exit-code: "1"`, `severity: CRITICAL,HIGH`, `ignore-unfixed: true` on the built image digest. | ✅ Resolved |
| **SEC-05** | 🟠 High | Remove `git`/compilers from the `production` runtime stage | `Dockerfile`: `python3 make g++ git` installed only in `base` (build-time). `production` stage copies pruned `node_modules` + `dist` only; no `apt-get install` in `production`. Runtime verify (IMPL-VERIFICATION.md) confirms `git: not found` at runtime with graceful degrade. | ✅ Resolved |

**All Critical and High design findings are closed in the committed code. No regressions introduced.**

---

## Part B — Independent SAST / Supply-Chain Findings

### B.1 Hardcoded-Secret Scan

Full diff (`git diff main...SA4E-335`) scanned for `password=`, `secret=`, `api_key`, `BEGIN … PRIVATE`, `AKIA…`, `ghp_…`, `token=` (case-insensitive): **no matches.**

- `backend/secrets/database_url.example` → `postgresql://sa4e_user:CHANGE_ME_PLACEHOLDER@postgres:5432/sa4e_db` (placeholder only).
- `backend/secrets/postgres_password.example` → `CHANGE_ME_PLACEHOLDER` (placeholder only).
- `backend/.env.production.example` → non-secret runtime defaults only (`NODE_ENV`, `PORT`, resource limits, `PUBLISH_HOST`).
- CI auth uses `secrets.GITHUB_TOKEN` (ephemeral, GHCR) — no stored static secret.

✅ **No committed credentials. No secret reaches image layers (`ARG`/`ENV` carry no credentials — BR-17) or CI logs.**

### B.2 Dependency CVEs

| Check | Result |
|-------|--------|
| `npm audit --omit=dev` (production tree, 440 deps) | **0** critical / 0 high / 0 moderate / 0 low |
| Lockfile diff `http://` resolved URLs | none (all HTTPS registry) |
| Lockfile diff git/url dependencies | none |
| New locked entries | 58, all registry-resolved with integrity hashes |
| Runtime install hermeticity | `npm ci --omit=dev` (locked, no range resolution) |

✅ No known-vulnerable production dependency; supply chain is lockfile-pinned.

### B.3 Findings Table

| ID | Severity | Category | File | Description | Remediation |
|----|----------|----------|------|-------------|-------------|
| **SCR-01** | 🟡 Medium | Image Supply Chain | `backend/docker-compose.yml` (onnx-runtime) | The optional ONNX sidecar still uses `mcr.microsoft.com/onnxruntime/server:latest` (mutable tag), unlike the digest-pinned node/postgres images. It is guarded behind the `embeddings` profile (dev-only, inactive in production), so it does not enter the production runtime, but a mutable `:latest` tag breaks reproducibility if the profile is ever enabled. | Pin the ONNX image by `tag@sha256:…` like the others when/if the `embeddings` profile is used; keep it out of production. Accepted as Medium since profile is dev-only and off by default. |
| **SCR-02** | 🟡 Medium | Access Control (runtime) | `backend/docker-compose.yml` / app | The MCP Streamable-HTTP endpoint (`:48721`) has no documented authn/authz; mitigated here by binding the published port to loopback (`PUBLISH_HOST` default `127.0.0.1`) and the internal bridge network. Network-level exposure is controlled, but application-layer access control is out of this ticket's scope. | Capture MCP endpoint access control / network segmentation as a deployment-security requirement for Phase 6.7. No code change required in SA4E-335 (port binding mitigates it). Accepted. |
| **SCR-03** | 🔵 Low | Logging / Monitoring | app (Pino) | No explicit Pino secret-redaction paths or MCP tool-execution audit logging in this diff. Out of this containerization ticket's scope, but worth capturing. | Specify Pino redaction keys + MCP tool-invocation audit logging as a monitoring requirement in the deployment review. Accepted (not in scope for SA4E-335). |
| **SCR-04** | 🔵 Low | Image Size / Attack Surface | `backend/Dockerfile` (AD-6) | Draw.io CLI / Electron / X11 / xvfb and model pre-cache (AD-6) remain available behind build args but are **DEFAULT OFF (SEC-08)**, so the default `production` image excludes them. If ever enabled, Chromium/Electron materially enlarges the attack surface. | Keep AD-6 default-off; if diagram export is needed, isolate in a separate image/sidecar rather than the MCP runtime. Already correctly defaulted off — logged for awareness. |

### B.4 Verified Controls (Informational)

| ID | Control | Evidence |
|----|---------|----------|
| V-01 | Non-root runtime (`sa4e` uid/gid 1001) | `Dockerfile` production/development/test stages `groupadd/useradd … USER sa4e`; runtime verify `docker exec id` = uid=1001(sa4e). |
| V-02 | Defense-in-depth container hardening | compose backend: `read_only: true`, `tmpfs: /tmp`, `cap_drop: [ALL]`, `security_opt: [no-new-privileges:true]`; postgres: `no-new-privileges:true`. |
| V-03 | CI least-privilege + fork safety | workflow `permissions: contents:read, packages:write`; registry login + push + Trivy gated `if: github.event_name != 'pull_request'` (fork PRs never see push creds). |
| V-04 | Third-party actions pinned by commit SHA | checkout/metadata-action/setup-buildx/login-action/build-push-action/trivy-action all pinned to full SHA (tag in trailing comment) — SEC-13. |
| V-05 | Build == pushed image; verifiable digest | single `build-push-action` invocation; step 7 fails if `steps.build.outputs.digest` is empty (EF-3). Trivy scans the exact pushed digest. |

---

## Remediation Priority

| Priority | Finding | Blocking? | Effort | Phase |
|----------|---------|-----------|--------|-------|
| — | SCR-01 (ONNX `:latest`) | No (dev-only, off) | Low | 6.7 / when embeddings used |
| — | SCR-02 (MCP access control) | No (loopback-mitigated) | Medium | 6.7 deployment review |
| — | SCR-03 (log redaction/audit) | No (out of scope) | Low | 6.7 deployment review |
| — | SCR-04 (AD-6 Electron) | No (default off) | — | awareness only |

No remediation is required before Testing. All items are accepted Medium/Low tracked for the Phase 6.7 security deployment review.

---

## Appendix — Methodology & Scope Limitations

- **Method:** static review of the committed diff (`git diff main...SA4E-335`) + `git ls-files` / `git check-ignore` secret-tracking verification + regex secret scan over the full diff + `npm audit --omit=dev` on the production dependency tree + lockfile supply-chain inspection. Mapped against OWASP Top 10 A02 (Cryptographic/Secrets), A05 (Security Misconfiguration), A06 (Vulnerable Components), A08 (Software/Data Integrity) and CIS Docker Benchmark container-hardening practices.
- **Not tested:** runtime/dynamic exploitation, actual CI execution, live registry push, running-container scanning — reserved for Phase 6.3 Penetration Testing. Trivy image-scan results are produced by CI at push time, not re-executed here.
- **No fabrication:** every finding/verification references a specific file, commit, or command output. The 0-CVE audit result and the no-committed-secret conclusion are from executed commands (`npm audit`, `git ls-files`, `git check-ignore`, diff grep), not assumptions.
- **Role boundary:** this agent only reports findings; no code was modified. DEV owns any fixes.
