# Software Test Cases (STC)

## Pi Harness — SA4E-355: Context Budget Governance for Pi Harness

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-355 |
| Title | Implement Context Budget Governance for Pi Harness |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-10-12 |
| Status | Draft |
| Related STP | documents/SA4E-355/STP.md (v1.0) |
| Related FSD | documents/SA4E-355/FSD.md (v1.0) |
| Related TDD | documents/SA4E-355/TDD.md (v1.1) |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-12 | QA Agent | Initiate document — 79 test cases derived from FSD UC-01..UC-07 / BR-01..BR-16; RTM 100% |

---

## Test Case Summary

### By Category

| Category | ID Range | Count | Priority |
|----------|----------|-------|----------|
| Functional — Happy Path | STC-001 .. STC-019 | 19 | High/Medium |
| Functional — Alternative Flows | STC-100 .. STC-111 | 12 | High/Medium |
| Functional — Exception/Error Flows | STC-200 .. STC-207 | 8 | High/Medium |
| Business Rule Validation | STC-300 .. STC-314 | 15 | High/Medium |
| Boundary & Negative Testing | STC-400 .. STC-406 | 7 | High/Medium |
| UI/UX Testing | STC-500 .. STC-504 | 5 | High/Medium |
| Non-Functional Testing | STC-600 .. STC-603 | 4 | High/Medium |
| Integration, E2E & Manual SIT | STC-700 .. STC-721 | 6 | High/Medium |
| Regression Testing | STC-800 .. STC-802 | 3 | High/Medium |
| **Total** | | **79** | |

### By Test Level

| Level | Count | Automated | Manual | Runner |
|-------|-------|-----------|--------|--------|
| PBT | 3 | 3 | 0 | vitest + fast-check |
| UT | 44 | 44 | 0 | vitest |
| IT | 18 | 18 | 0 | vitest (integration suites) |
| E2E-API | 3 | 3 | 0 | vitest + simulated provider server |
| E2E-UI | 3 | 3 | 0 | wdio + wdio-vscode-service |
| SIT | 8 | 0 | 8 | Manual (VS Code + llama-server) |
| **Total** | **79** | **71 (89.9%)** | **8 (10.1%)** | |

### Conventions

