# UI Design Specification

## {PROJECT} — {TICKET}: {Title}

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | {TICKET} |
| Title | {Title} |
| Author | UI Agent |
| Version | 1.0 |
| Date | {DATE} |
| Status | Draft |
| Related FSD | FSD-v{N}-{TICKET}.docx |

---

## 1. Design System

### 1.1 Color Palette

| Token | Value | Usage |
|-------|-------|-------|
| --bg | #0d1117 | Page background |
| --surface | #161b22 | Cards, panels |
| --border | #30363d | Borders, dividers |
| --text | #c9d1d9 | Primary text |
| --muted | #8b949e | Secondary text |
| --accent | #58a6ff | Links, active states |
| --success | #3fb950 | Success indicators |
| --warning | #d29922 | Warning indicators |
| --error | #f85149 | Error indicators |

### 1.2 Typography

| Element | Font | Size | Weight |
|---------|------|------|--------|
| H1 | System font stack | 1.5rem | 600 |
| H2 | System font stack | 1.25rem | 600 |
| Body | System font stack | 0.875rem | 400 |
| Caption | System font stack | 0.75rem | 400 |

### 1.3 Spacing & Layout

| Token | Value | Usage |
|-------|-------|-------|
| --spacing-xs | 4px | Tight spacing |
| --spacing-sm | 8px | Element gaps |
| --spacing-md | 16px | Section padding |
| --spacing-lg | 24px | Card padding |
| --radius-sm | 4px | Small elements |
| --radius-md | 6px | Inputs, buttons |
| --radius-lg | 8px | Cards, panels |

---

## 2. Screen Inventory

| # | Screen Name | Route/URL | Wireframe | Priority |
|---|-------------|-----------|-----------|----------|
| 1 | {Screen 1} | {/path} | ![](diagrams/ui-{screen-1}.png) | MUST |
| 2 | {Screen 2} | {/path} | ![](diagrams/ui-{screen-2}.png) | MUST |

---

## 3. Screen Specifications

### 3.1 {Screen 1 Name}

**Route:** `{/path}`
**Access:** {Role requirements}
**Related FSD:** UC-{XX}

#### Wireframe

![{Screen 1 Name}](diagrams/ui-{screen-1}.png)

#### Layout Structure

```
┌─────────────────────────────────────────┐
│ Header / Navigation                      │
├─────────────────────────────────────────┤
│ ┌─────────┐ ┌─────────────────────────┐ │
│ │ Sidebar │ │ Main Content Area       │ │
│ │         │ │                         │ │
│ │         │ │                         │ │
│ └─────────┘ └─────────────────────────┘ │
└─────────────────────────────────────────┘
```

#### Component Hierarchy

```
Screen
├── Header
│   ├── Logo
│   └── UserMenu
├── Sidebar (if applicable)
│   └── NavItems
└── MainContent
    ├── PageTitle
    ├── ActionBar (filters, buttons)
    └── ContentArea (table, form, etc.)
```

#### Data Bindings

| Element | Data Source | API Endpoint | Update Trigger |
|---------|-------------|--------------|----------------|
| {element} | {field} | {GET /api/...} | {on load / on click} |

#### User Interactions

| # | Action | Trigger | Result | API Call |
|---|--------|---------|--------|----------|
| 1 | {action} | {click/input/...} | {visual change} | {endpoint} |

#### Validation Rules

| Field | Rule | Error Message |
|-------|------|---------------|
| {field} | {rule} | {message} |

---

### 3.2 {Screen 2 Name}

_(Repeat structure from 3.1 for each screen)_

---

## 4. User Flows

### 4.1 {Flow Name}

**Trigger:** {What starts this flow}
**Happy path:**

```
[Screen A] → action → [Screen B] → action → [Screen C]
```

**Error paths:**
- {condition} → {error screen/message}

#### Flow Diagram

![{Flow Name}](diagrams/ui-flow-{name}.png)

---

## 5. Reusable Components

| Component | Usage | Props/Config |
|-----------|-------|--------------|
| DataTable | List pages | columns, data, onSort, onFilter |
| Modal | Create/Edit forms | title, content, onSave, onCancel |
| Toast | Notifications | message, type (success/error/warning) |
| ConfirmDialog | Destructive actions | message, onConfirm, onCancel |

---

## 6. Responsive Behavior

| Breakpoint | Layout Change |
|------------|---------------|
| > 1200px | Full layout (sidebar + content) |
| 768-1200px | Collapsed sidebar |
| < 768px | Mobile: stacked layout, hamburger menu |

---

## 7. Accessibility (WCAG 2.1 AA)

| Requirement | Implementation |
|-------------|----------------|
| Color contrast | All text meets 4.5:1 ratio |
| Keyboard navigation | All interactive elements focusable via Tab |
| Screen reader | ARIA labels on icons, roles on regions |
| Focus indicators | Visible focus ring on all interactive elements |

---

## 8. Implementation Notes for DEV

### 8.1 Tech Stack
- HTML + Vanilla JS (no framework)
- Single-page static files served by Java HttpServer
- CSS custom properties for theming

### 8.2 File Structure
```
src/main/resources/static/
├── {page-name}.html
├── css/
│   └── admin.css
└── js/
    └── admin.js
```

### 8.3 API Integration Pattern
```javascript
async function fetchData(endpoint) {
    const response = await fetch(endpoint);
    if (!response.ok) throw new Error(response.statusText);
    return response.json();
}
```

---

## 9. Diagrams Checklist

| # | Diagram | File | Status |
|---|---------|------|--------|
| 1 | {Screen 1} wireframe | diagrams/ui-{screen-1}.drawio | ☐ |
| 2 | {Screen 2} wireframe | diagrams/ui-{screen-2}.drawio | ☐ |
| 3 | {Flow 1} diagram | diagrams/ui-flow-{name}.drawio | ☐ |
