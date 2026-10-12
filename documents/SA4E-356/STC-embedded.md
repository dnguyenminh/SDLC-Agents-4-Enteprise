# Software Test Cases (STC)

## SDLC-Agents-4-Enterprise — SA4E-356: [Bug] MCP tools: relative file_path resolves against process CWD instead of workspace root

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-356 |
| Title | [Bug] MCP tools: relative file_path resolves against process CWD (Kiro install dir) instead of workspace root |
| Author | QA Agent |
| Version | 1.1 |
| Date | 2026-10-12 |
| Status | Draft (v1.1 delta — BA APPROVED v1.0; re-review waiver for SM decision) |
| Related STP | documents/SA4E-356/STP.md |
| Related BRD | documents/SA4E-356/BRD.md (v1.0.1) |
| Related FSD | documents/SA4E-356/FSD.md (v1.2) |
| Related TDD | documents/SA4E-356/TDD.md (v1.2) |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-12 | QA Agent | Initiate STC — 26 cases (PBT 4, UT 10, IT 8, SCAN 2, E2E-API 2; E2E-UI/SIT N/A with justification), full RTM AC/FR/UC/BR |
| 1.1 | 2026-10-12 | QA Agent | Targeted delta for TDD v1.2 security fixes (SEC-01..08): +7 cases (UT-11 T5b, UT-12 T8-ext, UT-13 T-SEC01, UT-14 T-size, UT-15 backend casing, IT-09 INT-2-ext, IT-10 SQ-1 with graceful skip); UT-06 corrected for BR-06b + A1 empty-array variant; IT-05 chat-marker asserts (N-QA4/SEC-08a) + alias variant (SEC-08b); IT-07 A2 multi-root variant; N-QA2 boundary-corpus expansion; RTM +BR-06b/N-9/SEC codes (100%); testdata rows added |

---

## Test Case Summary

| Category | ID Range | Count | Priority |
|----------|----------|-------|----------|
| Property-Based (resolution correctness) | PBT-01 to PBT-04 | 4 | P2–P3 |
| Unit — shared helper + backend errors + v1.2 security deltas | UT-01 to UT-15 | 15 | P1–P2 |
| Integration — per-tool wiring + error formats + v1.2 guards | IT-01 to IT-10 | 10 | P1–P2 |
| Static/schema scans | SCAN-01 to SCAN-02 | 2 | P2 |
| E2E-API — extension-host regression replay | E2E-API-01 to E2E-API-02 | 2 | P1 |
| E2E-UI | N/A — no UI surface (BRD/FSD UI: N/A) | 0 | — |
| SIT (manual exploratory) | N/A — all deterministic paths automated; no visual/UX scope | 0 | — |

## Test Level Summary

| Level | Count | Automated | Manual |
|-------|-------|-----------|--------|
| PBT | 4 | 4 | 0 |
| UT | 15 | 15 | 0 |
| IT | 10 | 10 | 0 |
| E2E-API | 2 | 2 (plus 1 manual confirmation run on real host for the close gate) | 0 |
| E2E-UI | 0 | 0 (N/A) | 0 |
| SIT | 0 | 0 (N/A) | 0 |
| SCAN | 2 | 2 | 0 |
| **Total** | **33** | **33 (100%)** | **0 (0%)** |

**Conventions used in every case below:** `WS` = fake workspace root (unit: injected provider e.g. `C:\fake-ws`; integration: tmpdir set as vscode-mock workspace). `path.resolve` semantics per Node. Error templates per FSD §9.2–§9.3 / TDD §7.2. `rootProvider` injection = level-1 testability (no vscode mock); default provider = level-2 (vscode mock, mutate + restore in `finally`).

---

## 1. Property-Based Tests (PBT) — `resolveWorkspacePath` / `isPathWithinRoot`

### PBT-01: Absolute passthrough preserves location

| Field | Value |
|-------|-------|
| **ID** | PBT-01 |
| **Priority** | High (P2) |
| **Type** | Property-Based (fast-check, vitest) |
| **Requirement** | BR-03, FR-03, UC-02 (AC-1, AC-3) |
| **Preconditions** | Helper compiled; arbitrary absolute paths (win32 + posix, mixed separators, dot-segments, trailing slashes, casing variants) |

**Objective:** For every absolute input inside the workspace, resolution never moves the file: `resolve(p).resolvedPath === path.resolve(p)` and the result passes containment when lexically inside `WS`.

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Generate absolute path under `WS` (arbitrary depth, separators, `.`/`..` segments that stay inside, casing mutations) | Valid arbitrary input |
| 2 | Call `resolveWorkspacePath(p, { rootProvider: () => WS })` | `ok:true`; `resolvedPath === path.resolve(p)`; `rootSource === "workspace"` |
| 3 | Assert position preservation vs `path.resolve` only (no re-rooting) | Byte-equal after normalization; no `WS`-prefix forcing beyond containment |

**Test Data:** `testdata/property-seeds.csv` rows PBT-01 (seeds) + fast-check arbitraries at runtime
**Postconditions:** Property holds; any counterexample is shrunk and filed as a Major defect

---

### PBT-02: Resolution is idempotent and per-call (no stale cache)

| Field | Value |
|-------|-------|
| **ID** | PBT-02 |
| **Priority** | Medium (P3) |
| **Type** | Property-Based (fast-check, vitest) |
| **Requirement** | C-3, UC-01 AF-2, FR-02 (AC-1) |
| **Preconditions** | Helper compiled; mutable provider switching between two roots A/B |

**Objective:** Resolving twice is a fixed point (`resolve(resolve(p)) === resolve(p)`), and the provider is consulted on every call (switching root between calls changes the outcome — no caching).

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Generate arbitrary relative path (incl. nested, `.`/`..` staying inside) | Valid input |
| 2 | Resolve with root A → `r1`; resolve `r1.resolvedPath` again with root A → `r2` | `r2.resolvedPath === r1.resolvedPath` (idempotent) |
| 3 | Switch provider to root B, resolve the same raw path → `r3` | `r3.resolvedPath === path.resolve(B, raw)` (differs from `r1` when A ≠ B); provider call count increments each call |

**Test Data:** `testdata/property-seeds.csv` rows PBT-02
**Postconditions:** No stale-root behavior; UC-01 AF-2 satisfied

---

### PBT-03: Containment is monotonic — inside stays inside, outside never leaks

| Field | Value |
|-------|-------|
| **ID** | PBT-03 |
| **Priority** | High (P2) |
| **Type** | Property-Based — Security (fast-check, vitest) |
| **Requirement** | BR-05, FR-05, UC-03, N-3 (AC-3) |
| **Preconditions** | Helper compiled; arbitraries for in-workspace subpaths and escape attempts |

**Objective:** (a) Any path lexically inside `WS` (arbitrary nesting) resolves `ok:true`. (b) Any path escaping `WS` (`../` chains of arbitrary length, absolute outside, prefix-collision `WS-evil`, mixed separators) resolves `ok:false` with code `PATH_REJECTED_OUTSIDE_WORKSPACE` — 0 leaks to `fs.*` (N-3).

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Generate in-workspace path (arbitrary depth under `WS`) | `ok:true`, `resolvedPath` starts with `WS + sep` (or equals `WS`) |
| 2 | Generate escape (arbitrary `../` depth, absolute outside `WS`, `WS + "-evil/..."`, `..\../` mixes) | `ok:false`; message starts with `PATH_REJECTED_OUTSIDE_WORKSPACE:` and contains raw + resolved + root (Format 2) |
| 3 | Assert no generated escape yields `ok:true` | 0 counterexamples; N-3 corpus target holds |

**Test Data:** `testdata/property-seeds.csv` rows PBT-03 + `testdata/boundary-corpus.csv` (fixed corpus)
**Postconditions:** Security property holds; any leak = Critical defect

---

### PBT-04: Case-fold applies on win32 only

| Field | Value |
|-------|-------|
| **ID** | PBT-04 |
| **Priority** | Medium (P3) |
| **Type** | Property-Based (fast-check, vitest) |
| **Requirement** | BR-04, FR-04, UC-02 AF-1, R-1 (AC-3) |
| **Preconditions** | Helper compiled; runs on win32 CI for the fold branch; posix run asserts the strict branch |

**Objective:** On `win32`, arbitrary casing mutations of a contained path stay contained (fold both sides). On posix, a casing-mutated path that differs from root casing is rejected (strict compare — safe direction).

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Take contained path; generate random per-character case flips | Mutated input |
| 2 | On win32: `isPathWithinRoot(WS, mutated)` | `true` for every mutation (no false reject — R-1) |
| 3 | On posix: `isPathWithinRoot` with root vs candidate differing only by case | `false` unless strings are byte-equal (reject-leaning is the safe direction) |

