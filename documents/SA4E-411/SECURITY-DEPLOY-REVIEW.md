# 🚀 Security Deployment Review — Phase 6.7

## Document Information

| Field | Value |
|-------|-------|
| Project | SDLC-Agents-4-Enterprise (SA4E-411) |
| Scope | Production deployment security review: Docker, infrastructure, configuration, secrets, runtime hardening |
| Date | 2025-11-15 |
| Assessor | Security Agent |
| Version | 1.0 |

## Executive Summary

The SA4E-411 deployment architecture demonstrates **strong container hardening practices**: multi-stage Docker builds with digest-pinned base images, non-root runtime user, read-only root filesystem, and minimal runtime attack surface. The Docker Compose production configuration uses environment-driven secrets and read-only rootfs with tmpfs for writable directories.

**Critical gaps remain in the application layer** (unfixed authentication/authorization vulnerabilities from SECURITY-REVIEW.md) and **infrastructure hardening** (missing resource limits, Docker secrets, network isolation, CI/CD security gates). The extension's `allowInsecureRemote` setting creates a deployment-time risk if operators enable HTTP for remote backends.

**Overall Deployment Risk Rating: 🟠 High**

| Severity | Count |
|----------|-------|
| 🔴 Critical | 3 |
| 🟠 High | 5 |
| 🟡 Medium | 6 |
| 🔵 Low | 4 |
| ℹ️ Informational | 5 |

---

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PRODUCTION DEPLOYMENT                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐   │
│  │   Load Balancer  │────▶│  Backend Container│────▶│  PostgreSQL      │   │
│  │   (TLS Term.)    │     │  (sa4e:1001)     │     │  (Managed/Ext.)  │   │
│  │                  │     │  read_only: true  │     │                  │   │
│  └──────────────────┘     │  tmpfs: /tmp     │     └──────────────────┘   │
│                           │  tmpfs: .code-intel│                          │
│                           └────────┬───────────┘                          │
│                                    │                                      │
│                           ┌────────┴───────────┐                          │
│                           │  Workspace Mounts  │                          │
│                           │  (RW, per deploy)  │                          │
│                           └────────────────────┘                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Docker Image Security Assessment

### ✅ Strengths (Well Implemented)

| Control | Implementation | Evidence |
|---------|----------------|----------|
| **Base Image Pinning** | SHA256 digest + tag | `node:22.23.4-slim@sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d` |
| **Multi-stage Build** | 7 stages (base, deps, build, mcp-python, production, development, test) | Build tooling never reaches runtime |
| **Non-root User** | `sa4e` (uid/gid 1001), `nologin` shell | `USER sa4e` in production/development/test stages |
| **Read-only Rootfs** | Runtime image designed for `read_only: true` | No writes to `/app` except tmpfs mounts |
| **No Build Tools in Runtime** | git, python3, make, g++ only in base/build stages | `mcp-python` stage has python3-venv + git only |
| **Minimal Python Runtime** | Only `python3` interpreter in production | No pip, no venv tooling, no pandoc |
| **Pinned MCP Child Servers** | Git ref + version pins | `MARKDOWN_EXPORTER_MCP_REF=1429b6a94767a709f7f5119219ca5951042d9d3c` |
| **Transitive Dep Hardening** | setuptools 84.0.0, certifi 2026.10.19, pillow 13.0.0 | Upgraded in venvs post-install |
| **npm CLI Hardened** | npm 11.21.0 with patched brace-expansion/undici | CVE-2026-109383, CVE-2026-87018 fixed |
| **OS Package Updates** | libpcre2-8-0, perl-base, perl-modules-5.36 upgraded | CVE-2026-103111, CVE-2026-13221 fixed |
| **Health Check** | Node-based HTTP (no wget dependency) | `HEALTHCHECK --interval=30s ... node -e "require('http').get..."` |
| **Secrets Not in Image** | Build args used only for versions, not credentials | `ARG` for versions only |

