# Software Test Cases (STC)

## Code-Intel MCP Server — SA4E-394: [MCP Tools] Multi-Worktree Support — Per-Call base_dir Parameter for All file_path Tools

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-394 |
| Title | [MCP Tools] Hỗ trợ multi-worktree: tham số base_dir per-call (hoặc multi-root registry) cho mọi tool nhận file_path |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-11-01 |
| Status | Draft |
| Related STP | STP-v1.0-SA4E-394 (documents/SA4E-394/STP.md) |
| Related FSD | FSD-v1.1-SA4E-394.docx (documents/SA4E-394/FSD.md) |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-11-01 | QA Agent | Initiate document — auto-generated from FSD use cases (UC-1/2/3), business rules (BR-01…BR-23), test scenarios (TC-1…TC-11), TDD test hooks (T1–T10), and DISCREPANCY.md |

---

## Test Case Summary

| Category | ID Range | Count | Priority |
|----------|----------|-------|----------|
| Functional — Happy Path | TC-001 to TC-010 | 10 | High |
| Functional — Alternative Flows | TC-100 to TC-111 | 12 | High |
| Functional — Exception/Error Flows | TC-200 to TC-210 | 11 | High |
| Business Rule Validation | TC-300 to TC-314 | 15 | High |
| Boundary & Negative Testing | TC-400 to TC-408 | 9 | Medium (security TC-400…TC-405, TC-408: High) |
| UI/UX Testing | TC-500 range | 0 | N/A — no UI (FSD §3.1.5) |
| Non-Functional (Performance, Security) | TC-600 to TC-604 | 5 | Medium |
| Integration Testing | TC-700 to TC-704 | 5 | High |
| Regression Testing | TC-800 to TC-803 | 4 | Medium |
| **Total** | — | **71** | — |

**Level distribution:** PBT 1 (TC-408) · UT 37 · IT 28 · E2E-API 4 · SIT manual 1 (TC-603) — 70/71 automated (98.6%).

**Shared fixture notation (used in all Test Data fields):** `{TEMP_DIR}` = OS temp dir at runtime; `{TMP}` = `{TEMP_DIR}\sa4e394`; roots — `main` (legacy pinned root), `wt-a`, `wt-b` (registered worktrees), `wt-unreg` (unregistered), `wt-ghost` (registered, missing on disk), `outside` (outside all roots), `plainfile.txt` (file, not directory). Concrete rows: `test-data/path-resolution-cases.csv`, `test-data/allowlist-configs.csv`, `test-data/security-threat-cases.csv`, `test-data/schema-contract.csv`, `test-data/pre-seeded-worktrees.csv`.

---

## 1. Functional Test Cases — Happy Path

### TC-001: Shared resolver — relative file_path resolved against registered base_dir

| Field | Value |
|-------|-------|
| **ID** | TC-001 |
| **Priority** | High |
| **Type** | Functional — Unit (Vitest) |
| **Requirement** | UC-1 main flow, BR-02, BR-05, AC1 (BRD Story 1); FSD TC-1 |
| **Preconditions** | Allowlist CFG-01 loaded = {main, wt-a, wt-b}; resolver constructed with legacyRoot=`{TMP}\main`; `wt-b\documents\SA4E-394\BRD.md` exists |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `resolver.resolve({filePath:"documents/SA4E-394/BRD.md", baseDir:"{TMP}\\wt-b"})` | `ok:true`; `resolvedPath` = `{TMP}\wt-b\documents\SA4E-394\BRD.md` (absolute); `effectiveRoot` = `{TMP}\wt-b`; `rootSource` = `base_dir` |
| 2 | Assert result shape | `resolvedPath` starts with `effectiveRoot` + path separator; no error fields populated |

**Test Data:** path-resolution-cases.csv row RES-001.
**Postconditions:** No filesystem mutation (resolver performs at most stat/realpath).

---

### TC-002: Shared resolver — absolute file_path within base_dir accepted

| Field | Value |
|-------|-------|
| **ID** | TC-002 |
| **Priority** | High |
| **Type** | Functional — Unit (Vitest) |
| **Requirement** | UC-1 AF-4, BR-04, AC1; FSD TC-1 |
| **Preconditions** | Allowlist CFG-01; `wt-b\docs\plan.md` exists |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `resolver.resolve({filePath:"{TMP}\\wt-b\\docs\\plan.md", baseDir:"{TMP}\\wt-b"})` | `ok:true`; `resolvedPath` equals the input absolute path (normalized); `effectiveRoot` = wt-b |
| 2 | Assert no relative-resolution occurred | `resolvedPath` does not get re-prefixed; containment passes (path inside root) |

**Test Data:** path-resolution-cases.csv row RES-002.
**Postconditions:** No filesystem mutation.

---

### TC-003: stream_write_file — cross-worktree write via base_dir (V2 proof)

