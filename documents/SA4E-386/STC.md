# Software Test Cases (STC)

## SDLC-Agents-4-Enterprise — SA4E-386: Pin Node.js to 22.23.4 (CVE-2026-111497) and Retire the Legacy `better-sqlite3` Build Workflow

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-386 |
| Title | Pin Node.js runtime to 22.23.4 to patch CVE-2026-111497 (Brotli RCE) and related Highs; retire the legacy `better-sqlite3` build workflow (CR-01) |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-10-28 |
| Status | Draft — pending BA business-coverage review |
| Related STP | STP-v1.0-SA4E-386.docx |
| Related FSD | FSD-v1.3-SA4E-386.docx |
| Related TDD | TDD-v1.1-SA4E-386.docx |
| Test case count | **41** (5 PBT, 10 UT, 13 IT, 5 E2E-API, 0 E2E-UI, 8 SIT) |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-28 | QA Agent | Initiate document — 41 test cases derived from BRD v1.0 (FR-01…FR-16, AC-01…AC-08), FSD v1.3 (UC-01…UC-08, BR-01…BR-30, TC-01…TC-46) and TDD v1.1 (gates G0–G8, FV-01…FV-20, EV-01…EV-16) |

---

## Test Case Summary

| Level | ID Range | Count | Priority | Automated |
|-------|----------|-------|----------|-----------|
| Property-Based | PBT-01 … PBT-05 | 5 | High | ✅ fast-check + vitest |
| Unit | UT-01 … UT-10 | 10 | High | ✅ vitest |
| Integration | IT-01 … IT-13 | 13 | High | ✅ vitest against the real tree |
| E2E-API | E2E-API-01 … E2E-API-05 | 5 | High | ✅ vitest + docker + fetch |
| E2E-UI | — | **0** | — | N/A — no UI surface (§3) |
| System Integration (manual) | SIT-01 … SIT-08 | 8 | High / Medium | ❌ manual / `gh` + browser |
| **Total** | | **41** | High 33, Medium 8 | **33 automated (80.5%)** |

### ID scheme and why it deviates from the numeric ranges

The template's numeric ranges (TC-001…TC-899) encode *scenario type*; this ticket is organised by *test level*, because the same requirement is verified at different levels with different techniques (for example BR-15 at PBT, UT and IT). IDs therefore carry a level prefix, and the scenario-type information is preserved in the **Type** field of every case:

| Prefix | Level | Runs where | Verdict authority |
|--------|-------|-----------|-------------------|
| `PBT-` | Property-based | Harness sandbox (outside the repo) | Specification of the validators |
| `UT-` | Unit | Harness sandbox | Check-module correctness |
| `IT-` | Integration | Real working tree | Gate verdict G2/G3/G6 |
| `E2E-API-` | End-to-end (real container) | Docker daemon | Release blocker (the CVE is only patched if the image runs the pin) |
| `E2E-UI-` | End-to-end (browser) | — | Not applicable, 0 cases |
| `SIT-` | System integration (manual) | GitHub UI / `gh` / browser | Attestation in PR or close-out record |

### Traceability convention

Every case lists its requirement(s) **and** the FSD scenario it operationalises (`FSD TC` field), so coverage can be audited in both directions: requirement → case (§7 RTM) and FSD scenario → case (§8). Where a case covers several FSD scenarios, all are listed; where an FSD scenario is only partially automatable, the note column in §8 states which part is manual.

### Global preconditions (apply to every case unless stated otherwise)

| # | Precondition |
|---|--------------|
| GP-1 | Repository cloned at baseline `1666945`; branch `node-security-upgrade` created from `main` |
| GP-2 | The change set is G2-complete: all five declaration families edited (engines ×2, `.nvmrc`, Dockerfile ARGs, 27 workflow literals, lockfile metadata) and the CR-01 deletion applied atomically |
| GP-3 | Execution mode recorded for every result: `HOST` (`node -v` = `v22.23.4`) or `CONTAINER` (`node:22.23.4-slim@<digest>`). Untagged results are void (AD-9) |
| GP-4 | The G0 baseline changed-set snapshot exists (see IT-01) — required because the working tree carries 41 pre-existing unrelated entries (STP B-15) |
| GP-5 | Verdict vocabulary is exact: `PASS` / `FAIL` / `NOT_EXECUTED` (+reason). `NOT_EXECUTED` is never reported as `PASS` (BR-20) |
| GP-6 | Harness lives **outside** the repository (AD-7); no test file may be staged (AC-07) |

### Notation used in expected results

| Notation | Meaning |
|----------|---------|
| `exit 1 = PASS` | Inverted oracle: the check passes when grep/test finds **nothing** and the shell returns non-zero |
| `→ FAIL` | The harness verdict for the observed condition (not necessarily a shell exit code) |
| `M/D` | Git status codes ` M` (modified) / `D ` (deleted) |
| `{digest}` / `{existing_*}` | Runtime-resolved placeholder; concrete values are supplied by the harness from `testdata/digest-fixtures.csv` and the live registry |

---

## 1. Property-Based Test Cases (PBT)

> Technique: `fast-check` properties, ≥ 100 generated cases per run, executed in the harness sandbox. Each property doubles as the executable specification of the corresponding validator, so a PBT failure is always a specification defect, never a flaky test.

### PBT-01: `engines.node` range admits exactly the patched 22.x versions

| Field | Value |
|-------|-------|
| **ID** | PBT-01 |
| **Level / Type** | PBT — Functional (boundary property) |
| **Priority** | High |
| **Requirement** | BR-04, BR-05, BR-01; FR-01, FR-02; AC-01 |
| **FSD TC** | TC-02, TC-03, TC-04 |
| **Preconditions** | GP-1…GP-6; semver resolver available in the harness sandbox (the same library class npm uses) |

**Property / Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Generate 500 version triples: major ∈ [20, 25], minor ∈ [0, 40], patch ∈ [0, 20] | 500 distinct triples produced |
| 2 | For each triple, evaluate `satisfies(v, ">=22.23.4 <23")` | Boolean returned for every triple |
| 3 | Assert `satisfies ⇔ (major = 22 ∧ (minor > 23 ∨ (minor = 23 ∧ patch ≥ 4)))` | 500/500 hold; **0 counter-examples** |
| 4 | Negative control: evaluate the *current* baseline range `"22.x"` against `22.0.0` | `true` — proving a loose range admits a vulnerable runtime (this is the reason BR-05 exists) |
| 5 | Assert the candidate values `"^22"`, `"~22"`, `">=22"`, `"*"` are each rejected by the declaration validator | 4/4 rejected with a looseness reason code |

**Test Data:** generated triples; fixed probes `22.23.3` (must be denied), `22.23.4` (must be admitted), `22.23.5` (admitted), `22.24.0` (admitted), `23.0.0` (denied), `21.99.99` (denied). Fixture rows: `declaration-census.csv` rows C-01…C-03.
**Expected / Postconditions:** property holds; the boundary `22.23.3`/`22.23.4` is exercised in both directions; no randomness in the final verdict.
**Note:** this case proves BR-03 (no major upgrade) as a side effect: all majors ≠ 22 fail admission.

---

### PBT-02: `.nvmrc` byte contract accepts only the 8-byte payload

| Field | Value |
|-------|-------|
| **ID** | PBT-02 |
| **Level / Type** | PBT — Functional (byte boundary) |
| **Priority** | High |
| **Requirement** | BR-08, FR-03, AC-02 |
| **FSD TC** | TC-06, TC-31 |
| **Preconditions** | GP-1…GP-6; validator reads the file as **bytes** (never as a decoded string — decoding normalises CRLF and defeats the check) |

**Property / Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Feed the canonical payload `32 32 2E 32 33 2E 34 0A` (8 bytes) | `PASS`, reported length `8` |
| 2 | Feed 8 mutated payloads derived from it (BOM prefix, CR before LF, no trailing LF, extra LF, `v` prefix, trailing space, range text, empty) | 8/8 `FAIL`, each with a distinct reason code |
| 3 | Generate 200 random byte strings of length 0…16 over the alphabet `{0x00,0x09,0x0A,0x0D,0x20,0x2E,0x32,0x33,0x34,0x76,0xEF,0xBB,0xBF}` | Every string is `FAIL` (no accidental acceptance) |
| 4 | Assert the reason-code taxonomy: `ERR_LEN`, `ERR_BOM`, `ERR_CR`, `ERR_PREFIX_V`, `ERR_TRAILING_WS`, `ERR_NOT_SEMVER` | Codes match the fixture expectations exactly |

**Test Data:** `nvmrc-fixtures.csv` — 8 rows: `canonical_8B`, `no_newline_7B`, `crlf_9B`, `bom_11B`, `v_prefix_9B`, `trailing_space_9B`, `range_4B`, `empty_0B`. Baseline row: current repository value `32 32 0D 0A` (4 bytes) must be `ERR_LEN` **and** `ERR_CR`.
**Expected / Postconditions:** only the canonical payload passes; the two defects of the pre-change file (major-only + CRLF) are each detected independently.

---

### PBT-03: Quote style is preserved by every literal rewrite, and the rewrite is idempotent

| Field | Value |
|-------|-------|
| **ID** | PBT-03 |
| **Level / Type** | PBT — Functional (transformation invariant) |
| **Priority** | High |
| **Requirement** | BR-15, FR-06, AC-04 |
| **FSD TC** | TC-14 |
| **Preconditions** | GP-1…GP-6; rewrite function operates line-wise on raw text |

**Property / Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | For each of the 12 class-A workflow files, apply the rewriter to the single line containing `node-version:` | Exactly **1** line changes per rewrite; 27 rewrites total |
| 2 | Assert the quote character is unchanged: single for `auto-release.yml`, `ci.yml`, `publish.yml`; double for the other 9 files | 12/12 preserved; 0 quote flips |
| 3 | Assert no other byte in the file changes (length delta = +5 per rewritten line, from `22` → `22.23.4`) | delta = +5 × literals-in-file |
| 4 | Assert YAML still parses after rewriting | 12/12 parse |
| 5 | Apply the rewriter a second time to the already-rewritten content | **No change** (idempotent) |
| 6 | Negative control: rewrite `ci.yml` with the double-quote strategy | Rejected by the style guard with `ERR_QUOTE_STYLE` |

**Test Data:** `workflow-census.csv` (12 rows, with `quote_style` and `literal_count`); per-file literal counts: 1,4,2,1,2,6,1,2,3,2,1,2 = 27.
**Expected / Postconditions:** the file-level diff shape stays 27 single-line changes, which is the precondition for the count oracle `git diff --stat` = 18 entries.

---

### PBT-04: Digest normalisation yields exactly one canonical `sha256:` or a typed error

| Field | Value |
|-------|-------|
| **ID** | PBT-04 |
| **Level / Type** | PBT — Security (supply chain) |
| **Priority** | High |
| **Requirement** | BR-10, BR-11, BR-01; FR-04; AC-03; TDD N-1…N-5, E-1…E-3 |
| **FSD TC** | TC-09, TC-32, TC-33 |
| **Preconditions** | GP-1…GP-6; 6 synthetic registry responses available (`digest-fixtures.csv`) |

**Property / Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Feed each fixture to `normaliseDigest()` | Exactly one of: a canonical string, or a typed error |
| 2 | Assert every successful output matches `^sha256:[0-9a-f]{64}` | 3/3 successes match; 0 uppercase, 0 short/long values, 0 tag-qualified strings |
| 3 | Assert multi-arch index fixture (`application/vnd.oci.image.index.v1+json`) resolves to the **index** digest, not a child manifest digest | Output equals the index digest; child digests are not selectable |
| 4 | Assert failure fixtures map to typed errors: two distinct digests → `E-1 CONFLICT`; digest belongs to another tag → `E-2 TAG_MISMATCH`; empty `RepoDigests` → `E-3 EMPTY` | 3/3 typed errors; no silent fallback to a "best guess" |
| 5 | Assert the normaliser never accepts a value taken from a document/text source (no tag-name inference path exists) | Function is pure over registry output only |

