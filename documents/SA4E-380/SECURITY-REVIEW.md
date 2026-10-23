# 🔒 Security Design Review

## SDLC Agents 4 Enterprise — SA4E-380: Content Proxy for Child MCP Tools

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-380 |
| Document | Security Design Review (Phase 3.7 — Security Design Review of the TDD) |
| Scope reviewed | TDD v1.0 §7 (threats S-1…S-9), §9 (cleanup design OI-14/OI-15), §6 (error contract); FSD v1.0 §7 (Security Requirements), §9 (Error Handling); BRD v1.0 §6 (NFR security rows); as-built source code of the content proxy (backend + extension) used to verify design intent |
| Review type | **Design review** (Phase 3.7). Code was read only to verify that the design intent documented in the TDD matches the implementation. Code-level audit / dynamic testing is Phase 5.7 (out of scope). |
| Assessor | Security Agent |
| Date | 2026-10-23 |
| Version | 1.0 |
| Verdict | **APPROVED WITH FINDINGS** |

---

## 1. Executive Summary

The SA4E-380 content proxy design is **architecturally sound from a security standpoint**. The three trust domains (LLM/agent, extension wrapper, backend + child servers) are kept separated by a coherent set of invariants (I-1…I-7) that were verified against the delivered code, not only against the documents. The core security promises hold: workspace confinement with symlink refusal on both the read and write paths, basename-only name propagation (no host path ever crosses a boundary), strict base64 validation before the child is invoked, a 25 MB cap enforced *before* buffering on all four retrieval paths, a 30 s HTTP timeout, loopback-only binding of the wrapper, zero new tools, zero new secrets, and a dual fail-loud guard (backend + extension) that eliminates the silent-corruption failure mode this ticket exists to close.

The review found **11 findings: 0 Critical, 1 High, 2 Medium, 4 Low, 4 Informational**. No finding invalidates the architecture; none requires a redesign. The single High finding is a **required design amendment before the §9 cleanup feature (OI-14) is implemented**: the backend's local-path artifact reader (`readLocalFile`) is unconfined — it reads *any* regular file ≤ 25 MB on the backend host at a child-supplied path. Today that is a read-only exposure gated on a trusted-child assumption; once OI-14 (delete-after-inline) ships on top of it, the same primitive becomes **read + delete of an arbitrary backend-host file** by a compromised or malicious child server. The design must confine the local retrieval source to the same fixed artifact-output roots the sweep (OI-15) already scans, and the two changes must ship together.

The two Medium findings are the pre-accepted SSRF residual (S-4 — no URL allow-listing, redirects followed to any host) and the absence of both an aggregate multi-artifact size cap and any rate limiting on the execution/fetch paths. Both are acceptable for the current single-operator, loopback, trusted-child deployment, but they become real attack surface the moment a remote or third-party child server is enabled, and the TDD should record the confinement decisions now rather than at scale-out.

**Overall Risk Rating: MEDIUM** (conditional findings gated on child-server trust; strong baseline controls; one destructive-design gap that must be closed before §9 implementation).

### Severity Distribution

| Severity | Count |
|----------|-------|
| 🔴 Critical | 0 |
| 🟠 High | 1 |
| 🟡 Medium | 2 |
| 🔵 Low | 4 |
| ℹ️ Informational | 4 |

---

## 2. Scope and Methodology

### 2.1 What was reviewed

| Artefact | Sections | Purpose |
|----------|----------|---------|
| `documents/SA4E-380/TDD.md` v1.0 | §7 Security Design (S-1…S-9), §9.1 OI-14, §9.2 OI-15, §6 Error Contract, §2 module map | Primary review target — the security design as specified |
| `documents/SA4E-380/FSD.md` v1.0 | §7 Security Requirements, §9.1 Error Handling (E-01…E-11), §3.8 business rules BR-01…BR-22 | Verify requirement-level controls are consistent with the TDD |
| `documents/SA4E-380/BRD.md` v1.0 | §6 NFR (security + cleanup rows), §1.2 item 9 (sweep in scope) | Verify security requirements trace to business commitments |
| `backend/src/modules/orchestration/content-proxy/artifact-source.ts` | all (176 lines) | Retrieval cascade guards (local read, HTTP, data URI) — design-intent verification |
| `backend/src/modules/orchestration/content-proxy/invocation-adapter.ts` | all (57 lines) | Wrapper-mode gate, strict decode, wrapper-only-key stripping |
| `backend/src/modules/orchestration/content-proxy/result-adapter.ts` | all (150 lines) | Host-path stripping, retrieval error, JSON parse of child results |
| `backend/src/modules/orchestration/content-proxy/artifact-name.ts` | all (39 lines) | `safeName` basename-only trust boundary |
| `backend/src/config/ContentProxy.ts` | all (52 lines) | `NON_CONTENT_PARAM`, `MAX_ARTIFACT_BYTES`, overrides |
| `backend/src/modules/orchestration/McpClientManager.ts` | lines 84–126 | `executeToolOnServer` wiring, `readResourceFromClient` |
| `backend/src/server/HttpRouteRegistrar.ts` | lines 60–134 | Middleware stack: auth gates, body limit, rate limiting |
| `backend/src/server/routes/kb-api.ts` | lines 122–169 | `/api/tools/find` + `/api/tools/execute` auth (`jwtAuth`) |
| `extension/src/services/Base64ProxyService.ts` | lines 41, 99–138 | `proxyInput` read-side guards, 25 MB pre-read cap |
| `extension/src/services/Base64ProxyService/output-proxy.ts` | all (175 lines) | Write-side guards, destination resolution, count verification |
| `extension/src/services/PathResolver.ts` | all (191 lines) | Workspace confinement, NUL rejection, containment |
| `extension/src/backend-local-tools/fs-guards.ts` | all (43 lines) | `checkSymlinkGuard` parent-realpath guard |
| `extension/src/services/WrapperServer/wrapper-server.ts` | line 107 | 127.0.0.1 loopback bind verification |
| `extension/src/services/path-format.ts` | all (44 lines) | `sanitizeLogText` (anti log-forging) |

### 2.2 Methodology

- Static design review against the 9-point checklist supplied with the ticket (§3 below).
- Design-intent verification: every mitigation claimed in TDD §7 was traced to the implementing code location; deviations are reported as findings.
- STRIDE-per-trust-boundary analysis (§6).
- OWASP Top 10 (2021) mapping of findings (§4).
- **No dynamic testing, no exploitation, no modification of any code.** This is a design review; runtime/infrastructure behaviour is out of scope.

