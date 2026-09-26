# SA4E-331 Hotfix Report — Memory Engine Project Isolation

## Issue
Memory Engine project isolation bypass: `mem_get` leaks PROJECT scoped entries, `mem_search` fails to find them.

## Root Cause
- IsolationLayer.buildReadFilter did not apply project_id for scope PROJECT.
- mem_get dispatcher did not enforce project context validation.
- mem_search allowed missing project context to pass through.

## Changes
- backend/src/modules/memory/IsolationLayer.ts: Added project_id filter for PROJECT scope, fail closed validation.
- backend/src/modules/memory/dispatchers/crud.ts: Enforce projectId check in mem_get, return 403 on missing context.
- backend/src/modules/memory/dispatchers/search.ts: Fail closed when projectId missing.

## Tests
- IsolationLayer.test.ts + ProjectIsolation.test.ts: 61 tests passed
- SA4E-331-CrossProjectIsolation.test.ts: 6 tests passed

## Verification
- mem_search(query="kiro") returns entry 616140
- mem_get respects project isolation

## KB Entries
- Error pattern: 616220
- Procedure entry: 616140

## Status
Hotfix applied in dev mode, ready for Jira update.
