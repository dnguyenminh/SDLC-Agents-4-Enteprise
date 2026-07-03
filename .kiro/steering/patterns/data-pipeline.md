# Pattern: Data Pipeline

## Description

ETL/ELT system that extracts, transforms, and loads data between sources. Batch or streaming, scheduled or event-driven.

## Signals

- ETL/ELT patterns (extract, transform, load functions)
- Scheduler configs (cron, Airflow DAGs, Prefect flows)
- Data source connections (JDBC, S3, API connectors)
- Schema definitions (Avro, Protobuf, JSON Schema)
- Data quality/validation rules
- Partitioning/bucketing logic

## Pipeline Adjustments

### BRD Emphasis
- Data source and sink specifications
- Data freshness requirements (SLA)
- Volume estimates (rows/day, GB/day)
- Data quality rules and thresholds
- Retry and recovery requirements
- Compliance (GDPR, data retention)

### FSD Extra Considerations
- Data flow diagrams (source → transform → sink)
- Schema evolution strategy
- Partitioning and windowing logic
- Error handling per stage (dead letter queue)
- Idempotency guarantees
- Backfill/replay procedures
- Monitoring and alerting specs

### TDD Focus
- DAG/workflow orchestration design
- Schema registry integration
- Exactly-once vs at-least-once semantics
- Checkpoint and state management
- Resource scaling (parallelism, memory)
- Data validation framework

### Testing Priorities
- Data quality assertions (Great Expectations style)
- Schema compatibility tests
- Idempotency verification (run twice = same result)
- Edge cases (null, malformed, late-arriving data)
- Performance tests with realistic data volumes
- Recovery tests (kill mid-pipeline, resume)

### Deployment Considerations
- Scheduler deployment (Airflow, cron, cloud scheduler)
- Schema registry updates (backward compatible)
- Blue-green for streaming pipelines
- Backfill strategy after schema changes
- Monitoring dashboards (lag, throughput, errors)
- Data lineage tracking

## Quality Criteria Adjustments

| Standard Criteria | Data Pipeline Adjustment |
|-------------------|--------------------------|
| Code coverage | + Data quality test coverage |
| API contracts | Schema compatibility verified |
| Performance | Throughput SLA + latency SLA |
| Security | Data encryption at rest/transit + access control |
| Documentation | Data dictionary + lineage + runbook |