### ⚠️ Concerns

| Issue | Risk | Recommendation |
|-------|------|----------------|
| **npm CLI in Runtime** | Medium | npm remains for sandbox local-mode fallback; consider removing if not needed |
| **Python Venvs World-Executable** | Low | Venvs copied root-owned read-only; non-root can execute but not modify |
| **Model Cache Baked** | Low | `BAKE_EMBEDDING_MODEL=true` bakes ~100MB model; increases image size |
| **No SBOM Generated** | Medium | Add `syft` in CI to generate SBOM (CycloneDX/SPDx) |

---

## Docker Compose Production Security

### Configuration Review (`backend/docker-compose.yml`)

```yaml
services:
  sdlc-agent-4-enterprise:
    build: .
    container_name: sdlc-agent-4-enterprise
    ports:
      - "48721:48721"
    environment:
      - NODE_ENV=production
      - POSTGRES_USER=${POSTGRES_USER}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}  # ⚠️ Plain env var
      - POSTGRES_DB=${POSTGRES_DB}
      - MCP_WORKSPACE_ROOTS=${MCP_WORKSPACE_ROOTS}
    volumes:
      - ${PRIMARY_WORKSPACE}:/workspaces/main:rw
      - ${ORCA_WORKSPACE_1}:/workspaces/wt-1:rw
    read_only: true
    tmpfs:
      - /tmp
      - /usr/src/app/.code-intel
    restart: unless-stopped

  postgres:
    image: postgres:15-alpine
    environment:
      - POSTGRES_USER=${POSTGRES_USER}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}  # ⚠️ Plain env var
      - POSTGRES_DB=${POSTGRES_DB}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    read_only: true
    tmpfs:
      - /tmp
      - /var/run/postgresql
```

### ✅ Strengths

| Control | Status | Notes |
|---------|--------|-------|
| Read-only rootfs | ✅ | Both services |
| tmpfs for writable dirs | ✅ | `/tmp`, `.code-intel`, `/var/run/postgresql` |
| Non-root user | ✅ | Enforced in Dockerfile (`USER sa4e`) |
| Environment-driven config | ✅ | No hardcoded values |
| Workspace mounts explicit | ✅ | Per-deployment configuration |
| Restart policy | ✅ | `unless-stopped` |

### 🔴 Critical Gaps

| Gap | Risk | Remediation |
|-----|------|-------------|
| **Secrets in environment variables** | 🔴 Critical | `POSTGRES_PASSWORD` in plain env — visible in `docker inspect`, `docker compose config`, process list. **Use Docker secrets**: `secrets: [postgres_password]` + `POSTGRES_PASSWORD_FILE=/run/secrets/postgres_password` |
| **No resource limits** | 🔴 Critical | No `deploy.resources.limits` — container can exhaust host CPU/memory. Add: `cpus: '2'`, `memory: 4G` |
| **No network isolation** | 🟠 High | Default bridge network — all containers can communicate. Create custom network: `networks: { backend: { driver: bridge, internal: true } }` |
| **PostgreSQL exposed on host port** | 🟠 High | `ports: ["5432:5432"]` — database accessible from host. Remove for production; use internal network only |
| **No secret for MCP_WORKSPACE_ROOTS** | 🟡 Medium | Workspace paths in env — consider Docker config or secret |
| **No logging driver config** | 🔵 Low | Default json-file — no rotation. Add `logging: { driver: "json-file", options: { max-size: "10m", max-file: "5" } }` |

### 🟡 Medium Gaps

| Gap | Risk | Remediation |
|-----|------|-------------|
| **No health check in compose** | 🟡 Medium | Dockerfile has HEALTHCHECK but compose doesn't reference it. Add `healthcheck:` block or rely on Dockerfile |
| **No init process** | 🟡 Medium | Add `init: true` for proper signal handling |
| **No security_opt** | 🔵 Low | Consider `security_opt: ["no-new-privileges:true"]` |
| **PostgreSQL alpine base** | 🟡 Medium | `postgres:15-alpine` — musl libc; verify compatibility with any native modules |