| Field | Value |
|-------|-------|
| **ID** | TC-003 |
| **Priority** | High |
| **Type** | Functional — Integration (Vitest, in-process handler) |
| **Requirement** | UC-1, BR-01, BR-02, BR-20, AC1; TDD §3.3 (both `path` and `file_path` names); TDD §10.4 V2 |
| **Preconditions** | Resolver injected into handler; allowlist CFG-01; `wt-b\tmp\` exists |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Invoke handler with `{path:"tmp/ug-proof.txt", content:"ok", base_dir:"{TMP}\\wt-b"}` (module-variant name) | `success:true`; file created at `wt-b\tmp\ug-proof.txt` with content `ok`; response cites the wt-b path |
| 2 | Invoke handler with `{file_path:"tmp/ug-proof2.txt", content:"ok2", base_dir:"{TMP}\\wt-b"}` (code-intel-variant name) | `success:true`; written under wt-b — both parameter names route through the resolver |
| 3 | Assert legacy root untouched | No `ug-proof.txt`/`ug-proof2.txt` created under `{TMP}\main` |

**Test Data:** path-resolution-cases.csv rows SWF-01, SWF-02.
**Postconditions:** Files exist under wt-b; cleaned up in afterEach.

---

### TC-004: mem_ingest_file — ingest document from worktree B

| Field | Value |
|-------|-------|
| **ID** | TC-004 |
| **Priority** | High |
| **Type** | Functional — Integration (Vitest, in-process handler) |
| **Requirement** | UC-1, BR-01, BR-02, AC1; TDD §3.3 (pre-read proxy + backend fallback) |
| **Preconditions** | Allowlist CFG-01; `wt-b\documents\SA4E-394\BRD.md` exists; memory module in test mode |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Invoke handler with `{file_path:"documents/SA4E-394/BRD.md", base_dir:"{TMP}\\wt-b"}` | Ingest succeeds; memory entry created whose source path resolves under wt-b |
| 2 | Invoke backend fallback with explicit `content_base64` + same path/base_dir | Same resolution outcome — resolver validates `file_path` identically |

**Test Data:** path-resolution-cases.csv rows MIF-01, MIF-02.
**Postconditions:** Memory entry exists; no entry ingested from legacy root.

---

### TC-005: embed_image — inline image from worktree B (extension adapter)

| Field | Value |
|-------|-------|
| **ID** | TC-005 |
| **Priority** | High |
| **Type** | Functional — Integration (Vitest, extension adapter contract) |
| **Requirement** | UC-1, BR-01, BR-02, BR-20, AC1; TDD §6.3 (C-5 extension surface) |
| **Preconditions** | Extension `PathResolver` adapter configured with allowlist mirror `{main, wt-a, wt-b}`; `wt-b\img\logo.png` exists |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `resolveWorkspacePath({filePath:"img/logo.png", baseDir:"{TMP}\\wt-b"})` via the adapter | `ok:true`; resolved path under wt-b; embed proceeds returning base64 of `wt-b\img\logo.png` |
| 2 | Assert identical contract | Same code/message contract as backend resolver for the same inputs (fixture parity, see TC-702) |

**Test Data:** path-resolution-cases.csv row EMB-01.
**Postconditions:** No file mutation.

---

### TC-006: drawio_export_png — export diagram from worktree B (file_path reference-only)

| Field | Value |
|-------|-------|
| **ID** | TC-006 |
| **Priority** | High |
| **Type** | Functional — Integration (Vitest, in-process handler) |
| **Requirement** | UC-1, BR-01, BR-02, AC1; DISC-4 (backend `file_path` is reference-only; `output_base64` returned) |
| **Preconditions** | Allowlist CFG-01; `wt-b\diag\flow.drawio` content available; `content_base64` of a valid diagram provided |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Invoke handler with `{content_base64:"<valid drawio>", file_path:"diag/flow.drawio", base_dir:"{TMP}\\wt-b"}` | `success:true`; `output_base64` PNG returned; `file_path` validated through resolver (reference semantics) |
| 2 | Assert write-back behavior | Backend writes only to its temp dir (no `output_path` write on backend); no file created under wt-b by the backend handler |

**Test Data:** path-resolution-cases.csv rows DEP-01, DEP-02.
**Postconditions:** No mutation of wt-b by backend handler.

---

### TC-007: drawio_auto_layout — layout file in worktree B

| Field | Value |
|-------|-------|
| **ID** | TC-007 |
| **Priority** | High |
| **Type** | Functional — Integration (Vitest, in-process handler) |
| **Requirement** | UC-1, BR-01, BR-02, AC1 |
| **Preconditions** | Allowlist CFG-01; `wt-b\diag\flow.drawio` exists with fixed layout |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Invoke handler with `{file_path:"diag/flow.drawio", base_dir:"{TMP}\\wt-b"}` | `ok:true`; layout applied and written to `wt-b\diag\flow.drawio` |
| 2 | Assert targeted file | File under wt-b modified; `main\diag` (if any) untouched |

**Test Data:** path-resolution-cases.csv rows DAL-01.
**Postconditions:** wt-b diagram updated.

---

### TC-008: sandbox_run — host-side resolution of `file` before sandbox mount

| Field | Value |
|-------|-------|
| **ID** | TC-008 |
| **Priority** | High |
| **Type** | Functional — Integration (Vitest, in-process handler) |
| **Requirement** | UC-1, BR-01, BR-02, AC1; DISC-2 (path argument is `file`); TDD §3.3 (resolution host-side pre-mount) |
| **Preconditions** | Allowlist CFG-01; `wt-b\script.py` exists; sandbox executor stubbed |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Invoke handler with `{file:"script.py", base_dir:"{TMP}\\wt-b"}` (executor stub captures mount input) | Resolution succeeds; executor receives resolved host path `{TMP}\wt-b\script.py` |
| 2 | Assert sandbox-internal semantics | Sandbox-internal path mapping unchanged — `mountSecurity.ts` inputs unaffected by `base_dir` |

**Test Data:** path-resolution-cases.csv rows SBR-01.
**Postconditions:** No mutation outside fixture.

---

### TC-009: jira_attach_file — attach file from worktree B (Atlassian stubbed)

| Field | Value |
|-------|-------|
| **ID** | TC-009 |
| **Priority** | High |
| **Type** | Functional — Integration (Vitest, stubbed Atlassian client) |
| **Requirement** | UC-1, BR-01, BR-02, AC1; TDD §6.4 (`ALLOWED_BASES`/`validateFilePath` replaced by shared resolver) |
| **Preconditions** | Allowlist CFG-01; `wt-b\docs\plan.md` exists; Jira client stub captures upload calls |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Invoke handler with `{file_path:"docs/plan.md", base_dir:"{TMP}\\wt-b", issueKey:"SA4E-394"}` (stub) | Resolver returns ok; stub upload called with content read from `{TMP}\wt-b\docs\plan.md` |
| 2 | Assert no legacy validation path | Old `ALLOWED_BASES=[process.cwd()]` containment is not consulted (replaced per TDD §6.4) |

**Test Data:** path-resolution-cases.csv rows JAF-01.
**Postconditions:** No real HTTP calls; fixture unchanged.

---

### TC-010: confluence_add_attachment — upload from worktree B (stubbed)

| Field | Value |
|-------|-------|
| **ID** | TC-010 |
| **Priority** | High |
| **Type** | Functional — Integration (Vitest, stubbed Atlassian client) |
| **Requirement** | UC-1, BR-01, BR-02, AC1; TDD §6.4 |
| **Preconditions** | Allowlist CFG-01; `wt-b\docs\plan.md` exists; Confluence client stub captures upload calls |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Invoke handler with `{file_path:"docs/plan.md", base_dir:"{TMP}\\wt-b", pageId:"123456"}` (stub) | Resolver ok; stub upload receives content from wt-b path |

**Test Data:** path-resolution-cases.csv rows CAA-01.
**Postconditions:** No real HTTP calls; fixture unchanged.

---

## 2. Functional Test Cases — Alternative Flows

### TC-100: base_dir omitted → legacy pinned root behavior (byte-identical parity)

| Field | Value |
|-------|-------|
| **ID** | TC-100 |
| **Priority** | High |
| **Type** | Functional — Alternative Flow — Unit (Vitest) |
| **Requirement** | UC-1 AF-1, BR-03, AC3 (BRD Story 1 req 3); FSD TC-3; TDD C-3 |
| **Preconditions** | Allowlist CFG-01; legacy pinned root = `{TMP}\main`; golden baseline recorded from pre-change behavior |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `resolver.resolve({filePath:"notes.txt"})` (no baseDir, no workspaceRoot) | `ok:true`; `resolvedPath` = `{TMP}\main\notes.txt`; `effectiveRoot` = main; `rootSource` = `legacy` |
| 2 | Compare against golden baseline snapshot | Path string, result payload, and (for rejections) error codes/messages are byte-identical to pre-change behavior (C-3) |

**Test Data:** path-resolution-cases.csv row RES-100; golden snapshot fixture (see TC-800).
**Postconditions:** No mutation.

---

### TC-101: workspace_root alias alone behaves identically to base_dir

| Field | Value |
|-------|-------|
| **ID** | TC-101 |
| **Priority** | High |
| **Type** | Functional — Alternative Flow — Unit (Vitest) |
| **Requirement** | UC-1 AF-2, BR-10; FSD TC-8 |
| **Preconditions** | Allowlist CFG-01; `wt-b\documents\SA4E-394\BRD.md` exists |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `resolver.resolve({filePath:"documents/SA4E-394/BRD.md", workspaceRoot:"{TMP}\\wt-b"})` | `ok:true`; `resolvedPath` under wt-b; behavior identical to TC-001 outcome (same `effectiveRoot`, `rootSource` = `base_dir`) |

**Test Data:** path-resolution-cases.csv row RES-101.
**Postconditions:** No mutation.

---

### TC-102: both base_dir and workspace_root provided → base_dir wins deterministically

| Field | Value |
|-------|-------|
| **ID** | TC-102 |
| **Priority** | High |
| **Type** | Functional — Alternative Flow — Unit (Vitest) |
| **Requirement** | UC-1 AF-2, BR-10; TDD §7.4 T10 (alias conflict) |
| **Preconditions** | Allowlist CFG-01 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `resolver.resolve({filePath:"notes.txt", baseDir:"{TMP}\\wt-b", workspaceRoot:"{TMP}\\wt-a"})` | `ok:true`; `resolvedPath` = `{TMP}\wt-b\notes.txt` — base_dir wins; wt-a value ignored (no merge, no union) |
| 2 | Swap the values (`base_dir`=wt-a, `workspace_root`=wt-b) | `resolvedPath` under wt-a — precedence follows base_dir, not argument order |

**Test Data:** path-resolution-cases.csv row RES-102.
**Postconditions:** No mutation.

---

### TC-103: relative base_dir normalized to absolute before validation

| Field | Value |
|-------|-------|
| **ID** | TC-103 |
| **Priority** | High |
| **Type** | Functional — Alternative Flow — Unit (Vitest) |
| **Requirement** | UC-1 AF-3, BR-09; FSD TC-7 |
| **Preconditions** | Server CWD = `{TMP}`; allowlist CFG-01 (absolute roots) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `resolver.resolve({filePath:"documents/SA4E-394/BRD.md", baseDir:"wt-b"})` | `ok:true`; relative `wt-b` normalized to `{TMP}\wt-b` BEFORE allowlist check; result identical to absolute form (TC-001) |

**Test Data:** path-resolution-cases.csv row RES-103.
**Postconditions:** No mutation.

---

### TC-104: allowlist loaded from config file (MCP_WORKSPACE_ROOTS_FILE)

| Field | Value |
|-------|-------|
| **ID** | TC-104 |
| **Priority** | High |
| **Type** | Functional — Alternative Flow — Unit (Vitest) |
| **Requirement** | UC-2 AF-2, BR-12; TDD §4.2 (line-based format: one root per line, `#` comments, blank lines skipped); DISC-5 |
| **Preconditions** | `MCP_WORKSPACE_ROOTS` unset; `MCP_WORKSPACE_ROOTS_FILE` points to a file containing comments, blank lines, and 2 roots (CFG-02) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `WorkspaceAllowlist.load(legacyRoot, logger, env)` | Registered roots = 2 (`main`, `wt-b`); comments/blank lines skipped; `legacyMode` = false |
| 2 | Resolve with `base_dir` = wt-b | `ok:true` — file-sourced root is usable as base_dir |
| 3 | Set BOTH env var and config file; call `load` | Env var wins (source precedence: env → file → legacy) |

**Test Data:** allowlist-configs.csv rows CFG-02, CFG-12.
**Postconditions:** No mutation.

---

### TC-105: in-root `../` segments in file_path are allowed (containment narrows, not forbids)

