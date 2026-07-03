# Shared: Draw.io Diagram Requirements

## Rules

- **KHÔNG dùng Mermaid** — dùng draw.io cho TẤT CẢ diagrams
- All diagrams stored at `documents/{TICKET}/diagrams/`
- Each diagram has both `.drawio` (source) and `.png` (rendered)
- PNG exported via draw.io CLI

## Export Command

```powershell
& "C:\Program Files\draw.io\draw.io.exe" -x -f png -b 10 -o "documents/{TICKET}/diagrams/{name}.png" "documents/{TICKET}/diagrams/{name}.drawio"
```

## Minimum Diagrams Per Document

| Document | Required Diagrams |
|----------|------------------|
| BRD | business-flow.drawio + use-case.drawio |
| FSD | system-context.drawio + sequence-*.drawio + state-*.drawio |
| TDD | architecture.drawio + component.drawio + class-*.drawio |
| STP | test-coverage.drawio + test-execution-flow.drawio |
| DPG | deployment-flow.drawio + rollback-flow.drawio |

## Embedding in Markdown

```markdown
![Business Flow](diagrams/business-flow.png)
```

## Diagram Index (MANDATORY in Appendix)

Every document with diagrams MUST have:

```markdown
### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | {Diagram Name} | [{name}.png](diagrams/{name}.png) | [{name}.drawio](diagrams/{name}.drawio) |
```

## XML Validation Rules

1. **No self-closing edge cells**: edge="1" must NOT be followed by /> on same line without <mxGeometry>
2. **No <mxfile> wrapper**: file must start with `<mxGraphModel>`, NOT `<mxfile>`
3. If validation fails → re-invoke agent to fix before PNG export

## Agent Prompt Template

When invoking any agent that creates documents with diagrams, ALWAYS include:
```
"PHẢI tạo draw.io diagrams và export PNG. Không được bỏ qua diagram generation step."
contextFiles: [{ "path": ".kiro/steering/drawio.md" }]
```

## KB Ingestion

All `.drawio` files MUST be ingested into KB:
- Ingest FULL XML content
- Tags: `drawio, diagram, {diagram-type}`
- This allows AI agents to read diagram structure from KB