**Test Data:** `testdata/property-seeds.csv` rows PBT-04
**Postconditions:** R-1 class of false-rejects eliminated on Windows; no loosening on posix

---

## 2. Unit Tests (UT) — Shared Helper T1–T8 + T3b + Backend Disambiguation + v1.2 Security Deltas (T5b/T8-ext/T-SEC01/T-size/Backend Casing)

### UT-01: T1 — Relative path resolves against workspace root

| Field | Value |
|-------|-------|
| **ID** | UT-01 |
| **Priority** | High (P1) |
| **Type** | Functional — Happy Path |
| **Requirement** | UC-01 Main Flow, BR-02, FR-02 (AC-1, AC-3; BRD Story 1/3) |
| **Preconditions** | `rootProvider: () => WS` injected (level-1, no vscode mock) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `resolveWorkspacePath("documents/SA4E-355/FSD.md", { rootProvider: () => WS })` | `ok:true` |
| 2 | Inspect `resolvedPath` | Equals `path.resolve(WS, "documents/SA4E-355/FSD.md")` |
| 3 | Inspect `rootSource` / `rootPath` | `rootSource === "workspace"`, `rootPath === WS` |

**Test Data:** `testdata/path-resolution.csv` rows UT-01
**Postconditions:** No fs touched (pure string op, C-2)

---

### UT-02: T2 — Absolute path passthrough, position unchanged

| Field | Value |
|-------|-------|
| **ID** | UT-02 |
| **Priority** | High (P1) |
| **Type** | Functional — Happy Path (backward compat) |
| **Requirement** | UC-02 Main Flow, BR-03, FR-03, N-4 (AC-1; BRD R-5) |
| **Preconditions** | `rootProvider: () => WS` injected |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call with absolute inside WS, e.g. `<WS>/documents/SA4E-355/FSD.md` | `ok:true`; `resolvedPath === path.resolve(raw)` — position unchanged |
| 2 | Call with forward-slash / trailing-slash / dot variants (`<WS>/a/./b/../b/x.md`) | `ok:true`; normalized only, same location (UC-02 EF-3) |
| 3 | Confirm root played no role in placement | Result independent of `WS` value (only containment uses it) |

**Test Data:** `testdata/path-resolution.csv` rows UT-02
**Postconditions:** SA4E-355 absolute-path workaround (18/18) cannot regress — guarded with E2E-API-02

---

### UT-03: T3 — `../` escape outside workspace root is blocked (Format 2 + code)

| Field | Value |
|-------|-------|
| **ID** | UT-03 |
| **Priority** | High (P1) |
| **Type** | Functional — Exception Flow / Security |
| **Requirement** | UC-03 Main Flow, BR-05, FR-05 (AC-3; BO-5) |
| **Preconditions** | `rootProvider: () => WS` injected |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call with `../../outside.txt` (resolves above `WS`) | `ok:false` |
| 2 | Inspect `code` and `message` | `code === "PATH_REJECTED_OUTSIDE_WORKSPACE"`; message = `PATH_REJECTED_OUTSIDE_WORKSPACE: Path rejected: ../../outside.txt resolves to <resolved> — outside workspace root <WS>.` (Format 2) |
| 3 | Inspect `rawPath` / `resolvedPath` / `rootSource` | Raw preserved trimmed; best-effort resolved present; `rootSource === "workspace"` |
| 4 | Repeat with absolute path outside `WS` | Same rejection (FR-05: containment covers absolute passthrough) |

**Test Data:** `testdata/path-resolution.csv` rows UT-03 + `testdata/boundary-corpus.csv`
**Postconditions:** Helper never throws; no fallback attempted (C-1, C-6)

---

### UT-04: T3b — Boundary prefix-collision (`WS-evil`) is blocked

| Field | Value |
|-------|-------|
| **ID** | UT-04 |
| **Priority** | High (P1) |
| **Type** | Boundary / Security |
| **Requirement** | UC-03 EF-2, BR-05, FR-05 (AC-3) |
| **Preconditions** | Root `C:\fake-ws` (injected); candidate `C:\fake-ws-evil\x.md` — same string prefix, different directory |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `isPathWithinRoot("C:\\fake-ws", "C:\\fake-ws-evil\\x.md")` directly | `false` — proves trailing-separator compare, not bare `startsWith(root)` |
| 2 | Call `resolveWorkspacePath("C:\\fake-ws-evil\\x.md", { rootProvider: () => "C:\\fake-ws" })` | `ok:false`, Format 2 with code prefix |
| 3 | Positive control: `C:\fake-ws\sub\x.md` | `true` / `ok:true` |
| 4 | Root itself: candidate equals root | `true` (workspace root is a valid location) |

**Test Data:** `testdata/boundary-corpus.csv` rows UT-04
**Postconditions:** Prefix-collision bypass class closed

---

### UT-05: T4 — Multi-root workspace uses the FIRST folder deterministically

| Field | Value |
|-------|-------|
| **ID** | UT-05 |
| **Priority** | High (P1) |
| **Type** | Functional — Alternative Flow |
| **Requirement** | UC-05 Main Flow, BR-07, FR-07 (AC-1; BRD R-3) |
| **Preconditions** | vscode mock with 2 folders (level-2): `[0] = WS-A`, `[1] = WS-B`; restore in `finally` |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Set mock `workspaceFolders = [{ uri: { fsPath: WS-A } }, { uri: { fsPath: WS-B } }]`; call `resolveWorkspacePath("docs/x.md")` via default provider | `ok:true`; `resolvedPath === path.resolve(WS-A, "docs/x.md")`; `rootPath === WS-A` |
| 2 | Reorder mock (B first); call again | Resolves under B — always index 0, deterministic |
| 3 | Restore mock | `finally` restores previous folders (mandatory) |

**Test Data:** `testdata/path-resolution.csv` rows UT-05
**Postconditions:** Agent rule "primary folder" holds; file-in-folder-2 case degrades to Format 1 + absolute-path hint (UC-05 AF-1, covered IT-07)

---

### UT-06: T5 — No workspace → `cwd_fallback`; relative REJECTED (BR-06b), absolute passes (DISC-1)

| Field | Value |
|-------|-------|
| **ID** | UT-06 |
| **Priority** | High (P1) |
| **Type** | Functional — Alternative Flow (behavior-change lock, v1.1 corrected) |
| **Requirement** | UC-01 AF-1, BR-06, BR-06b, FR-06 (AC-1; DISC-1 RESOLVED; TDD v1.2 §11.3 T5 — second fallback behavior change, BA ack N-BA2) |
| **Preconditions** | vscode mock `workspaceFolders = undefined` (level-2); A1 variant repeats with `workspaceFolders = []`; restore in `finally` |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | With no workspace, call `resolveWorkspacePath("docs/x.md")` via default provider | **`ok:false`**; `code === "PATH_NO_WORKSPACE"`; message = Format 3 (`PATH_NO_WORKSPACE: no workspace open — use an absolute path inside the intended folder or open a workspace. (got relative 'docs/x.md', fallback root <cwd>)`) — **CHANGED v1.1 (BR-06b); the v1.0 `ok:true` expectation is obsolete and must NOT be asserted** |
| 2 | With no workspace, call with absolute path OUTSIDE `process.cwd()` (e.g. `D:\elsewhere\x.md`) | **`ok:true` — containment does NOT apply on `cwd_fallback`** (DISC-1 behavior unchanged) |
| 3 | A1 variant (BA polish): mock `workspaceFolders = []` (empty array — also "no workspace"); repeat steps 1–2 | Identical outcomes (relative → `PATH_NO_WORKSPACE`; absolute → `ok:true`); `rootSource === "cwd_fallback"` in all four calls |
| 4 | Error-path wording (tool layer, informational): when a later fs op fails, message must read `Resolved against process.cwd() fallback = <cwd>` | Wording verified at IT-07 variant; unit asserts `rootSource`/`rootPath` fields that feed it |

**Test Data:** `testdata/path-resolution.csv` rows UT-06 (incl. A1 empty-array rows)
**Postconditions:** BR-06b locked in; implementer cannot resolve relative paths into the Kiro install dir without failing this test

---

### UT-07: T6 — Drive-letter / folder casing does not false-reject on Windows (R-1)