### 2.3 Limitations

- The trust model "child MCP servers are operator-configured trusted components" is inherited from the platform baseline; findings F-01/F-02 quantify what happens *if that assumption breaks*, but the review does not re-litigate the baseline.
- The draw.io CLI renderer and puppeteer/chrome-devtools conversion stack run outside the content proxy boundary; only their trust relationship to the proxy is assessed (F-10).
- Dependency CVE screening of the child `markdown-exporter` and renderer stack is not possible from this workspace (external systems); no new npm dependencies are introduced by the proxy itself (verified from imports: `node:fs`, `node:path`, `node:url`, global `fetch`).
- Phase 5.7 (code audit) will re-verify every control listed here at implementation level.

---

## 3. Review Checklist Results

| # | Checklist item | Result | Summary |
|---|----------------|--------|---------|
| 1 | Authentication/Authorization design | ✅ Adequate (with notes) | Wrapper binds 127.0.0.1 only; wrapper→backend rides the platform-authenticated channel (`/api/tools/*` behind `jwtAuth`, `/mcp/*` behind `apiKeyAuth`); no new endpoint introduced. Notes: auth is env-gated (F-08); no rate limit on the execution routes (F-03). |
| 2 | Data protection | ⚠️ Findings | Base64 in transit is loopback-plaintext (S-9 residual, F-08); artifact bytes on backend disk persist today → OI-14/OI-15 design closes it, **but the cleanup design must not ship without path confinement (F-01 — High)**; Buffers held in plaintext memory for one call, no zeroization (F-09, Info). |
| 3 | API security | ⚠️ Findings | Strict base64 decode ✅; 25 MB cap on all retrieval paths ✅; workspace resolver + parent-realpath symlink guard on read **and** write ✅ (I-7 verified in code); backend local read is unconfined (F-01); SSRF residual without allow-list (F-02); no rate limiting (F-03); no decoded-size cap on `content_base64` at the backend (F-04). |
| 4 | Injection vectors | ✅ Adequate (with notes) | Child result `JSON.parse` result is object-checked and spread-copied (no prototype pollution — verified); `safeName` basename-only verified; proxy is deliberately format-blind so XML/markdown content is never parsed by the proxy (XXE/converter risks live in the renderer/child — F-10); `NON_CONTENT_PARAM` has small regex gaps (F-07). |
| 5 | Host path disclosure | ✅ Adequate | I-3 verified end-to-end: `safeName` (artifact-name.ts:9-14), `shapeResult` strips `file_path`/`output_path`/`artifacts[].path` (result-adapter.ts:67-104), `retrievalError` uses basenames only (107-116), `sanitizeLogText` strips CRLF/NUL (anti log-forging). E-01/E-02 deliberately echo the *caller's own* workspace path — acceptable. |
| 6 | DoS / resource exhaustion | ⚠️ Findings | 25 MB per artifact enforced pre-buffer on all 4 paths ✅; but no aggregate cap across N multi-artifacts (F-03) and no rate limit on execute/fetch (F-03); sweep is bounded (30 s `maxRunMs`) ✅. |
| 7 | Dependency risks | ✅ Adequate (notes) | No new npm dependencies introduced by the proxy ✅. Child `markdown-exporter` (path-only descriptors, OI-02) and the draw.io/puppeteer renderer remain the highest-risk parse surfaces; renderer trust model documented as F-10. |
| 8 | Secrets | ✅ Adequate | No new secrets (config constants only) ✅; `NON_CONTENT_PARAM` blocks `token/secret/password/*_key` from becoming the content argument ✅ — regex gaps for `apikey/authorization/cookie/session` (F-07, Low). |
| 9 | Cleanup security | ⚠️ Findings | OI-14: delete-after-inline is correctly gated on "buffer fully materialised" and never applied to `readResource` paths ✅ — but delete-by-path has a TOCTOU swap window (F-06) and **inherits the unconfined-read problem (F-01)**. OI-15: fixed scan roots ✅, symlink refusal ✅, bounded run ✅ — but the pattern may match unrelated user files in shared temp roots (F-05). |

Legend: ✅ adequate · ⚠️ findings raised · ❌ changes required

---

## 4. Findings Summary

| ID | Severity | CVSS v3.1 (approx.) | Title | OWASP 2021 | Component | Status |
|----|----------|---------------------|-------|------------|-----------|--------|
| F-01 | 🟠 High | 7.1 (AV:A/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:L) | Unconfined backend local-path artifact read becomes arbitrary **read + delete** once OI-14 ships | A01 Broken Access Control · A04 Insecure Design | `backend/.../content-proxy/artifact-source.ts:113-122` + TDD §9.1 | Open — design amendment required before §9 implementation |
| F-02 | 🟡 Medium | 5.8 (AV:A/AC:L/PR:L/UI:N/S:U/C:L/I:N/A:L) | SSRF via child-supplied artifact URLs — no allow-list, redirects followed to any host (S-4 residual) | A10 SSRF | `artifact-source.ts:145-156` (`fetchHttp`) | Open — accepted residual, hardening recommended |
| F-03 | 🟡 Medium | 5.3 (AV:N/AC:L/PR:L/UI:N/S:U/C:N/I:N/A:L) | No aggregate multi-artifact size cap and no rate limiting on tool execution / artifact fetch | A04 Insecure Design · A05 Security Misconfiguration | `result-adapter.ts:49-65`; `HttpRouteRegistrar.ts:74-103` | Open |
| F-04 | 🔵 Low | 3.7 | No decoded-size cap on `content_base64` at the backend (bounded only by the 100 MB HTTP body limit) — OI-09 | A04 Insecure Design | `invocation-adapter.ts:49-53` | Open |
| F-05 | 🔵 Low | 3.1 | Cleanup sweep pattern may delete unrelated user files in shared temp scan roots | A05 Security Misconfiguration | TDD §9.2 (design) | Open — tighten scan root before implementation |
| F-06 | 🔵 Low | 3.1 | OI-14 delete-by-path TOCTOU (unlink after read without inode/mtime re-verification) | A04 Insecure Design | TDD §9.1 (design) | Open — close in the §9.1 change plan |
| F-07 | 🔵 Low | 2.7 | `NON_CONTENT_PARAM` regex misses `apikey`, `authorization`, `cookie`, `session` argument names | A02 Cryptographic Failures (credential exposure class) | `backend/src/config/ContentProxy.ts:35-36` | Open |
| F-08 | ℹ️ Info | — | Transport trust baseline: wrapper (9183) unauthenticated but loopback-bound; backend auth env-gated; wrapper↔backend hop is plaintext HTTP | A05 Security Misconfiguration | `wrapper-server.ts:107`; `HttpRouteRegistrar.ts:82-100` | Accepted — must be stated in the deployment guide (S-9) |
| F-09 | ℹ️ Info | — | Document/artifact plaintext (Buffer + base64 string) held in memory for the call duration; no zeroization | A02 Cryptographic Failures | `result-adapter.ts:79,97`; `Base64ProxyService.ts:127-128` | Accepted per FSD §7.2 data classification |
| F-10 | ℹ️ Info | — | Renderer/child parse surfaces (draw.io XML, HTML export, headless Chrome) are outside the proxy boundary — proxy is deliberately format-blind | A08 Software and Data Integrity Failures | child `markdown-exporter`, draw.io renderer | Accepted — keep renderer sandboxed/network-isolated |
| F-11 | ℹ️ Info | — | `safeName` permits Windows reserved device names and colon (ADS) names in the artifact file name | A05 Security Misconfiguration | `artifact-name.ts:9-14`; `output-proxy.ts:153-157` | Accepted — optional hardening |

