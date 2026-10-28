# User Guide (UG) — Node.js 22.23.4 Security Pin (SA4E-386)

## SA4E-386: Pin Node.js to 22.23.4 to patch CVE-2026-111497 (Brotli RCE) and related highs

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-386 |
| Title | [Security] Pin Node.js to 22.23.4 to patch CVE-2026-111497 (Brotli RCE) and related highs |
| Document Type | User Guide — runtime pin enforcement, local verification, future bumps |
| Author | DEV Agent |
| Version | 1.0 |
| Date | 2026-10-28 |
| Status | Draft |
| Related Documents | BRD v1.0 · FSD v1.3 · TDD v1.1 — `documents/SA4E-386/` |

---

## 1. What This Feature Is

SA4E-386 moves the repository from loose Node.js version declarations (`22.x` / `22`) to a **hard pin on the safe patch release `22.23.4`** across every runtime the project uses: developer machine, CI runner, and production container. The pin removes CVE-2026-111497 (Brotli decoder out-of-bounds write, "Node2Shell" RCE), two High-severity TLS hostname-verification bypasses, and CVE-2026-56846 (HTTP/2 memory growth) from all of those runtimes (FSD §1.1).

There is no UI and no business-logic change: the deliverable is a reproducible, CVE-patched runtime configuration plus verifiable evidence.

## 2. How the Pin Is Enforced — Four Layers

The same version value, `22.23.4`, is declared in four independent layers. All four must agree; CI fails if any drifts.

| # | Layer | Artifact | Enforced value | Mechanism |
|---|-------|----------|----------------|-----------|
| 1 | Local dev | `.nvmrc` | `22.23.4` (+ trailing LF — exactly 8 bytes) | `nvm use` selects the exact patch release |
| 2 | npm | `package.json` and `backend/package.json` `engines.node` | `"22.23.4"` (exact pin) | npm warns on mismatch (`engine-strict=false` — warns, does not block; FSD §13). The root `package-lock.json` mirrors the pin for both workspace entries (root + `backend`), so `npm ci`-based consumers see the same value |
| 3 | Container | `backend/Dockerfile` L32–L35 | `ARG NODE_VERSION=22.23.4` + `ARG NODE_BASE_DIGEST=sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d` | Every `FROM node:${NODE_VERSION}-slim@${NODE_BASE_DIGEST}` stage resolves the immutable multi-arch manifest index — tag-only pulls are impossible (SEC-02). Editable region is exactly L32–L35; everything below is untouched |
| 4 | CI | `.github/workflows/*` | 27 literals of `22.23.4` (+ 1 matrix expression) | Runner setup, Docker builds and release jobs install/verify the pinned release; drift from `.nvmrc`/`engines` fails the build |

> **Note:** third-party dependency engine ranges in `package-lock.json` (e.g. `"node": "20 || >=22"`) are upstream declarations — they are intentionally **not** part of the pin.

## 3. Verify Locally

Run these from the repository root.

**Step 1 — Node version via nvm:**

```bash
nvm install        # reads .nvmrc → installs 22.23.4 if missing
nvm use            # selects 22.23.4 for this shell
node -v            # expected: v22.23.4
```

**Step 2 — Declaration checks (grep):**

```bash
# bash
cat .nvmrc | od -c | head -1          # expected: 32 32 32 . 2 3 . 4 \n  (8 bytes incl. LF)
grep -n '"22.23.4"' package.json backend/package.json package-lock.json
grep -nE 'NODE_VERSION=|NODE_BASE_DIGEST=' backend/Dockerfile
grep -rn '22\.23\.4' .github/workflows/ | wc -l    # expected: >= 27
```

```powershell
# PowerShell
Get-Content .nvmrc                                   # expected: 22.23.4
(Get-Item .nvmrc).Length                             # expected: 8
Select-String -Path package.json, backend/package.json, package-lock.json -Pattern '"22\.23\.4"'
Select-String -Path backend/Dockerfile -Pattern 'NODE_VERSION=|NODE_BASE_DIGEST='
(Select-String -Path .github/workflows/* -Pattern '22\.23\.4' -AllMatches |
  ForEach-Object { $_.Matches.Count } | Measure-Object -Sum).Sum   # expected: >= 27
```

**Step 3 — Container build (pulls by digest, fails closed on the old digest):**

```bash
cd backend
docker build --target production -t sa4e-backend:local .
docker run --rm sa4e-backend:local node -v     # expected: v22.23.4
```

If Docker prints a digest-mismatch or manifest-unknown error, the base digest is stale — see §4.

## 4. Bumping to a Future Patch Version (e.g. 22.23.5)

A future CVE in the 22.x line is fixed by repeating this exact, five-artifact procedure:

1. **Resolve the new digest** (never guess it): `docker buildx imagetools inspect node:22.23.5-slim` — copy the **index** digest (`sha256:…` of the multi-arch manifest list), not a per-platform digest (FSD §13 Docker digest resolution).
2. `.nvmrc` — write `22.23.5` + trailing LF (keep the 8-byte contract).
3. `package.json` + `backend/package.json` — `engines.node` → `"22.23.5"`.
4. `package-lock.json` — update **only** the two root-level `engines` entries (root package object and `backend` package object); never touch third-party ranges.
5. `backend/Dockerfile` L32–L35 — `ARG NODE_VERSION=22.23.5` and the new `NODE_BASE_DIGEST`; update the nearby `node:22.23.4-slim` comments (header line 3 included) so comments match the pin.
6. Workflows — CI matrices/literals reference the pinned release; update any literal that names the old patch, then re-run the §3 verification suite (grep counts must still pass).

## 5. Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `node -v` shows another version | nvm not activated in the shell | Run `nvm use` (add `nvm install` first if the version is missing) |
| npm warns "Unsupported engine" | Shell is not on 22.23.4 | Switch with nvm; the warning is non-fatal by design (`engine-strict=false`) |
| Docker build fails with manifest/digest error | Base digest no longer matches the tag | Re-resolve the digest (§4 step 1) and update L35 |
| Workflow pin count < 27 | A literal was edited/removed | Restore the `22.23.4` literal or re-pin per §4 |
| Third-party range like `"20 \|\| >=22"` flagged | Over-eager grep | Out of scope — only the two root-level `engines` entries are pinned |

## 6. FAQ

**Q: Why an exact pin instead of `22.x`?**
`22.x` floats across patch releases, so a vulnerable patch could be installed after a clean CI run. The exact pin makes every runtime — local, CI, container — bit-identical on the patched release (BRD §1.2).

**Q: Does `engines.node` block installation on the wrong Node?**
No. With `engine-strict=false` (the verified default, FSD §13) npm prints a warning. The hard gates are CI and the Docker digest pin.

**Q: Why pin the Docker base by digest and not by tag?**
Tags are mutable; digests are not. `node:22.23.4-slim@sha256:de170b39…` guarantees the same image bytes on every build (SEC-02, reproducible supply chain).

**Q: What happened to `build-native.yml`?**
Retired by approved scope amendment CR-01 (FSD v1.3): it built `better-sqlite3` prebuilds for a package this repository does not depend on. The workflow and its references are removed; onnxruntime prebuilds (`build-onnxruntime.yml`) are unaffected.

**Q: Where do I look first when a pin check fails?**
Check the four layers in order (§2 table) — the mismatch is almost always one artifact that was missed during a bump.


## 7. Manual Test Procedure (UAT)

This section is the step-by-step manual test procedure for ticket SA4E-386 during UAT. It operationalises the four enforcement layers and the acceptance criteria for a human tester.

### 7.1 Preconditions

- CI on the feature branch / PR is green (class-A workflows).
- Backend image is available in the UAT environment (or built locally: docker build --target production -t sa4e-backend:local .).
- Docker daemon running; backend port 48721; test accounts per BRD.

### 7.2 Manual functional checks

1. Boot the pinned runtime
   - Local: docker run --rm sa4e-backend:local node -v -> expected v22.23.4.
   - UAT: deployed backend reports Node v22.23.4.

2. Health endpoint
   - GET http://127.0.0.1:48721/health -> HTTP 200, body contains status and tools_loaded > 0.

3. MCP handshake
   - JSON-RPC: initialize (protocolVersion 2024-11-05) -> tools/list -> all tools load without native-module error; server runtime reported as v22.23.4.

4. ONNX runtime load
   - docker run --rm sa4e-backend:local node -e "console.log(require('onnxruntime-node/package.json').version)" -> module resolves; ABI compatible with Node 22.

5. Regression smoke
   - Exercise core backend flows through MCP tools; no error caused by the runtime change.

### 7.3 Manual security checks

1. Run Trivy against the built image; assert no new unhandled CRITICAL/HIGH for the four named CVEs.
2. Assert zero references to build-native / better-sqlite3 under .github/workflows/ (AC-08) - already verified locally.

### 7.4 UAT acceptance checklist (AC-01..AC-08)

| AC | Description | Status |
|---|---|---|
| AC-01 | engines exact pin 22.23.4 | Local: PASS |
| AC-02 | .nvmrc 8-byte contract | Local: PASS |
| AC-03 | Docker digest pin | Local: PASS |
| AC-04 | CI literals / census | Local: PASS |
| AC-05 | Runtime install/build under pin | CI/E2E pending |
| AC-06 | PR evidence / rollback statement | Pending SIT-01 |
| AC-07 | Scope allow-list (18 artifacts) | Pending IT-01 |
| AC-08 | No better-sqlite3 references | Local: PASS |

### 7.5 UAT sign-off procedure

1. Tester walks AC-01..AC-08 against the deployed/pinned environment.
2. Any defect -> create defect -> Fix bugs -> DEV fix -> retest -> re-enter UAT.
3. On acceptance -> Phase 7 (Deployment).

### 7.6 Rollback note

Before UAT sign-off, confirm rollback path per TDD section 10.5 (RB-1..RB-4): engines back to 22.x, previous .nvmrc, previous Dockerfile ARGs, workflow literals, restore deleted workflow if needed.

---