**Test Data:** `digest-fixtures.csv` — `D-01_index_single` (pass), `D-02_manifest_list_duplicate` (pass, dedup N-4), `D-03_two_distinct` (E-1), `D-04_wrong_tag` (E-2), `D-05_empty` (E-3), `D-06_child_manifest` (must not be chosen over the index).
**Expected / Postconditions:** R-01 ("wrong digest copied from a document") has a detectable failure mode; residual risk remains only for a **fabricated-but-well-formed** digest — which is why E2E-API-05 and SIT-01 exist.
**Note:** the 64-hex fixture values are synthetic constants, not real digests; the real value is resolved live at G1 and compared in IT-02/E2E-API-01.

---

### PBT-05: The forbidden-literal classifier has no false pass and no false failure

| Field | Value |
|-------|-------|
| **ID** | PBT-05 |
| **Level / Type** | PBT — Negative (classification) |
| **Priority** | High |
| **Requirement** | BR-19, BR-05, FR-09, AC-01, AC-04; FSD SCC-03 |
| **FSD TC** | TC-39, TC-04 |
| **Preconditions** | GP-1…GP-6; classifier returns (verdict, matched-value) |

**Property / Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | For each value in the forbidden set `{22, '22', "22", 22.x, ^22, ~22, >=22, *, 22.23.3, v22.23.4}` embedded in `node-version: <value>` | 10/10 classified `FAIL` (forbidden) with the matched literal reported |
| 2 | For each legal value `{22.23.4, '22.23.4', "22.23.4", ${{ matrix.node_version }}`} | 4/4 classified `PASS` (allowed) |
| 3 | Advanced: generate 200 strings of the shape `node-version:` + random token and assert classification is deterministic across runs | Identical verdict for the same input on 3 consecutive runs |
| 4 | Assert the classifier does **not** match `node_version:` (underscore) — an ABI selector, not the pin | 0 hits for `node_version` fixtures; a fixture with both forms yields exactly 1 finding |

**Test Data:** `workflow-census.csv` (`classification_expected` column) + the 6 probe strings above.
**Expected / Postconditions:** the hyphen/underscore distinction (TDD §13 Step 6 grep-scope hazard) is proven, preventing a false FAIL that would tempt a "fix" of `node_version="22"` and break the ONNX prebuild namespace.

---

## 2. Unit Test Cases (UT)

> Technique: `vitest` over the gate-harness check modules, driven by fixture directories and synthetic scanner reports. These cases prove the **instrument** is correct before the instrument is pointed at the repository — the failure they prevent is a harness that reports PASS for a condition it never actually tested.

### UT-01: `engines.check` asserts the exact range and rejects loose or malformed declarations

| Field | Value |
|-------|-------|
| **ID** | UT-01 |
| **Level / Type** | UT — Functional |
| **Priority** | High |
| **Requirement** | BR-04, BR-05, BR-06; FR-01, FR-02; AC-01; FSD CC-02, CC-07 |
| **FSD TC** | TC-02, TC-03, TC-05 |
| **Preconditions** | Fixture dir with 7 `package.json` variants; module loaded in isolation |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run `checkEngines()` against the valid fixture (`">=22.23.4 <23"` in both manifests) | `PASS`; values echoed in the report |
| 2 | Run against variants: `22.x`, `^22`, `~22`, `>=22`, `*`, missing `engines` key | 6/6 `FAIL` with a distinct reason per variant |
| 3 | Run against a syntactically invalid JSON manifest | `FAIL` with `ERR_JSON`; module does not throw an uncaught exception |
| 4 | Assert the module fails when **only** the backend manifest is correct | `FAIL` naming `backend/package.json` and `package.json` independently (no early return after the first success) |

**Test Data:** 7 fixtures mirroring `declaration-census.csv` rows C-01/C-02 plus the 5 invalid variants.
**Expected / Postconditions:** both manifests are always evaluated; a single passing manifest cannot mask the other.

---

### UT-02: `nvmrc.check` reports the exact byte payload and length

| Field | Value |
|-------|-------|
| **ID** | UT-02 |
| **Level / Type** | UT — Boundary |
| **Priority** | High |
| **Requirement** | BR-08, FR-03, AC-02; FSD CC-06 |
| **FSD TC** | TC-06, TC-31 |
| **Preconditions** | 8 byte-level fixtures written to disk (not as strings) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run `checkNvmrc()` on the canonical fixture | `PASS`; report contains `length=8` and `hex=32322E32332E340A` |
| 2 | Run on the 7 invalid fixtures | 7/7 `FAIL` with reason codes from PBT-02 |
| 3 | Assert the module reads with a byte-preserving API | A CRLF fixture is reported as `9` bytes, **not** normalised to `8` |
| 4 | Assert the report includes the raw hex string | Reviewer can verify without re-running the command |

**Test Data:** `nvmrc-fixtures.csv` (8 rows).
**Expected / Postconditions:** a CRLF conversion introduced by `core.autocrlf` is detected at the unit level, before it reaches a commit.

---

### UT-03: `workflow.check` counts literals per file and ignores `node_version` (underscore)

| Field | Value |
|-------|-------|
| **ID** | UT-03 |
| **Level / Type** | UT — Functional |
| **Priority** | High |
| **Requirement** | BR-15, BR-16, FR-06; AC-04; FSD CC-04, CC-05 |
| **FSD TC** | TC-13, TC-15 |
| **Preconditions** | Fixture dir with the pre-change 16-file census and the post-change 15-file census |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run `censusWorkflows()` on the post-change fixture | `files=15`, `keys=28`, `literals=27`, `matrix=1` |
| 2 | Compare the per-file literal counts with the expected map | 12/12 match: 1,4,2,1,2,6,1,2,3,2,1,2 |
| 3 | Run on a fixture containing `node_version: "22"` (underscore) | Counted as **0** pin literals; not reported as a violation |
| 4 | Run on a fixture containing an unquoted `node-version: 22` | `FAIL` (unquoted form is forbidden, FSD CC-04 extended regex) |
| 5 | Run on a fixture with `node-version: ${{ matrix.node_version }}` | Accepted as the matrix expression; counted in `matrix=1`, excluded from `literals` |

**Test Data:** `workflow-census.csv` (12 pin rows + 3 negative fixtures).
**Expected / Postconditions:** the 28/27/1 decomposition is reproducible and the ABI identifier is never "fixed".

---

### UT-04: `dockerfile.check` validates ARGs, comment content, and the absence of a `FROM` hunk

| Field | Value |
|-------|-------|
| **ID** | UT-04 |
| **Level / Type** | UT — Functional + Security |
| **Priority** | High |
| **Requirement** | BR-11, BR-12, BR-13, BR-14; FR-04, FR-05; AC-03; FSD CC-09, CC-10 |
| **FSD TC** | TC-08, TC-11, TC-12 |
| **Preconditions** | Two Dockerfile fixtures: correct and "edited `FROM`" |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run `checkDockerfile()` on the correct fixture | `PASS`; `NODE_VERSION=22.23.4`; digest matches `^sha256:[0-9a-f]{64}` |
| 2 | Run on the "`FROM` edited" fixture (L40 or L178 modified) | `FAIL` with `ERR_FROM_HUNK`; the offending line is quoted |
| 3 | Assert the comment check requires **both** `CVE-2026-111497` and the digest-authority phrase | Removing either one yields `FAIL` (`ERR_COMMENT_CVE` / `ERR_COMMENT_AUTHORITY`) |
| 4 | Assert a relaxation detector flags `FROM ...:22-slim` (unpinned tag without digest) and `USER root` added to the production stage | 2/2 `FAIL` |
| 5 | Assert the module reports the ARG values verbatim so the reviewer can compare them with EV-05 | Values printed, not summarised |

**Test Data:** `declaration-census.csv` rows C-04…C-06; two Dockerfile fixtures.
**Expected / Postconditions:** an editor that "helpfully" updates the `FROM` line is caught as a BR-12 defect rather than silently accepted.

---

### UT-05: `digest.check` enforces format, tag equality and byte-identity with the resolved value

| Field | Value |
|-------|-------|
| **ID** | UT-05 |
| **Level / Type** | UT — Security |
| **Priority** | High |
| **Requirement** | BR-10, BR-11; AC-03; FSD CC-12 |
| **FSD TC** | TC-09, TC-10 |
| **Preconditions** | Resolved digest fixture `{digest}` available as a constant |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Validate the correct value | `PASS` |
| 2 | Validate `sha256:` + 63 hex, + 65 hex, uppercase hex, missing prefix, `sha256:` + non-hex | 5/5 `FAIL` with `ERR_FORMAT` |
| 3 | Validate a well-formed digest different from `{digest}` | `FAIL` with `ERR_MISMATCH` — this is the R-01 detector |
| 4 | Validate a digest whose tag component is `22-slim` rather than `22.23.4-slim` | `FAIL` with `ERR_TAG` |

**Test Data:** `digest-fixtures.csv` rows D-01, D-04, D-06 + 5 malformed strings.
**Expected / Postconditions:** format validity alone is never reported as PASS; equality with the live resolution is mandatory.

---

### UT-06: `security-claim` evaluates M1 ∧ M2 ∧ M3 over Trivy report pairs

| Field | Value |
|-------|-------|
| **ID** | UT-06 |
| **Level / Type** | UT — Security |
| **Priority** | High |
| **Requirement** | NFR-SEC-01, FR-11, BR-21; TDD AD-8 |
| **FSD TC** | TC-25, TC-42 |
| **Preconditions** | 6 synthetic baseline/new report pairs (filtered + unfiltered) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Pair where the four named CVEs are absent from `new` and no fixable finding increases | `PASS` with M1, M2, M3 each reported individually |
| 2 | Pair where one named CVE persists | `FAIL` on **M1** only; M2/M3 still reported |
| 3 | Pair where a new fixable HIGH appears | `FAIL` on **M2**, naming the added `VulnerabilityID` |
| 4 | Pair where the unfiltered run shows new unfixed findings that are not attributed in the report | `FAIL` on **M3** (`ERR_UNATTRIBUTED`) |
| 5 | Only one report present (baseline missing, or scanner absent) | `NOT_EXECUTED` with the reason — **never** `PASS` |
| 6 | Assert the aggregate verdict is `PASS` only when all three hold | 1/1 |

**Test Data:** `trivy-claim-fixtures.csv` (6 rows; synthetic `VulnerabilityID` values, no real CVE data beyond the named four).
**Expected / Postconditions:** "0 High" cannot be produced from a skipped or single-report run — the exact defect SECURITY-REVIEW flags in the pre-existing gate.

---

### UT-07: The verdict vocabulary keeps `NOT_EXECUTED` distinct from `PASS`

| Field | Value |
|-------|-------|
| **ID** | UT-07 |
| **Level / Type** | UT — Process integrity |
| **Priority** | High |
| **Requirement** | BR-20, BR-21, BR-22; TDD P-4 |
| **FSD TC** | TC-25, TC-27 |
| **Preconditions** | Reporter module loaded; 3 synthetic check results |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Report a check that threw (e.g. Docker daemon absent) | Verdict `NOT_EXECUTED` with the exception message preserved |
| 2 | Report a check with an explicit skip (Trivy absent) | Verdict `NOT_EXECUTED` with `reason=scanner-absent` |
| 3 | Report a passing check | Verdict `PASS` |
| 4 | Assert the aggregate line: any `NOT_EXECUTED` among **mandatory** gates ⇒ aggregate is not `PASS` | Aggregate `INCOMPLETE` (or `FAIL`), never `PASS` |
| 5 | Assert the word "PASS" never appears adjacent to a skipped check in the rendered block | 0 occurrences (regex assertion) |

**Test Data:** 3 synthetic results; the rendered evidence block fixture.
**Expected / Postconditions:** the most common misreporting in this ticket (B-14: Trivy/nvm absent) is structurally impossible.