| Field | Value |
|-------|-------|
| **ID** | TC-105 |
| **Priority** | High |
| **Type** | Functional — Alternative Flow — Unit (Vitest) |
| **Requirement** | UC-1 AF-5, BR-07; TDD §7.4 T1 (in-root traversal allowed) |
| **Preconditions** | Allowlist CFG-01; `wt-b\docs\` exists |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `resolver.resolve({filePath:"docs/../documents/SA4E-394/BRD.md", baseDir:"{TMP}\\wt-b"})` | `ok:true`; `resolvedPath` = `{TMP}\wt-b\documents\SA4E-394\BRD.md` — final path inside effective root is accepted |
| 2 | Call with `filePath:"./tmp/x.txt"` | `ok:true` — current-dir segment resolves inside root |

**Test Data:** path-resolution-cases.csv row RES-105.
**Postconditions:** No mutation.

---

### TC-106: missing allowlist entry warns at startup but startup continues

| Field | Value |
|-------|-------|
| **ID** | TC-106 |
| **Priority** | High |
| **Type** | Functional — Alternative Flow — Unit (Vitest) |
| **Requirement** | UC-2 AF-3, BR-15; FSD TC-9; TDD P6 |
| **Preconditions** | CFG-04: `MCP_WORKSPACE_ROOTS` = main; wt-ghost (missing on disk); wt-b; plainfile.txt (file, not directory) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `WorkspaceAllowlist.load` | Startup does NOT abort; WARN logged naming each bad entry ("does not exist or is not a directory"); all 4 entries retained (P6) |
| 2 | Resolve with `base_dir` = wt-b | `ok:true` — valid entries still usable |

**Test Data:** allowlist-configs.csv row CFG-04.
**Postconditions:** No mutation.

---

### TC-107: duplicate entries deduplicated and symlinks resolved to real paths

| Field | Value |
|-------|-------|
| **ID** | TC-107 |
| **Priority** | High |
| **Type** | Functional — Alternative Flow — Unit (Vitest) |
| **Requirement** | UC-2 main step 4, BR-14; FSD TC-9; TDD P5/P7 |
| **Preconditions** | CFG-03 (duplicate `main` twice + wt-a); CFG-10 (`link-to-wt-a` symlink → wt-a); case-duplicate row CFG-13 for win32 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Load CFG-03 | `snapshot()` contains exactly 2 unique roots — duplicates silently merged (Set semantics) |
| 2 | Load CFG-10 | Symlink entry stored as its real path (`wt-a`), not the link path |
| 3 | Load CFG-13 (only on win32 leg) | Case-insensitive dedupe on win32; exact-case dedupe on POSIX |

**Test Data:** allowlist-configs.csv rows CFG-03, CFG-10, CFG-13 (symlink rows capability-guarded on Windows CI).
**Postconditions:** No mutation.

---

### TC-108: empty allowlist → legacy single-root mode

| Field | Value |
|-------|-------|
| **ID** | TC-108 |
| **Priority** | High |
| **Type** | Functional — Alternative Flow — Unit (Vitest) |
| **Requirement** | UC-2 AF-1, BR-16; FSD TC-10; TDD P8 |
| **Preconditions** | CFG-05 (env set to empty/only-delimiters) and CFG-06 (env unset) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Load with CFG-05 and CFG-06 | `isLegacyMode()` = true; INFO log "MCP_WORKSPACE_ROOTS empty — legacy single-root mode active"; only pinned root registered |
| 2 | Resolve with omitted base_dir | `ok:true` — legacy behavior intact in legacy mode |

**Test Data:** allowlist-configs.csv rows CFG-05, CFG-06.
**Postconditions:** No mutation.

---

### TC-109: platform delimiters — `;` on Windows, `:` on POSIX

| Field | Value |
|-------|-------|
| **ID** | TC-109 |
| **Priority** | Medium |
| **Type** | Functional — Alternative Flow — Unit (Vitest) |
| **Requirement** | BR-12; FSD TC-11; TDD P2 |
| **Preconditions** | CFG-08 (POSIX `:` list), CFG-09 (Windows `;` list) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | On POSIX leg, load CFG-08 | Parses into 2 normalized roots |
| 2 | On Windows leg, load CFG-09 | Parses into the same 2 normalized roots (modulo platform separators) — both delimiters yield equivalent sets |

**Test Data:** allowlist-configs.csv rows CFG-08, CFG-09.
**Postconditions:** No mutation.

---

### TC-110: sandbox_run — sandbox-internal path semantics unchanged

| Field | Value |
|-------|-------|
| **ID** | TC-110 |
| **Priority** | Medium |
| **Type** | Functional — Alternative Flow — Integration (Vitest, executor stub) |
| **Requirement** | FSD §3.3.4 (sandbox_run row); DISC-2; TDD §3.3 |
| **Preconditions** | Allowlist CFG-01; executor stub records mount arguments |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Resolve `file` via base_dir, then run handler | Only the host-side `file` value is transformed pre-mount; sandbox-internal paths/workdir semantics identical to no-base_dir invocation |

**Test Data:** path-resolution-cases.csv rows SBR-01, SBR-03.
**Postconditions:** No mutation.

---

### TC-111: drawio_export_png — extension output_path proxy resolution

| Field | Value |
|-------|-------|
| **ID** | TC-111 |
| **Priority** | Medium |
| **Type** | Functional — Alternative Flow — Integration (Vitest, adapter contract) |
| **Requirement** | DISC-4; TDD §3.3 (resolver touches `file_path` backend reference + `output_path` extension proxy) |
| **Preconditions** | Extension adapter with allowlist mirror; `wt-b\diag\flow.drawio` exists |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Extension output proxy resolves `output_path:"out/flow.png", base_dir:"{TMP}\\wt-b"` | Resolved under wt-b; PNG write-back lands inside effective root (containment on output side) |

**Test Data:** path-resolution-cases.csv row DEP-06.
**Postconditions:** Output file under wt-b; cleaned in afterEach.

---

## 3. Functional Test Cases — Exception/Error Flows

### TC-200: base_dir not in allowlist → PATH_REJECTED_OUTSIDE_ALLOWLIST, zero filesystem access

| Field | Value |
|-------|-------|
| **ID** | TC-200 |
| **Priority** | High |
| **Type** | Functional — Exception Flow — Integration (Vitest, in-process handler + fs spy) |
| **Requirement** | UC-1 EF-1, UC-3 main flow, BR-05, BR-23, AC2 (BRD Story 4); FSD TC-2 |
| **Preconditions** | Allowlist CFG-01; `wt-unreg` exists on disk but is NOT registered; fs call spy attached |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Invoke stream_write_file with `{path:"x.txt", content:"v", base_dir:"{TMP}\\wt-unreg"}` | `isError:true`; text = `PATH_REJECTED_OUTSIDE_ALLOWLIST: Workspace root '{TMP}\wt-unreg' is not registered in the allowlist. Configure MCP_WORKSPACE_ROOTS to include this path.` (verbatim FSD §3.1.6) |
| 2 | Inspect fs spy | Zero write/read syscalls on any target — rejection aborts BEFORE any filesystem access (BR-23) |
| 3 | Inspect captured logs | WARN audit event with fields `tool_name`, `base_dir` (sanitized), `file_path` (sanitized), `code: PATH_REJECTED_OUTSIDE_ALLOWLIST` (FSD §7.3) |

**Test Data:** path-resolution-cases.csv rows SWF-02 (repeated for all 8 tools via TC-307…TC-314 S2).
**Postconditions:** No file created anywhere; system state stable.

---

### TC-201: registered-format base_dir missing on disk → FS_ERROR

| Field | Value |
|-------|-------|
| **ID** | TC-201 |
| **Priority** | High |
| **Type** | Functional — Exception Flow — Unit (Vitest) |
| **Requirement** | UC-1 EF-2, BR-06; FSD TC-6; TDD §3.4 row 2 |
| **Preconditions** | CFG-04 — `wt-ghost` IS in the allowlist but does not exist on disk |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `resolver.resolve({filePath:"x.txt", baseDir:"{TMP}\\wt-ghost"})` | `ok:false`; `code` = `FS_ERROR`; message = `FS_ERROR: Workspace root '{TMP}\wt-ghost' does not exist on filesystem` |
| 2 | Assert precedence | Error is FS_ERROR, NOT `PATH_REJECTED_*` (existence check runs after allowlist pass — BR-11) |

**Test Data:** path-resolution-cases.csv row RES-201; allowlist-configs.csv CFG-04.
**Postconditions:** No mutation.

---

### TC-202: `../` traversal escaping base_dir → containment rejection

| Field | Value |
|-------|-------|
| **ID** | TC-202 |
| **Priority** | High |
| **Type** | Functional — Exception Flow — Unit (Vitest) |
| **Requirement** | UC-1 EF-3, BR-07, AC4; FSD TC-4; TDD §7.4 T1 |
| **Preconditions** | Allowlist CFG-01; `outside\evil.txt` exists OUTSIDE all roots |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `resolver.resolve({filePath:"../../../outside/evil.txt", baseDir:"{TMP}\\wt-b"})` | `ok:false`; `code` = `PATH_REJECTED_OUTSIDE_ALLOWLIST`; message = `... Resolved path '{resolved}' is outside workspace root '{TMP}\wt-b'` (containment AFTER resolution) |
| 2 | Repeat via handler (stream_write_file) with same input | `isError:true`, same code/message; no file created under `outside\` |

**Test Data:** path-resolution-cases.csv rows RES-202, SWF-05.
**Postconditions:** No mutation; `outside\` untouched.

---

### TC-203: absolute file_path outside base_dir → rejection

| Field | Value |
|-------|-------|
| **ID** | TC-203 |
| **Priority** | High |
| **Type** | Functional — Exception Flow — Unit (Vitest) |
| **Requirement** | UC-1 EF-3, BR-04, BR-07, AC4; FSD TC-4; TDD §7.4 T2 |
| **Preconditions** | Allowlist CFG-01 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `resolver.resolve({filePath:"{TMP}\\outside\\evil.txt", baseDir:"{TMP}\\wt-b"})` | `ok:false`; `code` = `PATH_REJECTED_OUTSIDE_ALLOWLIST`; containment message as TC-202 |
| 2 | Same absolute path with `base_dir` = wt-a | Rejected identically — containment enforced against whichever effective root |

**Test Data:** path-resolution-cases.csv rows RES-203, SWF-04 pattern.
**Postconditions:** No mutation.

---

### TC-204: legacy rejection when base_dir omitted → PATH_REJECTED_OUTSIDE_WORKSPACE preserved

| Field | Value |
|-------|-------|
| **ID** | TC-204 |
| **Priority** | High |
| **Type** | Functional — Exception Flow — Unit (Vitest) |
| **Requirement** | UC-1 AF-1, BR-03, AC3; FSD §3.1.6 (legacy row); TDD §3.4 row 4 |
| **Preconditions** | Allowlist CFG-01; legacy pinned root = main |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `resolver.resolve({filePath:"{TMP}\\outside\\evil.txt"})` (no base_dir) | `ok:false`; `code` = `PATH_REJECTED_OUTSIDE_WORKSPACE` (legacy code preserved); message = unchanged legacy text (e.g., drawio-tool.ts:48 format) |
| 2 | Compare with golden legacy baseline | Code + message byte-identical to pre-change behavior; log level INFO (legacy row unchanged) |

**Test Data:** path-resolution-cases.csv row RES-204.
**Postconditions:** No mutation.

---

### TC-205: base_dir points to a file (not a directory) → FS_ERROR

| Field | Value |
|-------|-------|
| **ID** | TC-205 |
| **Priority** | High |
| **Type** | Functional — Exception Flow — Unit (Vitest) |
| **Requirement** | UC-1 EF-2, BR-06; TDD P6 (entry retained with warning; per-call check guards) |
| **Preconditions** | CFG-04 — `plainfile.txt` registered (with startup warning) but is a regular file |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `resolver.resolve({filePath:"x.txt", baseDir:"{TMP}\\plainfile.txt"})` | `ok:false`; `code` = `FS_ERROR`; message = `FS_ERROR: Workspace root '{TMP}\plainfile.txt' does not exist on filesystem` (not-directory treated as existence/is-directory failure) |

**Test Data:** path-resolution-cases.csv row RES-205; allowlist-configs.csv CFG-04.
**Postconditions:** No mutation.

---

### TC-206: OS permission denied on the operation → FS_ERROR with OS details

| Field | Value |
|-------|-------|
| **ID** | TC-206 |
| **Priority** | High |
| **Type** | Functional — Exception Flow — Integration (Vitest) |
| **Requirement** | UC-1 EF-4; FSD §3.1.6 (permission denied row) |
| **Preconditions** | Allowlist CFG-01; `wt-b\locked.txt` made read-only (POSIX chmod 444 / Windows read-only attribute); resolver passes (root valid) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Invoke stream_write_file targeting the locked file with valid base_dir | `isError:true`; text starts `FS_ERROR:` followed by OS error details (EACCES/EPERM); no partial content written |
| 2 | Restore permissions and retry | Operation succeeds — failure was OS-level, not resolution-level |

**Test Data:** path-resolution-cases.csv row SWF-06 (permission fixture).
**Postconditions:** Permissions restored in afterEach; state stable.

---

### TC-207: empty allowlist + base_dir provided → rejected even if directory exists

| Field | Value |
|-------|-------|
| **ID** | TC-207 |
| **Priority** | High |
| **Type** | Functional — Exception Flow — Unit (Vitest) |
| **Requirement** | UC-1 EF-5, BR-16, AC2; FSD TC-10; TDD P8 |
| **Preconditions** | CFG-05 — allowlist empty (legacy mode); `wt-b` exists on disk |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `resolver.resolve({filePath:"notes.txt", baseDir:"{TMP}\\wt-b"})` | `ok:false`; `code` = `PATH_REJECTED_OUTSIDE_ALLOWLIST` — any base_dir is rejected in legacy mode (empty allowlist enables legacy only) |

**Test Data:** allowlist-configs.csv CFG-05; path-resolution-cases.csv row RES-207.
**Postconditions:** No mutation.

---

### TC-208: unreadable config file → warn, fall back to legacy mode

| Field | Value |
|-------|-------|
| **ID** | TC-208 |
| **Priority** | Medium |
| **Type** | Functional — Exception Flow — Unit (Vitest) |
| **Requirement** | UC-2 EF-2, BR-12; TDD P1 (EF-2 of UC-2) |
| **Preconditions** | CFG-07 — `MCP_WORKSPACE_ROOTS` unset; `MCP_WORKSPACE_ROOTS_FILE` points to an unreadable/garbage file |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `WorkspaceAllowlist.load` | WARN logged (config unreadable/unparseable); treated as empty → legacy mode; startup NOT blocked |
| 2 | Resolve with omitted base_dir | `ok:true` — legacy behavior intact |

**Test Data:** allowlist-configs.csv CFG-07.
**Postconditions:** No mutation.

---

### TC-209: resolver internal failure → generic error, no partial writes

| Field | Value |
|-------|-------|
| **ID** | TC-209 |
| **Priority** | Medium |
| **Type** | Functional — Exception Flow — Integration (Vitest, injected fault) |
| **Requirement** | UC-3 EF-2; TDD §5.4 (unexpected internal failure row) |
| **Preconditions** | Fault injection: stat/realpath throws an unexpected non-business error |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Trigger handler with injected resolver-internal exception | Tool returns generic `isError:true` result (caught by ToolRouter/withErrorHandling); no raw stack leak to caller |
| 2 | Inspect target directory | No partial file/write left behind — operation atomicity preserved |

**Test Data:** fault-injection fixture (unit-level stub).
**Postconditions:** State stable, no artifacts.

---

### TC-210: error precedence matrix — allowlist → existence → containment (BR-11)

| Field | Value |
|-------|-------|
| **ID** | TC-210 |
| **Priority** | High |
| **Type** | Functional — Exception Flow — Unit (Vitest) |
| **Requirement** | BR-11; FSD Change Log #2; TDD §3.4 invariants; TC-extra (error precedence) |
| **Preconditions** | CFG-04 (registered+missing wt-ghost; registered plainfile) + CFG-01 (registered wt-b; unregistered wt-unreg) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Unregistered AND missing root (`base_dir` = nonexistent non-registered path) | `PATH_REJECTED_OUTSIDE_ALLOWLIST` — allowlist failure NEVER surfaces as FS_ERROR |
| 2 | Registered but missing (`base_dir` = wt-ghost) | `FS_ERROR` — existence failure NEVER surfaces as `PATH_REJECTED_*` |
| 3 | Registered + exists + escaping file_path (wt-b + `../outside/x`) | `PATH_REJECTED_OUTSIDE_ALLOWLIST` (containment message) — containment evaluated last, only after allowlist+existence pass |

**Test Data:** path-resolution-cases.csv rows RES-210a/b/c.
**Postconditions:** No mutation.

---

## 4. Business Rule Validation

### TC-300: BR-01 + BR-21 — base_dir accepted by all 8 tools; inventory fixed

| Field | Value |
|-------|-------|
| **ID** | TC-300 |
| **Priority** | High |
| **Type** | Business Rule — Integration (Vitest, tools/list registry) |
| **Requirement** | BR-01, BR-21; AC5 prerequisite; TDD §3.3 |
| **Preconditions** | All 8 tool definitions registered; schema-contract.csv loaded |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Enumerate tool definitions (registry / `tools/list` payload in-process) | Exactly the 8 tools present: mem_ingest_file, embed_image, drawio_export_png, drawio_auto_layout, jira_attach_file, confluence_add_attachment, sandbox_run, stream_write_file |
| 2 | For each tool, inspect `inputSchema.properties` | `base_dir` AND `workspace_root` present; neither listed in `required` (backward compatible — BR-03) |
| 3 | Assert per-tool path-argument names (DISCREPANCY.md) | `file_path` on 6 tools; `file` on sandbox_run; both `path` and `file_path` on stream_write_file |

**Test Data:** schema-contract.csv (8 rows — all must PASS).
**Postconditions:** None (read-only).

---

### TC-301: BR-08 + BR-22 — schema documents base_dir with description + example (AC5)

| Field | Value |
|-------|-------|
| **ID** | TC-301 |
| **Priority** | High |
| **Type** | Business Rule — Unit (Vitest, schema snapshot) |
| **Requirement** | BR-08, BR-22; AC5 (BRD Story 1 req 5 / Story 3 AC 5); FSD TC-5; TDD §3.2 |
| **Preconditions** | All 8 schemas available in-process |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | For each of the 8 tools, read `base_dir` schema node | `type:"string"`; non-empty description; description contains an example path AND mentions the allowlist/`MCP_WORKSPACE_ROOTS` |
| 2 | Read `workspace_root` schema node | Described as deprecated alias of base_dir; identical semantics documented |
| 3 | Assert per TDD §3.2 | Validation NOT enforced via JSON-schema `pattern` (schema stays permissive — validation lives in the resolver) |

**Test Data:** schema-contract.csv; TDD §3.2 schema fragment as expected baseline.
**Postconditions:** None.

---

### TC-302: BR-13 — allowlist loaded once and cached (no per-call re-read)

| Field | Value |
|-------|-------|
| **ID** | TC-302 |
| **Priority** | High |
| **Type** | Business Rule — Unit (Vitest) |
| **Requirement** | BR-13; TDD §8.1 |
| **Preconditions** | Allowlist CFG-01 loaded once |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | After load, mutate `process.env.MCP_WORKSPACE_ROOTS` to add a new root `{TMP}\wt-new` | `allowlist.contains("{TMP}\\wt-new")` remains FALSE — membership uses the startup snapshot |
| 2 | Resolve with `base_dir` = wt-new | Rejected with `PATH_REJECTED_OUTSIDE_ALLOWLIST` — config re-read never occurs per call (BR-17 compatible) |

**Test Data:** allowlist-configs.csv CFG-11.
**Postconditions:** env restored in afterEach.

---

### TC-303: BR-19 — allowlist logged at startup (INFO)

| Field | Value |
|-------|-------|
| **ID** | TC-303 |
| **Priority** | High |
| **Type** | Business Rule — Integration (Vitest, pino in-memory transport) |
| **Requirement** | BR-19; AC2 of BRD Story 2; TDD §9.1 |
| **Preconditions** | CFG-01 with pino log capture |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Boot allowlist + resolver wiring; inspect captured logs | INFO entry "MCP workspace allowlist loaded" listing `roots` (snapshot), `source` (env/config_file), `legacyMode`, `count` |

**Test Data:** allowlist-configs.csv CFG-01.
**Postconditions:** None.

---

### TC-304: BR-18 — primary checkout and multiple Orca worktrees usable simultaneously

| Field | Value |
|-------|-------|
| **ID** | TC-304 |
| **Priority** | High |
| **Type** | Business Rule — Integration (Vitest) |
| **Requirement** | BR-18; BRD Story 2 req 6 |
| **Preconditions** | Allowlist CFG-01 (main + wt-a + wt-b) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | In ONE server lifetime, resolve sequentially with `base_dir` = main, then wt-a, then wt-b | All three return `ok:true` — coexistence of primary checkout + worktrees in one allowlist |

**Test Data:** allowlist-configs.csv CFG-01; path-resolution-cases.csv RES-304a/b/c.
**Postconditions:** No mutation.

---

### TC-305: BR-17 — allowlist changes require restart (no hot reload)

| Field | Value |
|-------|-------|
| **ID** | TC-305 |
| **Priority** | High |
| **Type** | Business Rule — Integration (Vitest) |
| **Requirement** | BR-17; BRD Story 2 AC 5 |
| **Preconditions** | Server (or DI container) booted with CFG-01 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Change `MCP_WORKSPACE_ROOTS` (add wt-unreg) WITHOUT restart | Calls with `base_dir` = wt-unreg STILL rejected — no hot reload, no watcher, no runtime mutation path |
| 2 | Rebuild allowlist (simulated restart) and reload | wt-unreg now accepted — change takes effect only on restart |

**Test Data:** allowlist-configs.csv CFG-11.
**Postconditions:** env restored.

---

### TC-306: BR-11 — pipeline step order verified by instrumentation

| Field | Value |
|-------|-------|
| **ID** | TC-306 |
| **Priority** | High |
| **Type** | Business Rule — Unit (Vitest, call-order instrumentation) |
| **Requirement** | BR-11 (normalize → allowlist → existence → resolve → containment); TDD §3.2 resolution order |
| **Preconditions** | FS spy records stat/realpath call order; allowlist Set lookup instrumented |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Resolve with unregistered base_dir | Set lookup occurs; NO stat/realpath call — allowlist strictly before existence |
| 2 | Resolve with registered missing base_dir | stat called; containment string check never reached |
| 3 | Resolve valid + escaping path | normalize → Set lookup → stat → resolve → containment check order observed; containment runs AFTER resolution |

**Test Data:** allowlist-configs.csv CFG-04.
**Postconditions:** None.

---

### TC-307: BR-20 per-tool matrix — stream_write_file (path argument `path`/`file_path`)

| Field | Value |
|-------|-------|
| **ID** | TC-307 |
| **Priority** | High |
| **Type** | Business Rule — Integration (Vitest, parametrized suite) |
| **Requirement** | BR-20, BR-01; AC1–AC4; FSD TC-1…TC-4; DISC-3 (both parameter names) |
| **Preconditions** | Allowlist CFG-01; fixtures per pre-seeded-worktrees.csv; target file: `tests/e2e` n/a — in-process suite `multi-worktree-path-resolver` + handler suites |

**Test Steps (parametrized — data rows SWF-01…SWF-05):**

| Step | Scenario (FSD TC) | Input | Expected Result |
|------|-------------------|-------|-----------------|
| 1 | S1 cross-worktree success (TC-1/AC1) | `path:"tmp/ug-proof.txt"`, `base_dir`=wt-b | Success; file written under wt-b |
| 2 | S2 unregistered root (TC-2/AC2) | `base_dir`=wt-unreg | `PATH_REJECTED_OUTSIDE_ALLOWLIST` verbatim message; no FS access |
| 3 | S3 omitted (TC-3/AC3) | no base_dir | Legacy pinned-root behavior byte-identical (BR-03) |
| 4 | S4 absolute outside (TC-4/AC4) | `path` = `{TMP}\outside\evil.txt` | `PATH_REJECTED_OUTSIDE_ALLOWLIST` containment message |
| 5 | S5 traversal escape (TC-4/AC4) | `path:"../../../outside/evil.txt"` | `PATH_REJECTED_OUTSIDE_ALLOWLIST` containment message |
| 6 | Param-name parity (DISC-3) | Repeat S1 with `file_path` instead of `path` | Identical outcome — both names route through the resolver |

**Test Data:** path-resolution-cases.csv rows SWF-01…SWF-05.
**Postconditions:** Fixture files cleaned in afterEach.

---

### TC-308: BR-20 per-tool matrix — mem_ingest_file

| Field | Value |
|-------|-------|
| **ID** | TC-308 |
| **Priority** | High |
| **Type** | Business Rule — Integration (Vitest, parametrized suite) |
| **Requirement** | BR-20, BR-01; AC1–AC4; FSD TC-1…TC-4 |
| **Preconditions** | Allowlist CFG-01; `wt-b\documents\SA4E-394\BRD.md` exists |

**Test Steps (data rows MIF-01…MIF-05):**

| Step | Scenario | Input | Expected Result |
|------|----------|-------|-----------------|
| 1 | S1 (AC1) | `file_path:"documents/SA4E-394/BRD.md"`, `base_dir`=wt-b | Ingest succeeds from wt-b |
| 2 | S2 (AC2) | `base_dir`=wt-unreg | `PATH_REJECTED_OUTSIDE_ALLOWLIST`; no ingest, no read |
| 3 | S3 (AC3) | no base_dir | Legacy resolution against main |
| 4 | S4 (AC4) | absolute path outside wt-b | Containment rejection |
| 5 | S5 (AC4) | `file_path:"../../../outside/x.md"` | Containment rejection |

**Test Data:** path-resolution-cases.csv MIF-01…MIF-05.
**Postconditions:** Memory entries cleaned.

---

### TC-309: BR-20 per-tool matrix — embed_image (extension adapter)

| Field | Value |
|-------|-------|
| **ID** | TC-309 |
| **Priority** | High |
| **Type** | Business Rule — Integration (Vitest, extension contract fixture) |
| **Requirement** | BR-20, BR-01; AC1–AC4; TDD §6.3 (C-5) |
| **Preconditions** | Extension adapter allowlist mirror = {main, wt-a, wt-b}; `wt-b\img\logo.png` exists |

**Test Steps (data rows EMB-01…EMB-05):**

| Step | Scenario | Input | Expected Result |
|------|----------|-------|-----------------|
| 1 | S1 (AC1) | `file_path:"img/logo.png"`, `base_dir`=wt-b | Base64 of wt-b image returned |
| 2 | S2 (AC2) | `base_dir`=wt-unreg | `PATH_REJECTED_OUTSIDE_ALLOWLIST` — identical code/message contract as backend |
| 3 | S3 (AC3) | no base_dir | Legacy root behavior |
| 4 | S4 (AC4) | absolute path outside | Containment rejection |
| 5 | S5 (AC4) | `../` escape | Containment rejection |

**Test Data:** path-resolution-cases.csv EMB-01…EMB-05.
**Postconditions:** None.

---

### TC-310: BR-20 per-tool matrix — drawio_export_png (file_path reference-only)

| Field | Value |
|-------|-------|
| **ID** | TC-310 |
| **Priority** | High |
| **Type** | Business Rule — Integration (Vitest, parametrized suite) |
| **Requirement** | BR-20, BR-01; AC1–AC4; DISC-4 |
| **Preconditions** | Allowlist CFG-01; `wt-b\diag\flow.drawio` content in fixture |

**Test Steps (data rows DEP-01…DEP-05):**

| Step | Scenario | Input | Expected Result |
|------|----------|-------|-----------------|
| 1 | S1 (AC1) | `file_path:"diag/flow.drawio"`, `base_dir`=wt-b, valid `content_base64` | Success; `output_base64` returned (reference semantics) |
| 2 | S2 (AC2) | `base_dir`=wt-unreg | `PATH_REJECTED_OUTSIDE_ALLOWLIST` |
| 3 | S3 (AC3) | no base_dir | Legacy behavior |
| 4 | S4 (AC4) | absolute outside | Containment rejection |
| 5 | S5 (AC4) | `../` escape | Containment rejection |

**Test Data:** path-resolution-cases.csv DEP-01…DEP-05.
**Postconditions:** None.

---

### TC-311: BR-20 per-tool matrix — drawio_auto_layout

| Field | Value |
|-------|-------|
| **ID** | TC-311 |
| **Priority** | High |
| **Type** | Business Rule — Integration (Vitest, parametrized suite) |
| **Requirement** | BR-20, BR-01; AC1–AC4 |
| **Preconditions** | Allowlist CFG-01; `wt-b\diag\flow.drawio` exists |

**Test Steps (data rows DAL-01…DAL-05):**

| Step | Scenario | Input | Expected Result |
|------|----------|-------|-----------------|
| 1 | S1 (AC1) | `file_path:"diag/flow.drawio"`, `base_dir`=wt-b | Layout applied in wt-b |
| 2 | S2 (AC2) | `base_dir`=wt-unreg | `PATH_REJECTED_OUTSIDE_ALLOWLIST` |
| 3 | S3 (AC3) | no base_dir | Legacy behavior |
| 4 | S4 (AC4) | absolute outside | Containment rejection |
| 5 | S5 (AC4) | `../` escape | Containment rejection |

**Test Data:** path-resolution-cases.csv DAL-01…DAL-05.
**Postconditions:** Fixture cleaned.

---

### TC-312: BR-20 per-tool matrix — jira_attach_file (Atlassian stubbed)

| Field | Value |
|-------|-------|
| **ID** | TC-312 |
| **Priority** | High |
| **Type** | Business Rule — Integration (Vitest, stubbed client) |
| **Requirement** | BR-20, BR-01, BR-23; AC1–AC4; TDD §6.4 |
| **Preconditions** | Allowlist CFG-01; `wt-b\docs\plan.md` exists; stub records upload attempts |

**Test Steps (data rows JAF-01…JAF-05):**

| Step | Scenario | Input | Expected Result |
|------|----------|-------|-----------------|
| 1 | S1 (AC1) | `file_path:"docs/plan.md"`, `base_dir`=wt-b | Upload stub receives wt-b content |
| 2 | S2 (AC2) | `base_dir`=wt-unreg | `PATH_REJECTED_OUTSIDE_ALLOWLIST`; ZERO Atlassian HTTP calls (BR-23) |
| 3 | S3 (AC3) | no base_dir | Legacy behavior (old cwd-based containment replaced — golden parity of allowed cases) |
| 4 | S4 (AC4) | absolute outside | Containment rejection; no upload |
| 5 | S5 (AC4) | `../` escape | Containment rejection; no upload |

**Test Data:** path-resolution-cases.csv JAF-01…JAF-05.
**Postconditions:** No real HTTP traffic.

---

### TC-313: BR-20 per-tool matrix — confluence_add_attachment (Atlassian stubbed)

| Field | Value |
|-------|-------|
| **ID** | TC-313 |
| **Priority** | High |
| **Type** | Business Rule — Integration (Vitest, stubbed client) |
| **Requirement** | BR-20, BR-01, BR-23; AC1–AC4; TDD §6.4 |
| **Preconditions** | Allowlist CFG-01; `wt-b\docs\plan.md` exists; stub records upload attempts |

**Test Steps (data rows CAA-01…CAA-05):**

| Step | Scenario | Input | Expected Result |
|------|----------|-------|-----------------|
| 1 | S1 (AC1) | `file_path:"docs/plan.md"`, `base_dir`=wt-b | Upload stub receives wt-b content |
| 2 | S2 (AC2) | `base_dir`=wt-unreg | `PATH_REJECTED_OUTSIDE_ALLOWLIST`; zero HTTP calls |
| 3 | S3 (AC3) | no base_dir | Legacy behavior |
| 4 | S4 (AC4) | absolute outside | Containment rejection |
| 5 | S5 (AC4) | `../` escape | Containment rejection |

**Test Data:** path-resolution-cases.csv CAA-01…CAA-05.
**Postconditions:** No real HTTP traffic.

---

### TC-314: BR-20 per-tool matrix — sandbox_run (path argument `file`)

| Field | Value |
|-------|-------|
| **ID** | TC-314 |
| **Priority** | High |
| **Type** | Business Rule — Integration (Vitest, executor stub) |
| **Requirement** | BR-20, BR-01; AC1–AC4; DISC-2 |
| **Preconditions** | Allowlist CFG-01; `wt-b\script.py` exists; executor stub records resolved host path |

**Test Steps (data rows SBR-01…SBR-05):**

| Step | Scenario | Input | Expected Result |
|------|----------|-------|-----------------|
| 1 | S1 (AC1) | `file:"script.py"`, `base_dir`=wt-b | Executor stub receives `{TMP}\wt-b\script.py` |
| 2 | S2 (AC2) | `base_dir`=wt-unreg | `PATH_REJECTED_OUTSIDE_ALLOWLIST`; no execution |
| 3 | S3 (AC3) | no base_dir | Legacy resolution against main |
| 4 | S4 (AC4) | `file` = absolute outside | Containment rejection |
| 5 | S5 (AC4) | `file:"../../../outside/evil.py"` | Containment rejection |

**Test Data:** path-resolution-cases.csv SBR-01…SBR-05.
**Postconditions:** No execution side effects.

---

## 5. Boundary & Negative Testing

### TC-400: Null byte in file_path rejected

| Field | Value |
|-------|-------|
| **ID** | TC-400 |
| **Priority** | High |
| **Type** | Boundary / Negative — Security — Unit (Vitest) |
| **Requirement** | FSD §3.1.4 (no null bytes); TDD §7.4 T4 |
| **Preconditions** | Allowlist CFG-01 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `resolver.resolve({filePath:"docs/a\0b.md", baseDir:"{TMP}\\wt-b"})` | Rejected by `isPathSafe` (existing per-tool behavior unchanged); typed error, never a crash |
| 2 | Inspect logs | Any echoed path sanitized — control chars stripped/replaced (T6 interlock) |

**Test Data:** security-threat-cases.csv row T4.
**Postconditions:** None.

---

### TC-401: Empty / whitespace-only file_path and base_dir

| Field | Value |
|-------|-------|
| **ID** | TC-401 |
| **Priority** | Medium |
| **Type** | Boundary / Negative — Unit (Vitest) |
| **Requirement** | FSD §3.1.4 (file_path non-empty) |
| **Preconditions** | Allowlist CFG-01 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `filePath:""` (with and without base_dir) | Typed business error (per-tool existing validation); no crash; no FS access |
| 2 | `baseDir:""` and `baseDir:"   "` | Treated as absent-or-invalid deterministically: either legacy branch (absent) or typed error — never resolves to CWD silently in a way that bypasses the allowlist |

**Test Data:** path-resolution-cases.csv rows RES-401a/b.
**Postconditions:** None.

---

### TC-402: Sibling-prefix confusion (T9)

| Field | Value |
|-------|-------|
| **ID** | TC-402 |
| **Priority** | High |
| **Type** | Boundary / Negative — Security — Unit (Vitest) |
| **Requirement** | BR-07 boundary semantics; TDD §7.4 T9 (`root + path.sep` boundary) |
| **Preconditions** | Allowlist contains `{TMP}\wt-b` but NOT `{TMP}\wt-b-evil` (created as sibling directory) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `base_dir` = `{TMP}\wt-b-evil` (sibling of registered root) | `PATH_REJECTED_OUTSIDE_ALLOWLIST` — prefix containment uses separator boundary, not string prefix |
| 2 | Resolve `filePath:"{TMP}\\wt-b-evil\\x.txt"` with `base_dir`=wt-b | Containment rejection — sibling dir is outside the effective root |

**Test Data:** security-threat-cases.csv row T9.
**Postconditions:** None.

---

### TC-403: Windows drive-letter / UNC absolute path in file_path (T5)

| Field | Value |
|-------|-------|
| **ID** | TC-403 |
| **Priority** | High |
| **Type** | Boundary / Negative — Security — Unit (Vitest, Windows leg) |
| **Requirement** | FSD §3.1.4 (relative = no drive letter); TDD §7.4 T5 |
| **Preconditions** | Running on win32 leg; allowlist CFG-01 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `filePath:"C:\\Windows\\system32\\drivers\\etc\\hosts"` with valid base_dir | Rejected per existing `isPathSafe` drive-letter rule (unchanged behavior) |
| 2 | `filePath:"\\\\server\\share\\x.png"` | Rejected — UNC form not accepted as relative input |
| 3 | POSIX leg (if run on Linux) | Equivalent absolute inputs handled per platform `isPathSafe` semantics — behavior unchanged from baseline |

**Test Data:** security-threat-cases.csv row T5.
**Postconditions:** None.

---

### TC-404: Log-forging attempt via control characters in echoed paths (T6)

| Field | Value |
|-------|-------|
| **ID** | TC-404 |
| **Priority** | High |
| **Type** | Boundary / Negative — Security — Unit (Vitest) |
| **Requirement** | TDD §5.4 invariant 3 (sanitize `\r\n\0` → `?`); FSD §7.2 |
| **Preconditions** | Allowlist CFG-01; log capture active |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Trigger rejection with `base_dir` = `{TMP}\\wt-unreg\\evil\nFAKE-LOG-LINE` | Error text and WARN audit log contain sanitized path (newline replaced with `?`) — log stays single-line, no forged entries |

**Test Data:** security-threat-cases.csv row T6.
**Postconditions:** None.

---

### TC-405: base_dir "." / ".." normalized before allowlist check (T8)

| Field | Value |
|-------|-------|
| **ID** | TC-405 |
| **Priority** | High |
| **Type** | Boundary / Negative — Security — Unit (Vitest) |
| **Requirement** | BR-09; TDD §7.4 T8 (allowlist poisoning via relative base_dir) |
| **Preconditions** | Server CWD = `{TMP}` (NOT itself registered unless main — use CWD outside allowlist for the poisoning probe) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `baseDir:"."` where CWD ∉ allowlist | `PATH_REJECTED_OUTSIDE_ALLOWLIST` — normalized value checked against allowlist; never bypasses |
| 2 | `baseDir:".."` | Same rejection — parent of CWD not registered |
| 3 | `baseDir:"main"` where normalized = registered root | `ok:true` — normalization is a bridge to the allowlist, not a bypass (positive control) |

**Test Data:** security-threat-cases.csv row T8.
**Postconditions:** None.

---

### TC-406: Non-string / wrong-typed inputs

| Field | Value |
|-------|-------|
| **ID** | TC-406 |
| **Priority** | Medium |
| **Type** | Boundary / Negative — Unit (Vitest) |
| **Requirement** | FSD §3.1.4 (string types); TDD §5.2 (ResolvePathInput accepts unknown, validates inside) |
| **Preconditions** | Allowlist CFG-01 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `baseDir: 123`, `baseDir: null`, `baseDir: {}` (individually) | Typed business error (invalid input); no crash; raw object never echoed in message |
| 2 | `filePath: 123` / `filePath: null` | Typed error per-tool existing validation; resolver never throws on business paths (error-as-value) |

**Test Data:** path-resolution-cases.csv rows RES-406a/b.
**Postconditions:** None.

---

### TC-407: Containment boundary is inclusive — root itself and deep in-root traversal

| Field | Value |
|-------|-------|
| **ID** | TC-407 |
| **Priority** | Medium |
| **Type** | Boundary — Unit (Vitest) |
| **Requirement** | BR-07 (boundary semantics); TDD §7.4 T1 (in-root allowed) |
| **Preconditions** | Allowlist CFG-01 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `filePath:"."` with `base_dir`=wt-b | `ok:true`; resolved path = exactly `{TMP}\wt-b` (root itself is inside the root) |
| 2 | `filePath:"a/../../../../wt-b/x.txt"` crafted to land back inside wt-b | `ok:true` — deep traversal that resolves INSIDE the effective root is accepted (AF-5) |

**Test Data:** path-resolution-cases.csv rows RES-407a/b.
**Postconditions:** None.

---

### TC-408: PBT — containment invariant under randomized inputs (fast-check)

| Field | Value |
|-------|-------|
| **ID** | TC-408 |
| **Priority** | High |
| **Type** | Property-Based (fast-check, Vitest) |
| **Requirement** | BR-07 universal invariant; TDD §11 TC-extra (containment property); pattern: `servers/atlassian/__tests__/pbt.test.ts` |
| **Preconditions** | Allowlist CFG-01; fast-check generators for relative path segments (incl. random `../` chains, dot segments, unicode, spaces) and random base_dir ∈ allowlist |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run property: for ALL generated (filePath, baseDir) pairs, if `resolve()` returns `ok` then `resolvedPath` is within `effectiveRoot` | Property HOLDS for every iteration (default fast-check runs; counterexample shrunk on failure) |
| 2 | Run companion property: every `!ok` result carries a valid `PathErrorCode` and sanitized message | Property HOLDS — rejections are always typed and sanitization invariant maintained |

**Test Data:** fast-check generators (seeded for CI reproducibility).
**Postconditions:** None.

---

## 6. UI/UX Testing

**Not applicable** — MCP tools are consumed programmatically by AI agents; this feature has no screens, dialogs, or mockups (FSD §3.1.5, §3.2.5, §3.3.5). The agent-facing surface is the tool JSON schema documentation (BR-08/BR-22), which is verified functionally by **TC-300** and **TC-301**. No TC-500-range test cases are defined.

---

## 7. Non-Functional Testing

### TC-600: resolve() latency budget — p95 < 5 ms

| Field | Value |
|-------|-------|
| **ID** | TC-600 |
| **Priority** | Medium |
| **Type** | Non-Functional — Performance — Unit benchmark (Vitest) |
| **Requirement** | FSD §8 (allowlist lookup + normalization < 5 ms); TDD §8.3 row 1 |
| **Preconditions** | Allowlist CFG-01; benchmark harness in `multi-worktree-path-resolver.test.ts` with generous CI headroom |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Benchmark full `resolve()` (normalize + allowlist + stat + resolve + containment + realpath) over N iterations | p95 < 5 ms (assertion with CI-tolerant threshold) |
| 2 | Benchmark legacy branch (base_dir omitted) | No measurable regression vs baseline — identical code path, no added syscall |

**Acceptance Criteria:** p95 < 5 ms for base_dir branch; zero regression for legacy branch (TDD §8.3).

---

### TC-601: Allowlist startup build < 50 ms for ≤ 20 entries

| Field | Value |
|-------|-------|
| **ID** | TC-601 |
| **Priority** | Medium |
| **Type** | Non-Functional — Performance — Integration (Vitest) |
| **Requirement** | TDD §8.3 row 3; TDD §4.4 |
| **Preconditions** | CFG-14 — 20-entry allowlist (mix of valid dirs) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Measure `WorkspaceAllowlist.load` duration | < 50 ms total (off the request path); Set built with all 20 roots |

**Acceptance Criteria:** startup build < 50 ms for 20 entries (TDD §8.3).

---

### TC-602: Symlink escape rejected at runtime (T3)

| Field | Value |
|-------|-------|
| **ID** | TC-602 |
| **Priority** | High |
| **Type** | Non-Functional — Security — Unit (Vitest, fs fixtures) |
| **Requirement** | TDD §7.4 T3; BR-14 (P5 startup realpath); BR-07 (per-call realpath of deepest existing ancestor) |
| **Preconditions** | Allowlist CFG-01; `wt-b\link-out` symlink → `{TMP}\outside` (capability-guarded on Windows CI) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `filePath:"link-out/evil.txt"` with `base_dir`=wt-b | `ok:false`; `PATH_REJECTED_OUTSIDE_ALLOWLIST` — realpath of the deepest existing ancestor leaves the root, re-containment fails |
| 2 | Startup side: allowlist entry that is itself a symlink (CFG-10) | Stored as real path — link cannot smuggle an outside root into the allowlist |

**Test Data:** security-threat-cases.csv row T3; allowlist-configs.csv CFG-10.
**Postconditions:** No read/write outside allowlist.

---

### TC-603: TOCTOU + realpath ordering review (T7) — manual verification

| Field | Value |
|-------|-------|
| **ID** | TC-603 |
| **Priority** | Medium |
| **Type** | Non-Functional — Security — SIT (manual checklist) |
| **Requirement** | TDD §7.4 T7 (documented, accepted residual risk); TDD §6.2 FS touch contract |
| **Preconditions** | Implemented resolver; code access; running server for observation |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Code inspection checklist: resolver performs at most stat(base_dir) + realpath(deepest existing ancestor); realpath runs in the same tick immediately BEFORE the handler FS op | Checklist item verified — no I/O between containment decision and file open in the same tick |
| 2 | Runtime observation: trigger a rejection while watching logs | Rejection logged with sanitized fields; no filesystem access occurred (aligns with TC-200 spy evidence) |
| 3 | Record residual-risk acceptance | T7 documented as accepted-for-V1 (candidate for fd-based hardening) — signed in TEST-REPORT |

**Acceptance Criteria:** Checklist signed; residual risk acknowledged in TEST-REPORT.md.

---

### TC-604: Audit logging contract (FSD §7.3)

| Field | Value |
|-------|-------|
| **ID** | TC-604 |
| **Priority** | Medium |
| **Type** | Non-Functional — Integration (Vitest, pino capture) |
| **Requirement** | FSD §7.3; TDD §9.1 |
| **Preconditions** | Log capture active; scenarios from TC-200/TC-202/TC-001 replayed |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Replay allowlist-loaded scenario | INFO event: roots snapshot, source, legacyMode, count |
| 2 | Replay base_dir rejection | WARN event: `tool_name`, `base_dir` (sanitized), `file_path` (sanitized), `code` |
| 3 | Replay containment rejection | WARN event: `tool_name`, `resolved_path` (sanitized), `effective_root`, `code` |
| 4 | Replay successful cross-worktree operation | INFO event: `tool_name`, `base_dir`, `resolved_path` (sanitized) |

**Acceptance Criteria:** All 4 audit events present with the specified fields; every path-valued field sanitized.

---

## 8. Integration Testing

### TC-700: E2E-API — MCP streamable HTTP transport (POST /mcp) with base_dir

| Field | Value |
|-------|-------|
| **ID** | TC-700 |
| **Priority** | High |
| **Type** | Integration — E2E-API (Vitest + fetch against running server) |
| **Requirement** | UC-1, UC-3; AC1–AC4; TDD §10.4 V2–V5; TDD §3.1 |
| **Preconditions** | Server running at `http://localhost:48721` with `MCP_WORKSPACE_ROOTS` = CFG-01 (reuse running instance — do NOT start a second one); API key configured; startup log shows allowlist (freshness proof) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `POST /mcp` — `tools/call stream_write_file` `{path:"tmp/ug-proof.txt", content:"ok", base_dir:"<wt-b>"}` (V2) | Success result; file exists under wt-B; response cites wt-B path |
| 2 | Same call with `base_dir:"<wt-unreg>"` (V3) | `isError:true`; text starts `PATH_REJECTED_OUTSIDE_ALLOWLIST:` |
| 3 | Same call with NO `base_dir` (V4) | Written under legacy pinned root — pre-change behavior |
| 4 | `tools/call` with `file_path:"../../../etc/passwd"` + valid base_dir (V5) | `PATH_REJECTED_OUTSIDE_ALLOWLIST: Resolved path ... outside workspace root` |

