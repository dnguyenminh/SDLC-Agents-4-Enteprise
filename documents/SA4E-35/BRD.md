# Business Requirements Document (BRD)

## SA4E-35: Global Toast Notification Consistency

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-35 |
| Title | Global toast notification consistency across all admin pages |
| Author | BA Agent |
| Version | 1.0 |
| Date | 2026-07-15 |
| Status | Complete |

---

## 1. Introduction

### 1.1 Scope

Replace all inline notification message bars (positioned within page flow) with a fixed-position toast notification component that remains visible regardless of scroll position, across all admin portal pages.

### 1.2 Problem Statement

The admin portal uses inline msg notification bars rendered at the top of each page content area. When users scroll down and perform an action, the success/error message appears at the top — invisible to the user. This causes confusion: users think nothing happened.

### 1.3 Out of Scope

- Toast auto-dismiss timer (future enhancement)
- Toast stacking (multiple toasts)
- Animation/transitions

---

## 2. Business Requirements

### 2.1 User Stories

| # | Story | Priority |
|---|-------|----------|
| 1 | As an admin, I want to see action feedback immediately regardless of scroll position so that I know my action succeeded or failed | MUST HAVE |

### 2.2 Acceptance Criteria

1. GIVEN any admin page, WHEN an action produces a message, THEN a toast appears at fixed bottom-right of viewport
2. GIVEN a success message, WHEN toast renders, THEN it has green background and border
3. GIVEN an error message (starts with X or "Failed"), WHEN toast renders, THEN it has red background and border
4. GIVEN toast is visible, WHEN user clicks X button, THEN toast dismisses
5. GIVEN user scrolls, WHEN toast is visible, THEN toast remains fixed in position

---

## 3. Affected Pages

| Page | Component | Status |
|------|-----------|--------|
| KB Management | KBPage | Done |
| KB Tags | KBTagsPage | Done |
| Users | UsersPage | Done |
| Configuration | ConfigurationPage | Done |
| Profile | ProfilePage | Done |

---

## 4. Technical Solution

Replaced inline card div (within page flow, invisible on scroll) with CSS `position:fixed; bottom:20px; right:20px; z-index:9999` toast with shadow. Error detection via message prefix.

---

## 5. Implementation Summary

- 1 file changed: `backend/src/viewer/admin/index.html`
- 4 inline patterns replaced with fixed-position toast
- Build verified, merged to main, pushed to origin
- Commit: `SA4E-35: Global toast notification - replace all inline msg bars with fixed-position bottom-right toast`
