# Diagram Index — SA4E-360

Generated: 2026-10-15 · Format: draw.io (`.drawio` source + exported `.png`) · Embedded in: DPG.md (§5.1, §8.1)

## Deployment Documents (Phase 7)

| # | Diagram | Source | Export | Embedded In | Description |
|---|---------|--------|--------|-------------|-------------|
| 1 | Deployment Flow | [deployment-flow.drawio](deployment-flow.drawio) | [deployment-flow.png](deployment-flow.png) | DPG §5.1 | 6-lane pipeline: Pre-Deploy Gate → Build & Package → Extension Install → Post-Deploy Verification → GA Release (tag + README); green = automated, blue = manual, red = rollback path |
| 2 | Rollback Flow | [rollback-flow.drawio](rollback-flow.drawio) | [rollback-flow.png](rollback-flow.png) | DPG §8.1 | Decision tree: issue detected → severity assessment (Critical → immediate rollback / Minor → report + SM decision) → 5-step rollback → verification loop; red/orange scheme |

## Design & Test Diagrams (Phases 3–6, pre-existing)

| # | Diagram | Source | Export | Document |
|---|---------|--------|--------|----------|
| 3 | Use Case | use-case.drawio | use-case.png | BRD |
| 4 | System Context | system-context.drawio | system-context.png | FSD |
| 5 | Sequence (context supply) | sequence.drawio | sequence.png | FSD/TDD |
| 6 | State | state.drawio | state.png | FSD/TDD |
| 7 | ER Diagram | er-diagram.drawio | er-diagram.png | TDD |
| 8 | Sequence — read_method | sequence-read-method.drawio | sequence-read-method.png | TDD |
| 9 | Test Coverage | test-coverage.drawio | test-coverage.png | STP |
| 10 | Test Execution Flow | test-execution-flow.drawio | test-execution-flow.png | STP |

## Export Note

PNGs exported via draw.io CLI (`-x -f png -b 10`). XML validation: all cells balanced, every edge carries an `<mxGeometry>` child (render-safe).