---

## 5. Detailed Findings

### F-01 (High): Unconfined backend local-path artifact read becomes arbitrary read + delete once OI-14 ships

| Attribute | Value |
|-----------|-------|
| Severity | High |
| OWASP | A01:2021 Broken Access Control; A04:2021 Insecure Design |
| CWE | CWE-22 (Path Traversal, backend-side variant — unrestricted read of local resources); CWE-73 (External Control of File Name or Path) |
| CVSS | ≈ 7.1 (precondition: compromised/malicious child server; impact: arbitrary file read **and** deletion on the backend host) |
| Location | `backend/src/modules/orchestration/content-proxy/artifact-source.ts:113-122` (`readLocalFile`), `readLocation` :78-97; TDD §9.1 (OI-14 delete-after-inline) |
| Status | Open — design amendment required before §9 implementation |

**Description.**
TDD §7 S-5 mitigates the symlink vector and TDD §7 S-4 documents the trusted-child assumption, but neither the TDD nor the code confines *where* on the backend filesystem a child-supplied `path` / `file:` location may point. `readLocalFile` accepts any absolute or relative path; the only guards are "is a regular file", "not a symlink", "≤ 25 MB":

```typescript
// artifact-source.ts:113-122 — as built
function readLocalFile(filePath: string): Buffer | null {
  try {
    const stat = fs.lstatSync(filePath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_ARTIFACT_BYTES) return null;
    const buffer = fs.readFileSync(filePath);
    return buffer.length <= MAX_ARTIFACT_BYTES ? buffer : null;
  } catch { return null; }
}
```

A child result declaring `{ "artifacts": [{ "name": "report.pdf", "path": "C:\\Users\\…\\.ssh\\id_rsa" }], … }` causes the backend to read that file and inline its bytes into the response, which the extension then writes into the agent workspace. There is no containment check against a designated artifact-output directory. TDD §9.2 already concedes the correct scope model for the *sweep* ("the directory(ies) configured for child artifact output … never the agent workspace") — but `readLocalFile` itself never enforces that scope.

The severity is escalated from "read-only residual" to **High by the OI-14 design**: §9.1 specifies `fs.unlinkSync(filePath)` after every successful local-path inline. On top of the unconfined read, this yields a **read + destructive-delete primitive** for anything the backend process can access (credentials, `.env`, SQLite DB files, source code). The deletion also destroys evidence of the read.

**Impact.**
- Confidentiality: arbitrary ≤ 25 MB regular-file content of the backend host is delivered into the agent workspace (and from there into the LLM context / exported documents).
- Integrity/availability: with OI-14, the same vector silently deletes the file after reading it.
- Preconditions: a compromised or malicious child MCP server process, or operator misconfiguration that registers an attacker-controlled child. The current deployment (operator-configured stdio children) makes this unlikely, but the platform explicitly plans remote children (streamable HTTP), which widens the exposure.

**Design remediation (must precede or ship together with OI-14).**

```typescript
// artifact-source.ts — confine the local-path source to the artifact-output roots
// (same configured roots the OI-15 sweep already scans; reuse one shared constant)
import { ARTIFACT_OUTPUT_ROOTS } from '../../../config/ContentProxy.js';

function isWithinArtifactRoots(filePath: string): boolean {
  const resolved = path.resolve(filePath);
  return ARTIFACT_OUTPUT_ROOTS.some((root) => isPathWithinRoot(root, resolved)); // mirror extension isPathWithinRoot semantics
}

function readLocalFile(filePath: string): Buffer | null {
  try {
    if (!isWithinArtifactRoots(filePath)) return null;   // NEW — confinement before any fs access
    const stat = fs.lstatSync(filePath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_ARTIFACT_BYTES) return null;
    const buffer = fs.readFileSync(filePath);
    return buffer.length <= MAX_ARTIFACT_BYTES ? buffer : null;
  } catch { return null; }
}
```

1. Define `ARTIFACT_OUTPUT_ROOTS` in `config/ContentProxy.ts` (default: OS temp dir + backend `tmp/` — the same roots as OI-15) and share it between `readLocalFile` and the cleanup sweep.
2. Reject (return `null` → `ARTIFACT_FETCH_FAILED`) any local path outside the roots; the failure stays silent at source level, consistent with the existing "no host-layout disclosure" rule (FSD UC-03 EF-4).
3. Update TDD §7 S-5 and §9.1 to record the confinement as a stated mitigation; add test cases: path inside roots → read+delete OK; path outside roots (e.g. `%USERPROFILE%\\.ssh`) → `ARTIFACT_FETCH_FAILED`, no read, no delete.

**References.**
- CWE-73: https://cwe.mitre.org/data/definitions/73.html
- OWASP A01:2021: https://owasp.org/Top10/A01_2021-Broken_Access_Control/

---

### F-02 (Medium): SSRF via child-supplied artifact URLs — no allow-list, redirects followed to any host

