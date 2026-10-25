# SA4E-384 Coordination Plan

**Ticket:** SA4E-384  
**Title:** Deferred test case register for SA4E-380 — 52 planned-not-authored specs  
**Current Phase:** `deferred_register` (in_progress)  
**Total Cases:** 52 | **Completed:** 11 | **Remaining:** 41  
**Last Updated:** 2026-10-25T11:00:00Z  
**Autonomy Level:** L3 unattended

---

## 1. Priority Ordering (THEO §9.2)

Per SA4E-380 TEST-REPORT §9.2 and TEST-REPORT line 463, the authoring priority order is:

```
E2E-API-01  →  UT-39 / UT-40 / UT-38  →  PBT harness (PBT-01..06)  →  registry IT-06..08  →  remaining UT edge cases  →  SIT-08..10 live staging
```

### 1.1 Priority Groups (ordered)

| Group | Cases | Reason-Class Split | Priority |
|-------|-------|-------------------|----------|
| **G1** | E2E-API-01 | 1 case | High — baseline diff |
| **G2** | UT-39, UT-40, UT-38 | 3 cases | High — `PROXY_WRITE_FAILED` literals, code-verified |
| **G3** | PBT-01..06 | 6 cases | High/Medium — property-based tests |
| **G4** | IT-06..08 | 3 cases | High — registry mixed-catalogue |
| **G5** | UT remaining (not in G2) | 18 cases | Medium/High — detection details |
| **G6** | SIT-08..10 | 3 cases | Medium — live staging manual |

### 1.2 Reason-Class Distribution

| Reason Class | Count | Handling |
|--------------|-------|----------|
| planned-not-authored | 30 | Must be authored from scratch |
| covered-by-suite | 14 | Author to pin exact surface; substitute evidence from SA4E-380 §4 |
| live-covered | 5 | Author to capture missing assertions |
| code-verified | 2 | Follow-up on code audit literals (UT-39, UT-40) |
| scope | 1 | Author when feature activated (UT-05) |

---

## 2. Agent Assignments

| Agent | Responsibility | Specific Tasks |
|-------|---------------|----------------|
| **QA Agent** | Author test case specifications | - Write UT/IT/PBT/ETC case details per priority order<br>- Ensure each case has: ID, priority, requirement, preconditions, test data, steps, expected result<br>- Include substitute evidence references from SA4E-380 TEST-REPORT §4<br>- Capture evidence per case (evidence/ files) |
| **Dev-Agent** | Implement code fixes if needed | - Fix any code issues uncovered during test authoring (e.g., UT-39/UT-40 write-count/sanitisation guards)<br>- Ensure `adaptInvocation`, `adaptResult`, `safeName`, `resolveArtifact` functions work correctly for authored cases<br>- Update unit test files if logic changes are required |
| **SM-Agent** | Track progress, coordinate pipeline | - Maintain STATUS.json with case completion counts<br>- Update Jira ticket status transitions<br>- Enforce checkpoint schedule (every 5 cases)<br>- Manage feedback loop if discrepancies found<br>- Transition phases when all cases authored |

### 2.1 Workflow Flow

```
QA Author → Write case spec → Dev-Agent Review → Code fix if needed → SM update STATUS.json → Next case
```

### 2.2 Sub-Agent Triggers

- **QA Agent** is invoked when: `tạo TDD`, `tạo STP`, or specific case authoring is needed
- **Dev-Agent** is invoked when: code fixes detected during QA authoring, or UT-39/UT-40 guards need strengthening
- **SM-Agent** is the entry point for all ticket actions

---

## 3. Checkpoint Schedule (mỗi 5 case update STATUS.json)

Checkpoints occur after every 5 cases are authored and verified. At each checkpoint, STATUS.json is updated with:
- `casesCompleted` count incremented
- `nextPriority` set to the next case in priority order
- `lastUpdated` timestamp refreshed
- Phase status adjusted if all 52 cases done

### 3.1 Checkpoint Milestones

| Checkpoint | Cases Completed | STATUS.json Updates | Action |
|------------|----------------|---------------------|--------|
| **CP-0** | 0 (start) | Initial state: casesCompleted=11, nextPriority=UT-06 | Begin G1 |
| **CP-1** | 5 cases | casesCompleted=16, nextPriority set to case #6 | Report progress |
| **CP-2** | 10 cases | casesCompleted=21, nextPriority set to case #11 | Report progress |
| **CP-3** | 15 cases | casesCompleted=26, nextPriority set to case #16 | Report progress |
| **CP-4** | 20 cases | casesCompleted=31, nextPriority set to case #21 | Report progress |
| **CP-5** | 25 cases | casesCompleted=36, nextPriority set to case #26 | Report progress |
| **CP-6** | 30 cases | casesCompleted=41, nextPriority set to case #31 | Report progress |
| **CP-7** | 35 cases | casesCompleted=46, nextPriority set to case #36 | Report progress |
| **CP-8** | 40 cases | casesCompleted=51, nextPriority set to case #42 | Report progress |
| **CP-9** | 45 cases | casesCompleted=56→52 (capped), all done | Prepare exit |
| **CP-10** | 52 cases (final) | casesCompleted=52, phase → closed, jira → DONE | Final transition |

