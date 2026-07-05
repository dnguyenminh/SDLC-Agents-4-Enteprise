---
paths:
  - "documents/**"
  - "**/*.drawio"
---

# Draw.io Diagram Requirements

- Use draw.io for ALL diagrams (NO Mermaid)
- Store at `documents/{TICKET}/diagrams/`
- Each diagram: `.drawio` (source) + `.png` (rendered)
- Export: `draw.io.exe -x -f png -b 10 -o output.png input.drawio`

## Minimum Diagrams Per Document

| Document | Required |
|----------|----------|
| BRD | business-flow.drawio + use-case.drawio |
| FSD | system-context.drawio + sequence-*.drawio + state-*.drawio |
| TDD | architecture.drawio + component.drawio + class-*.drawio |
| STP | test-coverage.drawio + test-execution-flow.drawio |
| DPG | deployment-flow.drawio + rollback-flow.drawio |

## XML Rules
- No self-closing edge cells (edge="1" must have mxGeometry child)
- No mxfile wrapper — start with mxGraphModel
- Embed in markdown: `![Name](diagrams/name.png)`

## Diagram Index (MANDATORY in every document appendix)

Every document with diagrams MUST have a Diagram Index table with columns: #, Diagram, Image link, Source link.