| Attribute | Value |
|-----------|-------|
| Severity | Medium (residual accepted by TDD S-4; hardening recommended before remote children are enabled) |
| OWASP | A10:2021 Server-Side Request Forgery (SSRF) |
| CWE | CWE-918 (SSRF) |
| CVSS | ≈ 5.8 (precondition: child-controlled URL) |
| Location | `backend/src/modules/orchestration/content-proxy/artifact-source.ts:145-156` (`fetchHttp`); dispatch at `readLocation` :80 |
| Status | Open (accepted residual — TDD S-4 "Medium — accepted") |

**Description.**
`fetchHttp` performs `fetch(url, { signal: AbortSignal.timeout(30_000), redirect: 'follow' })` on any `http(s)` URL a child descriptor supplies. The URL is never validated against an allow-list, and the redirect policy means the *final* request may land on a different host than the one checked. The backend therefore issues authenticated-network-position GET requests to arbitrary destinations — internal services, link-local addresses (`169.254.169.254` cloud metadata), admin panels bound to localhost. The 30 s timeout and 25 MB cap bound the *response*, not the *reachability*.

**Evidence.**

```typescript
// artifact-source.ts:145-156 — as built
async function fetchHttp(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000), redirect: 'follow' });
    if (!res.ok) return null;
    const declared = Number(res.headers.get('content-length') ?? '0');
    if (declared > MAX_ARTIFACT_BYTES) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    return buffer.length > 0 && buffer.length <= MAX_ARTIFACT_BYTES ? buffer : null;
  } catch { return null; }
}
```

**Impact.** With a compromised/malicious child (same precondition as F-01): internal network probing, cloud-metadata credential theft (response ≤ 25 MB is inlined into the workspace), and forced requests to internal endpoints. Response bytes are attacker-influenced content written into the workspace — see F-10 for the downstream parse risk.

**Remediation (defense-in-depth; recommended before enabling remote children).**

```typescript
function isAllowedArtifactUrl(url: string): boolean {
  const u = new URL(url);
  if (!['http:', 'https:'].includes(u.protocol)) return false;
  const host = u.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost')) return false;
  if (/^(127\.|10\.|192\.168\.|169\.254\.)/.test(host)) return false;      // loopback / private / link-local
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;                    // 172.16/12
  if (host === '[::1]' || host.endsWith('.internal')) return false;
  return true; // optionally: allow-list of configured artifact hosts
}

async function fetchHttp(url: string): Promise<Buffer | null> {
  try {
    if (!isAllowedArtifactUrl(url)) return null;
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000), redirect: 'manual' });
    if (!res.ok) return null;
    if (res.status >= 300 && res.status < 400) return null; // or re-validate each hop
    // … existing declared/actual size checks unchanged
```

Manual redirect handling (re-validate every hop) closes the redirect-to-internal-host bypass. If redirect-following is kept for compatibility, at minimum re-run `isAllowedArtifactUrl` on `res.url` before reading the body. Record the decision in TDD §7 S-4.

**References.**
- CWE-918: https://cwe.mitre.org/data/definitions/918.html
- OWASP SSRF Prevention Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html

---

### F-03 (Medium): No aggregate multi-artifact size cap and no rate limiting on tool execution / artifact fetch

| Attribute | Value |
|-----------|-------|
| Severity | Medium |
| OWASP | A04:2021 Insecure Design; A05:2021 Security Misconfiguration |
| CWE | CWE-770 (Allocation of Resources Without Limits); CWE-400 (Uncontrolled Resource Consumption) |
| CVSS | ≈ 5.3 |
| Location | `backend/src/modules/orchestration/content-proxy/result-adapter.ts:49-65` (`collectFiles` — unbounded loop); `backend/src/server/HttpRouteRegistrar.ts:74-103` (`rateLimiter` applied only to `/api/admin/*` and `/api/v1/pega/*`); `fetchHttp` (per-request only) |
| Status | Open |

**Description.**
Two compounding gaps:

1. **Aggregate memory.** `collectFiles` loops over all `artifacts[]` descriptors with no total-bytes limit. Each artifact is individually capped at 25 MB, but a result with N descriptors can place **N × 25 MB of Buffers *plus* their ~1.33× base64 stringifications** (`shapeResult` builds `output_base64` for every file, :79/:97) into memory simultaneously before the response is sent. There is no cap on N.
2. **No rate limiting.** The middleware stack applies `rateLimiter` only to `/api/admin/*` and `/api/v1/pega/*`. `/api/tools/execute`, `/api/tools/find`, and `/mcp/tools/call` — the routes that drive the whole retrieval cascade — have authentication but no rate limit. The 30 s HTTP timeout bounds a single fetch, not the number of fetches.

**Impact.** A buggy or hostile agent loop (or an automated caller retrying) can drive sustained memory pressure and outbound fetch volume on the backend host; a single crafted multi-artifact result can spike memory by hundreds of MB. Exploitability is limited in the current single-operator deployment, but the platform exposes these routes to any authenticated identity.

**Remediation.**

```typescript
// result-adapter.ts collectFiles — add an aggregate cap
const MAX_TOTAL_ARTIFACT_BYTES = 2 * MAX_ARTIFACT_BYTES; // e.g. 50 MB per call, config constant

async function collectFiles(artifacts: any[], result: any, deps: ResultAdapterDeps) {
  const files: FetchedArtifact[] = [];
  let total = 0;
  for (const artifact of artifacts) {
    const file = await resolveArtifact(artifact, deps);
    if (!file) continue;
    total += file.buffer.length;
    if (total > MAX_TOTAL_ARTIFACT_BYTES) break;   // stop resolving; treat remaining as unreadable
    files.push(file);
  }
  // … content-block loop subject to the same running total
}
```

1. Add `MAX_TOTAL_ARTIFACT_BYTES` to `config/ContentProxy.ts`; exceed → stop resolving (the existing count semantics of UC-04/OI-07 already handle "fewer payloads than declared" honestly).
2. Apply the platform `rateLimiter` (or a dedicated per-identity limiter) to `/api/tools/*` and `/mcp/tools/call`.
3. Add the aggregate cap to TDD §7 S-3 (which currently reasons per-artifact only) and to BRD §6 capacity row.

**References.**
- CWE-770: https://cwe.mitre.org/data/definitions/770.html

---

### F-04 (Low): No decoded-size cap on `content_base64` at the backend