**Test Data:** path-resolution-cases.csv SWF-01…SWF-05 over HTTP transport.
**Postconditions:** Proof file under wt-b removed; evidence captured for TEST-REPORT.

---

### TC-701: E2E-API — REST POST /tools surface with base_dir

| Field | Value |
|-------|-------|
| **ID** | TC-701 |
| **Priority** | High |
| **Type** | Integration — E2E-API (Vitest + fetch) |
| **Requirement** | TDD §3.1 (transport surface: REST /tools, `createToolsRoute` — HttpRouteRegistrar.ts:108); BR-20 |
| **Preconditions** | Server running; tools-route auth configured |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `POST /tools` — stream_write_file with valid base_dir | Same success contract as TC-700 step 1 (identical resolver behind both surfaces) |
| 2 | `POST /tools` — unregistered base_dir | Same `PATH_REJECTED_OUTSIDE_ALLOWLIST` contract (BR-20 uniformity across surfaces) |

**Test Data:** path-resolution-cases.csv SWF-01, SWF-02.
**Postconditions:** None.

---

### TC-702: Extension-surface contract parity (shared scenario fixture)

| Field | Value |
|-------|-------|
| **ID** | TC-702 |
| **Priority** | High |
| **Type** | Integration — IT (Vitest, shared fixture JSON) |
| **Requirement** | BR-20; TDD §6.3 (C-5 — contract duplication verified behaviorally) |
| **Preconditions** | Shared scenario fixture (TC-1…TC-5 scenarios) consumable by both backend and extension suites; extension `PathResolver` adapter built |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run extension adapter (resolveWorkspacePath with baseDir + allowlist opts) against the shared scenario set (embed_image, stream-write, mem pre-read) | Identical error codes AND messages as backend resolver for every scenario — zero drift |
| 2 | Compare against backend suite results for the same fixture | 1:1 match on codes/messages; discrepancy ⇒ Major defect (contract drift) |

