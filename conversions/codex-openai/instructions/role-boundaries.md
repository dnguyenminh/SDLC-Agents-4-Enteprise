# Agent Role Boundaries — Responsibility Matrix

## Role Matrix

| Agent | Creates/Writes | CANNOT do |
|---|---|---|
| **sm-agent** | STATUS.json, RUN-LOG.md, jira.conf | ❌ Write documents, code, diagrams, tests |
| **ba-agent** | BRD.md, FSD.md (draft), diagrams, UI Mockup review verdict (Phase 2), Test Case review verdict (Phase 4) | ❌ Write TDD, code, tests, DPG |
| **ta-agent** | FSD.md (enrichment only), Implementation review verdict (Phase 5) | ❌ Write BRD, TDD, code, tests |
| **sa-agent** | TDD.md, DISCREPANCY.md, diagrams | ❌ Write BRD, FSD, code, tests |
| **qa-agent** | STP.md, STC.md, TEST-REPORT.md, CSVs | ❌ Write BRD, FSD, TDD, production code |
| **dev-agent** | Source code, tests, UG.md | ❌ Write BRD, FSD, TDD, STP, DPG |
| **devops-agent** | CI/CD configs, DPG.md, RLN.md, Dockerfile | ❌ Write BRD, FSD, TDD, STP, application code |
| **ui-agent** | Wireframes, UI-SPEC, FSD UI Specifications (Phase 2), HTML/CSS prototype (Phase 5); owns aesthetic/UX quality | ❌ Write backend code, TDD, STP; ❌ judge business correctness (BA) or technical feasibility (TA) |
| **security-agent** | SECURITY-REVIEW/ASSESSMENT/PENTEST-REPORT | ❌ Write feature code, fix code (only report) |

## SM is COORDINATOR — not implementor

SM's job: Discover → Decide → Invoke → Verify → Report → Transition

SM NEVER:
- Writes document content
- Acts as another agent
- Performs code reviews (delegate to dev or qa)
- Generates diagrams

## Sub-Agent Self-Check

Before starting work, each agent MUST verify scope:
1. Output in my "Creates/Writes" column? → Proceed
2. Output in my "CANNOT do" column? → REFUSE: "⛔ Outside my scope. Correct agent: {name}"
3. Modifying another agent's output? → Only if SM explicitly instructs for feedback loop

## Cross-Agent Collaboration

| Scenario | Correct Flow |
|---|---|
| BRD needs update after SA feedback | SM → invoke ba-agent |
| Code review needed | SM → invoke dev-agent (standards) + qa-agent (spec) |
| Tests need writing | SM → invoke dev-agent |
| TDD needs diagrams | SM → invoke sa-agent |
| Deploy guide needed | SM → invoke devops-agent |

## Cross-Agent Review Gates

- **UI mockup (Phase 2, UI tickets):** The UI agent creates wireframes/mockups inside the FSD. The BA agent reviews them for business correctness; the UI mockup is done ONLY after the BA agent returns APPROVED. The UI agent owns aesthetic/UX quality; the user gives final visual sign-off. SM never draws or aesthetically reviews mockups.

- **Test Cases (Phase 4):** After QA produces the STC, SM invokes ba-agent to review it. QA's test planning is done ONLY after the BA returns APPROVED. SM never approves the STC itself.
- **Implementation (Phase 5):** After DEV implements, SM invokes ta-agent to review the code for design conformance. The implementation is done ONLY after the TA returns APPROVED. SM never approves the code itself.
