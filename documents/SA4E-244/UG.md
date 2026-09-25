# User Guide — SA4E-244 Admin Project Scope Dropdown Name Display

## Overview
The Admin Project Scope dropdown at `localhost:48721/admin` now displays human-readable workspace/project names as the primary label instead of raw IDs. Identifier visibility is preserved via tooltip for verification.

## Changes Made

### Frontend
- **File:** `backend/src/viewer/admin/index.html` — `WorkspaceSelector` component
- **Behavior:**
  - Option label now uses `display_name` if present and non-empty.
  - Fallback chain: `display_name` → basename of `workspace_path` → first 10 chars of `project_id`.
  - Tooltip (`title`) shows `project_id` and `workspace_path` for quick verification.
  - `'All (Shared)'` option unchanged.
  - Selection value remains `project_id` to preserve filtering logic.

### Backend
- **File:** `backend/src/server/routes/admin/index.ts` — `GET /api/admin/projects`
- **Behavior:**
  - Returns `project_id`, `display_name`, `workspace_path`, `last_seen` from `project_registry`.
  - Logs `WARN` when >10% of returned projects have missing/empty `display_name`.
  - Logs `WARN` on DB query failure and returns empty list gracefully.

## Usage

1. Open `http://localhost:48721/admin` and log in.
2. In the left sidebar under **🗂 Project Scope**, the dropdown options now show names like `Pega Workspace Alpha` instead of `3e268111b055`.
3. Hover over an option to see tooltip with `project_id - workspace_path`.
4. If a project lacks a name, the dropdown falls back to the workspace folder name, then to ID slice.

## Configuration
No configuration changes required. Optional future feature flag `ADMIN_PROJECT_SCOPE_SHOW_ID` can enable `Name (ID)` suffix display.

## Troubleshooting
- **Names still showing IDs:** Check `project_registry.display_name` is populated by indexer. Empty names trigger WARN logs.
- **Dropdown empty:** Verify JWT token valid and user has access to projects. API returns 401/403 if auth fails.
- **Performance:** Query limited to 100 rows ordered by `last_seen DESC`. p95 target <100ms.

## Acceptance Criteria Met
- Dropdown displays workspace/project names as primary text.
- Existing options replaced with name-based labels where names exist.
- Selection behavior unchanged.
- Fallback to ID when name missing.
- Identifier visible via tooltip for verification.