| Field | Value |
|-------|-------|
| **ID** | UT-07 |
| **Priority** | High (P1) |
| **Type** | Functional — Regression of observed R-1 incident (2026-10-12) |
| **Requirement** | UC-02 AF-1, BR-04, FR-04 (AC-3; BRD R-1, Story 1 Req 6) |
| **Preconditions** | Level-1 injection; root `c:\projects\ws` (lowercase drive, as real fsPath); caller uses `C:\PROJECTS\WS\file.md` and vice versa |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Root `c:\fake-ws`, candidate `C:\FAKE-WS\sub\file.md` → `isPathWithinRoot` | `true` on win32 (case-fold both sides) |
| 2 | Full pipeline: `resolveWorkspacePath("C:\\fake-ws\\sub\\file.md", { rootProvider: () => "c:\\fake-ws" })` | `ok:true` on win32 — the exact false-reject observed with `stream_write_file` is gone |
| 3 | On posix CI: same-shape inputs differing only by case | `false` (strict compare — safe direction; documents OI-3) |

**Test Data:** `testdata/path-resolution.csv` rows UT-07
**Postconditions:** No valid Windows path rejected over casing; escape strictness unaffected

---

### UT-08: T7 — Provider injection is consulted per call (no cache)

| Field | Value |
|-------|-------|
| **ID** | UT-08 |
| **Priority** | Medium (P3) |
| **Type** | Business Rule / Contract (C-3) |
| **Requirement** | UC-01 AF-2, C-3, FR-02 (AC-1) |
| **Preconditions** | Level-1; counting provider returning root A on 1st call, root B on 2nd |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call twice with the same raw path while provider flips A → B | Call 1 resolves under A; call 2 under B |
| 2 | Assert provider call count | Exactly 2 invocations (proves per-call read, no memoization) |
| 3 | Provider that throws | Treated as no-root → `cwd_fallback` (UC-05 EF-2), never throws (C-1) |

**Test Data:** `testdata/path-resolution.csv` rows UT-08
**Postconditions:** Workspace switch mid-session (UC-01 AF-2) can never go stale

---

### UT-09: T8 — UNC / empty / non-string inputs fail loud, never throw (C-1)

| Field | Value |
|-------|-------|
| **ID** | UT-09 |
| **Priority** | Medium (P3) |
| **Type** | Boundary & Negative |
| **Requirement** | UC-01 EF-3, UC-02 EF-2, UC-03 AF-2, C-1 (AC-3) |
| **Preconditions** | Level-1; drive-letter root `WS` |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `\\\\server\\share\\x.md` with drive-letter root | `ok:false`, `PATH_REJECTED_OUTSIDE_WORKSPACE` (UNC is absolute and outside a drive-letter root — correct) |
| 2 | `""` and `"   "` | `ok:false`, `code === "PATH_EMPTY"`, message `PATH_EMPTY: 'file_path' must be a non-empty string.` — returned BEFORE any resolve (guards accidental root ops) |
| 3 | `null`, `123`, `undefined` | Same `PATH_EMPTY`, zero exceptions |
| 4 | Assert no input in this class ever throws | 0 exceptions across the corpus (C-1) |

**Test Data:** `testdata/path-resolution.csv` rows UT-09 + `testdata/boundary-corpus.csv`
**Postconditions:** Empty-path abuse (threat model §8.1) closed at the helper boundary

---

### UT-10: Backend `drawio_auto_layout` error disambiguation (BR-12 minimal fix)

| Field | Value |
|-------|-------|
| **ID** | UT-10 |
| **Priority** | Medium (P2) |
| **Type** | Functional — Exception Flow (backend, ~10 lines) |
| **Requirement** | FSD §6.5, TDD §7.4, BR-12 (AC-2 spirit) |
| **Preconditions** | Backend `drawio-tool.ts` with the disambiguated `handleDrawioLayout`; resolve behavior untouched |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call handler with missing/blank `file_path` (`undefined`, `""`, `"  "`) | Error `file_path is required` (unchanged text for the truly-missing case) |
| 2 | Call with a path present but `resolveFilePath` returning null (escape / backend-workspace mismatch) | Error `Path rejected: <raw> resolves to <resolved> — outside backend workspace <workspace>. Hint: use a path inside the backend workspace, or route file-content tools through the extension proxy.` |
| 3 | Confirm `resolveFilePath` itself unchanged | No resolve-behavior diff (BR-12); only the two error branches differ |

**Test Data:** `testdata/path-resolution.csv` rows UT-10
**Postconditions:** Agents can distinguish "you forgot the param" from "your path was rejected" — the wrong-semantics message is gone

---

### UT-11: T5b — BR-06b discriminates relative vs absolute under `cwd_fallback` (Format 3 shape)

| Field | Value |
|-------|-------|
| **ID** | UT-11 |
| **Priority** | High (P1) |
| **Type** | Functional — Exception Flow / Security (v1.2, SEC-02) |
| **Requirement** | BR-06b, FR-06 (AC-1; TDD §11.3/§11.4 T5b, AD-16) |
| **Preconditions** | vscode mock `workspaceFolders = undefined` (level-2); restore in `finally` |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `resolveWorkspacePath("docs/y.md")` via default provider | `ok:false`, `code === "PATH_NO_WORKSPACE"` |
| 2 | Assert Format 3 shape | Message starts with `PATH_NO_WORKSPACE:`; contains `got relative 'docs/y.md'`; contains `fallback root <cwd>`; contains `open a workspace` |
| 3 | Call with absolute path inside cwd (`path.resolve("z.md")`) | `ok:true` — absolute always passes through, even on fallback |
| 4 | Assert zero side-effects | No file/dir created (pure string op, C-2) |

**Test Data:** `testdata/path-resolution.csv` rows UT-11 + `testdata/error-format.csv` Format-3 row
**Postconditions:** Fallback-relative abuse (resolve into Kiro install dir) closed; agent steered to absolute-or-open-workspace

---

### UT-12: T8-ext — NUL → `PATH_INVALID`; CRLF echo sanitized (SEC-05)

| Field | Value |
|-------|-------|
| **ID** | UT-12 |
| **Priority** | High (P1) |
| **Type** | Boundary & Negative / Security (v1.2, SEC-05) |
| **Requirement** | UC-01 EF-3 ext, UC-03 (NUL-hidden escape), E-1, TDD §10.1 sanitize (AC-2, AC-3; AD-19) |
| **Preconditions** | Level-1 injection (`rootProvider: () => WS`) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call with `"a\0b"` (embedded NUL) | `ok:false`, `code === "PATH_INVALID"`, message `PATH_INVALID: 'file_path' contains invalid characters (NUL byte).` — blocked BEFORE resolve |
| 2 | Call with `"..\x00.."`-style NUL-hidden escape | Same `PATH_INVALID` (never resolved, never reaches containment/fs) |
| 3 | Call with `"file\r\nINJECTED: x"` (otherwise legal relative) | Resolves normally (`ok:true` under workspace) BUT every message/log echo of it contains no raw `\r`/`\n` (sanitized `?` form per §10.1) |
| 4 | Inspect `rawPath` echo of the NUL case | Contains `?`, never the raw NUL byte |
| 5 | Assert no input in this class ever throws | 0 exceptions (C-1) |

**Test Data:** `testdata/path-resolution.csv` rows UT-12 + `testdata/boundary-corpus.csv` N-QA2 quirk rows
**Postconditions:** Log-forging via path echo closed at the helper boundary

---

### UT-13: T-SEC01 — Inner markdown image refs outside root are skipped fail-closed (SEC-01)

| Field | Value |
|-------|-------|
| **ID** | UT-13 |
| **Priority** | Critical (P1) |
| **Type** | Functional — Security (v1.2, SEC-01) |
| **Requirement** | FSD §5.5 row 2 (pending BA clarify N-BA1), TDD §5.4.1 AD-15 (AC-1, AC-3) |
| **Preconditions** | Tmpdir workspace as `root`; real image at `img/a.png` in-root; markdown with 3 refs: `![ok](./img/a.png)`, `![evil](../../../../etc/passwd)`, `![abs](C:\Windows\file.png)` (absolute outside tmpdir) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `embedMarkdownImages(md, path.dirname(docPath), root)` with baseDir inside root | Returns `{ embedded, skipped }` without throwing |
| 2 | Assert counts | `embedded === 1` (only the in-root ref), `skipped === 2` |
| 3 | Assert output text | Both outside refs byte-identical in output (fail-closed: `skipped++`, keep `match`, no throw, no partial rewrite) |
| 4 | Positive control: markdown with only in-root refs | All embedded (`skipped === 0`) |
| 5 | Red-before-fix note | On unfixed code this test FAILS (outside refs get read/embedded) — attacker-must-be-red per Security Review §4.1 (N-QA1) |