---

## Runtime Configuration Security

### Environment Variables (Production)

| Variable | Source | Sensitivity | Notes |
|----------|--------|-------------|-------|
| `POSTGRES_USER` | Env/Secret | Medium | Should use Docker secret |
| `POSTGRES_PASSWORD` | Env/Secret | **High** | **Must use Docker secret** |
| `POSTGRES_DB` | Env | Low | |
| `MCP_WORKSPACE_ROOTS` | Env | Medium | Path allowlist — validate on startup |
| `PRIMARY_WORKSPACE` | Env | Medium | Mount source — validate exists |
| `ORCA_WORKSPACE_1` | Env | Medium | Mount source — validate exists |
| `KB_TOKEN_SECRET` | Env/Secret | **High** | JWT signing key — use Docker secret |
| `CODE_INTEL_API_KEY` | Env/Secret | **High** | API key for MCP/tools — use Docker secret |
| `RATE_LIMIT_MAX_RPM` | Env | Low | Rate limit config |
| `TRUST_PROXY` | Env | Medium | Must be `true` behind LB |
| `LLM_*` config | Env/Secret | Medium | LLM credentials — use secrets |
| `ENTRA_*` config | Env/Secret | **High** | SSO secrets — use Docker secrets |

### ✅ Secure Defaults in Code

| Setting | Default | Security Implication |
|---------|---------|---------------------|
| `CODE_INTEL_REQUIRE_AUTH` | `false` | ⚠️ Auth optional by default — **must set `true` in production** |
| `CODE_INTEL_API_KEY` | empty | ⚠️ API key auth disabled by default — **must set in production** |
| `TRUST_PROXY` | `false` | ⚠️ Rate limiter uses 127.0.0.1 — **must set `true` behind LB** |
| `RATE_LIMIT_MAX_RPM` | 6000 (prod) / 10000 (dev) | Reasonable defaults |
| `NODE_ENV` | `production` | ✅ Set in compose |

### 🔴 Critical Production Config Requirements

**Before deployment, these MUST be set:**

```bash
# Required for production security
CODE_INTEL_REQUIRE_AUTH=true
CODE_INTEL_API_KEY=<strong-random-key>
KB_TOKEN_SECRET=<strong-random-64-char-secret>
TRUST_PROXY=true
POSTGRES_PASSWORD=<from Docker secret>
LLM_*_API_KEY=<from Docker secret>
ENTRA_*_SECRET=<from Docker secret>
```

---

## Network Security

### Current State

| Component | Configuration | Risk |
|-----------|---------------|------|
| Backend Port | 48721 (host) | Exposed on host interface |
| PostgreSQL Port | 5432 (host) | **Exposed on host — remove in prod** |
| MCP Wrapper (Extension) | 9181 (localhost) | Local only — OK |
| Inter-container | Default bridge | No isolation |

### Recommended Production Network

```yaml
networks:
  frontend:
    driver: bridge
    # Load balancer → backend
  backend:
    driver: bridge
    internal: true
    # backend ↔ postgres (no external access)

services:
  sdlc-agent-4-enterprise:
    networks: [frontend, backend]
    # ports: []  # No host port — LB connects via frontend network
  
  postgres:
    networks: [backend]
    # ports: []  # No host port
```

### TLS Termination

- **Load Balancer**: Should terminate TLS (certificates managed externally)
- **Backend**: Receives HTTP on 48721; `TRUST_PROXY=true` reads `X-Forwarded-Proto`
- **Extension → Backend**: 
  - Local: HTTP on localhost (extension manages wrapper)
  - Remote: **Must use HTTPS** — extension setting `allowInsecureRemote` defaults to `false` ✅

---

## Secrets Management

### Current Approach

