# Pattern: AI Agent System

## Description

Projects that are AI agent systems — prompt-driven, tool-using, context-managed architectures.

## Signals

- `.kiro/agents/*.md` files exist
- `.kiro/steering/*.md` files exist
- Prompt/template files with agent instructions
- Tool definitions (MCP, function calling)
- Context window management logic
- Knowledge base integration

## Pipeline Adjustments

### BRD Emphasis
- Prompt engineering requirements
- Context budget constraints
- Tool interaction specifications
- Agent coordination patterns
- Failure modes and fallback behaviors

### FSD Extra Considerations
- Context flow diagrams (what context loads when)
- Tool interaction sequence diagrams
- Agent-to-agent communication specs
- Token budget analysis per operation
- Progressive disclosure patterns

### TDD Focus
- Token optimization strategies
- Prompt versioning and migration
- Context assembly algorithms
- Steering file architecture
- Agent isolation and single responsibility

### Testing Priorities
- Prompt regression testing
- Context budget verification (measure tokens before/after)
- Tool discovery reliability
- Agent coordination integration tests
- Fallback behavior when tools unavailable

### Deployment Considerations
- Prompt file versioning (steering files are code)
- KB data migration
- Agent config updates
- Backward compatibility of prompt changes
- Rollback = restore previous steering files

## Quality Criteria Adjustments

| Standard Criteria | AI Agent Adjustment |
|-------------------|-------------------|
| Code coverage | + Prompt coverage (all paths exercised) |
| API contracts | + Tool schemas validated |
| Performance | + Token efficiency measured |
| Security | + Prompt injection resistance |
| Documentation | + Steering file documentation |
