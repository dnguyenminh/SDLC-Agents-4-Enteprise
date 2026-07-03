# Pattern: Plugin / Extension

## Description

Extension module for an existing host system. Operates within host constraints, lifecycle hooks, and extension points.

## Signals

- Host system reference (IDE plugin, browser extension, CMS module)
- Extension point implementations (interfaces, hooks, events)
- Plugin manifest/descriptor file (plugin.xml, manifest.json, package.json with "contributes")
- Lifecycle callbacks (activate, deactivate, install, uninstall)
- Host API usage (restricted API surface)
- Sandboxed execution context

## Pipeline Adjustments

### BRD Emphasis
- Host system constraints and limitations
- Extension point specifications
- User interaction within host UI
- Permissions and capabilities required
- Compatibility matrix (host versions supported)

### FSD Extra Considerations
- Plugin lifecycle diagrams (install → activate → run → deactivate)
- Host API interaction sequences
- Extension point hook diagrams
- Settings/configuration UI specs
- Permission model and security sandbox
- Conflict resolution with other plugins

### TDD Focus
- Plugin architecture (entry point, services, commands)
- Host API abstraction layer
- State management within plugin lifecycle
- Communication with host (events, commands, API calls)
- Graceful degradation when host API changes
- Version compatibility strategy

### Testing Priorities
- Integration tests with host system (or mock host)
- Lifecycle tests (install, activate, deactivate, uninstall)
- Compatibility tests across host versions
- Conflict tests with common plugins
- Performance impact on host (startup time, memory)
- Sandbox/permission boundary tests

### Deployment Considerations
- Marketplace/registry publishing
- Version compatibility declaration
- Auto-update mechanism
- Migration between plugin versions
- Host version minimum requirement
- Review/approval process (marketplace review)

## Quality Criteria Adjustments

| Standard Criteria | Plugin Adjustment |
|-------------------|-------------------|
| Code coverage | + Lifecycle paths fully tested |
| API contracts | Host API version compatibility verified |
| Performance | Startup impact < 100ms, memory < 50MB |
| Security | Sandbox compliance, minimal permissions |
| Documentation | README + marketplace listing + changelog |