| Secret | Current | Recommended |
|--------|---------|-------------|
| Database Password | `${POSTGRES_PASSWORD}` env | Docker Secret (`postgres_password`) |
| JWT Signing Key | `${KB_TOKEN_SECRET}` env | Docker Secret (`kb_token_secret`) |
| API Key | `${CODE_INTEL_API_KEY}` env | Docker Secret (`api_key`) |
| LLM API Keys | Config/Env | Docker Secret per provider |
| Entra/SSO Secrets | Config/Env | Docker Secret |
| Atlassian/Jira Credentials | VS Code SecretStorage (extension) | Extension-side — OK |

### Docker Secrets Implementation

```yaml
# docker-compose.yml
secrets:
  postgres_password:
    file: ./secrets/postgres_password.txt
  kb_token_secret:
    file: ./secrets/kb_token_secret.txt
  api_key:
    file: ./secrets/api_key.txt

services:
  sdlc-agent-4-enterprise:
    secrets:
      - postgres_password
      - kb_token_secret
      - api_key
    environment:
      - POSTGRES_PASSWORD_FILE=/run/secrets/postgres_password
      - KB_TOKEN_SECRET_FILE=/run/secrets/kb_token_secret
      - CODE_INTEL_API_KEY_FILE=/run/secrets/api_key
```

**Code Changes Required:** Update config loader to read `_FILE` variants.

---

## CI/CD Pipeline Security

### Current State (Inferred)

| Gate | Status | Evidence |
|------|--------|----------|
| Dependency Scan (`npm audit`) | ❌ Not in CI | No GitHub Actions/workflows found |
| Container Scan (Trivy/Grype) | ❌ Not in CI | Dockerfile mentions Trivy gate but no CI config |
| SAST (CodeQL/SonarQube) | ❌ Not in CI | No workflow files |
| Secret Scan (git-secrets/TruffleHog) | ❌ Not in CI | No workflow files |
| Signed Commits | ❌ Not enforced | No branch protection rules visible |
| SBOM Generation | ❌ Not generated | No Syft/CycloneDX in build |
| Image Signing (Cosign) | ❌ Not implemented | No attestation |
| Deployment Approval | ❌ Not automated | Manual process |

### Recommended CI/CD Security Gates

```yaml
# .github/workflows/security.yml
name: Security Gates
on: [push, pull_request]
jobs:
  dependency-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm audit --audit-level=high
      - run: npm audit --audit-level=high --prefix backend
      - run: npm audit --audit-level=high --prefix extension

  container-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build image
        run: docker build --target production -t sa4e-backend:test .
      - name: Trivy scan
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: sa4e-backend:test
          severity: CRITICAL,HIGH
          ignore-unfixed: true
          exit-code: 1

  sast:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: github/codeql-action/init@v3
        with:
          languages: typescript
      - uses: github/codeql-action/analyze@v3

  secret-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - name: TruffleHog
        uses: trufflesecurity/trufflehog@main
        with:
          path: ./
          base: main
          head: HEAD

  sbom:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Generate SBOM
        uses: anchore/sbom-action@v0
        with:
          image: sa4e-backend:test
          format: spdx-json
      - name: Upload SBOM
        uses: actions/upload-artifact@v4
        with:
          name: sbom
          path: sbom.spdx.json
```

---

## Backup & Disaster Recovery

### Current State

| Component | Status | Notes |
|-----------|--------|-------|
| Database Backup | ✅ Script exists | `npm run db:backup` (pg_dump + sqlite) |
| Backup Schedule | ✅ Task Scheduler | `SA4E-PG-Backup` at 02:00 daily |
| Retention | ✅ 7 backups | `backend/backups/` |
| Volume Backup | ⚠️ Manual | `postgres_data` volume not auto-backed up |
| Config Backup | ❌ Not documented | No config backup procedure |
| Restore Test | ❌ Not documented | No restore validation |

### Recommendations