---

### UT-08: Inverted-oracle exit codes are interpreted correctly

| Field | Value |
|-------|-------|
| **ID** | UT-08 |
| **Level / Type** | UT — Negative (control of the control) |
| **Priority** | High |
| **Requirement** | BR-19; AC-01, AC-04, AC-08; FSD CC-03, CC-04, SCC-03 |
| **FSD TC** | TC-39 |
| **Preconditions** | Shell-runner stub able to return exit codes 0, 1 and 2 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Inverted check: grep exits `1` with empty output | Verdict `PASS` (no forbidden match) |
| 2 | Inverted check: grep exits `0` with one match | Verdict `FAIL`, matched line quoted |
| 3 | Inverted check: grep exits `2` (path missing / invalid pattern) | Verdict `NOT_EXECUTED` — **not** `PASS` |
| 4 | Normal (non-inverted) check: exit `0` | Verdict `PASS` (semantics are per-check, not global) |
| 5 | Assert the runner never maps "any non-zero" to PASS | 4 distinct mappings verified |

**Test Data:** stub exit-code matrix (0/1/2 × inverted/normal).
**Expected / Postconditions:** TR-01 (inverted grep misread) has an automated guard; a missing directory cannot masquerade as compliance.

---

### UT-09: `auto-release.yml` trigger checker requires exactly one `workflow_run` entry

| Field | Value |
|-------|-------|
| **ID** | UT-09 |
| **Level / Type** | UT — Functional (CR-01) |
| **Priority** | High |
| **Requirement** | FR-15, BR-30; AC-08 |
| **FSD TC** | TC-44 |
| **Preconditions** | 4 fixtures: correct (1 item), stale (2 items), empty list, extra-key-modified |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Parse the correct fixture | `PASS`; `workflows = ["Build ONNX Runtime Native (onnxruntime-node)"]` |
| 2 | Parse the stale fixture (both entries) | `FAIL` naming the leftover `better-sqlite3` entry |
| 3 | Parse the empty-list fixture | `FAIL` with `ERR_EMPTY_TRIGGER` (invalid YAML semantics) |
| 4 | Parse a fixture where `types` or `workflow_dispatch` changed | `FAIL` (`ERR_TRIGGER_SHAPE`) — those keys must be untouched |
| 5 | Assert a substring scan finds `better-sqlite3` anywhere in the file, including comments | `FAIL` if present |

**Test Data:** 4 fixtures; baseline content captured from `git show HEAD:.github/workflows/auto-release.yml`.
**Expected / Postconditions:** the "dangling trigger" failure mode (a valid-looking YAML that can never fire) is caught statically.

---

### UT-10: `scheduled-prebuild-scan.yml` checker proves removals **and** ONNX preservation

| Field | Value |
|-------|-------|
| **ID** | UT-10 |
| **Level / Type** | UT — Regression (CR-01) |
| **Priority** | High |
| **Requirement** | FR-16, BR-30; AC-08 |
| **FSD TC** | TC-45, TC-38 |
| **Preconditions** | Baseline copy of the file from `HEAD`; post-change fixture |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Assert absent: `BETTER_SQLITE3_VERSION`, `NEEDS_BUILD_NATIVE`, `needs_native`, `native_versions`, `Trigger build-native`, `build-native.yml` | 6/6 absent |
| 2 | Assert present: `SUPPORTED_NODE_VERSIONS`, `ONNXRUNTIME_VERSION`, `PLATFORMS`, `needs_ort`, `Trigger build-onnxruntime`, `-f node_version="22"` | 6/6 present |
| 3 | Byte-compare the ONNX scan block (`if [ "$MAJOR" = "22" ]` region) and the `Trigger build-onnxruntime` step against `HEAD` | **0 differing lines** — any difference is a BR-30 defect |
| 4 | Assert the "all binaries up to date" branch is still reachable (`[ "$NEEDS_BUILD_ORT" != "true" ]`) | Present; no orphaned `if` for the native path |
| 5 | Parse the fixture as YAML | Valid |
| 6 | Negative fixture: ONNX block weakened (scan removed, dispatch kept) | `FAIL` on the preservation assertion |

**Test Data:** baseline + post-change fixture; `cr01-reference-census.csv` rows R-01…R-12.
**Expected / Postconditions:** BR-30 is verified by *diff*, not by grep-presence — a weaker check would pass a gutted but still-mentioned ONNX path.

---

## 3. Integration Test Cases (IT)

> Technique: the gate harness executed **in-process against the real repository tree** — real files, real `git`, real `npm ls`. Mocking the filesystem here would test the mock; these cases must observe the bytes that will actually be committed.

### IT-01: Scope gate — the changed set equals the 18-entry allow-list, staged equals changed

| Field | Value |
|-------|-------|
| **ID** | IT-01 |
| **Level / Type** | IT — Scope integrity (gate G0/G6) |
| **Priority** | High |
| **Requirement** | AC-07, BR-23, BR-24, BR-18, BR-06, BR-07, BR-28, BR-29; FSD CC-18, SCC-05 |
| **FSD TC** | TC-22, TC-40, TC-23 |
| **Preconditions** | GP-1, GP-2, GP-4; G0 baseline snapshot of `git status --porcelain` captured **before** edits |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Capture `git status --porcelain` and subtract the G0 baseline entries (41 pre-existing unrelated paths) | Residual set = only SA4E-386 paths |
| 2 | Compare the residual set against the 18-path allow-list | Subset holds; **0** foreign paths |
| 3 | Count by status code | **18** entries = **17** ` M` + **1** `D ` |
| 4 | Assert the 17 modified paths are exactly: `package.json`, `backend/package.json`, `package-lock.json`, `.nvmrc`, `backend/Dockerfile`, and the 12 class-A workflows | 17/17 match, no additions |
| 5 | Assert the deleted path is `.github/workflows/build-native.yml` and it is added, not just removed from disk | Listed as `D ` (staged deletion), not ` D` (worktree-only) |
| 6 | Assert staged set = changed set (`git diff --cached --name-only` vs `git diff --name-only`) | Identical; count 18 |
| 7 | Assert no dependency/version key appears in the manifest diffs | 0 dependency lines; `engines.node` only |
| 8 | Assert no file under `documents/` is in the residual set | 0 (documentation is not part of the application diff) |

**Test Data:** `scope-allowlist.csv` (18 rows, with expected status code and family).
**Expected / Postconditions:** G6 verdict is numeric, not judgemental. **17 entries ⇒ Major defect D-COUNT (deletion not staged); 19+ ⇒ Critical D-SCOPE.**
**Note:** this case is the direct control for TR-02 — the harness must never be satisfied by an empty baseline comparison.

---

### IT-02: Static gate G3 executes every configuration check on the real tree

| Field | Value |
|-------|-------|
| **ID** | IT-02 |
| **Level / Type** | IT — Functional (gate G3) |
| **Priority** | High |
| **Requirement** | BR-04…BR-14, FR-01…FR-09; AC-01…AC-04; FSD CC-02…CC-12, SCC-02/03/07 |
| **FSD TC** | TC-02…TC-17 (static subset), TC-26 |
| **Preconditions** | GP-1…GP-6; edits complete |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run `CC-02` (semver range valid and admits `22.23.4`) on both manifests | PASS ×2 |
| 2 | Run `CC-03` — no loose constraint (`22.x`, `^22`, `~22`, `>=`, `*`) | No match, `exit 1 = PASS` |
| 3 | Run `CC-04` — no unquoted major literal; `CC-05` — no duplicate/contradictory pin | PASS ×2 |
| 4 | Run `CC-06` on `.nvmrc` (bytes) | PASS; `length=8`, hex `32322E32332E340A` |
| 5 | Run `CC-07` (JSON validity ×2), `CC-08` (YAML validity ×15) | PASS ×17 |
| 6 | Run `CC-09` (ARG values), `CC-10` (no `FROM` hunk), `CC-11`/`CC-12` (digest resolvable and equal) | PASS ×4 |
| 7 | Run `SCC-02` (no security relaxation), `SCC-03` (extended literal regex), `SCC-07` (no pin outside allow-list) | PASS ×3 |
| 8 | Render the per-check table | Every CC/SCC ID present with its own verdict; no aggregated shortcut |

**Test Data:** live tree; `declaration-census.csv`; `workflow-census.csv`; `digest-fixtures.csv` (for the resolution constant).
**Expected / Postconditions:** evidence EV-04/EV-08 lists each ID separately, so a reviewer can see *which* contract failed rather than "G3 red".

---

### IT-03: All 15 remaining workflow files parse as YAML

| Field | Value |
|-------|-------|
| **ID** | IT-03 |
| **Level / Type** | IT — Regression |
| **Priority** | High |
| **Requirement** | AC-04, BR-18; FSD CC-08 |
| **FSD TC** | TC-17 |
| **Preconditions** | CR-01 applied (15 files expected) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Enumerate `.github/workflows/*.yml` | Exactly **15** files |
| 2 | Parse each with a YAML 1.2 parser | 15/15 valid; 0 warnings that indicate structural change |
| 3 | Assert each file still has a top-level `on:` and `jobs:` key | 15/15 present |
| 4 | Assert no file has an empty `workflows:` list under `workflow_run` | 0 occurrences |

**Test Data:** live tree.
**Expected / Postconditions:** a count of 16 indicates CR-01 not applied; 14 indicates collateral deletion (BR-30).

---

### IT-04: Census — 15 files, 28 `node-version` keys, 27 literals, 1 matrix expression

| Field | Value |
|-------|-------|
| **ID** | IT-04 |
| **Level / Type** | IT — Functional (count oracle) |
| **Priority** | High |
| **Requirement** | BR-01, BR-15, BR-16, BR-17, FR-06, FR-08; AC-04; TDD MF-02 |
| **FSD TC** | TC-13, TC-16, TC-37 |
| **Preconditions** | GP-2; baseline census captured pre-change (29 keys = 27 literals + 2 matrices) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `grep -rn "node-version:" .github/workflows/` | **28** lines |
| 2 | Classify the 28 lines | 27 × `22.23.4` + 1 × `${{ matrix.node_version }}` (`build-onnxruntime.yml`) |
| 3 | Assert per-file literal counts against the census | 12 files, counts 1/4/2/1/2/6/1/2/3/2/1/2 |
| 4 | Assert `build-push-backend.yml` and `scheduled-prebuild-scan.yml` contain **0** `node-version:` keys | 0 and 0 (BR-17: reviewed, nothing to pin) |
| 5 | Assert `grep -c "node_version"` (underscore) still returns the ABI occurrences in `build-onnxruntime.yml` and `scheduled-prebuild-scan.yml` | Non-zero; unchanged from baseline |
| 6 | Assert quote style per file | 3 single-quote files, 9 double-quote files |

**Test Data:** `workflow-census.csv` (12 rows + 3 assertion rows).
**Expected / Postconditions:** the count is a pass/fail oracle. 29 ⇒ CR-01 not applied; 27 ⇒ one literal missed or the matrix was edited (BR-16 violation).

---

### IT-05: AC-08 sweep — zero references to `build-native` / `better-sqlite3` in workflows

| Field | Value |
|-------|-------|
| **ID** | IT-05 |
| **Level / Type** | IT — Negative (inverted oracle) |
| **Priority** | High |
| **Requirement** | AC-08, FR-14, BR-29, BR-19 |
| **FSD TC** | TC-43, TC-46 |
| **Preconditions** | CR-01 applied; UT-08 passed (runner semantics trusted) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `grep -rn "build-native\|better-sqlite3\|BETTER_SQLITE3" .github/workflows/` | **No output**; exit code **1** = PASS |
| 2 | Assert the exit code is exactly `1` (not `2`, not `127`) | Recorded verbatim in EV-04 |
| 3 | `test ! -e .github/workflows/build-native.yml` | exit `0` |
| 4 | Assert no renamed/replacement artefact: no `.bak`, `.disabled`, `.old`, `build-native*` under `.github/workflows/` | 0 matches |
| 5 | Assert the ONNX workflow is still present (`build-onnxruntime.yml`) | Present |

