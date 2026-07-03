# Pattern: Microservice

## Description

Distributed system with multiple independently deployable services communicating via APIs, message queues, or events.

## Signals

- Multiple `build.gradle.kts` / `pom.xml` / `package.json` in subdirectories
- `docker-compose.yml` with multiple services
- `services/` or `apps/` directory structure
- API gateway configuration
- Service discovery config (Consul, Eureka)
- Message broker config (Kafka, RabbitMQ)

## Pipeline Adjustments

### BRD Emphasis
- Service boundary definitions
- Inter-service communication requirements
- Data ownership per service
- Eventual consistency requirements
- SLA per service

### FSD Extra Considerations
- Service interaction diagrams (who calls whom)
- API contracts between services (OpenAPI per service)
- Event/message schemas
- Saga patterns for distributed transactions
- Circuit breaker and retry policies
- Data consistency strategy (eventual vs strong)

### TDD Focus
- Service decomposition rationale
- API gateway routing design
- Shared library strategy
- Database-per-service schema
- Event-driven architecture patterns
- Service mesh / sidecar considerations

### Testing Priorities
- Contract tests (Pact/Spring Cloud Contract)
- Integration tests per service boundary
- End-to-end tests across service chain
- Chaos engineering scenarios
- Performance tests under load (per service)

### Deployment Considerations
- Independent service deployment (no big-bang)
- Service versioning strategy (API v1/v2)
- Database migration per service
- Blue-green per service or canary
- Health checks and readiness probes
- Distributed tracing (Jaeger, Zipkin)

## Quality Criteria Adjustments

| Standard Criteria | Microservice Adjustment |
|-------------------|------------------------|
| Code coverage | Per-service coverage ≥80% |
| API contracts | Contract tests between all service pairs |
| Performance | Latency SLA per service + end-to-end |
| Security | Service-to-service auth (mTLS/JWT) |
| Documentation | API docs per service + architecture overview |
