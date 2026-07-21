# SA4E-46: KB Graph Dashboard — Fix KB/Code node count display

## Summary
KB Graph page header shows "7,170 nodes (0 KB + 0 Code)" — graph renders correctly but KB entry count and Code symbol count both show 0.

## Root Cause (suspected)
`/api/admin/stats` endpoint counts KB entries via `getKbEntryCount(projectId)` and code symbols via `getIndexAdapter().get("SELECT COUNT(*) FROM symbols WHERE project_id = ?")`. The `projectId` filter may not match stored entries (entries may have NULL or different project_id).

## Steps to Reproduce
1. Start server (SQLite or PostgreSQL active)
2. Navigate to Admin → KB Graph
3. Observe header: "X nodes (0 KB + 0 Code)"
4. Graph clusters visible but counts wrong

## Acceptance Criteria
- [ ] KB entry count matches actual entries in database
- [ ] Code symbol count matches indexed symbols
- [ ] Counts update correctly after DB switch (SQLite ↔ PostgreSQL)
- [ ] projectId filter works correctly or falls back to unfiltered count

## Technical Notes
- Check `buildAdminScopeFilter()` logic — may be too restrictive
- Check if `project_id` column has matching values between graph_nodes and knowledge_entries
- May need to count ALL entries when no specific project filter (admin view = global)

## Priority
Medium — cosmetic (graph renders correctly, only counts wrong)