**Test Data:** live tree.
**Expected / Postconditions:** a match in **any** context (including a comment) fails the case — the remedy is to reword or delete the comment, never to widen the exclude pattern.

---

### IT-06: `build-onnxruntime.yml` has zero diff and the ONNX region of the scan workflow is byte-identical

| Field | Value |
|-------|-------|
| **ID** | IT-06 |
| **Level / Type** | IT — Regression (BR-30 preservation) |
| **Priority** | High |
| **Requirement** | BR-16, BR-30, FR-07, FR-16; AC-04; TDD AD-5 |
| **FSD TC** | TC-15, TC-37, TC-45 |
| **Preconditions** | Baseline blobs available via `git show HEAD:` |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `git diff --stat -- .github/workflows/build-onnxruntime.yml` | **Empty output** |
| 2 | Compare the `on.workflow_dispatch.inputs.node_version.options` list (pre vs post) | Unchanged: `20 / 22 / 24 / all` |
| 3 | Compare the ONNX scan block in `scheduled-prebuild-scan.yml` (region `if [ "$MAJOR" = "22" ]`) line-by-line against `HEAD` | 0 differing lines |
| 4 | Compare the `Trigger build-onnxruntime` step line-by-line | 0 differing lines |
| 5 | Assert the dispatch still passes `-f node_version="22"` | Present, unchanged |

**Test Data:** `cr01-reference-census.csv` rows R-05…R-12 (preservation set).
**Expected / Postconditions:** **any** diff inside the ONNX region is a Major BR-30 defect, not a tidy-up; the case must fail loudly rather than normalise it.

---

### IT-07: `better-sqlite3` is not a dependency under three independent detectors

| Field | Value |
|-------|-------|
| **ID** | IT-07 |
| **Level / Type** | IT — Negative (BR-29) |
| **Priority** | High |
| **Requirement** | BR-29, AC-08 |
| **FSD TC** | TC-46 |
| **Preconditions** | Installed tree present (or `--package-lock-only` state) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `npm ls better-sqlite3 --all` | Empty tree (package not installed); no `ERR` other than "missing" |
| 2 | Parse `package-lock.json` `packages` map → count keys matching `node_modules/better-sqlite3` | **0** |
| 3 | Scan all 3 manifests × 4 dependency kinds (`dependencies`, `devDependencies`, `optionalDependencies`, `peerDependencies`) | 0 hits |
| 4 | `grep -c "better-sqlite3" package-lock.json` | **1** — a metadata-only `peerDependenciesMeta` mention under `knex` (baseline, unchanged, outside `packages`) |
| 5 | Assert that single occurrence is unchanged from `HEAD` and is not inside a `"node_modules/…"` entry | Confirmed by diff (0 lines changed in that region) |

**Test Data:** live tree; `cr01-reference-census.csv` rows R-13…R-18.
**Expected / Postconditions:** an **added** dependency line is Critical; the pre-existing metadata mention must not be "cleaned up" (that would be an out-of-scope diff, AC-07).
**Note:** the single occurrence is documented so a reviewer does not misread it as a CR-01 residue.

---

### IT-08: Lockfile metadata changes exactly 2 lines and is idempotent

| Field | Value |
|-------|-------|
| **ID** | IT-08 |
| **Level / Type** | IT — Functional (derived artefact) |
| **Priority** | High |
| **Requirement** | BR-01, BR-06; AC-01, AC-07; TDD AD-6 |
| **FSD TC** | TC-30 |
| **Preconditions** | Both manifests already edited (Steps 2–3 of the implementation checklist complete) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `npm install --package-lock-only --ignore-scripts` | exit `0` |
| 2 | `grep -n '"node":' package-lock.json` | Exactly **2** entries (root + backend), both `">=22.23.4 <23"` |
| 3 | `git diff --stat package-lock.json` | **2 insertions, 2 deletions** — not a regeneration |
| 4 | Inspect the diff for `resolved`, `integrity`, `version` changes | 0 |
| 5 | Re-run the command; diff again | **No further change** (idempotent) |
| 6 | Run it *before* the manifest edits in a scratch clone (negative control) | Backend entry stays stale — proving the ordering constraint matters |

**Test Data:** live lockfile; scratch clone for step 6.
**Expected / Postconditions:** a full lockfile regeneration is a Major D-SCOPE defect (AC-07), even if every version happens to be identical.

---

### IT-09: Installs and builds succeed under the pin, and `engines` is proven advisory

| Field | Value |
|-------|-------|
| **ID** | IT-09 |
| **Level / Type** | IT — Functional + Negative (expectation correctness) |
| **Priority** | High |
| **Requirement** | AC-05, BR-20; FR-10; TDD AD-2 |
| **FSD TC** | TC-18, TC-19, TC-20, TC-29 |
| **Preconditions** | Mode = `HOST` with `node -v` = `v22.23.4` **or** Mode = `CONTAINER` (mandatory on this host, STP B-13) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Record mode and `node -v` | `mode=HOST|CONTAINER`, `v22.23.4` — untagged results are void |
| 2 | `npm ci` | exit `0`; **no** `EBADENGINE` warning |
| 3 | `npm ci --prefix backend` | exit `0`; no `EBADENGINE` |
| 4 | `npm run build` and `npm run build --prefix backend` (where defined) | exit `0` each |
| 5 | Deliberate negative control on an out-of-range runtime (`node v24.8.0`): `npm ci` | exit `0` **with** `npm warn EBADENGINE` naming `>=22.23.4 <23` |
| 6 | Assert no test asserts a hard block caused by `engines` | 0 such expectations exist in the suite |

**Test Data:** live tree; the host's Node 24.8.0 for step 5.
**Expected / Postconditions:** the suite must **not** claim that `engines` blocks installs — that belief would produce a false FAIL on every legitimate Node-24 CI runner and is explicitly out of scope (OI-T-01).
**Note:** step 5 is the reason E2E-API-01 (container runtime) is the authoritative proof of the pin, not the manifest.

---

### IT-10: INV-01 cross-artefact consistency — exactly one distinct version value

| Field | Value |
|-------|-------|
| **ID** | IT-10 |
| **Level / Type** | IT — Functional (invariant) |
| **Priority** | High |
| **Requirement** | BR-01, BR-02, BR-03; NFR-SEC-06; FR-06; AC-01, AC-04 |
| **FSD TC** | TC-26, TC-01 |
| **Preconditions** | GP-2 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Collect: root `engines.node`, backend `engines.node`, `.nvmrc` content, `ARG NODE_VERSION`, and all 27 literals | 31 values collected (2 + 1 + 1 + 27) |
| 2 | Reduce the range forms to their lower bound (`>=22.23.4 <23` → `22.23.4`) | Normalisation documented in the report |
| 3 | Compute the distinct set | **Size 1** = `22.23.4` |
| 4 | Assert the Dockerfile digest corresponds to the same tag (not merely the same version string) | Tag `22.23.4-slim` confirmed in EV-05 |
| 5 | Print the table of all 31 sources with their values | Reviewer can audit without re-deriving |

**Test Data:** `declaration-census.csv` + `workflow-census.csv`.
**Expected / Postconditions:** a size > 1 is Major D-DRIFT; BR-02 (no partial adoption) is enforced by the same case after an AF-1 re-pin.

---

### IT-11: SEC-CI-01 — the vulnerability scan runs before any push and is not skipped on pull requests

| Field | Value |
|-------|-------|
| **ID** | IT-11 |
| **Level / Type** | IT — Security (CI ordering) |
| **Priority** | High |
| **Requirement** | SEC-CI-01 (High), NFR-SEC-01, FR-11; AC-05 |
| **FSD TC** | TC-25 (ordering aspect) |
| **Preconditions** | `.github/workflows/build-push-backend.yml` and `ci.yml` readable |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Locate the Trivy/scan step and the image-push step in `build-push-backend.yml` | Both found; step indices recorded |
| 2 | Assert `scan_index < push_index` and that the push step depends on scan success (`needs:` or step-level `if:`) | Ordering correct; failure of the scan blocks the push |
| 3 | Assert the workflow runs on `pull_request` **or** that a separate PR-time scan job exists | Present — otherwise a PR can merge an unscanned image |
| 4 | Assert the scan uses `--severity CRITICAL,HIGH --ignore-unfixed --exit-code 1` (and that one unfiltered run exists for the claim) | Flags present; unfiltered run identified |
| 5 | Record the finding against SEC-CI-01's current state | If the pre-existing ordering is still post-push/PR-skipped and unchanged, mark `FAIL` with severity **High** and route to DevOps (this is the C-1 prerequisite) |

**Test Data:** live workflow definitions; `cr01-reference-census.csv` rows R-19…R-21.
**Expected / Postconditions:** the CVE claim in the PR is only valid if the scan that supports it ran **before** the artefact shipped.

---

### IT-12: Digest assertion exists and cannot be overridden by a build argument

| Field | Value |
|-------|-------|
| **ID** | IT-12 |
| **Level / Type** | IT — Security (supply chain) |
| **Priority** | High |
| **Requirement** | SEC-SC-01 (Medium), BR-10, BR-11; AC-03; SECURITY-REVIEW condition **C-3** |
| **FSD TC** | TC-09, TC-33 |
| **Preconditions** | CI workflow definitions + any digest-check script present |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Search for a step that compares the registry-resolved digest of `node:22.23.4-slim` with `ARG NODE_BASE_DIGEST` | Found; the comparison is explicit, not implied by the pull |
| 2 | Assert the step fails the job on mismatch (`exit 1` / `::error::`) | Present |
| 3 | Assert no workflow passes `NODE_BASE_DIGEST` as a `build-args:` / `--build-arg` override | **0** overrides — the value is only readable from the Dockerfile |
| 4 | Assert the Dockerfile cannot be built with a substituted digest in CI without failing step 1 | Path traced: override → assertion mismatch → job fails |
| 5 | If no assertion exists | `FAIL`, severity **High**, blocking condition C-3 open — route to DEV/DevOps before merge |

**Test Data:** live workflow definitions; `digest-fixtures.csv` row D-01.
**Expected / Postconditions:** the pin is enforced by construction, not by convention; behavioural proof is completed by E2E-API-05.

---

### IT-13: No security relaxation, no privilege change, no secret material in the diff

| Field | Value |
|-------|-------|
| **ID** | IT-13 |
| **Level / Type** | IT — Security (negative) |
| **Priority** | High |
| **Requirement** | BR-14, BR-17, NFR-SEC-03; FSD SCC-02; SECURITY-REVIEW SEC-CI-05 |
| **FSD TC** | TC-12, TC-22 (relaxation aspect) |
| **Preconditions** | Full 18-entry diff available |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Scan added lines for relaxation flags: `--no-verify`, `--no-audit`, `--force`, `engine-strict`, `--insecure`, `NODE_TLS_REJECT_UNAUTHORIZED` | **0** occurrences added |
| 2 | Scan for privilege/user changes: added `USER root`, `chmod 777`, `--privileged`, `sudo` | **0** added |
| 3 | Scan added lines for secret-shaped content (`ghp_`, `npm_` + 36 chars, `AKIA`, `-----BEGIN`, `password=`, `token=`) | **0** hits |
| 4 | Assert `ARG`/`ENV` lines in the editable Dockerfile region carry no credential | `NODE_VERSION` and `NODE_BASE_DIGEST` only |
| 5 | Assert removed lines do not include a security control that still matters (e.g. dropped `--ignore-unfixed`) | 0 removals of active controls |

**Test Data:** live diff; secret-pattern list from SECURITY-REVIEW.
**Expected / Postconditions:** "we only changed a version number" is verified, not assumed — a one-line `--no-audit` addition would be a Critical defect hidden inside a mechanical change.

---

## 4. End-to-End API Test Cases (E2E-API)