| Attribute | Value |
|-----------|-------|
| Severity | Low (bounded by the global 100 MB HTTP body limit — `HttpRouteRegistrar.ts:77-80`) |
| OWASP | A04:2021 Insecure Design |
| CWE | CWE-409 (Improper Handling of Highly Compressed Data / size amplification) |
| Location | `backend/src/modules/orchestration/content-proxy/invocation-adapter.ts:27-32, 49-53` |
| Status | Open (tracked as OI-09 in FSD §11.3 / TDD §11 — rated Low there; security impact is memory amplification) |

**Description.**
`decodeBase64Utf8` validates the alphabet/length and decodes without checking the decoded size. The wrapper's 25 MB pre-read cap (FSD NFR-02) only constrains the legitimate path; a direct authenticated caller can POST ~100 MB of base64 (the global `bodyLimit`) which decodes to ~75 MB of UTF-8 that is then forwarded to the child converter. OI-09 records the gap; the security dimension (memory amplification + unbounded child input) justifies closing it in the same change as F-03's aggregate cap.

**Remediation.**

```typescript
// invocation-adapter.ts — inside the contentParam branch
const MAX_ENCODED_CONTENT_BYTES = 34 * 1024 * 1024; // ≈ 25 MB decoded after base64 expansion (+33%)

if (typeof encoded === 'string' && encoded.length > 0) {
  if (encoded.length > MAX_ENCODED_CONTENT_BYTES) {
    return { args: adapted, wrapperMode: true, capability,
             error: 'content_base64 exceeds the 25 MB source limit.' };
  }
  const decoded = decodeBase64Utf8(encoded);
  // …
}
```

---

### F-05 (Low): Cleanup sweep pattern may delete unrelated user files in shared temp scan roots

| Attribute | Value |
|-----------|-------|
| Severity | Low |
| OWASP | A05:2021 Security Misconfiguration |
| CWE | CWE-459 (Incomplete Cleanup) — inverse: over-aggressive cleanup |
| Location | TDD §9.2 (design — OI-15); scan roots "OS temp dir + the backend workspace `tmp/`" |
| Status | Open — tighten the scan root before implementation |

**Description.**
The sweep deletes files older than the TTL whose names start with `export_`/`render_`/`generate_` **and** whose extension appears in the MIME map (which includes `.md`, `.txt`, `.json`, `.html`). Scanning the **OS temp dir** means any user or process on the host that happens to keep a file like `export_report.md` or `generate_notes.json` in its own temp workspace loses that file to the backend's reaper (subject to permissions). The scan roots are fixed (good), the symlink refusal is specified (good), but the root itself is broader than the artifact domain.

**Remediation.** Write child artifacts into a **dedicated subdirectory** (e.g. `%TEMP%\\sa4e-artifacts\\` and backend `tmp/artifacts/`) — configured as `ARTIFACT_OUTPUT_ROOTS` from F-01 — and scan only that directory. This simultaneously narrows F-01's confinement surface and removes the false-positive deletions; also add the "age > TTL ∧ mtime stable across two ticks" refinement if churn is a concern. Sweep logging already uses basenames only (I-3) ✅.

---

### F-06 (Low): OI-14 delete-by-path TOCTOU (unlink after read without re-verification)

| Attribute | Value |
|-----------|-------|
| Severity | Low |
| OWASP | A04:2021 Insecure Design |
| CWE | CWE-367 (Time-of-check Time-of-use Race Condition) |
| Location | TDD §9.1 (design — `fs.unlinkSync(filePath)` after `readFileSync`) |
| Status | Open — close in the §9.1 change plan |

**Description.**
The design unlinks the artifact **by path** after the buffer is materialised. Between the read and the unlink, another process (or a failed concurrent invocation) can replace the file at the same path — the backend then deletes a file it never read (deleting a *fresh, valid* artifact produced by a concurrent call). Impact is confined to the artifact-output directory (post-F-01/F-05 confinement), so this is a correctness/DoS nuisance rather than an escalation; it matters because §9.1 promises "a failed read never deletes anything" — that promise holds for the *read*, not for the *identity* of the file deleted.

**Remediation.** Verify identity before delete, or delete by handle:

```typescript
// Option A — stat identity check (portable, simple)
const before = fs.lstatSync(filePath);          // already taken for the read
const buffer = fs.readFileSync(filePath);
const after = fs.lstatSync(filePath);
if (after.ino === before.ino && after.mtimeMs === before.mtimeMs && after.size === before.size) {
  fs.unlinkSync(filePath);                       // ENOENT → treated as success per design
} else {
  log.warn({ artifact: path.basename(filePath) }, 'artifact changed during read; skipped cleanup');
}
// Option B — open the file first, fstat + read via the fd, then fs.closeSync + fs.unlinkSync on the same path
// (still path-based on Windows; option A is the pragmatic choice cross-platform)
```

Also specify the concurrent-invocation story: two wrapper calls racing on the same child artifact path (child reuses a fixed output filename) — first call reads+deletes, second call's local read returns ENOENT → falls through to `readResource`/`ARTIFACT_FETCH_FAILED`. The fail-loud contract already makes this observable, but the TDD should state it (one sentence in §9.1) so QA adds the race case.

---

### F-07 (Low): `NON_CONTENT_PARAM` regex misses `apikey`, `authorization`, `cookie`, `session`

| Attribute | Value |
|-----------|-------|
| Severity | Low |
| OWASP | A02:2021 Cryptographic Failures (credential-exposure class); A04:2021 |
| CWE | CWE-200 (Exposure of Sensitive Information) |
| Location | `backend/src/config/ContentProxy.ts:35-36` |
| Status | Open |

**Description.**
`NON_CONTENT_PARAM` reliably blocks `token`, `secret`, `password`, `*_key`, `*_id`, etc. from being selected as the document content argument — the exfiltration channel S-6 warns about. Gaps in the pattern:

- `apikey` / `api_key`: `api_key` matches `.*_key` ✅, but `apikey` (no separator) does **not** match any alternative.
- `authorization`, `cookie`, `session`, `credential`: none match.

**Exploitability.** Narrow: the regex only governs the *single-required-string fallback* of BR-03 — a tool would have to declare exactly one required string argument named `apikey` (etc.), match the file-output convention, and be invoked in wrapper mode. The 9 fixed aliases (`markdown/content/html/xml/text/body/source/template`) contain none of these names, so the alias path is safe. Residual risk is low but the fix is one line.

**Remediation.**