1. **Automate volume backup** — `docker run --rm -v postgres_data:/data -v $(pwd)/backups:/backup alpine tar czf /backup/postgres_data_$(date +%F).tar.gz /data`
2. **Document restore procedure** — Include in DPG/RLN
3. **Test restore quarterly** — Validate backup integrity
4. **Encrypt backups** — Use age/GPG for offsite storage

---

## Monitoring & Incident Response

### Current Logging

| Log Source | Format | Destination | Security Events |
|------------|--------|-------------|-----------------|
| Application (pino) | JSON | stdout | Auth, audit, errors, tool calls |
| Access Logs | Via request-logger middleware | stdout | Method, path, status, IP, user-agent |
| Audit Logs | Database (`audit_log` table) | PostgreSQL | Login, logout, config changes, user mgmt |
| Rate Limit | Headers + logs | stdout | 429 responses |

### Gaps

| Gap | Risk | Recommendation |
|-----|------|----------------|
| **No centralized log aggregation** | 🟠 High | Deploy Loki/Elasticsearch/Fluent Bit |
| **No alerting on security events** | 🟠 High | Alert on: repeated 401/403, 429 spikes, audit log anomalies |
| **No correlation of extension ↔ backend logs** | 🟡 Medium | Shared correlation ID (X-Request-Id) |
| **No WAF/IDS** | 🔵 Low | Consider Cloudflare WAF or ModSecurity for public endpoints |

---

## Compliance Mapping

| Requirement | Status | Evidence |
|-------------|--------|----------|
| **OWASP ASVS 4.0 L1** | ⚠️ Partial | AuthZ gaps (PENT-01 to PENT-08) |
| **OWASP ASVS 4.0 L2** | ❌ Not met | Missing: MFA, crypto agility, secure deployment |
| **NIST 800-53 Rev 5** | ⚠️ Partial | AC-3, AC-6, IA-5, SC-7 gaps |
| **CIS Docker Benchmark** | ✅ Mostly | Non-root, read-only, no privileged, health check |
| **SLSA Level 1** | ❌ Not met | No provenance, no signed artifacts |
| **Supply Chain (EO 14028)** | ⚠️ Partial | Digest pinning ✅, SBOM ❌, signing ❌ |

---

## Deployment Checklist (Pre-Production)

### Application Layer (MUST FIX BEFORE DEPLOY)
- [ ] **Fix PENT-01**: Auth + permission + host validation on `/api/admin/database/test-connection`
- [ ] **Fix PENT-02**: Auth gate on all `/api/index/*` endpoints
- [ ] **Fix PENT-03**: JWT verification in MCP tool execution (`stampUserId`)
- [ ] **Fix PENT-04**: Remove token injection XSS from admin SPA
- [ ] **Fix PENT-05**: Permission check + SSRF blocklist on `/api/admin/llm/test`
- [ ] **Fix PENT-06**: Auth on `/mcp/tools/list`
- [ ] **Fix PENT-07**: `jwtAuth` middleware on `/api/*` webview routes
- [ ] **Fix PENT-08**: Auth + permission on DB migration endpoints
- [ ] **Fix PENT-09**: Change graph sync permission to `KB_WRITE`
- [ ] **Set `CODE_INTEL_REQUIRE_AUTH=true`** in production environment
- [ ] **Set `CODE_INTEL_API_KEY=<strong-key>`** in production environment
- [ ] **Set `KB_TOKEN_SECRET=<strong-64-char-secret>`** in production environment
- [ ] **Set `TRUST_PROXY=true`** in production environment

### Infrastructure Layer (MUST FIX BEFORE DEPLOY)
- [ ] **Move all secrets to Docker Secrets** (DB password, JWT secret, API key, LLM keys, Entra secrets)
- [ ] **Add resource limits** to all containers (CPU, memory)
- [ ] **Remove PostgreSQL host port exposure** (5432)
- [ ] **Create isolated Docker networks** (frontend/internal backend)
- [ ] **Enable `init: true`** on all services
- [ ] **Add `security_opt: ["no-new-privileges:true"]`**
- [ ] **Configure log rotation** (json-file max-size/max-file)