> Technique: a **real** `docker build` of the production stage from the edited Dockerfile, then probes executed **inside** the resulting image/container. This is the only level that proves the CVE is patched in the artefact that ships; every other level verifies intent.
>
> Not to be confused with application API contract testing — no endpoint contract changes in this ticket (STP §2.1.1). The `/health` probe here is a liveness gate for the pinned runtime, not a functional API test.

### E2E-API-01: The built production image runs `v22.23.4`

| Field | Value |
|-------|-------|
| **ID** | E2E-API-01 |
| **Level / Type** | E2E-API — Functional + Security (gate G5) |
| **Priority** | High |
| **Requirement** | FR-10, BR-11, BR-12; AC-03, AC-05; TDD CC-15, CC-16, FV-12 |
| **FSD TC** | TC-21, TC-34, TC-35, TC-07 (container equivalent) |
| **Preconditions** | G1 digest resolved; Docker daemon reachable; baseline image built pre-change (STP §2.4) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `docker build --no-cache --pull -f backend/Dockerfile --target production -t sa4e-backend:node-upgrade backend` | exit `0` |
| 2 | Read the build log's `FROM` line | `FROM node:22.23.4-slim@sha256:{digest}`; **no** `node:22-slim` |
| 3 | `docker run --rm --entrypoint node sa4e-backend:node-upgrade -v` | `v22.23.4` — exact string, no suffix |
| 4 | `docker image inspect … --format '{{.Config.Env}}'` and assert no `NODE_VERSION=22` leakage into a runtime variable | No stale major-only value |
| 5 | Re-run step 3 on the image built **without** `--no-cache` (cached layers) | Still `v22.23.4` (guards against a stale base layer) |

**Test Data:** `{digest}` from `digest-fixtures.csv`/live resolution; image tag `sa4e-backend:node-upgrade`.
**Expected / Postconditions:** **Stop condition:** anything but `v22.23.4` ⇒ Critical defect, do not push (TDD Step 10). Evidence EV-12/EV-13.

---

### E2E-API-02: `onnxruntime-node` loads inside the image on the pinned runtime

| Field | Value |
|-------|-------|
| **ID** | E2E-API-02 |
| **Level / Type** | E2E-API — Compatibility (native module ABI) |
| **Priority** | High |
| **Requirement** | NFR-SEC-04, BR-30, FR-07; AC-05; TDD SCC-01, FV-12 |
| **FSD TC** | TC-36, TC-21 (native aspect) |
| **Preconditions** | Image from E2E-API-01 available |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `docker run --rm --entrypoint node sa4e-backend:node-upgrade -e "console.log(require('onnxruntime-node/package.json').version)"` | A semver string (e.g. `1.x.y`) printed |
| 2 | Assert `process.versions.modules` is reported and matches an ABI valid for Node 22 | Value printed (e.g. `127`); no `NODE_MODULE_VERSION` mismatch error |
| 3 | Assert the module resolves through the expected transitive path (`backend → @huggingface/transformers → onnxruntime-node`) | Resolution path printed; no hoisting surprise |
| 4 | Negative control: run the same probe on an image built from the **pre-change** Dockerfile | Also passes — proving the probe detects ABI breakage, not merely "any image" (if it fails pre-change, the environment is wrong, not the change) |

**Test Data:** image tags `sa4e-backend:node-upgrade` and `sa4e-backend:baseline`.
**Expected / Postconditions:** a build-only check would not catch a runtime load failure; this probe loads the module for real. Evidence EV-13.

---

### E2E-API-03: The container starts and `GET /health` returns 200 with tools loaded

| Field | Value |
|-------|-------|
| **ID** | E2E-API-03 |
| **Level / Type** | E2E-API — Functional (smoke) |
| **Priority** | High |
| **Requirement** | AC-05, NFR-SEC-04; TDD FV-11 |
| **FSD TC** | TC-21 (runtime aspect) |
| **Preconditions** | Image available; port 48721 free |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `docker run -d --rm -p 48721:48721 --name sa4e-health sa4e-backend:node-upgrade` | Container id returned; no immediate exit |
| 2 | Poll `GET http://127.0.0.1:48721/health` up to 60 s | HTTP `200` |
| 3 | Assert the JSON body reports `tools_loaded > 0` | Value > 0 (proves the MCP tool registry initialised on the pinned runtime) |
| 4 | Assert the response contains no stack trace, absolute path, or version-leaking error detail | 0 occurrences |
| 5 | `docker stop sa4e-health` | Container removed; no orphan |

**Test Data:** port 48721; expected body keys `status`, `tools_loaded`.
**Expected / Postconditions:** a container that boots but loads 0 tools is a **FAIL**, not a warning — it means the runtime change broke module initialisation silently.

---

### E2E-API-04: MCP handshake and `tools/list` succeed from the containerised server

| Field | Value |
|-------|-------|
| **ID** | E2E-API-04 |
| **Level / Type** | E2E-API — Integration (protocol smoke) |
| **Priority** | Medium |
| **Requirement** | NFR-SEC-04, AC-05 |
| **FSD TC** | TC-21 (protocol aspect) |
| **Preconditions** | E2E-API-03 running container |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST `initialize` (`protocolVersion 2024-11-05`) to the container endpoint | `result.serverInfo` present; `result.capabilities` present |
| 2 | POST `tools/list` | `result.tools` array with ≥ 1 entry; each entry has `name` and `inputSchema` |
| 3 | Assert no tool fails to load due to a native-module error | 0 `NODE_MODULE_VERSION` / `ERR_DLOPEN_FAILED` strings in the response or container logs |
| 4 | Assert the server's reported Node runtime (if exposed in logs at startup) is `v22.23.4` | Matches |

**Test Data:** minimal JSON-RPC envelopes; no secrets.
**Expected / Postconditions:** protocol-level proof that the pin did not silently degrade the tool surface. Medium priority because E2E-API-02/03 already cover the native-load and boot paths.

---

### E2E-API-05: A substituted base-image digest is rejected, not silently built

