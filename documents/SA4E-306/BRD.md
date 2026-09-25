# Business Requirements Document (BRD)

## SDLC Agents 4 Enterprise — SA4E-306: SA4E-289.10 - Pi Packages Config Page + Pre-install 7 Packages

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-306 |
| Title | SA4E-289.10 - Pi Packages Config Page + Pre-install 7 Packages |
| Author | BA Agent |
| Version | 1.0 |
| Date | 2026-09-24 |
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
| 1.0 | 2026-09-24 | BA Agent | Initiate document — auto-generated from Jira ticket SA4E-306 and linked tickets |

---

## Sign-Off

| Name | Signature and date |
|------|--------------------|
| | ☐ I agree and confirm all criteria on this BRD as expected requirements |
| | ☐ I agree and confirm all criteria on this BRD as expected requirements |

---

## 1. Introduction

### 1.1 Scope

Add a Packages config page as a Settings panel tab to allow users to install/enable/disable Pi packages, and pre-install 7 packages on initial setup: pi-mcp-adapter, pi-web-access, @juicesharp/rpiv-todo, @juicesharp/rpiv-ask-user-question, pi-lens, context-mode, pi-subagents. The page is part of SA4E-289 epic "Migrate LangGraph Workflow Engine to Pi SDK (Option C)".

### 1.2 Out of Scope

- Implementation details of Pi extension host runtime embedding vs pi-coding-agent harness selection. This is recorded separately in PI-PACKAGES-DECISION.md.
- Runtime model-resolution fixes are prerequisite and not covered in this BRD.
- Packaging/distribution of Pi extensions beyond enable/disable UI.

### 1.3 Preliminary Requirement

- Fix runtime model-resolution first.
- Adopt Pi extension host mandatory: all 7 packages are Pi EXTENSIONS requiring pi.on/pi.events/tool+slash registration in @earendil-works/pi-coding-agent. Bare Agent (pi-agent-core) cannot load them; MCP-only is not sufficient.
- Checklist reference: documents/SA4E-289/PI-PACKAGES-CONFIG-CHECKLIST.md (referenced in ticket).

---

## 2. Business Requirements

### 2.1 High Level Process Map

User opens Settings panel → navigates to Packages tab → views list of available Pi packages with enable/disable toggles → toggles packages → system persists configuration and reflects enabled state. On first run, system pre-installs 7 core packages.

### 2.2 List of User Stories / Use Cases

| # | Story / Use Case / Epic | Priority | Source Ticket |
|---|-------------------------|----------|---------------|
| 1 | As a user/admin, I want to configure Pi packages via Settings panel so that I can enable/disable extensions | MUST HAVE | SA4E-306 |
| 2 | As a system, I want to pre-install 7 core Pi packages on setup so that essential features are available out-of-box | MUST HAVE | SA4E-306 |

---

### 2.3 Details of User Stories

---

#### Business Flow

**Step 1:** System startup checks pre-install package list.
**Step 2:** If packages not installed, trigger pre-install of pi-mcp-adapter, pi-web-access, @juicesharp/rpiv-todo, @juicesharp/rpiv-ask-user-question, pi-lens, context-mode, pi-subagents.
**Step 3:** User opens Settings panel and selects Packages tab.
**Step 4:** System renders Packages config page with list of packages, current enabled state, version.
**Step 5:** User toggles enable/disable for a package.
**Step 6:** System persists selection and updates package runtime state.
**Step 7:** System shows success/error feedback.

> **Note:** All 7 packages require Pi extension host. Option A adoption is mandatory.

---

#### STORY 1: Pi Packages Configuration Page

> As a user/admin, I want to configure Pi packages via Settings panel so that I can enable/disable extensions

**Requirement Details:**

1. Provide Settings panel tab named "Packages" for Pi packages configuration.
2. Display list of Pi packages with install/enable/disable controls.
3. Persist user selections across sessions.

**Data Fields (if applicable):**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| packageId | String | Yes | Unique identifier of Pi package | pi-mcp-adapter |
| packageName | String | Yes | Display name | Pi MCP Adapter |
| version | String | No | Installed version | 1.0.0 |
| enabled | Boolean | Yes | Enable/disable state | true |
| status | String | No | Install status | installed/pending/error |

**Acceptance Criteria:**

1. Packages config page is accessible from Settings panel tab.
2. Page lists all Pi packages, including the 7 pre-install packages.
3. User can toggle enable/disable and change persists.
4. UI reflects current enabled state after reload.

**UI Specifications (if applicable):**