### CI/CD Layer (SHOULD FIX BEFORE DEPLOY)
- [ ] **Add dependency scanning** (`npm audit --audit-level=high`) to CI
- [ ] **Add container scanning** (Trivy CRITICAL/HIGH) to CI
- [ ] **Add SAST** (CodeQL TypeScript) to CI
- [ ] **Add secret scanning** (TruffleHog) to CI
- [ ] **Generate SBOM** (Syft SPDX) in build pipeline
- [ ] **Enforce signed commits** on main branch
- [ ] **Add deployment approval gate** (manual or policy-based)

### Operational Layer (SHOULD FIX BEFORE DEPLOY)
- [ ] **Deploy centralized logging** (Loki/ELK + Fluent Bit)
- [ ] **Create security alerting rules** (auth failures, rate limit, audit anomalies)
- [ ] **Document incident response playbook** for auth bypass, SSRF, XSS
- [ ] **Schedule quarterly penetration test** (third-party)
- [ ] **Document restore procedure** and test quarterly

---

## Risk Acceptance & Residual Risk

| Risk | Current Rating | Acceptance | Mitigation |
|------|----------------|------------|------------|
| Application auth bypasses | 🔴 Critical | **NOT ACCEPTABLE** | Must fix before production |
| Secrets in env vars | 🔴 Critical | **NOT ACCEPTABLE** | Move to Docker secrets |
| No resource limits | 🔴 Critical | **NOT ACCEPTABLE** | Add limits |
| Extension `allowInsecureRemote` | 🟠 High | **ACCEPT WITH CONTROLS** | Default false; document risk; audit config |
| CSP unsafe-inline/eval | 🔵 Low | **ACCEPT** | Required for admin SPA; plan refactor |
| Weak password policy | 🔵 Low | **ACCEPT** | Internal tool; plan strengthening |
| No distributed rate limiting | 🟡 Medium | **ACCEPT FOR SINGLE-INSTANCE** | Document limitation; plan Redis for scale |
| No centralized logging | 🟠 High | **ACCEPT FOR MVP** | Plan for Phase 2 |

---

## Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Security Assessor | Security Agent | 2025-11-15 | ✅ |
| Solution Architect | [SA Agent] | | |
| DevOps Engineer | [DevOps Agent] | | |
| Product Owner | [PO] | | |

> **Note:** This deployment review **blocks production deployment** until all Critical and High severity application-layer vulnerabilities are remediated and infrastructure secrets are moved to Docker Secrets.

---

## Appendix

### A. Files Reviewed
- `backend/Dockerfile` (all stages)
- `backend/docker-compose.yml` (production)
- `backend/docker-compose.*.yml` (dev, test, embeddings, local-kb, sa4e-241)
- `backend/src/config/index.ts` (configuration loader)
- `backend/src/server/middleware/*.ts` (security headers, rate limiter, JWT auth, API key auth)
- `extension/package.json` (extension settings)
- `backend/package.json` (dependencies)

### B. Tools & Methodology
- Dockerfile static analysis (Hadolint patterns)
- Docker Compose security review
- Configuration review (12-factor, secret management)
- CI/CD security gate assessment
- OWASP Docker Security Cheat Sheet
- CIS Docker Benchmark v1.6.0
- NIST SP 800-190 (Container Security)

### C. Scope Limitations
- **Static configuration review only** — no live cluster assessment
- Kubernetes/ECS/Fargate deployment not reviewed (Docker Compose only)
- Cloud provider security (IAM, VPC, Security Groups, KMS) not assessed
- TLS certificate management not reviewed
- Database encryption-at-rest not verified (depends on managed PG config)
- Extension auto-update security not assessed

---

*Report generated by Security Agent — static deployment configuration review*