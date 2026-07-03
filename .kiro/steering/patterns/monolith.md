# Pattern: Monolith (Default)

## Description

Traditional monolithic application — single deployable unit, single codebase, standard layered architecture.

## Signals

- Single build file (build.gradle.kts, pom.xml, package.json)
- Single `src/` directory
- No service separation (no docker-compose with multiple services)
- Standard MVC/layered architecture

## Pipeline Adjustments

### BRD Emphasis
- Standard business requirements
- User stories with acceptance criteria
- No special emphasis needed

### FSD Extra Considerations
- Standard use case documentation
- API contracts for REST/GraphQL endpoints
- Database schema design
- Standard sequence diagrams

### TDD Focus
- Layered architecture (Controller → Service → Repository)
- Database migration strategy
- API versioning
- Standard design patterns (Factory, Strategy, Observer)

### Testing Priorities
- Unit tests for business logic
- Integration tests with real DB (Testcontainers)
- E2E API tests
- Standard test pyramid

### Deployment Considerations
- Single artifact deployment (JAR, WAR, Docker image)
- Database migration before deploy
- Standard blue-green or rolling deployment
- Health check endpoints

## Quality Criteria Adjustments

| Standard Criteria | Monolith Adjustment |
|-------------------|-------------------|
| Code coverage | Standard (≥80% for business logic) |
| API contracts | OpenAPI/Swagger spec |
| Performance | Response time SLAs |
| Security | OWASP top 10 |
| Documentation | Standard UG + API docs |

## This is the DEFAULT pattern

If pattern detection fails or scores are too low, this pattern is used as fallback.