**Test Data:** shared fixture JSON generated from path-resolution-cases.csv core rows.
**Postconditions:** None.

---

### TC-703: Atlassian downstream — containment strictly before upload

| Field | Value |
|-------|-------|
| **ID** | TC-703 |
| **Priority** | High |
| **Type** | Integration — IT (Vitest, stubbed Atlassian clients) |
| **Requirement** | BR-07, BR-23; TDD §6.4; FSD §5.4 |
| **Preconditions** | Stubbed jira/confluence clients recording call order |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Valid call (registered base_dir) | Client stub invoked AFTER resolver ok — file read from resolvedPath only |
| 2 | Rejected call (unregistered base_dir or containment failure) | ZERO stub invocations — upload never attempted when resolution fails |

**Test Data:** path-resolution-cases.csv JAF-01/JAF-02; CAA-01/CAA-02.
**Postconditions:** No real HTTP calls.

---

### TC-704: E2E-API — stdio transport with base_dir

| Field | Value |
|-------|-------|
| **ID** | TC-704 |
| **Priority** | Medium |
| **Type** | Integration — E2E-API (Vitest, stdio client) |
| **Requirement** | BR-20; TDD §2.4 (stdio transport) |
| **Preconditions** | Server started over stdio with CFG-01 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `tools/call` over stdio with valid base_dir | Success — same resolved path as HTTP surface |
| 2 | `tools/call` over stdio with unregistered base_dir | Same `PATH_REJECTED_OUTSIDE_ALLOWLIST` in-band error |