```typescript
export const NON_CONTENT_PARAM =
  /^(content_base64|.*_base64|file_path|.*_path|path|url|uri|dir|.*_id|id|name|.*_name|key|.*_key|apikey|api_key|token|secret|password|credential|authorization|cookie|session|mime|.*_type|type|format|mode|encoding)$/i;
```

---

### F-08 (Informational): Transport trust baseline — loopback-only wrapper, env-gated backend auth, plaintext wrapper↔backend hop

| Attribute | Value |
|-----------|-------|
| Severity | Informational (deployment documentation requirement; matches TDD S-9 residual) |
| OWASP | A05:2021 Security Misconfiguration |
| Location | `extension/src/services/WrapperServer/wrapper-server.ts:107` (bind `127.0.0.1` ✅); `backend/src/server/HttpRouteRegistrar.ts:82-100` (auth gates); `kb-api.ts:125` (`api.use('*', jwtAuth)`) |
| Status | Accepted — must be restated in the Deployment Guide |

**Description.**
Verified in code: the wrapper binds `127.0.0.1` only (no unauthenticated network exposure), and the wrapper→backend channel rides the platform's authenticated routes — `/api/tools/find` + `/api/tools/execute` behind `jwtAuth`, `/mcp/tools/call` behind `apiKeyAuth`. The content proxy introduces **no new endpoint**, so no new auth surface exists. Two baseline caveats to carry into the deployment guide (DevOps phase):

1. Both `jwtAuth` and `apiKeyAuth` are **env-gated** (anonymous allowed when `CODE_INTEL_REQUIRE_AUTH` / the API-key env is unset, per SA4E-217/SA4E-241 dev-mode behaviour). Production deployments must set them; otherwise the retrieval cascade (file read → child → fetch) is reachable by any loopback process.
2. The wrapper↔backend hop is plaintext HTTP over loopback (TDD S-9). For the current same-host deployment this is acceptable; any non-loopback deployment (remote backend) **requires TLS**, and F-02's URL allow-listing becomes mandatory rather than recommended.

---

### F-09 (Informational): Plaintext Buffers and base64 strings in memory; no zeroization

| Attribute | Value |
|-----------|-------|
| Severity | Informational |
| OWASP | A02:2021 Cryptographic Failures |
| Location | `result-adapter.ts:79,97` (buffer → base64 string), `Base64ProxyService.ts:127-128` (source file → base64), `invocation-adapter.ts:52` (decoded content) |
| Status | Accepted (consistent with FSD §7.2 classification "held in memory for one call") |

**Description.**
Source documents and artifact bytes exist as plaintext `Buffer`s and base64 strings for the duration of a call and are released by GC; multi-file calls hold all payloads simultaneously (see F-03 for the aggregate cap). Buffers are never zero-filled, and `JSON.stringify` creates transient copies. For workspace-generated business documents this matches the documented data classification (Confidential, in-memory per call, never logged — FSD §7.4 "Not logged" list ✅). No change requested; recorded so the Phase 5.7 code audit checks the "not logged" claims (e.g., request loggers must not capture `content_base64`/`output_base64` argument values).

---

### F-10 (Informational): Renderer/child parse surfaces are outside the proxy boundary

| Attribute | Value |
|-----------|-------|
| Severity | Informational |
| OWASP | A08:2021 Software and Data Integrity Failures |
| Location | child `markdown-exporter` (DOCX/XLSX/PPTX/PDF/HTML/JSON converters); draw.io CLI renderer + puppeteer/chrome-devtools fallback (extension-side, wrapper-native tools) |
| Status | Accepted — trust model must be documented; keep renderer sandboxed |

**Description.**
The proxy is deliberately **format-blind**: it never parses, sanitizes, or validates document content (P-1/P-6, BR-20). Consequently every content-level parse risk lives in the converters:

- **drawio XML / XXE**: if the draw.io renderer's XML parser has external entity resolution enabled, a malicious workspace `.drawio` file can trigger file reads or SSRF from the renderer host. This is a renderer configuration concern (disable DTD/external entities), not fixable in the proxy — and the proxy must **not** grow content-inspection logic in response.
- **export_html → stored XSS**: a workspace markdown containing scripts converts to an HTML document in the workspace. If that file is later served by a web server, it is stored XSS in the *serving* context. The content originates from the agent's own workspace (same trust domain), so the proxy accepts it; downstream consumers must serve workspace HTML with a restrictive `Content-Security-Policy` / `Content-Disposition: attachment`.
- **markdown → DOCX converter**: embedded-image/base64 handling is the child's responsibility; malformed content is expected to fail loudly (BR-18 pass-through) — the fail-loud contract already prevents "corrupt document reported as success".

**Recommendation.** Record the renderer trust model in the TDD §7 (one row: "converter/renderer parse surfaces — trusted components; sandbox + no-network for headless Chrome; XXE-safe XML parser config"). This is the correct defense-in-depth split: the proxy guards **paths, sizes, and names**; the renderer guards **content parsing**.

---

### F-11 (Informational): `safeName` permits Windows reserved device names and ADS colon names

| Attribute | Value |
|-----------|-------|
| Severity | Informational |
| OWASP | A05:2021 Security Misconfiguration |
| CWE | CWE-436 (Interpretation Conflict) |
| Location | `artifact-name.ts:9-14`; `output-proxy.ts:153-157` (`suggestedFileName`) |
| Status | Accepted — optional hardening |

**Description.**
`safeName` correctly reduces to `path.basename` and rejects `.`/`..`/empty — traversal is impossible (and every write additionally passes `resolveWorkspacePath` + `checkSymlinkGuard`, so containment does not depend on the name at all). Edge cases that remain: Windows reserved device names (`CON`, `PRN`, `NUL`, `COM1`…) and colon-bearing names (`file:stream` → NTFS alternate data stream) survive basename. Both stay inside the workspace; impact is limited to odd file behaviour or a failed write (which surfaces loudly as `PROXY_WRITE_FAILED`). Optional hardening: reject `/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i` and names containing `: ` in `safeName`/`suggestedFileName`, falling back to the MIME-map name.

---

## 6. Threat Model Summary (STRIDE)

Trust boundaries: **(1)** LLM ↔ Extension Wrapper (port 9183, loopback) · **(2)** Wrapper ↔ Backend REST (authenticated platform routes) · **(3)** Backend ↔ Child MCP server (stdio / streamable HTTP) · **(4)** Backend/Wrapper ↔ Filesystem (workspace; backend host FS) · **(5)** Backend ↔ Artifact sources (http(s), `data:`, MCP resources).

