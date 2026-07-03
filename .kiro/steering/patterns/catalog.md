# Pattern Catalog — Architecture Pattern Detection

## Purpose

Detect project architecture pattern to adjust SM pipeline behavior (emphasis, diagrams, testing focus).

## Detection Rules

| Pattern ID | Signals | Weight |
|-----------|---------|--------|
| ai-agent | `.kiro/agents/*.md`, `.kiro/steering/*.md`, prompt files, tool definitions | 0.9 |
| microservice | multiple build files, docker-compose, `services/` or `apps/` dirs | 0.8 |
| monolith | single build file, single src dir, no service separation | 0.6 |
| library | no main entry, `src/main` exports, published to registry | 0.7 |
| cli-tool | main with arg parsing, no server, command handlers | 0.7 |
| data-pipeline | ETL patterns, schedulers, data transformations | 0.7 |
| plugin | extension points, hook system, plugin registry | 0.7 |

## Detection Algorithm

```
function detectPattern(projectRoot):
    scores = {}
    
    for pattern in catalog:
        score = 0
        for signal in pattern.signals:
            if signalPresent(projectRoot, signal):
                score += signal.weight
        scores[pattern.id] = score * pattern.weight
    
    detected = maxBy(scores, value)
    if detected.score < 0.3:
        return "monolith"  // default fallback
    return detected.id
```

## Pattern Storage

Detected pattern stored in STATUS.json:
```json
{
  "architecturePattern": "ai-agent",
  "patternDetectedAt": "2025-01-27T10:00:00Z"
}
```

## Pattern Adjustments

Each pattern has a dedicated file (e.g., `patterns/ai-agent.md`) that defines:
- BRD emphasis areas
- FSD extra diagrams
- TDD focus areas
- Testing priorities
- Deployment considerations

## Available Patterns

- `ai-agent.md` — AI agent systems (prompt engineering, context management)
- `microservice.md` — Distributed multi-service systems (API contracts, service mesh)
- `library.md` — Reusable packages/SDKs (API surface, versioning, backward compat)
- `cli-tool.md` — Command-line applications (arg parsing, output formats, exit codes)
- `data-pipeline.md` — ETL/ELT systems (data flow, schema evolution, idempotency)
- `plugin.md` — Extensions for host systems (lifecycle, sandbox, compatibility)
- `monolith.md` — Traditional monolithic applications (default)

## Fallback

If pattern detection fails → default to "monolith" pattern → log for debugging.
