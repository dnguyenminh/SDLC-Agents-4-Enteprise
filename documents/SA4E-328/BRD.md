# Business Requirements Document (BRD)

## System — SA4E-328: Pi Verification loop + Hallucination grader for small models

Ticket SA4E-328

Scope: Migrate retrieve-eval + hallucination-grader to Pi Extension after execute_tools. Small model skip verify unreliable, use direct routing + external grader; large keep verify. Return faithfulness score + retry when low.

User Stories: Hallucination grading, Verification loop, Faithfulness metric.

Acceptance Criteria: Wrong fact answers caught + retry, faithfulness metric on golden set.

Diagrams: use-case.png, business-flow.png
