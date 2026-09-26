# Business Requirements Document (BRD)

## SA4E-244 — Admin Project Scope dropdown shows IDs instead of workspace/project names

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-244 |
| Title | Admin Project Scope dropdown shows IDs instead of workspace/project names |
| Author | BA Agent |
| Version | 1.0 |
| Date | 2026-09-05 |
| Status | Draft |

---

## Author Tracking

| Role | Name - Position | Responsibility |
|------|-----------------|----------------|
| Author | BA Agent – Business Analyst | Create document |
| Peer Reviewer | TBD – TBD | Review document |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-05 | BA Agent | Initiate document — auto-generated from Jira ticket SA4E-244 |

---

## Sign-Off

| Name | Signature and date |
|------|--------------------|
| | ☐ I agree and confirm all criteria on this BRD as expected requirements |
| | ☐ I agree and confirm all criteria on this BRD as expected requirements |

---

## 1. Introduction

### 1.1 Scope

This change request addresses the usability issue on the backend admin page `localhost:48721/admin` where the Project Scope dropdown in the left sidebar currently displays project/workspace identifiers instead of human-readable names.

The objective is to improve admin usability by displaying the workspace/project name as the primary label in the Project Scope dropdown, with the identifier optionally shown as secondary information. This applies to all admin users accessing the Project Scope selector.

Source: Jira ticket SA4E-244 summary and description.

### 1.2 Out of Scope

- Changes to project/workspace creation, deletion, or management workflows.
- Modifications to backend data model or identifier generation.
- Changes to other dropdowns or selectors outside Project Scope in admin sidebar.
- Authorization or permission logic changes.
If not confirmed, out of scope items are to be confirmed with stakeholders.

### 1.3 Preliminary Requirement

- Access to admin UI codebase for `localhost:48721/admin` Project Scope component.
- Ability to retrieve workspace/project name mapping from existing data sources.
- No additional preliminary requirements identified from provided ticket details.

---

## 2. Business Requirements

### 2.1 High Level Process Map

Admin user navigates to backend admin page → left sidebar renders Project Scope dropdown → dropdown options are loaded from workspace/project data → user selects a scope to filter admin views.

Current behavior shows IDs like 'Pega: 3e268111b055', 'a68914cd9c49', '22b039993db3', 'All (Shared)'. Expected behavior is to display human-readable workspace/project name as primary label, with ID optionally as secondary.

### 2.2 List of User Stories / Use Cases

| # | Story / Use Case / Epic | Priority | Source Ticket |
|---|-------------------------|----------|---------------|
| 1 | As an admin user, I want the Project Scope dropdown to display workspace/project names instead of IDs so that I can easily identify and select the correct scope | MUST HAVE | SA4E-244 |
| 2 | As an admin user, I want the project identifier to be optionally visible for verification so that I can confirm the selected scope when names are ambiguous | SHOULD HAVE | SA4E-244 |

---

### 2.3 Details of User Stories

---

#### Business Flow

**Step 1:** Admin user opens `localhost:48721/admin`.

**Step 2:** Left sidebar renders Project Scope dropdown populated with available workspaces/projects.

**Step 3:** Dropdown displays each option with human-readable name as primary label.

**Step 4:** Identifier is displayed as secondary information if enabled.

**Step 5:** User selects a scope; admin views filter accordingly.

> **Note:** 'All (Shared)' option should remain unchanged and continue to display as is.

---

#### STORY 1: Project Scope dropdown displays human-readable names

> As an admin user, I want the Project Scope dropdown to display workspace/project names instead of IDs so that I can easily identify and select the correct scope

**Requirement Details:**

1. On backend admin page `localhost:48721/admin`, Project Scope dropdown in left sidebar must display workspace/project name as primary label instead of identifier.
2. Current behavior showing IDs like 'Pega: 3e268111b055', 'a68914cd9c49', '22b039993db3' must be replaced with readable names.
3. Display format should be consistent across all admin users and sessions.

**Data Fields (if applicable):**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| project_scope_id | string | Yes | Internal identifier for workspace/project | 3e268111b055 |
| project_scope_name | string | Yes | Human-readable workspace/project name | Pega Workspace Alpha |
| display_label | string | Yes | Composite label shown in dropdown | Pega Workspace Alpha (3e268111b055) |

