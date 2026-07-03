# Pattern: Library / SDK

## Description

Reusable package published to a registry (Maven, npm, PyPI). No standalone runtime — consumed by other projects.

## Signals

- No `main` entry point or server startup
- `src/main` exports public API
- Version in build file follows semver
- Publishing config (Maven Central, npm publish, PyPI setup)
- README with installation/usage instructions
- No docker-compose or deployment configs

## Pipeline Adjustments

### BRD Emphasis
- Public API surface requirements
- Backward compatibility constraints
- Target consumers and use cases
- Versioning strategy (semver)
- Deprecation policy

### FSD Extra Considerations
- API surface diagram (public classes/functions)
- Usage examples per major feature
- Migration guide between versions
- Error handling contract (what exceptions/errors consumers see)
- Thread safety / concurrency guarantees

### TDD Focus
- API design (fluent, builder, functional)
- Extension points (plugins, hooks, callbacks)
- Dependency minimization (small dependency tree)
- Binary compatibility analysis
- Performance characteristics documentation

### Testing Priorities
- API compatibility tests (binary/source)
- Usage scenario tests (consumer perspective)
- Performance benchmarks (regression detection)
- Edge case coverage (null, empty, overflow)
- Multi-version JDK/Node/Python compatibility

### Deployment Considerations
- Publish to registry (not deploy to server)
- Changelog generation (conventional commits)
- Semantic versioning enforcement
- Release notes with migration guide
- Snapshot/RC releases for pre-validation

## Quality Criteria Adjustments

| Standard Criteria | Library Adjustment |
|-------------------|-------------------|
| Code coverage | ≥90% (public API must be fully tested) |
| API contracts | Backward compat verified per release |
| Performance | Benchmark suite with regression detection |
| Security | Dependency audit (no vulnerable transitive deps) |
| Documentation | Javadoc/TSDoc + usage examples + migration guide |