| Threat | Boundary | Vector (this capability) | Design control | Residual / Finding |
|--------|----------|--------------------------|----------------|--------------------|
| **S**poofing | 2 | Unauthenticated caller impersonating the wrapper | Platform `jwtAuth`/`apiKeyAuth`; loopback bind | Env-gated auth must be on in prod (F-08) |
| **T**ampering | 4 | Agent-supplied `file_path`/`output_path` escaping the workspace | `resolveWorkspacePath` + parent-realpath `checkSymlinkGuard` on read **and** write; NUL rejection | Verified ✅ (I-7); TOCTOU on guard→write window is local-user-only (accepted) |
| **R**epudiation | 2/3 | Denying a proxied export happened | `executeToolOnServer` logs `{toolName, serverName, wrapperMode}` info; write failures logged warn | ✅ adequate (FSD §7.4); ensure payloads never logged (F-09 note) |
| **I**nformation Disclosure | 3→4 | Child-supplied local path read on backend host | Regular-file-only + symlink refusal + 25 MB cap — but **no directory confinement** | **F-01 (High)**; child-result host paths stripped end-to-end ✅ (I-3 verified) |
| **I**nformation Disclosure | 5 | Backend fetches attacker-chosen URLs | 30 s abort + declared/actual size caps; trusted-child assumption | **F-02 (Medium)** — add allow-list / private-range block |
| **I**nformation Disclosure | 2 | Credentials routed through the content argument | `NON_CONTENT_PARAM` exclusion | Small regex gaps (F-07, Low) |
| **D**enial of Service | 2/4/5 | Oversized payloads, artifact storms, fetch floods | 25 MB per artifact pre-buffer; 30 s fetch timeout; 100 MB body limit; (§9) 30 s bounded sweep | **F-03 (Medium)** aggregate cap + rate limiting; F-04 (Low) decode cap |
| **E**levation of Privilege | 3→4 | Compromised child directing backend FS reads/deletes | None beyond S-5 symlink refusal | **F-01 (High)** — confinement + OI-14 identity-checked delete (F-06) |
| **E**levation of Privilege | 4 | Artifact write overwriting arbitrary files | Write confinement + count verification; names basename-only | ✅ verified (I-7, BR-16); Windows reserved-name edge (F-11, Info) |

---

## 7. TDD §7 Design Threat Coverage Assessment (S-1…S-9)

| # | TDD threat | TDD residual | Review verdict |
|---|------------|--------------|----------------|
| S-1 | Workspace escape via source/output path | Low | ✅ **Confirmed** — resolver + parent-realpath guard verified on both read (`Base64ProxyService.ts:106-113`) and write (`output-proxy.ts:59-64`); cwd-fallback relative rejection present (`PathResolver.ts:130-144`). |
| S-2 | Host filesystem disclosure | Low | ✅ **Confirmed** — `safeName`, `shapeResult` stripping, `retrievalError` basenames verified in code. |
| S-3 | Oversized artifact memory exhaustion | Low | ✅ per-artifact; ⚠️ **no aggregate cap** (F-03) — extend the threat row. |
| S-4 | SSRF via artifact URL | Medium — accepted | ⚠️ **Agreed, with hardening condition** — allow-list/private-range block required before remote children (F-02). |
| S-5 | Symlink trick on local artifact read | Low | ✅ Confirmed (`lstatSync` + `isSymbolicLink`); ⚠️ confinement gap remains (F-01). |
| S-6 | Credential exfiltration via content detection | Low | ✅ Confirmed with regex gaps (F-07). |
| S-7 | Corrupted-payload silent success | Low | ✅ Confirmed — strict decode verified; note OI-03 (invalid UTF-8 → U+FFFD) is a data-integrity acceptance, not a security regression; the child's converter still sees deterministic input and errors pass through loudly. |
| S-8 | Stale artifact files on backend host | Addressed by OI-14/OI-15 | ⚠️ Design closes the exposure window **conditionally**: implement only together with F-01 confinement + F-06 identity-checked delete + F-05 dedicated scan root. |
| S-9 | Base64 payload interception in transit | Low — document TLS | ✅ Agreed (F-08) — restate in the Deployment Guide. |

**Conclusion on S-1…S-9:** 6 of 9 residuals confirmed as stated; S-3, S-5, S-8 need amendments recorded above. No design threat is unmitigated in a way the TDD does not acknowledge — the amendments are additive.

---

## 8. Positive Security Observations (compensating controls verified)

1. **Dual independent fail-loud guards** — backend `retrievalError` (`result-adapter.ts:39-41`) and extension `missingPayload` (`output-proxy.ts:99-111`) make "declared artifact, no bytes" unsatisfiable as a silent success; this is the correct anti-corruption shape and both were verified in code.
2. **Host-path hygiene is end-to-end and code-verified** — `shapeResult` deletes `file_path`/`output_path`/`outputs`, rebuilds `artifacts[]` to metadata only; errors embed basenames only; `sanitizeLogText` neutralises log-forging (CRLF/NUL).
3. **Write confinement does not depend on the child's name** — even a hostile `file_name` cannot place a file outside the workspace because every write re-resolves and parent-realpaths (defense in depth: `safeName` *and* resolver *and* symlink guard).
4. **Child result parsing is pollution-safe** — `parseJsonText` accepts plain objects only, and object-spread copies own enumerable properties without invoking setters (no prototype pollution channel from `__proto__`-keyed child JSON).
5. **Zero new tools, zero new secrets, zero new endpoints** — the capability adds no auth surface, no credential storage, no persistent state (FSD §4.1 stateless design).
6. **Pre-buffer caps on all four retrieval paths** (inline, local `lstat`, HTTP content-length + actual, `data:`) — the memory-exhaustion class is bounded per artifact before buffering.
7. **Wrapper loopback binding verified** (`127.0.0.1`, wrapper-server.ts:107) — no network exposure of the unauthenticated wrapper.

---

## 9. Remediation Priority