**Test Data:** path-resolution-cases.csv SWF-01, SWF-02.
**Postconditions:** None.

---

## 9. Regression Testing

### TC-800: Legacy parity — existing calls without base_dir byte-identical

| Field | Value |
|-------|-------|
| **ID** | TC-800 |
| **Priority** | High |
| **Type** | Regression — Integration (Vitest, golden snapshots) |
| **Requirement** | BR-03; TDD C-3; FSD TC-3 |
| **Preconditions** | Golden baseline snapshots recorded from pre-change build for all 8 tools (paths, success payloads, error codes, error messages) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | For each of the 8 tools, replay the baseline call set WITHOUT base_dir (success + rejection cases) | Results byte-identical to baseline — resolved paths, payloads, error codes, messages, log levels |
| 2 | Diff any deviation | Zero tolerance: any diff = Major defect (backward compatibility break) |

**Test Data:** golden snapshot fixtures (generated at baseline; stored with test suite).
**Postconditions:** None.

---

### TC-801: Existing path-safety suite passes unmodified

| Field | Value |
|-------|-------|
| **ID** | TC-801 |
| **Priority** | Medium |
| **Type** | Regression — Unit (Vitest) |
| **Requirement** | TDD §5.1 (path-safety.ts reused, not rewritten); BR-20 |
| **Preconditions** | `backend/src/shared/__tests__/path-safety.test.ts` at baseline |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run existing path-safety test file unmodified | 100% pass — `isPathSafe`, `isWithinRoot`, `resolveWithinWorkspace` semantics unchanged |
| 2 | Run Atlassian `unit-path-validator.test.ts` and `security.test.ts` | 100% pass or updated ONLY where `ALLOWED_BASES` containment was deliberately replaced per TDD §6.4 (each update justified in PR) |