### 3.2 Between Checkpoints

- QA Agent authors cases continuously per priority order
- SM-Agent monitors progress and updates STATUS.json after each case completion
- If a case has `code-verified` reason class, Dev-Agent is invoked before STATUS.json update
- If a case has `covered-by-suite` or `live-covered`, substitute evidence is referenced from SA4E-380 TEST-REPORT §4

---

## 4. Blockers/Risks Assessment

| # | Blocker/Risk | Likelihood | Impact | Mitigation |
|---|-------------|------------|--------|------------|
| **R1** | **Scope item UT-05** — empty `CONTENT_PROXY_OVERRIDES` table | Low | Delay if feature not activated | Document as "author when feature activated"; no immediate action |
| **R2** | **Code-verified UT-39/UT-40** — literals from Phase 5.7 audit | Medium | Dev-Agent must verify code guards are correct before case authoring | Invoke Dev-Agent early for UT-39/UT-40; fix `output-proxy.ts` if needed |
| **R3** | **Covered-by-suite** — 14 cases have substitute evidence | Medium | Must correctly reference SA4E-380 TEST-REPORT §4 evidence; risk of missing traceability | QA Agent cross-references each case with §4 entries; embed evidence links |
| **R4** | **Live-covered** — 5 cases have live observations but missing assertions | Medium | Must capture fresh evidence from current build; risk of stale data | Verify evidence captures from running build (freshness check per UG policy) |
| **R5** | **PBT harness not authored** — 6 PBT cases need `fast-check` setup | High | Requires backend workspace setup; may block if environment not ready | Ensure backend workspace available; PBT cases can run without server (local only) |
| **R6** | **SIT-08..10 manual staging** — 3 cases require live environment | Medium | Dependent on staged environment availability; may extend timeline | Schedule SIT cases last (per priority order); document as manual |
| **R7** | **Evidence capture** — each case needs `evidence/` file | High | Risk of incomplete evidence if not systematically captured | Use checklist: each case must have `Evidence (to capture)` section populated |
| **R8** | **Priority ordering conflict** — user may reprioritize | Low | SM-Agent should follow §9.2 order unless user interrupts | Communicate priority basis to user if reordering requested |

### 4.1 Risk Summary

- **Critical Risks:** R2 (code-verified), R5 (PBT environment), R7 (evidence capture)
- **Medium Risks:** R3 (covered-by-suite), R4 (live-covered), R6 (SIT staging)
- **Low Risks:** R1 (scope), R8 (priority conflict)

---

## 5. Exit Criteria

### 5.1 Completion Condition

All 52 test cases are **authored** with:
- ✅ Each case has complete spec (ID, priority, requirement, preconditions, test data, steps, expected result)
- ✅ Each case has `reason class` documented
- ✅ Substitute evidence referenced from SA4E-380 TEST-REPORT §4 where applicable
- ✅ Evidence capture section populated (or noted as "pending — will capture at execution")
- ✅ All draw.io diagrams (if applicable) embedded with PNG export

### 5.2 STATUS.json Final State

```json
{
  "ticket": "SA4E-384",
  "currentPhase": "closed",
  "jiraStatus": "Done",
  "phases": {
    "requirements": { "status": "completed", "file": "BRD.md", "version": "1.0" },
    "specification": { "status": "completed", "file": "FSD.md", "version": "1.0" },
    "design": { "status": "completed", "file": "TDD.md", "version": "1.0" },
    "test_planning": { "status": "completed", "file": "STP.md,STC.md", "version": "1.0" },
    "deferred_register": { "status": "completed", "file": "STC.md", "version": "2.0" },
    "implementation": { "status": "not_started", "file": null, "version": null },
    "user_guide": { "status": "not_started", "file": null, "version": null },
    "code_review": { "status": "not_started", "file": null, "version": null }
  },
  "feedbackLoop": { "iterations": 0, "maxIterations": 5, "status": "closed" },
  "lastUpdated": "<timestamp>",
  "autonomyLevel": "L3",
  "nextPriority": null,
  "casesCompleted": 52,
  "totalCases": 52
}
```

### 5.3 Post-Exit Actions

1. **SM-Agent** transitions Jira ticket SA4E-384 from `Backlog` → `Ready For Product` → `Done` (per workflow)
2. **STC.md** version updated from `1.0` → `2.0` with note: "All 52 deferred cases authored; automation follow-up complete"
3. **RUN-LOG.md** appends final entry: `"SA4E-384 deferred_register completed — 52/52 cases authored on <date>"`
4. **Knowledge Base**: `mem_ingest` the final STC.md and all evidence files into KB for future reference
5. **Release**: If this is part of a release cycle, tag the commit and bump version per release-versioning skill

### 5.4 premature termination guard

- If fewer than 40 cases remain and all are `covered-by-suite`/`live-covered`/`scope` only → SM reports to user: "All remaining cases are substitution-only; consider closing with documentation-only deliverable"
- If feedback loop reaches 5 iterations without resolution → SM reports blocker and pauses pipeline

---