| Priority | Finding | Action | Effort | Impact |
|----------|---------|--------|--------|--------|
| 1 | **F-01** | Add `ARTIFACT_OUTPUT_ROOTS` confinement to `readLocalFile`; **gate OI-14 implementation on it**; update TDD §7 S-5 / §9.1 | Low (one constant + one check + tests) | Closes arbitrary read+delete primitive on the backend host |
| 2 | **F-03** | Aggregate `MAX_TOTAL_ARTIFACT_BYTES` in `collectFiles`; rate-limit `/api/tools/*` + `/mcp/tools/call` | Low–Medium | Removes memory/fetch exhaustion class |
| 3 | **F-02** | URL validation (`isAllowedArtifactUrl`), manual redirects with per-hop revalidation; mandatory before remote children | Medium | Blocks SSRF to internal networks/metadata |
| 4 | **F-06 + F-05** | §9.1: identity-checked unlink (stat compare); §9.2: dedicated artifact subdirectory as scan root | Low | Makes cleanup race-safe and prevents foreign-file deletion |
| 5 | **F-04** | Decoded-size cap on `content_base64` in `adaptInvocation` | Low | Bounds memory amplification per call |
| 6 | **F-07** | Extend `NON_CONTENT_PARAM` (`apikey`, `authorization`, `cookie`, `session`) | Trivial | Closes credential-argument edge |
| 7 | **F-08 / F-10 / F-11** | Deployment-guide statements (auth env, TLS for remote backend); renderer sandbox row in TDD §7; optional `safeName` hardening | Documentation (+trivial code for F-11) | Operational assurance |

### Immediate Actions (before/with §9 implementation — High)
1. Implement F-01 confinement and the OI-14/OI-15 changes **as one change set**; do not ship delete-after-inline against the unconfined reader.
2. Extend TDD §7 with the amended S-3/S-5/S-8 rows and the renderer trust-model row (F-10).

### Short-term Improvements (Medium)
1. F-03 aggregate cap + rate limiting on the execution routes.
2. F-02 URL validation with manual-redirect revalidation.

### Long-term Hardening (Low/Informational)
1. F-04, F-05, F-06, F-07 refinements as listed.
2. Phase 5.7 code audit: verify the "payloads never logged" claims (F-09), the Windows name edge (F-11), and re-run this checklist against the merged code.

---

## 10. Sign-Off

| Role | Name / Agent | Verdict | Date |
|------|--------------|---------|------|
| Security review (Phase 3.7) | Security Agent | **APPROVED WITH FINDINGS** — design approved for implementation contingent on Priority 1 (F-01 confinement shipped together with OI-14/OI-15) and Priority 2–3 scheduled | 2026-10-23 |
| Solution Architect (TDD owner) | SA Agent | Pending — incorporate F-01…F-07 amendments into TDD §7/§9 | — |
| DEV (implementer) | DEV Agent | Pending — implement §9 per amended design; keep invariants I-1…I-7 intact | — |
| QA | QA Agent | Pending — extend STC with: out-of-root local path → `ARTIFACT_FETCH_FAILED` (no read, no delete); aggregate-cap case; sweep foreign-file case; unlink race case | — |
| Product Owner | Duc Nguyen Minh | Pending | — |

**Approval conditions (binding):**
1. OI-14 (immediate cleanup) MUST NOT be implemented without the F-01 path confinement in the same change.
2. OI-15 sweep MUST scan only the dedicated artifact-output subdirectory (F-05), never the raw OS temp root.
3. F-02 hardening MUST be completed before any remote (streamable-HTTP) child server is enabled in a deployment where the backend can reach internal networks.

---

## Appendix A — Files Reviewed (evidence base)

| File | Role in review |
|------|----------------|
| `documents/SA4E-380/BRD.md` | §6 NFR security/cleanup rows; §1.2 item 9 |
| `documents/SA4E-380/FSD.md` | §7 Security Requirements; §9.1 Error Handling; §3.8 BR-01…BR-22 |
| `documents/SA4E-380/TDD.md` | §7 S-1…S-9; §9.1/§9.2 cleanup design; §6 error contract |
| `backend/src/modules/orchestration/content-proxy/artifact-source.ts` | Retrieval guards (F-01, F-02, S-3/S-5) |
| `backend/src/modules/orchestration/content-proxy/invocation-adapter.ts` | Wrapper gate, strict decode (F-04) |
| `backend/src/modules/orchestration/content-proxy/result-adapter.ts` | Stripping, error shaping, aggregate gap (F-03) |
| `backend/src/modules/orchestration/content-proxy/artifact-name.ts` | `safeName` (F-11) |
| `backend/src/config/ContentProxy.ts` | `NON_CONTENT_PARAM` (F-07), cap constant |
| `backend/src/modules/orchestration/McpClientManager.ts` | Execution wiring, `readResourceFromClient` |
| `backend/src/server/HttpRouteRegistrar.ts`; `backend/src/server/routes/kb-api.ts` | Auth gates, body limit, rate limiting (F-03, F-08) |
| `extension/src/services/Base64ProxyService.ts`; `extension/src/services/Base64ProxyService/output-proxy.ts` | Read/write guards (S-1, I-7) |
| `extension/src/services/PathResolver.ts`; `extension/src/backend-local-tools/fs-guards.ts` | Confinement + symlink guard internals |
| `extension/src/services/WrapperServer/wrapper-server.ts` | Loopback bind (F-08) |
| `extension/src/services/path-format.ts` | `sanitizeLogText` (S-2) |

## Appendix B — Glossary

- **BOLA** — Broken Object Level Authorization. **CWE** — Common Weakness Enumeration. **CVSS** — Common Vulnerability Scoring System. **OI-xx** — Open Issue (TDD/FSD numbering). **S-x** — TDD §7 design threat. **STRIDE** — Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege. **TOCTOU** — Time-of-check to time-of-use race condition.

## Appendix C — Scope Limitations

- Design review only: no dynamic testing, exploitation, or infrastructure assessment; runtime TLS configuration, OS permissions of the artifact directories, and child-server internals were not examined.
- Dependency CVE screening of external systems (`markdown-exporter`, draw.io renderer runtime) out of scope; the proxy itself introduces no new npm dependencies (verified from source imports).
- Findings F-01/F-02/F-03 are conditional on the documented trust model (operator-configured children); they are not exploitable through the LLM-facing surface alone, because the LLM can never supply `content_base64` or artifact descriptors.
- Phase 5.7 (code audit) must re-verify every control in §8 against the merged implementation.

---

*End of Security Design Review — SA4E-380 v1.0 (2026-10-23). Generated by the Security Agent; no code was modified during this review.*