**Test Data:** existing suites as-is.
**Postconditions:** None.

---

### TC-802: Multi-tenant scope stamps unaffected by base_dir (C-6)

| Field | Value |
|-------|-------|
| **ID** | TC-802 |
| **Priority** | Medium |
| **Type** | Regression — Integration (Vitest) |
| **Requirement** | TDD C-6 (`__projectId`/`_projectContext` orthogonal to base_dir — mcpServer.ts:79-86) |
| **Preconditions** | Server/container with project-context stamping enabled |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Identical tool calls with and without `base_dir` under a stamped project context | `__projectId`/`_projectContext` identical in both cases — base_dir never influences identity/scope stamping |

**Test Data:** same call pair with/without base_dir = wt-b.
**Postconditions:** None.

---

### TC-803: Health endpoint and existing metrics unchanged

| Field | Value |
|-------|-------|
| **ID** | TC-803 |
| **Priority** | Medium |
| **Type** | Regression — E2E-API (Vitest + fetch) |
| **Requirement** | TDD §9.3 (`GET /health` unchanged); TDD §9.2 (existing metrics hooks intact) |
| **Preconditions** | Server running with CFG-01 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `GET /health` | 200 `{status:"healthy", ...}` — unchanged payload shape |
| 2 | Execute a few tool calls; inspect `trackToolUsage` counters / tool-call duration logs | Counters increment as before; duration logs present (resolution overhead visible only as expected small delta) |

**Test Data:** n/a.
**Postconditions:** None.

---

## 10. Requirements Traceability Matrix (RTM)

