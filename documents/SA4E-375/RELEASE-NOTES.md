# Release Notes — SA4E-375

## Ticket
SA4E-375 — PROJECT_NOT_REGISTERED khi index vào KB

## Release Date
2026-10-19

## Version
v1.15.0-sa4e-375

## Summary
Finalization release for SA4E-375. All SDLC phases completed: requirements, specification, design, feedback_loop, test_planning, implementation, testing, user_guide, deployment.

## Changes

### Core Fixes
- **Deterministic projectId**: projectId generated deterministically from workspace identifier using SHA-256, persisted in `.code-intel/project.json`
- **Auto-upsert ensureProjectRegistered**: ensureProjectRegistered chuyển từ fail-fast sang auto-upsert, tạo project record nếu chưa tồn tại
- **Auto-register MCP**: auto-register project cho tất cả entry points MCP tool calls, đảm bảo consistency
- **IndexerHttpClient retry safe**: IndexerHttpClientChain triển khai retry logic an toàn, có maybeAutoRegister trước khi gửi request

### Technical Details
- Backend code-intel: Project Registry Service auto-upsert
- VSCode Extension: project-id.ts stable derivation
- MCP auto-register helper integrated
- No schema change to project_registry DB

## Documents
- BRD.md v1
- FSD.md v1
- TDD.md v2
- STP.md v1
- STC.md v1
- TEST-REPORT.md v1 — 30/30 tests PASS
- UG.md v1
- DPG.md v1.0
- RLN.md v1.0

## Deployment
Deployment Guide DPG.md đã sẵn sàng cho DEV → SIT → UAT → PROD
Release Notes RLN.md đã cập nhật

## Sign-off
- Dev Lead: ☐
- QA Lead: ☐
- Ops Lead: ☐

## Known Issues
None critical. Minor cache projectId cũ có thể xảy ra → restart extension.