**Test Data:** `testdata/integration-tools.csv` rows UT-13
**Postconditions:** Exfil-via-malicious-markdown channel (read outside root → base64 into workspace → attach) closed

---

### UT-14: T-size — Payload limits fail loud (N-9, SEC-07)

| Field | Value |
|-------|-------|
| **ID** | UT-14 |
| **Priority** | Medium (P2) |
| **Type** | Non-Functional — limits (v1.2, SEC-07) |
| **Requirement** | N-9 (SA-added policy 10 MB / 25 MB), TDD §8.4/§9 (AD-21) |
| **Preconditions** | Tmpdir workspace; sized content generated at runtime (no 25 MB fixture committed — create then delete) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `stream_write_file` with content of 10 MB + 1 byte | `FS_ERROR: payload too large (limit 10 MB)` — rejected BEFORE resolve/write; no file created |
| 2 | Boundary: content of exactly 10 MB | Accepted, writes normally |
| 3 | `proxyInput` pre-read of an in-workspace file of 25 MB + 1 byte | `PathResolverError` with `FS_ERROR: file too large for proxy pre-read (limit 25 MB)` + slice hint; nothing sent downstream |
| 4 | Boundary: file of exactly 25 MB | Pre-read succeeds |

**Test Data:** `testdata/integration-tools.csv` rows UT-14
**Postconditions:** Local self-DoS (disk-fill, event-loop block, base64 +33% OOM) capped fail-loud with actionable hints

---

### UT-15: Backend `resolveFilePath` win32 fold — `C:` vs `c:` passes (SEC-04)

| Field | Value |
|-------|-------|
| **ID** | UT-15 |
| **Priority** | Medium (P2) |
| **Type** | Functional — Regression (backend, v1.2, SEC-04) |
| **Requirement** | BR-12 ext, TDD §5.4 row 10 AD-18 (AC-2 spirit) |
| **Preconditions** | Backend `drawio-tool.ts` with the 2-line win32 fold in `resolveFilePath`; workspace `c:\be-ws` |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Caller `C:\BE-WS\diagram.drawio` vs workspace `c:\be-ws` | Resolves (non-null) on win32 — the false-reject is gone |
| 2 | Reversed: caller lowercase vs workspace uppercase | Resolves (non-null) on win32 |
| 3 | Genuine outside path (`C:\outside\evil.drawio`) | Still rejected (fold does not loosen containment) |
| 4 | On posix CI: differing-case outside | Still rejected (strict compare) |

**Test Data:** `testdata/path-resolution.csv` rows UT-15
**Postconditions:** Backend false-reject class closed with a 2-line fold; resolve semantics otherwise unchanged (BR-12, OI-1 intact)

---

## 3. Integration Tests (IT) — Per-Tool Wiring INT-1..INT-6 + INT-2-ext + SQ-1 + Error Formats

**Shared integration fixture:** tmpdir as fake workspace (vscode mock mutated, restored in `finally`); real files created under tmpdir; `rootProvider`/default provider per TDD §11.3. Invariant under test everywhere: resolve → check `.ok` (fail returns NOW, no external side-effect) → `fs.*` with `resolvedPath` only → fs errors wrapped as Format 1 (I-1..I-6).

### IT-01: INT-1 — `stream_write_file` refactor regression (write + append + casing)

| Field | Value |
|-------|-------|
| **ID** | IT-01 |
| **Priority** | High (P1) |
| **Type** | Integration — Regression |
| **Requirement** | FSD §5.5 row 1, UC-01, UC-02 AF-1, BR-02/03/04 (AC-1) |
| **Preconditions** | Tmpdir workspace; `handleStreamWriteFile` refactored to helper |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call handler with relative `sub/note.md` + content (mode write) | File created at `<tmpdir>/sub/note.md`; result `Wrote file: <resolved>` (success text preserved) |
| 2 | Call again with mode append | Content appended; result `Appended to: <resolved>` |
| 3 | Call with absolute path using opposite drive casing | Success (containment case-insensitive — T6 spirit at tool level) |
| 4 | Call with `../escape.md` | Fail-loud Format 2 with `PATH_REJECTED_OUTSIDE_WORKSPACE:`; no file created outside |
| 5 | Call with missing `file_path` | `PATH_EMPTY:` (new single-validation-point text per TDD AD-12 — intentional) |

**Test Data:** `testdata/integration-tools.csv` rows IT-01
**Postconditions:** Overall resolve behavior unchanged on the workspace branch (BRD out-of-scope holds, modulo approved `cwd_fallback` change)

---

### IT-02: INT-2 — `embed_image` resolves `file_path`, `output_path`, and markdown baseDir