| Requirement | Source | Test Cases | Status |
|-------------|--------|------------|--------|
| AC1 — cross-worktree success via base_dir | BRD 2.3 Story 1; FSD TC-1 | TC-001, TC-003…TC-010, TC-307…TC-314 (S1), TC-700 (V2) | Covered |
| AC2 — unregistered root rejected | BRD 2.3 Story 4; FSD TC-2 | TC-200, TC-207, TC-307…TC-314 (S2), TC-700 (V3) | Covered |
| AC3 — base_dir omitted → legacy behavior | BRD 2.3 Story 1; FSD TC-3 | TC-100, TC-204, TC-800, TC-307…TC-314 (S3), TC-700 (V4) | Covered |
| AC4 — containment (absolute outside + `../` escape) | BRD 2.3 Story 1; FSD TC-4 | TC-202, TC-203, TC-402, TC-408, TC-307…TC-314 (S4/S5), TC-700 (V5) | Covered |
| AC5 — base_dir documented in tool schemas | BRD 2.3 Story 1 req 5; FSD TC-5 | TC-300, TC-301 | Covered |
| UC-1 — per-call base_dir path resolution | FSD 3.1 | TC-001, TC-002, TC-100…TC-105, TC-200…TC-207, TC-210, TC-307…TC-314 | Covered |
| UC-2 — allowlist configuration at startup | FSD 3.2 | TC-104, TC-106…TC-109, TC-208, TC-302, TC-303, TC-305, TC-601 | Covered |
| UC-3 — uniform rejection across all tools | FSD 3.3 | TC-200, TC-209, TC-300, TC-306, TC-307…TC-314, TC-701, TC-704 | Covered |
| BR-01 — base_dir on all 8 tools | FSD 3.1.3 | TC-300, TC-307…TC-314 | Covered |
| BR-02 — relative resolves against base_dir | FSD 3.1.3 | TC-001, TC-003…TC-010 | Covered |
| BR-03 — omitted → legacy pinned root | FSD 3.1.3 | TC-100, TC-204, TC-800 | Covered |
| BR-04 — absolute within effective root | FSD 3.1.3 | TC-002, TC-203, TC-403 | Covered |
| BR-05 — allowlist membership required | FSD 3.1.3 | TC-200, TC-207, TC-210 | Covered |
| BR-06 — exists + is-directory | FSD 3.1.3 | TC-201, TC-205 | Covered |
| BR-07 — containment AFTER resolution | FSD 3.1.3 | TC-105, TC-202, TC-402, TC-407, TC-408, TC-602 | Covered |
| BR-08 / BR-22 — schema documentation | FSD 3.1.3 / 3.3.3 | TC-300, TC-301 | Covered |
| BR-09 — relative base_dir normalized | FSD 3.1.3 | TC-103, TC-405 | Covered |
| BR-10 — alias identical; base_dir wins | FSD 3.1.3 | TC-101, TC-102 | Covered |
| BR-11 — precedence allowlist → existence → containment | FSD 3.1.3 | TC-210, TC-306 | Covered |
| BR-12 — env/config-file sources + delimiters | FSD 3.2.3 | TC-104, TC-109, TC-208 | Covered |
| BR-13 — loaded once, cached in-memory Set | FSD 3.2.3 | TC-302 | Covered |
| BR-14 — normalize/realpath/dedupe entries | FSD 3.2.3 | TC-107 | Covered |
| BR-15 — missing entries warn, startup continues | FSD 3.2.3 | TC-106, TC-205 | Covered |
| BR-16 — empty allowlist → legacy mode | FSD 3.2.3 | TC-108, TC-207, TC-208 | Covered |
| BR-17 — restart required (no hot reload) | FSD 3.2.3 | TC-305 | Covered |
| BR-18 — primary checkout + worktrees coexist | FSD 3.2.3 | TC-304 | Covered |
| BR-19 — allowlist logged at startup (INFO) | FSD 3.2.3 | TC-303 | Covered |
| BR-20 — identical behavior via shared resolver | FSD 3.3.3 | TC-307…TC-314, TC-702 | Covered |
| BR-21 — inventory fixed to 8 tools | FSD 3.3.3 | TC-300 | Covered |
| BR-23 — reject before any FS access | FSD 3.3.3 | TC-200, TC-209, TC-312 (S2), TC-703 | Covered |
| Error PATH_REJECTED_OUTSIDE_ALLOWLIST | FSD §3.1.6 | TC-200, TC-202, TC-203, TC-207, TC-402, TC-405, TC-602 | Covered |
| Error PATH_REJECTED_OUTSIDE_WORKSPACE (legacy) | FSD §3.1.6 | TC-204 | Covered |
| Error FS_ERROR | FSD §3.1.6 | TC-201, TC-205, TC-206 | Covered |
| T1 — traversal `../` | TDD §7.4 | TC-202, TC-408 | Covered |
| T2 — absolute escape | TDD §7.4 | TC-203 | Covered |
| T3 — symlink escape | TDD §7.4 | TC-602, TC-107 (startup realpath) | Covered |
| T4 — null byte / control chars | TDD §7.4 | TC-400 | Covered |
| T5 — drive-letter / UNC | TDD §7.4 | TC-403 | Covered |
| T6 — log forgery | TDD §7.4 | TC-404, TC-604 (sanitized audit fields) | Covered |
| T7 — TOCTOU ordering | TDD §7.4 | TC-603 | Covered |
| T8 — relative base_dir poisoning (`.`) | TDD §7.4 | TC-405, TC-103 | Covered |
| T9 — sibling-prefix confusion | TDD §7.4 | TC-402 | Covered |
| T10 — alias conflict | TDD §7.4 | TC-102 | Covered |
| NFR — resolve() p95 < 5 ms | FSD §8; TDD §8.3 | TC-600 | Covered |
| NFR — startup build < 50 ms (≤ 20 entries) | TDD §8.3 | TC-601 | Covered |
| FSD TC-6 — non-existent base_dir | FSD §10.1 | TC-201 | Covered |
| FSD TC-7 — relative base_dir normalization | FSD §10.1 | TC-103 | Covered |
| FSD TC-8 — alias handling | FSD §10.1 | TC-101, TC-102 | Covered |
| FSD TC-9 — startup validation (missing/dup/symlink) | FSD §10.1 | TC-106, TC-107 | Covered |
| FSD TC-10 — empty allowlist → legacy mode | FSD §10.1 | TC-108, TC-207 | Covered |
| FSD TC-11 — platform delimiters | FSD §10.1 | TC-109 | Covered |
| Extension contract parity (C-5) | TDD §6.3 | TC-005, TC-309, TC-702, TC-111 | Covered |
| Atlassian containment-before-upload | TDD §6.4 | TC-009, TC-010, TC-312, TC-313, TC-703 | Covered |

**Coverage Summary:**

| Category | Total | Covered | Coverage % |
|----------|-------|---------|------------|
| Acceptance Criteria (AC1–AC5) | 5 | 5 | 100% |
| Use Cases (UC-1…UC-3) | 3 | 3 | 100% |
| Business Rules (BR-01…BR-23) | 23 | 23 | 100% |
| Error Codes | 3 | 3 | 100% |
| Security Threats (T1–T10) | 10 | 10 | 100% |
| FSD Supplementary Scenarios (TC-6…TC-11) | 6 | 6 | 100% |
| Non-Functional Budgets | 2 | 2 | 100% |
| **Overall** | **52** | **52** | **100%** |

Per-tool uniformity (BR-20): each of the 8 tools carries the 5 mandatory BRD scenarios — TC-307…TC-314 (S1–S5 each) plus per-tool happy-path TC-003…TC-010 ⇒ 8/8 tools fully covered (40/40 matrix assertions).

---

## 11. Appendix

### Test Data Setup Scripts

**Fixture creation (executed by the Vitest global-setup/`beforeEach` helper — no manual SQL; the feature has no database):**

```text
ROOT = os.tmpdir()/sa4e394                      # {TEMP_DIR} placeholder root
mkdir  ROOT/main/documents/SA4E-394             # legacy pinned root (CODE_INTEL_WORKSPACE target)
write  ROOT/main/documents/SA4E-394/BRD.md      # sample document
write  ROOT/main/notes.txt
mkdir  ROOT/wt-a/docs  ROOT/wt-a/diag  ROOT/wt-a/img
write  ROOT/wt-a/docs/plan.md  ROOT/wt-a/diag/flow.drawio  ROOT/wt-a/img/logo.png
mkdir  ROOT/wt-b/tmp  ROOT/wt-b/documents/SA4E-394  ROOT/wt-b/diag
write  ROOT/wt-b/documents/SA4E-394/BRD.md  ROOT/wt-b/diag/flow.drawio
write  ROOT/wt-b/script.py
mkdir  ROOT/wt-unreg ; write ROOT/wt-unreg/secret.txt      # NOT in allowlist
mkdir  ROOT/outside ; write ROOT/outside/evil.txt          # containment escape target
# wt-ghost: NOT created on disk (registered in allowlist only — FS_ERROR fixture)
write  ROOT/plainfile.txt                                   # file registered as root (BR-06 fixture)
symlink ROOT/wt-b/link-out -> ROOT/outside                  # T3 fixture (capability-guarded on Windows)
symlink ROOT/link-to-wt-a -> ROOT/wt-a                      # CFG-10 fixture
```

**Environment variables per run (Windows example):**

```bash
CODE_INTEL_WORKSPACE={TEMP_DIR}\sa4e394\main
MCP_WORKSPACE_ROOTS={TEMP_DIR}\sa4e394\main;{TEMP_DIR}\sa4e394\wt-a;{TEMP_DIR}\sa4e394\wt-b
# For config-file tests (TC-104): unset MCP_WORKSPACE_ROOTS and set
MCP_WORKSPACE_ROOTS_FILE={TEMP_DIR}\sa4e394\roots.txt   # one root per line, '#' comments
```

### CSV Test Data Files

| File | Rows | Used by |
|------|------|---------|
| `test-data/pre-seeded-worktrees.csv` | 9 | Fixture creation (all suites) |
| `test-data/path-resolution-cases.csv` | 67 | TC-001…TC-010, TC-100…TC-105, TC-200…TC-207, TC-307…TC-314, TC-700…TC-704 |
| `test-data/allowlist-configs.csv` | 14 | TC-104…TC-109, TC-201, TC-205, TC-207, TC-208, TC-302…TC-305, TC-601 |
| `test-data/security-threat-cases.csv` | 10 | TC-400…TC-405, TC-602, TC-202, TC-402 |
| `test-data/schema-contract.csv` | 8 | TC-300, TC-301 |

Placeholder convention: `{TEMP_DIR}` resolves to the per-run fixture root; `{resolved}`/`{base_dir}` in expected-message fragments are substituted with the actual offending values before comparison.

### Environment Configuration

- Test framework: Vitest; PBT: fast-check (seeded for CI reproducibility), matching `servers/atlassian/__tests__/pbt.test.ts` conventions.
- Target test files (per TDD §11 hooks): `backend/src/shared/__tests__/multi-worktree-path-resolver.test.ts` (core matrix), `backend/src/shared/__tests__/workspace-allowlist.test.ts` (startup rules P1–P9), plus one parametrized suite per tool co-located with handler tests (`backend/src/tool-router/__tests__/`, `backend/src/servers/atlassian/__tests__/`, `backend/src/modules/sandbox/__tests__/`, extension suite under `extension/src/__tests__/`).
- Windows CI leg verifies `;` delimiter, case-insensitive dedupe, drive-letter rejection; POSIX leg verifies `:` delimiter and exact-case dedupe (TC-109, TC-403).
- E2E-API legs reuse a running server instance at `http://localhost:48721` (`GET /health` probe first — never start a duplicate); freshness proof = startup log line "MCP workspace allowlist loaded" (BR-19).
- Evidence directory: `documents/SA4E-394/evidence/` (screenshots, log excerpts, V1–V6 proof transcripts).

*End of STC for SA4E-394*