| Field | Value |
|-------|-------|
| **ID** | E2E-API-05 |
| **Level / Type** | E2E-API — Security (negative, supply chain) |
| **Priority** | High |
| **Requirement** | SEC-SC-01, BR-10, BR-11; SECURITY-REVIEW condition **C-3** |
| **FSD TC** | TC-09 (negative aspect), TC-33 |
| **Preconditions** | IT-12 confirms an assertion exists; a second well-formed but wrong digest available |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Attempt `docker build --build-arg NODE_BASE_DIGEST=sha256:{wrong_but_valid_format} -f backend/Dockerfile --target production …` | Build **fails** (non-zero exit) — either at the registry pull (digest mismatch, `manifest unknown`) or at the assertion step |
| 2 | Assert the failure message names the digest/mismatch, not a generic error | Message contains `digest` or `manifest unknown` |
| 3 | Assert the image tag was **not** produced | `docker image inspect` fails / tag absent |
| 4 | Repeat through the CI path (assertion step) if available | Job fails at the assertion step, before any push |
| 5 | Record the observed failure layer | `pull-layer` or «assertion-step` — recorded in the PR so the control's strength is explicit |

**Test Data:** `digest-fixtures.csv` row D-06 (a well-formed digest for a different object).
**Expected / Postconditions:** C-3 is closed behaviourally. If the build **succeeds**, severity Critical (the pin is cosmetic) and the PR is blocked.

---

## 5. End-to-End UI Test Cases (E2E-UI)

**0 test cases — level not applicable.**

| Consideration | Assessment |
|---|---|
| UI surface in the change set | **None.** No route, component, template, stylesheet, asset or user-facing flow is touched by any of the 18 entries |
| Would a Playwright spec be legal? | **No.** AC-07 forbids new files in the diff; a committed spec would be a 19th entry and fail IT-01 |
| What would such a spec assert? | Nothing attributable to this change — any assertion would describe pre-existing UI behaviour, i.e. a false positive that inflates coverage |
| TDD position | TDD §11.5 records the same decision (E2E-UI not applicable) |
| Where does the residual visual risk live? | Nowhere in this ticket. The comparable "did it really work" risk is carried by E2E-API (in-image runtime) and SIT (GitHub-side observations) |
| Re-activation condition | If a future change to this repository touches a UI-bearing artefact, E2E-UI becomes applicable for that change — not retroactively for SA4E-386 |

> **Reviewer note.** A reviewer who expects a browser suite should read this section rather than treat the absence as an omission. The honest statement is: *this change cannot break a UI, and a UI test cannot verify this change.*

---

## 6. System Integration Test Cases (SIT — manual)

> Technique: manual observation and attestation against remote state and human-judgement criteria. Five of the eight cases observe GitHub state that does not exist until after push/merge; three require a reviewer's judgement. Every case produces a **quoted value or link**, never a bare "OK".

### SIT-01: PR attestation — 3 mandatory sections, 18-entry statement, exact commit subject

| Field | Value |
|-------|-------|
| **ID** | SIT-01 |
| **Level / Type** | SIT — Process integrity (gate G8) |
| **Priority** | High |
| **Requirement** | FR-12, FR-13, BR-22…BR-27, BR-29; AC-06; NFR-SEC-05 |
| **FSD TC** | TC-01, TC-23, TC-24, TC-27 |
| **Preconditions** | Branch `node-security-upgrade` pushed; PR open against `main` |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `git log -1 --format=%s` | Byte-equal to `chore(security): pin Node to 22.23.4 to patch CVE-2026-111497 and related highs` |
| 2 | `git show --stat --oneline HEAD` | 18 files changed; 1 deletion with `-167` lines |
| 3 | Verify PR section 1 (what/why + CVE id) | Present; names `CVE-2026-111497` and the related Highs |
| 4 | Verify PR section 2 (verification evidence) | Present; states **18 changed entries = 17 modified + 1 deleted**; carries the EV table (G0–G8) |
| 5 | Verify the exact BR-29 wording appears | `dead/legacy workflow removed — ```better-sqlite3``` is not a dependency of this repository` (verbatim) |
| 6 | Verify PR section 3 (rollback statement) + rollback anchor | Present; anchor recorded (condition C-2) |
| 7 | Verify the G1 advisory reading and the digest command are quoted, not summarised | Raw output quoted; a fabricated-but-well-formed digest would be detectable here |
| 8 | Confirm no direct commit on `main` | `git log origin/main -3` shows no SA4E-386 commit |
| 9 | Confirm hooks were not bypassed | No `--no-verify`; CI checks present on the commit |

**Test Data:** PR URL; evidence block EV-01…EV-16.
**Expected / Postconditions:** all 9 checks pass. A missing section or a paraphrased BR-29 sentence is **Major** — paraphrase is how "removed a dead workflow" turns into "removed a dependency".

---

### SIT-02: The deleted workflow is absent from the Actions listing; the ONNX workflow is present

| Field | Value |
|-------|-------|
| **ID** | SIT-02 |
| **Level / Type** | SIT — Functional (remote state) |
| **Priority** | High |
| **Requirement** | FR-14, AC-08, BR-29; TDD FV-19 |
| **FSD TC** | TC-43 |
| **Preconditions** | Change merged (or PR branch with Actions access) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `gh workflow list --all` | `Build Native Addons (better-sqlite3)` **absent** |
| 2 | `gh workflow list --all` | `Build ONNX Runtime Native (onnxruntime-node)` **present** |
| 3 | `gh workflow list --all` | `Scheduled Prebuild Scan` present and dispatchable |
| 4 | Open the Actions UI and inspect the workflow selector | No disabled/archived entry for the deleted workflow (UI may retain history — that is expected and acceptable) |
| 5 | Compare the workflow count with the file count (15) | Consistent; no workflow pointing at a missing file |

**Test Data:** `gh` output quoted verbatim in the close-out record.
**Expected / Postconditions:** an entry that lingers because of an unmerged deletion, or a workflow whose file was removed while the trigger remains, is D-CR01 Major.

---

### SIT-03: Branch protection no longer requires the deleted workflow's check

| Field | Value |
|-------|-------|
| **ID** | SIT-03 |
| **Level / Type** | SIT — Process integrity (AF-3) |
| **Priority** | High |
| **Requirement** | FR-14, BR-26, BR-27; AC-06; TDD AF-3 / Step 14.7 |
| **FSD TC** | TC-43 (consumer aspect) |
| **Preconditions** | Repository admin access (or a maintainer who can read protection rules) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Read the branch protection rule for `main` → required status checks | `Build Native Addons (better-sqlite3)` **not** listed |
| 2 | Assert the ONNX check(s) that remain are still listed and satisfiable | Present; at least one producing workflow exists |
| 3 | Assert no other required check references a workflow deleted by this change | 0 |
| 4 | If a stale required check exists, verify it was removed (screenshot/JSON) or the PR is blocked | Removal evidenced |

**Test Data:** protection-rule JSON/screenshot path in the evidence folder.
**Expected / Postconditions:** without this step the repository would permanently block every PR on a check that can never report — a failure mode that is invisible in the diff.

---

### SIT-04: Rollback rehearsal restores the previous pins

| Field | Value |
|-------|-------|
| **ID** | SIT-04 |
| **Level / Type** | SIT — Recoverability |
| **Priority** | Medium |
| **Requirement** | BR-26, BR-27; FR-12; TDD §10.5 RB-1…RB-4; SEC-RB-01 / condition **C-2** |
| **FSD TC** | TC-28 |
| **Preconditions** | Merge commit identified; rollback anchor recorded in the PR |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | In a scratch clone, `git revert --no-commit <merge-or-commit>` | Applies cleanly (no conflict from the 18-entry change) |
| 2 | Assert the restored values: `engines` `22.x`, `.nvmrc` previous content, Dockerfile ARGs previous, workflow literals `'22'`/`"22"` | All restored; 0 residual `22.23.4` literals |
| 3 | Assert the deleted workflow is restored by the revert | `build-native.yml` present again with 167 lines |
| 4 | Assert the consumer files revert together (no dangling trigger after revert) | `auto-release.yml` and `scheduled-prebuild-scan.yml` consistent |
| 5 | Record the anchor (commit SHA / image digest) used for RB-4 | Recorded in the close-out |
| 6 | Revert the scratch clone (no effect on the real branch) | Scratch discarded |

**Test Data:** scratch clone path; commit SHA.
**Expected / Postconditions:** rollback is proven, not assumed. A revert that restores code but leaves a dangling `workflow_run` entry is a Major finding.

---

### SIT-05: Post-merge observation — first class-A run green, first scheduled scan clean

| Field | Value |
|-------|-------|
| **ID** | SIT-05 |
| **Level / Type** | SIT — Regression (remote, time-delayed) |
| **Priority** | High |
| **Requirement** | FR-06, FR-16, BR-30; AC-04; TDD Step 14.1 / 14.6 |
| **FSD TC** | TC-45 (behavioural), TC-13 (observed) |
| **Preconditions** | Change merged to `main`; wait for the next scheduled run (Monday 00:00 UTC — 2026-11-02) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open the first post-merge class-A workflow run | Completed green |
| 2 | Inspect the `Setup Node.js` step log | Effective version `22.23.4` (not `22` resolved to a lower patch) |
| 3 | Open the first `Scheduled Prebuild Scan` run after merge | Completes green |
| 4 | Assert its log contains **no** `could not find any workflows named build-native.yml` | 0 occurrences |
| 5 | Assert it dispatches `build-onnxruntime.yml` only if the ONNX asset is missing | Dispatch absent when the asset exists; present when removed in a test scenario |
| 6 | Probe the deployed digest (post-publish) | In-container `node -v` = `v22.23.4` (TDD 14.2) |

**Test Data:** run URLs; timestamps; deployed digest.
**Expected / Postconditions:** FR-16 is only "confirmed" after this observation. Until 2026-11-02 the correct status is `NOT_EXECUTED (scheduled)` — never "assumed green".

---

### SIT-06: Log hygiene — no credentials or tokens in CI/build logs

| Field | Value |
|-------|-------|
| **ID** | SIT-06 |
| **Level / Type** | SIT — Security (manual review) |
| **Priority** | High |
| **Requirement** | NFR-SEC-03, BR-17; SECURITY-REVIEW SEC-CI-05 |
| **FSD TC** | TC-22 (security aspect) |
| **Preconditions** | At least one full CI run and one `docker build --progress=plain` log available |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Search the build log for `ghp_`, `npm_`, `AKIA`, `Bearer `, `password`, `token=` | 0 hits |
| 2 | Inspect `ARG`/`ENV` echo in the build log | Only `NODE_VERSION` and `NODE_BASE_DIGEST` — no secret-bearing ARG |
| 3 | Inspect the `npm publish` step log (if it ran) | Token masked (`***` / `[REDACTED]`) |
| 4 | Inspect workflow file for inline secrets in `run:` argv | 0 occurrences (SEC-CI-05 signature) |
| 5 | Record the exact log line proving masking | Quoted line in evidence |

**Test Data:** CI run URL; local build log; masking markers.
**Expected / Postconditions:** a leak is **Critical** and requires token rotation before merge, not a log-scrubbing commit.

---

### SIT-07: The Trivy claim is meaningful — M1 ∧ M2 ∧ M3 against the baseline, unfixed set attributed

| Field | Value |
|-------|-------|
| **ID** | SIT-07 |
| **Level / Type** | SIT — Security (judgement + attestation) |
| **Priority** | High |
| **Requirement** | NFR-SEC-01, FR-11, BR-21; TDD AD-8; SECURITY-REVIEW condition **C-1**, SEC-CVE-01 |
| **FSD TC** | TC-25, TC-42 |
| **Preconditions** | Baseline scan (pre-change image) and post-change scan; filtered + one unfiltered run; UT-06 passed |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Confirm the baseline scan exists (pre-change image, same flags) | Present; if absent, mark `NOT_EXECUTED` and escalate — C-1 cannot close |
| 2 | M1: assert the four named CVEs are absent from the post-change image | 0 occurrences by `VulnerabilityID` |
| 3 | M2: diff CRITICAL+HIGH fixable sets by `VulnerabilityID` | No **increase** in fixable findings (removals expected) |
| 4 | M3: run once **without** `--ignore-unfixed` and list the unfixed set | Listed; each entry attributed (base-image/library/no fix available) |
| 5 | Assert the PR does **not** claim "0 CVEs" | Claim is exactly M1∧M2∧M3; a bare zero is a defect (BR-21) |
| 6 | If Trivy was unavailable locally, confirm the CI run supplied the evidence | CI report attached; local verdict `NOT_EXECUTED` |
| 7 | Record the scanner version and flag set | Recorded (unpinned overlay caveat, SEC-CVE-01) |

**Test Data:** two JSON reports (filtered/unfiltered), baseline + new; `trivy-claim-fixtures.csv` expectations.
**Expected / Postconditions:** the security claim is reproducible by a reviewer from the attached JSON — not from a summary sentence.

---

### SIT-08: The gitignored worktree `.nvmrc` disposition is recorded

| Field | Value |
|-------|-------|
| **ID** | SIT-08 |
| **Level / Type** | SIT — Functional (BR-09 record) |
| **Priority** | Medium |
| **Requirement** | BR-09; FR-03; AC-02 |
| **FSD TC** | TC-41, TC-07 |
| **Preconditions** | `git worktree list` output available |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `git worktree list` | Active worktrees enumerated |
| 2 | If `.kilo/worktrees/pickled-hook` is active: read its `.nvmrc` | Contains `22.23.4` (8 bytes) |
| 3 | If inactive: confirm the PR declares it inactive with the `git worktree list` line as evidence | Declaration present |
| 4 | Assert the worktree file never appears in `git diff` (it is gitignored) | Absent; AC-07 unaffected |
| 5 | Record the decision in the close-out | Recorded either way |

**Test Data:** `git worktree list` output.
**Expected / Postconditions:** a silent omission is the failure mode; "decided not to update, here is why" is a pass.

---

## 7. Requirements Traceability Matrix (RTM)

### 7.1 BRD Functional Requirements

| Requirement | Source | Description (abridged) | Test Cases | Status |
|-------------|--------|------------------------|------------|--------|
| FR-01 | BRD §5 / FSD UC-02 | Root `package.json` `engines.node = ">=22.23.4 <23"` | PBT-01, UT-01, IT-02, IT-10 | ✅ Covered |
| FR-02 | BRD §5 / FSD UC-02 | Backend `package.json` same range | PBT-01, UT-01, IT-02, IT-08 | ✅ Covered |
| FR-03 | BRD §5 / FSD UC-03 | `.nvmrc = 22.23.4` (8 bytes) | PBT-02, UT-02, IT-02 | ✅ Covered |
| FR-04 | BRD §5 / FSD UC-04 | Dockerfile `NODE_VERSION` + real digest | PBT-04, UT-04, UT-05, IT-02, E2E-API-01 | ✅ Covered |
| FR-05 | BRD §5 / FSD UC-04 | Dockerfile comment naming CVE-2026-111497 (+ Highs) | UT-04, IT-02 | ✅ Covered |
| FR-06 | BRD §5 / FSD UC-05 | Every `actions/setup-node` uses 22.23.4 (27 literals) | PBT-03, UT-03, IT-04, SIT-05 | ✅ Covered |
| FR-07 | BRD §5 / FSD UC-05 | Matrix handling preserved (class-B untouched) | UT-03, IT-06 | ✅ Covered |
| FR-08 | BRD §5 / FSD UC-05 | `build-push-backend.yml` / `scheduled-prebuild-scan.yml` reviewed | IT-04, IT-02 | ✅ Covered |
| FR-09 | BRD §5 / FSD UC-06 | Grep clean of `22.x` / `'22'` / `"22"` | PBT-05, UT-08, IT-05 | ✅ Covered |
| FR-10 | BRD §5 / FSD UC-06 | `docker build --target production` succeeds | E2E-API-01, IT-09 | ✅ Covered |
| FR-11 | BRD §5 / FSD UC-06 | Optional Trivy scan, claim restated as M1∧M2∧M3 | UT-06, SIT-07 | ✅ Covered |
| FR-12 | BRD §5 / FSD UC-07 | Branch + per-file staging + exact commit subject | IT-01, SIT-01, SIT-04 | ✅ Covered |
| FR-13 | BRD §5 / FSD UC-07 | PR against `main`, no direct push | SIT-01 | ✅ Covered |
| FR-14 | FSD §1.2.1 (CR-01) | Delete `.github/workflows/build-native.yml` | IT-05, IT-01, SIT-02 | ✅ Covered |
| FR-15 | FSD §1.2.1 (CR-01) | `auto-release.yml` trigger list = 1 item | UT-09, IT-02 | ✅ Covered |
| FR-16 | FSD §1.2.1 (CR-01) | `scheduled-prebuild-scan.yml` simplified, ONNX preserved | UT-10, IT-06, SIT-05 | ✅ Covered |

### 7.2 BRD Acceptance Criteria

| Requirement | Source | Acceptance criterion (abridged) | Test Cases | Status |
|-------------|--------|--------------------------------|------------|--------|
| AC-01 | BRD §2.3 STORY 1 | Every `engines.node` declaration uses the exact range | PBT-01, PBT-05, UT-01, IT-02, IT-10 | ✅ Covered |
| AC-02 | BRD §2.3 STORY 2 | `.nvmrc` = `22.23.4` (byte-exact) | PBT-02, UT-02, IT-02, SIT-08 | ✅ Covered |
| AC-03 | BRD §2.3 STORY 3 | Dockerfile pins version + correct digest of `node:22.23.4-slim` | PBT-04, UT-04, UT-05, IT-12, E2E-API-01, E2E-API-05 | ✅ Covered |
| AC-04 | BRD §2.3 STORY 4 | Every CI workflow uses 22.23.4; no `'22'` remains | PBT-03, PBT-05, UT-03, IT-03, IT-04, SIT-05 | ✅ Covered |
| AC-05 | BRD §2.3 STORY 5 | Build succeeds; no High CVE remains from the base image | IT-09, E2E-API-01, E2E-API-02, E2E-API-03, E2E-API-04, SIT-07 | ✅ Covered |
| AC-06 | BRD §2.3 STORY 6 | PR opened; nothing pushed directly to `main` | IT-01, SIT-01, SIT-04 | ✅ Covered |
| AC-07 | BRD §2.3 STORY 5 | No out-of-scope changes (no business code, no dependency bump) | IT-01, IT-08, IT-13, SIT-01 | ✅ Covered |
| AC-08 | FSD §1.2.1 (CR-01) | No reference to `build-native` / `better-sqlite3` under `.github/workflows/` | IT-05, IT-07, UT-08, UT-09, UT-10, SIT-02 | ✅ Covered |

### 7.3 FSD Use Cases

| Requirement | Source | Description | Test Cases | Status |
|-------------|--------|-------------|------------|--------|
| UC-01 | FSD §3.1 (F-01) | Pre-flight: target version still latest safe 22.x; digest resolvable | PBT-04, SIT-01 | ✅ Covered |
| UC-02 | FSD §3.2 (F-02) | Pin `engines.node` in both manifests | PBT-01, UT-01, IT-08, IT-09 | ✅ Covered |
| UC-03 | FSD §3.3 (F-03) | Pin local runtime via `.nvmrc` | PBT-02, UT-02, IT-02, SIT-08 | ✅ Covered |
| UC-04 | FSD §3.4 (F-04) | Pin base image by version **and** real digest | PBT-04, UT-04, UT-05, IT-02, E2E-API-01, E2E-API-05 | ✅ Covered |
| UC-05 | FSD §3.5 (F-05) | Synchronise all CI workflows | PBT-03, PBT-05, UT-03, IT-03, IT-04, IT-06 | ✅ Covered |
| UC-06 | FSD §3.6 (F-06) | Verification suite and evidence | UT-06, UT-07, IT-02, IT-09, IT-11, E2E-API-02, E2E-API-03, E2E-API-04, SIT-07 | ✅ Covered |
| UC-07 | FSD §3.7 (F-07) | Branch, commit, PR | IT-01, SIT-01, SIT-04 | ✅ Covered |
| UC-08 | FSD §3.9 (F-08) | Retire the legacy `better-sqlite3` workflow (CR-01) | UT-09, UT-10, IT-05, IT-06, IT-07, SIT-02, SIT-03, SIT-05 | ✅ Covered |

### 7.4 FSD Business Rules (BR-01 … BR-30)

| Requirement | Description (abridged) | Test Cases | Status |
|-------------|------------------------|------------|--------|
| BR-01 | `TARGET_NODE` is the single source of truth | PBT-01, IT-04, IT-10 | ✅ |
| BR-02 | Newer safe 22.x ⇒ **all** artefacts updated together (no partial adoption) | PBT-01, IT-10, SIT-01 | ✅ |
| BR-03 | Only 22.x patch changes; no major upgrade | PBT-01, IT-10 | ✅ |
| BR-04 | Every `engines.node` declaration is exactly `">=22.23.4 <23"` | PBT-01, UT-01, IT-02 | ✅ |
| BR-05 | Loose constraints prohibited | PBT-01, PBT-05, UT-01 | ✅ |
| BR-06 | Only `engines.node` changes in the two manifests | UT-01, IT-01, IT-08 | ✅ |
| BR-07 | `extension/package.json` not modified | IT-01 | ✅ |
| BR-08 | `.nvmrc` is 8 bytes `22.23.4\n`; no BOM/CRLF/`v`/range | PBT-02, UT-02, IT-02 | ✅ |
| BR-09 | Worktree `.nvmrc` disposition recorded | SIT-08 | ✅ |
| BR-10 | Digest resolved at implementation time; copying/guessing forbidden | PBT-04, SIT-01 | ✅ |
| BR-11 | Digest is `node:22.23.4-slim`'s and matches `sha256:` + 64 lowercase hex | PBT-04, UT-05, IT-02 | ✅ |
| BR-12 | The two `FROM` lines are not edited | UT-04, IT-02, IT-06 | ✅ |
| BR-13 | CVE comment + digest-authority note present | UT-04, IT-02 | ✅ |
| BR-14 | No security relaxation in the Dockerfile diff | IT-13, UT-04 | ✅ |
| BR-15 | All literals = 22.23.4, quote style preserved | PBT-03, UT-03, IT-04 | ✅ |
| BR-16 | Matrix edited only if major-only; multi-major preserved | UT-03, IT-06, IT-04 | ✅ |
| BR-17 | No-pin workflows reviewed; modified only if a hardcoded version exists | IT-04, IT-13 | ✅ |
| BR-18 | No non-Node job and no `uses:` action version changes | IT-01, IT-02, IT-03 | ✅ |
| BR-19 | A non-empty forbidden-literal result blocks the commit | PBT-05, UT-08, IT-05 | ✅ |
| BR-20 | Un-runnable checks are `NOT EXECUTED`, never "passed" | UT-07, UT-06, IT-09 | ✅ |
| BR-21 | Trivy optional; no "0 CVE" claim without a scan | UT-06, SIT-07 | ✅ |
| BR-22 | Verification against the edited tree; no commit while a mandatory check fails | SIT-01, IT-01 | ✅ |
| BR-23 | Diff contains only in-scope configuration artefacts | IT-01 | ✅ |
| BR-24 | Explicit path staging; no `git add -A` / `git add .` | IT-01, SIT-01 | ✅ |
| BR-25 | Commit subject is byte-exact | SIT-01 | ✅ |
| BR-26 | PR mandatory, targets `main`, 3 sections; no direct push | SIT-01, SIT-03 | ✅ |
| BR-27 | Hooks and branch protection never bypassed | SIT-01 | ✅ |
| BR-28 | Historical documents not rewritten | IT-01 | ✅ |
| BR-29 | `better-sqlite3` never added as a dependency (any manifest, any kind) | IT-07, IT-01, SIT-01 | ✅ |
| BR-30 | ONNX capability preserved: scan, `needs_ort`, dispatch, and `build-onnxruntime.yml` | UT-10, IT-06, E2E-API-02, SIT-05 | ✅ |

### 7.5 Non-Functional Requirements

| Requirement | Description | Test Cases | Status |
|-------------|-------------|------------|--------|
| NFR-SEC-01 | CVE posture measurable (restated as M1∧M2∧M3) | UT-06, IT-11, SIT-07 | ✅ Covered |
| NFR-SEC-03 | No security relaxation; no secrets exposed | IT-13, SIT-06, UT-04 | ✅ Covered |
| NFR-SEC-04 | `onnxruntime-node` still works on the pinned runtime | E2E-API-02, E2E-API-03, E2E-API-04, IT-06 | ✅ Covered |
| NFR-SEC-05 | CVE rationale documented in artefact + PR | UT-04, SIT-01 | ✅ Covered |
| NFR-SEC-06 | Cross-environment version consistency (INV-01) | IT-10, IT-04 | ✅ Covered |

### 7.6 Security review conditions and findings

| ID | Severity | Requirement | Test Cases | Status |
|----|----------|-------------|------------|--------|
| C-1 | Blocking | M1/M2/M3 evaluated against a deployed/previous baseline | SIT-07, UT-06 | ✅ Covered |
| C-2 | Blocking | Rollback anchor recorded and rollback rehearsed | SIT-04, SIT-01 | ✅ Covered |
| C-3 | Blocking | Digest assertion enforced; no build-arg override | IT-12, E2E-API-05 | ✅ Covered |
| SEC-CI-01 | 🟠 High | Scan before push; PRs scanned | IT-11 | ✅ Covered |
| SEC-CI-05 | 🔵 Low | No inline secrets in workflow argv / logs | SIT-06, IT-13 | ✅ Covered |
| SEC-SC-01 | 🟡 Medium | Digest not enforceable by override | IT-12, E2E-API-05 | ✅ Covered |
| SEC-RB-01 | 🔵 Low | No recorded rollback anchor | SIT-04 | ✅ Covered |
| SEC-CVE-01 | 🟡 Medium | M1/M2/M3 not hermetic | SIT-07 (caveat recorded) | ✅ Covered |
| SEC-DR-01 | 🟡 Medium | CI uses `--force --no-audit` (pre-existing) | IT-13 (asserts none **added**) | ✅ Covered (no regression) |
| SEC-RM-01 | 🔵 Low | Published assets remain | — | ⛔ Out of scope (STP §3.2 #8) |
| SEC-CI-02/03/06, SEC-SC-02/03, SEC-DK-01, SEC-DOC-01 | 🟡/🔵/ℹ️ | Pre-existing gaps / documentation | — | ⛔ Out of scope (forward tickets) |

### 7.7 Coverage summary

| Category | Total | Covered | Coverage |
|----------|-------|---------|----------|
| Functional Requirements (FR-01…FR-16) | 16 | 16 | 100% |
| Acceptance Criteria (AC-01…AC-08) | 8 | 8 | 100% |
| Use Cases (UC-01…UC-08) | 8 | 8 | 100% |
| Business Rules (BR-01…BR-30) | 30 | 30 | 100% |
| Non-Functional Requirements (in scope) | 5 | 5 | 100% |
| Blocking security conditions (C-1…C-3) | 3 | 3 | 100% |
| Security findings (in scope) | 9 | 9 | 100% |
| FSD test scenarios (TC-01…TC-46) | 46 | 46 | 100% |
| **Overall** | **125** | **125** | **100%** |

---

## 8. FSD Test-Scenario Coverage (TC-01 … TC-46)

The FSD defines 46 scenarios. This table proves each is operationalised by at least one STC case, and records where a scenario is only partially automatable.

| FSD TC | Scenario (abridged) | STC case(s) | Coverage note |
|--------|---------------------|-------------|---------------|
| TC-01 | Target version still latest safe 22.x | PBT-04, SIT-01 | Manual advisory read (G1) + digest normaliser |
| TC-02 | Root manifest engines value | PBT-01, UT-01, IT-02 | Fully automated |
| TC-03 | Backend manifest engines value | PBT-01, UT-01, IT-02 | Fully automated |
| TC-04 | No loose engines constraint | PBT-01, PBT-05, IT-02 | Fully automated |
| TC-05 | Both manifests valid JSON | UT-01, IT-02 | Fully automated |
| TC-06 | `.nvmrc` content + byte count | PBT-02, UT-02, IT-02 | Byte-level |
| TC-07 | `nvm use` activates 22.23.4 | E2E-API-01, SIT-08 | **Adapted**: nvm absent on the host ⇒ container probe + recorded disposition |
| TC-08 | Dockerfile `NODE_VERSION` | UT-04, IT-02 | Fully automated |
| TC-09 | Digest equals registry | PBT-04, UT-05, E2E-API-05 | Automated + behavioural negative |
| TC-10 | Digest format valid | UT-05 | Fully automated |
| TC-11 | CVE comment present | UT-04 | Fully automated (containment, not meaning) |
| TC-12 | `FROM` lines untouched | UT-04, IT-02, IT-06 | Fully automated |
| TC-13 | All CI literals updated | PBT-03, IT-04, SIT-05 | Static + observed in CI log |
| TC-14 | Quote style preserved | PBT-03 | Fully automated |
| TC-15 | Matrix workflow handled correctly | UT-03, IT-06 | Fully automated |
| TC-16 | No-pin workflows reviewed | IT-04 | Fully automated (0 keys) |
| TC-17 | Workflow YAML still valid | IT-03 | Fully automated |
| TC-18 | Root install works on pinned runtime | IT-09 | Mode-tagged |
| TC-19 | Backend install works | IT-09 | Mode-tagged |
| TC-20 | Builds succeed | IT-09 | Mode-tagged |
| TC-21 | Production image builds with native deps | E2E-API-01, E2E-API-02, E2E-API-03 | Automated in container |
| TC-22 | Change scope minimal (18 entries) | IT-01 | Fully automated (with G0 baseline) |
| TC-23 | Commit message + staging discipline | SIT-01 | Manual attestation |
| TC-24 | PR completeness, no direct push | SIT-01 | Manual attestation |
| TC-25 | Optional CVE scan | UT-06, SIT-07 | Evaluator automated; claim attested |
| TC-26 | Cross-environment consistency | IT-10 | Fully automated |
| TC-27 | Verify-on-stale-tree rejected | SIT-01, IT-01 | Evidence freshness attested + baseline |
| TC-28 | Rollback path | SIT-04 | Manual rehearsal |
| TC-43 | Legacy workflow gone (15 files) | IT-05, IT-01, SIT-02 | Static + remote state |
| TC-44 | Release trigger list = 1 item | UT-09, IT-02 | Fully automated |
| TC-45 | Scheduled scan simplified, ONNX preserved | UT-10, IT-06, SIT-05 | Static diff + behavioural observation |
| TC-46 | AC-08 zero-match, no dependency added | IT-05, IT-07 | Fully automated (3 detectors) |
| TC-29 | Soft enforcement of `engines` characterised | IT-09 | Fully automated (negative control) |
| TC-30 | Lockfile metadata sync idempotent | IT-08 | Fully automated |
| TC-31 | `.nvmrc` byte-exact on Windows | PBT-02, UT-02 | Fully automated |
| TC-32 | Digest denotes a multi-arch index | PBT-04 | Fully automated (fixture) |
| TC-33 | Tag and digest describe the same object | PBT-04, IT-02 | Fully automated |
| TC-34 | No stale base layer | E2E-API-01 (step 5) | Automated (`--no-cache --pull`) |
| TC-35 | Image runs the pinned runtime | E2E-API-01 | Automated |
| TC-36 | Transitive native module loads in image | E2E-API-02 | Automated |
| TC-37 | Class-B matrices functionally unchanged | IT-06, IT-04 | Automated (structure) |
| TC-38 | Scheduled dispatcher matches class-B input contract | UT-10 | Automated |
| TC-39 | Extended literal regex — no false pass/failure | PBT-05, UT-08 | Automated |
| TC-40 | Scope gate rejects an out-of-scope file | IT-01 | Automated (step 2) |
| TC-41 | Gitignored worktree handled | SIT-08 | Manual record |
| TC-42 | CVE comparison meaningful (M1∧M2∧M3) | UT-06, SIT-07 | Evaluator automated; attribution attested |

**Result: 46/46 FSD scenarios operationalised (100%).** 3 are manual-only (TC-23, TC-24, TC-28 → SIT-01/SIT-04), 2 are hybrid (TC-41 → SIT-08; TC-07 adapted to container + disposition), and the remainder are automated or automated-plus-attested.

## 9. Coverage Analysis and Residual Gaps

### 9.1 What is proven, and by which level

| Claim | Proven by | Not proven by |
|-------|-----------|---------------|
| Every declaration carries `22.23.4` | IT-02, IT-04, IT-10 | A green CI run alone (a workflow can be green on a stale matrix) |
| The CVE is patched in the **shipped** artefact | E2E-API-01 (in-image `node -v`) | The manifest, the range, or `npm ci` — all advisory (IT-09 step 5) |
| The digest is the registry's, for the right tag | PBT-04, UT-05, IT-12, E2E-API-05 | Format checks alone (a fabricated digest is well-formed) |
| The change set is exactly 18 entries | IT-01 (with the G0 baseline) | `git diff --stat` read by eye (18 files vs 18 entries confuses M/D) |
| CR-01 left no dangling reference | UT-09, IT-05, SIT-02 | A grep of only `.github/workflows/` (branch protection is elsewhere) |
| ONNX capability intact | UT-10, IT-06, E2E-API-02, SIT-05 | Presence-only grep (a gutted block still matches) |
| The Trivy claim is honest | UT-06, SIT-07 | A single filtered run ("0 High" can be an artefact of `--ignore-unfixed`) |

### 9.2 Residual gaps (declared, not hidden)

| # | Gap | Why it remains | Compensating control |
|---|-----|----------------|----------------------|
| G-01 | A **fabricated but well-formed** digest cannot be detected automatically | It is indistinguishable from a real one without the registry | SIT-01 requires the raw resolver command output to be quoted; PBT-04 guarantees determinism from a real response |
| G-02 | FR-05 comment **meaning** is not machine-checkable | Containment ≠ correctness | UT-04 requires both mandatory phrases; SIT-01 reads the comment |
| G-03 | FR-16 behavioural confirmation is delayed to the weekly cron | Calendar-bound (2026-11-02) | Status is `NOT_EXECUTED (scheduled)` until then; structure is proven by IT-06 |
| G-04 | Local Trivy unavailable (STP B-14) | Tool not installed on the verification host | UT-06 validates the evaluator; SIT-07 consumes the CI report |
| G-05 | `nvm use` cannot be exercised on this host | nvm absent; host is Node 24.8.0 | CONTAINER mode for G4/G5; SIT-08 records the disposition |
| G-06 | ONNX prebuild **execution** is not exercised | Would require a multi-hour matrix run across 4 platforms | Structural preservation (IT-06) + scheduled-run observation (SIT-05) |
| G-07 | Branch-protection state is not in the repository | Remote configuration | SIT-03 with admin evidence |
| G-08 | E2E-UI absent | No UI surface (§5) | Not a gap in coverage — a gap in the product, and correctly out of scope |

### 9.3 Cases with the highest value per minute of execution

If the schedule compresses, the following 8 cases carry the majority of the risk reduction and must not be dropped: **IT-01** (scope), **IT-04** (count), **IT-05** (AC-08), **IT-06** (ONNX preservation), **IT-07** (no dependency), **E2E-API-01** (runtime), **E2E-API-02** (native load), **SIT-07** (honest CVE claim).

Conversely, the cases that may be deferred without weakening the security claim are **E2E-API-04** (protocol smoke, Medium) and **SIT-04** (rollback rehearsal, Medium) — deferral must be recorded as `NOT_EXECUTED` with a reason, never as a pass.

---

## 10. Appendix

### 10.1 Test data files

All fixtures live in `documents/SA4E-386/testdata/` and are referenced by the cases above. They contain **no** production secrets and **no** real registry digests (real values are resolved live at G1 and recorded in EV-05).

**13 files, 147 data rows, 41/41 case IDs referenced.**

| File | Rows | Drives | Purpose |
|------|------|--------|---------|
| `declaration-census.csv` | 11 | PBT-01, UT-01, UT-04, IT-02, IT-10 | Every declaration site with observed → expected values |
| `nvmrc-fixtures.csv` | 8 | PBT-02, UT-02, IT-02 | Byte-level valid/invalid payloads with reason codes |
| `digest-fixtures.csv` | 6 | PBT-04, UT-05, IT-12, E2E-API-01, E2E-API-05 | Registry response shapes and normalisation outcomes |
| `workflow-census.csv` | 19 | PBT-03, PBT-05, UT-03, IT-04 | 12 pin sites, quote styles, counts, 4 classifier probes |
| `workflow-yaml-validity.csv` | 16 | IT-03, IT-05 | 15 post-CR-01 workflows plus the deleted file (must be absent) |
| `cr01-reference-census.csv` | 21 | UT-09, UT-10, IT-06, IT-07, IT-11 | Every pre-change reference to the legacy workflow and its expected post-change state |
| `trivy-claim-fixtures.csv` | 6 | UT-06, UT-07, SIT-07 | M1/M2/M3 synthetic report pairs incl. `NOT_EXECUTED` cases |
| `scope-allowlist.csv` | 18 | IT-01 | The 18 permitted paths with expected status codes and families |
| `inverted-oracle-exit-codes.csv` | 6 | UT-08 | Exit-code matrix (0/1/2 × inverted/normal) |
| `runtime-gate-expectations.csv` | 7 | IT-09 | Install/build expectations per runtime, incl. the advisory-behaviour control |
| `container-probe-expectations.csv` | 8 | E2E-API-01, E2E-API-02, E2E-API-03, E2E-API-04 | Image build, runtime, ABI, health and protocol probes |
| `relaxation-secret-patterns.csv` | 12 | IT-13 | Relaxation, privilege and secret patterns that must not be added |
| `sit-attestation-checklist.csv` | 9 | SIT-01…SIT-08 | Attestation artefacts, pass criteria and owner per manual case |

### 10.2 Command reference (copy-paste, byte-safe)

| Purpose | Command | Notes |
|---------|---------|-------|
| Byte payload of `.nvmrc` | `Format-Hex .nvmrc` / `od -c .nvmrc` | Must show `32 32 2E 32 33 2E 34 0A` |
| Engines value | `npm pkg get engines.node` / `npm pkg get engines.node --prefix backend` | Returns the quoted string |
| Literal census | `grep -rn "node-version:" .github/workflows/` | Expect 28 lines |
| Forbidden literal | `grep -rnE "node-version:\s*['\"]?2[0-9](\.x)?['\"]?\s*$" .github/workflows/` | Empty; **exit 1 = PASS** |
| AC-08 sweep | `grep -rn "build-native\|better-sqlite3\|BETTER_SQLITE3" .github/workflows/` | Empty; **exit 1 = PASS** |
| Deleted file | `test ! -e .github/workflows/build-native.yml` | exit 0 |
| Digest resolution | `docker buildx imagetools inspect node:22.23.4-slim` | Preferred resolver (P2) |
| Image runtime | `docker run --rm --entrypoint node sa4e-backend:node-upgrade -v` | Expect `v22.23.4` |
| Health | `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:48721/health` | Expect `200` |
| Staged count | `git diff --cached --name-only | wc -l` | Must print 18 |
| Lockfile metadata | `grep -n '"node":' package-lock.json` | Exactly 2 lines |
| Dependency absence | `npm ls better-sqlite3 --all` | Empty tree |

### 10.3 Evidence naming

| Artefact | Path |
|----------|------|
| Screenshots / UI captures (SIT) | `documents/SA4E-386/evidence/SIT-{NN}-{slug}.png` |
| Raw command transcripts | `documents/SA4E-386/evidence/EV-{NN}-{slug}.txt` |
| Trivy JSON (filtered / unfiltered) | `documents/SA4E-386/evidence/trivy-{baseline|new}-{filtered|full}.json` |
| Execution tracker | `documents/SA4E-386/TEST-REPORT-SA4E-386.csv` |

Every evidence line must carry `mode=HOST|CONTAINER|CI|POST-MERGE` and the `node -v` observed at capture time (GP-3).

### 10.4 Definitions used by the expected results

| Term | Meaning in this document |
|------|--------------------------|
| `PASS` / `FAIL` / `NOT_EXECUTED` | The three legal verdicts; the third is never a synonym for the first |
| `exit 1 = PASS` | Inverted oracle: no match found (correct for AC-08 and the forbidden-literal gates) |
| Count oracle | 18 entries / 28 keys / 15 files — each has a specific meaning when wrong |
| Class-A workflow | A workflow carrying a `node-version` literal (12 files, 27 values) |
| Class-B workflow | A workflow whose version is a matrix/ABI selector — `build-onnxruntime.yml` only after CR-01; must show zero diff |
| Pin | The runtime value `22.23.4`, or the base-image digest — never the ABI selector `node_version` |

### 10.5 Assumptions carried from the STP

1. `22.23.4` remains the latest safe 22.x during the implementation window; otherwise AF-1 triggers a full re-pin and the fixture expectations are regenerated together (BR-02).
2. The pre-existing dirty working tree (41 unrelated entries) is unchanged during execution, so the G0-baseline subtraction remains valid.
3. Docker Hub is reachable for G1/G5; if not, both gates are `NOT_EXECUTED` and the PR cannot merge.
4. The repository's GitHub configuration (branch protection) is reviewed by someone with admin access.

---

*End of document.*
