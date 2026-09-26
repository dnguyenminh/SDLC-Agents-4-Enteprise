# Business Requirements Document (BRD)

## System — SA4E-327: Pi Task Decomposition + Map-Reduce for large repo queries

Ticket SA4E-327

Scope: Batch GLOBAL/STRUCTURAL queries into batches of 20 files, summarize each batch with small model, synthesize results, use query-router intent, limit parallelism and timeout, deduplicate.

User Stories: Query decomposition, Map-Reduce summarization, Synthesis.

Acceptance Criteria: Global query on large repo no OOM, map-reduce quality comparable to 1-shot large model.

Diagrams: use-case.png, business-flow.png

