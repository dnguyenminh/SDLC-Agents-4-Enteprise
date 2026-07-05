# Jira Workflow — Project SA4E (SDLC Agents 4 Enterprise)

## Project Info

| Property | Value |
|----------|-------|
| Project Key | SA4E |
| Project Name | SDLC Agents 4 Enterprise |
| Project ID | 10332 |
| Project Type | Software (next-gen / team-managed) |
| Board | SA4E board (ID: 300, type: simple) |
| Sprint | SA4E Sprint 1 (state: future, ID: 136) |
| Jira Instance | https://jiraassist.atlassian.net |

## Issue Types

| Issue Type | Available | Notes |
|-----------|-----------|-------|
| Story | ✅ | Standard user story |
| Bug | ✅ | Defect tracking |
| Task | ✅ | General task |
| Epic | ✅ | Large feature grouping |

**Tất cả issue types dùng CÙNG workflow** (simplified next-gen project).

## Statuses

| Status | ID | Category | Category ID | Color |
|--------|-----|----------|-------------|-------|
| To Do | 10372 | To Do | 2 | blue-gray |
| In Progress | 10373 | In Progress | 4 | yellow |
| In Review | 10374 | In Progress | 4 | yellow |
| Done | 10375 | Done | 3 | green |

## Transitions

**⚠️ QUAN TRỌNG: Project SA4E dùng simplified workflow — TẤT CẢ transitions đều GLOBAL.**
Nghĩa là: từ BẤT KỲ status nào đều có thể chuyển sang BẤT KỲ status nào khác.

| Transition ID | Transition Name | Target Status | Available From |
|---------------|----------------|---------------|----------------|
| 11 | To Do | To Do | Any status |
| 21 | In Progress | In Progress | Any status |
| 31 | In Review | In Review | Any status |
| 41 | Done | Done | Any status |

### Transition Properties

- `hasScreen`: false (tất cả) — không có screen/form khi transition
- `isGlobal`: true (tất cả) — accessible từ mọi status
- `isConditional`: false (tất cả) — không có conditions
- `isLooped`: false (tất cả)

## State Diagram

```
┌─────────┐     ┌──────────────┐     ┌───────────┐     ┌──────┐
│  To Do  │ ──► │ In Progress  │ ──► │ In Review │ ──► │ Done │
└─────────┘     └──────────────┘     └───────────┘     └──────┘
     ▲                 ▲                    ▲              ▲
     │                 │                    │              │
     └─────────────────┴────────────────────┴──────────────┘
                    (All transitions are global)
```

## SM Pipeline Mapping — SDLC Phases to Jira Statuses

| SDLC Phase | Jira Status | Transition to Use | Notes |
|-----------|-------------|-------------------|-------|
| Phase 1-4 (Docs: BRD, FSD, TDD, STP) | To Do → In Progress | Transition ID: 21, Name: "In Progress" | SM transitions khi bắt đầu tạo docs |
| Phase 5 (Implementation) | In Progress | (already there) | DEV codes trên branch |
| Phase 5 → Phase 6 (Code complete) | In Progress → In Review | Transition ID: 31, Name: "In Review" | DEV push code, SM transitions |
| Phase 6 (Testing pass) | In Review → Done | Transition ID: 41, Name: "Done" | QA pass, SM transitions |
| Bug found | Any → In Progress | Transition ID: 21, Name: "In Progress" | Reopen for fix |

### ⚠️ Khác biệt so với KSA/SCRUM Workflow

Project SA4E **KHÔNG CÓ** các status sau (khác với projects trước):
- ❌ Docs Review (không có)
- ❌ QA Test (không có)
- ❌ UAT (không có)
- ❌ Ready For Product (không có)

**SM cần adapt pipeline:**

| SM System Prompt Transition | SA4E Actual Transition |
|----------------------------|----------------------|
| TO DO → DOCS REVIEW ("Review Docs") | TO DO → IN PROGRESS (ID: 21) |
| DOCS REVIEW → IN PROGRESS ("Implement") | N/A — already In Progress |
| IN PROGRESS → IN REVIEW ("Review code") | IN PROGRESS → IN REVIEW (ID: 31) |
| IN REVIEW → QA TEST ("Verify") | N/A — no QA Test status |
| QA TEST → UAT ("Start UAT") | N/A — no UAT status |
| UAT → READY FOR PRODUCT ("Deploy") | N/A — no Ready For Product |
| READY FOR PRODUCT → DONE ("Complete") | IN REVIEW → DONE (ID: 41) |

### Recommended SM Transition Strategy for SA4E

```
Phase 1 starts (BA creates BRD):
  → Transition TO DO → IN PROGRESS (ID: 21)
  
Phase 1-4 (all docs creation):
  → Keep IN PROGRESS
  
Phase 5 (DEV codes):
  → Keep IN PROGRESS
  
Phase 5 complete (code pushed):
  → Transition IN PROGRESS → IN REVIEW (ID: 31)
  
Phase 6 (QA testing):
  → Keep IN REVIEW
  
Phase 6 pass + UAT pass:
  → Transition IN REVIEW → DONE (ID: 41)
  
Bug found at any stage:
  → Transition * → IN PROGRESS (ID: 21)
```

## API Usage Examples

### Get issue
```
jira_get_issue(issue_key: "SA4E-1", fields: "summary,status,issuetype")
```

### Create issue
```
jira_create_issue(project_key: "SA4E", summary: "...", issue_type: "Story")
```

### Transition issue
```
jira_transition_issue(issue_key: "SA4E-1", transition_id: "21")  // To In Progress
jira_transition_issue(issue_key: "SA4E-1", transition_id: "31")  // To In Review
jira_transition_issue(issue_key: "SA4E-1", transition_id: "41")  // To Done
jira_transition_issue(issue_key: "SA4E-1", transition_id: "11")  // Back to To Do
```

### Search issues
```
⚠️ jira_search trả HTTP 410 cho project SA4E (có thể do team-managed project limitation)
→ Dùng jira_get_board_issues(board_id: "300", jql: "ORDER BY key ASC") thay thế
→ Hoặc jira_get_sprint_issues(sprint_id: "136") khi issues assigned to sprint
```

### Get transitions
```
jira_get_transitions(issue_key: "SA4E-1")
```

## Known Issues / Limitations

1. **jira_search trả 410**: Team-managed projects trên Jira Cloud có thể không support JQL search qua REST API v3 cũ. Workaround: dùng board-based queries.
2. **jira_get_project_issues trả 410**: Same issue — dùng board endpoints thay thế.
3. **Simplified workflow**: Không có workflow restrictions — bất kỳ ai cũng có thể transition bất kỳ lúc nào. SM cần enforce process via convention, không rely on Jira permissions.
4. **Board type**: Simple board (không phải Scrum board với sprints/velocity). Sprint SA4E Sprint 1 tồn tại nhưng ở trạng thái "future".

## Connection Details (cho SM agent runtime)

```
MCP Server: atlassian (http://localhost:3062/mcp)
Protocol: MCP httpStream (SSE)
Session: Requires initialize → notifications/initialized → tools/call sequence
Session header: mcp-session-id (returned in initialize response)
```