**Acceptance Criteria:**

1. When admin opens `localhost:48721/admin`, Project Scope dropdown options show workspace/project names as primary text, not raw IDs.
2. Existing options 'Pega: 3e268111b055', 'a68914cd9c49', '22b039993db3', 'All (Shared)' are replaced with name-based labels where names exist.
3. Selection behavior remains unchanged — selecting an option continues to filter admin views correctly.
4. If a workspace/project name is missing/null, fallback to existing ID display to avoid blank options.

**UI Specifications (if applicable):**

| No. | Name | Type | Required | Description | Note |
|-----|------|------|----------|-------------|------|
| 1 | Project Scope Dropdown | Dropdown/Select | Yes | Left sidebar selector for workspace/project scope | Primary label = name, secondary = ID optional |
| 2 | Dropdown Option Label | Text | Yes | Display text for each option | Name first, ID in parentheses if shown |

**Validation Rules (if applicable):**

- Dropdown must load all available scopes on page load.
- Empty name should not cause UI error.

**Error Handling (if applicable):**

- If name lookup fails: display ID fallback and log warning.
- If dropdown data fails to load: show error message to user and retain previous selection if possible.

---

#### STORY 2: Optional identifier visibility for verification

> As an admin user, I want the project identifier to be optionally visible for verification so that I can confirm the selected scope when names are ambiguous

**Requirement Details:**

1. Identifier may be displayed as secondary text next to name for traceability.
2. Format suggestion: `Name (ID)` or tooltip on hover.

**Acceptance Criteria:**

1. Identifier is visible in a non-intrusive manner, e.g., in parentheses after name or as tooltip.
2. Users can still easily identify scope by name.

**UI Specifications (if applicable):**

| No. | Name | Type | Required | Description | Note |
|-----|------|------|----------|-------------|------|
| 1 | Option Secondary Label | Text | No | Identifier displayed alongside name | Optional, configurable |

---

## 3. Dependencies

| Dependency | Type | Related Ticket | Description |
|------------|------|----------------|-------------|
| Workspace/Project name data source | System | N/A | Backend must provide name mapping for IDs used in dropdown |
| Admin UI component | System | N/A | Project Scope dropdown component in admin sidebar |

---

## 4. Stakeholders

| Role | Name / Team | Responsibility | Source |
|------|-------------|----------------|--------|
| Reporter | TBD | Reported bug | Jira ticket SA4E-244 |
| Admin User | All Admin Users | End user of Project Scope dropdown | SA4E-244 description |
| BA Agent | BA Agent | Requirement documentation | SA4E-244 |

---

## 5. Risks and Assumptions

### 5.1 Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Workspace/project name data missing for some IDs | Medium | Medium | Fallback to ID display, log missing names |
| Name changes break consistency with existing references | Low | Low | Ensure ID remains as key, name is display only |
| Performance impact if name lookup requires extra queries | Low | Low | Cache name mapping |

### 5.2 Assumptions

- Workspace/project name is available in backend data store and accessible to admin UI.
- Project Scope dropdown data is fetched via existing API endpoint.
- No localization requirements for names at this stage.

---

## 6. Non-Functional Requirements

| Category | Requirement | Details |
|----------|-------------|---------|
| Performance | Dropdown load time | No specific non-functional requirements identified. To be confirmed with technical team. |
| Security | Access control | Existing admin authentication remains unchanged |
| Scalability | Number of scopes | Existing performance should be maintained |
| Availability | Uptime | No change to availability |

> No specific non-functional requirements identified. To be confirmed with technical team.

---

## 7. Related Tickets

| Ticket Key | Summary | Status | Type | Relationship |
|------------|---------|--------|------|--------------|
| SA4E-244 | Admin Project Scope dropdown shows IDs instead of workspace/project names | In Progress | Bug | Main ticket |
| | | | | |

---

## 8. Appendix

### Glossary

| Term | Definition |
|------|------------|
| Project Scope | Selector in admin sidebar to filter views by workspace/project |
| Workspace | Logical container for projects in admin UI |

### Reference Documents

| Document | Link / Location |
|----------|-----------------|
| Jira Ticket SA4E-244 | Jira |
| Admin UI | localhost:48721/admin |
