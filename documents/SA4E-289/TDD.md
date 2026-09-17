# TDD – Epic SA4E-289

## Module
extension/src/pi-workflow/

- pi-workflow.ts: PiWorkflowEngine orchestrator
- state-adapter.ts: toPiState / fromPiState với round-trip
- approval-adapter.ts: normalizeId, extensionToPiId
- checkpointer-adapter.ts: save/load checkpoint
- phase-router.ts: nextPhase lowercase
- pi-agent-executor.ts: gọi Pi SDK
- pi-provider.ts: transport WebSocket/HTTP

## Test
- Unit tests 56 passed
- Integration tests 6 passed
- Lint passed_with_warnings, typecheck passed
