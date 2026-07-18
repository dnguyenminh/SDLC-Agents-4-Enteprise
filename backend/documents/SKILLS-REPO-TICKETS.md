# Jira Tickets — Skills Repo Integration (mattpocock/skills)

> Source: mattpocock/skills repo (161k stars)
> Project: SA4E
> Created: 2025-07-09

---

## Ticket 1: SA4E-25 (to be created)

**Type:** Story
**Summary:** Domain Glossary via KB — BA extracts terms, all agents consume
**Priority:** High
**Labels:** steering, knowledge-base, process-improvement

### Acceptance Criteria
- [x] BA agent Phase 1 has step to extract ≥5 domain terms from BRD
- [x] Glossary entries ingested to KB with schema: type=CONTEXT, source=glossary/{PROJECT}
- [x] Content format: `GLOSSARY | term={Term} | definition={Def} | avoid={bad alternatives}`
- [x] SM verify: `mem_search("glossary {PROJECT}")` returns ≥5 entries after Phase 1
- [x] Steering file `phase-1-requirements.md` updated with Step 7.5

### Status: ✅ IMPLEMENTED

---

## Ticket 2: SA4E-26 (to be created)

**Type:** Story
**Summary:** Two-Axis Code Review — Standards + Spec compliance before QA
**Priority:** High
**Labels:** steering, code-review, quality-gate

### Acceptance Criteria
- [x] Phase 6 has Step 6b (Two-Axis Code Review) BEFORE QA test execution
- [x] Axis 1 (Standards): DEV agent reviews code vs code-standards.md + Fowler smells
- [x] Axis 2 (Spec): QA agent reviews code vs TDD/FSD requirements
- [x] Both axes run in PARALLEL
- [x] Clear verdict: PASS / PASS with warnings / FAIL
- [x] FAIL → send back to DEV (max 2 iterations)
- [x] Steering file `phase-6-testing.md` updated

### Status: ✅ IMPLEMENTED

---

## Ticket 3: SA4E-27 (to be created)

**Type:** Story
**Summary:** Bug Diagnosis Loop — structured 6-phase process for DEV bug fixes
**Priority:** Medium
**Labels:** steering, dev-agent, bug-fix, process-improvement

### Acceptance Criteria
- [x] New steering file: `.kiro/steering/dev-bug-diagnosis.md`
- [x] 6 phases with exit criteria
- [x] Core rule: no fix without reproduction test
- [x] Escalation paths defined
- [x] Anti-patterns table
- [x] SM pipeline integration documented
- [x] DEV agent references bug diagnosis steering file
- [x] Bug Fix Report format defined

### Status: ✅ IMPLEMENTED