| Field | Value |
|-------|-------|
| **ID** | IT-02 |
| **Priority** | High (P1) |
| **Type** | Integration |
| **Requirement** | FSD §5.5 row 2, BR-02, BR-11 (AC-1) |
| **Preconditions** | Tmpdir workspace with `doc.md` referencing `img.png` (real 1×1 PNG) in the same folder |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `handleEmbedImage` with relative `doc.md`, no `output_path` | Output written next to the resolved input (`doc-embedded.md` in tmpdir, NOT in Kiro dir); result names the resolved output |
| 2 | Inspect output content | Image ref replaced by `data:image/png;base64,…` (proves baseDir = dirname of RESOLVED path — the second half of this tool's root cause) |
| 3 | Call with explicit relative `output_path: "out/e.md"` | Output at `<tmpdir>/out/e.md` (BR-11: same rule for output params) |
| 4 | Call with relative path to a missing markdown | Format 1 `FILE_NOT_FOUND:` carrying the resolved absolute path + `Resolved against` + hint |

**Test Data:** `testdata/integration-tools.csv` rows IT-02
**Postconditions:** Both the raw-`readFileSync` bug and the relative-baseDir bug are closed

---

### IT-03: INT-3 — `jira_attach_file` relative (original repro shape)

| Field | Value |
|-------|-------|
| **ID** | IT-03 |
| **Priority** | High (P1) |
| **Type** | Integration (pre-check of E2E-API-01) |
| **Requirement** | FSD §5.5 row 3, UC-01, I-3 (AC-1, AC-5) |
| **Preconditions** | Tmpdir workspace with `documents/SA4E-355/FSD.md` fixture; `AtlassianHttpClient.request` mocked (captures FormData) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call handler with `issue_key="SA4E-355"`, relative `documents/SA4E-355/FSD.md` | Buffer read from `<tmpdir>/documents/SA4E-355/FSD.md` — NOT from the Kiro install dir; upload called with `basename(resolvedPath)` |
| 2 | Assert the old root cause is gone | No `path.resolve(file_path)` single-arg path; no ENOENT mentioning `Programs\Kiro` |
| 3 | Call with `../escape.md` | Resolve fails → `toErrorResult` returned BEFORE any HTTP; mocked HTTP call count stays 0 (I-3: never upload on resolve-fail) |

**Test Data:** `testdata/integration-tools.csv` rows IT-03
**Postconditions:** Repro shape green at integration level; E2E-API-01 replays it for real

---

### IT-04: INT-4 — `confluence_add_attachment` relative (same-pattern fix)

| Field | Value |
|-------|-------|
| **ID** | IT-04 |
| **Priority** | Medium (P2) |
| **Type** | Integration |
| **Requirement** | FSD §5.5 row 4, UC-01, I-3 (AC-1) |
| **Preconditions** | Tmpdir workspace with fixture file; Confluence HTTP mocked |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call handler with relative file path + `page_id` | Buffer read from resolved tmpdir path; FormData built from it |
| 2 | Call with escape path | Return before FormData/HTTP (I-3); `PATH_REJECTED_OUTSIDE_WORKSPACE:` forwarded verbatim (C-5) |

**Test Data:** `testdata/integration-tools.csv` rows IT-04
**Postconditions:** Same-pattern bug (`rs(a.file_path)`) closed symmetric to IT-03

---

### IT-05: INT-5 — `mem_ingest_file` on BOTH paths (chat ToolProxy + MCP wrapper)

| Field | Value |
|-------|-------|
| **ID** | IT-05 |
| **Priority** | High (P1) |
| **Type** | Integration (two sub-paths — do NOT merge) |
| **Requirement** | FSD §5.5 rows 5a/5b, UC-01, BR-05 (new containment), D2 regression, SEC-08a (chat marker), SEC-08b (alias doc) (AC-1, AC-2) |
| **Preconditions** | Tmpdir workspace with ingestable text file; chat HTTP client mock + `restCallTool` mock for wrapper path |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Chat path: `ToolProxy.callTool("mem_ingest_file", { file_path: <relative> })` | `newArgs.content` read from `resolution.resolvedPath`; `newArgs.file_path` = resolved absolute (backend dedup key preserved) |
| 2 | Chat path with escape | Wrapper-Error payload carries the helper message verbatim (code prefix intact, C-5) |
| 3 | Wrapper path: `routeToolCall`/`handleDynamic` with relative path, real `Base64ProxyService` in provider mode `() => TMPDIR` | `content_base64` filled from the resolved file; backend receives absolute path |
| 4 | Provider/string parity: repeat step 3 with `new Base64ProxyService(TMPDIR)` (string mode) | Identical outcome (backward compat — existing helper-based tests unbroken) |
| 5 | D2 regression: existing `tool-proxy.test.ts` case (mock-workspace relative resolve) | Still passes unchanged |
| 6 | `PathResolverError` from `proxyInput` through `routeToolCall` | MCP tool error result (`isError:true` + message), NEVER JSON-RPC `-32603` (TDD §5.6) |
| 7 | Chat-path resolve-fail (N-QA4): call with `../escape.md`, inspect the FULL text | Text starts with `Wrapper Error:` AND contains the helper `CODE:` (e.g. `PATH_REJECTED_OUTSIDE_WORKSPACE:`) — marker assert per SEC-08a (chat ToolResult has no `isError` field) |
| 8 | Chat-path alias (SEC-08b): call with `args.path` (no `file_path`) carrying a legal relative path, then an escape | Legal alias resolves via the SAME helper (documented, no bypass); escape via alias rejected identically |

**Test Data:** `testdata/integration-tools.csv` rows IT-05
**Postconditions:** Both call paths share one helper + containment; envelope correct on both

---

### IT-06: INT-6 — `drawio_export_png` relative input (+ output + nested dynamic path)

| Field | Value |
|-------|-------|
| **ID** | IT-06 |
| **Priority** | High (P1) |
| **Type** | Integration |
| **Requirement** | FSD §5.5 rows 6a/6b/6c (AC-1) |
| **Preconditions** | Tmpdir workspace with real minimal `.drawio`; `restCallTool` mocked (captures args) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call via wrapper with relative `.drawio` path | `content_base64` filled from the resolved file (extension stops at "bytes from resolved path" — backend render is backend-tested, FSD §10.4 fact 5) |
| 2 | Explicit relative `output_path` | Resolved through the helper (containment applies — BR-11) |
| 3 | Derived output (no `output_path`) for `.drawio` input | Sibling `.png` next to resolved input |
| 4 | Derived output for non-`.drawio` input | `resolved + ".out"` (matches M-2 description suffix — DISC-2) |
| 5 | Nested variant: same call through `execute_dynamic_tool(drawio_export_png, …)` (`handleDynamic` 6c) | Identical resolution outcome (delegation covers the nested route with no extra code) |

**Test Data:** `testdata/integration-tools.csv` rows IT-06
**Postconditions:** Proxy input/output resolution fully delegated; no raw-path route remains

---

### IT-07: TC-ERR-01 — ENOENT after correct resolve yields Format 1 (code + resolved path + root + hint)

| Field | Value |
|-------|-------|
| **ID** | IT-07 |
| **Priority** | High (P1) |
| **Type** | Functional — Exception Flow |
| **Requirement** | UC-04 Main Flow, UC-05 AF-1, BR-08, FR-08 (AC-2; BRD Story 2) |
| **Preconditions** | Tmpdir workspace; target file genuinely absent (not an escape) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `stream_write_file`-read-equivalent / `embed_image` / `jira_attach_file` with relative path to a NON-EXISTENT in-workspace file | Resolve `ok:true` (path is legal), then fs ENOENT |
| 2 | Inspect the error text | Starts with `FILE_NOT_FOUND:`; contains the full RESOLVED absolute path (not the raw input); contains `Resolved against workspace root <root>`; contains the hint (`dùng absolute path (nằm trong workspace root) hoặc kiểm tra lại đường dẫn tương đối tính từ workspace root`) |
| 3 | No-workspace variant (mock folders `undefined`) | Same shape with `Resolved against process.cwd() fallback = <cwd>. Gợi ý: mở workspace hoặc dùng absolute path trong workspace root.` |
| 4 | Non-ENOENT fs error (e.g. EISDIR/EACCES-shaped mock) | `FS_ERROR: Failed <operation> <resolvedPath>: <err.message>` (UC-04 EF-1) — resolved path still present |
| 5 | Assert `isError:true` and fail-loud (no silent empty/false) | Agent can self-heal in ≤ 1 retry (N-6); Format 1 is produced at the TOOL layer, never the helper (C-2) |
| 6 | A2 variant (BA polish): mock folders `[A, B]`; file exists ONLY in folder B (`B/only-b.md`); call tool with relative `only-b.md` | Resolves under folder A (primary) → fs ENOENT → Format 1 `FILE_NOT_FOUND:` with the resolved path under A + `Resolved against workspace root <A>` + hint to use an absolute path (UC-05 AF-1) |

**Test Data:** `testdata/error-format.csv` rows IT-07
**Postconditions:** AC-2 half 1 (file-missing) proven; agent never needs to guess the resolve root again

---

### IT-08: TC-ERR-02 — Rejected path yields Format 2 verbatim, with zero side-effects

| Field | Value |
|-------|-------|
| **ID** | IT-08 |
| **Priority** | High (P1) |
| **Type** | Functional — Exception Flow / Security |
| **Requirement** | UC-03, UC-04 EF-2, BR-05, BR-08, C-5, C-6, I-2..I-5 (AC-2, AC-3) |
| **Preconditions** | Tmpdir workspace; HTTP + fs spies armed |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call each of `jira_attach_file` / `confluence_add_attachment` / `embed_image` with `../../../evil.txt` | `ok:false` at helper; tool returns immediately with the helper message byte-identical (code prefix kept, C-5) |
| 2 | Assert message shape | `PATH_REJECTED_OUTSIDE_WORKSPACE: Path rejected: <raw> resolves to <resolved> — outside workspace root <root>.` — raw + resolved + root all present |
| 3 | Assert zero side-effects | fs call count 0; HTTP call count 0 (C-6, I-2, I-3); no fallback attempt, no second resolve strategy |
| 4 | Assert envelope | `isError:true` (chat path: ToolResult content shape preserved, message identical) |

**Test Data:** `testdata/error-format.csv` rows IT-08
**Postconditions:** AC-2 half 2 (rejection) proven; resolve-fail is a dead end by design, never a retry loop

---

### IT-09: INT-2-ext — `embed_image` handler keeps outside refs verbatim, embeds in-root (SEC-01 at tool level)

| Field | Value |
|-------|-------|
| **ID** | IT-09 |
| **Priority** | Critical (P1) |
| **Type** | Integration — Security (v1.2, SEC-01) |
| **Requirement** | FSD §5.5 row 2, TDD §11.5 INT-2 ext (AC-1, AC-3) |
| **Preconditions** | Tmpdir workspace; `doc.md` with 3 refs (in-root real PNG + `../` escape ref + absolute ref outside tmpdir); fs-read spy armed |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `handleEmbedImage` with relative `doc.md`, no `output_path` | Succeeds; output written next to the resolved input |
| 2 | Assert output content | In-root image replaced by `data:image/...;base64,…`; the 2 outside refs byte-identical (same expectation as UT-13, now at tool level) |
| 3 | Assert containment boundary | Every fs read path recorded by the spy starts with tmpdir — zero reads outside root |
| 4 | Repeat with explicit relative `output_path: "out/e.md"` | Same containment outcome at the explicit output; `skipped === 2` surfaces in result/log |

**Test Data:** `testdata/integration-tools.csv` rows IT-09
**Postconditions:** Tool-level proof of T-SEC01 — malicious markdown cannot pull outside files into the workspace

---

### IT-10: SQ-1 — Symlink/junction guard blocks escape, passes internal links (SEC-03, conditional skip)

| Field | Value |
|-------|-------|
| **ID** | IT-10 |
| **Priority** | Medium (P2) |
| **Type** | Integration — Security doc test (v1.2, SEC-03; N-QA3) |
| **Requirement** | UC-01 EF-4, OI-2, TDD §11.5 SQ-1 + I-7 guard (AC-3) |
| **Preconditions** | Tmpdir workspace; symlink `link-out` → outside dir; symlink `link-in` → in-root file. **SKIP CONDITION:** if symlink creation throws (EPERM/privilege on Windows without Developer Mode — try junction fallback first) → log `SQ-1 SKIPPED: symlink creation unavailable (<reason>)` and PASS-as-skipped; the suite must NOT fail |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Read via `link-out` (resolves inside, realpath escapes) | Blocked `PATH_REJECTED_OUTSIDE_WORKSPACE` via the guard-3.5 parent-realpath re-check |
| 2 | Write via symlink-dir pointing outside | Blocked with the same code; nothing written outside the workspace |
| 3 | Read via `link-in` (symlink to an in-root file) | Succeeds — no false block on `node_modules/.bin`-style internal links |
| 4 | Skip branch (creation unavailable) | `SKIPPED` with the reason logged; evidence recorded in the test report (N-QA3) |

**Test Data:** `testdata/integration-tools.csv` rows IT-10
**Postconditions:** Conditional acceptance documented per AD-17; full-realpath hardening stays OI-2 follow-up

---

## 4. Static / Schema Scans (SCAN)

### SCAN-01: InputSchema descriptions carry the resolution rule on all 4 surfaces (AC-4)

| Field | Value |
|-------|-------|
| **ID** | SCAN-01 |
| **Priority** | Medium (P2) |
| **Type** | Static scan — Contract transparency |
| **Requirement** | FR-09, BR-09, BR-10, BR-11, UC-05 Step 1, M-1..M-4, N-5 (AC-4; BRD Story 4) |
| **Preconditions** | Schemas committed; pre-fix inputSchema snapshot captured for the N-5 diff |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Scan (a) `getLocalToolDefinitions()` and (b) `getVisibleLocalToolDefinitions()` | Every tool in audit rows #1–#6 with `file_path` has a description containing `workspace` (case-insensitive); text equals shared constant `FILE_PATH_SCHEMA_DESCRIPTION` |
| 2 | Scan (c) `rewriteSchemasForLlm` output over backend-style schemas (incl. `mem_ingest_file` with NO description and `drawio_export_png` with the stale `reference only` text) | `file_path.description` is ALWAYS overwritten with the rule constant (M-1 — both verified holes closed); required/type untouched (M-3) |
| 3 | Scan (d) `rewriteFindToolsResponse` output (the `find_tools` / nested `execute_dynamic_tool` surface) | Same rule present (it funnels through the same rewrite — FSD §3.2.2 note) |
| 4 | `output_path` params (`embed_image`, `drawio_export_png`) | Rule text + preserved derived-info suffix: `-embedded` default for embed_image; `Defaults to <file_path> with extension swapped (.drawio→.png; non-.drawio inputs get .out appended).` for drawio (M-2, DISC-2) |
| 5 | N-5 signature stability: deep-diff pre/post snapshots of tools #1–#6 excluding `description` | EMPTY diff — only descriptions changed (BR-09) |

**Test Data:** `testdata/schema-scan.csv` (every tool × surface row references SCAN-01)
**Postconditions:** Agent reading any schema surface learns the exact rule before the first call — AC-4 on every path the agent can see

---

### SCAN-02: Consistency scan — no raw-path resolution remnants (N-8, BR-01)

| Field | Value |
|-------|-------|
| **ID** | SCAN-02 |
| **Priority** | Medium (P2) |
| **Type** | Static scan — Single source of truth |
| **Requirement** | BR-01, C-4, N-8 (AC-1, AC-3) |
| **Preconditions** | All §5.4 call-site refactors committed |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Grep `extension/src/` for single-arg patterns `resolve\(file_path\)`, `resolve\(args\.file_path\)`, `resolve\(a\.file_path\)` | 0 matches (excludes: test files, `backend/` duplicate per OI-4, `PathResolver.ts` itself) |
| 2 | Grep audit tool handlers for raw `fs.*(file_path…)` / `fs.*(args.file_path…)` reads/writes | 0 matches — every `fs.*` takes `resolution.resolvedPath` (C-4) |
| 3 | Confirm `ToolProxy.resolveWorkspacePath` private method (62–66) deleted | Symbol absent; chat path imports the shared helper |
| 4 | Confirm `Base64ProxyService` string-mode callers (`wrapper-server.helpers.ts:60` etc.) still compile/pass | Backward compat holds alongside provider mode |

**Test Data:** `testdata/schema-scan.csv` rows SCAN-02 (patterns + scope + exclusions)
**Postconditions:** BR-01 mechanically enforced — no tool can silently "forget" the helper again

---

## 5. E2E-API — Extension-Host Regression Replay (AC-5 Close Gate)

### E2E-API-01: REG-1 — Replay the original SA4E-355 repro with a RELATIVE path

| Field | Value |
|-------|-------|
| **ID** | E2E-API-01 |
| **Priority** | Critical (P1) |
| **Type** | Automated (vitest + extension host harness); manual confirmation run on real Kiro host for the close gate |
| **File** | `extension/src/__tests__/regression-sa4e-356.e2e.test.ts` (harness) + manual checklist below |
| **Traces To** | BRD Story 5 (AC-5); FSD FR-11; BO-1 |

**Objective:** Prove the exact failure from the bug report is gone: the call that ENOENT-ed against `C:\Users\ASUS\AppData\Local\Programs\Kiro\documents\…` now succeeds first try with the workspace-relative path.

**Preconditions:** Real Kiro/VS Code extension host with workspace `C:\projects\kiro\SDLC-Agents-4-Enterprise` open; `documents/SA4E-355/FSD.md` present; Jira access for `SA4E-355`; fixed extension built/installed.

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `jira_attach_file(issue_key="SA4E-355", file_path="documents/SA4E-355/FSD.md")` — relative, NO absolute fallback | Success on the FIRST attempt (no retry needed) |
| 2 | Verify attachment on the Jira issue | File attached with correct name + content; record attachment ID as evidence |
| 3 | Extend to the remaining SA4E-355 docs (FSD/BRD/TDD set, mirroring the 18-file absolute-path run) | All attach successfully with relative paths |
| 4 | Count total tool calls across the replay | ≤ 2 per file (N-6: success or one guided retry); the systematic fail-then-absolute-retry pattern is gone |
| 5 | One relative call per remaining audited tool (`embed_image`, `mem_ingest_file`, `drawio_export_png` with real files) | Each succeeds from the workspace root (FR-10 second half) |

**Test Data:** `testdata/regression-replay.csv` rows E2E-API-01
**Postconditions:** AC-5 satisfied with evidence (attachment IDs + call counts) filed on the ticket. **If this fails, the ticket does NOT close** — back to helper + wiring audit (BRD Story 5 error handling).

---

### E2E-API-02: REG-2 — Absolute-path control (backward compatibility)

| Field | Value |
|-------|-------|
| **ID** | E2E-API-02 |
| **Priority** | High (P1) |
| **Type** | Automated (vitest + extension host harness); manual confirmation alongside E2E-API-01 |
| **File** | `extension/src/__tests__/regression-sa4e-356.e2e.test.ts` |
| **Traces To** | BRD R-5; FSD N-4; TDD §11.6 (AC-1, AC-5) |

**Objective:** Prove the pre-existing absolute-path workaround keeps working byte-for-byte (passthrough unchanged, N-4).

**Preconditions:** Same host as E2E-API-01.

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `jira_attach_file(issue_key="SA4E-355", file_path="C:\\projects\\kiro\\SDLC-Agents-4-Enterprise\\documents\\SA4E-355\\FSD.md")` — absolute | Success; resolved location identical to pre-fix runs |
| 2 | Repeat with lowercase-drive form `c:\projects\…` | Success (casing robustness at tool level, R-1) |
| 3 | Spot-check one absolute call per other audited tool | All succeed — no caller that relied on absolute paths is broken |

**Test Data:** `testdata/regression-replay.csv` rows E2E-API-02
**Postconditions:** Backward compatibility proven; absolute-path pipeline users (incl. the R-6 doc workaround) are unaffected.

---

## 6. Explicitly Not Covered (E2E-UI / SIT — N/A)

| Level | Verdict | Justification |
|-------|---------|---------------|
| E2E-UI | N/A — 0 cases | No UI surface in this ticket (BRD Story 1–5 + FSD §3.1.5: UI Specifications N/A). No screens, dialogs, or visual states change. A Playwright test would assert nothing. |
| SIT (manual exploratory) | N/A — 0 cases | Every deterministic scenario (resolution, validation, error contracts, per-tool wiring, schema surfaces, regression replay) is automated above. The REG replay needs a human only as a close-gate witness on the real host, classified under E2E-API. Residual risks (OI-3 macOS) are accepted limitations with follow-ups, not exploratory scope. Symlink-guard coverage runs as automated IT-10 (SQ-1) with graceful skip when symlink creation is unavailable — not exploratory SIT. |

---

## 7. Non-Functional Verification (mapped to cases, not separate cases)

| NFR | Target | Verified By |
|-----|--------|-------------|
| N-1 Resolution latency p95 < 0.1 ms, overhead < 5% of one fs call | 10k-resolve micro-benchmark in vitest | PBT/UT run annex |
| N-2 Activation ≤ +50 ms | Extension host profiling before/after | Close-gate annex |
| N-3 0 escape leaks on boundary corpus (extended N-QA2 quirks: trailing-dot/space, 8.3, `\\?`, drive-relative, forward-slash) | Fixed corpus + property fuzz | UT-03/04/09, UT-12, PBT-03 |
| N-4 Absolute position preservation | Representation-only normalization | UT-02, PBT-01, E2E-API-02 |
| N-5 Description-only schema diff | Snapshot deep-diff minus `description` | SCAN-01 step 5 |
| N-6 Agent self-heal ≤ 1 retry | Call counting in replay | E2E-API-01 step 4 |
| N-7 Module coverage ≥ 95% | `vitest --coverage` scoped to `PathResolver.ts` | UT-01..09 annex |
| N-8 Zero raw-resolve remnants | Symbol grep over `extension/src/` | SCAN-02 |
| N-9 Payload caps fail-loud (10 MB content / 25 MB pre-read, SA policy) | Limits enforced pre-write/pre-read | UT-14 |

---

## 8. Defect Seed Notes (for execution)

1. If UT-06 fails by rejecting outside-`cwd` absolute paths, the implementer restored the OLD `stream_write_file` semantics — point them at FSD §6.3 Note DISC-1 + BRD v1.0.1 §1.5 (BA ack), not at a test bug.
2. If IT-03 still shows `Programs\Kiro` in any ENOENT, the single-arg `resolve(file_path)` at `jira-attachment-tools.ts:21` was not replaced — Critical, P1.
3. If SCAN-01 fails only on `mem_ingest_file` (no description) or `drawio_export_png` (`reference only`), the M-1 overwrite rule was implemented as add-if-missing — the two verified holes from FSD §3.2.2.
4. If IT-05 string-mode tests break, the `Base64ProxyService` constructor union regressed — restore string branch before touching provider mode (TDD §13 rollback order C6).
5. `drawio_auto_layout` failing with every path variant is EXPECTED and out of scope (OI-1); only its two error branches (UT-10) gate this ticket.
6. T5b/UT-06: a relative-no-workspace call PASSING means BR-06b Step 2b is missing — point the implementer at TDD §3.2 Step 2b, not at a test bug; the v1.0 expectation (`ok:true`) is obsolete.
7. T-SEC01/IT-09 must be RED before the fix (attacker test per Security Review §4.1, N-QA1) — green-on-unfixed-code means the per-ref containment was not wired (check the `baseDir`/`root` args at the call site).
8. SQ-1 failure-to-create-symlink is a SKIP, not a defect — only a real escape PASSING through the guard is a defect (Major); record the skip reason in the test report.

---

## 9. Test Data Setup

```bash
# Fixtures live in documents/SA4E-356/testdata/ (7 CSVs, concrete values — never "valid data"):
#   path-resolution.csv   — UT-01..UT-15 rows (v1.1: UT-06 corrected BR-06b + A1 empty-array; +UT-11 T5b, UT-12 T8-ext, UT-15 backend casing)
#   boundary-corpus.csv   — UT-03/04/09/12 + PBT-03 + N-3 escape corpus (+ N-QA2 quirks: trailing-dot/space, 8.3, \\? both sides, drive-relative, forward-slash)
#   integration-tools.csv — IT-01..IT-10 + UT-13 (T-SEC01) + UT-14 (T-size) rows (v1.1: +IT-09 INT-2-ext, IT-10 SQ-1, IT-05 alias, IT-07 A2)
#   error-format.csv      — IT-05/07/08/UT-11 Format 1/2/3 templates + CODE:/Wrapper Error: prefixes (v1.1: +chat-marker, +Format 3)
#   schema-scan.csv       — SCAN-01/02 (tool × surface × keyword/suffix, grep patterns)
#   regression-replay.csv — E2E-API-01/02 (real SA4E-355 relative + absolute rows)
#   property-seeds.csv    — PBT-01..04 minimal seeds (fast-check extends at runtime)
```

```typescript
// Integration fixture pattern (per TDD §11.3 — mutate then RESTORE):
import * as vscode from "vscode";
const prev = vscode.workspace.workspaceFolders;
(vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: TMPDIR } }];
try {
  // ... test body (real fs under TMPDIR) ...
} finally {
  (vscode.workspace as any).workspaceFolders = prev; // MANDATORY restore
}
```

---

## 10. Requirements Traceability Matrix (RTM)

### 10.1 BRD Acceptance Criteria → Test Cases

| Requirement | Source | Test Cases | Coverage |
|-------------|--------|------------|----------|
| AC-1: Relative → workspace root; multi-root/fallback documented (+BR-06b reject, SEC-01/07) | BRD Story 1 | PBT-01, PBT-02, UT-01, UT-02, UT-05, UT-06, UT-11, UT-13, UT-14, IT-01, IT-02, IT-03, IT-04, IT-05, IT-06, IT-09 | ✅ |
| AC-2: Error carries resolved path + hint (+Format 3, chat marker, sanitize, backend casing) | BRD Story 2 | IT-07, IT-08, IT-05 (Wrapper Error: marker), UT-10, UT-11 (Format 3), UT-12 (sanitize), UT-15 | ✅ |
| AC-3: Shared helper + unit tests | BRD Story 3 | PBT-01, PBT-02, PBT-03, PBT-04, UT-01, UT-02, UT-03, UT-04, UT-05, UT-06, UT-07, UT-08, UT-09, UT-11, UT-12, UT-13, UT-15, IT-01..IT-06, IT-09, IT-10 | ✅ |
| AC-4: Descriptions on 100% audited tools | BRD Story 4 | SCAN-01 | ✅ |
| AC-5: SA4E-355 replay with relative path | BRD Story 5 | E2E-API-01, E2E-API-02 | ✅ |

### 10.2 FSD Functional Requirements → Test Cases

| Requirement | Source | Test Cases | Coverage |
|-------------|--------|------------|----------|
| FR-01: Single shared helper, no inline resolve | FSD §3.1 | UT-01..UT-09, PBT-01..04, SCAN-02 | ✅ |
| FR-02: Relative → primary folder, read per call | FSD §3.1 | UT-01, UT-05, UT-08, PBT-02 | ✅ |
| FR-03: Absolute passthrough `path.resolve(raw)` | FSD §3.1 | UT-02, PBT-01, E2E-API-02 | ✅ |
| FR-04: Case-insensitive containment on win32 | FSD §3.1 | UT-07, PBT-04, IT-01 | ✅ |
| FR-05: Containment on every workspace-rooted path; escape → Format 2 | FSD §3.1 | UT-03, UT-04, PBT-03, IT-08 | ✅ |
| FR-06: No workspace → `cwd_fallback`, NO containment for absolute (DISC-1); relative REJECTED per BR-06b (v1.2) | FSD §3.1 + TDD §3.2 Step 2b | UT-06, UT-11, IT-07 | ✅ |
| FR-07: Multi-root always primary; rule in description + errors | FSD §3.1 | UT-05, SCAN-01 | ✅ |
| FR-08: Fail-loud errors with path + root + hint + code (+Format 3, sanitize, chat marker) | FSD §3.1 + TDD §5.7/§10.1 | IT-07, IT-08, IT-05 (marker), UT-11, UT-12 | ✅ |
| FR-09: Standard description text on 100% tools + `output_path` | FSD §3.2.2 | SCAN-01 | ✅ |
| FR-10: Unit T1–T6 pass + ≥1 integration call per tool (+v1.2 security tests) | FSD §3.3.1 | UT-01..UT-07, UT-11..UT-15, IT-01..IT-06, IT-09, IT-10 | ✅ |
| FR-11: REG replay relative → success on real host | FSD §3.3.1 | E2E-API-01, E2E-API-02 | ✅ |

### 10.3 FSD Use Cases → Test Cases

| Requirement | Source | Test Cases | Coverage |
|-------------|--------|------------|----------|
| UC-01 Relative → workspace (main; AF-1 fallback; AF-2 no-cache; EF-1 ENOENT; EF-2 reject-forward; EF-3 PATH_EMPTY/PATH_INVALID; EF-4 symlink guard) | FSD §3.1.2 | UT-01, UT-06, UT-08, UT-09, UT-11, UT-12, IT-01..IT-06, IT-07, IT-08, IT-09, IT-10 | ✅ |
| UC-02 Absolute passthrough (main; AF-1 casing; EF-1 outside-blocked; EF-2 empty; EF-3 normalization) | FSD §3.1.2 | UT-02, UT-07, UT-09, PBT-01, IT-01, E2E-API-02 | ✅ |
| UC-03 Escape blocked (main; AF-1 absolute-outside; AF-2 UNC; EF-1 casing-strictness; EF-2 prefix-collision; NUL-hidden escape) | FSD §3.1.2 | UT-03, UT-04, UT-09, UT-12, PBT-03, IT-08, IT-09 | ✅ |
| UC-04 Self-correcting ENOENT (main; AF-1 one-retry-stop; EF-1 other-fs-errors; EF-2 fallback wording; chat marker) | FSD §3.1.2 | IT-07, IT-05 (marker), UT-06, UT-11 | ✅ |
| UC-05 Multi-root primary (main; AF-1 folder-2 hint; EF-1 empty-list; EF-2 fsPath-throw) | FSD §3.1.2 | UT-05, UT-08, SCAN-01, IT-07 | ✅ |

### 10.4 FSD Business Rules → Test Cases

| Requirement | Source | Test Cases | Coverage |
|-------------|--------|------------|----------|
| BR-01 Single source of truth | FSD §3.1.3 | UT-01..09, PBT-01..04, SCAN-02 | ✅ |
| BR-02 Relative → primary folder | FSD §3.1.3 | UT-01, UT-05, IT-01..06 | ✅ |
| BR-03 Absolute passthrough | FSD §3.1.3 | UT-02, PBT-01, E2E-API-02 | ✅ |
| BR-04 Case-insensitive on Windows | FSD §3.1.3 | UT-07, PBT-04 | ✅ |
| BR-05 Escape blocked (workspace branch; cwd_fallback exempt per DISC-1; +per-ref +symlink guard v1.2) | FSD §3.1.3 + TDD §5.4.1/§3.7 | UT-03, UT-04, UT-06, UT-13, PBT-03, IT-08, IT-09, IT-10 | ✅ |
| BR-06 Fallback `process.cwd()` + root in errors | FSD §3.1.3 | UT-06, UT-11, IT-07 | ✅ |
| BR-06b Relative REJECTED when cwd_fallback (`PATH_NO_WORKSPACE`, Format 3) — NEW v1.2 | TDD §3.2 Step 2b / AD-16 (BA ack N-BA2) | UT-06, UT-11, IT-07 | ✅ |
| BR-07 Multi-root primary deterministic | FSD §3.1.3 | UT-05, SCAN-01 | ✅ |
| BR-08 Fail-loud errors (path + root + hint; +sanitize +chat marker v1.2) | FSD §3.1.3 + TDD §5.7/§10.1 | IT-07, IT-08, IT-05 (marker), UT-12 | ✅ |
| BR-09 Signatures unchanged (descriptions only) | FSD §3.1.3 | SCAN-01 (N-5 diff) | ✅ |
| BR-10 100% `file_path.description` with rule | FSD §3.1.3 | SCAN-01 | ✅ |
| BR-11 `output_path` follows the same rule | FSD §3.1.3 | IT-02, IT-06, SCAN-01 | ✅ |
| BR-12 Out-of-host tools recorded; minimal message fix + backend win32 fold (SEC-04) | FSD §3.1.3 + TDD §5.4 row 10 | UT-10, UT-15 | ✅ |

### 10.5 Contract Rules & Error Codes → Test Cases

| Requirement | Source | Test Cases | Coverage |
|-------------|--------|------------|----------|
| C-1 Never throws | FSD §3.1.6.1 / TDD §3.6 | UT-09, UT-08 | ✅ |
| C-2 No I/O in helper | FSD §3.1.6.1 | UT-01 (postcondition), review gate | ✅ |
| C-3 Provider per call, no cache | FSD §3.1.6.1 | UT-08, PBT-02 | ✅ |
| C-4 Only `resolvedPath` reaches `fs.*` | FSD §3.1.6.1 | SCAN-02, IT-01..06 | ✅ |
| C-5 Messages forwarded verbatim | FSD §3.1.6.1 | IT-05, IT-08 | ✅ |
| C-6 Fail returns now, no fallback | FSD §3.1.6.1 | IT-08 | ✅ |
| `PATH_EMPTY` | FSD §9.3 | UT-09, IT-01 | ✅ |
| `PATH_REJECTED_OUTSIDE_WORKSPACE` | FSD §9.3 | UT-03, UT-04, PBT-03, IT-08, IT-09, IT-10 | ✅ |
| `PATH_INVALID` (v1.2, SEC-05) | TDD §7.1 | UT-12 | ✅ |
| `PATH_NO_WORKSPACE` (v1.2, SEC-02/BR-06b) | TDD §7.1 | UT-06, UT-11 | ✅ |
| `FILE_NOT_FOUND` | FSD §9.3 | IT-07 | ✅ |
| `FS_ERROR` | FSD §9.3 | IT-07 | ✅ |
| I-3 No HTTP on resolve-fail | FSD §5.5 / TDD §6.5 | IT-03, IT-04, IT-08 | ✅ |
| I-7 Parent-dir realpath guard (v1.2, SEC-03) | TDD §3.7 step 3.5 | IT-10, IT-01..IT-06 (guard in pattern) | ✅ |
| `Wrapper Error:` chat marker (v1.2, SEC-08a) | TDD §5.7 | IT-05 | ✅ |

**Coverage Summary:**

| Category | Total | Covered | Coverage % |
|----------|-------|---------|------------|
| Acceptance Criteria (AC-1..AC-5) | 5 | 5 | 100% |
| Functional Requirements (FR-01..FR-11) | 11 | 11 | 100% |
| Use Cases (UC-01..UC-05 + AF/EF) | 5 | 5 | 100% |
| Business Rules (BR-01..BR-12 + BR-06b) | 13 | 13 | 100% |
| Contract Rules (C-1..C-6) | 6 | 6 | 100% |
| Error Codes (6: +PATH_INVALID, +PATH_NO_WORKSPACE) | 6 | 6 | 100% |
| **Overall** | **46** | **46** | **100%** |

---

## 11. Appendix

### Environment Configuration

```bash
# Extension unit/integration (matches extension/vitest.config.ts):
cd extension && npx vitest run src/services/__tests__/path-resolver.test.ts        # UT-01..09 + PBT
cd extension && npx vitest run src/__tests__/backend-local-tools.test.ts          # IT-01/02
cd extension && npx vitest run src/mcp/atlassian/__tests__/attachment-tools.test.ts # IT-03/04
cd extension && npx vitest run src/proxy/__tests__/tool-proxy.test.ts             # IT-05 chat + D2
cd extension && npx vitest run src/__tests__/wrapper-server.test.ts               # IT-05 wrap + IT-06
cd extension && npx vitest run src/__tests__/schema-description-scan.test.ts      # SCAN-01
cd extension && npx vitest run --coverage src/services/__tests__/path-resolver.test.ts  # N-7 gate

# N-8 consistency scan (SCAN-02, scope extension/src/ only):
rg -n "resolve\(file_path\)|resolve\(args\.file_path\)|resolve\(a\.file_path\)" extension/src --glob '!*.test.ts' --glob '!services/PathResolver.ts'
```

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Test Coverage (AC/FR → cases → levels) | [test-coverage.png](diagrams/test-coverage.png) | [test-coverage.drawio](diagrams/test-coverage.drawio) |
| 2 | Test Execution Flow (unit → integration → e2e regression → close gate) | [test-execution-flow.png](diagrams/test-execution-flow.png) | [test-execution-flow.drawio](diagrams/test-execution-flow.drawio) |

> **Note (MCP degraded):** PNG export DEFERRED — SM to export after code-intel MCP restore.