| No. | Name | Type | Required | Description | Note |
|-----|------|------|----------|-------------|------|
| 1 | Packages Tab | Tab | Yes | Settings panel tab | Named "Packages" |
| 2 | Package List | Table | Yes | List packages with columns | Name, Version, Enabled |
| 3 | Enable Toggle | Switch | Yes | Enable/disable package | Toggle control |
| 4 | Status Indicator | Label | No | Shows install status | installed/pending/error |

**Validation Rules (if applicable):**

- PackageId must be non-empty string.
- Enabled must be boolean.

**Error Handling (if applicable):**

- Package install failure: Show error toast with retry option.
- Extension host unavailable: Show warning "Pi extension host required".

---

#### STORY 2: Pre-install 7 Core Packages

> As a system, I want to pre-install 7 core Pi packages on setup so that essential features are available out-of-box

**Requirement Details:**

1. On first run or setup, automatically pre-install 7 packages: pi-mcp-adapter, pi-web-access, @juicesharp/rpiv-todo, @juicesharp/rpiv-ask-user-question, pi-lens, context-mode, pi-subagents.
2. Packages are Pi EXTENSIONS requiring Pi extension host.

**Acceptance Criteria:**

1. After initial setup, all 7 packages are installed.
2. Packages are enabled by default.
3. Installation status is logged for troubleshooting.

**UI Specifications:**

- Installation progress indicator shown in Packages tab during first run.

**Validation Rules:**

- Package names match registry identifiers exactly.

**Error Handling:**

- Install timeout: Retry up to 3 times, then mark as error.
- Missing extension host: Block install and show prerequisite message.

---

## 3. Dependencies

| Dependency | Type | Related Ticket | Description |
|------------|------|----------------|-------------|
| Pi extension host adoption | System | SA4E-289 | Mandatory to load Pi extensions; Option A required |
| Runtime model-resolution fix | System | SA4E-289 | Prerequisite before packages config |
| Pi SDK migration | System | SA4E-289 | Parent epic migration to Pi SDK |

---

## 4. Stakeholders

| Role | Name / Team | Responsibility | Source |
|------|-------------|----------------|--------|
| Reporter/Creator | Duc Nguyen Minh | Requirement owner | SA4E-306 |
| Epic Owner | Duc Nguyen Minh | Epic SA4E-289 oversight | SA4E-289 |
| BA Agent | BA Agent | BRD author | Internal |

---

## 5. Risks and Assumptions

### 5.1 Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Pi extension host adoption increases run path complexity | High | Medium | Record decision A1/A2 in PI-PACKAGES-DECISION.md, prototype early |
| Bare Agent cannot load extensions leading to runtime errors | High | High | Enforce extension host mandatory, validate in CI |
| Pre-install failures due to network/registry | Medium | Medium | Retry logic and error reporting UI |

### 5.2 Assumptions

- Pi extension host will be integrated via pi-coding-agent harness or embedded runtime.
- Packages are available in Pi registry with stable identifiers.
- Users have permission to enable/disable packages via Settings.

---

## 6. Non-Functional Requirements

| Category | Requirement | Details |
|----------|-------------|---------|
| Performance | Packages list loads within 2 seconds | For up to 50 packages |
| Security | Package enable/disable requires user authentication | Settings panel access control |
| Scalability | Config page supports future packages | No hard limit |
| Availability | Packages config UI available after extension host startup | Dependent on Pi SDK init |

> No specific non-functional requirements identified beyond above. To be confirmed with technical team.

---

## 7. Related Tickets

| Ticket Key | Summary | Status | Type | Relationship |
|------------|---------|--------|------|--------------|
| SA4E-306 | SA4E-289.10 - Pi Packages Config Page + Pre-install 7 Packages | In Progress | Story | Main ticket |
| SA4E-289 | Migrate LangGraph Workflow Engine to Pi SDK (Option C) | In Progress | Epic | Parent epic |

---

## 8. Appendix

Checklist reference: documents/SA4E-289/PI-PACKAGES-CONFIG-CHECKLIST.md
Decision record: PI-PACKAGES-DECISION.md for sub-decision A1 vs A2.

### Glossary

| Term | Definition |
|------|------------|
| Pi Extension | Pi package requiring extension host with pi.on/pi.events registration |
| Packages Config Page | Settings panel tab for managing Pi packages |

### Reference Documents

| Document | Link / Location |
|----------|-----------------|
| Pi Migration Plan | extension/docs/pi-migration-plan.md |
| BRD Template | documents/templates/BRD-TEMPLATE.md |