- **Level** — PBT (fast-check property), UT (unit), IT (in-process integration), E2E-API (simulated provider HTTP + full pipeline), E2E-UI (VS Code UI via wdio), SIT (manual).
- **File** — automated suite location; all extension suites run under extension/src/pi-agent/__tests__/ via "cd extension && npm test". Gherkin features live under e2e/features/.
- **Test data** — shared fixtures referenced from documents/SA4E-355/testdata/*.csv; inline values are concrete and deterministic.
- **Expected messages** must match FSD §9.1 exactly (log codes PI_CONTEXT_DETECT_FALLBACK, PI_CONTEXT_DETECT_DEFAULT, PI_TOOL_SCHEMA_CAP; chat error PI_CONTEXT_BUDGET_EXCEEDED).
- **Verified formula (mcp/context-budget.ts):** estimatedTokens = ceil(systemPromptChars/4) + toolSchemaTokens + retrievalTokens + historyTokens + max(reserveTokens, 2000); usagePercent = estimatedTokens / contextWindow × 100 (window ≤ 0 → 100); ThresholdGate: REJECT > 95, WARN > 85, else ALLOW.

---

## 1. Functional Test Cases — Happy Path

### STC-001: Resolver returns exact budget for detected qwen 32k

| Field | Value |
|-------|-------|
| **ID** | STC-001 |
| **Level** | UT |
| **Priority** | High |
| **Type** | Functional — Happy Path |
| **Requirement** | UC-01 (FSD §3.1 MF), BR-01, BR-02, BR-03; FSD TC-01 |
| **File** | extension/src/pi-agent/__tests__/context-budget-resolver.test.ts |
| **Preconditions** | resolveContextBudget implemented; qwen entry in ModelRegistry (BR-14); provider detection available |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call resolveContextBudget({modelId:'qwen', nCtxDetected:32768}) | Returns ContextBudget |
| 2 | Assert all five fields | nCtx=32768, reserveOutput=2048, safetyMargin=2622, staticBudget=19668, historyBudget=8430 |
| 3 | Check session log | Breakdown {nCtx, reserveOutput, safetyMargin, staticBudget, historyBudget} logged with source=provider |

**Test Data:** modelId='qwen', nCtxDetected=32768 (meta.n_ctx). Derivation: safety=ceil(32768×0.08)=ceil(2621.44)=**2622**; usable=32768−2048−2622=28098; static=floor(28098×0.70)=19668; history=28098−19668=8430. (testdata/budget-resolution-testdata.csv row STC-001)
**Postconditions:** Budget with nCtx>0 available to session host, loader overrides, loadout and gate.

---

### STC-002: reserveOutput resolution order (override → registry → floor 2000)

| Field | Value |
|-------|-------|
| **ID** | STC-002 |
| **Level** | UT |
| **Priority** | High |
| **Type** | Functional — Happy Path |
| **Requirement** | UC-01 (FSD §3.1), OI-2 (TDD §11), MIN_RESERVE_TOKENS |
| **File** | extension/src/pi-agent/__tests__/context-budget-resolver.test.ts |
| **Preconditions** | Resolver implemented; qwen registry entry present |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | resolveContextBudget({modelId:'qwen'}) (no override, no detection) | reserveOutput=2048 (registry maxOutput) |
| 2 | resolveContextBudget({modelId:'qwen', reserveOutput:5000}) | reserveOutput=5000 (explicit override wins) |
| 3 | resolveContextBudget({modelId:'qwen', reserveOutput:100}) | reserveOutput=2000 (floored to MIN_RESERVE_TOKENS) |
| 4 | resolveContextBudget({modelId:'llama-unknown'}) | reserveOutput=2000 (floor; registry miss) |

**Test Data:** (a) qwen/2048, (b) override 5000, (c) override 100 → 2000, (d) unknown model → 2000. (testdata/budget-resolution-testdata.csv rows STC-002a..d)
**Postconditions:** reserveOutput ≥ 2000 in every case.

---

### STC-003: safetyMargin 8% ceil formula at 8k and 128k

| Field | Value |
|-------|-------|
| **ID** | STC-003 |
| **Level** | UT |
| **Priority** | High |
| **Type** | Functional — Happy Path |
| **Requirement** | UC-01, BR-02; FSD TC-04 |
| **File** | extension/src/pi-agent/__tests__/context-budget-resolver.test.ts |
| **Preconditions** | Resolver implemented |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | resolveContextBudget({modelId:'llama3.1', nCtxDetected:8192}) | safetyMargin=656 (ceil(655.36)) |
| 2 | resolveContextBudget({modelId:'gpt-4o-mini', nCtxDetected:128000}) | safetyMargin=10240 (exact 8% of 128,000) |

**Test Data:** 8192 → 656; 128000 → 10240. Note: 32768 → 2622 is covered in STC-001 (ceil(2621.44)=2622, superseding the BRD's illustrative 2,621 per TDD Change Log #2).
**Postconditions:** safetyMargin always equals ceil(nCtx × 0.08).

---

### STC-004: static 70% / history 30% split at 128k with exact-sum invariant

| Field | Value |
|-------|-------|
| **ID** | STC-004 |
| **Level** | UT |
| **Priority** | High |
| **Type** | Functional — Happy Path |
| **Requirement** | UC-01, BR-03 |
| **File** | extension/src/pi-agent/__tests__/context-budget-resolver.test.ts |
| **Preconditions** | Resolver implemented; gpt-4o-mini in registry (128000/16384) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | resolveContextBudget({modelId:'gpt-4o-mini', nCtxDetected:128000}) | reserveOutput=16384, safetyMargin=10240, usable=101376 |
| 2 | Assert split | staticBudget=70963 (floor(101376×0.70)=floor(70963.2)), historyBudget=30413 |
| 3 | Assert invariant | staticBudget + historyBudget === usable (exact remainder, no rounding loss) |

**Test Data:** n_ctx=128000 → usable 101,376 / static 70,963 / history 30,413 (TDD §3.2 worked example).
**Postconditions:** Split deterministic; static+history sums exactly to usable.

---

### STC-005: qwen registry entry present and valid (BR-14)

| Field | Value |
|-------|-------|
| **ID** | STC-005 |
| **Level** | UT |
| **Priority** | High |
| **Type** | Functional — Happy Path |
| **Requirement** | UC-01, BR-14 |
| **File** | extension/src/pi-agent/__tests__/model-registry.test.ts |
| **Preconditions** | qwen entry added to DEFAULT_MODEL_REGISTRY_ENTRIES |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | DEFAULT_MODEL_REGISTRY.get('qwen') | Entry equals {modelId:'qwen', contextWindow:32768, maxOutput:2048, costPer1k:0, speed:'medium', thinkingMap:{low:256,medium:512,high:1024}} |
| 2 | ModelRegistry.validate(entry) | true (integer contextWindow>0; maxOutput ≤ contextWindow; thinkingMap ≤ maxOutput) |
| 3 | Registry still contains qwen2.5-coder (32768/1024) | Additive change, no regression (A-3) |

**Test Data:** qwen entry per BR-14 / TDD §5.2. (testdata/pre-seeded-data.csv)
**Postconditions:** 'qwen' usable as registry fallback for STC-100/STC-700.

---

### STC-006: BA skills scoping keeps only ba/brd/fsd/requirement/specification tokens

| Field | Value |
|-------|-------|
| **ID** | STC-006 |
| **Level** | UT |
| **Priority** | High |
| **Type** | Functional — Happy Path |
| **Requirement** | UC-02 (FSD §3.2 MF step 2), FSD TC-05 |
| **File** | extension/src/pi-agent/__tests__/role-scope.test.ts |
| **Preconditions** | RoleScopeFilter wired via skillsOverride; ROLE_SKILL_IDS verified |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | filterSkills('BA', 8-skill fixture: ba-core-analysis, brd-writer, fsd-builder, requirement-tracer, specification-checklist, dev-code-generator, qa-stc-suite, deploy-pipeline) | Returns 5 skills |
| 2 | Assert exact list | [ba-core-analysis, brd-writer, fsd-builder, requirement-tracer, specification-checklist] — original order preserved |
| 3 | Assert exclusions | dev-code-generator, qa-stc-suite, deploy-pipeline NOT present (DEV/QA/DevOps tokens out of BA scope) |

**Test Data:** role='BA'; allowlist tokens: ba, brd, fsd, requirement, specification (verified role-scope.ts). (testdata/role-scope-testdata.csv row STC-006)
**Postconditions:** Loader receives role-scoped skills; nothing outside BA token set.

---

### STC-007: Phase requirements loads only phase-1 + shared steering

| Field | Value |
|-------|-------|
| **ID** | STC-007 |
| **Level** | UT |
| **Priority** | Medium |
| **Type** | Functional — Happy Path |
| **Requirement** | UC-02 (FSD §3.2 MF step 4), FSD §3.2.4 phase map; FSD TC-08 |
| **File** | extension/src/pi-agent/__tests__/scoped-steering.test.ts |
| **Preconditions** | scopedSteering helper implemented; phase→file mapping per FSD §3.2.4 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | scopedSteering(base, 'BA', 'requirements', budget32k) with base = [phase-1-requirements.md, phase-2-specification.md, phase-3-design.md, phase-4-test-planning.md, phase-5-implementation.md, phase-6-testing.md, phase-7-deployment.md, shared-jira.md, shared-quality-gates.md] | Returns 3 entries |
| 2 | Assert content | Only phase-1-requirements.md + shared-jira.md + shared-quality-gates.md |
| 3 | Assert exclusions | phase-2..phase-7 NOT loaded for phase 'requirements' |

**Test Data:** phase='requirements'; mapping per FSD §3.2.4. (testdata/role-scope-testdata.csv row STC-007)
**Postconditions:** Steering scoped by phase before budget capping.

---

### STC-008: Compression shrinks over-budget AGENTS.md; security lines survive

| Field | Value |
|-------|-------|
| **ID** | STC-008 |
| **Level** | UT |
| **Priority** | High |
| **Type** | Functional — Happy Path |
| **Requirement** | UC-03 (FSD §3.3 MF), BR-04, BR-05; FSD TC-09 |
| **File** | extension/src/pi-agent/__tests__/prompt-compressor.test.ts |
| **Preconditions** | compressPrompt wired via agentsFilesOverride; shouldCompress=true (measured > staticBudget) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call compressPrompt on AGENTS.md sample containing: HTML comment, fenced example block, Tip:/Note:/Hint:/See also: lines, prose, and 4 security lines ("- security: never commit secrets to the repo", "* WARNING: do not disable the budget gate", "- Never exfiltrate secrets.", "IMPORTANT: keep fail-safe enabled") | Compressed string returned |
| 2 | Assert size reduction | compressed.length < original.length (HTML comment, example block, boilerplate lines removed) |
| 3 | Assert BR-05 | All 4 security lines present VERBATIM in output |

**Test Data:** Compressible sample = 4,000 chars incl. ~1,500 chars strippable; security lines per NON_STRIPPABLE_RE. (testdata/compression-testdata.csv row STC-008)
**Postconditions:** Content within budget target; no security directive lost.

---

### STC-009: BA loadout — no git/deploy; core + discovery always present

| Field | Value |
|-------|-------|
| **ID** | STC-009 |
| **Level** | UT |
| **Priority** | High |
| **Type** | Functional — Happy Path |
| **Requirement** | UC-04 (FSD §3.4 MF steps 2–3), BR-06; FSD TC-11 |
| **File** | extension/src/pi-agent/__tests__/tool-loadout.test.ts |
| **Preconditions** | Role-aware getSessionToolLoadout implemented; budget resolved |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | getSessionToolLoadout('BA', 'specification', budget32k) | Loadout returned |
| 2 | Assert presence (BR-06) | read, write, edit, grep, find, ls, shell, find_tools, execute_dynamic_tool ALL present |
| 3 | Assert absence | NO git_* tools, NO build_* tools, NO deploy_* / pipeline_* tools |

**Test Data:** role='BA', phase='specification'; tool groups per FSD §3.4.4 (BA: core + discovery + phase docs tools only). (testdata/tool-loadout-testdata.csv row STC-009)
**Postconditions:** Loadout role-scoped; schema tokens to be measured ≤ cap (STC-019).

---

### STC-010: DEV loadout has git/build; SM has jira + coordination

| Field | Value |
|-------|-------|
| **ID** | STC-010 |
| **Level** | UT |
| **Priority** | High |
| **Type** | Functional — Happy Path |
| **Requirement** | UC-04, BR-06; FSD TC-11 |
| **File** | extension/src/pi-agent/__tests__/tool-loadout.test.ts |
| **Preconditions** | Role-aware loadout implemented |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | getSessionToolLoadout('DEV', 'implementation', budget32k) | Contains git_* (e.g. git_diff) and build_* tools; still contains core 7 + find_tools + execute_dynamic_tool; NO deploy_* |
| 2 | getSessionToolLoadout('SM', 'coordination', budget32k) | Contains jira_* (jira_get_issue, jira_create_issue) + coordination tools + core + discovery |

**Test Data:** role='DEV' phase='implementation'; role='SM' phase='coordination' (FSD §3.4.4 mapping). (testdata/tool-loadout-testdata.csv rows STC-010a/b)
**Postconditions:** Role-specific tools available; core never dropped.
---

### STC-011: Gate ALLOW path — session created within budget

| Field | Value |
|-------|-------|
| **ID** | STC-011 |
| **Level** | IT |
| **Priority** | High |
| **Type** | Functional — Happy Path |
| **Requirement** | UC-05 (FSD §3.5 MF steps 3–5), BR-13 |
| **File** | extension/src/pi-agent/__tests__/context-governance.integration.test.ts |
| **Preconditions** | T1–T5 wired; budget resolved for qwen 32k; static fixture assembled |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Assemble session (qwen 32k, role=DEV, phase=implementation): systemPromptChars=2,000 (500 tokens) + scoped steering 3,000 tokens + compressed AGENTS.md 2,000 tokens + tool schemas 1,500 tokens; history 0; reserve 2,048 | measured static = 7,000 tokens |
| 2 | Gate: calculateBudget(32768, {systemPromptChars:2000, toolSchemaTokens:1500, historyTokens:0, reserveTokens:2048}) | estimatedTokens=9,048; usagePercent ≈ 27.6% |
| 3 | ThresholdGate.evaluate(27.6) | decision=ALLOW |
| 4 | Assert createAgentSession called exactly once with overrides; zero escalation events | Session created; provider receives prompt within n_ctx |

**Test Data:** budget32k {staticBudget:19668}; static parts: 500 + 3,000 + 2,000 + 1,500 tokens. (testdata/escalation-testdata.csv row STC-011)
**Postconditions:** Session proceeds to turn execution; usage ≈ 27.6% logged.

---

### STC-012: Gate WARN path (85–95%) — session proceeds with warning

| Field | Value |
|-------|-------|
| **ID** | STC-012 |
| **Level** | IT |
| **Priority** | High |
| **Type** | Functional — Alternative Flow (UC-05 AF-1) |
| **Requirement** | UC-05 AF-1, BR-13; FSD §9.1 "Gate WARN" |
| **File** | extension/src/pi-agent/__tests__/context-governance.integration.test.ts |
| **Preconditions** | Gate wired in createHost |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Session with detected n_ctx=10,000 (modelId='llama-unknown' → reserve 2,000); static assembled = 7,200 tokens (systemPromptChars=28,800) | measured via BudgetCalculator |
| 2 | calculateBudget(10000, {systemPromptChars:28800, reserveTokens:2000}) | estimated=9,200; usagePercent=92.0% |
| 3 | ThresholdGate.evaluate(92.0) | decision=WARN, message contains "92% >85% threshold" |
| 4 | Assert session proceeds (createAgentSession called) AND warning surfaced on usage indicator + log | No block; history compaction attention flagged |

**Test Data:** n_ctx=10,000; usage 92% ∈ (85,95]. (testdata/gate-threshold-testdata.csv row STC-012)
**Postconditions:** Session runs with visible warning; no error banner.

---

### STC-013: qwen 32,768 classified NOT small → medium behaviors

| Field | Value |
|-------|-------|
| **ID** | STC-013 |
| **Level** | UT |
| **Priority** | High |
| **Type** | Functional — Happy Path |
| **Requirement** | UC-06 (FSD §3.6), BR-16, OI-1/OI-6 (TDD §11) |
| **File** | extension/src/pi-agent/__tests__/model-router.test.ts + model-tier.test.ts |
| **Preconditions** | qwen registry entry present; tier utilities wired |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | ModelRouter.classifyTier(registry, 'qwen') | 'large' (window 32,768 > SMALL_CONTEXT_WINDOW_THRESHOLD 16,384 → NOT small) |
| 2 | Map to 3-tier behavior (32,768 < 128,000) | Medium behaviors: on-demand compression (only when over budget), standard role scope, standard loadout, default 70/30 split |
| 3 | Assert constants | SMALL_CONTEXT_WINDOW_THRESHOLD === 16384 |

**Test Data:** qwen contextWindow=32,768; threshold 16,384. (testdata/tiering-testdata.csv row STC-013)
**Postconditions:** Resolver/loadout/compressor receive tier=medium for qwen.

---

### STC-014: Small tier (8,192) — forced compression + max scoping + minimal loadout

| Field | Value |
|-------|-------|
| **ID** | STC-014 |
| **Level** | UT |
| **Priority** | High |
| **Type** | Functional — Happy Path |
| **Requirement** | UC-06, BR-16; FSD TC-16 |
| **File** | extension/src/pi-agent/__tests__/model-tier.test.ts |
| **Preconditions** | Tier mapping wired into resolver/loadout/compressor |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Classify n_ctx=8,192 (llama3.1) | tier='small' (8,192 ≤ 16,384) |
| 2 | preferredVariantForTier('small') | 'compressed' |
| 3 | Assert behavior set | Compression forced; maximum role scoping; minimal loadout (core + discovery only); static-leaning budget split (BR-16 small row) |

**Test Data:** llama3.1 8,192/2,048. (testdata/tiering-testdata.csv row STC-014)
**Postconditions:** Small models get most aggressive governance automatically.

---

### STC-015: Large tier (128,000) — no compression + full loadout

| Field | Value |
|-------|-------|
| **ID** | STC-015 |
| **Level** | UT |
| **Priority** | High |
| **Type** | Functional — Happy Path |
| **Requirement** | UC-06, BR-16; FSD TC-16 |
| **File** | extension/src/pi-agent/__tests__/model-tier.test.ts |
| **Preconditions** | Tier mapping wired |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Classify gpt-4o-mini (128,000) | tier='large' (window-based) |
| 2 | Assert compression mode | preferredVariantForTier → 'full'; compressPrompt NOT applied (no trimming pressure) |
| 3 | Assert loadout | Full loadout (all role tools + MCP set), 70/30 split unchanged |

**Test Data:** gpt-4o-mini 128,000/16,384. (testdata/tiering-testdata.csv row STC-015)
**Postconditions:** Large models keep full-fidelity context.

---

### STC-016: Integration — total prompt < budget at all three sizes (8k / 32k / 128k)

| Field | Value |
|-------|-------|
| **ID** | STC-016 |
| **Level** | IT |
| **Priority** | High |
| **Type** | Functional — Integration |
| **Requirement** | UC-07 (FSD §3.7 MF steps 1–2), BR-01, BR-08/09; FSD TC-17 |
| **File** | extension/src/pi-agent/__tests__/context-governance.integration.test.ts |
| **Preconditions** | T1–T6 complete; oversized workspace fixture (steering corpus ~50,000 raw tokens) available |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run governance pipeline with nCtx ∈ {8192, 32768, 128000} on the same workspace fixture, role=DEV, one user message "Hãy review source code" (~8 tokens) | Each size resolves budget with nCtx>0: 8k→{2048,656,3841,1647}; 32k→{2048,2622,19668,8430}; 128k→{16384,10240,70963,30413} |
| 2 | Assert total prompt per size | totalPromptTokens (static + tool schemas + user message) ≤ usable: 5,488 / 28,098 / 101,376 |
| 3 | Assert gate decision per size | ALLOW or WARN — never REJECT after governance |

**Test Data:** simulated n_ctx set {8192, 32768, 128000}; budgets per TDD §3.2 table. (testdata/budget-resolution-testdata.csv rows STC-016a..c)
**Postconditions:** Same codebase scales across all three sizes without overflow.

---

### STC-017: SM regression — full pipeline keeps essential tools

| Field | Value |
|-------|-------|
| **ID** | STC-017 |
| **Level** | IT |
| **Priority** | High |
| **Type** | Regression — Integration |
| **Requirement** | UC-07 (FSD §3.7 MF step 3), BR-06; FSD TC-15; FSD §8 Reliability |
| **File** | extension/src/pi-agent/__tests__/context-governance.integration.test.ts |
| **Preconditions** | Full pipeline role=SM, n_ctx=32,768 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create session role='SM' with full pipeline phase set | Session created, no exception |
| 2 | Assert essential tools | core 7 (read/write/edit/grep/find/ls/shell) + find_tools + execute_dynamic_tool + jira_get_issue + coordination tools ALL present |
| 3 | Assert skills | SM token set (sm, brd, sprint, backlog, coordination) preserved — e.g. sm-orchestrator, brd-writer, sprint-planner, backlog-groomer, coordination-hub kept |

**Test Data:** role='SM'; essentialToolsPresent=true expected (FSD §3.7.4). (testdata/tool-loadout-testdata.csv row STC-017)
**Postconditions:** No capability loss for SM full pipeline.

---

### STC-018: Steering over cap — lowest priority dropped first; security lines survive

| Field | Value |
|-------|-------|
| **ID** | STC-018 |
| **Level** | UT |
| **Priority** | High |
| **Type** | Functional — Happy Path (UC-02 MF step 5) |
| **Requirement** | UC-02, BR-03, BR-05; FSD TC-07 |
| **File** | extension/src/pi-agent/__tests__/scoped-steering.test.ts |
| **Preconditions** | scopedSteering implemented; steering share of staticBudget = 3,000 tokens |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | scopedSteering([shared-quality-gates.md (priority 1, 2,000 tok), phase-4-test-planning.md (priority 2, 2,500 tok, contains line "security: never skip the quality gate"), shared-jira.md (priority 3, 1,500 tok)], 'QA', 'test-planning', budget) — total 6,000 > 3,000 cap | Drop begins |
| 2 | Assert drop order | shared-jira.md (lowest priority) dropped first → 4,500; still > cap → phase-4-test-planning.md dropped next → 2,000 ≤ 3,000 |
| 3 | Assert BR-05 | Line "security: never skip the quality gate" STILL PRESENT in assembled steering output despite file drop |

**Test Data:** cap=3,000 tokens; priorities 1>2>3 (highest kept). (testdata/role-scope-testdata.csv row STC-018)
**Postconditions:** Steering ≤ cap; security directives never lost by drops.

---

### STC-019: Schema cap — total ≤ cap, lowest priority trimmed first

| Field | Value |
|-------|-------|
| **ID** | STC-019 |
| **Level** | UT |
| **Priority** | Medium |
| **Type** | Functional — Happy Path (UC-04 MF step 4) |
| **Requirement** | UC-04, BR-06; FSD TC-12 |
| **File** | extension/src/pi-agent/__tests__/tool-loadout.test.ts |
| **Preconditions** | Role-aware loadout with phase-prioritized MCP trimming; schemaTokenCap=2,000 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | getSessionToolLoadout('QA', 'test-planning', cap=2000) with MCP fixtures: jira_get_issue (600), jira_create_issue (600), mem_search (300), mem_ingest (400), drawio_export_png (500) — raw total 2,400 > 2,000 | Trimming triggered |
| 2 | Assert trim order | drawio_export_png (lowest priority for test-planning phase) dropped first → total 1,900 ≤ 2,000 |
| 3 | Assert accounting | loadoutSchemaTokens ≤ schemaTokenCap; tokens deducted from staticBudget before gate measurement |

**Test Data:** cap=2,000; MCP schema token estimates per fixture (OI-4 estimator). (testdata/tool-loadout-testdata.csv row STC-019)
**Postconditions:** Tool schema tokens within cap; gate measurement includes them.
---

## 2. Functional Test Cases — Alternative Flows

### STC-100: Detection fails → registry fallback with warning log

| Field | Value |
|-------|-------|
| **ID** | STC-100 |
| **Level** | UT |
| **Priority** | High |
| **Type** | Functional — Alternative Flow (UC-01 AF-1) |
| **Requirement** | UC-01 AF-1, BR-01, BR-14; FSD TC-02; FSD §9.1 |
| **File** | extension/src/pi-agent/__tests__/context-budget-resolver.test.ts |
| **Preconditions** | Provider returns no meta.n_ctx; qwen in registry |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | resolveContextBudget({modelId:'qwen', nCtxDetected:undefined}) | nCtx=32,768 (registry contextWindow) |
| 2 | Assert full budget | {nCtx:32768, reserveOutput:2048, safetyMargin:2622, staticBudget:19668, historyBudget:8430} — identical to detected path for qwen |
| 3 | Check log | Warning PI_CONTEXT_DETECT_FALLBACK logged (level=warn) |

**Test Data:** modelId='qwen', no detection. (testdata/budget-resolution-testdata.csv row STC-100)
**Postconditions:** Turn proceeds transparently (no user-facing message).

---

### STC-101: Registry miss → terminal default 8,192 (never 0)

| Field | Value |
|-------|-------|
| **ID** | STC-101 |
| **Level** | UT |
| **Priority** | High |
| **Type** | Functional — Alternative Flow (UC-01 AF-2) |
| **Requirement** | UC-01 AF-2, BR-01; FSD TC-03; FSD §9.1 |
| **File** | extension/src/pi-agent/__tests__/context-budget-resolver.test.ts |
| **Preconditions** | modelId not in registry |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | resolveContextBudget({modelId:'llama-unknown'}) | nCtx=8,192 (terminal default) |
| 2 | Assert full budget | reserveOutput=2,000 (floor), safetyMargin=656, usable=5,536, staticBudget=3,875 (floor(5536×0.7)=floor(3875.2)), historyBudget=1,661 |
| 3 | Assert nCtx NEVER 0/undefined/null; log warning PI_CONTEXT_DETECT_DEFAULT | Safe-side default; gate still protects |

**Test Data:** modelId='llama-unknown' (registry miss). (testdata/budget-resolution-testdata.csv row STC-101)
**Postconditions:** Budget valid (nCtx>0) — root-cause fix for the unbounded-budget overflow.

---

### STC-102: Unknown role keeps ALL skills (fail-open)

| Field | Value |
|-------|-------|
| **ID** | STC-102 |
| **Level** | UT |
| **Priority** | High |
| **Type** | Functional — Alternative Flow (UC-02 AF-1) |
| **Requirement** | UC-02 AF-1, BR-07; FSD TC-06 |
| **File** | extension/src/pi-agent/__tests__/role-scope.test.ts |
| **Preconditions** | RoleScopeFilter wired; role not in ROLE_SKILL_IDS |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | filterSkills('intern-x', same 8-skill list as STC-006) | ALL 8 skills returned |
| 2 | Assert isKnownRole('intern-x') === false; isAllowed returns true for every skill | Fail-open: no accidental capability loss |
| 3 | Assert no regression | Known roles (spot check BA) still filter correctly in the same run |

**Test Data:** role='intern-x'; 8-skill fixture from STC-006. (testdata/role-scope-testdata.csv row STC-102)
**Postconditions:** Unknown roles lose nothing.

---

### STC-103: Phase missing/unmapped → shared-* steering only

| Field | Value |
|-------|-------|
| **ID** | STC-103 |
| **Level** | UT |
| **Priority** | Medium |
| **Type** | Functional — Alternative Flow (UC-02 AF-2) |
| **Requirement** | UC-02 AF-2; FSD §3.2.4 mapping row "unknown/none" |
| **File** | extension/src/pi-agent/__tests__/scoped-steering.test.ts |
| **Preconditions** | scopedSteering implemented |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | scopedSteering(base 9 files, 'BA', undefined, budget32k) | Only shared-jira.md + shared-quality-gates.md loaded |
| 2 | Repeat with phase='' | Same result |
| 3 | Check log | Info logged (unmapped phase → shared-* only) |

**Test Data:** phase ∈ {undefined, ''}. (testdata/role-scope-testdata.csv row STC-103)
**Postconditions:** No phase files loaded for unmapped phase; no crash.

---

### STC-104: Steering under cap — no drops, unmodified pass-through

| Field | Value |
|-------|-------|
| **ID** | STC-104 |
| **Level** | UT |
| **Priority** | Medium |
| **Type** | Functional — Alternative Flow (UC-02 AF-3) |
| **Requirement** | UC-02 AF-3, BR-03 |
| **File** | extension/src/pi-agent/__tests__/scoped-steering.test.ts |
| **Preconditions** | Steering total well under cap |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | scopedSteering with 3 shared files × 400 tokens = 1,200 tokens vs cap 3,841 (llama3.1 8k budget) | No drops |
| 2 | Assert output | Entries byte-identical to input (pass-through, no modification) |

**Test Data:** 3 files × 1,600 chars (400 tokens each); cap 3,841. (testdata/role-scope-testdata.csv row STC-104)
**Postconditions:** Under-cap content never degraded.

---

### STC-105: Budget surplus + large/medium tier → compressPrompt NOT called

| Field | Value |
|-------|-------|
| **ID** | STC-105 |
| **Level** | IT |
| **Priority** | High |
| **Type** | Functional — Alternative Flow (UC-03 AF-1) |
| **Requirement** | UC-03 AF-1, BR-04, BR-15; FSD TC-10 |
| **File** | extension/src/pi-agent/__tests__/context-governance.integration.test.ts |
| **Preconditions** | Session at 128k (gpt-4o-mini); sinon spy on compressPrompt |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Assemble session: measured static 30,000 tokens < staticBudget 70,963; tier='large' | shouldCompress = false |
| 2 | Assert spy | compressPrompt NEVER called (call count 0) |
| 3 | Assert content | agentsFiles + steering byte-identical to base (full fidelity kept) |

**Test Data:** n_ctx=128,000; measured 30,000 < 70,963. (testdata/compression-testdata.csv row STC-105)
**Postconditions:** Surplus models never lose information (BR-04).

---

### STC-106: Small tier forces compression even with surplus

| Field | Value |
|-------|-------|
| **ID** | STC-106 |
| **Level** | IT |
| **Priority** | High |
| **Type** | Functional — Alternative Flow (UC-03 AF-2) |
| **Requirement** | UC-03 AF-2, BR-04, BR-16 |
| **File** | extension/src/pi-agent/__tests__/context-governance.integration.test.ts |
| **Preconditions** | Session at 8,192 (llama3.1, tier small); measured static 3,000 < staticBudget 3,841 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Assemble session at 8k with under-budget static (3,000 < 3,841) | tier='small' → shouldCompress = true regardless of measured value |
| 2 | Assert compression applied | Content compressed; security lines survive (BR-05) |
| 3 | Assert result non-worsening | If compression worsens content, original kept (BR-15) |

**Test Data:** n_ctx=8,192; tier='small' forces proactive compression. (testdata/compression-testdata.csv row STC-106)
**Postconditions:** Small-tier variant always compressed (preferredVariantForTier('small')='compressed').

---

### STC-107: Absent tool discovered at runtime via find_tools + execute_dynamic_tool

| Field | Value |
|-------|-------|
| **ID** | STC-107 |
| **Level** | UT |
| **Priority** | Medium |
| **Type** | Functional — Alternative Flow (UC-04 AF-1) |
| **Requirement** | UC-04 AF-1, BR-06; tool-usage-dynamic pattern |
| **File** | extension/src/pi-agent/__tests__/tool-loadout.test.ts |
| **Preconditions** | BA loadout without drawio_export_png preloaded |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Agent requests tool absent from BA loadout (fixture: drawio_export_png) | No preloaded schema present — as designed |
| 2 | Agent calls find_tools('drawio export png') | Tool discovered (no preloaded schema required) |
| 3 | Agent calls execute_dynamic_tool('drawio_export_png', {...}) | Executes successfully — no capability dead-end |

**Test Data:** absent tool = drawio_export_png; discovery pair = find_tools + execute_dynamic_tool. (testdata/tool-loadout-testdata.csv row STC-107)
**Postconditions:** Missing tools reachable at runtime (matches AF-1 UC-04).

---

### STC-108: Unknown role loadout — permissive default (fail-open)

| Field | Value |
|-------|-------|
| **ID** | STC-108 |
| **Level** | UT |
| **Priority** | High |
| **Type** | Functional — Alternative Flow (UC-04 AF-2) |
| **Requirement** | UC-04 AF-2, BR-07 |
| **File** | extension/src/pi-agent/__tests__/tool-loadout.test.ts |
| **Preconditions** | Role-aware loadout implemented |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | getSessionToolLoadout('intern-x', 'requirements', budget32k) | Permissive default set returned |
| 2 | Assert core + discovery present | read/write/edit/grep/find/ls/shell + find_tools + execute_dynamic_tool |
| 3 | Assert no forced removals vs permissive default | Fail-open — nothing stripped beyond core+discovery+default |

**Test Data:** role='intern-x'. (testdata/tool-loadout-testdata.csv row STC-108)
**Postconditions:** Unknown role keeps working capability.

---

### STC-109: detectModelTier null (qwen) → window-based classification decides

| Field | Value |
|-------|-------|
| **ID** | STC-109 |
| **Level** | UT |
| **Priority** | Medium |
| **Type** | Functional — Alternative Flow (UC-06 AF-1) |
| **Requirement** | UC-06 AF-1, BR-16, OI-1 (TDD §11) |
| **File** | extension/src/pi-agent/__tests__/model-tier.test.ts |
| **Preconditions** | Both tier utilities wired; window-based primary |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | detectModelTier('qwen') | null (no name pattern matches) |
| 2 | detectModelTier('phi-3-mini') → 'small'; detectModelTier('claude-3-opus') → 'large' | Name patterns work as hint |
| 3 | With hint null: classifyTier(registry,'qwen') → 'large' (not small) → medium behaviors applied | Window decides — deterministic on the real constraint (OI-1) |

**Test Data:** modelIds: 'qwen' (null), 'phi-3-mini' (small), 'claude-3-opus' (large). (testdata/tiering-testdata.csv rows STC-109a..c)
**Postconditions:** Tier resolution never blocked by unknown model names.

---

### STC-110: Escalation succeeds — re-measure ≤ threshold, later steps never fired

| Field | Value |
|-------|-------|
| **ID** | STC-110 |
| **Level** | IT |
| **Priority** | High |
| **Type** | Functional — Alternative Flow (UC-05 AF-2) |
| **Requirement** | UC-05 AF-2, BR-08 |
| **File** | extension/src/pi-agent/__tests__/context-governance.integration.test.ts |
| **Preconditions** | Over-budget static that compression alone can fix |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | n_ctx=16,384 (qwen, reserve 2,048 → safety 1,311, usable 13,025, staticBudget 9,117); initial static: steering 8,000 + AGENTS 1,500 + tools 800 + system 400 = 10,700 > 9,117 | Escalation triggered |
| 2 | Step 1 compression: AGENTS 1,500→600, steering 8,000→4,500; re-measure 6,300 ≤ 9,117 | Fits after step 1 |
| 3 | Assert session proceeds (gate: est 6,300+2,048=8,348/16,384=50.9% → ALLOW) and escalation steps 2–3 spies NEVER called | No over-escalation |

**Test Data:** 16,384 budget {safety:1311, static:9117}; compressible fixture. (testdata/escalation-testdata.csv row STC-110)
**Postconditions:** Session created; ladder stops at the first sufficient step.

---

### STC-111: llama-server 65,536 — budget scales automatically

| Field | Value |
|-------|-------|
| **ID** | STC-111 |
| **Level** | IT |
| **Priority** | Medium |
| **Type** | Functional — Alternative Flow (UC-07 AF-1) |
| **Requirement** | UC-07 AF-1, BR-02, BR-03 |
| **File** | extension/src/pi-agent/__tests__/context-governance.integration.test.ts |
| **Preconditions** | Simulated provider reports meta.n_ctx=65,536; modelId='qwen' |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | resolveContextBudget({modelId:'qwen', nCtxDetected:65536}) | reserve 2,048; safetyMargin=5,243 (ceil(5,242.88)); usable=58,245; staticBudget=40,771 (floor(40,771.5)); historyBudget=17,474 |
| 2 | Run full governance checklist at 65,536 | Same criteria pass as 32k — budget scaled automatically |

**Test Data:** n_ctx=65,536. (testdata/budget-resolution-testdata.csv row STC-111)
**Postconditions:** No code change needed for the 65,536 configuration (AF-1 UC-07).
---

## 3. Functional Test Cases — Exception/Error Flows

### STC-200: Invalid detected n_ctx (0 / negative / NaN / Infinity) — chain skips, never 0

| Field | Value |
|-------|-------|
| **ID** | STC-200 |
| **Level** | UT |
| **Priority** | High |
| **Type** | Functional — Exception Flow (UC-01 EF-1) |
| **Requirement** | UC-01 EF-1, BR-01 |
| **File** | extension/src/pi-agent/__tests__/context-budget-resolver.test.ts |
| **Preconditions** | Fallback chain implemented |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | resolveContextBudget({modelId:'qwen', nCtxDetected:0}) | 0 treated invalid → registry → nCtx=32,768 |
| 2 | resolveContextBudget({modelId:'llama-unknown', nCtxDetected:-1}) | → default 8,192 |
| 3 | resolveContextBudget({modelId:'llama-unknown', nCtxDetected:NaN}) and {nCtxDetected:Infinity} | → default 8,192 in both cases |
| 4 | Assert across all four calls | nCtx > 0, finite, integer — NEVER 0/NaN/Infinity propagated (BR-01) |

**Test Data:** invalid inputs {0, -1, NaN, Infinity}. (testdata/budget-resolution-testdata.csv rows STC-200a..d)
**Postconditions:** Root-cause guarantee: unbounded budget impossible.

---

### STC-201: Tiny model (n_ctx=2,048) — usable clamped, gate REJECTs with actionable error

| Field | Value |
|-------|-------|
| **ID** | STC-201 |
| **Level** | UT |
| **Priority** | High |
| **Type** | Functional — Exception Flow (UC-01 EF-2) |
| **Requirement** | UC-01 EF-2, BR-01, BR-09 |
| **File** | extension/src/pi-agent/__tests__/context-budget-resolver.test.ts |
| **Preconditions** | Resolver + gate available |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | resolveContextBudget({modelId:'phi-3-mini', nCtxDetected:2048}) | safetyMargin=164 (ceil(163.84)); reserveOutput=2,000 (maxOutput 512 floored up); usable=max(2048−2000−164, 1)=**1** (clamped positive floor) |
| 2 | Assert budgets | staticBudget=0 (floor(1×0.7)), historyBudget=1 — resolver does NOT throw |
| 3 | Gate on this budget: estimated ≥ 2,000 reserve → usagePercent = 2,000/2,048×100 ≈ 97.7% | REJECT (>95%) → escalation insufficient → chat:error PI_CONTEXT_BUDGET_EXCEEDED (actionable), provider NOT called |

**Test Data:** n_ctx=2,048; phi-3-mini registry entry {2048/512}. (testdata/budget-resolution-testdata.csv row STC-201)
**Postconditions:** Degenerate model fails safe with an actionable message, never a raw 400.

---

### STC-202: Override throws → fail-open to base content (turn never crashes)

| Field | Value |
|-------|-------|
| **ID** | STC-202 |
| **Level** | UT |
| **Priority** | High |
| **Type** | Functional — Exception Flow (UC-02 EF-1) |
| **Requirement** | UC-02 EF-1, BR-07 |
| **File** | extension/src/pi-agent/__tests__/scoped-steering.test.ts |
| **Preconditions** | scopedSteering has internal fail-open wrapper (try/catch → base + error log) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Force internal failure (stub estimator/dependency to throw); call scopedSteering(base, 'BA', 'requirements', budget) | Exception caught internally |
| 2 | Assert return value | base entries returned UNCHANGED (fail-open) |
| 3 | Assert logging + no propagation | Error logged; no exception escapes to createHost; turn survives |

**Test Data:** base = 9-file steering fixture; throwing stub via sinon. (testdata/role-scope-testdata.csv row STC-202)
**Postconditions:** Scoping failure degrades gracefully; createHost-level catch additionally covered by STC-016.

---

### STC-203: Compression failure / empty result → original content kept

| Field | Value |
|-------|-------|
| **ID** | STC-203 |
| **Level** | UT |
| **Priority** | Medium |
| **Type** | Functional — Exception Flow (UC-03 EF-1) |
| **Requirement** | UC-03 EF-1, BR-15 |
| **File** | extension/src/pi-agent/__tests__/prompt-compressor.test.ts |
| **Preconditions** | compressPrompt verified (try/catch returns original) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | compressPrompt('<!-- everything here is a comment -->') | Stripped result is empty → returns ORIGINAL template (non-worsening branch) |
| 2 | compressPrompt('') and compressPrompt(undefined as any) | Returns input unchanged — no throw |
| 3 | Verify error path by inspection + review | Existing try/catch returns original on any internal exception (BR-15; EF-1) |

**Test Data:** template = '<!-- everything here is a comment -->'; empty inputs. (testdata/compression-testdata.csv row STC-203)
**Postconditions:** Compression can never destroy content.

---

### STC-204: Schema cap unreachable at min set → PI_TOOL_SCHEMA_CAP + gate decides

| Field | Value |
|-------|-------|
| **ID** | STC-204 |
| **Level** | UT |
| **Priority** | High |
| **Type** | Functional — Exception Flow (UC-04 EF-1) |
| **Requirement** | UC-04 EF-1, BR-06; FSD §9.1 |
| **File** | extension/src/pi-agent/__tests__/tool-loadout.test.ts |
| **Preconditions** | Core+discovery schemas alone exceed cap |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | getSessionToolLoadout('QA', 'test-planning', cap=500) where core (1,500) + discovery (500) = 2,000 > 500 | Cap unreachable even at min set |
| 2 | Assert loadout | Core + discovery KEPT (non-negotiable, BR-06); all MCP/phase tools dropped |
| 3 | Assert log + handoff | PI_TOOL_SCHEMA_CAP warning logged; gate escalation handles the remainder (EF-1 UC-04) |

**Test Data:** cap=500; min-set schema tokens=2,000. (testdata/tool-loadout-testdata.csv row STC-204)
**Postconditions:** Gate remains the final arbiter — no silent overflow.

---

### STC-205: Escalation ladder executes in fixed order with re-measure after each step

| Field | Value |
|-------|-------|
| **ID** | STC-205 |
| **Level** | IT |
| **Priority** | High |
| **Type** | Functional — Exception Flow (UC-05 EF-1) |
| **Requirement** | UC-05 EF-1, BR-08; FSD TC-13 |
| **File** | extension/src/pi-agent/__tests__/context-governance.integration.test.ts |
| **Preconditions** | Over-budget static that needs all three steps |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | n_ctx=16,384; static: dense steering 8,000 (compresses to 7,500) + dense AGENTS 1,500 (→1,400) + tools 3,000 + system 400 = 12,900 > 9,117 | Escalation begins |
| 2 | Observe event log: step 1 compression → re-measure 11,700 (>9,117); step 2 drop lowest-priority steering → re-measure; step 3 minimal loadout → re-measure | ORDER: compress → drop steering → min loadout; re-measure logged after EACH step |
| 3 | Assert no step skipped/reordered; ladder length bounded (max 3 steps then error) | BR-08 verified |

**Test Data:** 16,384 budget; dense (poorly compressible) fixtures. (testdata/escalation-testdata.csv row STC-205)
**Postconditions:** Deterministic degradation order; loop bounded by ladder length.

---

### STC-206: Absolute exceed → exact PI_CONTEXT_BUDGET_EXCEEDED message; provider NOT called

| Field | Value |
|-------|-------|
| **ID** | STC-206 |
| **Level** | IT |
| **Priority** | High |
| **Type** | Functional — Exception Flow (UC-05 EF-2) |
| **Requirement** | UC-05 EF-2, BR-09, BR-13; FSD TC-14; FSD §9.1 |
| **File** | extension/src/pi-agent/__tests__/context-governance.integration.test.ts |
| **Preconditions** | n_ctx=8,192 (llama3.1); huge static that survives the full ladder |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Session at 8,192 with static: steering 40,000 tokens (dense) + AGENTS 8,000 + tools 3,000 + system 400 — still >95% after compression + drop + min loadout | Escalation exhausted |
| 2 | Assert emitted chat:error | EXACT message: "PI_CONTEXT_BUDGET_EXCEEDED: static context {N} tokens vượt budget {M} cho model n_ctx={K}. Giảm steering/tools hoặc dùng model context lớn hơn." with N=measured tokens, M=3,841 (staticBudget), K=8,192 |
| 3 | Assert provider spy | createAgentSession / provider call count === 0 (BR-09) |

**Test Data:** n_ctx=8,192; staticBudget=3,841; forced-huge fixture. (testdata/escalation-testdata.csv row STC-206)
**Postconditions:** User receives actionable remediation instead of a raw 400.

---

### STC-207: Legacy 400 impossibility — original incident numbers intercepted by gate

| Field | Value |
|-------|-------|
| **ID** | STC-207 |
| **Level** | IT |
| **Priority** | High |
| **Type** | Negative / Invariant |
| **Requirement** | UC-05 postcondition, BR-09; FSD §9.1 (legacy 400 = defect) |
| **File** | extension/src/pi-agent/__tests__/context-governance.integration.test.ts |
| **Preconditions** | Full gate wired; original-incident fixture |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Replay the original incident: static context 67,468 tokens with n_ctx=65,536 | Gate intercepts: (67,468 + 2,048)/65,536 = 106.1% > 95 → REJECT |
| 2 | Assert outcome | chat:error PI_CONTEXT_BUDGET_EXCEEDED emitted; provider NOT called; NO 400 exceed_context_size_error possible |
| 3 | Aggregate harness assertion | Zero exceed_context_size_error across the entire IT + E2E run — any occurrence is a Critical defect (root-cause fix, no workaround) |

**Test Data:** 67,468 tokens vs n_ctx 65,536 (original incident, IMPLEMENTATION-GUIDE §0.1). (testdata/escalation-testdata.csv row STC-207)
**Postconditions:** The exact historical failure mode is structurally impossible.

---

## 4. Business Rule Validation

### STC-300: [PBT] BR-01 invariant — resolved nCtx always > 0

| Field | Value |
|-------|-------|
| **ID** | STC-300 |
| **Level** | PBT |
| **Priority** | High |
| **Type** | Business Rule (Property-Based) |
| **Requirement** | BR-01 |
| **File** | extension/src/pi-agent/__tests__/context-budget-resolver.pbt.test.ts |
| **Preconditions** | fast-check available (4.9.0); resolver implemented |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | fc.property: modelId ∈ fc.constantFrom('qwen','llama3.1','gpt-4o-mini','llama-unknown','') × nCtxDetected ∈ fc.option(oneof(integer[-1000..1,000,000], constant 0, constant NaN, constant Infinity, constant -Infinity)) | Generated combos never produce invalid budget |
| 2 | Property: resolveContextBudget({modelId, nCtxDetected}).nCtx > 0 && Number.isFinite && Number.isInteger | Holds for all generated cases (default 100 runs) |

**Test Data:** Generated domains as above (deterministic seed for reproducibility). (testdata/budget-resolution-testdata.csv row STC-300)
**Postconditions:** Never-0 guarantee statistically verified.

---

### STC-301: [PBT] BR-02 — safetyMargin === ceil(nCtx × 0.08) for all nCtx

| Field | Value |
|-------|-------|
| **ID** | STC-301 |
| **Level** | PBT |
| **Priority** | High |
| **Type** | Business Rule (Property-Based) |
| **Requirement** | BR-02 |
| **File** | extension/src/pi-agent/__tests__/context-budget-resolver.pbt.test.ts |
| **Preconditions** | fast-check; resolver implemented |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | fc.property: n ∈ fc.integer({min:1, max:1000000}) | Property holds for every n |
| 2 | Property: resolveContextBudget({modelId:'x', nCtxDetected:n}).safetyMargin === Math.ceil(n × 0.08) | No counterexample (includes ceil edge: 2621.44 → 2622) |

**Test Data:** domain [1 .. 1,000,000]; fixed seed. (testdata/budget-resolution-testdata.csv row STC-301)
**Postconditions:** 8% margin formula exact everywhere.

---

### STC-302: [PBT] BR-03 — split invariants (sum, floor, floor 2000)

| Field | Value |
|-------|-------|
| **ID** | STC-302 |
| **Level** | PBT |
| **Priority** | High |
| **Type** | Business Rule (Property-Based) |
| **Requirement** | BR-03, BR-02, MIN_RESERVE_TOKENS |
| **File** | extension/src/pi-agent/__tests__/context-budget-resolver.pbt.test.ts |
| **Preconditions** | fast-check; resolver implemented |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | fc.property: n ∈ [1..1,000,000]; b = resolveContextBudget({nCtxDetected:n}) | Invariants hold ∀ n |
| 2 | Properties: b.reserveOutput ≥ 2000; usable = max(n − reserve − safety, 1); b.staticBudget === floor(usable × 0.70); b.staticBudget + b.historyBudget === usable; b.historyBudget === usable − b.staticBudget | All hold — no rounding drift at any n |

**Test Data:** domain [1 .. 1,000,000]; spot anchors: 8192→{656, 3875, 1661}, 32768→{2622, 19668, 8430}. (testdata/budget-resolution-testdata.csv row STC-302)
**Postconditions:** Budget math deterministic and self-consistent.
---

### STC-303: BR-05 — all NON_STRIPPABLE_RE keyword variants survive compression and drops

| Field | Value |
|-------|-------|
| **ID** | STC-303 |
| **Level** | UT |
| **Priority** | High |
| **Type** | Business Rule / Security |
| **Requirement** | BR-05, SEC-326-04 |
| **File** | extension/src/pi-agent/__tests__/prompt-compressor.test.ts + scoped-steering.test.ts |
| **Preconditions** | NON_STRIPPABLE_RE = /^\s*[-*]?\s*(security|warning|never|do not|important)\b/i (verified) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Template with 7 security-line variants: "security: never commit secrets", "WARNING: gate required", "Never call provider oversized", "do not strip this line", "IMPORTANT: keep fail-safe", "- security: bullet variant", "* warning: bullet variant" — wrapped in heavy strippable boilerplate; run compressPrompt | All 7 lines present verbatim in output |
| 2 | Same lines inside steering files during over-cap drop (STC-018 fixture) | All 7 survive the drop logic as well |

**Test Data:** 7-line security matrix (case-insensitive, bullet-prefixed variants). (testdata/compression-testdata.csv row STC-303)
**Postconditions:** Security directives survive ALL trimming paths — a lost directive is a security regression, not a token saving.

---

### STC-304: BR-06 — core + discovery tools never removed, any role, any escalation state

| Field | Value |
|-------|-------|
| **ID** | STC-304 |
| **Level** | UT |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-06 |
| **File** | extension/src/pi-agent/__tests__/tool-loadout.test.ts |
| **Preconditions** | Role-aware loadout + minimal-loadout escalation implemented |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | For role ∈ {SM, BA, SA, DEV, QA, DevOps, UI, Security, intern-x}: loadout ⊇ {read, write, edit, grep, find, ls, shell, find_tools, execute_dynamic_tool} | 9/9 tools present for every role |
| 2 | Reduce loadout to minimal (escalation step 3 / small tier) | Same 9 tools still present |

**Test Data:** 9-role loop; required set of 9 tool ids. (testdata/tool-loadout-testdata.csv row STC-304)
**Postconditions:** The non-negotiable set is invariant.

---

### STC-305: BR-07 — unknown role fail-open across skills, tools and steering

| Field | Value |
|-------|-------|
| **ID** | STC-305 |
| **Level** | UT |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-07 |
| **File** | extension/src/pi-agent/__tests__/role-scope.test.ts + tool-loadout.test.ts |
| **Preconditions** | All three scoping paths implemented |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | role='intern-x': filterSkills → all kept (STC-102 fixture) | 8/8 skills |
| 2 | getSessionToolLoadout('intern-x', ...) → permissive default + core + discovery | Nothing lost vs base capability |
| 3 | scopedSteering(base, 'intern-x', phase, budget) → base unchanged | Fail-open on all three paths |

**Test Data:** role='intern-x' across all scoping entry points. (testdata/role-scope-testdata.csv row STC-305)
**Postconditions:** Unknown roles never lose capability (no regression).

---

### STC-306: BR-08 — no over-escalation: unused ladder steps never fire

| Field | Value |
|-------|-------|
| **ID** | STC-306 |
| **Level** | IT |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-08 |
| **File** | extension/src/pi-agent/__tests__/context-governance.integration.test.ts |
| **Preconditions** | Escalation steps instrumented with sinon spies |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run STC-110 fixture (compression alone suffices) with spies on all three steps | Step 1 fired; steps 2–3 call count 0 |
| 2 | Run STC-205 fixture (all steps needed) | Steps fire strictly in order 1→2→3 |
| 3 | Assert re-measure happens after each fired step and BEFORE any next step | Ordering + measurement discipline enforced |

**Test Data:** Both escalation fixtures from escalation-testdata.csv (rows STC-110, STC-205).
**Postconditions:** Ladder is minimal and ordered — never degrades more than needed.

---

### STC-307: BR-09 — provider call count is zero after REJECT

| Field | Value |
|-------|-------|
| **ID** | STC-307 |
| **Level** | IT |
| **Priority** | High |
| **Type** | Business Rule / Security |
| **Requirement** | BR-09 |
| **File** | extension/src/pi-agent/__tests__/context-governance.integration.test.ts |
| **Preconditions** | sinon spy on provider.send / createAgentSession |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run STC-206 absolute-exceed scenario | chat:error emitted |
| 2 | Assert spy | createAgentSession call count === 0; no HTTP request to provider |
| 3 | Assert allow-path control (STC-011) | Spy called exactly once — proves the spy itself works |

**Test Data:** STC-206 fixture (n_ctx 8,192, staticBudget 3,841). (testdata/escalation-testdata.csv row STC-206)
**Postconditions:** Provider never receives an oversized prompt.

---

### STC-308: BR-10 — no automatic model switching during governance

| Field | Value |
|-------|-------|
| **ID** | STC-308 |
| **Level** | UT |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-10, UC-06 |
| **File** | extension/src/pi-agent/__tests__/context-budget-resolver.test.ts |
| **Preconditions** | Full governance run on qwen 32k fixture |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Capture selected modelId/provider config before governance; run full pipeline (tiering, compression, scoping, loadout) | — |
| 2 | Assert after governance | modelId STILL 'qwen'; provider endpoint unchanged; no other model contacted |
| 3 | Assert what DID change | Only behavior flags: compression mode, scope, loadout width, budget split |

**Test Data:** modelId='qwen' at 32,768. (testdata/tiering-testdata.csv row STC-308)
**Postconditions:** No surprising model swaps (Guide Task 6.4).

---

### STC-309: BR-12 — detectContextWindowEarly runs BEFORE static assembly

| Field | Value |
|-------|-------|
| **ID** | STC-309 |
| **Level** | IT |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-12, UC-05 preconditions |
| **File** | extension/src/pi-agent/__tests__/context-governance.integration.test.ts |
| **Preconditions** | sinon spies on detectContextWindowEarly and createHost assembly entry |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run turn-1 (simulated provider, meta.n_ctx=32,768) | — |
| 2 | Assert call order | detectContextWindowEarly.calledBefore(assemblySpy) === true |
| 3 | Assert assembly received detected value | Budget log shows nCtx=32,768 with source=provider at assembly time |

**Test Data:** simulated server n_ctx=32,768. (testdata/escalation-testdata.csv row STC-309)
**Postconditions:** Root-cause ordering fixed (Guide Task 5.1).

---

### STC-310: BR-13 — threshold boundaries 85.0 / 85.01 / 95.0 / 95.01

| Field | Value |
|-------|-------|
| **ID** | STC-310 |
| **Level** | UT |
| **Priority** | High |
| **Type** | Business Rule (Boundary) |
| **Requirement** | BR-13 |
| **File** | extension/src/pi-agent/__tests__/context-budget.test.ts |
| **Preconditions** | ThresholdGate verified constants (REJECT=95, WARN=85) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | ThresholdGate.evaluate(85.0) | ALLOW (85 is NOT > 85) |
| 2 | ThresholdGate.evaluate(85.01) | WARN |
| 3 | ThresholdGate.evaluate(95.0) | WARN (95 is NOT > 95) |
| 4 | ThresholdGate.evaluate(95.01) | REJECT; also evaluate(0)→ALLOW, evaluate(100)→REJECT |
| 5 | Assert constants | REJECT_THRESHOLD_PERCENT === 95; WARN_THRESHOLD_PERCENT === 85 |

**Test Data:** {85.0, 85.01, 95.0, 95.01, 0, 100}. (testdata/gate-threshold-testdata.csv rows STC-310a..f)
**Postconditions:** Gate boundaries unambiguous — REJECT strictly greater than 95, WARN strictly greater than 85.

---

### STC-311: BR-14 — registry rejects invalid entries; duplicates rejected

| Field | Value |
|-------|-------|
| **ID** | STC-311 |
| **Level** | UT |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-14 |
| **File** | extension/src/pi-agent/__tests__/model-registry.test.ts |
| **Preconditions** | ModelRegistry.validate verified |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | validate(qwen entry) | true |
| 2 | validate with contextWindow=0; =-100; =2048.5 (non-integer) | false in all three cases |
| 3 | validate with maxOutput=32769 (> contextWindow 32768); thinkingMap.high=4096 (> maxOutput 2048); modelId='' | false in all three cases |
| 4 | new ModelRegistry([...]) with duplicate 'qwen' entry | Second entry rejected with warn log ("Duplicate modelId rejected") |

**Test Data:** invalid mutation matrix over the qwen entry. (testdata/pre-seeded-data.csv — validation notes)
**Postconditions:** Registry integrity guaranteed (fallback chain can trust it).

---

### STC-312: BR-15 — non-worsening compression (ratio 0.6, empty → original)

| Field | Value |
|-------|-------|
| **ID** | STC-312 |
| **Level** | UT |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-15 |
| **File** | extension/src/pi-agent/__tests__/prompt-compressor.test.ts |
| **Preconditions** | COMPRESSION_MAX_RATIO = 0.6 (verified) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | compressPrompt(dense 500-char prose — no strippable targets) | Returns ORIGINAL (compressed would be ≥ original) |
| 2 | Template '<!-- only a comment -->' → stripped result empty | Returns ORIGINAL (empty result rejected) |
| 3 | Compressible sample: 400 chars with 300 strippable → compressed 100 chars | ratio 0.25 ≤ 0.6 → CompressedVariant.withinBudget === true; compressed content used |

**Test Data:** dense / empty-result / rich samples (400→100 chars). (testdata/compression-testdata.csv rows STC-312a..c)
**Postconditions:** Compression never worsens content.

---

### STC-313: BR-16 — tier boundary matrix (16,384 / 16,385 / 127,999 / 128,000 / unknown)

| Field | Value |
|-------|-------|
| **ID** | STC-313 |
| **Level** | UT |
| **Priority** | High |
| **Type** | Business Rule (Boundary) |
| **Requirement** | BR-16, OI-1 |
| **File** | extension/src/pi-agent/__tests__/model-router.test.ts |
| **Preconditions** | SMALL_CONTEXT_WINDOW_THRESHOLD = 16,384 (verified) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Registry entries with contextWindow 16,384 and 16,385 | classifyTier: 16,384 → 'small'; 16,385 → 'large' (not small) |
| 2 | Windows 127,999 and 128,000 | Not small in both; 3-tier behavior: 127,999 → medium; 128,000 → large (no compression + full loadout) |
| 3 | classifyTier(registry, 'unknown-model') (registry miss) | 'small' — fail-safe small behaviors (EF-1 UC-06: unknown → safe side) |

**Test Data:** windows {16384, 16385, 127999, 128000}; unknown model. (testdata/tiering-testdata.csv rows STC-313a..e)
**Postconditions:** Tier mapping deterministic at every boundary.

---

### STC-314: BR-11 — wire-only diff review (no new algorithms)

| Field | Value |
|-------|-------|
| **ID** | STC-314 |
| **Level** | SIT |
| **Priority** | Medium |
| **Type** | Business Rule / Review (Manual) |
| **Requirement** | BR-11 |
| **File** | Manual review recorded in TEST-REPORT-SA4E-355.csv (evidence: PR diff) |
| **Preconditions** | Implementation PR complete (T1–T7) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Review the full diff against checklist: (a) no new compressor/budget/tier/role-filter algorithm; (b) changes limited to wiring in pi-agent-session-host.ts + pi-workflow-adapter.ts + NEW thin modules context-budget-resolver.ts, scoped-steering.ts, models/ContextBudget.ts + qwen registry entry + tests | All checklist items pass |
| 2 | Verify LangGraph untouched (extension/out/langgraph/** has zero diff) and SDK contract not modified | Pass |
| 3 | Record verdict with evidence link in TEST-REPORT | Documented |

**Test Data:** PR diff for SA4E-355; checklist per IMPLEMENTATION-GUIDE §5.
**Postconditions:** "Portability of fix" NFR met — diff shows composition, not new algorithms.

---

## 5. Boundary & Negative Testing

### STC-400: Extreme n_ctx = 1 — resolver never throws; gate fails safe

| Field | Value |
|-------|-------|
| **ID** | STC-400 |
| **Level** | UT |
| **Priority** | Medium |
| **Type** | Boundary |
| **Requirement** | UC-01 EF-2, BR-01 |
| **File** | extension/src/pi-agent/__tests__/context-budget-resolver.test.ts |
| **Preconditions** | Resolver + gate available |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | resolveContextBudget({modelId:'x', nCtxDetected:1}) | No throw. safetyMargin=1 (ceil(0.08)); reserveOutput=2,000; usable=max(1−2000−1, 1)=1 |
| 2 | Assert budgets | staticBudget=0, historyBudget=1 (clamped floor holds) |
| 3 | Gate on result | usage ≥ 100% (reserve alone exceeds window) → REJECT → actionable chat:error |

**Test Data:** nCtxDetected=1 (degenerate extreme). (testdata/budget-resolution-testdata.csv row STC-400)
**Postconditions:** Degenerate inputs degrade safely to the error path.

---

### STC-401: Gate percentage boundaries via real BudgetCalculator inputs

| Field | Value |
|-------|-------|
| **ID** | STC-401 |
| **Level** | UT |
| **Priority** | High |
| **Type** | Boundary |
| **Requirement** | BR-13, UC-05 |
| **File** | extension/src/pi-agent/__tests__/context-budget.test.ts |
| **Preconditions** | Verified formula: usagePercent = (ceil(chars/4) + tools + history + reserve) / contextWindow × 100 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | calculateBudget(10000, {systemPromptChars:26000, reserveTokens:2000}) → evaluate | estimated=6,500+2,000=8,500 → 85.000% → **ALLOW** |
| 2 | calculateBudget(10000, {systemPromptChars:26004, ...}) | estimated=8,501 → 85.01% → **WARN** |
| 3 | calculateBudget(10000, {systemPromptChars:30000, ...}) | estimated=9,500 → 95.000% → **WARN** |
| 4 | calculateBudget(10000, {systemPromptChars:30004, ...}) | estimated=9,501 → 95.01% → **REJECT** |

**Test Data:** contextWindow=10,000; chars = tokens×4 exactly (26,000/26,004/30,000/30,004). (testdata/gate-threshold-testdata.csv rows STC-401a..d)
**Postconditions:** End-to-end boundary behavior matches ThresholdGate direct tests (STC-310).

---

### STC-402: reserveTokens below floor forced up; conservative flag set

| Field | Value |
|-------|-------|
| **ID** | STC-402 |
| **Level** | UT |
| **Priority** | High |
| **Type** | Boundary / Negative |
| **Requirement** | UC-05 (FSD §3.5.4 reserve ≥ 2,000), MIN_RESERVE_TOKENS |
| **File** | extension/src/pi-agent/__tests__/context-budget.test.ts |
| **Preconditions** | BudgetCalculator verified |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | calculateBudget(10000, {systemPromptChars:4000, reserveTokens:500}) | reserveTokens=2,000 (forced up from 500) |
| 2 | Assert estimated | = 1,000 (chars) + 2,000 = 3,000; usage=30.0% → ALLOW |
| 3 | Assert conservative | result.conservative === true (forced flag propagated) |

**Test Data:** reserveTokens=500 (< 2,000 floor). (testdata/gate-threshold-testdata.csv row STC-402)
**Postconditions:** Output reserve can never be silently undercut.

---

### STC-403: contextWindow ≤ 0 → usagePercent = 100 → REJECT (fail-safe)

| Field | Value |
|-------|-------|
| **ID** | STC-403 |
| **Level** | UT |
| **Priority** | High |
| **Type** | Negative |
| **Requirement** | BR-01 (fail-safe side), FSD §3.8 verified note |
| **File** | extension/src/pi-agent/__tests__/context-budget.test.ts |
| **Preconditions** | BudgetCalculator verified |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | calculateBudget(0, {systemPromptChars:26000}) | usagePercent === 100 |
| 2 | calculateBudget(-100, {systemPromptChars:26000}) | usagePercent === 100 |
| 3 | evaluate(100) | REJECT — an invalid window can never produce an ALLOW |

**Test Data:** contextWindow ∈ {0, −100}. (testdata/gate-threshold-testdata.csv rows STC-403a..b)
**Postconditions:** Fail-safe: bad window = worst-case decision.

---

### STC-404: Empty / whitespace modelId → default 8,192, no crash

| Field | Value |
|-------|-------|
| **ID** | STC-404 |
| **Level** | UT |
| **Priority** | Medium |
| **Type** | Negative |
| **Requirement** | UC-01 AF-2, BR-01; TDD §7 input validation |
| **File** | extension/src/pi-agent/__tests__/context-budget-resolver.test.ts |
| **Preconditions** | Resolver implemented |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | resolveContextBudget({modelId:''}) and {modelId:'   '} | Both resolve via default path: nCtx=8,192, reserve=2,000, safety=656, static=3,875, history=1,661 |
| 2 | Assert no throw; warning PI_CONTEXT_DETECT_DEFAULT logged | Robust to malformed input |

**Test Data:** modelId ∈ {'', '   '}. (testdata/budget-resolution-testdata.csv row STC-404)
**Postconditions:** Malformed model identifiers never break the turn.

---

### STC-405: Empty / whitespace-only AGENTS.md content → original kept

| Field | Value |
|-------|-------|
| **ID** | STC-405 |
| **Level** | UT |
| **Priority** | Medium |
| **Type** | Boundary |
| **Requirement** | UC-03, BR-15 |
| **File** | extension/src/pi-agent/__tests__/prompt-compressor.test.ts |
| **Preconditions** | compressPrompt verified |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | compressPrompt('') | Returns '' (unchanged) |
| 2 | compressPrompt('   ') / '\n\n\t\n' | Returns original unchanged (non-worsening) |
| 3 | agentsFilesOverride with empty-content file | Content passed through unchanged; no error |

**Test Data:** empty / whitespace-only contents. (testdata/compression-testdata.csv row STC-405)
**Postconditions:** Edge contents never corrupted or crashed on.

---

### STC-406: Token estimator exact behavior (CHARS_PER_TOKEN = 4)

| Field | Value |
|-------|-------|
| **ID** | STC-406 |
| **Level** | UT |
| **Priority** | Medium |
| **Type** | Boundary |
| **Requirement** | FSD §3.1.4 supporting types; CHARS_PER_TOKEN constant |
| **File** | extension/src/pi-agent/__tests__/context-budget.test.ts |
| **Preconditions** | BudgetCalculator.estimateTokens + estimateTokenCount verified |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | estimateTokens(400 chars) / estimateTokens(401 chars) | 100 / 101 (ceil) |
| 2 | estimateTokens(0) / estimateTokens(-5) / estimateTokens(NaN) / undefined | 0 in all cases |
| 3 | estimateTokenCount('') === 0; CHARS_PER_TOKEN === 4 | Constants pinned |

**Test Data:** chars {0, 400, 401, -5, NaN, undefined}. (testdata/gate-threshold-testdata.csv rows STC-406a..c)
**Postconditions:** Estimation deterministic — basis of all budget math.
---

## 6. UI/UX Testing

### STC-500: Context Usage Indicator reflects measured usage vs budgets

| Field | Value |
|-------|-------|
| **ID** | STC-500 |
| **Level** | E2E-UI |
| **Priority** | Medium |
| **Type** | UI/UX |
| **Requirement** | UC-01 (FSD §3.1.5), FSD §8 Observability |
| **Feature File** | e2e/features/webview/context-usage-indicator.feature |
| **Preconditions** | Extension built; simulated server n_ctx=32,768; Chat Panel open |

**Test Steps (Gherkin scenario "Usage indicator shows static and history usage"):**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Launch VS Code via wdio-vscode-service; select model qwen | Provider = simulated server |
| 2 | Send "Hãy review source code" | Turn executes |
| 3 | Assert usage indicator | Visible, non-zero, reflects static + history usage against staticBudget/historyBudget (updates after turn 1; not stuck at 0) |

**Test Data:** simulated n_ctx=32,768 → expected usage ≈ 27–35% after governance (fixture STC-011). (testdata/escalation-testdata.csv row STC-011)
**Postconditions:** Indicator is a truthful budget mirror (demoable).

---

### STC-501: Error banner renders PI_CONTEXT_BUDGET_EXCEEDED with N/M/K values

| Field | Value |
|-------|-------|
| **ID** | STC-501 |
| **Level** | E2E-UI |
| **Priority** | High |
| **Type** | UI/UX — Error Display |
| **Requirement** | UC-05 (FSD §3.5.5-1), BR-09; FSD §9.1 |
| **Feature File** | e2e/features/webview/budget-error-banner.feature |
| **Preconditions** | Simulated server n_ctx=2,048; oversized steering fixture (forces REJECT) |

**Test Steps (Gherkin scenario "Budget exceeded error banner is actionable"):**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Configure simulated server n_ctx=2,048 with oversized workspace fixture; send a turn | Gate REJECTs |
| 2 | Assert chat:error banner visible | Text matches "PI_CONTEXT_BUDGET_EXCEEDED: static context {N} tokens vượt budget {M} cho model n_ctx={K}. Giảm steering/tools hoặc dùng model context lớn hơn." |
| 3 | Assert message quality | {N}, {M}, {K} are numbers; message is actionable (reduce steering/tools or larger model); NO file contents/config/secrets in text |

**Test Data:** n_ctx=2,048; staticBudget M=0 (per STC-201 math); banner must contain numeric N/M/K. (testdata/escalation-testdata.csv row STC-206 format)
**Postconditions:** User sees actionable remediation, never a raw 400.

---

### STC-502: [SIT] Turn-1 usage bar — no red overflow state

| Field | Value |
|-------|-------|
| **ID** | STC-502 |
| **Level** | SIT |
| **Priority** | Medium |
| **Type** | UI/UX (Manual) |
| **Requirement** | UC-07 (FSD §3.7.5-3) |
| **Preconditions** | Real or simulated qwen session ready; checklist in hand |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Send turn 1 "Hãy review source code" on qwen 32k | Turn executes |
| 2 | Visually inspect context usage bar | Reflects real usage; NO red/overflow state on turn 1 |

**Test Data:** message "Hãy review source code"; screenshot evidence → evidence/STC-502-usage-bar.png
**Postconditions:** Visual state consistent with governance behavior.

---

### STC-503: [SIT] BA vs SM — static token share visibly lower for BA

| Field | Value |
|-------|-------|
| **ID** | STC-503 |
| **Level** | SIT |
| **Priority** | Medium |
| **Type** | UI/UX Demo (Manual) |
| **Requirement** | UC-02 (FSD §3.2.5), Guide Task 2 demo |
| **Preconditions** | Two sessions possible: role=BA and role=SM on same model |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create BA session; record static tokens from log/indicator | Value A |
| 2 | Create SM session; record static tokens | Value B |
| 3 | Compare | A < B visibly (BA scope 5 tokens vs SM full coordination set); log both values as demo evidence |

**Test Data:** roles BA vs SM; same model qwen 32k. Evidence → evidence/STC-503-ba-vs-sm.png
**Postconditions:** Role scoping demoable (Guide Task 2 demo criterion).

---

### STC-504: [SIT] qwen 32k compression demo — AGENTS.md + steering share drops

| Field | Value |
|-------|-------|
| **ID** | STC-504 |
| **Level** | SIT |
| **Priority** | Medium |
| **Type** | UI/UX Demo (Manual) |
| **Requirement** | UC-03 (FSD §3.3.5), Guide Task 3 demo |
| **Preconditions** | Over-budget steering fixture; qwen 32k session |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Record AGENTS.md + steering token estimate before compression (log "before") | Value X |
| 2 | Trigger session with shouldCompress=true; read log "after" + ratio | Value Y < X; ratio ≤ 0.6 |
| 3 | Visually confirm usage indicator drop | Share visibly lower (demo "reduced X%") |

**Test Data:** over-budget fixture (~50k steering tokens vs 19,668 staticBudget). Evidence → evidence/STC-504-compression.png
**Postconditions:** Compression effect observable (Guide Task 3 demo criterion).

---

## 7. Non-Functional Testing

### STC-600: Performance — budget resolution + gate < 50 ms per session creation

| Field | Value |
|-------|-------|
| **ID** | STC-600 |
| **Level** | IT |
| **Priority** | Medium |
| **Type** | Non-Functional — Performance |
| **Requirement** | FSD §8 Performance (BRD NFR) |
| **File** | extension/src/pi-agent/__tests__/context-governance.integration.test.ts |
| **Preconditions** | performance.now() instrumentation; mixed input set |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run resolveContextBudget + calculateBudget + evaluate 1,000 iterations over mixed inputs (qwen 32k, 8k, unknown, invalid) | Completes without I/O |
| 2 | Measure average and p95 latency | BOTH < 50 ms per session creation (expected < 1 ms in-process) |

**Acceptance Criteria:** avg < 50 ms AND p95 < 50 ms (FSD §8).
**Test Data:** 1,000 iterations; input mix per budget-resolution-testdata.csv.
**Postconditions:** Governance adds negligible latency.

---

### STC-601: Quality gates — npm test + tsc green (NFR-2)

| Field | Value |
|-------|-------|
| **ID** | STC-601 |
| **Level** | IT |
| **Priority** | High |
| **Type** | Non-Functional — Quality Gate |
| **Requirement** | FSD §8 Quality gates; NFR-2 (Guide §2/§3) |
| **File** | repo root — npm test / tsc |
| **Preconditions** | All T1–T7 tasks complete |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | cd extension && npm test | Exit code 0 — all suites green (existing + new) |
| 2 | npm test (repo root, all workspaces) | Exit code 0 |
| 3 | cd extension && npm run compile (tsc -p ./) | Exit code 0 — no type errors |

**Acceptance Criteria:** All three commands exit 0 at every task boundary and at exit.
**Test Data:** n/a (command gates).
**Postconditions:** "No red increment lands" (NFR-2) verified.

---

### STC-602: [SIT] Code standards review — file ≤ 200 lines, function ≤ 20 lines, TSDoc

| Field | Value |
|-------|-------|
| **ID** | STC-602 |
| **Level** | SIT |
| **Priority** | Medium |
| **Type** | Non-Functional — Maintainability (Manual review) |
| **Requirement** | FSD §8 Maintainability; code-standards |
| **Preconditions** | Implementation PR complete |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Check every new/changed file: line count ≤ 200 | Pass per file |
| 2 | Check every function ≤ 20 lines; SOLID; models separated under models/ | Pass |
| 3 | Check TSDoc on public APIs; no swallowed exceptions (fail-open catch MUST log) | Pass — record verdict per file |

**Acceptance Criteria:** 100% of changed files conform.
**Test Data:** PR diff; verdicts recorded in TEST-REPORT notes.
**Postconditions:** Maintainability NFR met.

---

### STC-603: Error hygiene — messages contain only counts, codes and advice

| Field | Value |
|-------|-------|
| **ID** | STC-603 |
| **Level** | UT |
| **Priority** | High |
| **Type** | Non-Functional — Security |
| **Requirement** | FSD §7.2 (error messages), TDD §7 |
| **File** | extension/src/pi-agent/__tests__/context-governance.integration.test.ts |
| **Preconditions** | STC-206 fixture running; log capture active |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Capture chat:error + all log events (PI_CONTEXT_BUDGET_EXCEEDED, PI_TOOL_SCHEMA_CAP, PI_CONTEXT_DETECT_FALLBACK, PI_CONTEXT_DETECT_DEFAULT) from STC-206/204/100/101 runs | All messages collected |
| 2 | Regex-scan messages for file paths, file contents, config values, secrets | ZERO matches — only counts {N}/{M}/{K}, log codes, remediation advice |

**Test Data:** captured log corpus from the exception-flow fixtures.
**Postconditions:** Error surface is hygienic (TDD §7).
---

## 8. Integration, E2E & Manual SIT

### STC-700: [E2E-API] Turn-1 with oversized static context on 32k — NO exceed_context_size_error

| Field | Value |
|-------|-------|
| **ID** | STC-700 |
| **Level** | E2E-API |
| **Priority** | High |
| **Type** | E2E — Automated |
| **Requirement** | UC-07 (FSD §3.7 MF), BR-09, BR-12; BRD success criterion |
| **File** | extension/src/pi-agent/__tests__/context-governance.e2e.test.ts (vitest + in-test HTTP server) |
| **Preconditions** | Simulated OpenAI-compatible server exposing meta.n_ctx=32,768; oversized workspace fixture: steering corpus ~50,000 tokens (20 files × 10,000 chars), AGENTS.md 10,000 tokens, 12 MCP tools; role=DEV, phase=implementation |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Start simulated server; run turn 1 "Hãy review source code" through the real adapter path: detectContextWindowEarly → createHost → overrides → gate → createAgentSession | Full pipeline executes |
| 2 | Assert budget log | {nCtx:32768, reserveOutput:2048, safetyMargin:2622, staticBudget:19668, historyBudget:8430}, source=provider |
| 3 | Assert governance applied | Skills scoped (DEV set); steering scoped by phase + capped; AGENTS.md compressed (security lines intact); loadout capped |
| 4 | Assert outcome | **NO exceed_context_size_error** (no 400); turn 1 completes; first tool call (read/grep fixture) completes |

**Test Data:** n_ctx=32,768; raw static ≈ 62,000 tokens > staticBudget 19,668 — the exact class of scenario that used to 400 on turn 1. (testdata/escalation-testdata.csv row STC-700)
**Postconditions:** The headline acceptance of SA4E-355 proven end-to-end.

---

### STC-701: [E2E-API] Provider without meta.n_ctx — registry fallback completes turn

| Field | Value |
|-------|-------|
| **ID** | STC-701 |
| **Level** | E2E-API |
| **Priority** | High |
| **Type** | E2E — Automated |
| **Requirement** | UC-01 AF-1, UC-05; FSD §9.1 |
| **File** | extension/src/pi-agent/__tests__/context-governance.e2e.test.ts |
| **Preconditions** | Simulated server WITHOUT n_ctx metadata; modelId='qwen' selected |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run turn 1 against server exposing no meta.n_ctx | detectContextWindowEarly returns nothing; resolver falls back |
| 2 | Assert budget | nCtx=32,768 from registry; PI_CONTEXT_DETECT_FALLBACK logged |
| 3 | Assert turn | Completes; no overflow; gate ALLOW/WARN |

**Test Data:** server with no n_ctx field; modelId='qwen'. (testdata/escalation-testdata.csv row STC-701)
**Postconditions:** Detection failure is transparent to the user (FSD §9.1).

---

### STC-702: [E2E-API] Three sizes through the real provider layer — fits budget each

| Field | Value |
|-------|-------|
| **ID** | STC-702 |
| **Level** | E2E-API |
| **Priority** | High |
| **Type** | E2E — Automated |
| **Requirement** | UC-07, BR-16, FSD §8 Scalability; FSD TC-17 |
| **File** | extension/src/pi-agent/__tests__/context-governance.e2e.test.ts |
| **Preconditions** | Simulated server re-configurable to n_ctx ∈ {8,192, 32,768, 128,000} |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | For each size: reconfigure simulated server; run turn 1 on the same oversized fixture | Pipeline adapts per size |
| 2 | Assert per size | Total prompt ≤ usable (5,488 / 28,098 / 101,376); gate ALLOW or WARN; zero 400s |
| 3 | Assert tier behaviors per size | 8k: forced compression + minimal loadout; 32k: on-demand; 128k: no compression + full loadout |

**Test Data:** sizes {8192, 32768, 128000}; same workspace fixture. (testdata/budget-resolution-testdata.csv rows STC-016a..c)
**Postconditions:** "Same codebase scales" (BRD STORY 6) proven at the provider layer.

---

### STC-703: [E2E-UI] VS Code turn-1 governance — select qwen, send review request

| Field | Value |
|-------|-------|
| **ID** | STC-703 |
| **Level** | E2E-UI |
| **Priority** | High |
| **Type** | E2E — Automated |
| **Requirement** | UC-07 (FSD §3.7.5), BR-09 |
| **Feature File** | e2e/features/workbench/turn1-context-governance.feature |
| **Steps File** | e2e/features/step_definitions/ (Serenity-JS tasks + wdio-vscode-service) |
| **Preconditions** | Extension built (npm run esbuild); simulated server n_ctx=32,768 configured as provider |

**Test Steps (Gherkin scenario "Turn 1 completes within budget on qwen 32k"):**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Given the extension is loaded in VS Code; select model qwen in Chat Panel | Model selected; provider = simulated server |
| 2 | Type "Hãy review source code" and submit | Turn 1 executes |
| 3 | Assert | Assistant response streams (no error banner); usage indicator updated; first tool call visible in trace; NO exceed_context_size_error |

**Test Data:** message "Hãy review source code"; simulated n_ctx=32,768. (testdata/escalation-testdata.csv row STC-700)
**Postconditions:** Automated UI proof of the FSD §3.7.5 checklist (real-weights variant stays manual — STC-720).

---

### STC-720: [SIT] Manual E2E — real qwen 32k via llama-server ("Hãy review source code")

| Field | Value |
|-------|-------|
| **ID** | STC-720 |
| **Level** | SIT |
| **Priority** | High |
| **Type** | Manual E2E (Acceptance) |
| **Requirement** | UC-07 (FSD §3.7 MF steps 4–6), Guide Task 7.3; FSD TC-18 |
| **Preconditions** | llama-server running with qwen weights, n_ctx=32,768 (context-size flag); provider endpoint configured in extension |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Start llama-server with qwen, n_ctx=32,768; configure extension provider endpoint | Server reachable |
| 2 | Select model qwen in Chat Panel UI | Provider = llama-server local |
| 3 | Send "Hãy review source code" | Turn 1 executes |
| 4 | **PASS criteria** | NO exceed_context_size_error; context usage bar reflects reality (no red overflow); turn 1 + first tool call complete |
| 5 | Clean up every temp file created during the test | Workspace clean (UC-07 step 6) |

**Test Data:** real qwen weights; n_ctx=32,768; message "Hãy review source code". Evidence → evidence/STC-720-qwen32k.png + server log
**Postconditions:** BRD headline acceptance demonstrated on the real model.

---

### STC-721: [SIT] Manual E2E variant — llama-server n_ctx=65,536

| Field | Value |
|-------|-------|
| **ID** | STC-721 |
| **Level** | SIT |
| **Priority** | Medium |
| **Type** | Manual E2E (Acceptance) |
| **Requirement** | UC-07 AF-1 |
| **Preconditions** | llama-server reconfigured with n_ctx=65,536 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Reconfigure llama-server n_ctx=65,536; repeat the STC-720 checklist | Same PASS criteria |
| 2 | Verify budget log | Scaled automatically: safetyMargin 5,243; staticBudget 40,771; historyBudget 17,474 (no code change) |

**Test Data:** n_ctx=65,536. Evidence → evidence/STC-721-qwen64k.png
**Postconditions:** AF-1 UC-07 proven — budget scales with detected window.

---

## 9. Regression Testing

### STC-800: Existing test suites stay green

| Field | Value |
|-------|-------|
| **ID** | STC-800 |
| **Level** | IT |
| **Priority** | High |
| **Type** | Regression |
| **Requirement** | FSD §8 Quality gates, NFR-2, A-1 |
| **File** | cd extension && npm test (all suites) |
| **Preconditions** | Full workspace builds |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run extension vitest suite | ALL existing suites pass: context-budget, role-scope, model-tier, model-router, model-registry, prompt-compressor, session-configurator.budget, session-compactor, agent-configurator (+integration), verification-loop, session-factory, eval-harness, etc. |
| 2 | Run new suites | context-budget-resolver, context-budget-resolver.pbt, scoped-steering, tool-loadout, context-governance.integration, context-governance.e2e ALL pass |
| 3 | Assert aggregate | Zero failures — no regression from wiring |

**Test Data:** n/a (suite-level gate).
**Postconditions:** Existing behavior intact (A-1 holds).

---

### STC-801: Session compactor (post-turn history) unaffected

| Field | Value |
|-------|-------|
| **ID** | STC-801 |
| **Level** | IT |
| **Priority** | Medium |
| **Type** | Regression |
| **Requirement** | FSD §2.2 (session-compactor partially wired — unchanged) |
| **File** | extension/src/pi-agent/__tests__/session-compactor.test.ts |
| **Preconditions** | Governance wired; multi-turn fixture available |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run existing session-compactor tests | Green |
| 2 | Run a 3-turn conversation fixture (history grows > historyBudget) | Post-turn history compaction triggers as before; history stays within historyBudget 8,430 (32k) |

**Test Data:** 3-turn conversation; history tokens crossing 8,430 at 32k.
**Postconditions:** Existing compaction path unchanged by governance wiring.

---

### STC-802: [SIT] Legacy fallback path (engine.executeTurn) unaffected

| Field | Value |
|-------|-------|
| **ID** | STC-802 |
| **Level** | SIT |
| **Priority** | Medium |
| **Type** | Regression (Manual exploratory) |
| **Requirement** | FSD §1.2 (LangGraph untouched); Guide §0.3 fallback path |
| **Preconditions** | Extension running; small prompt at hand |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Exercise the legacy fallback path once (engine.executeTurn) with a small prompt | Completes as before the change |
| 2 | Verify extension/out/langgraph/** has zero diff | Legacy engine untouched |

**Test Data:** small prompt "hello" via legacy path. Evidence → evidence/STC-802-legacy-path.png
**Postconditions:** No behavioral change outside the Pi SDK path.
---

## 10. Requirements Traceability Matrix (RTM)

| Requirement | Source | Test Cases | Coverage |
|-------------|--------|------------|----------|
| UC-01 Context Budget Resolution | FSD §3.1 | STC-001, STC-002, STC-003, STC-004, STC-005, STC-100, STC-101, STC-200, STC-201, STC-300, STC-301, STC-302, STC-400, STC-404, STC-016, STC-111, STC-700, STC-701, STC-702 | ✅ |
| UC-02 Role-Scoped Static Trimming | FSD §3.2 | STC-006, STC-007, STC-018, STC-102, STC-103, STC-104, STC-202, STC-303, STC-305, STC-503, STC-700 | ✅ |
| UC-03 Conditional Compression | FSD §3.3 | STC-008, STC-105, STC-106, STC-203, STC-303, STC-312, STC-405, STC-504, STC-700 | ✅ |
| UC-04 Tool Loadout Filtering | FSD §3.4 | STC-009, STC-010, STC-019, STC-107, STC-108, STC-204, STC-304, STC-017, STC-700 | ✅ |
| UC-05 Budget Gate Fail-Safe | FSD §3.5 | STC-011, STC-012, STC-110, STC-205, STC-206, STC-207, STC-306, STC-307, STC-309, STC-310, STC-401, STC-402, STC-403, STC-501, STC-700 | ✅ |
| UC-06 Model Tiering | FSD §3.6 | STC-013, STC-014, STC-015, STC-109, STC-308, STC-313, STC-702 | ✅ |
| UC-07 Integration + Manual E2E | FSD §3.7 | STC-016, STC-017, STC-111, STC-700, STC-701, STC-702, STC-703, STC-720, STC-721, STC-502 | ✅ |
| BR-01 n_ctx > 0 — fallback chain, never unbounded | FSD §3.8 | STC-001, STC-100, STC-101, STC-200, STC-201, STC-300, STC-400, STC-403, STC-404, STC-016, STC-700, STC-701 | ✅ |
| BR-02 safetyMargin = ceil(nCtx × 8%) | FSD §3.8 | STC-001, STC-003, STC-301 | ✅ |
| BR-03 usable split — static 70% / history 30% | FSD §3.8 | STC-001, STC-004, STC-018, STC-104, STC-302 | ✅ |
| BR-04 Compress only when over-budget or small/compressed tier | FSD §3.8 | STC-008, STC-105, STC-106 | ✅ |
| BR-05 NON_STRIPPABLE_RE lines survive trimming + compression | FSD §3.8 | STC-008, STC-018, STC-303 | ✅ |
| BR-06 Core tools + find_tools/execute_dynamic_tool always kept | FSD §3.8 | STC-009, STC-010, STC-304 | ✅ |
| BR-07 Unknown role → fail-open (allow all) | FSD §3.8 | STC-102, STC-108, STC-305 | ✅ |
| BR-08 Escalation order fixed: compress → drop steering → min loadout | FSD §3.8 | STC-110, STC-205, STC-306 | ✅ |
| BR-09 Absolute exceed → actionable error; provider NEVER called | FSD §3.8 | STC-201, STC-206, STC-207, STC-307 | ✅ |
| BR-10 No automatic model switching | FSD §3.8 | STC-308 | ✅ |
| BR-11 Wire-only — reuse existing mechanisms | FSD §3.8 | STC-314 | ✅ |
| BR-12 detectContextWindowEarly() before assembly | FSD §3.8 | STC-309 | ✅ |
| BR-13 Gate thresholds: REJECT > 95%, WARN > 85% | FSD §3.8 | STC-011, STC-012, STC-310, STC-401 | ✅ |
| BR-14 Registry validation + qwen entry (32768/2048) | FSD §3.8 | STC-005, STC-311 | ✅ |
| BR-15 Non-worsening compression (max ratio 0.6) | FSD §3.8 | STC-203, STC-312, STC-405 | ✅ |
| BR-16 Tier behavior mapping small / medium / large | FSD §3.8 | STC-013, STC-014, STC-015, STC-109, STC-313, STC-702 | ✅ |
| NFR §8 (performance, quality gates, security, observability) | FSD §8 | STC-500, STC-600, STC-601, STC-602, STC-603 | ✅ |
| Error scenarios + notifications | FSD §9 | STC-012, STC-100, STC-101, STC-203, STC-204, STC-206, STC-501 | ✅ |

**FSD §10.1 scenario mapping:** TC-01→STC-001 · TC-02→STC-100 · TC-03→STC-101 · TC-04→STC-003 · TC-05→STC-006 · TC-06→STC-102 · TC-07→STC-018 · TC-08→STC-007 · TC-09→STC-008 · TC-10→STC-105 · TC-11→STC-009/010 · TC-12→STC-019/204 · TC-13→STC-205 · TC-14→STC-206 · TC-15→STC-017 · TC-16→STC-013/014/015/313 · TC-17→STC-016/702 · TC-18→STC-720/703

**Coverage Summary:**

| Category | Total | Covered | Coverage % |
|----------|-------|---------|------------|
| Use Cases (UC-01..UC-07) | 7 | 7 | 100% |
| Business Rules (BR-01..BR-16) | 16 | 16 | 100% |
| NFR + Error Scenarios (FSD §8, §9) | 2 | 2 | 100% |
| FSD §10.1 Scenarios (TC-01..TC-18) | 18 | 18 | 100% |
| **Overall** | **23** | **23** | **100%** |

---

## 11. Appendix

### 11.1 Test Data Files

| File | Content |
|------|---------|
| testdata/pre-seeded-data.csv | Registry baseline (DEFAULT_MODEL_REGISTRY_ENTRIES + NEW qwen entry), role allowlists, core + discovery tool groups |
| testdata/budget-resolution-testdata.csv | Resolver cases with exact expected budgets (incl. PBT anchors) |
| testdata/gate-threshold-testdata.csv | ThresholdGate direct + BudgetCalculator boundary inputs (85/95 exact) |
| testdata/role-scope-testdata.csv | Skills/steering fixtures per role, phase mapping, over-cap drop |
| testdata/tool-loadout-testdata.csv | Loadout per role, schema-cap scenarios, discovery pattern |
| testdata/compression-testdata.csv | Compression corpus (compressible / dense / security matrix / empty) |
| testdata/escalation-testdata.csv | Gate/escalation scenarios incl. original incident 67,468 vs 65,536 |
| testdata/tiering-testdata.csv | Tier boundary matrix 16,384/16,385/127,999/128,000 + name-hint cases |
| testdata/test-case-inventory.csv | All 79 STC IDs → level, priority, requirement, file, data reference |

### 11.2 Environment Configuration

| Item | Value |
|------|-------|
| Test runner | vitest 4.1.8 (extension workspace: cd extension && npm test) |
| PBT | fast-check 4.9.0 (fixed seed for reproducibility) |
| Spies | sinon 17.0.1 (compressPrompt, provider/createAgentSession, detectContextWindowEarly, escalation steps) |
| E2E-UI | npm run test:e2e --prefix e2e (wdio.conf.ts, wdio-vscode-service; features under e2e/features/) |
| SIT | VS Code + llama-server (qwen, n_ctx 32,768 / 65,536); evidence to documents/SA4E-355/evidence/ |
| Execution tracker | documents/SA4E-355/TEST-REPORT-SA4E-355.csv (all 79 cases pre-filled, Status=NOT_RUN) |

### 11.3 Key Reference Values (verified constants)

| Constant | Value | Source |
|----------|-------|--------|
| CHARS_PER_TOKEN | 4 | extension/src/mcp/context-budget.ts |
| MIN_RESERVE_TOKENS | 2000 | extension/src/mcp/context-budget.ts |
| WARN_THRESHOLD_PERCENT | 85 | extension/src/mcp/context-budget.ts |
| REJECT_THRESHOLD_PERCENT | 95 | extension/src/mcp/context-budget.ts |
| COMPRESSION_MAX_RATIO | 0.6 | extension/src/pi-agent/prompt-compressor.ts |
| SMALL_CONTEXT_WINDOW_THRESHOLD | 16384 | extension/src/pi-agent/model-router.ts |
| safetyMargin | ceil(nCtx × 0.08) — 32768→2622, 8192→656, 128000→10240, 65536→5243 | TDD §3.2 |
| Split | static = floor(usable × 0.70); history = usable − static | TDD §3.2 |
| Default n_ctx | 8192 (terminal fallback; never 0) | BR-01 |
| Gate formula | usagePercent = (ceil(chars/4) + tools + retrieval + history + max(reserve,2000)) / contextWindow × 100 | mcp/context-budget.ts (verified) |

---

*End of STC — SA4E-355 v1.0. 79 test cases; RTM 100% (UC-01..07 + BR-01..16 + NFR + FSD §9).*
